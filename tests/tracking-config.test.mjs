import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../apps/admin/src/lib/demoData.ts';
import { publishDraft, saveDraft } from '../apps/admin/src/lib/demoWorkspace.ts';
import { parseDraftConfig, parsePublishedConfig, projectPublishedConfig, providerNames } from '../packages/tracking-core/src/index.ts';

const base = structuredClone(initialWorkspace.drafts[0]);
const publishedAt = '2026-11-02T00:00:00.000Z';

test('six providers share the draft and public DTO contract', () => {
  assert.deepEqual(providerNames, ['gtm', 'googleAds', 'naverWcs', 'karrot', 'meta', 'tiktok']);
  const draft = { siteId: 'coffee-main', version: 0, common: [
    { id: 'gtm', provider: 'gtm', enabled: true, trackingId: 'GTM-DEMO123' },
    { id: 'ads', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' },
    { id: 'naver', provider: 'naverWcs', enabled: true, trackingId: 'naver-demo', inflowDomain: 'landing.example' },
    { id: 'karrot', provider: 'karrot', enabled: true, trackingId: 'karrot-demo' },
    { id: 'meta', provider: 'meta', enabled: true, trackingId: '123456789012345' },
    { id: 'tiktok', provider: 'tiktok', enabled: true, trackingId: 'TIKTOKDEMO123' },
  ], conversions: [
    { id: 'gtm-event', provider: 'gtm', enabled: true, event: 'consultation_complete', eventName: 'lead_complete' },
    { id: 'ads-event', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/DEMO_LABEL' },
    { id: 'naver-event', provider: 'naverWcs', enabled: true, event: 'consultation_complete', conversionType: 'lead' },
    { id: 'karrot-event', provider: 'karrot', enabled: true, event: 'consultation_complete', eventName: 'SubmitApplication' },
    { id: 'meta-event', provider: 'meta', enabled: true, event: 'consultation_complete', eventName: 'Lead' },
    { id: 'tiktok-event', provider: 'tiktok', enabled: true, event: 'consultation_complete', eventName: 'SubmitForm' },
  ] };
  assert.deepEqual(parseDraftConfig(draft, 'coffee-main'), draft);
  const publicConfig = projectPublishedConfig(draft, 'coffee-main', 1, publishedAt);
  assert.deepEqual(parsePublishedConfig(publicConfig, 'coffee-main'), publicConfig);
  assert.deepEqual(Object.keys(publicConfig).sort(), ['schemaVersion', 'siteId', 'releaseVersion', 'publishedAt', 'common', 'conversions'].sort());
});

test('bad AW IDs and send_to labels fail before draft save or publication', () => {
  assert.throws(() => parseDraftConfig({ ...base, common: base.common.map(item => item.provider === 'googleAds' ? { ...item, trackingId: 'AW-invalid' } : item) }, 'coffee-main'), /AW ID/);
  assert.throws(() => parseDraftConfig({ ...base, conversions: [{ ...base.conversions[0], sendTo: 'AW-123456789/' }] }, 'coffee-main'), /send_to 형식/);
  assert.throws(() => parseDraftConfig({ ...base, conversions: [{ ...base.conversions[0], sendTo: 'AW-999/DEMO_LABEL' }] }, 'coffee-main'), /공통 설정과 다릅니다/);
  assert.throws(() => saveDraft(structuredClone(initialWorkspace), { ...base, common: [{ ...base.common[0], trackingId: 'GTM-bad' }, base.common[1]] }), /GTM ID/);
});

test('Naver requires an inflow domain and arbitrary code fields are rejected', () => {
  const naver = { id: 'naver', provider: 'naverWcs', enabled: true, trackingId: 'naver-demo' };
  assert.throws(() => parseDraftConfig({ ...base, common: [...base.common, naver] }, 'coffee-main'), /Naver 유입 도메인/);
  assert.throws(() => parseDraftConfig({ ...base, common: [...base.common, { ...naver, inflowDomain: 'bad..example' }] }, 'coffee-main'), /Naver 유입 도메인/);
  assert.throws(() => parseDraftConfig({ ...base, common: [{ ...base.common[0], script: 'alert(1)' }, base.common[1]] }, 'coffee-main'), /허용되지 않은 필드/);
  assert.throws(() => parseDraftConfig({ ...base, conversions: [{ ...base.conversions[0], html: '<script>' }] }, 'coffee-main'), /허용되지 않은 필드/);
  assert.throws(() => parseDraftConfig({ ...base, script: 'alert(1)' }, 'coffee-main'), /초안 설정/);
});

test('demo release stores a separate validated public DTO', () => {
  const first = publishDraft(structuredClone(initialWorkspace), 'coffee-main', 0);
  const release = first.releases[0];
  assert.equal(release.publicConfig.releaseVersion, release.version);
  assert.equal(release.publicConfig.siteId, release.siteId);
  assert.deepEqual(release.publicConfig.common, release.config.common);
  assert.deepEqual(parsePublishedConfig(release.publicConfig, 'coffee-main'), release.publicConfig);
  assert.throws(() => saveDraft(first, { ...base, siteId: 'unknown-site' }), /존재하지 않는 사이트/);
});
