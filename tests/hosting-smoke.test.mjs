import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.argv[2] ?? process.env.HOSTING_TEST_ORIGIN ?? 'http://127.0.0.1:5000';

test('hosting serves the admin shell, SDK and deep routes without exposing backend assets', async () => {
  const root = await fetch(origin + '/');
  assert.equal(root.status, 200);
  if (origin.startsWith('https://')) {
    assert.match(root.headers.get('cache-control') ?? '', /no-cache/);
    assert.match(root.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  }
  const html = await root.text();
  assert.match(html, /Landing Tracking Manager/);
  const deep = await fetch(origin + '/sites/coffee-main');
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /Landing Tracking Manager/);
  const scriptPath = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(scriptPath, 'built app script should be referenced');
  const script = await fetch(origin + scriptPath);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') ?? '', /javascript/);
  const sdk = await fetch(origin + '/sdk/landing-tracking-sdk.iife.js');
  assert.equal(sdk.status, 200);
  assert.match(sdk.headers.get('content-type') ?? '', /javascript/);
  if (origin.startsWith('https://')) assert.match(script.headers.get('cache-control') ?? '', /immutable/);
  assert.equal((await fetch(origin + '/firebase.json')).headers.get('content-type')?.includes('application/json'), false);
});

test('hosted admin requires sign-in before showing dashboard or site data', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/');
    assert.match(await page.locator('h1').innerText(), /Landing Tracking Manager/);
    await page.goto(origin + '/sites/coffee-main');
    assert.match(await page.locator('h1').innerText(), /Landing Tracking Manager/);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
});
