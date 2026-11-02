import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDraftConfig, parsePublishedConfig, projectPublishedConfig } from '../packages/tracking-core/src/index.ts';
import { TrackingSdk, createKarrotAdapter, createMetaAdapter, createTikTokAdapter } from '../packages/tracking-sdk/src/index.ts';

const common = {
  karrot: { id: 'karrot-common', provider: 'karrot', enabled: true, trackingId: 'KARROTDEMO123' },
  meta: { id: 'meta-common', provider: 'meta', enabled: true, trackingId: '123456789012345' },
  tiktok: { id: 'tiktok-common', provider: 'tiktok', enabled: true, trackingId: 'TIKTOKDEMO123' },
};
const conversion = {
  karrot: { id: 'karrot-event', provider: 'karrot', enabled: true, event: 'consultation_complete', eventName: 'SubmitApplication' },
  meta: { id: 'meta-event', provider: 'meta', enabled: true, event: 'consultation_complete', eventName: 'Lead' },
  tiktok: { id: 'tiktok-event', provider: 'tiktok', enabled: true, event: 'consultation_complete', eventName: 'SubmitForm' },
};

function environment() {
  const scripts = [];
  const document = { baseURI: 'https://landing.example/',
    head: { appendChild(script) { scripts.push(script); return script; } },
    createElement() { return { async: false, src: '' }; },
    querySelectorAll() { return scripts; },
  };
  const window = { location: { href: 'https://landing.example/', pathname: '/', search: '' },
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} };
  return { window, document, scripts };
}

test('Karrot queues one init and ViewPage, then SubmitApplication', () => {
  const env = environment();
  const adapter = createKarrotAdapter(env);
  adapter.load(common.karrot); adapter.load(common.karrot); adapter.convert(conversion.karrot);
  assert.equal(env.scripts.length, 1);
  assert.equal(env.scripts[0].src, 'https://karrot-pixel.business.daangn.com/karrot-pixel.js');
  assert.deepEqual(env.window.karrotPixel.queue.map(([method, args]) => [method, ...Array.from(args)]),
    [['init', common.karrot.trackingId], ['track', 'ViewPage'], ['track', 'SubmitApplication']]);
});

test('Meta uses the existing fbq queue and pixel-specific Lead event', () => {
  const env = environment();
  const adapter = createMetaAdapter(env);
  adapter.load(common.meta); adapter.load(common.meta); adapter.convert(conversion.meta);
  assert.equal(env.scripts.length, 1);
  assert.equal(env.scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.strictEqual(env.window._fbq, env.window.fbq);
  assert.deepEqual(env.window.fbq.queue, [['init', common.meta.trackingId],
    ['trackSingle', common.meta.trackingId, 'PageView'], ['trackSingle', common.meta.trackingId, 'Lead']]);
});

test('TikTok initializes one instance and targets SubmitForm to its pixel', () => {
  const env = environment();
  const adapter = createTikTokAdapter(env);
  adapter.load(common.tiktok); adapter.load(common.tiktok); adapter.convert(conversion.tiktok);
  assert.equal(env.scripts.length, 1);
  const url = new URL(env.scripts[0].src);
  assert.equal(url.hostname, 'analytics.tiktok.com');
  assert.equal(url.searchParams.get('sdkid'), common.tiktok.trackingId);
  assert.deepEqual(Array.from(env.window.ttq), [['page']]);
  assert.deepEqual(Array.from(env.window.ttq._i[common.tiktok.trackingId]), [['track', 'SubmitForm']]);
});

test('existing globals with matching queued IDs are reused without another script or page event', () => {
  for (const [provider, factory, globalName] of [
    ['karrot', createKarrotAdapter, 'karrotPixel'],
    ['meta', createMetaAdapter, 'fbq'],
    ['tiktok', createTikTokAdapter, 'ttq'],
  ]) {
    const original = environment();
    factory(original).load(common[provider]);
    const existing = environment();
    existing.window[globalName] = original.window[globalName];
    existing.scripts.push(...original.scripts);
    const adapter = factory(existing);
    adapter.load(common[provider]);
    assert.equal(existing.scripts.length, 1);
    adapter.convert(conversion[provider]);
  }
});

test('unknown existing globals, conflicting IDs, and unsupported events fail closed', () => {
  const brokenKarrot = environment();
  brokenKarrot.window.karrotPixel = { init() {}, track() {} };
  assert.throws(() => createKarrotAdapter(brokenKarrot).load(common.karrot), /확인할 수 없습니다/);
  assert.equal(brokenKarrot.scripts.length, 0);
  const brokenMeta = environment();
  brokenMeta.window.fbq = () => {};
  assert.throws(() => createMetaAdapter(brokenMeta).load(common.meta), /확인할 수 없습니다/);
  const brokenTikTok = environment();
  brokenTikTok.window.ttq = [];
  assert.throws(() => createTikTokAdapter(brokenTikTok).load(common.tiktok), /확인할 수 없습니다/);

  for (const [provider, factory] of [['karrot', createKarrotAdapter], ['meta', createMetaAdapter], ['tiktok', createTikTokAdapter]]) {
    const env = environment();
    const adapter = factory(env);
    adapter.load(common[provider]);
    assert.throws(() => adapter.load({ ...common[provider], trackingId: provider === 'meta' ? '999999' : 'OTHERID' }), /초기화/);
    assert.throws(() => adapter.convert({ ...conversion[provider], eventName: 'Purchase' }), /지원하지 않는/);
  }
});

test('orphan scripts and existing queues for another pixel ID are not adopted', () => {
  for (const [provider, factory, globalName] of [
    ['karrot', createKarrotAdapter, 'karrotPixel'],
    ['meta', createMetaAdapter, 'fbq'],
    ['tiktok', createTikTokAdapter, 'ttq'],
  ]) {
    const original = environment();
    factory(original).load(common[provider]);
    const orphan = environment();
    orphan.scripts.push(...original.scripts);
    assert.throws(() => factory(orphan).load(common[provider]), /초기화 상태/);
    assert.equal(orphan.scripts.length, 1);

    const foreign = environment();
    foreign.window[globalName] = original.window[globalName];
    foreign.scripts.push(...original.scripts);
    const otherId = provider === 'meta' ? '999999999' : 'OTHERID123';
    assert.throws(() => factory(foreign).load({ ...common[provider], trackingId: otherId }), /ID를 확인할 수 없습니다|ID가 게시 설정과 다릅니다/);
    assert.equal(foreign.scripts.length, 1);
  }
});

test('draft and published config reject invalid pixel IDs and wrong consultation events', () => {
  const draft = { siteId: 'social-demo', version: 0, common: Object.values(common), conversions: Object.values(conversion) };
  assert.deepEqual(parseDraftConfig(draft, 'social-demo'), draft);
  for (const [provider, trackingId] of [['meta', 'letters'], ['tiktok', 'id-with-dash']]) {
    assert.throws(() => parseDraftConfig({ ...draft, common: draft.common.map(tag => tag.provider === provider ? { ...tag, trackingId } : tag) }, 'social-demo'), /Pixel ID/);
  }
  for (const provider of ['karrot', 'meta', 'tiktok']) {
    assert.throws(() => parseDraftConfig({ ...draft, conversions: draft.conversions.map(tag => tag.provider === provider ? { ...tag, eventName: 'Purchase' } : tag) }, 'social-demo'), /전환 이벤트명/);
  }
  const published = projectPublishedConfig(draft, 'social-demo', 1, '2026-11-02T00:00:00Z');
  assert.throws(() => parsePublishedConfig({ ...published, conversions: published.conversions.map(tag => tag.provider === 'tiktok' ? { ...tag, eventName: 'Lead' } : tag) }, 'social-demo'), /전환 이벤트명/);
});

test('SDK requires consent and dedupes social conversions on completion revisit', async () => {
  const env = environment();
  const original = { window: globalThis.window, document: globalThis.document, history: globalThis.history,
    sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const stored = new Map();
  const history = { pushState() {}, replaceState() {} };
  const published = projectPublishedConfig({ siteId: 'social-demo', version: 0, common: Object.values(common), conversions: Object.values(conversion) },
    'social-demo', 1, '2026-11-02T00:00:00Z');
  Object.assign(globalThis, { window: env.window, document: env.document, history,
    sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    fetch: async () => ({ ok: true, json: async () => published }),
  });
  try {
    let consent = false;
    const adapters = { karrot: createKarrotAdapter(env), meta: createMetaAdapter(env), tiktok: createTikTokAdapter(env) };
    const denied = new TrackingSdk({ siteId: 'social-demo', configUrl: 'https://landing.example/config', adapters, hasConsent: () => consent });
    await denied.start();
    assert.equal(env.scripts.length, 0);
    consent = true;
    const sdk = new TrackingSdk({ siteId: 'social-demo', configUrl: 'https://landing.example/config', adapters, hasConsent: () => consent,
      verifyCompletionToken: async token => ({ eventId: token }) });
    await sdk.start();
    assert.equal(env.scripts.length, 3);
    await sdk.track('consultation_complete', { eventId: 'first-submission' });
    await sdk.track('consultation_complete', { eventId: 'first-submission' });
    env.window.location.pathname = '/complete';
    env.window.location.search = '?token=first-submission';
    history.pushState({}, '', '/complete?token=first-submission');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.window.karrotPixel.queue.filter(item => item[0] === 'track' && item[1][0] === 'SubmitApplication').length, 1);
    assert.equal(env.window.fbq.queue.filter(item => item[2] === 'Lead').length, 1);
    assert.equal(env.window.ttq._i[common.tiktok.trackingId].filter(item => item[1] === 'SubmitForm').length, 1);
    sdk.destroy();
  } finally { Object.assign(globalThis, original); }
});
