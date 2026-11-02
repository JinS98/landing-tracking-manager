import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../apps/admin/src/lib/demoData.ts';
import { editScript, publishDraft, registerSite } from '../apps/admin/src/lib/demoWorkspace.ts';

const siteId = 'editor-demo';
const common = (id, provider, trackingId, extra = {}) => ({ id, provider, trackingId, enabled: true, ...extra });
const conversion = (id, provider, extra) => ({ id, provider, enabled: true, event: 'consultation_complete', ...extra });
const config = state => state.drafts.find(item => item.siteId === siteId);
const fresh = () => registerSite(structuredClone(initialWorkspace),
  { id: siteId, companyId: 'sample-coffee', domain: 'editor.example' });

test('six providers can be added and published with their distinct common and conversion fields', () => {
  let state = fresh();
  const commonTags = [
    common('gtm-c', 'gtm', 'GTM-DEMO123'),
    common('ads-c', 'googleAds', 'AW-123456789'),
    common('naver-c', 'naverWcs', 'NAVER123', { inflowDomain: 'editor.example' }),
    common('karrot-c', 'karrot', 'KARROT123'),
    common('meta-c', 'meta', '123456789012345'),
    common('tiktok-c', 'tiktok', 'TIKTOK123'),
  ];
  const events = [
    conversion('gtm-e', 'gtm', { eventName: 'lead_complete' }),
    conversion('ads-e', 'googleAds', { sendTo: 'AW-123456789/DEMO_LABEL' }),
    conversion('naver-e', 'naverWcs', { conversionType: 'lead' }),
    conversion('karrot-e', 'karrot', { eventName: 'SubmitApplication' }),
    conversion('meta-e', 'meta', { eventName: 'Lead' }),
    conversion('tiktok-e', 'tiktok', { eventName: 'SubmitForm' }),
  ];
  for (const item of commonTags) state = editScript(state, siteId, { kind: 'common', action: 'add', item });
  for (const item of events) state = editScript(state, siteId, { kind: 'conversion', action: 'add', item });
  assert.equal(config(state).version, 12);
  assert.equal(state.audit.filter(entry => entry.siteId === siteId && entry.action === 'draft').length, 12);
  assert.match(state.audit[0].summary, /전환 이벤트 추가/);
  const release = publishDraft(state, siteId, 12).releases[0].publicConfig;
  assert.equal(release.common.length, 6);
  assert.equal(release.conversions.length, 6);
  assert.deepEqual(release.conversions.map(item => item.provider), events.map(item => item.provider));
});

test('conversion without active common and invalid AW or Naver fields fail without changing draft or audit', () => {
  const state = fresh();
  const before = structuredClone(state);
  assert.throws(() => editScript(state, siteId, { kind: 'conversion', action: 'add',
    item: conversion('ads-e', 'googleAds', { sendTo: 'AW-123456789/DEMO_LABEL' }) }), /활성 공통/);
  assert.throws(() => editScript(state, siteId, { kind: 'common', action: 'add',
    item: common('ads-c', 'googleAds', 'AW-BAD') }), /AW ID/);
  assert.throws(() => editScript(state, siteId, { kind: 'common', action: 'add',
    item: common('naver-c', 'naverWcs', 'NAVER123') }), /유입 도메인/);
  assert.deepEqual(state, before);

  const withAds = editScript(state, siteId, { kind: 'common', action: 'add',
    item: common('ads-c', 'googleAds', 'AW-123456789') });
  assert.throws(() => editScript(withAds, siteId, { kind: 'conversion', action: 'add',
    item: conversion('ads-e', 'googleAds', { sendTo: 'AW-987654321/DEMO_LABEL' }) }), /AW ID가 공통 설정과/);
  assert.equal(config(withAds).version, 1);
  assert.equal(withAds.audit.filter(entry => entry.action === 'draft').length, 1);
});

test('update, toggle and remove retain a valid draft and describe each change in audit', () => {
  let state = fresh();
  state = editScript(state, siteId, { kind: 'common', action: 'add',
    item: common('ads-c', 'googleAds', 'AW-123456789') });
  state = editScript(state, siteId, { kind: 'conversion', action: 'add',
    item: conversion('ads-e', 'googleAds', { sendTo: 'AW-123456789/DEMO_LABEL' }) });
  state = editScript(state, siteId, { kind: 'conversion', action: 'update',
    item: conversion('ads-e', 'googleAds', { sendTo: 'AW-123456789/NEW_LABEL' }) });
  assert.equal(config(state).conversions[0].sendTo, 'AW-123456789/NEW_LABEL');
  assert.throws(() => editScript(state, siteId, { kind: 'common', action: 'update',
    item: common('ads-c', 'meta', '123456789') }), /매체가 다릅니다/);

  state = editScript(state, siteId, { kind: 'common', action: 'toggle', id: 'ads-c' });
  assert.equal(config(state).common[0].enabled, false);
  assert.equal(config(state).conversions[0].enabled, false);
  state = editScript(state, siteId, { kind: 'common', action: 'toggle', id: 'ads-c' });
  assert.equal(config(state).common[0].enabled, true);
  assert.equal(config(state).conversions[0].enabled, false);
  state = editScript(state, siteId, { kind: 'conversion', action: 'toggle', id: 'ads-e' });
  assert.equal(config(state).conversions[0].enabled, true);
  state = editScript(state, siteId, { kind: 'common', action: 'remove', id: 'ads-c' });
  assert.equal(config(state).common.length, 0);
  assert.equal(config(state).conversions[0].enabled, false);
  assert.throws(() => editScript(state, siteId, { kind: 'conversion', action: 'toggle', id: 'ads-e' }), /활성 공통/);
  state = editScript(state, siteId, { kind: 'conversion', action: 'remove', id: 'ads-e' });
  assert.equal(config(state).conversions.length, 0);
  assert.match(state.audit[0].summary, /전환 이벤트 제거/);
  assert.equal(config(state).version, 8);
});
