import assert from 'node:assert/strict';
import { test } from 'node:test';

const base = 'http://127.0.0.1:5000';

test('Hosting rewrites reach the deployed Functions entry points', async () => {
  const admin = await fetch(base + '/api/workspace');
  assert.ok([401, 503].includes(admin.status));
  assert.match((await admin.json()).error, /Sign in is required|Admin identity is not configured/);

  const config = await fetch(base + '/tracking-config?siteId=unpublished-site');
  assert.equal(config.status, 404);
  assert.equal((await config.json()).error, 'Not published');

  const sdk = await fetch(base + '/sdk/landing-tracking-sdk.iife.js');
  assert.equal(sdk.status, 200);
  assert.match(sdk.headers.get('content-type') ?? '', /javascript/);
});
