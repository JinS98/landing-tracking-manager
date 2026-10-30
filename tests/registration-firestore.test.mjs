import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DeploymentAccessError, RegistrationError, registerSiteFromDeployment, registerSiteInFirestore } from '../functions/src/registerSite.ts';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  throw new Error('Run only against the local demo emulator with npm run test:registration');
}
const app = initializeApp({ projectId: 'demo-landing-tracking-manager' }, 'registration-tests');
const db = getFirestore(app);
const principal = { subject: 'deployment-demo', audience: 'landing-register', expiresAtEpochMs: Date.now() + 60_000 };
const input = { siteId: 'first-site', companyId: 'sample-company', domain: 'landing.example', environment: 'staging' };
after(async () => { await deleteApp(app); });

test('new registration is atomic and a retry preserves the existing draft', async () => {
  await db.collection('companies').doc(input.companyId).set({ name: 'Sample Company', status: 'active' });
  assert.equal((await registerSiteInFirestore(db, input, principal)).status, 'created');
  const site = await db.collection('sites').doc(input.siteId).get();
  assert.equal(site.data().companyId, input.companyId);
  assert.equal(site.data().status, 'pending');
  const configRef = db.collection('trackingConfigs').doc(input.siteId);
  await configRef.update({ draftVersion: 7, 'draft.version': 7 });
  assert.equal((await registerSiteInFirestore(db, { ...input, domain: 'LANDING.EXAMPLE' }, principal)).status, 'existing');
  assert.equal((await configRef.get()).data().draftVersion, 7);
  assert.equal((await db.collection('auditLogs').where('siteId', '==', input.siteId).get()).size, 1);
});

test('same siteId with another company, domain, or environment returns conflict', async () => {
  await db.collection('companies').doc('other-company').set({ name: 'Other Company', status: 'active' });
  for (const changed of [
    { ...input, companyId: 'other-company' },
    { ...input, domain: 'other.example' },
    { ...input, environment: 'production' },
  ]) {
    await assert.rejects(registerSiteInFirestore(db, changed, principal), error => error instanceof RegistrationError && error.status === 409);
  }
  assert.equal((await db.collection('trackingConfigs').doc(input.siteId).get()).data().draftVersion, 7);
});

test('missing company and orphan config never create a site', async () => {
  await assert.rejects(registerSiteInFirestore(db, { ...input, siteId: 'missing-company', companyId: 'missing-company' }, principal),
    error => error instanceof RegistrationError && error.status === 404);
  await db.collection('trackingConfigs').doc('orphan-site').set({ draftVersion: 9 });
  await assert.rejects(registerSiteInFirestore(db, { ...input, siteId: 'orphan-site' }, principal),
    error => error instanceof RegistrationError && error.status === 409);
  assert.equal((await db.collection('sites').doc('orphan-site').get()).exists, false);
});

test('concurrent duplicate registration creates one site and one audit entry', async () => {
  const concurrent = { ...input, siteId: 'concurrent-site' };
  const results = await Promise.all([
    registerSiteInFirestore(db, concurrent, principal), registerSiteInFirestore(db, concurrent, principal),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), ['created', 'existing']);
  assert.equal((await db.collection('auditLogs').where('siteId', '==', concurrent.siteId).get()).size, 1);
});

test('invalid input or missing deployment principal is rejected before any write', async () => {
  await assert.rejects(registerSiteInFirestore(db, { ...input, siteId: 'BAD' }, principal),
    error => error instanceof RegistrationError && error.status === 400);
  await assert.rejects(registerSiteInFirestore(db, { ...input, siteId: 'invalid-principal' }, { ...principal, subject: '' }),
    error => error instanceof RegistrationError && error.status === 400);
  assert.equal((await db.collection('sites').doc('invalid-principal').get()).exists, false);
});

test('deployment entry point rejects missing, invalid, or expired credentials', async () => {
  const request = {
    method: 'POST', path: '/internal/sites/register', headers: { cookie: 'staff-session=demo' },
    transport: { peerAddress: '127.0.0.1' },
  };
  const newInput = { ...input, siteId: 'entry-point-site' };
  await assert.rejects(registerSiteFromDeployment(db, newInput, request, undefined),
    error => error instanceof DeploymentAccessError && error.status === 503);
  await assert.rejects(registerSiteFromDeployment(db, newInput, request, {
    verify: async () => { throw new DeploymentAccessError(401, 'No service token'); },
  }), error => error instanceof DeploymentAccessError && error.status === 401);
  await assert.rejects(registerSiteFromDeployment(db, newInput, request, {
    verify: async () => ({ ...principal, expiresAtEpochMs: Date.now() - 1_000 }),
  }), error => error instanceof DeploymentAccessError && error.status === 401);
  assert.equal((await db.collection('sites').doc(newInput.siteId).get()).exists, false);
  const validRequest = { ...request, headers: { authorization: 'Bearer test-only' } };
  assert.equal((await registerSiteFromDeployment(db, newInput, validRequest, { verify: async () => principal })).status, 'created');
});
