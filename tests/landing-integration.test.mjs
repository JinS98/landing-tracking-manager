import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { projectPublishedConfig } from '../packages/tracking-core/src/index.ts';

const siteId = 'integration-demo';
const config = projectPublishedConfig({ siteId, version: 1,
  common: [{ id: 'ads-common', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' }],
  conversions: [{ id: 'ads-lead', provider: 'googleAds', enabled: true,
    event: 'consultation_complete', sendTo: 'AW-123456789/DEMO_LABEL' }],
}, siteId, 1, '2026-11-02T00:00:00Z');

async function withLanding(mode, consent, run, { blockTag = false } = {}) {
  const server = await createServer({ root: resolve('.'), server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Vite did not provide a port');
    const base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    let blockedTags = 0;
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/tracking-config?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) }));
    await page.route('https://www.googletagmanager.com/gtag/js?*', route => {
      if (blockTag) { blockedTags++; return route.abort(); }
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.route(`${base}/complete?*`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><script type="module" src="/tests/fixtures/landing.ts"></script></body></html>' }));
    await page.goto(`${base}/tests/fixtures/landing.html?mode=${mode}&consent=${consent ? 'on' : 'off'}`);
    await page.waitForFunction(() => window.landing && window.landing.signals.some(signal => signal.kind === 'ready' || signal.kind === 'consent_blocked'));
    await run(page);
    if (blockTag) assert.ok(blockedTags > 0, 'external tag request should be blocked');
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally { await browser?.close(); await server.close(); }
}

const counts = page => page.evaluate(() => ({
  legacy: window.landing.legacy,
  adsConversions: (window.dataLayer ?? []).filter(entry => Array.from(entry)[0] === 'event' && Array.from(entry)[1] === 'conversion').length,
  adsScripts: document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').length,
  signals: window.landing.signals.map(signal => signal.kind),
}));

test('browser IIFE bundle exposes the SDK and optional adapters', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: resolve('packages/tracking-sdk/dist/landing-tracking-sdk.iife.js') });
    assert.deepEqual(await page.evaluate(() => [
      typeof window.LandingTrackingSdk.TrackingSdk,
      typeof window.LandingTrackingSdk.createGoogleAdsAdapter,
      typeof window.LandingTrackingSdk.createGtmAdapter,
    ]), ['function', 'function', 'function']);
    await page.close();
  } finally { await browser.close(); }
});

test('observation mode keeps inquiry/pageview SDK and old media owner without adding a pixel', async () => {
  await withLanding('observe', true, async page => {
    await page.locator('#failure').click();
    assert.equal(new URL(page.url()).pathname, '/tests/fixtures/landing.html');
    await page.locator('#success').click();
    const result = await counts(page);
    assert.equal(result.legacy.pageviews, 1);
    assert.equal(result.legacy.inquiries, 1);
    assert.equal(result.legacy.mediaConversions, 1);
    assert.equal(result.adsConversions, 0);
    assert.equal(result.adsScripts, 0);
  });
});

test('single SDK owner converts once after success and avoids back/revisit duplicates', async () => {
  await withLanding('owned', true, async page => {
    await page.locator('#success').click();
    await page.waitForFunction(() => (window.dataLayer ?? []).some(entry => Array.from(entry)[1] === 'conversion'));
    const complete = page.url();
    assert.equal((await counts(page)).adsConversions, 1);
    await page.goBack();
    await page.goForward();
    assert.equal((await counts(page)).adsConversions, 1);
    await page.goto(complete);
    await page.waitForFunction(() => window.landing?.signals.some(signal => signal.kind === 'ready'));
    assert.equal((await counts(page)).adsConversions, 0);
  });
});

test('consent denial prevents tag load and conversion while the inquiry flow continues', async () => {
  await withLanding('owned', false, async page => {
    await page.locator('#success').click();
    const result = await counts(page);
    assert.equal(result.legacy.inquiries, 1);
    assert.equal(result.adsScripts, 0);
    assert.equal(result.adsConversions, 0);
    assert.ok(result.signals.includes('consent_blocked'));
  });
});

test('blocked external tag does not hold the completion navigation, but delivery is unverified', async () => {
  await withLanding('owned', true, async page => {
    const started = Date.now();
    await page.locator('#success').click();
    assert.equal(new URL(page.url()).pathname, '/complete');
    assert.ok(Date.now() - started < 3000);
    assert.equal((await counts(page)).legacy.inquiries, 1);
  }, { blockTag: true });
});

test('enabling old and new owner together creates two local conversion attempts', async () => {
  await withLanding('both', true, async page => {
    await page.locator('#success').click();
    await page.waitForFunction(() => (window.dataLayer ?? []).some(entry => Array.from(entry)[1] === 'conversion'));
    const result = await counts(page);
    assert.equal(result.legacy.mediaConversions + result.adsConversions, 2);
  });
});
