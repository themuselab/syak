// 동적 사이트맵 — regions.json의 전 카테고리 영문 슬러그 URL 생성.
// /sitemap.xml → rewrite → /api/sitemap.
import { readFileSync } from "node:fs";
import { slugFor } from "./_romanize.js";
import { CAT_SLUGS } from "./_categories.js";

const regions = JSON.parse(
  readFileSync(new URL("./regions.json", import.meta.url), "utf-8")
);
const SITE = regions.site;
const CATS = regions.categories || {};

export default function handler(_req, res) {
  const now = new Date().toISOString().slice(0, 10);
  const urls = [`<url><loc>${SITE}/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>`];

  for (const cat of CAT_SLUGS) {
    const c = CATS[cat];
    if (!c || !c.data) continue;
    // 카테고리 허브(/{cat}/) — 지역 페이지보다 상위 우선순위
    urls.push(`<url><loc>${SITE}/${cat}/</loc><lastmod>${now}</lastmod><priority>0.9</priority><changefreq>daily</changefreq></url>`);
    const seoul = new Set((c.order || []).slice(0, 25));
    for (const gu of Object.keys(c.data)) {
      const sl = slugFor(gu);
      const pr = seoul.has(gu) ? "0.8" : "0.7";
      urls.push(
        `<url><loc>${SITE}/${cat}/${sl}/</loc>` +
        `<lastmod>${now}</lastmod><priority>${pr}</priority><changefreq>daily</changefreq></url>`
      );
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join("\n") + `\n</urlset>\n`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(xml);
}
