"""샥 — 가게 상세정보 enrich.

seoul_shops.json의 각 가게 상세 페이지를 방문해 인스타/홈페이지/영업시간/메뉴·가격/
편의시설/결제/예약/쿠폰/정확한 좌표·전화를 추출, seoul_shops_detailed.json에 병합.

- resume: 이미 enrich된 id는 건너뜀 (재실행하면 이어서).
- 봇 차단 시 지수 backoff로 자가회복 (오래 돌려도 OK).
- 증분 저장 (N개마다 flush).

사용:
  python enrich_details.py                  # 전체
  python enrich_details.py --gu 강남구       # 특정 구만
  python enrich_details.py --limit 50        # 앞 50개만 (테스트)
"""
import asyncio, json, random, sys
from pathlib import Path
from playwright.async_api import async_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DATA = Path(__file__).parent / "data"
SRC = DATA / "seoul_shops.json"
OUT = DATA / "seoul_shops_detailed.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
MIN_DELAY, MAX_DELAY = 1.3, 2.8
FLUSH_EVERY = 15
BLOCK_PHRASES = ("차단", "비정상", "제한", "과도한", "abnormal")


def deref(apollo, node, depth=0):
    if depth > 8:
        return None
    if isinstance(node, dict):
        if "__ref" in node:
            return deref(apollo, apollo.get(node["__ref"], {}), depth + 1)
        return {k: deref(apollo, v, depth + 1) for k, v in node.items() if k != "__typename"}
    if isinstance(node, list):
        return [deref(apollo, x, depth + 1) for x in node]
    return node


def extract_detail(apollo, shop_id):
    root = apollo.get("ROOT_QUERY", {})
    dkey = next((k for k in root if k.startswith("placeDetail")), None)
    detail = deref(apollo, root[dkey]) if dkey else {}
    base = detail.get("base") or {}

    def all_of(tn):
        return [deref(apollo, v) for k, v in apollo.items()
                if isinstance(v, dict) and v.get("__typename") == tn]

    # 홈페이지/SNS
    hp = detail.get("homepages") or base.get("homepages") or {}
    links = []
    if isinstance(hp, dict):
        for key in ("repr", "etc", "subLinks"):
            val = hp.get(key)
            if isinstance(val, dict):
                links.append(val)
            elif isinstance(val, list):
                links += [x for x in val if isinstance(x, dict)]
    instagram = next((l.get("url") for l in links
                      if "인스타" in str(l.get("type", "")) or "instagram" in str(l.get("url", "")).lower()), None)

    # 영업시간 요약
    bh = detail.get("businessHours") or detail.get("newBusinessHours") or []
    open_status, hours_text = None, None
    if isinstance(bh, list) and bh:
        b0 = bh[0]
        bsd = (b0 or {}).get("businessStatusDescription") or {}
        open_status = bsd.get("status")
        rows = (b0 or {}).get("businessHours") or []
        parts = []
        for r in rows:
            h = (r or {}).get("businessHours") or {}
            if h.get("start"):
                parts.append(f"{r.get('day','')} {h.get('start')}~{h.get('end')}".strip())
        hours_text = " / ".join(parts) if parts else None

    menus = [{"name": m.get("name"), "price": m.get("price"),
              "recommend": m.get("recommend"), "priceType": m.get("priceType")}
             for m in all_of("Menu") if m.get("name")]

    # 이미지: 대표(홍보/로고 역할) + 메뉴 이미지
    menu_images = [m.get("imageUrl") for m in all_of("MenuImage") if m.get("imageUrl")]
    upper = detail.get("paiUpperImage") or {}
    rep_image = base.get("imageUrl") or (upper.get("imageUrl") if isinstance(upper, dict) else None)

    # 블로그/카페 리뷰 (FsasReview)
    blog_reviews = [{"title": r.get("title"), "contents": (r.get("contents") or "")[:300],
                     "url": r.get("url"), "thumbnail": r.get("thumbnailUrl"),
                     "author": r.get("authorName"), "date": r.get("date") or r.get("createdString"),
                     "isVideo": r.get("isVideoThumbnail")}
                    for r in all_of("FsasReview") if r.get("title") or r.get("url")]
    booking_items = [{"name": b.get("name"), "bookingUrl": b.get("bookingUrl"),
                      "isOrderAvailable": b.get("isOrderAvailable")}
                     for b in all_of("BookingItem") if b.get("name")]

    coords = base.get("coordinate") or {}
    reservable = bool(booking_items) or bool(detail.get("instantBooking")) or bool(detail.get("naverBooking"))

    return {
        "name_detail": base.get("name"),
        "category_detail": base.get("category"),
        "categoryCodeList": base.get("categoryCodeList"),
        "roadAddress_full": base.get("roadAddress"),
        "address_full": base.get("address"),
        "x": coords.get("x"), "y": coords.get("y"),
        "phone": base.get("phone"),
        "virtualPhone": base.get("virtualPhone"),
        "instagram": instagram,
        "homepages": links or None,
        "talktalkUrl": base.get("talktalkUrl"),
        "naverBlog": base.get("naverBlog"),
        "chatBotUrl": base.get("chatBotUrl") or None,
        "open_status": open_status,
        "hours_text": hours_text,
        "businessHours": bh or None,
        "conveniences": base.get("conveniences"),
        "paymentInfo": base.get("paymentInfo"),
        "menus": menus or None,
        "menu_count": len(menus),
        "repImage": rep_image,
        "menuImages": menu_images or None,
        "blogReviews": blog_reviews or None,
        "bookingItems": booking_items or None,
        "reservable": reservable,
        "hasCoupon": detail.get("hasCoupon"),
        "brandPromotion": detail.get("brandPromotion"),
        "goodPrice": detail.get("goodPrice"),
        "additionalPrices": detail.get("additionalPrices"),
        "visitorReviewsScore": base.get("visitorReviewsScore"),
        "visitorReviewsTotal": base.get("visitorReviewsTotal"),
        "cafeBlogReviewsTotal": base.get("cafeBlogReviewsTotal"),
        "microReviews": base.get("microReviews"),
        "subwayStations": [{"name": s.get("name"), "walkTime": s.get("walkTime"),
                            "nearestExit": s.get("nearestExit")} for s in all_of("SubwayStationInfo")][:3] or None,
        "_enriched": True,
    }


async def fetch_detail(page, shop_id):
    url = f"https://pcmap.place.naver.com/place/{shop_id}/home"
    await page.goto(url, wait_until="domcontentloaded", timeout=25000)
    await asyncio.sleep(2.0)
    apollo = await page.evaluate("() => window.__APOLLO_STATE__ || null")
    if not apollo:
        body = await page.evaluate("() => (document.body.innerText||'').slice(0,120)")
        return None, body
    return apollo, None


def extract_reviews(apollo, max_n=15):
    """방문자 리뷰 추출 (본문·별점·방문일·리뷰사진·키워드·답글)."""
    out = []
    for k, v in apollo.items():
        if not (isinstance(v, dict) and v.get("__typename") == "VisitorReview"):
            continue
        r = deref(apollo, v)
        author = r.get("author") or {}
        media = [m.get("thumbnail") for m in (r.get("media") or []) if isinstance(m, dict) and m.get("thumbnail")]
        kws = r.get("votedKeywords") or r.get("tags")
        keywords = None
        if isinstance(kws, list):
            keywords = [x.get("displayName") or x.get("name") or x for x in kws if x]
        out.append({
            "rating": r.get("rating"),
            "body": (r.get("body") or "").strip()[:500],
            "visited": r.get("visited"),
            "visitCount": r.get("visitCount"),
            "keywords": keywords,
            "images": media or None,
            "author": author.get("nickname") or r.get("nickname"),
            "ownerReply": ((r.get("reply") or {}).get("body") or "").strip()[:300] or None,
        })
        if len(out) >= max_n:
            break
    return out


async def fetch_reviews(page, shop_id, max_n=15):
    url = f"https://pcmap.place.naver.com/place/{shop_id}/review/visitor"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await asyncio.sleep(1.8)
        apollo = await page.evaluate("() => window.__APOLLO_STATE__ || null")
    except Exception:
        return None
    if not apollo:
        return None
    return extract_reviews(apollo, max_n)


def parse_args(argv):
    gu, limit, region = None, None, None
    if "--gu" in argv:
        gu = argv[argv.index("--gu") + 1]
    if "--region" in argv:
        region = argv[argv.index("--region") + 1]
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    with_reviews = "--no-reviews" not in argv
    n_reviews = int(argv[argv.index("--reviews") + 1]) if "--reviews" in argv else 15
    return gu, limit, with_reviews, n_reviews, region


async def main():
    gu, limit, with_reviews, n_reviews, region = parse_args(sys.argv[1:])

    # --region: 그 지역 샵만 별도 파일로 (메모리 안전 — 한 번에 한 지역 ~5천곳).
    #           Seoul+경기는 이미 Supabase에 있어 재처리 불필요 → 새 지역만 분리.
    if region:
        from scrape_seoul import REGION_SETS
        labels = set(REGION_SETS[region].keys())
        out_path = DATA / f"detailed_{region}.json"
        all_shops = json.loads(SRC.read_text(encoding="utf-8"))
        base = [s for s in all_shops if labels & set(s.get("gus") or [])]
        del all_shops  # 전체 basic(32MB) 메모리 해제
    else:
        out_path = OUT
        base = json.loads(SRC.read_text(encoding="utf-8"))

    enriched = {}
    if out_path.exists():
        for s in json.loads(out_path.read_text(encoding="utf-8")):
            enriched[s["id"]] = s

    todo = base
    if gu:
        todo = [s for s in base if gu in (s.get("gus") or [])]
    todo = [s for s in todo if not enriched.get(s["id"], {}).get("_enriched")]
    if limit:
        todo = todo[:limit]

    total = len(todo)
    print(f"🔎 상세 enrich 대상: {total}개 (지역 {region or '전체'} {len(base)}곳, 이미 완료 {sum(1 for v in enriched.values() if v.get('_enriched'))}) → {out_path.name}")
    if not total:
        print("할 일 없음."); return

    def flush():
        merged = [enriched.get(s["id"], s) for s in base]
        out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    done = 0
    consecutive_blocks = 0
    aborted = False
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=UA, locale="ko-KR",
                                        timezone_id="Asia/Seoul", viewport={"width": 1366, "height": 850})
        page = await ctx.new_page()

        for i, s in enumerate(todo, 1):
            sid = s["id"]
            try:
                apollo, err = await fetch_detail(page, sid)
                if apollo is None:
                    blocked = err and any(b in err for b in BLOCK_PHRASES)
                    if blocked:
                        consecutive_blocks += 1
                        wait = min(20 * (2 ** (consecutive_blocks - 1)), 600)
                        print(f"[{i}/{total}] {s.get('name','')[:14]} 🛑 차단 — {wait}s 대기 (연속 {consecutive_blocks})")
                        flush()
                        if consecutive_blocks >= 6:
                            print("연속 차단 6회 — 중단. 나중에 재실행하면 resume."); aborted = True; break
                        await asyncio.sleep(wait)
                        continue
                    else:
                        print(f"[{i}/{total}] {s.get('name','')[:14]} ⚠️ apollo 없음")
                        enriched[sid] = {**s, "_enriched": True, "_no_detail": True}
                else:
                    consecutive_blocks = 0
                    det = extract_detail(apollo, sid)
                    # 방문자 리뷰 (별도 탭)
                    reviews = None
                    if with_reviews:
                        await asyncio.sleep(MIN_DELAY + random.random() * (MAX_DELAY - MIN_DELAY))
                        reviews = await fetch_reviews(page, sid, n_reviews)
                    # 이미지 묶음: 대표(홍보/로고) + 메뉴 + 리뷰사진
                    review_photos = []
                    for rv in (reviews or []):
                        review_photos += (rv.get("images") or [])
                    det["images"] = {
                        "representative": det.get("repImage") or s.get("imageUrl"),
                        "gallery": s.get("imageUrls") or [],
                        "menu": det.get("menuImages") or [],
                        "review": review_photos[:30],
                    }
                    det["visitorReviews"] = reviews
                    det["visitorReviewSample"] = len(reviews) if reviews else 0
                    enriched[sid] = {**s, **det}
                    done += 1
                    ig = "📷" if det.get("instagram") else "  "
                    rv = "예약" if det.get("reservable") else "—"
                    if i % 10 == 0 or i <= 5:
                        print(f"[{i}/{total}] {s.get('name','')[:16]} {ig} 메뉴{det.get('menu_count',0)} 리뷰{det.get('visitorReviewSample',0)} {rv} {det.get('open_status') or ''}")
            except Exception as e:
                print(f"[{i}/{total}] {s.get('name','')[:14]} 실패: {str(e)[:60]}")
                enriched[sid] = {**s, "_enriched": True, "_error": str(e)[:80]}

            if i % FLUSH_EVERY == 0:
                flush()
            await asyncio.sleep(MIN_DELAY + random.random() * (MAX_DELAY - MIN_DELAY))

        await browser.close()
    flush()
    ig_n = sum(1 for v in enriched.values() if v.get("instagram"))
    rs_n = sum(1 for v in enriched.values() if v.get("reservable"))
    print(f"\n✅ enrich 완료: 이번 {done}개 처리 | 인스타 보유 {ig_n} | 예약가능 {rs_n}")
    print(f"   → {out_path}")
    if aborted:
        print("⚠️ 차단으로 일부 미완료 — 재실행하면 이어서.")
        sys.exit(2)


if __name__ == "__main__":
    asyncio.run(main())
