import type { User } from 'firebase/auth';
import type { DemoWorkspace, ImportJob, TrackingConfig } from '../types/tracking';
import type { ImportPreview } from './demoImport';
import type { AdminGateway } from './adminGateway';

async function api<T>(user: User, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(value.error ?? `요청 실패 (${response.status})`);
  return value as T;
}

export const liveGateway = {
  workspace: (user: User) => api<DemoWorkspace>(user, '/api/workspace'),
  registerCompany: (user: User, id: string, name: string) => api(user, '/api/companies', 'POST', { id, name }),
  registerSite: (user: User, siteId: string, companyId: string, domain: string) =>
    api(user, '/api/sites', 'POST', { siteId, companyId, domain, environment: 'production' }),
  saveDraft: (user: User, config: TrackingConfig) => api(user, `/api/sites/${encodeURIComponent(config.siteId)}/draft`,
    'PUT', { config, expectedVersion: config.version }),
  publish: (user: User, siteId: string, expectedDraftVersion: number) =>
    api(user, `/api/sites/${encodeURIComponent(siteId)}/publish`, 'POST', { expectedDraftVersion }),
  rollback: (user: User, siteId: string, targetVersion: number, expectedPublishedVersion: number) =>
    api(user, `/api/sites/${encodeURIComponent(siteId)}/rollback`, 'POST', { targetVersion, expectedPublishedVersion }),
  importSites: (user: User, jobId: string, fileName: string, preview: ImportPreview) =>
    api<{ job: ImportJob; reused: boolean }>(user, '/api/imports', 'POST', {
      jobId, fileName, rows: preview.rows.map(row => ({ rowNumber: row.rowNumber, ...row.input })),
    }),
} satisfies AdminGateway;
