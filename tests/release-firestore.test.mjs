import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AdminAccessError } from '../functions/src/access.ts';
import { registerSiteInFirestore } from '../functions/src/registerSite.ts';
import { firestorePublicConfigStore } from '../functions/src/publicConfig.ts';
import { ReleaseWorkflowError, saveAdminDraft, publishAdminDraft, rollbackAdminRelease } from '../functions/src/releaseWorkflow.ts';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  throw new Error('Run only against the local demo emulator with npm run test:release');
}
const app = initializeApp({ projectId: 'demo-landing-tracking-manager' }, 'release-tests');
const db = getFirestore(app);
const principal = { subject: 'deployment-demo', audience: 'landing-register', expiresAtEpochMs: Date.now() + 300_000 };
const operator = { subject: 'editor-demo', gateway: 'company-gateway', sessionId: 'session-demo', expiresAtEpochMs: Date.now() + 300_000 };
const deps = { verifier: { verify: async () => operator }, csrf: { assertValid: async () => {} },
  authorizer: { assertAllowed: async () => {} } };
const request = method => ({ method, path: '/admin/sites/release-demo', headers: {},
  transport: { peerAddress: '127.0.0.1' } });
const ads = { id: 'ads-common', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' };
const conversion = label => ({ id: 'ads-lead', provider: 'googleAds', enabled: true,
  event: 'consultation_complete', sendTo: `AW-123456789/${label}` });
const draft = (siteId, version, label) => ({ siteId, version, common: [ads], conversions: [conversion(label)] });
const conflict = status => error => error instanceof ReleaseWorkflowError && error.status === status;
after(async () => { await deleteApp(app); });

async function register(siteId) {
  await db.collection('companies').doc('release-company').set({ name: 'Demo Company', status: 'active' });
  await registerSiteInFirestore(db,
    { siteId, companyId: 'release-company', domain: 'release.example', environment: 'staging' }, principal);
}

test('draft, publish and rollback are atomic, versioned and visible through public reader', async () => {
  const siteId = 'release-demo';
  await register(siteId);
  const configRef = db.collection('trackingConfigs').doc(siteId);
  const firstDraft = await saveAdminDraft(db, siteId, draft(siteId, 0, 'FIRST'), 0, request('PUT'), deps);
  assert.equal(firstDraft.version, 1);
  const first = await publishAdminDraft(db, siteId, 1, request('POST'), deps);
  assert.equal(first.releaseVersion, 1);
  assert.equal((await firestorePublicConfigStore(db).read(siteId)).releaseVersion, 1);
  await assert.rejects(publishAdminDraft(db, siteId, 1, request('POST'), deps), conflict(409));
  await assert.rejects(saveAdminDraft(db, siteId, draft(siteId, 0, 'STALE'), 0, request('PUT'), deps), conflict(409));

  await saveAdminDraft(db, siteId, draft(siteId, 1, 'SECOND'), 1, request('PUT'), deps);
  const second = await publishAdminDraft(db, siteId, 2, request('POST'), deps);
  assert.equal(second.releaseVersion, 2);
  await assert.rejects(rollbackAdminRelease(db, siteId, 1, 1, request('POST'), deps), conflict(409));
  const third = await rollbackAdminRelease(db, siteId, 1, 2, request('POST'), deps);
  assert.equal(third.releaseVersion, 3);
  assert.equal(third.conversions[0].sendTo, 'AW-123456789/FIRST');
  assert.equal((await firestorePublicConfigStore(db).read(siteId)).releaseVersion, 3);
  assert.deepEqual((await configRef.get()).data().draftVersion, 3);
  assert.deepEqual((await configRef.get()).data().publishedVersion, 3);
  assert.equal((await db.collection('trackingReleases').doc(`${siteId}__v1`).get()).data().config.conversions[0].sendTo,
    'AW-123456789/FIRST');
  assert.equal((await db.collection('trackingReleases').doc(`${siteId}__v2`).get()).data().config.conversions[0].sendTo,
    'AW-123456789/SECOND');
  assert.equal((await db.collection('trackingReleases').doc(`${siteId}__v3`).get()).data().sourceVersion, 1);
  assert.equal((await db.collection('auditLogs').where('siteId', '==', siteId).get()).size, 6);
  await assert.rejects(publishAdminDraft(db, siteId, 3, request('POST'), deps), conflict(409));
});

test('concurrent writes with the same expectedVersion yield one draft and one conflict', async () => {
  const siteId = 'release-race';
  await register(siteId);
  const results = await Promise.allSettled([
    saveAdminDraft(db, siteId, draft(siteId, 0, 'ONE'), 0, request('PUT'), deps),
    saveAdminDraft(db, siteId, draft(siteId, 0, 'TWO'), 0, request('PUT'), deps),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && conflict(409)(result.reason)).length, 1);
  assert.equal((await db.collection('trackingConfigs').doc(siteId).get()).data().draftVersion, 1);
  assert.equal((await db.collection('auditLogs').where('siteId', '==', siteId).get()).size, 2);
});

test('missing gateway or invalid draft cannot create a release', async () => {
  const siteId = 'release-denied';
  await register(siteId);
  await assert.rejects(saveAdminDraft(db, siteId, draft(siteId, 0, 'FIRST'), 0, request('PUT'), undefined),
    error => error instanceof AdminAccessError && error.status === 503);
  await assert.rejects(saveAdminDraft(db, siteId, { ...draft(siteId, 0, 'FIRST'), script: '<script />' },
    0, request('PUT'), deps), conflict(400));
  await assert.rejects(publishAdminDraft(db, siteId, 1, request('POST'), deps), conflict(409));
  assert.equal((await db.collection('trackingConfigs').doc(siteId).get()).data().publishedVersion, 0);
  assert.equal((await db.collection('trackingReleases').where('siteId', '==', siteId).get()).size, 0);
});
