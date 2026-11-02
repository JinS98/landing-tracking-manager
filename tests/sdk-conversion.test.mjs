import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../apps/admin/src/lib/demoData.ts';
import { publishDraft, registerSite, saveDraft } from '../apps/admin/src/lib/demoWorkspace.ts';
import { projectPublishedConfig } from '../packages/tracking-core/src/index.ts';
import { TrackingSdk } from '../packages/tracking-sdk/src/index.ts';

const common = { id: 'ads-common', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' };
const conversion = { id: 'ads-lead', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/DEMO_LABEL' };

function published(siteId) {
  return projectPublishedConfig({ siteId, version: 0, common: [common], conversions: [conversion] },
    siteId, 1, '2026-11-02T00:00:00Z');
}

async function withBrowser(siteId, initialPath, run, fetchImpl, stored = new Map()) {
  const previous = { window: globalThis.window, history: globalThis.history,
    sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const listeners = new Map();
  const location = { href: '', pathname: '', search: '' };
  function navigate(path) {
    const url = new URL(path, 'https://landing.example/');
    Object.assign(location, { href: url.href, pathname: url.pathname, search: url.search });
  }
  navigate(initialPath);
  const win = { location, setTimeout, clearTimeout,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); } };
  const history = {
    pushState(_state, _unused, path) { navigate(path); },
    replaceState(_state, _unused, path) { navigate(path); },
  };
  Object.assign(globalThis, { window: win, history,
    sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    fetch: fetchImpl ?? (async () => ({ ok: true, json: async () => published(siteId) })) });
  try { await run({ win, history, listeners, stored, navigate }); }
  finally { Object.assign(globalThis, previous); }
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('a random completion token fires once per session and manual tracking still works', async () => {
  const siteId = 'random-token';
  await withBrowser(siteId, '/complete?token=random-001', async ({ history }) => {
    let converted = 0;
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      adapters: { googleAds: { load() {}, convert() { converted++; } } } });
    await sdk.start();
    await tick();
    assert.equal(converted, 1);
    history.pushState({}, '', '/');
    history.pushState({}, '', '/complete?token=random-001');
    await tick();
    assert.equal(converted, 1);
    await sdk.track('consultation_complete', { eventId: 'server-confirmed-001' });
    assert.equal(converted, 2);
    sdk.destroy();
  });
});

test('verified token works on initial load and push/replace/popstate only once per event ID', async () => {
  const siteId = 'verified-route';
  await withBrowser(siteId, '/complete?token=first', async ({ history, listeners, navigate }) => {
    const events = [];
    const checked = [];
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      verifyCompletionToken: async token => { checked.push(token); return { eventId: `accepted-${token}` }; },
      adapters: { googleAds: { load() {}, convert(tag) { events.push(tag.id); } } } });
    await sdk.start();
    await tick();
    assert.equal(events.length, 1);
    history.pushState({}, '', '/complete?token=first');
    history.replaceState({}, '', '/complete/?token=first');
    navigate('/complete?token=first');
    listeners.get('popstate')();
    await tick();
    assert.equal(events.length, 1);
    history.replaceState({}, '', '/complete?token=second');
    await tick();
    assert.equal(events.length, 2);
    assert.deepEqual(checked, ['first', 'first', 'first', 'first', 'second']);
    sdk.destroy();
  });
});

test('missing, malformed and unverified tokens never call the conversion adapter', async () => {
  const siteId = 'reject-route';
  await withBrowser(siteId, '/complete', async ({ history }) => {
    let checks = 0;
    let converted = 0;
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      verifyCompletionToken: async token => { checks++; return token === 'valid' ? { eventId: 'confirmed' } : null; },
      adapters: { googleAds: { load() {}, convert() { converted++; } } } });
    await sdk.start();
    for (const path of ['/complete?token=', '/complete?token=a&token=b', '/other/complete?token=valid',
      '/complete?token=not%20valid', '/complete?token=unknown']) {
      history.pushState({}, '', path);
    }
    await tick();
    assert.equal(checks, 1);
    assert.equal(converted, 0);
    history.pushState({}, '', '/complete?token=valid');
    await tick();
    assert.equal(converted, 1);
    sdk.destroy();
  });
});

test('an in-flight success call waits for initialization, while stale route checks are discarded', async () => {
  const siteId = 'delayed-success';
  let finishFetch;
  await withBrowser(siteId, '/', async ({ history }) => {
    let converted = 0;
    let finishVerification;
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      verifyCompletionToken: () => new Promise(resolve => { finishVerification = resolve; }),
      adapters: { googleAds: { load() {}, convert() { converted++; } } } });
    const starting = sdk.start();
    const tracking = sdk.track('consultation_complete', { eventId: 'confirmed-before-load' });
    assert.equal(converted, 0);
    finishFetch({ ok: true, json: async () => published(siteId) });
    await Promise.all([starting, tracking]);
    assert.equal(converted, 1);
    history.pushState({}, '', '/complete?token=stale');
    history.pushState({}, '', '/');
    finishVerification({ eventId: 'stale-confirmed' });
    await tick();
    assert.equal(converted, 1);
    sdk.destroy();
  }, () => new Promise(resolve => { finishFetch = resolve; }));
});

test('invalid input, verifier errors and consent failures do not escape into the form flow', async () => {
  const siteId = 'form-errors';
  await withBrowser(siteId, '/', async ({ history }) => {
    let converted = 0;
    let consent = true;
    const errors = [];
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => {
      if (!consent) throw new Error('consent unavailable');
      return true;
    }, verifyCompletionToken: async () => { throw new Error('verification unavailable'); },
    adapters: { googleAds: { load() {}, convert() { converted++; } } },
    onError: error => errors.push(error.message) });
    await sdk.start();
    await sdk.track('consultation_complete', { eventId: 123 });
    await sdk.track('consultation_complete', { eventId: '' });
    consent = false;
    await sdk.track('consultation_complete', { eventId: 'confirmed-but-no-consent' });
    history.pushState({}, '', '/complete?token=valid');
    await tick();
    assert.equal(converted, 0);
    assert.deepEqual(errors, ['consent unavailable', 'verification unavailable']);
    sdk.destroy();
  });
});

test('admin demo draft and publish produce the config loaded by SDK before completion conversion', async () => {
  const siteId = 'day15-site';
  const registered = registerSite(structuredClone(initialWorkspace),
    { id: siteId, companyId: 'sample-coffee', domain: 'day15.example' });
  const drafted = saveDraft(registered, { siteId, version: 0, common: [common], conversions: [conversion] });
  const release = publishDraft(drafted, siteId, 1).releases[0].publicConfig;
  await withBrowser(siteId, '/', async ({ history }) => {
    let loaded = 0;
    let converted = 0;
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      adapters: { googleAds: {
        load(tag) { assert.equal(tag.trackingId, common.trackingId); loaded++; },
        convert(tag) { assert.equal(tag.sendTo, conversion.sendTo); converted++; },
      } } });
    await sdk.start();
    assert.equal(loaded, 1);
    assert.equal(converted, 0);
    history.pushState({}, '', '/complete?token=random-admin-001');
    await tick();
    assert.equal(converted, 1);
    sdk.destroy();
  }, async () => ({ ok: true, json: async () => release }));
});

test('session key survives reload and release changes, while a separate tab has its own session', async () => {
  const siteId = 'session-scope';
  const token = 'random-session-001';
  const stored = new Map();
  let conversions = 0;
  let version = 1;
  const fetchConfig = async () => ({ ok: true, json: async () => ({ ...published(siteId), releaseVersion: version }) });
  const open = async storage => withBrowser(siteId, `/complete?token=${token}`, async () => {
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      adapters: { googleAds: { load() {}, convert() { conversions++; } } } });
    await sdk.start();
    await tick();
    sdk.destroy();
  }, fetchConfig, storage);
  await open(stored);
  assert.equal(conversions, 1);
  version = 2;
  await open(stored);
  assert.equal(conversions, 1);
  await open(new Map());
  assert.equal(conversions, 2);
});

test('blocked loader and failed conversion report errors without retrying the same token', async () => {
  const siteId = 'failed-tags';
  const gtm = { id: 'gtm-common', provider: 'gtm', enabled: true, trackingId: 'GTM-DEMO123' };
  const gtmEvent = { id: 'gtm-lead', provider: 'gtm', enabled: true, event: 'consultation_complete', eventName: 'lead_complete' };
  const config = projectPublishedConfig({ siteId, version: 0, common: [common, gtm],
    conversions: [conversion, gtmEvent] }, siteId, 1, '2026-11-02T00:00:00Z');
  await withBrowser(siteId, '/complete?token=random-failed-001', async ({ history }) => {
    const errors = [];
    let convertCalls = 0;
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      adapters: {
        googleAds: { load() {}, convert() { convertCalls++; throw new Error('conversion blocked'); } },
        gtm: { load() { throw new Error('script blocked'); }, convert() { throw new Error('must not convert'); } },
      }, onError: error => errors.push(error.message) });
    await sdk.start();
    await tick();
    history.pushState({}, '', '/');
    history.pushState({}, '', '/complete?token=random-failed-001');
    await tick();
    assert.equal(convertCalls, 1);
    assert.deepEqual(errors, ['script blocked', 'conversion blocked']);
    sdk.destroy();
  }, async () => ({ ok: true, json: async () => config }));
});

test('storage access failure falls back to tab memory for back-navigation dedupe', async () => {
  const siteId = 'storage-blocked';
  await withBrowser(siteId, '/complete?token=random-storage-001', async ({ history }) => {
    globalThis.sessionStorage = { getItem() { throw new Error('storage blocked'); },
      setItem() { throw new Error('storage blocked'); } };
    let converted = 0;
    const sdk = new TrackingSdk({ siteId, configUrl: '/tracking-config', hasConsent: () => true,
      adapters: { googleAds: { load() {}, convert() { converted++; } } } });
    await sdk.start();
    await tick();
    history.pushState({}, '', '/');
    history.pushState({}, '', '/complete?token=random-storage-001');
    await tick();
    assert.equal(converted, 1);
    sdk.destroy();
  });
});
