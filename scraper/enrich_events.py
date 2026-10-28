"""샥 이벤트/할인 수집 — 네이버 예약 상세페이지의 eventDescJson에서
'할인 중인 가게'와 대표 할인가/할인%를 뽑아 shops.event_desc / event_price 에 저장.

- 대상: shops 테이블에서 biz_id 있는 곳 (온라인 예약 가능)
- 가게당 상세페이지 1장만 받아 eventDescJson 파싱 (가벼움, 전국 ~20분)
- 할인 키워드 있는 desc만 채택 (가게소개문/빈값 제외) → 정직한 '할인' 신호
- 매 실행마다 event_desc/event_price 갱신 (사라진 이벤트는 null로 정리)

env: API_BASE_URL, INTERNAL_API_KEY  (로컬은 같은 폴더 .env)
저장: 백엔드 internal API(RDS). 예전엔 Supabase에 바로 썼는데 2026-08 Supabase 삭제 후
2달간 매일 실패했다(앱 할인 정보가 8월에 멈춤) → 2026-10-22 백엔드로 이전.
"""
import json, os, random, re, sys, threading, time, urllib.error, urllib.request, zlib
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
API_BASE = (ENV.get("API_BASE_URL") or "").rstrip("/")
API_KEY = ENV.get("INTERNAL_API_KEY") or ""
if not API_BASE or not API_KEY:
    raise SystemExit("API_BASE_URL/INTERNAL_API_KEY 필요")

# 샤딩 — 매트릭스 잡 분할(각 러너 다른 IP, 25분 차단선 안 넘게)
SHARD = int(ENV.get("SHARD", "0"))
NUM_SHARDS = int(ENV.get("NUM_SHARDS", "1"))
BUDGET_SEC = int(ENV.get("BUDGET_SEC", "840"))  # 시간예산 14분 — 넘으면 받은 것만 저장

# 속도 조절 — 차단 원인은 IP가 아니라 속도였다(2026-10-28 진단, scraper/diag_events.py).
# 같은 러너에서 하나씩 보내면 60곳 중 59곳 성공, 12개 동시면 23곳이 "데이터 없는 껍데기 페이지"(200)로 옴.
# 그래서 러너 전체 요청 간격을 두고, 껍데기가 오면 잠깐 멈추고 간격을 늘린다(성공이 이어지면 다시 줄임).
WORKERS = int(ENV.get("EVENT_WORKERS", "3"))
GAP_MIN = float(ENV.get("EVENT_GAP_SEC", "0.35"))  # 러너 전체 요청 간격 하한(초)
GAP_MAX = 3.0
COOLDOWN_SEC = 4  # 15초는 쉬는 시간이 예산의 대부분을 먹었다(막힘 ~50회×15초) → 짧게 자주


class Pace:
    def __init__(self):
        self.gap, self.next_at, self.lock = GAP_MIN, 0.0, threading.Lock()
        self.blocks = 0

    def wait(self):
        with self.lock:
            now = time.time()
            at = max(now, self.next_at)
            self.next_at = at + self.gap
        time.sleep(max(0.0, at - now))

    def ok(self):
        with self.lock:
            self.gap = max(GAP_MIN, self.gap * 0.97)

    def blocked(self):
        with self.lock:
            self.blocks += 1
            self.gap = min(GAP_MAX, self.gap * 1.5)
            self.next_at = max(self.next_at, time.time() + COOLDOWN_SEC)


PACE = Pace()

UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}

# 할인/이벤트로 인정할 키워드 (가게 소개문·빈값 걸러냄)
DISC_KW = re.compile(r"할인|이벤트|쿠폰|특가|무료|첫\s*방문|첫\s*예약|신규|오픈|%|원\b|천원")


def api(method, path, payload=None, tries=4):
    """백엔드 internal API (RDS). 5xx·네트워크 오류만 재시도."""
    data = json.dumps(payload).encode() if payload is not None else None
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(f"{API_BASE}{path}", data=data, method=method,
                headers={"Content-Type": "application/json", "X-Internal-Key": API_KEY})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise
            last = e
        except Exception as e:
            last = e
        time.sleep(2 * (i + 1))
    raise last


def load_targets():
    out = api("GET", "/internal/shops/targets").get("targets", [])
    if NUM_SHARDS > 1:  # 이 러너 담당 샤드만
        out = [r for r in out if zlib.crc32(str(r["id"]).encode()) % NUM_SHARDS == SHARD]
    # 순서를 섞는다 — 예산이 모자라도 매번 같은 샵만 빠지지 않게(slot_ingest와 같은 이유)
    random.shuffle(out)
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


def fetch_one(r):
    # 껍데기 페이지(속도 제한)는 바로 재시도하면 더 막힌다 → 이번 회차는 건너뛰고(기존값 보존) 전체 속도를 늦춘다.
    item = (r.get("item_ids") or ([r["item_id"]] if r.get("item_id") else [None]))[0]
    if not item:
        return r["id"], None, None
    url = f"https://m.booking.naver.com/booking/{r.get('biz_type') or 13}/bizes/{r['biz_id']}/items/{item}"
    PACE.wait()
    try:
        html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read().decode("utf-8", "ignore")
    except Exception:
        return r["id"], "__ERR__", None
    # 유효 예약페이지는 항상 eventDescJson 포함 → 없으면 속도 제한에 걸린 껍데기 페이지
    if "eventDescJson" not in html:
        PACE.blocked()
        return r["id"], "__ERR__", None
    PACE.ok()
    ed, ep = parse_event(html)
    return r["id"], ed, ep


def upsert_rows(rows):
    up = 0
    for i in range(0, len(rows), 500):
        api("POST", "/internal/shops/events", {"rows": rows[i:i+500]})
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
    deadline = t0 + BUDGET_SEC  # 예산 초과 시 멈추고 받은 것만 저장 → 타임아웃으로 안 죽음
    rows, found, err = [], 0, 0
    done = 0
    timed_out = False
    ex = ThreadPoolExecutor(max_workers=WORKERS)
    futs = [ex.submit(fetch_one, r) for r in targets]
    for fut in as_completed(futs):
        if time.time() > deadline:
            timed_out = True
            break
        sid, ed, ep = fut.result()
        if ed == "__ERR__":
            err += 1
            continue  # 에러/차단은 기존값 보존 (덮어쓰지 않음)
        rows.append({"id": sid, "event_desc": ed, "event_price": ep})
        if ed:
            found += 1
        done += 1
        if (done + err) % 2000 == 0:
            print(f"   …{done+err:,}곳 ({time.time()-t0:.0f}초, 할인 {found}, 차단/에러 {err})", flush=True)
    ex.shutdown(wait=False, cancel_futures=True)  # 남은 작업 취소 → 예산 내 종료
    if timed_out:
        print(f"   ⏱️ 예산({BUDGET_SEC}s) 초과 → {done+err:,}곳까지만 처리(나머지 다음 회차)", flush=True)
    # 중간 저장 (컬럼 없거나 업서트 실패해도 재수집 불필요)
    Path(__file__).parent.joinpath("events_cache.json").write_text(
        json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"💾 캐시 저장: events_cache.json ({len(rows):,}건)")
    # 저장 (event 없는 곳은 null로 → 만료 이벤트 정리)
    up = 0
    try:
        up = upsert_rows(rows)
        print(f"✅ 완료: {up:,}곳 갱신 | 할인중 {found:,}곳 | 에러 {err}(속도제한 {PACE.blocks}) | 최종 간격 {PACE.gap:.2f}s | {time.time()-t0:.0f}초")
    except Exception as ex:
        print(f"⚠️ 업서트 실패({up:,}건까지 됨): {ex}")
        print("   → 컬럼 추가 후 `python enrich_events.py --from-cache` 로 재시도하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
