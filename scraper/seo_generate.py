"""프로그래매틱 SEO 데이터 생성 (멀티카테고리, RDS 백엔드 기반).

지역×카테고리별 '당일 예약' 데이터를 api/regions.json 한 파일로 생성.
- 데이터 소스: 백엔드 internal API GET /internal/shops/seo (RDS). Supabase 이전 완료.
- HTML은 요청 시 api/seo.js 가 렌더(단일 템플릿, /{cat}/{gu}). SPA는 클라렌더라 SEO 불가.
- sitemap/robots 는 정적 생성 안 함(동적 api/sitemap.js + 소스관리 public/robots.txt).

실행: python seo_generate.py   (scraper/.env 의 API_BASE_URL, INTERNAL_API_KEY 사용)
"""
import json, os, sys, urllib.request, urllib.parse
from collections import defaultdict
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
    raise SystemExit("API_BASE_URL / INTERNAL_API_KEY 필요 (scraper/.env)")

SITE = "https://www.themuselab.kr"
ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "api"
MIN_SHOPS = 5   # 이보다 적으면 페이지 안 만듦(thin content 방지)
TOP_N = 40      # 페이지당 표시 샵 수

# 카테고리: RDS category(한글) → URL 슬러그(영문). api/_categories.js 와 동일하게 유지.
CATEGORIES = {"네일": "nail", "헤어": "hair", "왁싱": "waxing", "속눈썹": "eyelash",
              "반영구": "pmu", "마사지": "massage", "피부": "skincare", "태닝": "tanning"}

# 지역 목록 (category.ts와 동일)
SEOUL_GU = ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"]
GYEONGGI_SI = ["수원시","성남시","고양시","부천시","안양시","안산시","남양주시","용인시","광명시","하남시","구리시","과천시","의정부시","김포시","시흥시","군포시","의왕시","화성시","평택시","파주시","광주시","오산시","이천시","안성시","여주시","양평군","포천시","동두천시","양주시","가평군","연천군"]
INCHEON_GU = ["인천 중구","인천 동구","인천 미추홀구","인천 연수구","인천 남동구","인천 부평구","인천 계양구","인천 서구","인천 강화군"]
BUSAN_GU = ["부산 중구","부산 서구","부산 동구","부산 영도구","부산 부산진구","부산 동래구","부산 남구","부산 북구","부산 해운대구","부산 사하구","부산 금정구","부산 강서구","부산 연제구","부산 수영구","부산 사상구","부산 기장군"]
DAEGU_GU = ["대구 중구","대구 동구","대구 서구","대구 남구","대구 북구","대구 수성구","대구 달서구","대구 달성군"]
GWANGJU_GU = ["광주 동구","광주 서구","광주 남구","광주 북구","광주 광산구"]
DAEJEON_GU = ["대전 중구","대전 동구","대전 서구","대전 유성구","대전 대덕구"]
ULSAN_GU = ["울산 중구","울산 남구","울산 동구","울산 북구","울산 울주군"]
SEJONG_SI = ["세종시"]
GYEONGSANG_SI = ["창원시","김해시","양산시","거제시","통영시","진주시","사천시","밀양시","함안군","거창군","포항시","구미시","경산시","경주시","안동시","김천시","영주시"]
JEOLLA_SI = ["전주시","익산시","군산시","정읍시","남원시","여수시","순천시","목포시","광양시","나주시"]
GANGWON_SI = ["춘천시","원주시","강릉시","속초시","동해시"]
CHUNGCHEONG_SI = ["청주시","충주시","제천시","천안시","아산시","서산시","당진시","공주시"]
JEJU_SI = ["제주시","서귀포시"]
REGIONS = (SEOUL_GU + GYEONGGI_SI + INCHEON_GU + BUSAN_GU + DAEGU_GU + GWANGJU_GU
           + DAEJEON_GU + ULSAN_GU + SEJONG_SI + GYEONGSANG_SI + JEOLLA_SI
           + GANGWON_SI + CHUNGCHEONG_SI + JEJU_SI)

# 생활권(洞 단위 브랜드 검색어) 전용 페이지 — 네일에만 적용.
SAENGGWON = {
    "일산": {"gu": "고양시",
             "tokens": ["일산", "주엽", "정발산", "백석", "장항", "마두", "대화", "탄현", "킨텍스", "풍동", "식사", "중산"],
             "dongs": ["주엽", "정발산", "백석", "장항", "킨텍스", "마두", "대화"],
             "nearby": ["고양시", "김포시", "파주시", "은평구", "마포구"]},
}


def api(path):
    req = urllib.request.Request(f"{API_BASE}{path}", headers={"X-Internal-Key": API_KEY})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def to_shop(s):
    # api/seo.js 가 쓰는 짧은 키로 압축. (name, tier, min, rv, today, ev, fv)
    return {"name": s["name"], "tier": s.get("price_tier") or "",
            "min": s.get("min_price"), "rv": s.get("review_count"),
            "today": bool(s.get("today_open")),
            "ev": bool(s.get("has_event")), "fv": bool(s.get("first_visit_deal"))}


def main():
    cats_ko = ",".join(CATEGORIES.keys())
    resp = api(f"/internal/shops/seo?categories={urllib.parse.quote(cats_ko)}&topn={TOP_N}")
    rows = resp.get("shops", [])
    print(f"📥 RDS에서 {len(rows)}행 수신 ({len(CATEGORIES)}개 카테고리)")

    # (category_ko, gu) 로 버킷팅
    buckets = defaultdict(list)
    for s in rows:
        buckets[(s.get("category"), s.get("gu"))].append(s)

    categories_out = {}
    for ko, cat in CATEGORIES.items():
        data, order, saeng = {}, [], []
        for gu in REGIONS:
            shops = buckets.get((ko, gu), [])
            if len(shops) < MIN_SHOPS:
                continue
            data[gu] = {"shops": [to_shop(s) for s in shops]}
            order.append(gu)

        # 생활권(일산 등) — 네일만. 상위 행정구 샵을 이름 토큰으로 추려 별도 키워드 페이지.
        if cat == "nail":
            for label, cfg in SAENGGWON.items():
                parent = buckets.get((ko, cfg["gu"]), [])
                sub = [s for s in parent if any(t in (s.get("name") or "") for t in cfg["tokens"])]
                if len(sub) < MIN_SHOPS:
                    print(f"    · {label}: {len(sub)}곳(생략)")
                    continue
                entry = {"linkGu": cfg["gu"], "shops": [to_shop(s) for s in sub]}
                if cfg.get("dongs"):
                    entry["dongs"] = cfg["dongs"]
                if cfg.get("nearby"):
                    entry["nearby"] = cfg["nearby"]
                data[label] = entry
                saeng.append(label)

        categories_out[cat] = {"order": order, "saenggwon": saeng, "data": data}
        print(f"  ✓ {ko}({cat}): {len(order)}지역{' +생활권 '+str(len(saeng)) if saeng else ''}")

    API.mkdir(parents=True, exist_ok=True)
    out = {"site": SITE, "categories": categories_out}
    (API / "regions.json").write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    total = sum(len(c["data"]) for c in categories_out.values())
    print(f"\n✅ regions.json 생성: {len(categories_out)}카테고리 · 총 {total}페이지 (sitemap은 동적 api/sitemap.js)")
    print(f"   → {API / 'regions.json'}")


if __name__ == "__main__":
    main()
