const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/contexts/catalog/domain/filters.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { matchesFilter } = exportsObject;
const shop = { minPrice: 35000, gu: '서초구', categories: ['네일'], services: ['젤네일'], priceTier: '3만원대', reservable: true };

test('price range includes boundary prices and composes with category and service filters', () => {
  assert.equal(matchesFilter(shop, { priceMin: 35000, priceMax: 35000, categories: ['네일'], services: ['젤네일'] }), true);
  assert.equal(matchesFilter(shop, { priceMax: 30000 }), false);
  assert.equal(matchesFilter(shop, { priceMin: 40000 }), false);
  assert.equal(matchesFilter(shop, { priceMin: 30000, categories: ['헤어'] }), false);
});
test('unknown prices remain browsable without a range but are excluded from a specified range', () => {
  assert.equal(matchesFilter({ ...shop, minPrice: null }, {}), true);
  assert.equal(matchesFilter({ ...shop, minPrice: null }, { priceMin: 10000 }), false);
  assert.equal(matchesFilter({ ...shop, minPrice: null }, { priceMax: 40000 }), false);
});
test('10만원 이상 applies a lower bound without an artificial upper price ceiling', () => {
  assert.equal(matchesFilter({ ...shop, minPrice: 250000 }, { priceMin: 100000 }), true);
  assert.equal(matchesFilter(shop, { priceMin: 100000 }), false);
});
