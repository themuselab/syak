"""프로그래매틱 SEO 랜딩 페이지 생성.

지역별 '당일 예약 네일샵' 정적 HTML을 public/nail/{지역}/index.html 로 생성.
- SPA(Vite)는 SEO가 안 되므로(클라 렌더) 정적 HTML을 따로 만들어 검색 노출.
- 데이터(전국 네일 가격·할인·당일예약)를 그대로 콘텐츠화 → 고의도 롱테일 검색 포착.
- 모든 CTA에 utm 부착(utm_source=seo) → 유입 추적.
- sitemap.xml + robots.txt 도 생성.

실행: python seo_generate.py   (scraper/.env의 Supabase 키 사용)
"""
import json, sys, urllib.request, urllib.parse, html as _html
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
PUBLIC = Path(__file__).resolve().parents[1] / "public"
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


def sb_get(path):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def esc(s):
    return _html.escape(str(s or ""))


def won(p):
    return f"{int(p):,}원" if p else None


def deep_link(gu, extra=""):
    q = urllib.parse.urlencode({"utm_source": "seo", "utm_medium": "organic",
                                "utm_campaign": f"nail-{gu}", "gu": gu})
    return f"{SITE}/?{q}{extra}"


def slug(gu):
    return urllib.parse.quote(gu.replace(" ", "-"))


def render(gu, shops, all_regions):
    n = len(shops)
    today = sum(1 for s in shops if s.get("today_open"))
    deal = sum(1 for s in shops if s.get("has_event") or s.get("first_visit_deal"))
    prices = sorted(s["min_price"] for s in shops if s.get("min_price"))
    low = won(prices[0]) if prices else "—"
    title = f"{gu} 네일샵 추천 · 당일 예약 가능 가격비교 | 샥"
    desc = (f"{gu} 네일샵 {n}곳의 대표가격과 당일 예약 가능 여부를 한눈에. "
            f"최저 {low}부터, 할인·이벤트 {deal}곳. 지금 예약 가능한 곳을 샥에서 바로 확인하세요.")
    url = f"{SITE}/nail/{slug(gu)}/"

    # 샵 카드
    cards = []
    items_ld = []
    for i, s in enumerate(shops, 1):
        badges = []
        if s.get("today_open"): badges.append('<span class="b green">오늘 예약 가능</span>')
        if s.get("has_event"): badges.append('<span class="b pink">할인·이벤트</span>')
        if s.get("first_visit_deal"): badges.append('<span class="b pink">첫방문 할인</span>')
        price = won(s.get("min_price")) or "가격문의"
        rv = f' · 리뷰 {s["review_count"]:,}' if s.get("review_count") else ""
        cards.append(
            f'<li class="card"><a href="{deep_link(gu)}" rel="nofollow">'
            f'<div class="nm">{esc(s["name"])}</div>'
            f'<div class="meta">{esc(s.get("price_tier") or "")} · {esc(price)}~{rv}</div>'
            f'<div class="badges">{"".join(badges)}</div></a></li>')
        items_ld.append({"@type": "ListItem", "position": i,
                         "item": {"@type": "BeautySalon", "name": s["name"], "areaServed": gu}})

    ld = {"@context": "https://schema.org", "@type": "ItemList",
          "name": f"{gu} 네일샵", "numberOfItems": n, "itemListElement": items_ld}

    # 다른 지역 내부링크 (SEO 링크그래프) — 같은 그룹 위주 12개
    others = [g for g in all_regions if g != gu][:24]
    links = " · ".join(f'<a href="/nail/{slug(g)}/">{esc(g)} 네일</a>' for g in others)

    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#ec4899">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og.png">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;color:#222;background:#fff;line-height:1.5}}
.wrap{{max-width:680px;margin:0 auto;padding:20px 16px 60px}}
h1{{font-size:24px;margin:8px 0 6px}}.sub{{color:#666;font-size:14px;margin:0 0 16px}}
.cta{{display:block;text-align:center;background:#ec4899;color:#fff;font-weight:800;font-size:16px;padding:15px;border-radius:14px;text-decoration:none;margin:18px 0}}
.stats{{display:flex;gap:8px;margin:14px 0}}.stat{{flex:1;background:#fdeef6;border-radius:12px;padding:11px;text-align:center}}
.stat b{{display:block;font-size:18px;color:#ec4899}}.stat span{{font-size:12px;color:#9b2a5e}}
ul{{list-style:none;padding:0;margin:0}}.card{{border-top:1px solid #f1f1f3}}.card a{{display:block;padding:12px 2px;text-decoration:none;color:inherit}}
.nm{{font-weight:700;font-size:15px}}.meta{{font-size:13px;color:#666;margin-top:2px}}
.badges{{margin-top:6px;display:flex;gap:5px;flex-wrap:wrap}}.b{{font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px}}
.b.green{{background:#e7f7ee;color:#16a34a}}.b.pink{{background:#fde8f1;color:#ec4899}}
.links{{margin-top:30px;font-size:13px;color:#888;line-height:2}}.links a{{color:#888;text-decoration:none}}
footer{{margin-top:30px;font-size:12px;color:#aaa}}
</style>
</head>
<body><div class="wrap">
<h1>{esc(gu)} 당일 예약 가능한 네일샵</h1>
<p class="sub">{esc(gu)} 네일샵 {n}곳의 가격대와 예약 가능 여부를 모았어요. 실시간 빈자리는 샥에서 바로 확인하세요.</p>
<div class="stats">
<div class="stat"><b>{n}</b><span>네일샵</span></div>
<div class="stat"><b>{today}</b><span>오늘 예약</span></div>
<div class="stat"><b>{deal}</b><span>할인·첫방문</span></div>
</div>
<a class="cta" href="{deep_link(gu)}">샥에서 {esc(gu)} 빈자리 보기 →</a>
<h2 style="font-size:17px;margin:24px 0 4px">{esc(gu)} 네일샵 목록</h2>
<ul>{"".join(cards)}</ul>
<a class="cta" href="{deep_link(gu)}">지금 예약 가능한 곳 지도로 보기 →</a>
<div class="links"><b style="color:#666">다른 지역 네일샵</b><br>{links}</div>
<footer>샥(syak) · 지금 예약 되는 동네 뷰티샵 · <a href="{SITE}" style="color:#aaa">themuselab.kr</a></footer>
</div></body></html>"""


def main():
    made, urls = 0, []
    nail = urllib.parse.quote("네일")
    for gu in REGIONS:
        rows = sb_get(f"shops?category=eq.{nail}&gu=eq.{urllib.parse.quote(gu)}"
                      f"&select=id,name,min_price,price_tier,has_event,first_visit_deal,today_open,review_count"
                      f"&order=review_count.desc.nullslast&limit={TOP_N}")
        if len(rows) < MIN_SHOPS:
            continue
        out = PUBLIC / "nail" / gu.replace(" ", "-")
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(render(gu, rows, REGIONS), encoding="utf-8")
        urls.append(f"{SITE}/nail/{slug(gu)}/")
        made += 1
        print(f"  ✓ {gu}: {len(rows)}곳")

    # sitemap.xml
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          f"<url><loc>{SITE}/</loc><priority>1.0</priority></url>"]
    for u in urls:
        sm.append(f"<url><loc>{u}</loc><priority>0.7</priority></url>")
    sm.append("</urlset>")
    (PUBLIC / "sitemap.xml").write_text("\n".join(sm), encoding="utf-8")
    # robots.txt
    (PUBLIC / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
    print(f"\n✅ SEO 페이지 {made}개 + sitemap.xml + robots.txt 생성 → {PUBLIC}")


if __name__ == "__main__":
    main()
