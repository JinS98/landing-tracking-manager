import assert from 'node:assert/strict';
import { test } from 'node:test';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  throw new Error('Run this test against the local Firestore emulator with npm run test:rules');
}

const base = `http://${host}/v1/projects/demo-landing-tracking-manager/databases/(default)/documents`;
const collections = ['companies', 'sites', 'trackingConfigs', 'trackingReleases', 'auditLogs', 'importJobs'];
const body = JSON.stringify({ fields: { name: { stringValue: 'demo-only' } } });

async function expectDenied(label, url, options) {
  const response = await fetch(url, options);
  assert.equal(response.status, 403, `${label}: expected 403, received ${response.status}: ${await response.text()}`);
}

for (const collection of collections) {
  test(`anonymous Firestore access is denied for ${collection}`, async () => {
    const document = `${base}/${collection}/blocked`;
    await expectDenied('document read', document);
    await expectDenied('collection list', `${base}/${collection}`);
    await expectDenied('create', `${base}/${collection}?documentId=blocked`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    });
    await expectDenied('update', document, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    });
    await expectDenied('delete', document, { method: 'DELETE' });
  });
}

test('anonymous access is denied for future nested paths', async () => {
  await expectDenied('nested read', `${base}/sites/blocked/internal/private`);
  await expectDenied('nested create', `${base}/sites/blocked/internal?documentId=private`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  });
});
