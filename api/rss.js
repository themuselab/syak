// RSS — 네이버 서치어드바이저 "RSS 제출"용. 사이트맵과 같은 페이지(허브 + 카테고리×지역)를 RSS 2.0으로.
// /rss.xml → rewrite → /api/rss. 페이지 내용이 매일 갱신(가격·예약 집계)되므로 pubDate는 오늘.
import { readFileSync } from "node:fs";
import { slugFor } from "./_romanize.js";
import { CATEGORIES, CAT_SLUGS } from "./_categories.js";

const regions = JSON.parse(
  readFileSync(new URL("./regions.json", import.meta.url), "utf-8")
);
const SITE = regions.site;
const CATS = regions.categories || {};

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

function item(title, link, description, pubDate) {
  return `<item><title>${esc(title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid>` +
    `<description>${esc(description)}</description><pubDate>${pubDate}</pubDate></item>`;
}

export default function handler(_req, res) {
  const pubDate = new Date().toUTCString();
  const items = [];
  for (const cat of CAT_SLUGS) {
    const c = CATS[cat];
    if (!c || !c.data) continue;
    const place = CATEGORIES[cat].place;
    items.push(item(`전국 ${place} 지역별 당일 예약·가격비교`, `${SITE}/${cat}/`,
      `전국 ${place}의 지역별 당일 예약 가능 여부와 가격을 샥에서 한눈에 비교하세요.`, pubDate));
    for (const gu of Object.keys(c.data)) {
      const shops = c.data[gu].shops || [];
      const prices = shops.map((s) => s.min).filter(Boolean).sort((a, b) => a - b);
      const low = prices.length ? ` 최저 ${Number(prices[0]).toLocaleString("en-US")}원부터.` : "";
      items.push(item(`${gu} ${place} 당일 예약 가격비교`, `${SITE}/${cat}/${slugFor(gu)}/`,
        `${gu} ${place} ${shops.length}곳의 가격과 예약 가능 여부.${low} 실시간 빈자리는 샥에서 확인하세요.`, pubDate));
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0"><channel>` +
    `<title>샥 — 지금 예약 되는 동네 뷰티샵</title><link>${SITE}/</link>` +
    `<description>지역별 네일·헤어·속눈썹·왁싱·피부·마사지 샵의 당일 예약과 가격 비교</description>` +
    `<language>ko</language><lastBuildDate>${pubDate}</lastBuildDate>\n` +
    items.join("\n") + `\n</channel></rss>\n`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(xml);
}
