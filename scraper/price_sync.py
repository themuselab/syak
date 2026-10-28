"""샥 가격 롤링 동기화 (GitHub Actions용).

네이버에서 원장님이 가격을 바꾸면 → 앱에도 반영되게.
한 번에 전국 4만을 다 하지 않고, '가장 오래 안 본 샵'부터 N곳씩 계속 갱신(큐).
- 메뉴/가격은 pcmap place home 페이지의 window.__APOLLO_STATE__에서 추출 (Playwright X, stdlib만)
- recompute_price와 동일한 대표가 로직(ADDON 제외 + 네일은 컬러/젤 우선)으로 min_price/price_tier 재계산
- 같은 페이지에서 영업시간(newBusinessHours)·방문자 평점도 뽑고, 리뷰 페이지 1장을 더 받아
  최근 방문자 리뷰(방문일 포함)를 detail에 합친다(POST /internal/shops/details, 2026-10-22).
  리뷰 페이지가 막혀도 가격·영업시간은 저장한다(리뷰만 다음 회차).
- 처리한 샵은 price_synced_at=now 도장 → 다음 런은 그 다음 오래된 샵
- 매 런 다른 러너 IP + 시간예산 + 차단 시 건너뜀(도장 안 찍음 → 다음에 재시도)

env: SUPABASE_URL, SUPABASE_SECRET_KEY (.env 또는 Actions Secrets)
"""
import json, os, re, sys, threading, time, random, urllib.request, urllib.error
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
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

BATCH = int(ENV.get("PRICE_BATCH", "1500"))     # 이번 런에서 시도할 최대 샵 수(시간예산이 더 빨리 끊기도 함)
WORKERS = int(ENV.get("PRICE_WORKERS", "2"))    # 동시 요청 — 낮게(네이버 throttle 회피)
BUDGET_SEC = int(ENV.get("BUDGET_SEC", "600"))  # 10분 (job timeout보다 짧게)
# 러너 여러 대가 같은 큐(가장 오래된 순)를 받아 번갈아 나눠 갖는다(PART번째, PARTS대).
PART = int(ENV.get("PART", "0"))
PARTS = int(ENV.get("PARTS", "1"))
REVIEWS_MAX = 10

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"}
DEC = json.JSONDecoder()

# ── 대표가 로직 (recompute_price.py와 동일하게 유지) ─────────────
ADDON = re.compile(
    r"제거|오프|off|리무브|remov|리페어|음료|추가|옵션|보강|보수|파라핀|영양제|연장보수|드릴|"
    r"디자인추가|보호|글루|케어추가|기장|길이|증모|붙임|별도|정리|리터치|랩핑|낱개|한개|1개|개당|"
    r"포인트|스톤|파츠|보충|큐티클|자샵|타샵|샴푸|앞머리")
NAIL_MAIN = re.compile(r"원컬러|단색|풀컬러|컬러|젤|아트|그라데|프렌치|매니큐어|패디|페디")


def rep_price(menus, category=None):
    cands = []
    for m in (menus or []):
        p, nm = m.get("price"), m.get("name") or ""
        if not p or p < 5000 or p > 2000000:
            continue
        if ADDON.search(nm):
            continue
        cands.append((p, nm))
    if not cands:
        return None
    if category == "네일":
        mains = [p for p, nm in cands if NAIL_MAIN.search(nm)]
        if mains:
            return min(mains)
    return min(p for p, _ in cands)


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


def parse_won(s):
    if s is None:
        return None
    d = re.sub(r"[^\d]", "", str(s))
    return int(d) if d else None


def api(method, path, payload=None, tries=4):
    """백엔드 internal API (RDS). GET은 payload None."""
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"X-Internal-Key": API_KEY, "Content-Type": "application/json"}
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(f"{API_BASE}{path}", data=data, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise
            last = e
        except Exception as e:
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise last


# 속도 조절 — 차단 원인은 IP가 아니라 속도(2026-10-28 진단 scraper/diag_place.py: 같은 러너에서 하나씩 0.5초 간격 40/40 성공).
# 러너 전체 요청 간격을 두고, 막히면 잠깐 멈추고 간격을 늘린다(성공이 이어지면 다시 줄임).
GAP_MIN = float(ENV.get("PRICE_GAP_SEC", "0.6"))
GAP_MAX, COOLDOWN_SEC = 4.0, 4


class Pace:
    def __init__(self):
        self.gap, self.next_at, self.lock, self.blocks = GAP_MIN, 0.0, threading.Lock(), 0

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
ERRS = Counter()  # 실패 종류(로그용)


def fetch_state(url):
    """네이버 place 페이지의 __APOLLO_STATE__. 차단/실패면 None."""
    PACE.wait()
    html = None
    for attempt in range(2):  # 네트워크 예외만 1회 재시도 (차단은 재시도 안 함)
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as r:
                html = r.read().decode("utf-8", "ignore")
            break
        except urllib.error.HTTPError as e:
            ERRS[f"http_{e.code}"] += 1
            if e.code in (403, 429):  # 속도 제한 응답 → 바로 재시도하지 말고 전체를 늦춘다
                PACE.blocked()
                return None
            if attempt == 1:
                return None
            time.sleep(1.5)
        except Exception as e:
            ERRS[type(e).__name__] += 1
            if attempt == 1:
                return None
            time.sleep(1.5)
    key = "window.__APOLLO_STATE__ = "
    i = html.find(key)
    if i < 0:
        PACE.blocked()
        return None  # 속도 제한 페이지 or 비정상 → 다음 런 재시도
    PACE.ok()
    try:
        obj, _ = DEC.raw_decode(html, i + len(key))
    except Exception:
        return None
    return obj


def parse_hours(obj):
    """newBusinessHours → [{day,start,end,breaks,description}] | None(정보 없음)."""
    # newBusinessHours는 ROOT_QUERY의 placeDetail(...) 안에 있다 → 한 단계 안쪽까지 본다.
    cands = []
    for v in obj.values():
        if isinstance(v, dict):
            cands.append(v)
            cands.extend(x for x in v.values() if isinstance(x, dict))
    for v in cands:
        if not isinstance(v.get("newBusinessHours"), list):
            continue
        for nb in v["newBusinessHours"]:
            out = []
            for r in (nb or {}).get("businessHours") or []:
                h = (r or {}).get("businessHours") or {}
                out.append({
                    "day": r.get("day") or "",
                    "start": h.get("start"),
                    "end": h.get("end"),
                    "breaks": [{"start": b.get("start"), "end": b.get("end")}
                               for b in (r.get("breakHours") or []) if b and b.get("start")],
                    "description": r.get("description"),
                })
            if out:
                return out
    return None


def parse_rating(obj):
    """방문자 평점(visitorReviewsScore). 샵이 평점을 숨기면 None."""
    for v in obj.values():
        if isinstance(v, dict) and v.get("__typename") == "PlaceDetailBase":
            try:
                sc = float(v.get("visitorReviewsScore") or 0)
            except (TypeError, ValueError):
                return None
            show = (v.get("reviewSettings") or {}).get("showVisitorReviewScore")
            return sc if sc > 0 and show is not False else None
    return None


def fetch_place(shop_id):
    """place home → {menus, hours, rating}. None = 차단/실패(도장 안 찍음)."""
    obj = fetch_state(f"https://pcmap.place.naver.com/place/{shop_id}/home")
    if obj is None:
        return None
    menus = []
    for v in obj.values():
        if isinstance(v, dict) and v.get("__typename") == "Menu" and v.get("name"):
            menus.append({"name": v.get("name"), "price": parse_won(v.get("price")),
                          "recommend": v.get("recommend"), "priceType": v.get("priceType")})
    # menus [] 이면 메뉴 없는 샵(정상) → 도장 찍고 미정 처리
    return {"menus": menus, "hours": parse_hours(obj), "rating": parse_rating(obj)}


def fetch_reviews(shop_id):
    """방문자 리뷰 페이지 → 최근 리뷰(방문일 포함) 최대 REVIEWS_MAX개. 실패/없음이면 None."""
    obj = fetch_state(f"https://pcmap.place.naver.com/place/{shop_id}/review/visitor")
    if obj is None:
        return None
    out = []
    for v in obj.values():
        if not (isinstance(v, dict) and v.get("__typename") == "VisitorReview" and v.get("body")):
            continue
        if v.get("status") not in (None, "ACTIVE"):
            continue
        out.append({
            "body": v.get("body"),
            "images": [m.get("thumbnail") for m in (v.get("media") or [])
                       if m and m.get("type") == "image" and m.get("thumbnail")][:4],
            "keywords": [k.get("name") for k in (v.get("votedKeywords") or []) if k and k.get("name")],
            "ownerReply": (v.get("reply") or {}).get("body"),
            "visited": v.get("visited"),  # "10.8.목" — 앱에 그대로 표시
            "visitedAt": v.get("representativeVisitDateTime"),
        })
    # 페이지 순서는 추천순이라 날짜가 섞여 있다 → 최근 방문 순으로
    out.sort(key=lambda x: x.get("visitedAt") or "", reverse=True)
    return out[:REVIEWS_MAX] or None


def fetch_one(shop_id):
    place = fetch_place(shop_id)
    if place is None:
        return None
    place["reviews"] = fetch_reviews(shop_id)
    return place


def load_targets():
    """가장 오래 안 본 샵부터 BATCH개 (never-synced 우선). detail 있는 샵만. (RDS)"""
    out = api("GET", f"/internal/shops/price-targets?limit={BATCH * PARTS}").get("targets", [])
    return out[PART::PARTS]


def main():
    targets = load_targets()
    print(f"💰 가격 동기화 대상: {len(targets)}곳 (가장 오래된 순) | workers {WORKERS} budget {BUDGET_SEC}s")
    now_iso = datetime.now(timezone.utc).isoformat()
    updates, dist = [], Counter()
    ok = blocked = 0
    t0 = time.time()
    deadline = t0 + BUDGET_SEC
    ex = ThreadPoolExecutor(max_workers=WORKERS)
    details = []
    futs = {ex.submit(fetch_one, t["id"]): t for t in targets}
    for fut in as_completed(futs):
        if time.time() > deadline:
            break
        t = futs[fut]
        try:
            place = fut.result()
        except Exception:
            place = None
        if place is None:           # 차단/실패 → 도장 안 찍음(다음 런 재시도)
            blocked += 1
            continue
        menus = place["menus"]
        d = {"id": t["id"]}
        if place["hours"]:
            d["businessHours"] = place["hours"]
        if place["rating"]:
            d["rating"] = place["rating"]
        if place["reviews"]:
            d["reviews"] = place["reviews"]
        if len(d) > 1:
            details.append(d)
        p = rep_price(menus, t.get("category"))
        tr = tier(p)
        dist[tr] += 1
        ok += 1
        updates.append({"id": t["id"], "min_price": p, "price_tier": tr, "price_synced_at": now_iso})
    ex.shutdown(wait=False, cancel_futures=True)

    # 갱신 (min_price/price_tier + 도장). detail.menus는 v2에서 별도 갱신 예정.
    up = 0
    for i in range(0, len(updates), 500):
        r = api("POST", "/internal/shops/prices", {"rows": updates[i:i+500]})
        up += r.get("updated", len(updates[i:i+500]))
    # 영업시간·평점·리뷰 → detail (보낸 키만 합침)
    dup = 0
    for i in range(0, len(details), 100):
        try:
            r = api("POST", "/internal/shops/details", {"rows": details[i:i+100]})
            dup += r.get("updated", 0)
        except Exception as e:
            print(f"   ⚠️ 상세 저장 실패: {e}")
    elapsed = time.time() - t0
    print(f"✅ 갱신 {up}곳 | 성공 {ok} 차단/실패 {blocked}(속도제한 {PACE.blocks}) | 최종 간격 {PACE.gap:.2f}s | {elapsed:.0f}초")
    print(f"   실패 종류: {dict(ERRS.most_common())}")
    print(f"   상세 {dup}곳 (영업시간 {sum(1 for d in details if 'businessHours' in d)} · "
          f"평점 {sum(1 for d in details if 'rating' in d)} · 리뷰 {sum(1 for d in details if 'reviews' in d)})")
    for k in ["1만원대", "2만원대", "3만원대", "4만원이상", "미정"]:
        if dist[k]:
            print(f"   {k}: {dist[k]}")


if __name__ == "__main__":
    main()
