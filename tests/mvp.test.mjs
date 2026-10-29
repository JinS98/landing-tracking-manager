import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../apps/admin/src/lib/demoData.ts';
import { publishDraft, registerSite, rollbackRelease, saveDraft } from '../apps/admin/src/lib/demoWorkspace.ts';
import { parsePublishedConfig } from '../packages/tracking-core/src/index.ts';

test('siteId is unique across companies and registration preserves drafts', () => {
  const state = structuredClone(initialWorkspace);
  assert.throws(() => registerSite(state, { id: 'coffee-main', companyId: 'sample-studio', domain: 'another.example' }), /이미 등록된/);
  const next = registerSite(state, { id: 'new-site', companyId: 'sample-coffee', domain: 'new.example' });
  assert.equal(next.sites.filter(site => site.companyId === 'sample-coffee').length, 3);
  assert.deepEqual(next.drafts, state.drafts);
});

test('draft, publish and rollback keep release history immutable', () => {
  const initial = structuredClone(initialWorkspace);
  const first = publishDraft(initial, 'coffee-main');
  const updated = saveDraft(first, { ...first.drafts[0], common: first.drafts[0].common.filter(tag => tag.provider !== 'gtm') });
  const second = publishDraft(updated, 'coffee-main');
  const rolled = rollbackRelease(second, 'coffee-main', 1);
  assert.deepEqual(rolled.releases.map(release => release.version), [3, 2, 1]);
  assert.equal(rolled.releases[0].sourceVersion, 1);
  assert.equal(rolled.releases[1].config.common.length, 1);
  assert.equal(rolled.releases[2].config.common.length, 2);
  assert.equal(rolled.drafts.find(draft => draft.siteId === 'coffee-main').version, 2);
});

test('published parser keeps only supported data and rejects another site', () => {
  const input = {
    schemaVersion: 1, siteId: 'coffee-main', releaseVersion: 1, publishedAt: '2026-10-29T00:00:00Z',
    common: [{ id: 'one', provider: 'gtm', enabled: true, trackingId: 'GTM-DEMO123', script: 'alert(1)' }],
    conversions: [], secret: 'should-not-leak',
  };
  const parsed = parsePublishedConfig(input, 'coffee-main');
  assert.equal('secret' in parsed, false);
  assert.equal('script' in parsed.common[0], false);
  assert.throws(() => parsePublishedConfig(input, 'other-site'), /Invalid published config/);
});
