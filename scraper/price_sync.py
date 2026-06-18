"""샥 가격 롤링 동기화 (GitHub Actions용).

네이버에서 원장님이 가격을 바꾸면 → 앱에도 반영되게.
한 번에 전국 4만을 다 하지 않고, '가장 오래 안 본 샵'부터 N곳씩 계속 갱신(큐).
- 메뉴/가격은 pcmap place home 페이지의 window.__APOLLO_STATE__에서 추출 (Playwright X, stdlib만)
- recompute_price와 동일한 대표가 로직(ADDON 제외 + 네일은 컬러/젤 우선)으로 min_price/price_tier 재계산
- 처리한 샵은 price_synced_at=now 도장 → 다음 런은 그 다음 오래된 샵
- 매 런 다른 러너 IP + 시간예산 + 차단 시 건너뜀(도장 안 찍음 → 다음에 재시도)

env: SUPABASE_URL, SUPABASE_SECRET_KEY (.env 또는 Actions Secrets)
"""
import json, os, re, sys, time, random, urllib.request, urllib.error
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
SB_URL = ENV["SUPABASE_URL"].rstrip("/")
SB_SECRET = ENV["SUPABASE_SECRET_KEY"]

BATCH = int(ENV.get("PRICE_BATCH", "3000"))     # 이번 런에서 시도할 최대 샵 수(시간예산이 더 빨리 끊기도 함)
WORKERS = int(ENV.get("PRICE_WORKERS", "6"))    # 동시 요청(차단 피하려 보수적)
BUDGET_SEC = int(ENV.get("BUDGET_SEC", "600"))  # 10분 (job timeout보다 짧게)

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


def sb(method, path, body=None, prefer=None, extra_headers=None, tries=4):
    headers = {"apikey": SB_SECRET, "Authorization": f"Bearer {SB_SECRET}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
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


def fetch_menus(shop_id):
    """place home 페이지에서 메뉴 추출. 반환: list(메뉴) | None(차단/실패 → 도장 안 찍음)."""
    url = f"https://pcmap.place.naver.com/place/{shop_id}/home"
    time.sleep(0.2 + random.random() * 0.5)  # 차단 회피 지터
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", "ignore")
    except Exception:
        return None
    key = "window.__APOLLO_STATE__ = "
    i = html.find(key)
    if i < 0:
        return None  # 차단 페이지 or 비정상 → 재시도 대상
    try:
        obj, _ = DEC.raw_decode(html, i + len(key))
    except Exception:
        return None
    menus = []
    for v in obj.values():
        if isinstance(v, dict) and v.get("__typename") == "Menu" and v.get("name"):
            menus.append({"name": v.get("name"), "price": parse_won(v.get("price")),
                          "recommend": v.get("recommend"), "priceType": v.get("priceType")})
    return menus  # [] 이면 메뉴 없는 샵(정상) → 도장 찍고 미정 처리


def load_targets():
    """가장 오래 안 본 샵부터 BATCH개 (never-synced 우선). detail 있는 샵만."""
    st, hdr, body = sb("GET", f"shops?detail=not.is.null&select=id,category"
                              f"&order=price_synced_at.asc.nullsfirst&limit={BATCH}")
    return json.loads(body)


def main():
    targets = load_targets()
    print(f"💰 가격 동기화 대상: {len(targets)}곳 (가장 오래된 순) | workers {WORKERS} budget {BUDGET_SEC}s")
    now_iso = datetime.now(timezone.utc).isoformat()
    updates, dist = [], Counter()
    ok = blocked = 0
    t0 = time.time()
    deadline = t0 + BUDGET_SEC
    ex = ThreadPoolExecutor(max_workers=WORKERS)
    futs = {ex.submit(fetch_menus, t["id"]): t for t in targets}
    for fut in as_completed(futs):
        if time.time() > deadline:
            break
        t = futs[fut]
        try:
            menus = fut.result()
        except Exception:
            menus = None
        if menus is None:           # 차단/실패 → 도장 안 찍음(다음 런 재시도)
            blocked += 1
            continue
        p = rep_price(menus, t.get("category"))
        tr = tier(p)
        dist[tr] += 1
        ok += 1
        updates.append({"id": t["id"], "min_price": p, "price_tier": tr, "price_synced_at": now_iso})
    ex.shutdown(wait=False, cancel_futures=True)

    # 갱신 (min_price/price_tier + 도장). detail.menus는 v2에서 별도 갱신 예정.
    up = 0
    for i in range(0, len(updates), 500):
        sb("POST", "shops", body=updates[i:i+500], prefer="return=minimal,resolution=merge-duplicates")
        up += len(updates[i:i+500])
    elapsed = time.time() - t0
    print(f"✅ 갱신 {up}곳 | 성공 {ok} 차단/실패 {blocked} | {elapsed:.0f}초")
    for k in ["1만원대", "2만원대", "3만원대", "4만원이상", "미정"]:
        if dist[k]:
            print(f"   {k}: {dist[k]}")


if __name__ == "__main__":
    main()
