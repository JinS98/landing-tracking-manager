import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminAccessError, requireAdminAccess } from '../functions/src/access.ts';

const operator = { subject: 'staff-demo', gateway: 'company-gateway', sessionId: 'session-demo', expiresAtEpochMs: Date.now() + 60_000 };
const writeRequest = {
  method: 'POST', path: '/admin/sites',
  headers: { 'x-operator-id': 'forged-admin', 'x-role': 'admin' },
  transport: { peerAddress: '127.0.0.1' },
};
const resource = { siteId: 'site-demo', companyId: 'company-demo' };

function checks(events, changes = {}) {
  return {
    verifier: { verify: async () => { events.push('verify'); return operator; } },
    csrf: { assertValid: async () => { events.push('csrf'); } },
    authorizer: { assertAllowed: async () => { events.push('authorize'); } },
    ...changes,
  };
}

async function rejectsWithStatus(promise, status) {
  await assert.rejects(promise, error => error instanceof AdminAccessError && error.status === status);
}

test('admin access stays unavailable without every server check', async () => {
  await rejectsWithStatus(requireAdminAccess(undefined, writeRequest, 'registerSite', resource), 503);
  await rejectsWithStatus(requireAdminAccess({ verifier: checks([]).verifier }, writeRequest, 'registerSite', resource), 503);
});

test('a forged browser identity header cannot replace gateway verification', async () => {
  const events = [];
  const dependencies = checks(events, {
    verifier: { verify: async () => { events.push('verify'); throw new AdminAccessError(401, 'Gateway assertion missing'); } },
  });
  await rejectsWithStatus(requireAdminAccess(dependencies, writeRequest, 'registerSite', resource), 401);
  assert.deepEqual(events, ['verify']);
});

test('expired or incomplete verified sessions are rejected before CSRF and authorization', async () => {
  for (const invalidOperator of [
    { ...operator, expiresAtEpochMs: Date.now() - 1_000 },
    { ...operator, subject: '' },
    { ...operator, sessionId: '' },
  ]) {
    const events = [];
    const dependencies = checks(events, { verifier: { verify: async () => { events.push('verify'); return invalidOperator; } } });
    await rejectsWithStatus(requireAdminAccess(dependencies, writeRequest, 'registerSite', resource), 401);
    assert.deepEqual(events, ['verify']);
  }
});

test('write methods require CSRF validation before resource authorization', async () => {
  const events = [];
  const dependencies = checks(events, {
    csrf: { assertValid: async () => { events.push('csrf'); throw new AdminAccessError(403, 'CSRF rejected'); } },
  });
  await rejectsWithStatus(requireAdminAccess(dependencies, writeRequest, 'registerSite', resource), 403);
  assert.deepEqual(events, ['verify', 'csrf']);
});

test('resource scope denial rejects a verified operator', async () => {
  const events = [];
  const dependencies = checks(events, {
    authorizer: { assertAllowed: async () => { events.push('authorize'); throw new AdminAccessError(403, 'Site scope denied'); } },
  });
  await rejectsWithStatus(requireAdminAccess(dependencies, writeRequest, 'registerSite', resource), 403);
  assert.deepEqual(events, ['verify', 'csrf', 'authorize']);
});

test('authorized write runs checks in order; read still requires verification and scope', async () => {
  const writeEvents = [];
  assert.equal(await requireAdminAccess(checks(writeEvents), writeRequest, 'registerSite', resource), operator);
  assert.deepEqual(writeEvents, ['verify', 'csrf', 'authorize']);

  const readEvents = [];
  const readRequest = { ...writeRequest, method: 'GET', path: '/admin/sites/site-demo/history' };
  assert.equal(await requireAdminAccess(checks(readEvents), readRequest, 'readHistory', { siteId: 'site-demo' }), operator);
  assert.deepEqual(readEvents, ['verify', 'authorize']);
});

test('method or resource mismatch is rejected before gateway verification', async () => {
  const events = [];
  const dependencies = checks(events);
  await rejectsWithStatus(requireAdminAccess(dependencies, { ...writeRequest, method: 'GET' }, 'registerSite', resource), 405);
  await rejectsWithStatus(requireAdminAccess(dependencies, writeRequest, 'registerSite', { siteId: 'site-demo' }), 400);
  assert.deepEqual(events, []);
});
