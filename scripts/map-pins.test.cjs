const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/contexts/catalog/ui/MapViewNaver.tsx'), 'utf8');
const functions = source.slice(source.indexOf('function markerIcon('), source.indexOf('// ── SDK'));
const context = { ASSET: '/map/' };
vm.createContext(context);
vm.runInContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
const naver = { maps: { Size: class { constructor(w, h) { this.width = w; this.height = h; } }, Point: class { constructor(x, y) { this.x = x; this.y = y; } } } };

test('ordinary shops use app circles, zoomed-out dots and color-preserving selected pins', () => {
  for (const kind of ['default', 'discount', 'reservable']) {
    for (const [focused, dot, file, w, h, anchorY] of [
      [false, false, kind === 'default' ? 'marker-shop' : `marker-shop-${kind}`, 20, 20, 10],
      [false, true, `dot-${kind}`, 12, 12, 6],
      [true, false, `pin-${kind}`, 27, 34, 34],
      [true, true, `pin-${kind}`, 27, 34, 34],
    ]) {
      const icon = context.markerIcon(naver, kind, focused, dot);
      assert.equal(icon.url, `/map/${file}.png`);
      assert.equal(icon.size.width, w);
      assert.equal(icon.size.height, h);
      assert.equal(icon.anchor.x, w / 2);
      assert.equal(icon.anchor.y, anchorY);
      assert.ok(fs.existsSync(path.join(root, 'public', icon.url)));
    }
  }
});

test('partner S pin stays visible when zoomed out and gets the app border when selected', () => {
  for (const dot of [false, true]) {
    const normal = context.markerIcon(naver, 'partner', false, dot);
    const selected = context.markerIcon(naver, 'partner', true, dot);
    assert.equal(normal.url, '/map/pin-partner.png');
    assert.equal(normal.size.width, 27);
    assert.equal(normal.size.height, 34);
    assert.equal(selected.url, '/map/pin-partner-focused.png');
    assert.equal(selected.size.width, 30);
    assert.equal(selected.size.height, 37);
    assert.equal(selected.anchor.y, 37);
  }
});
