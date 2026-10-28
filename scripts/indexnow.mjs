#!/usr/bin/env node
/**
 * IndexNow로 네이버 서치어드바이저에 "페이지가 바뀌었다"고 알린다(재수집 요청).
 *   node scripts/indexnow.mjs            → 사이트맵의 전체 URL
 *   node scripts/indexnow.mjs URL1 URL2  → 지정한 URL만
 *
 * 키 파일: public/<KEY>.txt (내용 = 키). 키는 공개값(소유 확인용)이라 비밀 아님.
 * 의존성 없음(Node 20 fetch)
 */
const SITE = 'https://www.themuselab.kr';
const KEY = '359facb1228d0ec685d3e8d9334cf493';
const ENDPOINT = 'https://searchadvisor.naver.com/indexnow';

let urls = process.argv.slice(2);
if (!urls.length) {
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
if (!urls.length) { console.error('❌ 보낼 URL 없음'); process.exit(1); }

// IndexNow는 요청당 최대 10,000개
for (let i = 0; i < urls.length; i += 10000) {
  const urlList = urls.slice(i, i + 10000);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
  });
  console.log(`${res.ok ? '✅' : '❌'} ${res.status} — ${urlList.length}개 전송`, res.ok ? '' : await res.text());
  if (!res.ok) process.exitCode = 1;
}
