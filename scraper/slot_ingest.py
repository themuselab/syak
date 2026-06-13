"""샥 슬롯 수집 (GitHub Actions용, 자급자족).

- 대상은 Supabase shops 테이블에서 읽음 (biz_id 있는 가게 = 네이버 온라인 예약)
- 네이버 hourlySchedule API로 향후 7일 빈자리 조회 (브라우저 X, stdlib만)
- Supabase slots 테이블에 갱신 (해당 날짜창 비우고 INSERT)

env: SUPABASE_URL, SUPABASE_SECRET_KEY  (GitHub Actions Secrets에서 주입)
로컬 실행 시엔 같은 폴더의 .env 도 읽음.
"""
import json, os, re, sys, time, urllib.request, urllib.error, zlib
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DAYS = 3  # 오늘부터 3일치 (앱은 주로 '내일'만 봄 → 7일은 과함, DB 절약)

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

# 샤딩 — 분할 실행(각 러너 다른 IP/시간, 25분 차단선 안 넘게). 미설정 시 단일.
SHARD = int(ENV.get("SHARD", "0"))
NUM_SHARDS = int(ENV.get("NUM_SHARDS", "1"))
# 시간 예산(초) — 이만큼 지나면 수집 멈추고 받은 것만 저장 → 타임아웃으로 죽지 않음
BUDGET_SEC = int(ENV.get("BUDGET_SEC", "840"))  # 14분 (Actions timeout 18분보다 짧게)

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
        st, hdr, body = sb("GET", "shops?biz_id=not.is.null&select=id,biz_id,item_id,biz_type,item_ids,items&order=id",
                           prefer="count=exact", extra_headers={"Range": f"{frm}-{frm+999}"})
        rows = json.loads(body)
        out.extend(rows)
        total = int((hdr.get("content-range") or "/0").split("/")[1] or 0)
        frm += 1000
        if frm >= total or not rows:
            break
    if NUM_SHARDS > 1:  # 이 러너 담당 샤드만 (안정적 해시 분할)
        out = [r for r in out if zlib.crc32(str(r["id"]).encode()) % NUM_SHARDS == SHARD]
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


def clean_item_name(name):
    """item 이름 정리 — '[지점]' 류 접두 제거 + 길이 컷."""
    n = (name or "").strip()
    n = re.sub(r"^\[[^\]]*\]\s*", "", n)        # 앞 [..] 제거
    n = re.sub(r"\s*-\s*.*?(원|이벤트).*$", "", n)  # ' - 29,000원' 류 꼬리 제거
    n = n.strip(" ·-")
    return (n[:14] or "예약")


def main():
    # KST 기준 오늘 (Actions는 UTC라 +9)
    kst = timezone(timedelta(hours=9))
    today = datetime.now(kst).date()
    start_ymd = today.strftime("%Y-%m-%d")
    tomorrow_ymd = (today + timedelta(days=1)).strftime("%Y-%m-%d")
    end_ymd = (today + timedelta(days=DAYS - 1)).strftime("%Y-%m-%d")

    targets = load_targets()
    tasks = expand_tasks(targets)
    # shop_id → {item_id: 이름} (상세 표시용)
    name_map = {t["id"]: {str(it.get("id")): it.get("name") for it in (t.get("items") or [])} for t in targets}
    print(f"📡 슬롯 수집: {len(targets)}곳 / item(디자이너·서비스) {len(tasks)}건, {start_ymd} ~ {end_ymd}")

    # (shop_id, date, time) 기준 합집합 — 한 디자이너라도 비면 그 시간 예약가능
    seen = {}
    item_tmrw = {}  # (shop_id, item_id) → 내일 빈 시간 set {"14:00", ...}
    ok = err = 0
    err_shops = set()  # 한 item이라도 실패한 샵 → 슬롯 손대지 않음(옛 데이터 보존)
    shop_total = Counter(t["id"] for t in tasks)  # 샵별 총 item 작업 수
    shop_done = Counter()                          # 샵별 성공한 작업 수
    t0 = time.time()
    deadline = t0 + BUDGET_SEC                      # 예산 초과 시 멈추고 받은 것만 저장
    timed_out = False
    ex = ThreadPoolExecutor(max_workers=16)
    futs = {ex.submit(fetch_slots, t["biz_type"], t["biz_id"], t["item_id"], start_ymd, end_ymd): t for t in tasks}
    for fut in as_completed(futs):
        if time.time() > deadline:
            timed_out = True
            break
        t = futs[fut]
        try:
            for d, tm in fut.result():
                key = (t["id"], d, tm)
                if key not in seen:  # 합집합 dedupe
                    seen[key] = {"shop_id": t["id"], "biz_id": t["biz_id"], "item_id": t["item_id"],
                                 "slot_date": d, "start_time": tm}
                if d == tomorrow_ymd:
                    ik = (t["id"], t["item_id"])
                    item_tmrw.setdefault(ik, set()).add(tm[:5])  # "14:00:00" → "14:00"
            ok += 1
            shop_done[t["id"]] += 1
        except Exception:
            err += 1
            err_shops.add(t["id"])
    ex.shutdown(wait=False, cancel_futures=True)  # 남은 작업 취소(대기 없음) → 예산 내 종료
    # 모든 item이 성공한 샵만 갱신. 미완(예산초과)·실패 샵은 옛 슬롯 보존 → 빈자리 증발 방지.
    safe_ids = [sid for sid in shop_total if shop_done[sid] == shop_total[sid] and sid not in err_shops]
    safe_set = set(safe_ids)
    rows = [v for v in seen.values() if v["shop_id"] in safe_set]
    print(f"   조회: 성공 {ok} 실패 {err}{' ⏱️예산초과(부분저장)' if timed_out else ''} | 갱신 {len(safe_ids)}곳 | 빈슬롯 {len(rows)}행 | {time.time()-t0:.0f}초")

    # 슬롯 삭제 (무료티어 statement timeout 회피: 날짜별 + 시간버킷 + 재시도)
    def sb_del(path, tries=4):
        for i in range(tries):
            try:
                sb("DELETE", path, prefer="return=minimal"); return True
            except Exception:
                time.sleep(2 * (i + 1))
        return False

    # 성공 샵의 수집창 슬롯만 삭제 (shop_id 청크 + 날짜창) → 부분 차단돼도 다른 샵 데이터 안 건드림
    for i in range(0, len(safe_ids), 120):
        chunk = ",".join(str(x) for x in safe_ids[i:i+120])
        sb_del(f"slots?slot_date=gte.{start_ymd}&slot_date=lte.{end_ymd}&shop_id=in.({chunk})")
    if SHARD == 0:
        sb_del(f"slots?slot_date=lt.{start_ymd}")  # 과거 정리 (전역, 작음 — 샤드0만)
    inserted = 0
    for i in range(0, len(rows), 500):
        sb("POST", "slots", body=rows[i:i+500], prefer="return=minimal,resolution=merge-duplicates")
        inserted += len(rows[i:i+500])
    print(f"✅ Supabase 저장: {inserted}행 ({start_ymd}~{end_ymd})")

    # 상세용 item별 "내일" 빈 시간 요약 → shops.slot_summary 벌크 업서트
    # 같은 이름(디자이너/메뉴)끼리 시간 합치고, 자리 많은 순 top6 · item당 시간 top12
    summary = {}  # shop_id → {name: set(times)}
    for (sid, iid), times in item_tmrw.items():
        nm = clean_item_name(name_map.get(sid, {}).get(iid) or "예약")
        summary.setdefault(sid, {}).setdefault(nm, set()).update(times)
    sum_rows = []
    for tg in targets:  # 성공 샵만 갱신(자리 없으면 [] 초기화). 실패 샵은 요약도 보존.
        sid = tg["id"]
        if sid not in safe_set:
            continue
        by_name = summary.get(sid, {})
        items = sorted(({"name": n, "times": sorted(ts)[:12]} for n, ts in by_name.items()),
                       key=lambda x: -len(x["times"]))[:6]
        sum_rows.append({"id": sid, "slot_summary": items})
    up = 0
    for i in range(0, len(sum_rows), 500):
        sb("POST", "shops", body=sum_rows[i:i+500], prefer="return=minimal,resolution=merge-duplicates")
        up += len(sum_rows[i:i+500])
    print(f"✅ slot_summary 갱신: {up}곳")


if __name__ == "__main__":
    main()
