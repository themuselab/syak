"""샥 슬롯 수집 (GitHub Actions용, 자급자족).

- 대상은 Supabase shops 테이블에서 읽음 (biz_id 있는 가게 = 네이버 온라인 예약)
- 네이버 hourlySchedule API로 향후 7일 빈자리 조회 (브라우저 X, stdlib만)
- Supabase slots 테이블에 갱신 (해당 날짜창 비우고 INSERT)

env: SUPABASE_URL, SUPABASE_SECRET_KEY  (GitHub Actions Secrets에서 주입)
     API_BASE_URL, INTERNAL_API_KEY     (빈자리 알림 dispatch용 — 없으면 알림만 skip)
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
BUDGET_SEC = int(ENV.get("BUDGET_SEC", "780"))  # 13분 스크랩 후 저장 (job timeout 24분, 네이버 노출은 13분)

GQL = "https://m.booking.naver.com/graphql?opName=hourlySchedule"
QUERY = ("query hourlySchedule($scheduleParams: ScheduleParams){schedule(input:$scheduleParams)"
         "{bizItemSchedule{hourly{unitStartTime bookingCount stock isUnitBusinessDay isUnitSaleDay}}}}")


def sb(method, path, body=None, prefer=None, extra_headers=None, tries=4):
    headers = {"apikey": SB_SECRET, "Authorization": f"Bearer {SB_SECRET}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    # 일시적 5xx(무료티어 콜드스타트)·네트워크 오류는 재시도. 4xx(쿼리 문제)는 즉시 raise.
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", data=data, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise
            last = e
        except Exception as e:
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise last


def slot_sync(payload):
    """슬롯을 백엔드 internal API(POST /internal/slots/sync)로 RDS에 동기화.
    백엔드가 날짜창 교체 + 오늘 신규 슬롯 판정까지 처리. 반환 {inserted, newCount, newSlots}."""
    base = (ENV.get("API_BASE_URL") or "").rstrip("/")
    key = ENV.get("INTERNAL_API_KEY") or ""
    if not base or not key:
        raise RuntimeError("API_BASE_URL/INTERNAL_API_KEY 미설정 — 슬롯 동기화 불가")
    url = f"{base}/internal/slots/sync"
    data = json.dumps(payload).encode()
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, method="POST",
                headers={"Content-Type": "application/json", "X-Internal-Key": key})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise
            last = e
        except Exception as e:
            last = e
        time.sleep(2 * (attempt + 1))
    raise last


def notify_new_slots(new_by_shop, slot_date):
    """새로 생긴 '오늘' 빈자리를 백엔드 알림 엔드포인트로 밀어준다.

    백엔드(syak_BE)의 POST /notifications/internal/dispatch 가
    즐겨찾기·주변 대상을 찾아 FCM 푸시 + 알림 저장을 한다.
    - 실패해도 슬롯 수집엔 영향 없게 best-effort.
    - API_BASE_URL / INTERNAL_API_KEY 없으면 조용히 skip (로컬 실행 등).
    """
    base = (ENV.get("API_BASE_URL") or "").rstrip("/")
    key = ENV.get("INTERNAL_API_KEY") or ""
    if not base or not key:
        print("   ℹ️ 알림 skip (API_BASE_URL/INTERNAL_API_KEY 미설정)")
        return
    if not new_by_shop:
        return

    # 알림엔 shopName/lat/lng 가 필요 → 대상 샵 메타 조회
    sids = list(new_by_shop.keys())
    meta = {}
    for i in range(0, len(sids), 200):
        chunk = ",".join(str(x) for x in sids[i:i+200])
        try:
            _, _, b = sb("GET", f"shops?id=in.({chunk})&select=id,name,lat,lng")
            for r in json.loads(b):
                meta[r["id"]] = r
        except Exception:
            pass

    events = []
    for sid, times in new_by_shop.items():
        m = meta.get(sid)
        if not m:
            continue
        for tm in times:
            events.append({"shopId": str(sid), "shopName": m.get("name") or "샵",
                           "shopLat": m.get("lat"), "shopLng": m.get("lng"),
                           "slotDate": slot_date, "slotTime": tm})
    if not events:
        return

    url = f"{base}/notifications/internal/dispatch"
    sent = 0
    for i in range(0, len(events), 200):
        body = json.dumps({"events": events[i:i+200]}).encode()
        try:
            req = urllib.request.Request(url, data=body, method="POST",
                headers={"Content-Type": "application/json", "X-Internal-Key": key})
            with urllib.request.urlopen(req, timeout=30) as r:
                r.read()
            sent += len(events[i:i+200])
        except Exception as e:
            print(f"   ⚠️ 알림 dispatch 실패: {e}")
    print(f"🔔 새 빈자리 알림: {len(new_by_shop)}곳 / {sent}건 dispatch")


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

    # ── 슬롯을 백엔드 internal API로 RDS에 동기화 (Supabase egress 회피) ──
    # 백엔드가 날짜창 교체 + '오늘 신규 슬롯' 판정(초기적재 제외)까지 처리한다.
    # 한 샵이 한 번에 아주 많이 늘면 취소가 아니라 재적재로 보고 알림 생략(도배 방지).
    MAX_NEW_PER_SHOP = 8
    sync_slots = [{"shopId": str(v["shop_id"]), "date": v["slot_date"], "startTime": v["start_time"][:5]} for v in rows]
    payload = {"startDate": start_ymd, "endDate": end_ymd,
               "shopIds": [str(s) for s in safe_ids], "slots": sync_slots}
    new_by_shop = {}
    try:
        resp = slot_sync(payload)
        print(f"✅ RDS 동기화: {resp.get('inserted', 0)}행 ({start_ymd}~{end_ymd}) · 신규 {resp.get('newCount', 0)}")
        for ns in resp.get("newSlots", []):
            new_by_shop.setdefault(str(ns["shopId"]), []).append(str(ns["startTime"])[:5])
        new_by_shop = {sid: t for sid, t in new_by_shop.items() if len(t) <= MAX_NEW_PER_SHOP}
    except Exception as e:
        print(f"   ⚠️ 슬롯 RDS 동기화 실패: {e}")
    try:
        notify_new_slots(new_by_shop, start_ymd)
    except Exception as e:
        print(f"   ⚠️ 알림 단계 예외(무시): {e}")

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
    # 초록핀(today_open)은 별도 가벼운 잡(today-open.yml)이 재계산 — 무거운 수집과 분리(타임아웃 방지)


def open_now_shops(date_ymd, now_hms):
    """지금(date, now 이후) 열린 샵 id 집합 — 백엔드 internal(RDS)에서 조회."""
    base = (ENV.get("API_BASE_URL") or "").rstrip("/")
    key = ENV.get("INTERNAL_API_KEY") or ""
    if not base or not key:
        raise RuntimeError("API_BASE_URL/INTERNAL_API_KEY 미설정 — open-now 조회 불가")
    url = f"{base}/internal/slots/open-now?date={date_ymd}&after={now_hms}"
    req = urllib.request.Request(url, method="GET", headers={"X-Internal-Key": key})
    with urllib.request.urlopen(req, timeout=60) as r:
        return set(str(s) for s in json.loads(r.read()).get("shopIds", []))


def reconcile_today_open(start_ymd, now_hms):
    """차단·교차일로 생긴 묵은 초록핀(거짓양성/음성)을 제거.
    슬롯은 RDS(백엔드)에서 '지금 열린 샵'을 받아 delta만 shops.today_open PATCH(Supabase)."""
    # 1) 지금 기준 실제로 열린 샵 (RDS)
    true_open = open_now_shops(start_ymd, now_hms)

    # 2) 현재 DB에서 true로 저장된 샵
    stored, frm = set(), 0
    while True:
        _, _, body = sb("GET", "shops?today_open=eq.true&select=id&order=id",
                        extra_headers={"Range": f"{frm}-{frm+999}"})
        rows = json.loads(body)
        if not rows:
            break
        for r in rows:
            stored.add(r["id"])
        frm += 1000
        if len(rows) < 1000:
            break

    # 3) 바뀐 것만 PATCH (대부분 그대로 → 쓰기 최소화)
    to_true, to_false = list(true_open - stored), list(stored - true_open)

    def patch(ids, val):
        for i in range(0, len(ids), 200):
            chunk = ",".join(str(x) for x in ids[i:i+200])
            sb("PATCH", f"shops?id=in.({chunk})", body={"today_open": val}, prefer="return=minimal")

    patch(to_true, True)
    patch(to_false, False)
    print(f"🟢 today_open 재계산: 열림 {len(true_open)}곳 (+{len(to_true)} / -{len(to_false)})")


def reconcile_main():
    """초록핀만 재계산하는 경량 진입점(today-open.yml용). 네이버 호출 없음 — Supabase만."""
    kst = timezone(timedelta(hours=9))
    now = datetime.now(kst)
    reconcile_today_open(now.strftime("%Y-%m-%d"), now.strftime("%H:%M:%S"))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "reconcile":
        reconcile_main()
    else:
        main()
