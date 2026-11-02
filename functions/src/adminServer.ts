import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isValidSiteId, projectPublishedConfig } from '@ltm/tracking-core';
import { AdminAccessError, requireAdminAccess, type AdminAccessDependencies, type GatewayRequest } from './access.ts';
import { registerSiteInFirestore } from './registerSite.ts';
import { publishAdminDraft, rollbackAdminRelease, saveAdminDraft } from './releaseWorkflow.ts';

type HttpRequest = IncomingMessage & { body?: unknown; ip?: string };
type JsonRecord = Record<string, unknown>;
const json = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const iso = (value: unknown): string => value && typeof value === 'object' && 'toDate' in value &&
  typeof value.toDate === 'function' ? value.toDate().toISOString() : new Date(0).toISOString();

function send(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(value));
}

function gatewayRequest(request: HttpRequest): GatewayRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
  return { method: request.method ?? '', path: request.url ?? '', headers,
    transport: { peerAddress: request.socket.remoteAddress ?? request.ip ?? '' } };
}

/** A Firebase ID token is verified server side. A signed-in project user is not automatically an administrator. */
export function firebaseAdminAccess(adminEmail: string, allowedOrigin: string): AdminAccessDependencies {
  if (!adminEmail || !allowedOrigin) throw new Error('Admin identity and origin must be configured');
  return {
    verifier: {
      async verify(request) {
        const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '');
        if (!match) throw new AdminAccessError(401, 'Sign in is required');
        try {
          const token = await getAuth().verifyIdToken(match[1], true);
          if (!token.email_verified || token.firebase.sign_in_provider !== 'google.com' ||
              token.email?.toLowerCase() !== adminEmail.toLowerCase()) {
            throw new AdminAccessError(403, 'Account is not an administrator');
          }
          return { subject: token.uid, gateway: 'firebase-auth', sessionId: token.uid,
            expiresAtEpochMs: token.exp * 1000 };
        } catch (error) {
          if (error instanceof AdminAccessError) throw error;
          throw new AdminAccessError(401, 'Session is invalid or expired');
        }
      },
    },
    csrf: {
      async assertValid(request) {
        if (request.headers.origin !== allowedOrigin) throw new AdminAccessError(403, 'Origin is not allowed');
      },
    },
    authorizer: { async assertAllowed() { /* The verifier restricts every route to one account. */ } },
  };
}

async function readWorkspace(db: Firestore) {
  const [companies, sites, configs, releases, audits, imports] = await Promise.all([
    db.collection('companies').get(), db.collection('sites').get(), db.collection('trackingConfigs').get(),
    db.collection('trackingReleases').get(), db.collection('auditLogs').get(), db.collection('importJobs').get(),
  ]);
  return {
    companies: companies.docs.map(doc => ({ id: doc.id, name: doc.get('name'), status: doc.get('status') ?? 'active' })),
    sites: sites.docs.map(doc => ({ id: doc.id, companyId: doc.get('companyId'), domain: doc.get('domain'),
      environment: doc.get('environment'), status: doc.get('status') ?? 'pending', sdkStatus: doc.get('sdkStatus') ?? 'unknown',
      lastDiagnosticAt: doc.get('lastDiagnosticAt') ? iso(doc.get('lastDiagnosticAt')) : undefined,
      lastDiagnosticKind: doc.get('lastDiagnosticKind') })),
    drafts: configs.docs.map(doc => doc.get('draft')).filter(Boolean),
    releases: releases.docs.map(doc => {
      const data = doc.data();
      const publishedAt = iso(data.publishedAt);
      return { id: doc.id, siteId: data.siteId, version: data.version, config: data.config,
        publicConfig: projectPublishedConfig(data.config, data.siteId, data.version, publishedAt),
        publishedAt, ...(data.sourceVersion ? { sourceVersion: data.sourceVersion } : {}) };
    }).sort((a, b) => a.siteId === b.siteId ? b.version - a.version : b.publishedAt.localeCompare(a.publishedAt)),
    audit: audits.docs.map(doc => ({ id: doc.id, siteId: doc.get('siteId') ?? '', companyId: doc.get('companyId'),
      action: doc.get('action'), summary: doc.get('summary'), at: iso(doc.get('createdAt')),
      actorRef: doc.get('actorRef'), beforeVersion: doc.get('beforeVersion'), afterVersion: doc.get('afterVersion') }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    importJobs: imports.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: iso(doc.get('createdAt')) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

async function importSites(db: Firestore, body: JsonRecord, actor: string) {
  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
  const rows = body.rows;
  if (!/^[a-f0-9]{64}$/.test(jobId) || !fileName || fileName.length > 255 ||
      !Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    throw new AdminAccessError(400, 'Invalid import job');
  }
  const jobRef = db.collection('importJobs').doc(jobId);
  const old = await jobRef.get();
  if (old.exists) return { job: { id: jobId, ...old.data(), createdAt: iso(old.get('createdAt')) }, reused: true };
  let createdCount = 0;
  let skippedCount = 0;
  const errors: { rowNumber: number; message: string }[] = [];
  for (const raw of rows) {
    if (!json(raw)) { errors.push({ rowNumber: 0, message: 'Invalid row' }); continue; }
    const rowNumber = Number(raw.rowNumber);
    const companyId = typeof raw.companyId === 'string' ? raw.companyId.trim() : '';
    const companyName = typeof raw.companyName === 'string' ? raw.companyName.trim() : '';
    const siteId = typeof raw.siteId === 'string' ? raw.siteId.trim() : '';
    const domain = typeof raw.domain === 'string' ? raw.domain.trim().toLowerCase() : '';
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 501 ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(companyId) || !companyName || companyName.length > 100 ||
        !isValidSiteId(siteId) || domain.length > 253 || !/\.[a-z]{2,}$/.test(domain) ||
        !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      errors.push({ rowNumber, message: 'Invalid row values' }); continue;
    }
    try {
      const companyRef = db.collection('companies').doc(companyId);
      const siteRef = db.collection('sites').doc(siteId);
      const configRef = db.collection('trackingConfigs').doc(siteId);
      const auditRef = db.collection('auditLogs').doc();
      const outcome = await db.runTransaction(async transaction => {
        const [company, site, config] = await Promise.all([
          transaction.get(companyRef), transaction.get(siteRef), transaction.get(configRef),
        ]);
        if (company.exists && company.get('name') !== companyName) throw new Error('Existing company name differs');
        if (site.exists) {
          if (site.get('companyId') !== companyId || site.get('domain') !== domain || !config.exists) {
            throw new Error('Existing site conflicts with this row');
          }
          return 'skipped' as const;
        }
        if (config.exists) throw new Error('Orphan tracking config exists');
        const now = FieldValue.serverTimestamp();
        if (!company.exists) transaction.create(companyRef, { name: companyName, status: 'active', createdAt: now, updatedAt: now });
        transaction.create(siteRef, { companyId, domain, environment: 'production', status: 'pending', sdkStatus: 'unknown', createdAt: now, updatedAt: now });
        transaction.create(configRef, { draft: { siteId, version: 0, common: [], conversions: [] }, draftVersion: 0,
          publishedVersion: 0, createdAt: now, updatedAt: now, updatedBy: actor });
        transaction.create(auditRef, { siteId, action: 'register', actorRef: actor, summary: `Imported from ${fileName}`,
          beforeVersion: 0, afterVersion: 0, createdAt: now });
        return 'created' as const;
      });
      if (outcome === 'created') createdCount++; else skippedCount++;
    } catch (error) { errors.push({ rowNumber, message: error instanceof Error ? error.message : 'Import failed' }); }
  }
  const job = { fileName, status: errors.length ? 'partial' : 'completed', createdCount, skippedCount,
    errorCount: errors.length, errors, createdAt: FieldValue.serverTimestamp() };
  await jobRef.create(job).catch(async error => { if (error?.code !== 6) throw error; });
  const saved = await jobRef.get();
  return { job: { id: jobId, ...saved.data(), createdAt: iso(saved.get('createdAt')) }, reused: false };
}

async function registerCompany(db: Firestore, body: unknown, actor: string) {
  if (!json(body)) throw new AdminAccessError(400, 'Invalid company');
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !name || name.length > 100) {
    throw new AdminAccessError(400, 'Invalid company ID or name');
  }
  const ref = db.collection('companies').doc(id);
  const auditRef = db.collection('auditLogs').doc(randomUUID());
  await db.runTransaction(async transaction => {
    if ((await transaction.get(ref)).exists) throw new AdminAccessError(409, 'Company ID already exists');
    const now = FieldValue.serverTimestamp();
    transaction.create(ref, { name, status: 'active', createdAt: now, updatedAt: now });
    transaction.create(auditRef, { siteId: '', companyId: id, action: 'registerCompany', actorRef: actor,
      summary: `Company ${name} registered`, createdAt: now });
  });
  return { id, name, status: 'active' };
}

function bodyRecord(request: HttpRequest): JsonRecord {
  if (!json(request.body)) throw new AdminAccessError(400, 'JSON object is required');
  return request.body;
}

export function createAdminHandler(db: Firestore, dependencies: AdminAccessDependencies) {
  return async (request: HttpRequest, response: ServerResponse): Promise<void> => {
    const route = new URL(request.url ?? '/', 'http://localhost').pathname;
    const context = gatewayRequest(request);
    try {
      if (route === '/api/workspace' && request.method === 'GET') {
        await requireAdminAccess(dependencies, context, 'readCompanies');
        send(response, 200, await readWorkspace(db));
        return;
      }
      if (route === '/api/companies' && request.method === 'POST') {
        const operator = await requireAdminAccess(dependencies, context, 'registerCompany');
        send(response, 201, await registerCompany(db, bodyRecord(request), operator.subject));
        return;
      }
      if (route === '/api/imports' && request.method === 'POST') {
        const operator = await requireAdminAccess(dependencies, context, 'importSites');
        send(response, 200, await importSites(db, bodyRecord(request), operator.subject));
        return;
      }
      if (route === '/api/sites' && request.method === 'POST') {
        const body = bodyRecord(request);
        const siteId = typeof body.siteId === 'string' ? body.siteId : '';
        const companyId = typeof body.companyId === 'string' ? body.companyId : '';
        const operator = await requireAdminAccess(dependencies, context, 'registerSite', { siteId, companyId });
        send(response, 201, await registerSiteInFirestore(db, body,
          { subject: operator.subject, audience: 'landing-register', expiresAtEpochMs: operator.expiresAtEpochMs }));
        return;
      }
      const match = /^\/api\/sites\/([^/]+)\/(draft|publish|rollback)$/.exec(route);
      if (match && isValidSiteId(match[1])) {
        const [, siteId, action] = match;
        const body = bodyRecord(request);
        if (action === 'draft') {
          send(response, 200, await saveAdminDraft(db, siteId, body.config, Number(body.expectedVersion), context, dependencies));
        } else if (action === 'publish') {
          send(response, 200, await publishAdminDraft(db, siteId, Number(body.expectedDraftVersion), context, dependencies));
        } else {
          send(response, 200, await rollbackAdminRelease(db, siteId, Number(body.targetVersion),
            Number(body.expectedPublishedVersion), context, dependencies));
        }
        return;
      }
      send(response, 404, { error: 'Not found' });
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error &&
        Number.isInteger(error.status) && Number(error.status) >= 400 && Number(error.status) < 500
        ? Number(error.status) : 503;
      if (status === 503) console.error('Admin API unavailable', error);
      send(response, status, { error: status === 503 ? 'Service unavailable' : (error as Error).message });
    }
  };
}
