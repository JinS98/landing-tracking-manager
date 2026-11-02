import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { firestorePublicConfigStore } from '../functions/src/publicConfig.ts';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  throw new Error('Run only against the local demo emulator with npm run test:public-config');
}
const app = initializeApp({ projectId: 'demo-landing-tracking-manager' }, 'public-config-tests');
const db = getFirestore(app);
const store = firestorePublicConfigStore(db);
after(async () => { await deleteApp(app); });

test('Firestore reader follows the published pointer and never reads the draft as a release', async () => {
  const siteId = 'public-demo';
  const draft = { siteId, version: 1, common: [
    { id: 'ads', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' },
  ], conversions: [] };
  await db.collection('sites').doc(siteId).set({ domain: 'public.example', companyId: 'secret-company' });
  await db.collection('trackingConfigs').doc(siteId).set({ draft: { secret: 'private' }, publishedVersion: 0 });
  assert.equal(await store.read(siteId), null);

  const publishedAt = Timestamp.fromDate(new Date('2026-11-02T00:00:00Z'));
  await db.collection('trackingReleases').doc(`${siteId}__v1`).set({ siteId, version: 1, config: draft,
    publishedAt, actorRef: 'private-operator' });
  await db.collection('trackingConfigs').doc(siteId).update({ publishedVersion: 1 });
  assert.deepEqual(await store.read(siteId), { config: draft, releaseVersion: 1,
    publishedAt: '2026-11-02T00:00:00.000Z', domain: 'public.example' });

  await db.collection('trackingConfigs').doc(siteId).update({ publishedVersion: 2 });
  await assert.rejects(store.read(siteId), /Published release is missing/);
  assert.equal(await store.read('missing-public-site'), null);
});
