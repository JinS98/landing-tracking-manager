import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRegistrationInput, sendRegistration } from '../packages/landing-register/src/index.ts';

const input = { siteId: 'sample-site', companyId: 'sample-company', domain: 'landing.example', environment: 'staging' };

test('CLI input normalizes a domain and rejects invalid site or environment', () => {
  assert.deepEqual(parseRegistrationInput({ ...input, domain: ' LANDING.EXAMPLE ' }), input);
  assert.throws(() => parseRegistrationInput({ ...input, siteId: '../other' }), /Invalid siteId/);
  assert.throws(() => parseRegistrationInput({ ...input, domain: 'https://landing.example' }), /Invalid domain/);
  assert.throws(() => parseRegistrationInput({ ...input, environment: 'demo' }), /Invalid environment/);
});

test('apply requires HTTPS, a deployment credential, and the dedicated path', async () => {
  const fetchImpl = async () => { throw new Error('Request should not run'); };
  await assert.rejects(sendRegistration(input, { apiUrl: 'http://api.example/internal/sites/register', token: 'secret', fetchImpl }), /Invalid registration API URL/);
  await assert.rejects(sendRegistration(input, { apiUrl: 'https://api.example/admin/sites', token: 'secret', fetchImpl }), /Invalid registration API URL/);
  await assert.rejects(sendRegistration(input, { apiUrl: 'https://api.example/internal/sites/register', token: '', fetchImpl }), /Deployment credential is required/);
});

test('registration sends a token only to the configured endpoint and accepts created/existing', async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    assert.equal(url.href, 'https://api.example/internal/sites/register');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.authorization, 'Bearer deployment-secret');
    assert.equal(init.redirect, 'error');
    assert.deepEqual(JSON.parse(init.body), input);
    return new Response(JSON.stringify({ ...input, status: calls === 1 ? 'created' : 'existing' }), { status: calls === 1 ? 201 : 200 });
  };
  const options = { apiUrl: 'https://api.example/internal/sites/register', token: 'deployment-secret', fetchImpl };
  assert.equal((await sendRegistration(input, options)).status, 'created');
  assert.equal((await sendRegistration(input, options)).status, 'existing');
});

test('transient failure retries once; conflict does not retry or expose response text', async () => {
  let calls = 0;
  const options = {
    apiUrl: 'https://api.example/internal/sites/register', token: 'deployment-secret',
    fetchImpl: async () => {
      calls++;
      return calls === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify({ ...input, status: 'existing' }), { status: 200 });
    },
  };
  assert.equal((await sendRegistration(input, options)).status, 'existing');
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(sendRegistration(input, {
    ...options, fetchImpl: async () => { calls++; return new Response('private detail', { status: 409 }); },
  }), error => error.message === 'Registration API returned 409');
  assert.equal(calls, 1);
});
