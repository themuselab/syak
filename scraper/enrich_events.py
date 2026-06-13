"""샥 이벤트/할인 수집 — 네이버 예약 상세페이지의 eventDescJson에서
'할인 중인 가게'와 대표 할인가/할인%를 뽑아 shops.event_desc / event_price 에 저장.

- 대상: shops 테이블에서 biz_id 있는 곳 (온라인 예약 가능)
- 가게당 상세페이지 1장만 받아 eventDescJson 파싱 (가벼움, 전국 ~20분)
- 할인 키워드 있는 desc만 채택 (가게소개문/빈값 제외) → 정직한 '할인' 신호
- 매 실행마다 event_desc/event_price 갱신 (사라진 이벤트는 null로 정리)

env: SUPABASE_URL, SUPABASE_SECRET_KEY  (로컬은 같은 폴더 .env)
"""
import json, os, re, sys, time, urllib.request, zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

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

# 샤딩 — 매트릭스 잡 분할(각 러너 다른 IP, 25분 차단선 안 넘게)
SHARD = int(ENV.get("SHARD", "0"))
NUM_SHARDS = int(ENV.get("NUM_SHARDS", "1"))

UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}

# 할인/이벤트로 인정할 키워드 (가게 소개문·빈값 걸러냄)
DISC_KW = re.compile(r"할인|이벤트|쿠폰|특가|무료|첫\s*방문|첫\s*예약|신규|오픈|%|원\b|천원")


def sb(method, path, body=None, prefer=None, extra=None):
    headers = {"apikey": SB_SECRET, "Authorization": f"Bearer {SB_SECRET}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.headers, r.read()


def load_targets():
    out, frm = [], 0
    while True:
        st, hdr, body = sb("GET", "shops?biz_id=not.is.null&select=id,biz_id,biz_type,item_id,item_ids&order=id",
                           prefer="count=exact", extra={"Range": f"{frm}-{frm+999}"})
        rows = json.loads(body)
        out.extend(rows)
        total = int((hdr.get("content-range") or "/0").split("/")[1] or 0)
        frm += 1000
        if frm >= total or not rows:
            break
    if NUM_SHARDS > 1:  # 이 러너 담당 샤드만
        out = [r for r in out if zlib.crc32(str(r["id"]).encode()) % NUM_SHARDS == SHARD]
    return out


def extract_label(desc):
    """할인 텍스트에서 짧은 배지 라벨 추출: '50% 할인' 또는 '29,000원~'."""
    # 할인 % (가장 큰 값) — '추가 적립 40%' 같은 건 피하려 '할인/세일' 근처 우선
    pcts = [int(x) for x in re.findall(r"(\d{1,2})\s*%", desc) if 5 <= int(x) <= 90]
    # 원 단위 가격 (29,000 / 60000 / 22.500 등) → 5천~50만 범위만
    prices = []
    for m in re.findall(r"(\d{1,3}(?:[,\.]\d{3})|\d{4,6})\s*원", desc):
        n = int(m.replace(",", "").replace(".", ""))
        if 5000 <= n <= 500000:
            prices.append(n)
    # 'N천원'
    for m in re.findall(r"(\d{1,3})\s*천\s*원", desc):
        prices.append(int(m) * 1000)
    if pcts:
        return f"{max(pcts)}% 할인"
    if prices:
        return f"{min(prices):,}원~"
    return "할인"


def parse_event(html):
    """eventDescJson → (event_desc, event_price). 없으면 (None, None)."""
    m = re.search(r'"eventDescJson":\s*(\[.*?\])', html)
    if not m:
        return None, None
    try:
        arr = json.loads(m.group(1))
    except Exception:
        return None, None
    for a in arr:
        d = (a.get("desc") or "").strip()
        if not d or not DISC_KW.search(d):
            continue
        clean = re.sub(r"\s+", " ", d).strip()[:160]
        return clean, extract_label(clean)
    return None, None


def fetch_one(r, tries=5):
    item = (r.get("item_ids") or ([r["item_id"]] if r.get("item_id") else [None]))[0]
    if not item:
        return r["id"], None, None
    url = f"https://m.booking.naver.com/booking/{r.get('biz_type') or 13}/bizes/{r['biz_id']}/items/{item}"
    for i in range(tries):
        try:
            html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read().decode("utf-8", "ignore")
            # 유효 예약페이지는 항상 eventDescJson 포함 → 없으면 차단/비정상 페이지 → 재시도
            if "eventDescJson" not in html:
                raise RuntimeError("blocked")
            ed, ep = parse_event(html)
            return r["id"], ed, ep
        except Exception:
            if i == tries - 1:
                return r["id"], "__ERR__", None
            time.sleep(min(1.5 * (2 ** i), 20) + (hash(r["id"]) % 3))  # 지수 백오프 + 지터


def upsert_rows(rows):
    up = 0
    for i in range(0, len(rows), 500):
        sb("POST", "shops", body=rows[i:i+500], prefer="return=minimal,resolution=merge-duplicates")
        up += len(rows[i:i+500])
    return up


def main():
    if "--from-cache" in sys.argv:
        rows = json.loads(Path(__file__).parent.joinpath("events_cache.json").read_text(encoding="utf-8"))
        up = upsert_rows(rows)
        found = sum(1 for r in rows if r.get("event_desc"))
        print(f"✅ 캐시에서 복구: {up:,}곳 갱신 | 할인중 {found:,}곳")
        return
    targets = load_targets()
    print(f"🎟️  이벤트 수집 대상: {len(targets):,}곳")
    t0 = time.time()
    rows, found, err = [], 0, 0
    done = 0
    with ThreadPoolExecutor(max_workers=12) as ex:  # GitHub Actions(신선 IP) — slot_ingest처럼 견딤
        for fut in as_completed([ex.submit(fetch_one, r) for r in targets]):
            sid, ed, ep = fut.result()
            if ed == "__ERR__":
                err += 1
                continue  # 에러는 기존값 보존 (덮어쓰지 않음)
            rows.append({"id": sid, "event_desc": ed, "event_price": ep})
            if ed:
                found += 1
            done += 1
            if (done + err) % 2000 == 0:
                print(f"   …{done+err:,}곳 ({time.time()-t0:.0f}초, 할인 {found}, 차단/에러 {err})", flush=True)
    # 중간 저장 (컬럼 없거나 업서트 실패해도 재수집 불필요)
    Path(__file__).parent.joinpath("events_cache.json").write_text(
        json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"💾 캐시 저장: events_cache.json ({len(rows):,}건)")
    # 저장 (event 없는 곳은 null로 → 만료 이벤트 정리)
    up = 0
    try:
        for i in range(0, len(rows), 500):
            sb("POST", "shops", body=rows[i:i+500], prefer="return=minimal,resolution=merge-duplicates")
            up += len(rows[i:i+500])
        print(f"✅ 완료: {up:,}곳 갱신 | 할인중 {found:,}곳 | 에러 {err} | {time.time()-t0:.0f}초")
    except Exception as ex:
        print(f"⚠️ 업서트 실패({up:,}건까지 됨): {ex}")
        print("   → 컬럼 추가 후 `python enrich_events.py --from-cache` 로 재시도하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
