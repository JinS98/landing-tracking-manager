import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createPublicConfigHandler, firestorePublicConfigStore } from '../functions/src/publicConfig.ts';

const siteId = 'coffee-main';
const draft = { siteId, version: 1, common: [
  { id: 'ads', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' },
], conversions: [
  { id: 'lead', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/DEMO_LABEL' },
] };

function fakeFirestore() {
  const documents = new Map();
  const db = {
    collection(collection) { return { doc(id) { return { path: `${collection}/${id}` }; } }; },
    runTransaction(callback) { return callback({ get: async ref => {
      const data = documents.get(ref.path);
      return { exists: data !== undefined, data: () => data };
    } }); },
  };
  return { db, documents };
}

async function withServer(store, run) {
  const server = createServer(createPublicConfigHandler(store));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('public HTTP response projects only published fields with site-scoped CORS', async () => {
  const { db, documents } = fakeFirestore();
  documents.set(`sites/${siteId}`, { domain: 'coffee.example', companyId: 'secret-company' });
  documents.set(`trackingConfigs/${siteId}`, { draft: { secret: 'private-draft' }, publishedVersion: 1,
    updatedBy: 'secret-operator' });
  documents.set(`trackingReleases/${siteId}__v1`, { siteId, version: 1, config: draft,
    publishedAt: new Date('2026-11-02T00:00:00Z'), actorRef: 'secret-operator' });
  documents.set('auditLogs/secret', { summary: 'internal' });
  await withServer(firestorePublicConfigStore(db), async base => {
    const response = await fetch(`${base}/tracking-config?siteId=${siteId}`, { headers: { Origin: 'https://coffee.example' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://coffee.example');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=0, must-revalidate');
    assert.match(response.headers.get('etag'), /^"[a-f0-9]{64}"$/);
    const body = await response.text();
    assert.deepEqual(Object.keys(JSON.parse(body)).sort(),
      ['schemaVersion', 'siteId', 'releaseVersion', 'publishedAt', 'common', 'conversions'].sort());
    assert.equal(body.includes('secret'), false);
    const foreign = await fetch(`${base}/tracking-config?siteId=${siteId}`, { headers: { Origin: 'https://other.example' } });
    assert.equal(foreign.status, 200);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    const head = await fetch(`${base}/tracking-config?siteId=${siteId}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
});

test('ETag revalidates and a new published pointer invalidates the old representation immediately', async () => {
  const { db, documents } = fakeFirestore();
  documents.set(`sites/${siteId}`, { domain: 'coffee.example' });
  documents.set(`trackingConfigs/${siteId}`, { publishedVersion: 1 });
  documents.set(`trackingReleases/${siteId}__v1`, { siteId, version: 1, config: draft,
    publishedAt: new Date('2026-11-02T00:00:00Z') });
  await withServer(firestorePublicConfigStore(db), async base => {
    const url = `${base}/tracking-config?siteId=${siteId}`;
    const first = await fetch(url);
    const oldEtag = first.headers.get('etag');
    assert.equal(first.status, 200);
    const unchanged = await fetch(url, { headers: { 'If-None-Match': oldEtag } });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get('etag'), oldEtag);
    assert.equal(unchanged.headers.get('cache-control'), 'public, max-age=0, s-maxage=0, must-revalidate');
    assert.equal(await unchanged.text(), '');
    documents.set(`trackingReleases/${siteId}__v2`, { siteId, version: 2, config: { ...draft, version: 2 },
      publishedAt: new Date('2026-11-03T00:00:00Z') });
    documents.set(`trackingConfigs/${siteId}`, { publishedVersion: 2 });
    const updated = await fetch(url, { headers: { 'If-None-Match': oldEtag } });
    assert.equal(updated.status, 200);
    assert.notEqual(updated.headers.get('etag'), oldEtag);
    assert.equal((await updated.json()).releaseVersion, 2);
  });
});

test('invalid site, unpublished site, method mismatch and inconsistent release fail without data', async () => {
  const { db, documents } = fakeFirestore();
  documents.set(`sites/${siteId}`, { domain: 'coffee.example' });
  documents.set(`trackingConfigs/${siteId}`, { publishedVersion: 0, draft });
  await withServer(firestorePublicConfigStore(db), async base => {
    const route = `${base}/tracking-config`;
    for (const query of ['', '?siteId=BAD', '?siteId=coffee-main&siteId=other', '?siteId=coffee-main&draft=1']) {
      const response = await fetch(route + query);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal((await fetch(`${route}?siteId=${siteId}`)).status, 404);
    const wrongMethod = await fetch(`${route}?siteId=${siteId}`, { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET, HEAD');
    documents.set(`trackingConfigs/${siteId}`, { publishedVersion: 1 });
    const broken = await fetch(`${route}?siteId=${siteId}`);
    assert.equal(broken.status, 503);
    assert.equal(broken.headers.get('cache-control'), 'no-store');
    assert.equal((await broken.text()).includes('draft'), false);
    documents.set(`trackingReleases/${siteId}__v1`, { siteId, version: 1,
      config: { ...draft, privateToken: 'must-not-leak' }, publishedAt: new Date('2026-11-02T00:00:00Z') });
    const privateRelease = await fetch(`${route}?siteId=${siteId}`);
    assert.equal(privateRelease.status, 503);
    assert.equal((await privateRelease.text()).includes('must-not-leak'), false);
  });
});
