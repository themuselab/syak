"""파트너(파일럿) 자동 새로고침 — GitHub Actions, Playwright.

DB에서 is_partner=true 로 켜면, 아직 sync 안 된 가게(partner_synced_at IS NULL)의
상세(사진·가격)를 네이버에서 재수집하고 partner_synced_at 을 찍는다.
→ 파트너 id만 추가하면 다음 회차에 데이터까지 자동 싱싱.

env: SUPABASE_URL, SUPABASE_SECRET_KEY  (Actions Secrets / 로컬은 같은 폴더 .env)
"""
import asyncio, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from playwright.async_api import async_playwright
from enrich_details import fetch_detail, extract_detail, fetch_reviews
from build_read_model import build_summary, build_detail

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ENV = dict(os.environ)
_local = Path(__file__).parent / ".env"
if _local.exists():
    for line in _local.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            ENV.setdefault(k.strip(), v.strip())
SB_URL = ENV["SUPABASE_URL"].rstrip("/")
SB_SECRET = ENV.get("SUPABASE_SECRET_KEY") or ENV.get("SUPABASE_SECRET")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
BOOKING_RE = re.compile(r"bizes/(\d+)/items/(\d+)")
# 대표가 노이즈 제외 (recompute_price 와 동일 규칙)
NOISE = re.compile(r"제거|오프|off|리무브|리페어|음료|추가|옵션|보강|보수|파라핀|영양제|연장보수|드릴|디자인추가|보호|글루|케어추가")


def rep_price(menus):
    cands = []
    for m in (menus or []):
        p = m.get("price")
        nm = m.get("name") or ""
        if not p or p < 5000 or p > 2000000:
            continue
        if NOISE.search(nm):
            continue
        cands.append(p)
    return min(cands) if cands else None


def tier(p):
    if p is None:
        return "미정"
    if p < 20000:
        return "1만원대"
    if p < 30000:
        return "2만원대"
    if p < 40000:
        return "3만원대"
    return "4만원이상"


def sb(method, path, body=None, prefer=None):
    headers = {"apikey": SB_SECRET, "Authorization": f"Bearer {SB_SECRET}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


async def fetch_photos(page, sid, scrolls=5):
    """사진탭 스크롤하며 이미지 url 수집."""
    try:
        await page.goto(f"https://pcmap.place.naver.com/place/{sid}/photo",
                        wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(2.3)
        for _ in range(scrolls):
            await page.mouse.wheel(0, 4000)
            await asyncio.sleep(0.9)
        apollo = await page.evaluate("() => window.__APOLLO_STATE__ || null")
    except Exception:
        return []
    urls = []
    for v in (apollo or {}).values():
        if isinstance(v, dict):
            for key in ("imageUrl", "url", "thumbnailUrl", "originUrl", "originalUrl"):
                u = v.get(key)
                if isinstance(u, str) and "pstatic.net" in u and u.startswith("http"):
                    uu = u.split("?")[0]
                    if uu not in urls:
                        urls.append(uu)
    return urls


async def sync_one(page, shop):
    sid = str(shop["id"])
    name = shop.get("name") or ""
    gu = shop.get("gu") or ""
    cat = shop.get("category") or "네일"
    apollo, err = await fetch_detail(page, sid)
    if apollo is None:
        print(f"  ❌ {name}: 상세 로드 실패 {err}", flush=True)
        return False
    det = extract_detail(apollo, sid)
    blob = json.dumps(apollo, ensure_ascii=False)
    bm = re.search(r"booking/(\d+)/bizes/(\d+)/items/(\d+)", blob)
    booking_ids = (bm.group(1), bm.group(2), bm.group(3)) if bm else None
    await asyncio.sleep(1.2)
    reviews = await fetch_reviews(page, sid, 15)
    gallery = await fetch_photos(page, sid)

    review_photos = []
    for rv in (reviews or []):
        review_photos += (rv.get("images") or [])
    det["images"] = {
        "representative": det.get("repImage") or (gallery[0] if gallery else None),
        "gallery": (gallery or [])[:12],
        "menu": det.get("menuImages") or [],
        "review": review_photos[:30],
    }
    det["visitorReviews"] = reviews
    if booking_ids and not det.get("bookingItems"):
        bt, biz, item = booking_ids
        det["bookingItems"] = [{"name": "예약",
                                "bookingUrl": f"https://m.booking.naver.com/booking/{bt}/bizes/{biz}/items/{item}",
                                "isOrderAvailable": True}]
        det["reservable"] = True

    rec = {"id": sid, "name": det.get("name_detail") or name, "categories": [cat], "gus": [gu],
           "x": det.get("x"), "y": det.get("y"), "imageUrl": det.get("repImage"),
           "hasBooking": bool(det.get("bookingItems")), "visitorReviewCount": det.get("visitorReviewsTotal"),
           **det, "_enriched": True}
    mp = rep_price(rec.get("menus"))
    summary = build_summary(rec, mp)
    detail = build_detail(rec, summary)
    if summary["coord"]["lat"] is None or summary["coord"]["lng"] is None:
        print(f"  ❌ {name}: 좌표 없음", flush=True)
        return False
    biz_id = item_id = None
    for bk in (rec.get("bookingItems") or []):
        m = BOOKING_RE.search(bk.get("bookingUrl") or "")
        if m:
            biz_id, item_id = m.group(1), m.group(2)
            break
    row = {"id": summary["id"], "name": summary["name"], "category": summary["category"],
           "categories": summary["categories"], "gu": summary["gu"],
           "lat": summary["coord"]["lat"], "lng": summary["coord"]["lng"],
           "representative_image": summary["representativeImage"], "review_count": summary["reviewCount"],
           "price_tier": tier(mp), "min_price": mp, "first_visit_deal": summary["firstVisitDeal"],
           "has_event": summary["hasEvent"], "reservable": summary["reservable"],
           "biz_id": biz_id, "item_id": item_id, "detail": detail,
           "is_partner": True, "partner_synced_at": datetime.now(timezone.utc).isoformat()}
    sb("POST", "shops", body=[row], prefer="resolution=merge-duplicates,return=minimal")
    print(f"  ✅ {summary['name']}: 메뉴 {det.get('menu_count', 0)} · 사진 {len(gallery)+len(review_photos)}장 · 대표가 {mp}", flush=True)
    return True


async def main():
    partners = json.loads(sb("GET", "shops?is_partner=eq.true&partner_synced_at=is.null&select=id,name,gu,category&limit=50"))
    if not partners:
        print("🤝 새로 동기화할 파트너 없음 (모두 최신)")
        return
    print(f"🤝 파트너 동기화 대상: {len(partners)}곳", flush=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(user_agent=UA, locale="ko-KR", timezone_id="Asia/Seoul",
                                  viewport={"width": 1366, "height": 850})
        page = await ctx.new_page()
        ok = 0
        for shop in partners:
            try:
                if await sync_one(page, shop):
                    ok += 1
            except Exception as ex:
                print(f"  ⚠️ {shop.get('name')}: {ex}", flush=True)
        await b.close()
    print(f"✅ 완료: {ok}/{len(partners)}곳 갱신")


if __name__ == "__main__":
    asyncio.run(main())
