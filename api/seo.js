// 카테고리×지역 SEO/GEO 랜딩 — 단일 서버리스 함수 (nail/hair/waxing/eyelash).
// 요청(/{cat}/{slug})마다 regions.json의 해당 카테고리·지역 데이터로 완성 HTML 렌더.
//  - URL 영문 슬러그(/nail/gangnam/), canonical=영문. 기존 한글 URL은 301→영문.
//  - 자동 리다이렉트 없음(콘텐츠 우선). CTA로 앱 진입(유입 퍼널).
//  - GA4(gtag) + seo_landing/seo_cta_click 이벤트. AI 답변엔진(GEO) 인용 구조.
// 데이터: api/regions.json (scraper/seo_generate.py 가 RDS에서 생성).
import { readFileSync } from "node:fs";
import { slugFor } from "./_romanize.js";
import { CATEGORIES } from "./_categories.js";

const regions = JSON.parse(
  readFileSync(new URL("./regions.json", import.meta.url), "utf-8")
);
const SITE = regions.site;
const CATS = regions.categories || {};
const GA_ID = "G-Q0WLLSMTXM";
// 앱 유입: iOS 앱스토어(출시됨). 안드로이드는 Play 비공개 테스트 중이라 공개 링크 없음 → 버튼 숨김.
const IOS_APP_ID = "6807780736";
// App Store Connect의 provider token(pt)을 넣으면 ct(캠페인)가 앱 분석의 "캠페인"별 설치로 잡힌다. 비우면 일반 링크.
const APPSTORE_PT = "";

// 전 카테고리에 등장하는 gu → 영문 슬러그 (역방향 조회용)
const SLUG_TO_GU = {};
for (const c of Object.values(CATS)) {
  for (const gu of Object.keys(c.data || {})) SLUG_TO_GU[slugFor(gu)] = gu;
}
const slugOf = (gu) => slugFor(gu);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
const won = (p) => (p ? `${Number(p).toLocaleString("en-US")}원` : null);
// 받침 유무로 은/는 조사 (마사지·피부관리·반영구는 모음 끝 → '는')
function eunNeun(w) {
  const c = w.charCodeAt(w.length - 1);
  const batchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return w + (batchim ? "은" : "는");
}

// 앱(지역 필터) 딥링크. 같은 도메인이라 utm 미부착(GA4 세션 왜곡 방지) →
// 퍼널은 이벤트 seo_landing/seo_cta_click + landing_page 차원으로.
function deepLink(linkGu, cat, gu) {
  const q = new URLSearchParams({ gu: linkGu, cat: CATEGORIES[cat].ko, from: `seo-${cat}-${slugOf(gu)}` });
  return `${SITE}/?${q}`;
}
function cta(linkGu, cat, gu, placement, cls, label) {
  const href = deepLink(linkGu, cat, gu);
  const on = `gtag('event','seo_cta_click',{category:'${cat}',region:${JSON.stringify(gu)},region_slug:${JSON.stringify(slugOf(gu))},placement:'${placement}'})`;
  return `<a class="${cls}" href="${href}" onclick="${esc(on)}">${label}</a>`;
}

function appStoreUrl(campaign) {
  const base = `https://apps.apple.com/kr/app/id${IOS_APP_ID}`;
  return APPSTORE_PT ? `${base}?pt=${APPSTORE_PT}&ct=${encodeURIComponent(campaign)}&mt=8` : base;
}

// 앱 설치 유도 — 클릭은 GA4 app_install_click(store·placement·category·region)로 잡아 디코 리포트에 집계.
// 안드로이드 기기에선 숨김(공개 스토어 링크 없음). iOS 사파리는 상단 스마트 앱 배너도 함께 뜬다.
function appBlock(cat, region, slug, placement) {
  const on = `gtag('event','app_install_click',{store:'ios',category:'${cat}',region:${JSON.stringify(region)},region_slug:${JSON.stringify(slug)},placement:'${placement}'})`;
  return `<div class="app" data-app>` +
    `<div class="app-t"><b>샥 앱으로 빈자리 알림 받기</b><span>즐겨찾은 샵에 빈자리가 생기면 바로 알려드려요</span></div>` +
    `<a class="app-b" href="${appStoreUrl(`seo-${cat}-${slug}`)}" target="_blank" rel="noopener" onclick="${esc(on)}">` +
    `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>` +
    `App Store에서 받기</a></div>`;
}
// 사장님 유입: 이 페이지를 검색해 들어온 매장 사장님 → 사장님 사이트 업종별 노쇼·빈자리 가이드.
// 다른 도메인(owner.)이라 utm으로 출처를 남긴다(같은 도메인 앱 CTA와 달리 세션 왜곡 문제 없음).
function ownerBlock(cat, region, slug, placement) {
  const place = CATEGORIES[cat].place;
  const q = new URLSearchParams({ utm_source: "syak_web", utm_medium: "referral", utm_campaign: "seo_owner", utm_content: `${cat}-${slug}` });
  const on = `gtag('event','seo_owner_click',{category:'${cat}',region:${JSON.stringify(region)},region_slug:${JSON.stringify(slug)},placement:'${placement}'})`;
  return `<a class="owner" href="https://owner.themuselab.kr/guide/${cat}/?${q}" onclick="${esc(on)}">` +
    `<b>${esc(region === "전국" ? place : `${region} ${place}`)} 사장님, 노쇼 난 자리 그냥 비워두시나요?</b>` +
    `<span>취소석 30초 등록 → ${esc(region === "전국" ? "근처" : region)}에서 ${esc(place)} 찾는 손님에게 바로 알림 →</span></a>`;
}
const OWNER_CSS = `.owner{display:block;border:1px solid #ececf0;border-radius:14px;padding:13px 15px;margin:26px 0 0;text-decoration:none;color:inherit}` +
  `.owner b{display:block;font-size:14px;color:#333}.owner span{display:block;font-size:13px;color:#ec4899;margin-top:2px}`;

// 안드로이드면 앱 블록 숨김(스크립트 꺼져 있으면 그냥 보임 — 무해)
const APP_HIDE_ANDROID = `<script>if(/Android/i.test(navigator.userAgent))document.querySelectorAll('[data-app]').forEach(function(e){e.style.display='none'})</script>`;
const APP_BANNER_META = `<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}">`;
const APP_CSS = `.app{display:flex;align-items:center;gap:12px;justify-content:space-between;background:#1f1f23;color:#fff;border-radius:14px;padding:14px 16px;margin:18px 0}` +
  `.app-t{display:flex;flex-direction:column;gap:2px;min-width:0}.app-t b{font-size:15px}.app-t span{font-size:12px;color:#c9c9cf}` +
  `.app-b{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;background:#fff;color:#111;font-weight:800;font-size:13px;padding:9px 12px;border-radius:10px;text-decoration:none}`;

function render(cat, gu, entry, catData, nowIso, freshLabel) {
  const info = CATEGORIES[cat];
  const label = info.ko;      // 네일/헤어/…
  const place = info.place;   // 네일샵/헤어샵/…
  const shops = entry.shops || [];
  const lg = entry.linkGu || gu;
  const sl = slugOf(gu);
  const n = shops.length;
  const today = shops.filter((s) => s.today).length;
  const deal = shops.filter((s) => s.ev || s.fv).length;
  const prices = shops.map((s) => s.min).filter(Boolean).sort((a, b) => a - b);
  const low = prices.length ? won(prices[0]) : "—";
  const mid = prices.length ? won(prices[Math.floor(prices.length / 2)]) : "—";

  // 가격대 분포(실 데이터) — 유니크 콘텐츠
  const BANDS = ["1만원대", "2만원대", "3만원대", "4만원이상"];
  const bandCount = {};
  for (const s of shops) if (s.tier) bandCount[s.tier] = (bandCount[s.tier] || 0) + 1;
  const bandHtml = BANDS.filter((b) => bandCount[b]).map((b) => {
    const c = bandCount[b], pct = Math.round((c / n) * 100);
    return `<div class="bar"><span class="bl">${b}</span><span class="bt"><i style="width:${pct}%"></i></span><span class="bn">${c}곳</span></div>`;
  }).join("");

  // 지역 인기·대표 시술(실제 메뉴 가격)
  const pop = entry.pop || [];
  const popHtml = pop.length
    ? `<h2>${esc(gu)} ${esc(place)} 인기·대표 시술 가격</h2>` +
      `<ul class="menus">${pop.map((m) => `<li><span>${esc(m.n)}</span><b>${esc(won(m.p))}~</b></li>`).join("")}</ul>`
    : "";

  // CTR 훅킹 — 안 변하는 실사실만(원칙#2). today(오늘 N곳)·n(top-40 상한)은 고정 스냅샷이라
  // 메타에 안 씀(사실과 어긋날 소지). 최저가(데이터 기반)+"당일 예약"(제품 기능, 항상 참)으로 소구.
  // 제목 ≤60·설명 ~150자. 페이지마다 지역·가격이 달라 고유.
  const priceTitle = low !== "—" ? `최저 ${low} · ` : "";
  const title = `${gu} ${place} ${priceTitle}당일 예약 가격비교 | 샥`;
  const priceDesc = low !== "—" ? ` 최저 ${low}부터,` : "";
  const dealDesc = deal > 0 ? ` 첫방문·할인 ${deal}곳.` : "";
  const desc =
    `${gu} ${place} 가격 한눈에 비교 —${priceDesc}${dealDesc} 지금 예약 빈자리 있는 곳을 샥에서 실시간 확인하고 안 기다리고 바로 예약하세요.`
      .replace(/\s+/g, " ");
  const url = `${SITE}/${cat}/${sl}/`;

  // 사진 캐러셀 — 실제 매장 사진(앞쪽 최대 8곳). 이미지 alt에 "지역 업종 상호"를 넣어 이미지 검색·
  // 네이버 대표 이미지 선정에 쓰이게 한다. CSS scroll-snap만 사용(스크립트 없음), 첫 2장 외 lazy.
  const withPhoto = shops.filter((s) => s.ph);
  const ogImage = withPhoto.length ? withPhoto[0].ph : `${SITE}/og.png`;
  const carousel = withPhoto.length >= 3
    ? `<h2>${esc(gu)} ${esc(place)} 사진으로 둘러보기</h2>` +
      `<ul class="car" aria-label="${esc(gu)} ${esc(place)} 매장 사진">` +
      withPhoto.map((s, i) =>
        `<li><a href="${deepLink(lg, cat, gu)}" rel="nofollow" ` +
          `onclick="gtag('event','seo_cta_click',{category:'${cat}',region:${JSON.stringify(gu)},placement:'carousel'})">` +
          `<img src="${esc(s.ph)}" alt="${esc(`${gu} ${place} ${s.name}`)}" width="150" height="150"` +
          `${i < 2 ? "" : ' loading="lazy"'} decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/fallback.png'">` +
          `<span class="cn">${esc(s.name)}</span>` +
          `<span class="cm">${esc(won(s.min) ? `${won(s.min)}~` : s.tier || "")}${s.today ? " · <em>오늘 예약</em>" : ""}</span>` +
        `</a></li>`).join("") +
      `</ul>`
    : "";

  const cards = [];
  const itemsLd = [];
  shops.forEach((s, i) => {
    const badges = [];
    if (s.today) badges.push('<span class="b green">오늘 예약 가능</span>');
    if (s.ev) badges.push('<span class="b pink">할인·이벤트</span>');
    if (s.fv) badges.push('<span class="b pink">첫방문 할인</span>');
    const price = won(s.min) || "가격문의";
    const rv = s.rv ? ` · 리뷰 ${Number(s.rv).toLocaleString("en-US")}` : "";
    const menuLine = s.m ? `<div class="mn">${esc(s.m.n)} ${esc(won(s.m.p))}~</div>` : "";
    const roadLine = s.road ? `<div class="rd">📍 ${esc(s.road)}</div>` : "";
    cards.push(
      `<li class="card"><a href="${deepLink(lg, cat, gu)}" rel="nofollow" ` +
        `onclick="gtag('event','seo_cta_click',{category:'${cat}',region:${JSON.stringify(gu)},placement:'card'})">` +
        `<div class="nm">${esc(s.name)}</div>` +
        `<div class="meta">${esc(s.tier || "")} · ${esc(price)}~${rv}</div>` +
        menuLine + roadLine +
        `<div class="badges">${badges.join("")}</div></a></li>`
    );
    itemsLd.push({
      "@type": "ListItem", position: i + 1,
      item: {
        "@type": "BeautySalon", name: s.name, areaServed: gu,
        ...(s.ph ? { image: s.ph } : {}),
        ...(s.road ? { address: { "@type": "PostalAddress", streetAddress: s.road, addressCountry: "KR" } } : {}),
        ...(s.min ? { priceRange: `${won(s.min)}~` } : {}),
      },
    });
  });

  const ld = {
    "@context": "https://schema.org", "@type": "ItemList",
    name: `${gu} ${place}`, numberOfItems: n, itemListElement: itemsLd,
  };
  const bcLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "샥", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: `전국 ${place}`, item: `${SITE}/${cat}/` },
      { "@type": "ListItem", position: 3, name: `${gu} ${place}`, item: url },
    ],
  };

  const faqs = [
    [`${gu} ${place} 당일 예약 가능한가요?`,
      `네, 가능합니다. 샥(syak)에서 ${gu} ${place}의 실시간 빈자리를 확인하고 당일 예약할 수 있어요. 오늘 예약 가능한 곳은 현재 ${today}곳입니다. (${freshLabel} 기준)`],
    [`${gu} ${place} 가격은 얼마인가요?`,
      `${gu} ${eunNeun(place)} 최저 ${low}부터 시작합니다. 중앙값은 약 ${mid}이며, 첫방문 할인이나 이벤트를 진행하는 곳도 ${deal}곳 있어요.`],
    ["예약 빈자리를 어떻게 확인하나요?",
      `샥 앱·웹에서 시간·지역·분야로 필터하면 지금 예약 가능한 ${label} 매장만 지도에 표시됩니다. 리뷰·사진·가격을 보고 바로 예약하세요.`],
  ];
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({
      "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  const faqHtml = faqs.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("");

  const tldr =
    `<p class="tldr"><b>요약(${esc(freshLabel)} 기준):</b> ${esc(gu)} ${esc(eunNeun(place))} <b>최저 ${esc(low)}</b>부터 시작하고, ` +
    `대표가격 중앙값은 약 ${esc(mid)}입니다. 현재 모은 <b>${n}곳</b> 중 <b>오늘 예약 가능 ${today}곳</b>, ` +
    `<b>할인·첫방문 이벤트 ${deal}곳</b>. 실시간 빈자리는 <b>샥(syak)</b>에서 바로 확인하고 당일 예약할 수 있습니다.</p>`;

  // 같은 카테고리 다른 지역 내부링크
  const linkTargets = (entry.nearby && entry.nearby.length)
    ? entry.nearby
    : (catData.order || []).filter((g) => g !== gu).slice(0, 24);
  const links = linkTargets
    .filter((g) => catData.data[g])
    .map((g) => `<a href="/${cat}/${slugOf(g)}/">${esc(g)} ${esc(label)}</a>`)
    .join(" · ");

  // 다른 카테고리 같은 지역 (교차 내부링크 — 링크그래프·탐색성)
  const crossCat = Object.keys(CATEGORIES)
    .filter((c) => c !== cat && CATS[c] && CATS[c].data[gu])
    .map((c) => `<a href="/${c}/${sl}/">${esc(gu)} ${esc(CATEGORIES[c].place)}</a>`)
    .join(" · ");

  const pageLd = {
    "@context": "https://schema.org", "@type": "WebPage",
    name: title, url, inLanguage: "ko-KR", dateModified: nowIso, description: desc,
    speakable: { "@type": "SpeakableSpecification", cssSelector: [".tldr", ".faq"] },
    isPartOf: { "@type": "WebSite", name: "샥", url: `${SITE}/` },
  };
  const offerLd = pop.length ? {
    "@context": "https://schema.org", "@type": "OfferCatalog", name: `${gu} ${place} 시술 가격`,
    itemListElement: pop.map((m) => ({
      "@type": "Offer", priceCurrency: "KRW", price: m.p,
      itemOffered: { "@type": "Service", name: m.n, areaServed: gu },
    })),
  } : null;
  const offerScript = offerLd
    ? `<script type="application/ld+json">${JSON.stringify(offerLd)}</script>` : "";

  const gaSnippet =
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}` +
    `gtag('js',new Date());gtag('config','${GA_ID}');` +
    `gtag('event','seo_landing',{page_type:'seo_geo',category:'${cat}',` +
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
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:alt" content="${esc(`${gu} ${place}`)}">
<meta property="og:locale" content="ko_KR">
${APP_BANNER_META}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
${gaSnippet}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(bcLd)}</script>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
<script type="application/ld+json">${JSON.stringify(pageLd)}</script>
${offerScript}
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;color:#222;background:#fff;line-height:1.5}
.wrap{max-width:680px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:24px;margin:8px 0 6px}.sub{color:#666;font-size:14px;margin:0 0 14px}
.tldr{background:#fff7fb;border:1px solid #fbcfe3;border-radius:12px;padding:13px 14px;font-size:14px;color:#3a3a3a;margin:0 0 16px}.tldr b{color:#ec4899}
.cta{display:block;text-align:center;background:#ec4899;color:#fff;font-weight:800;font-size:16px;padding:15px;border-radius:14px;text-decoration:none;margin:18px 0}
.stats{display:flex;gap:8px;margin:14px 0}.stat{flex:1;background:#fdeef6;border-radius:12px;padding:11px;text-align:center}
.stat b{display:block;font-size:18px;color:#ec4899}.stat span{font-size:12px;color:#9b2a5e}
h2{font-size:17px;margin:26px 0 6px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 4px}.tab{font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;background:#f4f4f5;color:#555;text-decoration:none}.tab.on{background:#ec4899;color:#fff}
ul{list-style:none;padding:0;margin:0}.card{border-top:1px solid #f1f1f3}.card a{display:block;padding:12px 2px;text-decoration:none;color:inherit}
.nm{font-weight:700;font-size:15px}.meta{font-size:13px;color:#666;margin-top:2px}
.mn{font-size:12px;color:#ec4899;margin-top:3px;font-weight:600}.rd{font-size:12px;color:#999;margin-top:2px}
.bars{margin:6px 0 2px}.bar{display:flex;align-items:center;gap:8px;margin:5px 0}.bl{font-size:12px;color:#555;width:64px}.bt{flex:1;height:8px;background:#f1f1f3;border-radius:6px;overflow:hidden}.bt i{display:block;height:100%;background:#ec4899;border-radius:6px}.bn{font-size:12px;color:#888;width:34px;text-align:right}
.menus{margin:6px 0}.menus li{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #f4f4f5;padding:9px 2px;font-size:14px}.menus span{color:#333}.menus b{color:#ec4899;white-space:nowrap}
.badges{margin-top:6px;display:flex;gap:5px;flex-wrap:wrap}.b{font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px}
.b.green{background:#e7f7ee;color:#16a34a}.b.pink{background:#fde8f1;color:#ec4899}
.area{font-size:13px;color:#555;line-height:1.9;margin:6px 0 0}.area a{color:#ec4899;text-decoration:none;font-weight:600}
.faq dt{font-weight:700;font-size:15px;margin-top:14px}.faq dd{margin:4px 0 0;font-size:14px;color:#555}
.links{margin-top:30px;font-size:13px;color:#888;line-height:2}.links a{color:#888;text-decoration:none}
.fresh{font-size:12px;color:#b9739a;margin:2px 0 0}
.src{font-size:12px;color:#aaa;margin:18px 0 0;line-height:1.7}
footer{margin-top:30px;font-size:12px;color:#aaa}
${OWNER_CSS}
.car{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;margin:6px -16px 0;padding:4px 16px 10px;scroll-padding-left:16px;-webkit-overflow-scrolling:touch}
.car li{flex:0 0 150px;scroll-snap-align:start}.car a{display:block;text-decoration:none;color:inherit}
.car img{display:block;width:150px;height:150px;object-fit:cover;border-radius:12px;background:#f4f4f5}
.cn{display:block;font-size:13px;font-weight:700;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm{display:block;font-size:12px;color:#888}.cm em{font-style:normal;color:#16a34a;font-weight:700}
${APP_CSS}
</style>
</head>
<body><div class="wrap">
<h1>${esc(gu)} 당일 예약 가능한 ${esc(place)}</h1>
<p class="sub">${esc(gu)} ${esc(place)} ${n}곳의 가격대와 예약 가능 여부를 모았어요. 실시간 빈자리는 샥에서 바로 확인하세요.</p>
<p class="fresh">📅 ${esc(freshLabel)} 기준 · 오늘 예약 가능 ${today}곳</p>
${crossCat ? `<div class="tabs"><span class="tab on">${esc(label)}</span>${crossCat.replace(/<a /g, '<a class="tab" ')}</div>` : ""}
${tldr}
<div class="stats">
<div class="stat"><b>${n}</b><span>${esc(place)}</span></div>
<div class="stat"><b>${today}</b><span>오늘 예약</span></div>
<div class="stat"><b>${deal}</b><span>할인·첫방문</span></div>
</div>
${bandHtml ? `<h2>${esc(gu)} ${esc(place)} 가격대 분포</h2><div class="bars">${bandHtml}</div>` : ""}
${cta(lg, cat, gu, "cta_top", "cta", `샥에서 ${esc(gu)} 빈자리 보기 →`)}
${carousel}
<h2>${esc(gu)} ${esc(place)} 목록</h2>
<ul>${cards.join("")}</ul>
${cta(lg, cat, gu, "cta_bottom", "cta", "지금 예약 가능한 곳 지도로 보기 →")}
${appBlock(cat, gu, sl, "region")}
${popHtml}
<h2>자주 묻는 질문</h2>
<dl class="faq">${faqHtml}</dl>
${ownerBlock(cat, gu, sl, "region")}
<div class="links"><b style="color:#666">다른 지역 ${esc(label)}</b> · <a href="/${cat}/" style="color:#ec4899;font-weight:600">전국 ${esc(place)} 전체보기</a><br>${links}</div>
<p class="src">이 페이지의 가격·예약 정보는 <b>샥(syak)</b>이 ${esc(gu)}의 ${esc(place)}을 직접 수집·집계한 1차 데이터입니다. ${esc(freshLabel)} 기준이며, 실시간 예약 빈자리는 샥에서 확인할 수 있습니다.</p>
<footer>샥(syak) · 지금 예약 되는 동네 뷰티샵 · <a href="${SITE}" style="color:#aaa">themuselab.kr</a></footer>
</div>${APP_HIDE_ANDROID}</body></html>`;
}

// 카테고리 허브(/{cat}/) — 전 지역 링크 모음. 내부링크 그래프 강화(색인율↑).
function renderHub(cat, catData, nowIso, freshLabel) {
  const info = CATEGORIES[cat];
  const place = info.place, label = info.ko;
  const order = (catData.order || []).filter((g) => catData.data[g]);
  const nRegion = order.length;
  const totalShops = order.reduce((a, g) => a + ((catData.data[g].shops || []).length), 0);
  const url = `${SITE}/${cat}/`;
  const title = `전국 ${place} ${totalShops.toLocaleString("en-US")}곳 · 지역별 당일 예약·가격비교 | 샥`;
  const desc = `우리 동네 ${place} 어디가 지금 예약 되고 얼마인지 한눈에. 전국 ${nRegion}개 지역 ${totalShops.toLocaleString("en-US")}곳의 당일 예약·최저가를 샥에서 실시간 확인하세요.`;
  const regionLinks = order.map((g) => `<a href="/${cat}/${slugOf(g)}/">${esc(g)} ${esc(label)}</a>`).join(" · ");
  const crossHub = Object.keys(CATEGORIES)
    .filter((c) => c !== cat && CATS[c])
    .map((c) => `<a class="tab" href="/${c}/">${esc(CATEGORIES[c].place)}</a>`).join("");
  const bcLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "샥", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: `전국 ${place}`, item: url },
    ],
  };
  const pageLd = {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: title, url, inLanguage: "ko-KR", dateModified: nowIso, description: desc,
    isPartOf: { "@type": "WebSite", name: "샥", url: `${SITE}/` },
  };
  const gaSnippet =
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}` +
    `gtag('js',new Date());gtag('config','${GA_ID}');` +
    `gtag('event','seo_landing',{page_type:'seo_hub',category:'${cat}',region:'전국',region_slug:'hub',shop_count:${totalShops},today_open:0});</script>`;
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="icon" type="image/png" href="/icon.png">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#ec4899">
<meta property="og:type" content="website"><meta property="og:site_name" content="샥"><meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/og.png">
${APP_BANNER_META}
${gaSnippet}
<script type="application/ld+json">${JSON.stringify(pageLd)}</script>
<script type="application/ld+json">${JSON.stringify(bcLd)}</script>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;color:#222;background:#fff;line-height:1.6}
.wrap{max-width:760px;margin:0 auto;padding:22px 16px 60px}
h1{font-size:24px;margin:8px 0 6px}.sub{color:#666;font-size:14px;margin:0 0 14px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 18px}.tab{font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;background:#f4f4f5;color:#555;text-decoration:none}
.cta{display:block;text-align:center;background:#ec4899;color:#fff;font-weight:800;font-size:16px;padding:15px;border-radius:14px;text-decoration:none;margin:18px 0}
.regions{font-size:14px;line-height:2.1}.regions a{color:#ec4899;text-decoration:none;font-weight:600}
h2{font-size:17px;margin:26px 0 6px}
footer{margin-top:30px;font-size:12px;color:#aaa}
${APP_CSS}
${OWNER_CSS}
</style></head>
<body><div class="wrap">
<h1>전국 ${esc(place)} · 지역별 당일 예약 가격비교</h1>
<p class="sub">${esc(freshLabel)} 기준 전국 <b>${nRegion}개 지역</b> · <b>${totalShops.toLocaleString("en-US")}곳</b>의 ${esc(place)}을 모았어요. 우리 동네를 선택하면 실시간 빈자리·가격을 볼 수 있습니다.</p>
<div class="tabs"><span class="tab" style="background:#ec4899;color:#fff">${esc(label)}</span>${crossHub}</div>
<a class="cta" href="${SITE}/?cat=${encodeURIComponent(label)}">샥에서 내 주변 ${esc(place)} 지도로 보기 →</a>
<h2>지역별 ${esc(place)}</h2>
<p class="regions">${regionLinks}</p>
${appBlock(cat, "전국", "hub", "hub")}
${ownerBlock(cat, "전국", "hub", "hub")}
<footer>샥(syak) · 지금 예약 되는 동네 뷰티샵 · <a href="${SITE}" style="color:#aaa">themuselab.kr</a></footer>
</div>${APP_HIDE_ANDROID}</body></html>`;
}

// 진짜 없는 페이지 → 404(noindex). 소프트404(200 반환) 회피 — 색인 예산 보호.
// 주의: 데이터 "없음"에만 404. 조회 실패(못 가져옴)는 여기 오지 않음(로컬 JSON이라 항상 존재).
function notFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60"); // 404 베이크 방지: 짧게만 캐시
  res.end(`<!doctype html><html lang="ko"><head><meta charset="UTF-8">` +
    `<meta name="robots" content="noindex,follow"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>페이지를 찾을 수 없어요 · 샥</title></head>` +
    `<body style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:520px;margin:64px auto;padding:0 20px;text-align:center;color:#333">` +
    `<h1 style="font-size:22px">페이지를 찾을 수 없어요</h1>` +
    `<p style="color:#777">주소가 바뀌었거나 없는 페이지예요.</p>` +
    `<p><a href="${SITE}/" style="color:#ec4899;font-weight:700;text-decoration:none">샥 홈으로 →</a></p>` +
    `</body></html>`);
}

export default function handler(req, res) {
  // /{cat}/{slug} → rewrite → /api/seo?cat={cat}&gu={slug} (gu 없으면 허브)
  let cat = (req.query && req.query.cat) || "";
  if (Array.isArray(cat)) cat = cat[0];
  cat = String(cat).toLowerCase();
  const catData = CATS[cat];
  if (!CATEGORIES[cat] || !catData) { notFound(res); return; }

  let raw = req.query && req.query.gu;
  if (Array.isArray(raw)) raw = raw[0];
  raw = (raw || "").toString().replace(/\/+$/, "");

  // gu 없음 → 카테고리 허브 페이지
  if (!raw) {
    const now = new Date();
    const html = renderHub(cat, catData, now.toISOString(), `${now.getFullYear()}년 ${now.getMonth() + 1}월`);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.end(html);
    return;
  }

  // 1) 영문 슬러그 → 한글 gu (해당 카테고리에 데이터 있는 경우만)
  let key = null;
  const bySlug = SLUG_TO_GU[raw] || SLUG_TO_GU[raw.toLowerCase()];
  if (bySlug && catData.data[bySlug]) key = bySlug;

  // 2) 구 한글 URL(강남구 / 부산-강서구) → 301 영문
  if (!key) {
    const kor = catData.data[raw] ? raw : raw.replace(/-/g, " ");
    if (catData.data[kor]) {
      res.statusCode = 301;
      res.setHeader("Location", `/${cat}/${slugOf(kor)}/`);
      res.end(); return;
    }
  }
  if (!key) { notFound(res); return; }

  const now = new Date();
  const nowIso = now.toISOString();
  const freshLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const html = render(cat, key, catData.data[key], catData, nowIso, freshLabel);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(html);
}
