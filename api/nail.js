// 지역별 네일샵 SEO/GEO 랜딩 — 단일 서버리스 함수.
// 요청(/nail/{slug})마다 regions.json의 해당 지역 데이터로 완성된 HTML을 서버 렌더.
//  - URL은 영문 슬러그(/nail/gangnam/), canonical=영문. 기존 한글 URL은 301→영문.
//  - 자동 리다이렉트 제거: 사람이 콘텐츠(리스트·가격·FAQ)를 보고 CTA로 앱 진입(유입 퍼널).
//  - GA4(gtag) + seo_landing/seo_cta_click 이벤트로 유입 추적. AI 답변엔진(GEO) 인용 구조.
// 데이터는 scraper/seo_generate.py 가 생성하는 api/regions.json 한 곳에서 관리.
import { readFileSync } from "node:fs";
import { slugFor } from "./_romanize.js";

const regions = JSON.parse(
  readFileSync(new URL("./regions.json", import.meta.url), "utf-8")
);
const SITE = regions.site;
const GA_ID = "G-Q0WLLSMTXM";

// 한글 gu ↔ 영문 슬러그 (data의 148개 키가 기준)
const GU_TO_SLUG = {};
const SLUG_TO_GU = {};
for (const gu of Object.keys(regions.data)) {
  const s = slugFor(gu);
  GU_TO_SLUG[gu] = s;
  SLUG_TO_GU[s] = gu;
}
const slugOf = (gu) => GU_TO_SLUG[gu] || slugFor(gu);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
const won = (p) => (p ? `${Number(p).toLocaleString("en-US")}원` : null);

// 앱(해당 지역 필터) 딥링크. 같은 도메인이라 utm은 안 붙인다
// (utm_*는 GA4가 세션을 새로 끊고 원래 google/organic 출처를 덮어써 왜곡됨 →
//  퍼널은 GA4 이벤트 seo_landing/seo_cta_click + landing_page 차원으로 추적).
// from=seo-{slug}은 GA4 세션화를 안 건드리는 자체 마커(원하면 앱에서 읽어 라벨링 가능).
function deepLink(linkGu, gu) {
  const q = new URLSearchParams({ gu: linkGu, from: `seo-${slugOf(gu)}` });
  return `${SITE}/?${q}`;
}

// CTA a 태그 (클릭 시 GA4 이벤트 + 앱 진입). 이벤트는 sendBeacon이라 이동 중에도 전송됨.
function cta(linkGu, gu, placement, cls, label) {
  const href = deepLink(linkGu, gu);
  const on = `gtag('event','seo_cta_click',{category:'nail',region:${JSON.stringify(gu)},region_slug:${JSON.stringify(slugOf(gu))},placement:'${placement}'})`;
  return `<a class="${cls}" href="${href}" onclick="${esc(on)}">${label}</a>`;
}

function render(gu, entry, idx, nowIso, freshLabel) {
  const shops = entry.shops || [];
  const lg = entry.linkGu || gu; // 딥링크용 상위 행정구
  const sl = slugOf(gu);
  const n = shops.length;
  const today = shops.filter((s) => s.today).length;
  const deal = shops.filter((s) => s.ev || s.fv).length;
  const prices = shops.map((s) => s.min).filter(Boolean).sort((a, b) => a - b);
  const low = prices.length ? won(prices[0]) : "—";
  const mid = prices.length ? won(prices[Math.floor(prices.length / 2)]) : "—";

  const title = `${gu} 네일샵 추천 · 당일 예약 가능 가격비교 (${freshLabel}) | 샥`;
  const desc =
    `${gu} 네일샵 ${n}곳의 대표가격과 당일 예약 가능 여부를 한눈에. ` +
    `최저 ${low}부터, 오늘 예약 ${today}곳·할인 ${deal}곳. 지금 예약 가능한 곳을 샥에서 바로 확인하세요.`;
  const url = `${SITE}/nail/${sl}/`;

  // 샵 카드 + ItemList
  const cards = [];
  const itemsLd = [];
  shops.forEach((s, i) => {
    const badges = [];
    if (s.today) badges.push('<span class="b green">오늘 예약 가능</span>');
    if (s.ev) badges.push('<span class="b pink">할인·이벤트</span>');
    if (s.fv) badges.push('<span class="b pink">첫방문 할인</span>');
    const price = won(s.min) || "가격문의";
    const rv = s.rv ? ` · 리뷰 ${Number(s.rv).toLocaleString("en-US")}` : "";
    cards.push(
      `<li class="card"><a href="${deepLink(lg, gu)}" rel="nofollow" ` +
        `onclick="gtag('event','seo_cta_click',{category:'nail',region:${JSON.stringify(gu)},placement:'card'})">` +
        `<div class="nm">${esc(s.name)}</div>` +
        `<div class="meta">${esc(s.tier || "")} · ${esc(price)}~${rv}</div>` +
        `<div class="badges">${badges.join("")}</div></a></li>`
    );
    itemsLd.push({
      "@type": "ListItem", position: i + 1,
      item: { "@type": "BeautySalon", name: s.name, areaServed: gu },
    });
  });

  const ld = {
    "@context": "https://schema.org", "@type": "ItemList",
    name: `${gu} 네일샵`, numberOfItems: n, itemListElement: itemsLd,
  };
  const bcLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "샥", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: `${gu} 네일샵`, item: url },
    ],
  };

  // GEO/AEO: FAQPage — AI 답변엔진이 그대로 인용할 자문자답
  const faqs = [
    [`${gu} 네일샵 당일 예약 가능한가요?`,
      `네, 가능합니다. 샥(syak)에서 ${gu} 네일샵의 실시간 빈자리를 확인하고 당일 예약할 수 있어요. 오늘 예약 가능한 곳은 현재 ${today}곳입니다. (${freshLabel} 기준)`],
    [`${gu} 네일샵 가격은 얼마인가요?`,
      `${gu} 네일샵은 최저 ${low}부터 시작합니다. 중앙값은 약 ${mid}이며, 첫방문 할인이나 이벤트를 진행하는 곳도 ${deal}곳 있어요.`],
    ["예약 빈자리를 어떻게 확인하나요?",
      "샥 앱·웹에서 시간·지역·분야로 필터하면 지금 예약 가능한 네일샵만 지도에 표시됩니다. 리뷰·사진·가격을 보고 바로 예약하세요."],
  ];
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({
      "@type": "Question", name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  const faqHtml = faqs.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("");

  // GEO: 상단 인용가능 요약 (AI 답변엔진 인용 확률 ↑, 신선도 명시)
  const tldr =
    `<p class="tldr"><b>요약(${esc(freshLabel)} 기준):</b> ${esc(gu)} 네일샵은 <b>최저 ${esc(low)}</b>부터 시작하고, ` +
    `대표가격 중앙값은 약 ${esc(mid)}입니다. 현재 모은 <b>${n}곳</b> 중 <b>오늘 예약 가능 ${today}곳</b>, ` +
    `<b>할인·첫방문 이벤트 ${deal}곳</b>. 실시간 빈자리는 <b>샥(syak)</b>에서 바로 확인하고 당일 예약할 수 있습니다.</p>`;

  // 생활권(일산 등): 동네별 키워드 섹션
  let dongHtml = "";
  if (entry.dongs && entry.dongs.length) {
    const links = entry.dongs
      .map((d) => `<a href="${deepLink(lg, gu)}">${esc(d)} 네일</a>`)
      .join(" · ");
    dongHtml =
      `<h2>${esc(gu)} 동네별 네일샵</h2>` +
      `<p class="area">동네 이름으로 검색해도 같은 결과를 볼 수 있어요 — ${links}. ` +
      `내 위치 근처 네일샵을 지도에서 바로 찾을 수 있습니다.</p>`;
  }

  // 내부링크 (SEO 링크그래프). 생활권이면 nearby 우선, 아니면 다른 지역.
  const linkTargets = (entry.nearby && entry.nearby.length)
    ? entry.nearby
    : idx.order.filter((g) => g !== gu).slice(0, 24);
  const links = linkTargets
    .filter((g) => regions.data[g])
    .map((g) => `<a href="/nail/${slugOf(g)}/">${esc(g)} 네일</a>`)
    .join(" · ");

  // GEO: WebPage + dateModified + speakable (요약·FAQ를 음성/AI가 낭독·인용)
  const pageLd = {
    "@context": "https://schema.org", "@type": "WebPage",
    name: title, url, inLanguage: "ko-KR",
    dateModified: nowIso,
    description: desc,
    speakable: { "@type": "SpeakableSpecification", cssSelector: [".tldr", ".faq"] },
    isPartOf: { "@type": "WebSite", name: "샥", url: `${SITE}/` },
  };

  // GA4: 랜딩 자체를 page_view + seo_landing 이벤트로 추적(유입 확인의 핵심)
  const gaSnippet =
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}` +
    `gtag('js',new Date());gtag('config','${GA_ID}');` +
    `gtag('event','seo_landing',{page_type:'seo_geo',category:'nail',` +
    `region:${JSON.stringify(gu)},region_slug:${JSON.stringify(sl)},shop_count:${n},today_open:${today}});</script>`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="icon" type="image/png" href="/icon.png">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#ec4899">
<meta property="og:type" content="website">
<meta property="og:site_name" content="샥">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">
${gaSnippet}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(bcLd)}</script>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
<script type="application/ld+json">${JSON.stringify(pageLd)}</script>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;color:#222;background:#fff;line-height:1.5}
.wrap{max-width:680px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:24px;margin:8px 0 6px}.sub{color:#666;font-size:14px;margin:0 0 14px}
.tldr{background:#fff7fb;border:1px solid #fbcfe3;border-radius:12px;padding:13px 14px;font-size:14px;color:#3a3a3a;margin:0 0 16px}.tldr b{color:#ec4899}
.cta{display:block;text-align:center;background:#ec4899;color:#fff;font-weight:800;font-size:16px;padding:15px;border-radius:14px;text-decoration:none;margin:18px 0}
.stats{display:flex;gap:8px;margin:14px 0}.stat{flex:1;background:#fdeef6;border-radius:12px;padding:11px;text-align:center}
.stat b{display:block;font-size:18px;color:#ec4899}.stat span{font-size:12px;color:#9b2a5e}
h2{font-size:17px;margin:26px 0 6px}
ul{list-style:none;padding:0;margin:0}.card{border-top:1px solid #f1f1f3}.card a{display:block;padding:12px 2px;text-decoration:none;color:inherit}
.nm{font-weight:700;font-size:15px}.meta{font-size:13px;color:#666;margin-top:2px}
.badges{margin-top:6px;display:flex;gap:5px;flex-wrap:wrap}.b{font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px}
.b.green{background:#e7f7ee;color:#16a34a}.b.pink{background:#fde8f1;color:#ec4899}
.area{font-size:13px;color:#555;line-height:1.9;margin:6px 0 0}.area a{color:#ec4899;text-decoration:none;font-weight:600}
.faq dt{font-weight:700;font-size:15px;margin-top:14px}.faq dd{margin:4px 0 0;font-size:14px;color:#555}
.links{margin-top:30px;font-size:13px;color:#888;line-height:2}.links a{color:#888;text-decoration:none}
.fresh{font-size:12px;color:#b9739a;margin:2px 0 0}
footer{margin-top:30px;font-size:12px;color:#aaa}
</style>
</head>
<body><div class="wrap">
<h1>${esc(gu)} 당일 예약 가능한 네일샵</h1>
<p class="sub">${esc(gu)} 네일샵 ${n}곳의 가격대와 예약 가능 여부를 모았어요. 실시간 빈자리는 샥에서 바로 확인하세요.</p>
<p class="fresh">📅 ${esc(freshLabel)} 기준 · 오늘 예약 가능 ${today}곳</p>
${tldr}
<div class="stats">
<div class="stat"><b>${n}</b><span>네일샵</span></div>
<div class="stat"><b>${today}</b><span>오늘 예약</span></div>
<div class="stat"><b>${deal}</b><span>할인·첫방문</span></div>
</div>
${cta(lg, gu, "cta_top", "cta", `샥에서 ${esc(gu)} 빈자리 보기 →`)}
<h2>${esc(gu)} 네일샵 목록</h2>
<ul>${cards.join("")}</ul>
${cta(lg, gu, "cta_bottom", "cta", "지금 예약 가능한 곳 지도로 보기 →")}
${dongHtml}
<h2>자주 묻는 질문</h2>
<dl class="faq">${faqHtml}</dl>
<div class="links"><b style="color:#666">다른 지역 네일샵</b><br>${links}</div>
<footer>샥(syak) · 지금 예약 되는 동네 뷰티샵 · <a href="${SITE}" style="color:#aaa">themuselab.kr</a></footer>
</div></body></html>`;
}

export default function handler(req, res) {
  // /nail/:slug → rewrite → /api/nail?gu=:slug (slug은 영문 또는 구 한글)
  let raw = req.query && req.query.gu;
  if (Array.isArray(raw)) raw = raw[0];
  raw = (raw || "").toString().replace(/\/+$/, "");

  // 1) 영문 슬러그 → 한글 gu (신규 canonical URL)
  let key = SLUG_TO_GU[raw] || SLUG_TO_GU[raw.toLowerCase()] || null;

  // 2) 구 한글 URL(강남구 / 부산-강서구) → 301 영문
  if (!key) {
    const kor = regions.data[raw] ? raw : raw.replace(/-/g, " ");
    if (regions.data[kor]) {
      res.statusCode = 301;
      res.setHeader("Location", `/nail/${slugOf(kor)}/`);
      res.end();
      return;
    }
  }
  if (!key) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const freshLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const html = render(key, regions.data[key], regions, nowIso, freshLabel);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(html);
}
