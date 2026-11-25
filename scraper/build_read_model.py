"""쓰기→읽기 투영 (CQRS).

원본 상세 데이터(seoul_shops_detailed.json)에서 파생필드를 계산해
앱이 읽을 read model을 생성한다. 앱은 네이버를 실시간 호출하지 않고 이 결과만 읽는다.

산출물 → apps-in-toss/syak/public/data/
  - shops.summary.json     : 요약 배열 (지도/리스트/컬렉션용, 가벼움)
  - details/<id>.json      : 가게별 상세 (상세 진입 시 지연 로딩)

사용: python build_read_model.py
"""
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SRC = Path(__file__).parent / "data" / "seoul_shops_detailed.json"
SUPPRESSED_IDS = set(json.loads((Path(__file__).resolve().parents[1] / "api" / "catalog-suppressions.json").read_text(encoding="utf-8")))
OUT = Path(__file__).parent.parent / "apps-in-toss" / "syak" / "public" / "data"
DETAILS = OUT / "details"

MAX_REVIEWS = 5
MAX_REVIEW_IMAGES = 6
MAX_GALLERY = 6
SHARDS = 256  # details를 256개 버킷으로 샤딩 (id % SHARDS) — 파일수/깃 경량화

# Match verified upstream business categories, never words in a shop's name.
# Unknown categories remain eligible for review; clinics are not beauty salons.
NON_SALON_SOURCE_CATEGORIES = {
    "화장품,향수", "기능성화장품", "미용기기,재료", "건강,의료용품", "미용교육",
    "미용학원", "평생,사회교육원", "교육원,교육센터", "전문건설업", "방수공사", "배관,냉난방공사", "기업",
    "한의원", "피부과", "성형외과", "치과", "산부인과", "가정의학과",
    "비뇨의학과", "병원부속시설", "병원,의원", "외과", "안과",
    "협회,단체", "종합도소매", "척추,자세교정",
}
SPECIFIC_SALON_CATEGORIES = {
    "네일아트,네일샵": "네일", "왁싱,제모": "왁싱", "미용실": "헤어",
    "이용원": "헤어", "미용문신,반영구화장": "반영구",
    "속눈썹증모,연장": "속눈썹", "메이크업": "메이크업", "태닝": "태닝",
}


def to_int(v):
    if v is None:
        return None
    s = re.sub(r"[^0-9]", "", str(v))
    return int(s) if s else None


def price_tier(min_price):
    if min_price is None:
        return "미정"
    if min_price < 20000:
        return "1만원대"
    if min_price < 30000:
        return "2만원대"
    if min_price < 40000:
        return "3만원대"
    return "4만원이상"


def min_menu_price(menus):
    prices = [to_int(m.get("price")) for m in (menus or [])]
    prices = [p for p in prices if p]
    return min(prices) if prices else None


def first_visit_deal(menus):
    return any("첫방문" in (m.get("name") or "") for m in (menus or []))


def has_event(s):
    if s.get("couponTotal"):
        return True
    hc = s.get("hasCoupon")
    if isinstance(hc, dict) and hc.get("count"):
        return True
    return bool(s.get("brandPromotion"))


def reservation_routes(s):
    routes = []
    bi = s.get("bookingItems") or []
    naver_url = next((b.get("bookingUrl") for b in bi if b.get("bookingUrl")), None)
    if naver_url:
        routes.append({"type": "naver", "label": "네이버로 예약", "value": naver_url})
    # 네이버 톡톡은 제외 — 예약(네이버 예약) 중심으로
    # 카카오 채널 (homepages에 있을 때만)
    for h in (s.get("homepages") or []):
        url = (h or {}).get("url") or ""
        if "kakao" in url.lower() or "pf.kakao" in url.lower():
            routes.append({"type": "kakao", "label": "카카오로 문의", "value": url})
            break
    if s.get("instagram"):
        routes.append({"type": "instagram", "label": "인스타로 문의", "value": s["instagram"]})
    phone = s.get("virtualPhone") or s.get("phone")
    if phone:
        routes.append({"type": "phone", "label": "전화로 예약", "value": phone})
    return routes


def fnum(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def build_summary(s, min_price):
    cats = s.get("categories") or []
    source = s.get("category_detail") or s.get("sourceCategory")
    if source in NON_SALON_SOURCE_CATEGORIES:
        raise ValueError("Verified source category is not a beauty salon: " + source)
    if len(cats) == 1 and source in SPECIFIC_SALON_CATEGORIES:
        cats = [SPECIFIC_SALON_CATEGORIES[source]]
    if "마사지" in cats:
        if source == "피부,체형관리":
            cats = list(dict.fromkeys("피부" if c == "마사지" else c for c in cats))
        elif source not in {"안마,마사지,지압", "스포츠마사지", "발관리", "마사지"}:
            raise ValueError("Massage listing requires a verified service category, not a search keyword")
    return {
        "id": s["id"],
        "name": s.get("name"),
        "category": cats[0] if cats else "네일",
        "categories": cats,
        "gu": (s.get("gus") or [None])[0],
        "coord": {"lat": fnum(s.get("y")), "lng": fnum(s.get("x"))},
        "representativeImage": (s.get("images") or {}).get("representative") or s.get("imageUrl"),
        "reviewCount": to_int(s.get("visitorReviewsTotal") or s.get("visitorReviewCount")) or 0,
        "priceTier": price_tier(min_price),
        "minPrice": min_price,
        "firstVisitDeal": first_visit_deal(s.get("menus")),
        "hasEvent": has_event(s),
        "reservable": bool(s.get("reservable") or s.get("hasBooking")),
        "sourceCategory": s.get("category_detail") or s.get("sourceCategory"),
        "sourceCategoryCodeList": s.get("categoryCodeList"),
    }


def build_detail(s, summary):
    imgs = s.get("images") or {}
    reviews = []
    for r in (s.get("visitorReviews") or [])[:MAX_REVIEWS]:
        reviews.append({
            "body": (r.get("body") or "")[:500],
            "visited": r.get("visited"),
            "images": (r.get("images") or [])[:MAX_REVIEW_IMAGES],
            "keywords": r.get("keywords") or [],
            "ownerReply": r.get("ownerReply"),
        })
    menus = [{"name": m.get("name"), "price": to_int(m.get("price")), "recommend": bool(m.get("recommend"))}
             for m in (s.get("menus") or []) if m.get("name")]
    return {
        **summary,
        "roadAddress": s.get("roadAddress_full") or s.get("roadAddress"),
        "hoursText": s.get("hours_text"),
        "conveniences": s.get("conveniences") or [],
        "instagram": s.get("instagram"),
        "phone": s.get("virtualPhone") or s.get("phone"),
        "menus": menus,
        "images": {
            "representative": imgs.get("representative") or s.get("imageUrl"),
            "gallery": (imgs.get("gallery") or s.get("imageUrls") or [])[:MAX_GALLERY],
            "menu": (imgs.get("menu") or [])[:MAX_GALLERY],
            "review": (imgs.get("review") or [])[:MAX_REVIEW_IMAGES],
        },
        "reservationRoutes": reservation_routes(s),
        "reviews": reviews,
        "reviewTotal": to_int(s.get("visitorReviewsTotal")) or 0,
        "blogReviewTotal": to_int(s.get("cafeBlogReviewsTotal")) or 0,
    }


def main():
    shops = json.loads(SRC.read_text(encoding="utf-8"))
    # 기존 details(개별 파일 포함) 비우고 다시 생성
    if DETAILS.exists():
        for f in DETAILS.glob("*.json"):
            f.unlink()
    DETAILS.mkdir(parents=True, exist_ok=True)

    summaries = []
    buckets = {}  # bucket -> { id: detail }
    skipped = 0
    for s in shops:
        if str(s.get("id")) in SUPPRESSED_IDS:
            skipped += 1
            continue
        if not s.get("x") or not s.get("y") or not s.get("name"):
            skipped += 1
            continue
        mp = min_menu_price(s.get("menus"))
        try:
            summary = build_summary(s, mp)
        except ValueError:
            skipped += 1
            continue
        summaries.append(summary)
        detail = build_detail(s, summary)
        b = int(s["id"]) % SHARDS
        buckets.setdefault(b, {})[s["id"]] = detail

    for b, m in buckets.items():
        (DETAILS / f"{b}.json").write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")

    (OUT / "shops.summary.json").write_text(
        json.dumps(summaries, ensure_ascii=False), encoding="utf-8")

    from collections import Counter
    tiers = Counter(x["priceTier"] for x in summaries)
    print(f"✅ read model 생성: 요약 {len(summaries)}개 (스킵 {skipped})")
    print(f"   상세 버킷 파일: {len(buckets)}개 (가게 {len(summaries)}곳) → {DETAILS}")
    print(f"   이벤트보유 {sum(1 for x in summaries if x['hasEvent'])} | "
          f"첫방문 {sum(1 for x in summaries if x['firstVisitDeal'])} | "
          f"예약가능 {sum(1 for x in summaries if x['reservable'])}")
    print(f"   가격대: {dict(tiers)}")
    print(f"   요약파일 → {OUT / 'shops.summary.json'}")


if __name__ == "__main__":
    main()
