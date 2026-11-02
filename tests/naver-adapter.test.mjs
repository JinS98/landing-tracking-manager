import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPublishedConfig, parseDraftConfig } from '../packages/tracking-core/src/index.ts';
import { TrackingSdk, createNaverWcsAdapter } from '../packages/tracking-sdk/src/index.ts';

const common = { id: 'naver-one', provider: 'naverWcs', enabled: true, trackingId: 's_DEMO123', inflowDomain: 'landing.example' };
const conversion = { id: 'naver-lead', provider: 'naverWcs', enabled: true, event: 'consultation_complete', conversionType: 'lead' };

function environment(hostname = 'landing.example') {
  const scripts = [];
  const calls = [];
  const win = {
    location: { href: `https://${hostname}/`, hostname, pathname: '/', search: '' },
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
  };
  const installWcs = () => {
    win.wcs = { inflow: domain => calls.push(['inflow', domain]), trans: event => calls.push(['trans', event]) };
    win.wcs_do = () => calls.push(['pv']);
  };
  const doc = {
    baseURI: `https://${hostname}/`,
    head: { appendChild(script) {
      scripts.push(script);
      script.isConnected = true;
      queueMicrotask(() => { installWcs(); script.dispatch('load'); });
      return script;
    } },
    createElement() {
      const listeners = {};
      return { async: false, src: '', isConnected: false,
        addEventListener(name, callback) { (listeners[name] ??= []).push(callback); },
        dispatch(name) { for (const callback of listeners[name] ?? []) callback(); } };
    },
    querySelectorAll() { return scripts; },
  };
  return { window: win, document: doc, scripts, calls, installWcs };
}

test('Naver WCS loads once and sends WA, inflow, PV, then trans lead', async () => {
  const env = environment();
  const adapter = createNaverWcsAdapter(env);
  await Promise.all([adapter.load(common), adapter.load(common)]);
  await adapter.convert(conversion);
  assert.equal(env.scripts.length, 1);
  assert.equal(env.scripts[0].src, 'https://wcs.naver.net/wcslog.js');
  assert.equal(env.window.wcs_add.wa, common.trackingId);
  assert.deepEqual(env.calls, [['inflow', 'landing.example'], ['pv'], ['trans', { type: 'lead' }]]);
});

test('domain mismatch blocks script and conversion, including after navigation', async () => {
  const env = environment('other.example');
  const adapter = createNaverWcsAdapter(env);
  assert.throws(() => adapter.load(common), /도메인/);
  assert.equal(env.scripts.length, 0);
  const matching = environment('sub.landing.example');
  const scoped = createNaverWcsAdapter(matching);
  await scoped.load(common);
  matching.window.location.hostname = 'other.example';
  await assert.rejects(scoped.convert(conversion), /도메인/);
  assert.equal(matching.calls.some(call => call[0] === 'trans'), false);
});

test('existing WCS is reused, conflicting WA and legacy conversion are rejected', async () => {
  const existing = environment();
  existing.installWcs();
  existing.scripts.push({ src: 'https://wcs.naver.net/wcslog.js', isConnected: true });
  await createNaverWcsAdapter(existing).load(common);
  assert.equal(existing.scripts.length, 1);
  assert.deepEqual(existing.calls, [['inflow', 'landing.example'], ['pv']]);

  const wrongAccount = environment();
  wrongAccount.window.wcs_add = { wa: 's_OTHER' };
  assert.throws(() => createNaverWcsAdapter(wrongAccount).load(common), /WA ID/);
  assert.equal(wrongAccount.scripts.length, 0);

  const legacy = environment();
  legacy.window._nasa = { cnv: { type: '4' } };
  assert.throws(() => createNaverWcsAdapter(legacy).load(common), /wcs.cnv/);
  assert.equal(legacy.scripts.length, 0);
});

test('purchase is rejected because the current config has no required value', () => {
  assert.throws(() => parseDraftConfig({ siteId: 'naver-demo', version: 0, common: [common],
    conversions: [{ ...conversion, conversionType: 'purchase' }] }, 'naver-demo'), /구매 전환/);
});

test('SDK dedupes completion route revisit and distinct submissions', async () => {
  const env = environment();
  env.window.location.pathname = '/complete';
  env.window.location.search = '?token=first-submission';
  const original = { window: globalThis.window, document: globalThis.document, history: globalThis.history,
    sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const stored = new Map();
  const history = { pushState() {}, replaceState() {} };
  const published = projectPublishedConfig({ siteId: 'naver-demo', version: 0, common: [common], conversions: [conversion] },
    'naver-demo', 1, '2026-11-02T00:00:00Z');
  Object.assign(globalThis, {
    window: env.window, document: env.document, history,
    sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    fetch: async () => ({ ok: true, json: async () => published }),
  });
  try {
    const sdk = new TrackingSdk({ siteId: 'naver-demo', configUrl: 'https://landing.example/config', hasConsent: () => true,
      verifyCompletionToken: async token => ({ eventId: token }),
      adapters: { naverWcs: createNaverWcsAdapter(env) } });
    await sdk.start();
    await new Promise(resolve => setImmediate(resolve));
    await sdk.track('consultation_complete', { eventId: 'first-submission' });
    history.pushState({}, '', '/complete?token=first-submission');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.calls.filter(call => call[0] === 'trans').length, 1);
    await sdk.track('consultation_complete', { eventId: 'second-submission' });
    assert.equal(env.calls.filter(call => call[0] === 'trans').length, 2);
    sdk.destroy();
  } finally { Object.assign(globalThis, original); }
});
