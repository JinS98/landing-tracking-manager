import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('apps/admin/public/sdk', { recursive: true });
await copyFile('packages/tracking-sdk/dist/landing-tracking-sdk.iife.js',
  'apps/admin/public/sdk/landing-tracking-sdk.iife.js');
