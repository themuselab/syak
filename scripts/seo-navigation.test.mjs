import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/seo.js';
import { slugFor } from '../api/_romanize.js';

const regions = JSON.parse(readFileSync(new URL('../api/regions.json', import.meta.url), 'utf8'));
test('every SEO shop card and photo opens its own detail; region CTA stays a region link', () => {
  let checked = 0;
  for (const [cat, data] of Object.entries(regions.categories)) {
    for (const [gu, entry] of Object.entries(data.data)) {
      let html = '';
      const res = { setHeader() {}, end(value) { html = value; } };
      handler({ query: { cat, gu: slugFor(gu) } }, res);
      assert.equal(res.statusCode, 200);
      const cards = [...html.matchAll(/<li class="card"><a href="([^"]+)"/g)];
      assert.equal(cards.length, entry.shops.length);
      cards.forEach((match, i) => {
        const url = new URL(match[1]);
        assert.equal(url.searchParams.get('shop'), String(entry.shops[i].id));
        assert.equal(url.searchParams.get('gu'), entry.linkGu || gu);
        checked++;
      });
      const carousel = html.match(/<ul class="car"[\s\S]*?<\/ul>/)?.[0] || '';
      for (const match of carousel.matchAll(/<a href="([^"]+)"/g)) assert.ok(new URL(match[1]).searchParams.get('shop'));
      // Inline tracking must survive HTML attribute quoting (regions include Korean names).
      for (const match of html.matchAll(/onclick="([^"]*)"/g)) {
        const code = match[1].replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
        assert.doesNotThrow(() => new Function('window', code));
      }
      assert.ok(html.includes(`from=seo-${cat}-${slugFor(gu)}"`), 'region CTA has no shop ID');
    }
  }
  assert.ok(checked > 100);
});
