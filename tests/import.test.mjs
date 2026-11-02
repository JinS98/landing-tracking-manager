import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace } from '../apps/admin/src/lib/demoData.ts';
import { applyDemoImport, previewImport, suggestMapping } from '../apps/admin/src/lib/demoImport.ts';

const header = ['companyName', 'domain', 'siteId', 'companyId'];
const mapping = suggestMapping(header);
const sheet = [header,
  ['샘플 커피', 'coffee.example', 'coffee-main', 'sample-coffee'],
  ['샘플 커피', 'new.coffee.example', 'coffee-new', 'sample-coffee'],
  ['새 업체', 'new.example', 'new-main', 'new-company'],
  ['샘플 커피', 'new.coffee.example', 'coffee-new', 'sample-coffee'],
  ['샘플 커피', 'bad domain', 'bad-site', 'sample-coffee'],
  ['샘플 커피', '', 'empty-domain', 'sample-coffee'],
];

test('mapped Excel rows preview existing, new, repeated and invalid registrations', () => {
  assert.deepEqual(mapping, { companyId: 3, companyName: 0, siteId: 2, domain: 1 });
  const preview = previewImport(structuredClone(initialWorkspace), sheet, mapping);
  assert.deepEqual([preview.createdCount, preview.skippedCount, preview.errorCount], [2, 2, 2]);
  assert.deepEqual(preview.rows.map(row => row.status), ['skip', 'create', 'create', 'skip', 'error', 'error']);
  assert.deepEqual(preview.rows.map(row => row.rowNumber), [2, 3, 4, 5, 6, 7]);
});

test('demo import preserves existing draft and reupload is idempotent', () => {
  const original = structuredClone(initialWorkspace);
  const first = applyDemoImport(original, sheet, mapping, 'file-and-mapping-hash', 'sample.xlsx');
  assert.equal(first.reused, false);
  assert.equal(first.job.status, 'partial');
  assert.deepEqual(first.job.errors.map(error => error.rowNumber), [6, 7]);
  assert.equal(first.workspace.sites.length, original.sites.length + 2);
  assert.equal(first.workspace.companies.length, original.companies.length + 1);
  assert.deepEqual(first.workspace.drafts, original.drafts);
  const second = applyDemoImport(first.workspace, sheet, mapping, 'file-and-mapping-hash', 'sample.xlsx');
  assert.equal(second.reused, true);
  assert.strictEqual(second.workspace, first.workspace);
  assert.equal(second.workspace.importJobs.length, 1);
  const anotherJob = applyDemoImport(first.workspace, sheet, mapping, 'another-hash', 'sample.xlsx');
  assert.equal(anotherJob.job.createdCount, 0);
  assert.equal(anotherJob.job.skippedCount, 4);
});

test('conflicting site or company names are errors and duplicate mapping is rejected', () => {
  const conflict = previewImport(structuredClone(initialWorkspace), [header,
    ['다른 업체명', 'coffee.example', 'coffee-main', 'sample-coffee'],
    ['새 업체', 'other.example', 'coffee-main', 'new-company'],
  ], mapping);
  assert.equal(conflict.errorCount, 2);
  assert.throws(() => previewImport(initialWorkspace, sheet, { ...mapping, domain: mapping.siteId }), /서로 다른 열/);
});
