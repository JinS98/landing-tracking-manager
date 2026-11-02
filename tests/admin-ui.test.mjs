import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

test('admin browser editor adds, edits, toggles, removes and publishes demo scripts', async () => {
  const server = await createServer({
    root: resolve('apps/admin'),
    configFile: resolve('apps/admin/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Vite did not provide a local port');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/sites/coffee-event`);

    await page.getByLabel('추적 ID').fill('AW-BAD');
    await page.getByRole('button', { name: '설정 추가' }).click();
    assert.match(await page.getByRole('alert').innerText(), /AW ID 형식/);
    await page.getByLabel('추적 ID').fill('AW-123456789');
    await page.getByRole('button', { name: '설정 추가' }).click();
    assert.equal(await page.locator('.script-row').count(), 1);

    await page.getByRole('button', { name: /전환 이벤트/ }).click();
    await page.getByLabel('send_to (AW ID/라벨)').fill('AW-123456789/DEMO_LABEL');
    await page.getByRole('button', { name: '설정 추가' }).click();
    assert.match(await page.locator('.script-row').innerText(), /DEMO_LABEL/);
    await page.locator('.script-row').getByRole('button', { name: '수정' }).click();
    await page.getByLabel('send_to (AW ID/라벨)').fill('AW-123456789/NEW_LABEL');
    await page.getByRole('button', { name: '수정 저장' }).click();
    assert.match(await page.locator('.script-row').innerText(), /NEW_LABEL/);

    await page.getByRole('button', { name: /공통 스크립트/ }).click();
    await page.locator('.script-row input[type="checkbox"]').uncheck();
    await page.getByRole('button', { name: /전환 이벤트/ }).click();
    assert.equal(await page.locator('.script-row input[type="checkbox"]').isChecked(), false);
    await page.getByRole('button', { name: /공통 스크립트/ }).click();
    await page.locator('.script-row input[type="checkbox"]').check();
    await page.getByRole('button', { name: /전환 이벤트/ }).click();
    assert.equal(await page.locator('.script-row input[type="checkbox"]').isChecked(), false);
    await page.locator('.script-row input[type="checkbox"]').check();

    await page.getByRole('button', { name: '데모 게시' }).click();
    assert.match(await page.locator('.preview-grid pre').last().innerText(), /NEW_LABEL/);
    await page.getByRole('button', { name: '제거' }).click();
    assert.equal(await page.locator('.script-row').count(), 0);
    await page.getByRole('link', { name: '배포 이력' }).click();
    assert.match(await page.locator('.history-list').innerText(), /전환 이벤트 제거/);
    await page.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
