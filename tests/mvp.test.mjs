import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../apps/admin/src/lib/demoData.ts';
import { searchCompanies } from '../apps/admin/src/lib/companySearch.ts';
import { diffDraftScripts, publishDraft, registerSite, rollbackRelease, saveDraft } from '../apps/admin/src/lib/demoWorkspace.ts';
import { parsePublishedConfig } from '../packages/tracking-core/src/index.ts';

test('siteId is unique across companies and registration preserves drafts', () => {
  const state = structuredClone(initialWorkspace);
  assert.throws(() => registerSite(state, { id: 'coffee-main', companyId: 'sample-studio', domain: 'another.example' }), /이미 등록된/);
  const next = registerSite(state, { id: 'new-site', companyId: 'sample-coffee', domain: 'new.example' });
  assert.equal(next.sites.filter(site => site.companyId === 'sample-coffee').length, 3);
  assert.deepEqual(next.drafts, state.drafts);
});

test('company search selects matching sites and a company keeps multiple demo landings', () => {
  const first = registerSite(structuredClone(initialWorkspace), { id: 'coffee-promo', companyId: 'sample-coffee', domain: 'promo.coffee.example' });
  const state = registerSite(first, { id: 'coffee-sale', companyId: 'sample-coffee', domain: 'sale.coffee.example' });
  assert.equal(searchCompanies(state, '샘플 커피')[0].sites.length, 4);
  assert.deepEqual(searchCompanies(state, 'COFFEE-PROMO')[0].sites.map(site => site.id), ['coffee-promo']);
  assert.deepEqual(searchCompanies(state, 'sale.coffee.example')[0].sites.map(site => site.id), ['coffee-sale']);
  assert.deepEqual(searchCompanies(state, '없는 업체'), []);
});

test('draft, publish and rollback keep release history immutable', () => {
  const initial = structuredClone(initialWorkspace);
  const first = publishDraft(initial, 'coffee-main', 0);
  const updated = saveDraft(first, { ...first.drafts[0], common: first.drafts[0].common.filter(tag => tag.provider !== 'gtm') });
  const second = publishDraft(updated, 'coffee-main', 1);
  const rolled = rollbackRelease(second, 'coffee-main', 1, 2);
  assert.deepEqual(rolled.releases.map(release => release.version), [3, 2, 1]);
  assert.equal(rolled.releases[0].sourceVersion, 1);
  assert.equal(rolled.releases[1].config.common.length, 1);
  assert.equal(rolled.releases[2].config.common.length, 2);
  assert.equal(rolled.drafts.find(draft => draft.siteId === 'coffee-main').version, 2);
});

test('unchanged publish and stale draft or release versions never add a demo release', () => {
  const initial = structuredClone(initialWorkspace);
  assert.throws(() => publishDraft(initial, 'coffee-main', 1), /초안 버전/);
  const first = publishDraft(initial, 'coffee-main', 0);
  assert.throws(() => publishDraft(first, 'coffee-main', 0), /같은 내용/);
  const changed = saveDraft(first, { ...first.drafts[0], common: first.drafts[0].common.filter(tag => tag.provider !== 'gtm') });
  assert.throws(() => publishDraft(changed, 'coffee-main', 0), /초안 버전/);
  const second = publishDraft(changed, 'coffee-main', 1);
  assert.throws(() => rollbackRelease(second, 'coffee-main', 1, 1), /게시 버전/);
  assert.throws(() => rollbackRelease(second, 'coffee-main', 2, 2), /같은 내용/);
  assert.equal(second.releases.length, 2);
  assert.equal(second.audit.filter(entry => entry.action === 'publish').length, 2);
});

test('preview identifies added, updated and removed scripts against the last release', () => {
  const first = publishDraft(structuredClone(initialWorkspace), 'coffee-main', 0);
  const baseline = first.releases[0].config;
  assert.deepEqual(diffDraftScripts(baseline, baseline), []);
  const draft = { ...baseline,
    common: baseline.common.filter(item => item.provider !== 'gtm'),
    conversions: [{ ...baseline.conversions[0], sendTo: 'AW-123456789/UPDATED' },
      { id: 'extra', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/EXTRA' }] };
  assert.deepEqual(diffDraftScripts(draft, baseline).map(item => [item.kind, item.action]),
    [['common', 'remove'], ['conversion', 'update'], ['conversion', 'add']]);
});

test('published parser rejects extra fields and another site', () => {
  const input = {
    schemaVersion: 1, siteId: 'coffee-main', releaseVersion: 1, publishedAt: '2026-10-29T00:00:00Z',
    common: [{ id: 'one', provider: 'gtm', enabled: true, trackingId: 'GTM-DEMO123' }],
    conversions: [],
  };
  const parsed = parsePublishedConfig(input, 'coffee-main');
  assert.equal(parsed.common[0].trackingId, 'GTM-DEMO123');
  assert.throws(() => parsePublishedConfig({ ...input, secret: 'should-not-leak' }, 'coffee-main'), /Invalid published config/);
  assert.throws(() => parsePublishedConfig({ ...input, common: [{ ...input.common[0], script: 'alert(1)' }] }, 'coffee-main'), /허용되지 않은 필드/);
  assert.throws(() => parsePublishedConfig(input, 'other-site'), /Invalid published config/);
});
