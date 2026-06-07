"""샥 슬롯 수집 (GitHub Actions용, 자급자족).

- 대상은 Supabase shops 테이블에서 읽음 (biz_id 있는 가게 = 네이버 온라인 예약)
- 네이버 hourlySchedule API로 향후 7일 빈자리 조회 (브라우저 X, stdlib만)
- Supabase slots 테이블에 갱신 (해당 날짜창 비우고 INSERT)

env: SUPABASE_URL, SUPABASE_SECRET_KEY  (GitHub Actions Secrets에서 주입)
로컬 실행 시엔 같은 폴더의 .env 도 읽음.
"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DAYS = 7  # 오늘부터 7일치

# env (Actions의 os.environ 우선, 없으면 로컬 .env)
ENV = dict(os.environ)
_local = Path(__file__).parent / ".env"
if _local.exists():
    for line in _local.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            ENV.setdefault(k.strip(), v.strip())
SB_URL = ENV["SUPABASE_URL"].rstrip("/")
SB_SECRET = ENV["SUPABASE_SECRET_KEY"]

GQL = "https://m.booking.naver.com/graphql?opName=hourlySchedule"
QUERY = ("query hourlySchedule($scheduleParams: ScheduleParams){schedule(input:$scheduleParams)"
         "{bizItemSchedule{hourly{unitStartTime bookingCount stock isUnitBusinessDay isUnitSaleDay}}}}")


def sb(method, path, body=None, prefer=None, extra_headers=None):
    headers = {"apikey": SB_SECRET, "Authorization": f"Bearer {SB_SECRET}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.headers, r.read()


def load_targets():
    """biz_id 있는 가게 = 온라인 예약 가능. 페이지네이션.
    item_ids(전 디자이너/서비스) × biz_type 포함."""
    out, frm = [], 0
    while True:
        st, hdr, body = sb("GET", "shops?biz_id=not.is.null&select=id,biz_id,item_id,biz_type,item_ids&order=id",
                           prefer="count=exact", extra_headers={"Range": f"{frm}-{frm+999}"})
        rows = json.loads(body)
        out.extend(rows)
        total = int((hdr.get("content-range") or "/0").split("/")[1] or 0)
        frm += 1000
        if frm >= total or not rows:
            break
    return out


def expand_tasks(targets):
    """샵 → (shop_id, biz_type, biz_id, item_id) 작업으로 펼침.
    item_ids(전 디자이너) 있으면 전부, 없으면 단일 item_id 폴백."""
    tasks = []
    for t in targets:
        bt = t.get("biz_type") or 13
        items = t.get("item_ids") or ([t["item_id"]] if t.get("item_id") else [])
        for it in items:
            if it:
                tasks.append({"id": t["id"], "biz_type": bt, "biz_id": t["biz_id"], "item_id": str(it)})
    return tasks


def fetch_slots(biz_type, biz_id, item_id, start_ymd, end_ymd, tries=3):
    pl = {"operationName": "hourlySchedule", "variables": {"scheduleParams": {
        "businessTypeId": int(biz_type), "businessId": biz_id, "bizItemId": item_id,
        "startDateTime": f"{start_ymd}T00:00:00", "endDateTime": f"{end_ymd}T23:59:59",
        "fixedTime": True, "includesHolidaySchedules": True}}, "query": QUERY}
    raw = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(GQL, data=json.dumps(pl).encode(), method="POST",
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = json.loads(r.read())
            break
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(0.5 * (attempt + 1))
    sch = (raw.get("data") or {}).get("schedule")
    if not sch:
        return []
    hourly = (sch.get("bizItemSchedule") or {}).get("hourly") or []
    rows = []
    for h in hourly:
        if not (h.get("isUnitBusinessDay") and h.get("isUnitSaleDay")):
            continue
        stock = h.get("stock")
        if stock is not None and (h.get("bookingCount") or 0) >= stock:
            continue
        dt = h["unitStartTime"]  # "2026-06-07 14:00:00"
        rows.append((dt[:10], dt[11:19]))
    return rows


def main():
    # KST 기준 오늘 (Actions는 UTC라 +9)
    kst = timezone(timedelta(hours=9))
    today = datetime.now(kst).date()
    start_ymd = today.strftime("%Y-%m-%d")
    end_ymd = (today + timedelta(days=DAYS - 1)).strftime("%Y-%m-%d")

    targets = load_targets()
    tasks = expand_tasks(targets)
    print(f"📡 슬롯 수집: {len(targets)}곳 / item(디자이너·서비스) {len(tasks)}건, {start_ymd} ~ {end_ymd}")

    # (shop_id, date, time) 기준 합집합 — 한 디자이너라도 비면 그 시간 예약가능
    seen = {}
    ok = err = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=16) as ex:
        futs = {ex.submit(fetch_slots, t["biz_type"], t["biz_id"], t["item_id"], start_ymd, end_ymd): t for t in tasks}
        for fut in as_completed(futs):
            t = futs[fut]
            try:
                for d, tm in fut.result():
                    key = (t["id"], d, tm)
                    if key not in seen:  # 합집합 dedupe (DB PK도 동일하게 합치지만 전송량 절약)
                        seen[key] = {"shop_id": t["id"], "biz_id": t["biz_id"], "item_id": t["item_id"],
                                     "slot_date": d, "start_time": tm}
                ok += 1
            except Exception:
                err += 1
    rows = list(seen.values())
    print(f"   조회: 성공 {ok} 실패 {err} | 빈 슬롯 {len(rows)}행 | {time.time()-t0:.1f}초")

    # 날짜창 비우고 새로 INSERT
    sb("DELETE", f"slots?slot_date=gte.{start_ymd}", prefer="return=minimal")
    inserted = 0
    for i in range(0, len(rows), 500):
        sb("POST", "slots", body=rows[i:i+500], prefer="return=minimal,resolution=merge-duplicates")
        inserted += len(rows[i:i+500])
    print(f"✅ Supabase 저장: {inserted}행 ({start_ymd}~{end_ymd})")


if __name__ == "__main__":
    main()
