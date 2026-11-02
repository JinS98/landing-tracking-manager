import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAdminHandler } from '../functions/src/adminServer.ts';
import { AdminAccessError } from '../functions/src/access.ts';
import { createPublicConfigHandler, firestorePublicConfigStore } from '../functions/src/publicConfig.ts';
import { createDiagnosticHandler } from '../functions/src/diagnostics.ts';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('This test requires the Firestore emulator');
}
const app = initializeApp({ projectId: 'demo-landing-tracking-manager' }, 'admin-api-tests');
const db = getFirestore(app);
const deps = {
  verifier: { async verify(request) {
    if (request.headers.authorization !== 'Bearer operator-test') throw new AdminAccessError(401, 'Sign in is required');
    return { subject: 'operator-test', gateway: 'firebase-auth', sessionId: 'test', expiresAtEpochMs: Date.now() + 60_000 };
  } },
  csrf: { async assertValid(request) {
    if (request.headers.origin !== 'https://pixel-manager.web.app') throw new AdminAccessError(403, 'Origin is not allowed');
  } },
  authorizer: { async assertAllowed() {} },
};
const admin = createAdminHandler(db, deps);
const publicConfig = createPublicConfigHandler(firestorePublicConfigStore(db));
const diagnostic = createDiagnosticHandler(db);
const server = createServer(async (request, response) => {
  if (request.url?.startsWith('/tracking-config')) return publicConfig(request, response);
  if (request.url === '/tracking-diagnostic') return diagnostic(request, response);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length) request.body = JSON.parse(Buffer.concat(chunks).toString());
  return admin(request, response);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); await deleteApp(app); });

async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, { method,
    headers: { Authorization: 'Bearer operator-test', Origin: 'https://pixel-manager.web.app',
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}

test('admin HTTP routes persist company, site, draft and release for the public SDK endpoint', async () => {
  assert.equal((await call('/api/workspace', 'GET', undefined, { Authorization: '' })).status, 401);
  assert.equal((await call('/api/companies', 'POST', { id: 'api-co', name: 'API Company' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/companies', 'POST', { id: 'api-co', name: 'API Company' })).status, 201);
  assert.equal((await call('/api/sites', 'POST', { siteId: 'api-site', companyId: 'api-co', domain: 'landing.example', environment: 'production' })).status, 201);
  const imported = await call('/api/imports', 'POST', { jobId: 'a'.repeat(64), fileName: 'sample.xlsx',
    rows: [{ rowNumber: 2, companyId: 'import-co', companyName: 'Imported Company', siteId: 'import-site', domain: 'import.example' }] });
  assert.equal(imported.data.job.createdCount, 1);
  assert.equal((await call('/api/imports', 'POST', { jobId: 'a'.repeat(64), fileName: 'sample.xlsx', rows: [{ rowNumber: 2 }] })).data.reused, true);
  const draft = { siteId: 'api-site', version: 0,
    common: [{ id: 'ads', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' }],
    conversions: [{ id: 'lead', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/LEAD' }] };
  assert.equal((await call('/api/sites/api-site/draft', 'PUT', { config: draft, expectedVersion: 0 })).data.version, 1);
  assert.equal((await call('/api/sites/api-site/publish', 'POST', { expectedDraftVersion: 1 })).data.releaseVersion, 1);
  const workspace = await call('/api/workspace');
  assert.equal(workspace.data.companies.find(item => item.id === 'api-co').name, 'API Company');
  assert.equal(workspace.data.releases.find(item => item.siteId === 'api-site').version, 1);
  const published = await call('/tracking-config?siteId=api-site', 'GET', undefined, { Origin: 'https://landing.example', Authorization: '' });
  assert.equal(published.status, 200);
  assert.equal(published.data.conversions[0].sendTo, 'AW-123456789/LEAD');
  assert.equal(published.headers.get('access-control-allow-origin'), 'https://landing.example');
  const blockedOrigin = await call('/tracking-config?siteId=api-site', 'GET', undefined, { Origin: 'https://evil.example', Authorization: '' });
  assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null);
  const deniedSignal = await call('/tracking-diagnostic', 'POST', { siteId: 'api-site', kind: 'ready', releaseVersion: 1 },
    { Origin: 'https://evil.example', Authorization: '', 'Content-Type': 'text/plain' });
  assert.equal(deniedSignal.status, 403);
  const acceptedSignal = await call('/tracking-diagnostic', 'POST', { siteId: 'api-site', kind: 'ready', releaseVersion: 1 },
    { Origin: 'https://landing.example', Authorization: '', 'Content-Type': 'text/plain' });
  assert.equal(acceptedSignal.status, 202);
  assert.equal((await call('/api/workspace')).data.sites.find(item => item.id === 'api-site').sdkStatus, 'installed');
});
