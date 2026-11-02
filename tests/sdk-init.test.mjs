import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPublishedConfig } from '../packages/tracking-core/src/index.ts';
import { TrackingSdk } from '../packages/tracking-sdk/src/index.ts';

function published(siteId, common, conversions = []) {
  return projectPublishedConfig({ siteId, version: 0, common, conversions }, siteId, 1, '2026-11-02T00:00:00Z');
}
const gtm = { id: 'gtm-common', provider: 'gtm', enabled: true, trackingId: 'GTM-DEMO123' };
const ads = { id: 'ads-common', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' };
const gtmEvent = { id: 'gtm-lead', provider: 'gtm', enabled: true, event: 'consultation_complete', eventName: 'lead_complete' };
const adsEvent = { id: 'ads-lead', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/DEMO_LABEL' };

async function withBrowser(fetchImpl, run) {
  const original = { window: globalThis.window, history: globalThis.history,
    sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const listeners = new Map();
  const window = { location: { href: 'https://landing.example/', pathname: '/', search: '' },
    setTimeout, clearTimeout,
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); } };
  const history = { pushState() {}, replaceState() {} };
  const stored = new Map();
  Object.assign(globalThis, { window, history,
    sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    fetch: fetchImpl });
  try { await run({ window, history, listeners, stored }); }
  finally { Object.assign(globalThis, original); }
}

test('invalid siteId stops before fetch or adapter initialization', async () => {
  let calls = 0;
  await withBrowser(async () => { calls++; throw new Error('unexpected fetch'); }, async () => {
    const errors = [];
    const sdk = new TrackingSdk({ siteId: 'BAD/ID', configUrl: 'https://landing.example/tracking-config',
      adapters: { gtm: { load() { calls++; }, convert() {} } }, hasConsent: () => true, onError: error => errors.push(error.message) });
    await sdk.start();
    assert.equal(calls, 0);
    assert.deepEqual(errors, ['Invalid siteId']);
    sdk.destroy();
  });
});

test('404 and malformed published JSON do not retry or initialize tags', async () => {
  for (const [siteId, response] of [
    ['missing-config', { ok: false, status: 404 }],
    ['invalid-config', { ok: true, json: async () => ({ siteId: 'wrong-site' }) }],
  ]) {
    let fetches = 0;
    let loads = 0;
    await withBrowser(async () => { fetches++; return response; }, async () => {
      const errors = [];
      const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
        adapters: { gtm: { load() { loads++; }, convert() {} } }, onError: error => errors.push(error.message) });
      await sdk.start();
      assert.equal(fetches, 1);
      assert.equal(loads, 0);
      assert.equal(errors.length, 1);
      sdk.destroy();
    });
  }
});

test('offline fetch retries twice and a later start can recover', async () => {
  let online = false;
  let fetches = 0;
  let loads = 0;
  const siteId = 'offline-demo';
  await withBrowser(async url => {
    fetches++;
    assert.equal(new URL(url).searchParams.get('siteId'), siteId);
    if (!online) throw new Error('offline');
    return { ok: true, json: async () => published(siteId, [gtm]) };
  }, async () => {
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      adapters: { gtm: { load() { loads++; }, convert() {} } } });
    await sdk.start();
    assert.equal(fetches, 2);
    assert.equal(loads, 0);
    online = true;
    await sdk.start();
    assert.equal(fetches, 3);
    assert.equal(loads, 1);
    sdk.destroy();
  });
});

test('unresponsive fetch and response body both finish within two hard timeouts', async () => {
  for (const mode of ['fetch', 'body']) {
    let attempts = 0;
    const signals = [];
    await withBrowser(async (_url, options) => {
      attempts++;
      signals.push(options.signal);
      if (mode === 'fetch') return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    }, async () => {
      const errors = [];
      const sdk = new TrackingSdk({ siteId: `slow-${mode}`, configUrl: '/tracking-config', timeoutMs: 15,
        hasConsent: () => true, adapters: {}, onError: error => errors.push(error.message) });
      const start = Date.now();
      await sdk.start();
      assert.equal(attempts, 2);
      assert.equal(signals.every(signal => signal.aborted), true);
      assert.equal(Date.now() - start < 1000, true);
      assert.deepEqual(errors, ['Published config timed out']);
      sdk.destroy();
    });
  }
});

test('duplicate SDK instances share one fetch, adapter load, route owner and conversion', async () => {
  const siteId = 'duplicate-demo';
  let fetches = 0;
  let loads = 0;
  let conversions = 0;
  let finishFetch;
  await withBrowser(() => { fetches++; return new Promise(resolve => { finishFetch = resolve; }); }, async ({ history }) => {
    const originalPush = history.pushState;
    const adapter = { load() { loads++; }, convert() { conversions++; } };
    const options = { siteId, configUrl: '/tracking-config', hasConsent: () => true, adapters: { gtm: adapter } };
    const first = new TrackingSdk(options);
    const second = new TrackingSdk(options);
    const pending = Promise.all([first.start(), second.start()]);
    assert.equal(fetches, 1);
    finishFetch({ ok: true, json: async () => published(siteId, [gtm], [gtmEvent]) });
    await pending;
    assert.equal(loads, 1);
    assert.notStrictEqual(history.pushState, originalPush);
    await Promise.all([first.track('consultation_complete', { eventId: 'one' }), second.track('consultation_complete', { eventId: 'one' })]);
    assert.equal(conversions, 1);
    second.destroy();
    assert.notStrictEqual(history.pushState, originalPush);
    first.destroy();
    assert.strictEqual(history.pushState, originalPush);
  });
});

test('consent gate and failed adapters prevent conversion while other active tags load', async () => {
  const siteId = 'consent-demo';
  let consent = false;
  let fetches = 0;
  let gtmLoads = 0;
  let adsLoads = 0;
  let gtmConversions = 0;
  let adsConversions = 0;
  await withBrowser(async () => { fetches++; return { ok: true, json: async () => published(siteId,
    [gtm, ads, { id: 'disabled', provider: 'karrot', enabled: false, trackingId: 'KARROTDEMO123' }],
    [gtmEvent, adsEvent]) }; }, async () => {
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => consent,
      adapters: {
        gtm: { load() { gtmLoads++; throw new Error('blocked tag'); }, convert() { gtmConversions++; } },
        googleAds: { load() { adsLoads++; }, convert() { adsConversions++; } },
        karrot: { load() { throw new Error('disabled tag loaded'); }, convert() {} },
      },
      onError() { throw new Error('diagnostics crashed'); },
    });
    await sdk.start();
    assert.equal(gtmLoads, 0);
    consent = true;
    await sdk.start();
    assert.equal(fetches, 2);
    assert.equal(gtmLoads, 1);
    assert.equal(adsLoads, 1);
    await sdk.track('consultation_complete', { eventId: 'submission' });
    assert.equal(gtmConversions, 0);
    assert.equal(adsConversions, 1);
    sdk.destroy();
  });
});
