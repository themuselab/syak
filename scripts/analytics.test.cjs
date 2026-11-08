const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

test('CTA experiment includes guests with stable device allocation through login and safe fallback', async () => {
  global.window = { location: { pathname: '/' } };
  const calls = [];
  const client = { onInitialized: async () => {}, track() {},
    isFeatureOn: (key, user) => { calls.push([key, user]); return true; },
    variationDetail: (key, user) => { calls.push([key, user]); return { variation: 'B', reason: 'TRAFFIC_ALLOCATED' }; },
    remoteConfig: () => ({ get: () => '네이버에서 확인하기' }) };
  const { createAnalyticsDelivery } = load('../src/shared/platform/analytics-delivery.ts', { createInstance: () => client });
  const delivery = createAnalyticsDelivery({ sdkKey: 'test', deviceId: 'same-device' });
  const signal = new AbortController().signal;
  assert.equal((await delivery.decideNaverCta(signal)).variation, 'B');
  delivery.setIdentity('member'); await delivery.decideNaverCta(signal);
  assert.deepEqual(calls.map(c => c[1].deviceId), Array(4).fill('same-device'));
  assert.deepEqual(calls.map(c => c[0]), [4, 5, 4, 5]);
  client.isFeatureOn = () => false;
  assert.equal(await delivery.decideNaverCta(signal), undefined);
  client.isFeatureOn = () => true;
  client.variationDetail = () => ({ variation: 'A', reason: 'EXPERIMENT_DRAFT' });
  assert.equal(await delivery.decideNaverCta(signal), undefined);
});

test('cancelled CTA lookup never evaluates or exposes the experiment after initialization', async () => {
  global.window = { location: { pathname: '/' } }; let release; let allocations = 0;
  const client = { onInitialized: () => new Promise(r => release = r), isFeatureOn: () => { allocations++; return true; } };
  const { createAnalyticsDelivery } = load('../src/shared/platform/analytics-delivery.ts', { createInstance: () => client });
  const delivery = createAnalyticsDelivery({ sdkKey: 'test', deviceId: 'device' });
  delivery.setIdentity('member');
  const abort = new AbortController(); const decision = delivery.decideNaverCta(abort.signal);
  await new Promise(r => setImmediate(r)); abort.abort(); release();
  assert.equal(await decision, undefined); assert.equal(allocations, 0);
});

function load(relative, sdk) {
  const filename = path.resolve(__dirname, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = new Module(filename);
  module.paths = module.constructor._nodeModulePaths(path.dirname(filename));
  const original = module.require.bind(module);
  module.require = name => name === '@hackler/javascript-sdk' ? sdk : original(name);
  module._compile(code, filename);
  return module.exports;
}
function browser() {
  const ga = [], scripts = [];
  global.window = { location: { pathname: '/home', search: '?private=hidden' }, gtag: (...args) => ga.push(args) };
  global.document = { querySelector: () => scripts[0], createElement: () => ({ dataset: {} }), head: { appendChild: e => scripts.push(e) } };
  return { ga, scripts };
}
test('partner/general and booking method survive payload mapping without guessing unknown status', () => {
  const { eventPayload } = load('../src/contexts/analytics/infrastructure/event-payload.ts');
  assert.deepEqual(eventPayload({ event: 'reserve_click', shopId: 's', isPartner: false, route: 'naver' }),
    { shop_id: 's', route: 'naver', reservation_method: 'naver', shop_type: 'general', is_partner: 0 });
  assert.equal(eventPayload({ event: 'reserve_click', isPartner: true }).shop_type, 'partner');
  assert.equal(eventPayload({ event: 'shop_view' }).shop_type, undefined);
});
test('one GA event, clean GTM payload, and identity captured before asynchronous Hackle initialization', async () => {
  const { ga } = browser(); const calls = []; let release;
  const client = { onInitialized: () => new Promise(r => release = r), track: (...a) => calls.push(a) };
  const { createAnalyticsDelivery } = load('../src/shared/platform/analytics-delivery.ts', { createInstance: () => client });
  const delivery = createAnalyticsDelivery({ sdkKey: 'test', deviceId: 'device' });
  delivery.setIdentity('user-a');
  delivery.send('reserve_click', { shop_type: 'partner', reservation_method: 'naver', search_term: 'private', email: 'private' });
  delivery.setIdentity(null);
  delivery.send('shop_view', { shop_type: 'general' });
  await new Promise(r => setImmediate(r)); release(); await new Promise(r => setImmediate(r));
  assert.equal(ga.length, 2); assert.equal(calls.length, 2);
  assert.equal(calls[0][1].userId, 'user-a'); assert.equal(calls[1][1].userId, undefined);
  assert.equal(calls[0][1].deviceId, 'device');
  assert.equal(ga[0][2].search_term, undefined); assert.equal(ga[0][2].email, undefined);
  assert.equal(ga[0][2].page_path, '/home');
  assert.notEqual(ga[0][2].event_id, ga[1][2].event_id);
  assert.equal(window.dataLayer.filter(e => e.event === 'syak_event').length, 2);
});
test('GTM transport loads one container and never sends a duplicate direct GA event', () => {
  const { ga, scripts } = browser();
  const { createAnalyticsDelivery } = load('../src/shared/platform/analytics-delivery.ts');
  const delivery = createAnalyticsDelivery({ gtmId: 'GTM-TEST123', transport: 'gtm' });
  delivery.send('reserve_click', { shop_type: 'partner' }); delivery.send('shop_view', {});
  assert.equal(ga.length, 0); assert.equal(scripts.length, 1);
  assert.ok(window.dataLayer.some(e => e.event === 'syak_event' && e.analytics_transport === 'gtm'));
});
test('Hackle unavailable does not break GA and server rendering sends nothing', async () => {
  const { ga } = browser();
  const { createAnalyticsDelivery } = load('../src/shared/platform/analytics-delivery.ts', { createInstance: () => { throw Error('offline'); } });
  const delivery = createAnalyticsDelivery({ sdkKey: 'test' });
  assert.doesNotThrow(() => delivery.send('reserve_click', {}));
  await new Promise(r => setImmediate(r)); assert.equal(ga.length, 1);
  delete global.window; assert.doesNotThrow(() => delivery.send('shop_view', {}));
});

test('generic interaction coverage avoids text and values; scrolling deduplicates per route', () => {
  browser(); const listeners = {}; const events = [];
  class Element {
    constructor() { this.tagName = 'BUTTON'; this.innerText = 'private customer text'; this.scrollHeight = 1000; this.clientHeight = 100; this.scrollTop = 850; }
    closest() { return this; }
    getAttribute() { return null; }
  }
  global.Element = Element;
  const control = new Element();
  document.querySelectorAll = () => [control];
  document.addEventListener = (name, fn) => { listeners[name] = fn; };
  document.removeEventListener = name => { delete listeners[name]; };
  window.addEventListener = () => {}; window.removeEventListener = () => {};
  const { installInteractionTracking } = load('../src/shared/platform/analytics-delivery.ts');
  const stop = installInteractionTracking((...args) => events.push(args));
  listeners.click({ target: control, isTrusted: false }); assert.equal(events.length, 0);
  listeners.click({ target: control, isTrusted: true });
  assert.equal(events[0][0], 'ui_interaction'); assert.equal(JSON.stringify(events).includes('private'), false);
  listeners.scroll({ target: control }); assert.equal(events.length, 5);
  listeners.scroll({ target: control }); assert.equal(events.length, 5);
  window.location.pathname = '/my'; listeners.scroll({ target: control }); assert.equal(events.length, 9);
  stop(); assert.equal(listeners.click, undefined); delete global.Element;
});

test('SEO hub and geographic HTML have executable analytics bootstrap and queue the landing once', async () => {
  const apiPath = path.resolve(__dirname, '../api/seo.js');
  const { default: handler } = await import(pathToFileURL(apiPath).href);
  const { slugFor } = await import(pathToFileURL(path.resolve(__dirname, '../api/_romanize.js')).href);
  const regions = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../api/regions.json'), 'utf8'));
  const cat = Object.keys(regions.categories)[0];
  const gu = Object.keys(regions.categories[cat].data)[0];
  for (const query of [{ cat }, { cat, gu: slugFor(gu) }]) {
    let html;
    const res = { statusCode: 0, setHeader() {}, end(value) { html = value; } };
    handler({ query }, res); assert.equal(res.statusCode, 200);
    assert.ok(html.includes('/assets/analytics.js'));
    const bootstrap = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).find(code => code.includes('window.syakQueue'));
    const context = {}; context.window = context;
    new vm.Script(bootstrap).runInNewContext(context);
    assert.equal(context.syakQueue.length, 1);
    assert.equal(context.syakQueue[0][0], 'seo_landing');
  }
});
