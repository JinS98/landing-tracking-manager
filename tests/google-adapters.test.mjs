import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPublishedConfig } from '../packages/tracking-core/src/index.ts';
import { TrackingSdk, createGtmAdapter, createGoogleAdsAdapter } from '../packages/tracking-sdk/src/index.ts';

function environment() {
  const scripts = [];
  const document = {
    head: { appendChild(script) { scripts.push(script); return script; } },
    createElement() { return { async: false, src: '' }; },
    querySelectorAll() { return scripts; },
  };
  const window = {
    location: { href: 'https://landing.example/', pathname: '/', search: '' },
    setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
  };
  return { window, document, scripts };
}

const gtm = { id: 'gtm-one', provider: 'gtm', enabled: true, trackingId: 'GTM-DEMO123' };
const ads = { id: 'ads-one', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' };
const gtmEvent = { id: 'gtm-lead', provider: 'gtm', enabled: true, event: 'consultation_complete', eventName: 'lead_complete' };
const adsEvent = { id: 'ads-lead', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/DEMO_LABEL' };

test('GTM preserves an existing dataLayer and inserts its container only once', () => {
  const env = environment();
  const prior = { event: 'prior_event' };
  const layer = [prior];
  env.window.dataLayer = layer;
  const adapter = createGtmAdapter(env);
  adapter.load(gtm); adapter.load(gtm); adapter.convert(gtmEvent);
  assert.strictEqual(env.window.dataLayer, layer);
  assert.equal(env.scripts.length, 1);
  assert.equal(new URL(env.scripts[0].src).searchParams.get('id'), gtm.trackingId);
  assert.deepEqual(layer[0], prior);
  assert.equal(layer.filter(item => item.event === 'gtm.js').length, 1);
  assert.equal(layer.filter(item => item.event === 'lead_complete').length, 1);
});

test('Google Ads queues js/config and conversion without replacing dataLayer', () => {
  const env = environment();
  env.window.dataLayer = [{ event: 'prior_event' }];
  const original = env.window.dataLayer;
  const adapter = createGoogleAdsAdapter(env);
  adapter.load(ads); adapter.load(ads); adapter.convert(adsEvent);
  assert.strictEqual(env.window.dataLayer, original);
  assert.equal(env.scripts.length, 1);
  assert.equal(new URL(env.scripts[0].src).pathname, '/gtag/js');
  const commands = original.slice(1).map(item => Array.from(item));
  assert.equal(commands.filter(item => item[0] === 'js').length, 1);
  assert.deepEqual(commands.filter(item => item[0] === 'config').map(item => item[1]), ['AW-123456789']);
  assert.deepEqual(commands.at(-1), ['event', 'conversion', { send_to: adsEvent.sendTo }]);
});

test('existing scripts and globals are reused; malformed globals fail without overwrite', () => {
  const env = environment();
  const calls = [];
  const existingGtag = (...args) => calls.push(args);
  env.window.gtag = existingGtag;
  env.window.dataLayer = [];
  env.scripts.push({ src: 'https://www.googletagmanager.com/gtag/js?id=AW-123456789' });
  const adapter = createGoogleAdsAdapter(env);
  adapter.load(ads); adapter.convert(adsEvent);
  assert.strictEqual(env.window.gtag, existingGtag);
  assert.equal(env.scripts.length, 1);
  assert.deepEqual(calls, [['event', 'conversion', { send_to: adsEvent.sendTo }]]);

  const sharedTag = environment();
  const sharedCalls = [];
  sharedTag.window.dataLayer = [];
  sharedTag.window.gtag = (...args) => sharedCalls.push(args);
  sharedTag.scripts.push({ src: 'https://www.googletagmanager.com/gtag/js?id=GT-EXISTING' });
  createGoogleAdsAdapter(sharedTag).load(ads);
  assert.equal(sharedTag.scripts.length, 1);
  assert.deepEqual(sharedCalls, [['config', ads.trackingId]]);

  const broken = environment();
  broken.window.dataLayer = { unexpected: true };
  assert.throws(() => createGtmAdapter(broken).load(gtm), /dataLayer/);
  assert.deepEqual(broken.window.dataLayer, { unexpected: true });
  assert.equal(broken.scripts.length, 0);
  broken.window.gtag = 'invalid';
  assert.throws(() => createGoogleAdsAdapter(broken).load(ads), /dataLayer|gtag/);
  assert.equal(broken.scripts.length, 0);
});

test('GTM and Ads coexist on one dataLayer; SDK dedupes each conversion by eventId', async () => {
  const env = environment();
  const original = { window: globalThis.window, document: globalThis.document, history: globalThis.history,
    sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const stored = new Map();
  const history = { pushState(_state, _unused, path) {
    const url = new URL(path, 'https://landing.example/');
    Object.assign(env.window.location, { href: url.href, pathname: url.pathname, search: url.search });
  }, replaceState() {} };
  const published = projectPublishedConfig({ siteId: 'google-demo', version: 0, common: [gtm, ads], conversions: [gtmEvent, adsEvent] },
    'google-demo', 1, '2026-11-02T00:00:00Z');
  Object.assign(globalThis, {
    window: env.window, document: env.document, history,
    sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    fetch: async () => ({ ok: true, json: async () => published }),
  });
  try {
    const sdk = new TrackingSdk({ siteId: 'google-demo', configUrl: 'https://landing.example/config', hasConsent: () => true,
      adapters: { gtm: createGtmAdapter(env), googleAds: createGoogleAdsAdapter(env) } });
    await sdk.start(); await sdk.start();
    assert.equal(env.scripts.length, 2);
    const layer = env.window.dataLayer;
    await sdk.track('consultation_complete', { eventId: 'first-submission' });
    await sdk.track('consultation_complete', { eventId: 'first-submission' });
    assert.equal(layer.filter(item => item.event === 'lead_complete').length, 1);
    assert.equal(layer.filter(item => Array.from(item)[0] === 'event').length, 1);
    history.pushState({}, '', '/complete?token=random-google-001');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(layer.filter(item => item.event === 'lead_complete').length, 2);
    assert.equal(layer.filter(item => Array.from(item)[0] === 'event').length, 2);
    history.pushState({}, '', '/complete?token=random-google-001');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(layer.filter(item => item.event === 'lead_complete').length, 2);
    await sdk.track('consultation_complete', { eventId: 'second-submission' });
    assert.equal(layer.filter(item => item.event === 'lead_complete').length, 3);
    assert.equal(layer.filter(item => Array.from(item)[0] === 'event').length, 3);
    sdk.destroy();
  } finally { Object.assign(globalThis, original); }
});
