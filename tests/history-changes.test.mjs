import test from 'node:test';
import assert from 'node:assert/strict';
import { diffScriptChanges } from '../packages/tracking-core/src/index.ts';
import { historyItems, matchesHistory } from '../apps/admin/src/lib/historyView.ts';

const common = (trackingId, enabled = true) => ({ id: 'pixel-1', provider: 'meta', enabled, trackingId });
const conversion = (enabled = true) => ({ id: 'lead-1', provider: 'meta', enabled,
  event: 'consultation_complete', eventName: 'Lead' });
const config = (version, commonTags, conversions) => ({ siteId: 'site-a', version, common: commonTags, conversions });

test('script audit distinguishes added, edited, disabled and removed values', () => {
  const first = config(1, [common('123')], [conversion()]);
  assert.deepEqual(diffScriptChanges(null, first).map(change => [change.kind, change.action, change.after]), [
    ['common', 'add', '123 · 활성'], ['conversion', 'add', 'Lead · 활성'],
  ]);
  const next = config(2, [common('456', false)], []);
  assert.deepEqual(diffScriptChanges(first, next).map(change => [change.action, change.before, change.after]), [
    ['update', '123 · 활성', '456 · 비활성'], ['remove', 'Lead · 활성', undefined],
  ]);
  assert.deepEqual(diffScriptChanges(next, { ...next, version: 3 }), []);
});

test('history resolves company and site names and reconstructs older published changes', () => {
  const first = config(1, [common('123')], []);
  const second = config(2, [common('456')], [conversion()]);
  const workspace = {
    companies: [{ id: 'company-a', name: '샘플 업체' }],
    sites: [{ id: 'site-a', companyId: 'company-a', domain: 'landing.example' }],
    drafts: [], imports: [],
    releases: [{ siteId: 'site-a', version: 1, config: first }, { siteId: 'site-a', version: 2, config: second }],
    audit: [{ id: 'old-publish', siteId: 'site-a', action: 'publish', beforeVersion: 1, afterVersion: 2,
      summary: 'Release v2 published', at: '2026-11-03T00:00:00Z' },
    { id: 'old-draft', siteId: 'site-a', action: 'draft', beforeVersion: 1, afterVersion: 2,
      summary: 'Draft v2 saved', at: '2026-11-03T00:00:00Z' }],
  };
  const [publish, draft] = historyItems(workspace);
  assert.deepEqual(publish.changes.map(change => [change.action, change.after]),
    [['update', '456 · 활성'], ['add', 'Lead · 활성']]);
  assert.equal(draft.changes, null);
  for (const query of ['샘플 업체', 'company-a', 'site-a', 'landing.example', 'pixel-1']) {
    assert.equal(matchesHistory(publish, query), true);
  }
  assert.equal(matchesHistory(draft, 'pixel-1'), false);
  assert.equal(matchesHistory(publish, '다른 업체'), false);
});
