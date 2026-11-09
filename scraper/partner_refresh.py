"""Current partners only. Bounded pages, per-shop replacement; no snapshot files.

fast: slots each run, events when due. details: reviews/photos/menus every six hours.
Missing/invalid upstream data is a failure, never an empty authoritative result.
"""
import asyncio
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

from slot_ingest import api_get, api_post, notify_new_slots, QUERY, GQL

KST = timezone(timedelta(hours=9))
BUDGET = int(os.environ.get("PARTNER_BUDGET_SEC", "210"))


class HourlyScheduleUnavailable(ValueError):
    """The item exists, but does not publish an hourly calendar."""


def report(message, warning=False):
    print(("::warning::" if warning else "") + message, flush=True)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write("- " + message + "\n")


async def fetch_partner_detail(page, shop_id, deadline):
    """Wait for hydrated detail, retry one incomplete navigation within budget."""
    from enrich_details import extract_detail
    for attempt in range(2):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Detail budget exhausted")
        try:
            await page.goto(f"https://pcmap.place.naver.com/place/{shop_id}/home",
                            wait_until="domcontentloaded", timeout=min(25000, int(remaining * 1000)))
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Detail budget exhausted")
            await page.wait_for_function("""() => {
                const state = window.__APOLLO_STATE__;
                const root = state?.ROOT_QUERY;
                if (!root) return false;
                const resolve = v => v?.__ref ? state[v.__ref] : v;
                return Object.entries(root).some(([key, value]) =>
                    key.startsWith('placeDetail') && resolve(resolve(value)?.base)?.name);
            }""", timeout=min(12000, int(remaining * 1000)))
            apollo = await page.evaluate("() => window.__APOLLO_STATE__ || null")
            detail = extract_detail(apollo or {}, shop_id)
            if not detail.get("name_detail"):
                raise ValueError("Incomplete place detail")
            return apollo, detail
        except Exception:
            if attempt or time.monotonic() + 2 >= deadline:
                raise
            report(f"Retrying incomplete detail: {shop_id}")
            await asyncio.sleep(2)


def stamp():
    return datetime.now(timezone.utc).isoformat()


def pages(kind):
    after = ""
    while True:
        from urllib.parse import urlencode
        result = api_get("/internal/shops/partner-targets?" + urlencode({"kind": kind, "after": after}))
        yield result.get("targets", [])
        cursor = result.get("next")
        if not cursor or cursor <= after:
            break
        after = cursor


def apply(shop, kind, observed_at, data):
    return api_post("/internal/shops/partner-refresh", {
        "id": str(shop["id"]), "kind": kind, "observedAt": observed_at, "data": data,
    })


def decode_slots(raw):
    if raw.get("errors"):
        raise ValueError("Schedule returned errors")
    item_schedule = (((raw.get("data") or {}).get("schedule") or {}).get("bizItemSchedule") or {})
    if isinstance(item_schedule, dict) and "hourly" in item_schedule and item_schedule["hourly"] is None:
        raise HourlyScheduleUnavailable("Hourly calendar not provided; previous slots preserved")
    hourly = item_schedule.get("hourly")
    if not isinstance(hourly, list):
        raise ValueError("Schedule missing; preserving previous slots")
    result = []
    for row in hourly:
        if not isinstance(row, dict) or not isinstance(row.get("isUnitBusinessDay"), bool) or not isinstance(row.get("isUnitSaleDay"), bool):
            raise ValueError("Invalid schedule row")
        if not row["isUnitBusinessDay"] or not row["isUnitSaleDay"]:
            continue
        value = row.get("unitStartTime", "")
        if not re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", value):
            raise ValueError("Invalid schedule time")
        stock = row.get("stock")
        if stock is not None and (row.get("bookingCount") or 0) >= stock:
            continue
        result.append((value[:10], value[11:16]))
    return result


def slots_for(shop, start, end, deadline=None):
    items = list(dict.fromkeys(shop.get("item_ids") or ([shop["item_id"]] if shop.get("item_id") else [])))
    if not shop.get("biz_id") or not items:
        return None
    all_slots, tomorrow = set(), {}
    names = {str(i.get("id")): i.get("name") or "예약" for i in shop.get("items") or []}
    next_date = (datetime.now(KST).date() + timedelta(days=1)).isoformat()
    for item in items:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError("Incomplete shop; preserving previous snapshot")
        payload = {"operationName": "hourlySchedule", "query": QUERY, "variables": {"scheduleParams": {
            "businessTypeId": int(shop.get("biz_type") or 13), "businessId": shop["biz_id"], "bizItemId": str(item),
            "startDateTime": start + "T00:00:00", "endDateTime": end + "T23:59:59",
            "fixedTime": True, "includesHolidaySchedules": True,
        }}}
        req = urllib.request.Request(GQL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as response:
            rows = decode_slots(json.load(response))
        all_slots.update(rows)
        tomorrow.setdefault(names.get(str(item), "예약"), set()).update(t for d, t in rows if d == next_date)
        time.sleep(0.4)
    summary = [{"name": name[:40], "times": sorted(times)[:12]} for name, times in sorted(tomorrow.items(), key=lambda p: -len(p[1]))][:6]
    return {"startDate": start, "endDate": end, "slots": [{"date": d, "startTime": t} for d, t in sorted(all_slots)], "summary": summary}


def event_for(shop):
    from enrich_events import parse_event, UA
    item = (shop.get("item_ids") or [shop.get("item_id")])[0]
    if not shop.get("biz_id") or not item:
        return None
    url = f"https://m.booking.naver.com/booking/{shop.get('biz_type') or 13}/bizes/{shop['biz_id']}/items/{item}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as response:
        html = response.read().decode("utf-8")
    match = re.search(r'"eventDescJson":\s*(\[.*?\])', html)
    if not match or not isinstance(json.loads(match.group(1)), list):
        raise ValueError("Invalid event page; preserving previous event")
    desc, price = parse_event(html)
    return {"event_desc": desc, "event_price": price}


def fast():
    deadline = time.monotonic() + BUDGET
    errors, updated, unavailable = 0, 0, 0
    # Each kind fetches its own live membership list. A page holds at most 50 shops.
    for kind, collect in [("events", event_for), ("slots", slots_for)]:
        for batch in pages(kind):
            for shop in batch:
                if time.monotonic() >= deadline:
                    report(f"Budget reached: updated={updated}, unavailable={unavailable}, errors={errors}", warning=True)
                    return errors
                if not shop.get("due"):
                    continue
                observed = stamp()
                try:
                    today = datetime.now(KST).date()
                    data = collect(shop, today.isoformat(), (today + timedelta(days=2)).isoformat(), deadline) if kind == "slots" else collect(shop)
                    if data is None:
                        continue
                    result = apply(shop, kind, observed, data)
                    updated += bool(result.get("applied"))
                    # Retain existing notification filtering, only after commit.
                    if kind == "slots" and result.get("applied"):
                        new = result.get("newSlots") or []
                        grouped = {}
                        for s in new:
                            grouped.setdefault(s["date"], []).append(s["startTime"])
                        times = [(d, t) for d, ts in grouped.items() if len(ts) <= 8 for t in ts]
                        if times:
                            try:
                                notify_new_slots({str(shop["id"]): times})
                            except Exception:
                                print(f"Notification failed for {shop['id']}; data committed", flush=True)
                except HourlyScheduleUnavailable:
                    unavailable += 1
                    report(f"Hourly calendar unavailable: shop={shop['id']}; no slot write or notification", warning=True)
                except Exception as exc:
                    errors += 1
                    reason = str(exc)[:120] if isinstance(exc, ValueError) else str(getattr(exc, 'code', ''))
                    report(f"Preserved {shop['id']} {kind}: {type(exc).__name__} {reason}", warning=True)
                time.sleep(0.5)
    report(f"Partner refresh: updated={updated}, unavailable={unavailable}, errors={errors}")
    return errors


async def details():
    from playwright.async_api import async_playwright
    from enrich_details import fetch_reviews
    from sync_partners import fetch_photos, rep_price, tier, UA
    from build_read_model import build_summary, build_detail
    errors = 0
    deadline = time.monotonic() + BUDGET
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            for batch in pages("details"):
                for shop in batch:
                    if time.monotonic() >= deadline:
                        return errors
                    if not shop.get("due"):
                        continue
                    observed = stamp()
                    # Close each context to release Apollo state, images and page resources.
                    context = await browser.new_context(user_agent=UA, locale="ko-KR")
                    try:
                        page = await context.new_page()
                        apollo, detail = await fetch_partner_detail(page, shop["id"], deadline)
                        reviews = await fetch_reviews(page, shop["id"], 15)
                        review_valid = await page.evaluate("() => Object.keys(window.__APOLLO_STATE__?.ROOT_QUERY || {}).some(k => /visitorReviews/i.test(k)) || Object.values(window.__APOLLO_STATE__ || {}).some(v => v?.__typename === 'VisitorReview')")
                        if not review_valid:
                            reviews = None
                        photos = await fetch_photos(page, shop["id"], scrolls=2)
                        record = {"id": str(shop["id"]), "name": shop["name"], "categories": shop.get("categories") or [shop.get("category")], "gus": [shop.get("gu")], **detail}
                        record["visitorReviews"] = reviews or []
                        record["images"] = {"representative": detail.get("repImage"), "gallery": photos or [], "menu": detail.get("menuImages") or [], "review": [u for r in reviews or [] for u in r.get("images") or []][:30]}
                        price = rep_price(record.get("menus"))
                        model = build_detail(record, build_summary(record, price))
                        patch = {k: v for k, v in model.items() if k in {"roadAddress", "hoursText", "conveniences", "instagram", "phone", "menus", "images", "reviews", "reviewTotal", "blogReviewTotal", "reservationRoutes"} and v is not None}
                        if not patch["images"].get("representative"):
                            patch["images"].pop("representative", None)
                        if reviews is None:
                            patch.pop("reviews", None)
                            patch["images"].pop("review", None)
                        # Empty/error photo extraction is ambiguous; preserve previous gallery.
                        if not photos:
                            patch["images"].pop("gallery", None)
                        if detail.get("menus") is None:
                            patch.pop("menus", None)
                        if detail.get("menuImages") is None:
                            patch["images"].pop("menu", None)
                        if detail.get("visitorReviewsTotal") is None:
                            patch.pop("reviewTotal", None)
                        if detail.get("cafeBlogReviewsTotal") is None:
                            patch.pop("blogReviewTotal", None)
                        blob = json.dumps(apollo)
                        booking = re.search(r"booking/(\d+)/bizes/(\d+)/items/(\d+)", blob)
                        payload = {"detail": patch, "name": detail.get("name_detail"), "representative_image": detail.get("repImage"), "review_count": detail.get("visitorReviewsTotal"), "min_price": price, "price_tier": tier(price) if price is not None else None}
                        if booking:
                            payload.update(biz_type=int(booking[1]), biz_id=booking[2], item_id=booking[3])
                        booking_items = []
                        for entry in detail.get("bookingItems") or []:
                            match = re.search(r"booking/(\d+)/bizes/(\d+)/items/(\d+)", entry.get("bookingUrl") or "")
                            if match and (not booking or match[2] == booking[2]):
                                booking_items.append({"id": match[3], "name": entry.get("name") or "예약"})
                        if booking_items:
                            payload["items"] = booking_items
                            payload["item_ids"] = list(dict.fromkeys(i["id"] for i in booking_items))
                        result = apply(shop, "details", observed, payload)
                        del apollo, blob, model, record
                        print(f"Details {'refreshed' if result.get('applied') else 'skipped'}: {shop['id']}", flush=True)
                    except Exception as exc:
                        errors += 1
                        reason = str(exc)[:120] if isinstance(exc, ValueError) else ""
                        report(f"Details preserved: {shop['id']} {type(exc).__name__} {reason}", warning=True)
                    finally:
                        await context.close()
        finally:
            await browser.close()
    return errors


if __name__ == "__main__":
    errors = asyncio.run(details()) if "details" in sys.argv else fast()
    sys.exit(1 if errors else 0)
