"""프로그래매틱 SEO 데이터 생성 (단일 함수 렌더링용).

지역별 '당일 예약 네일샵' 데이터를 api/regions.json 한 파일로 생성.
- 예전엔 지역 수만큼 정적 HTML(public/nail/{지역}/index.html)을 만들었으나,
  이제는 데이터만 내보내고 HTML은 요청 시 api/nail.js 가 렌더한다(단일 템플릿).
- SPA(Vite)는 클라 렌더라 SEO가 안 되므로, /nail/:gu 는 서버리스 함수가 완성된 HTML로 응답.
- 데이터(전국 네일 가격·할인·당일예약)를 그대로 콘텐츠화 → 고의도 롱테일 검색 포착.
- sitemap.xml + robots.txt 도 생성.

실행: python seo_generate.py   (scraper/.env의 Supabase 키 사용)
"""
import json, sys, urllib.request, urllib.parse
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ENV = {}
for line in (Path(__file__).parent / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()
SB_URL = ENV["SUPABASE_URL"].rstrip("/")
SB_KEY = ENV["SUPABASE_SECRET_KEY"]

SITE = "https://www.themuselab.kr"
ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
API = ROOT / "api"
MIN_SHOPS = 5   # 이보다 적으면 페이지 안 만듦(thin content 방지)
TOP_N = 40      # 페이지당 표시 샵 수

# 지역 목록 (category.ts와 동일)
SEOUL_GU = ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"]
GYEONGGI_SI = ["수원시","성남시","고양시","부천시","안양시","안산시","남양주시","용인시","광명시","하남시","구리시","과천시","의정부시","김포시","시흥시","군포시","의왕시","화성시","평택시","파주시","광주시","오산시","이천시","안성시","여주시","양평군","포천시","동두천시","양주시","가평군","연천군"]
INCHEON_GU = ["인천 중구","인천 동구","인천 미추홀구","인천 연수구","인천 남동구","인천 부평구","인천 계양구","인천 서구","인천 강화군"]
BUSAN_GU = ["부산 중구","부산 서구","부산 동구","부산 영도구","부산 부산진구","부산 동래구","부산 남구","부산 북구","부산 해운대구","부산 사하구","부산 금정구","부산 강서구","부산 연제구","부산 수영구","부산 사상구","부산 기장군"]
DAEGU_GU = ["대구 중구","대구 동구","대구 서구","대구 남구","대구 북구","대구 수성구","대구 달서구","대구 달성군"]
GWANGJU_GU = ["광주 동구","광주 서구"]
GYEONGSANG_SI = ["창원시","진주시","포항시"]
JEOLLA_SI = ["전주시","여수시"]
REGIONS = SEOUL_GU + GYEONGGI_SI + INCHEON_GU + BUSAN_GU + DAEGU_GU + GWANGJU_GU + GYEONGSANG_SI + JEOLLA_SI

# 생활권(洞 단위 브랜드 검색어) 전용 페이지.
# 사람들은 행정구("고양시")가 아니라 생활권("일산")으로 검색한다 → 별도 랜딩으로 노출 포착.
# 상위 행정구(gu) 샵 중 이름에 tokens가 포함된 샵만 추려 thin-content 없이 정직하게 구성.
SAENGGWON = {
    "일산": {"gu": "고양시",
             "tokens": ["일산", "주엽", "정발산", "백석", "장항", "마두", "대화", "탄현", "킨텍스", "풍동", "식사", "중산"],
             "dongs": ["주엽", "정발산", "백석", "장항", "킨텍스", "마두", "대화"],
             "nearby": ["고양시", "김포시", "파주시", "은평구", "마포구"]},
}


def sb_get(path):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_gu(gu):
    nail = urllib.parse.quote("네일")
    return sb_get(f"shops?category=eq.{nail}&gu=eq.{urllib.parse.quote(gu)}"
                  f"&select=id,name,min_price,price_tier,has_event,first_visit_deal,today_open,review_count"
                  f"&order=review_count.desc.nullslast&limit={TOP_N}")


def to_shop(s):
    # api/nail.js 가 쓰는 짧은 키로 압축. (name, tier, min, rv, today, ev, fv)
    return {"name": s["name"], "tier": s.get("price_tier") or "",
            "min": s.get("min_price"), "rv": s.get("review_count"),
            "today": bool(s.get("today_open")),
            "ev": bool(s.get("has_event")), "fv": bool(s.get("first_visit_deal"))}


def slug(gu):
    return urllib.parse.quote(gu.replace(" ", "-"))


def main():
    data, order, saeng = {}, [], []

    for gu in REGIONS:
        rows = fetch_gu(gu)
        if len(rows) < MIN_SHOPS:
            continue
        data[gu] = {"linkGu": None, "shops": [to_shop(s) for s in rows]}
        order.append(gu)
        print(f"  ✓ {gu}: {len(rows)}곳")

    # 생활권(예: 일산) — 상위 행정구 샵을 이름 토큰으로 추려 별도 키워드 페이지.
    for label, cfg in SAENGGWON.items():
        rows = [s for s in fetch_gu(cfg["gu"])
                if any(t in (s.get("name") or "") for t in cfg["tokens"])]
        if len(rows) < MIN_SHOPS:
            print(f"  · {label}: {len(rows)}곳(생략, <{MIN_SHOPS})")
            continue
        entry = {"linkGu": cfg["gu"], "shops": [to_shop(s) for s in rows]}
        if cfg.get("dongs"):
            entry["dongs"] = cfg["dongs"]
        if cfg.get("nearby"):
            entry["nearby"] = cfg["nearby"]
        data[label] = entry
        saeng.append(label)
        print(f"  ✓ {label}(생활권/{cfg['gu']}): {len(rows)}곳")

    # api/regions.json — 단일 렌더 함수(api/nail.js)가 읽는 데이터 소스
    API.mkdir(parents=True, exist_ok=True)
    (API / "regions.json").write_text(
        json.dumps({"site": SITE, "order": order, "saenggwon": saeng, "data": data},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # sitemap.xml — 생활권은 고의도 검색어라 priority 0.8(행정구 0.7보다 높게)
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          f"<url><loc>{SITE}/</loc><priority>1.0</priority></url>"]
    for g in saeng:
        sm.append(f"<url><loc>{SITE}/nail/{slug(g)}/</loc><priority>0.8</priority></url>")
    for g in order:
        sm.append(f"<url><loc>{SITE}/nail/{slug(g)}/</loc><priority>0.7</priority></url>")
    sm.append("</urlset>")
    (PUBLIC / "sitemap.xml").write_text("\n".join(sm), encoding="utf-8")
    (PUBLIC / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")

    print(f"\n✅ regions.json({len(order)}지역+{len(saeng)}생활권) + sitemap.xml + robots.txt 생성")
    print(f"   → {API/'regions.json'}")


if __name__ == "__main__":
    main()
