// 동적 사이트맵 — regions.json에서 영문 슬러그 URL을 생성.
// 정적 sitemap.xml(하드코딩 149줄) 대체. 데이터 늘면 자동 반영.
// /sitemap.xml → rewrite → /api/sitemap.
import { readFileSync } from "node:fs";
import { slugFor } from "./_romanize.js";

const regions = JSON.parse(
  readFileSync(new URL("./regions.json", import.meta.url), "utf-8")
);
const SITE = regions.site;

export default function handler(_req, res) {
  const now = new Date().toISOString().slice(0, 10);
  const urls = [`<url><loc>${SITE}/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>`];

  // 데이터 키(148개)를 order 우선순위대로. 서울 구는 priority 0.8, 그 외 0.7.
  const seoul = new Set(regions.order.slice(0, 25));
  for (const gu of Object.keys(regions.data)) {
    const sl = slugFor(gu);
    const pr = seoul.has(gu) ? "0.8" : "0.7";
    urls.push(
      `<url><loc>${SITE}/nail/${sl}/</loc>` +
      `<lastmod>${now}</lastmod><priority>${pr}</priority><changefreq>daily</changefreq></url>`
    );
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join("\n") +
    `\n</urlset>\n`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(xml);
}
