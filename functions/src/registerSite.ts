import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type SiteRegistration = {
  siteId: string;
  companyId: string;
  domain: string;
  environment: 'staging' | 'production';
};
export type RegistrationOutcome = SiteRegistration & { status: 'created' | 'existing' };

/** This identity must come from a separately verified deployment credential. */
export type DeploymentPrincipal = {
  subject: string;
  audience: 'landing-register';
  expiresAtEpochMs: number;
};
export type DeploymentRequest = {
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  transport: { peerAddress: string; tlsClientIdentity?: string };
};
/** Must validate a short-lived CI/service credential, its audience, and trusted ingress. */
export interface DeploymentVerifier {
  verify(request: DeploymentRequest): Promise<DeploymentPrincipal>;
}

export class DeploymentAccessError extends Error {
  readonly status: 401 | 405 | 503;
  constructor(status: 401 | 405 | 503, message: string) {
    super(message);
    this.status = status;
    this.name = 'DeploymentAccessError';
  }
}

export class RegistrationError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.status = status;
    this.name = 'RegistrationError';
  }
}

function normalize(raw: unknown): SiteRegistration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RegistrationError(400, 'Invalid registration input');
  const input = raw as Record<string, unknown>;
  const siteId = typeof input.siteId === 'string' ? input.siteId.trim() : '';
  const companyId = typeof input.companyId === 'string' ? input.companyId.trim() : '';
  const domain = typeof input.domain === 'string' ? input.domain.trim().toLowerCase() : '';
  const environment = input.environment;
  if (!siteId || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(siteId)) throw new RegistrationError(400, 'Invalid siteId');
  if (!companyId || !/^[A-Za-z0-9_-]{1,100}$/.test(companyId)) throw new RegistrationError(400, 'Invalid companyId');
  if (!domain || domain.length > 253 || !/\.[a-z]{2,}$/.test(domain) ||
      !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new RegistrationError(400, 'Invalid domain');
  }
  if (environment !== 'staging' && environment !== 'production') throw new RegistrationError(400, 'Invalid environment');
  return { siteId, companyId, domain, environment };
}

/** Server-only Firestore transaction. No HTTP route or credential verifier implementation is shipped. */
export async function registerSiteInFirestore(
  db: Firestore,
  raw: unknown,
  principal: DeploymentPrincipal,
): Promise<RegistrationOutcome> {
  if (typeof principal?.subject !== 'string' || !principal.subject.trim() ||
      principal.audience !== 'landing-register' ||
      !Number.isSafeInteger(principal.expiresAtEpochMs) || principal.expiresAtEpochMs <= Date.now()) {
    throw new RegistrationError(400, 'Verified deployment principal is required');
  }
  const input = normalize(raw);
  const companyRef = db.collection('companies').doc(input.companyId);
  const siteRef = db.collection('sites').doc(input.siteId);
  const configRef = db.collection('trackingConfigs').doc(input.siteId);
  const auditRef = db.collection('auditLogs').doc();

  return db.runTransaction(async transaction => {
    // All reads precede writes. Firestore retries the callback on concurrent edits.
    const [company, site, config] = await Promise.all([
      transaction.get(companyRef), transaction.get(siteRef), transaction.get(configRef),
    ]);
    if (!company.exists) throw new RegistrationError(404, 'Company does not exist');
    if (site.exists) {
      const current = site.data();
      if (current?.companyId !== input.companyId || current?.domain !== input.domain ||
          current?.environment !== input.environment) throw new RegistrationError(409, 'siteId belongs to another registration');
      if (!config.exists) throw new RegistrationError(409, 'Existing site has no tracking config');
      return { ...input, status: 'existing' as const };
    }
    if (config.exists) throw new RegistrationError(409, 'Orphan tracking config exists');

    const now = FieldValue.serverTimestamp();
    transaction.create(siteRef, {
      companyId: input.companyId, domain: input.domain, environment: input.environment,
      status: 'pending', sdkStatus: 'unknown', createdAt: now, updatedAt: now,
    });
    transaction.create(configRef, {
      draft: { siteId: input.siteId, version: 0, common: [], conversions: [] },
      draftVersion: 0, publishedVersion: 0, createdAt: now, updatedAt: now,
      updatedBy: principal.subject,
    });
    transaction.create(auditRef, {
      siteId: input.siteId, action: 'register', actorRef: principal.subject,
      summary: 'Deployment registration', beforeVersion: null, afterVersion: 0,
      createdAt: now,
    });
    return { ...input, status: 'created' as const };
  });
}

/** Server adapter entry point. The verifier implementation and HTTP route are not shipped. */
export async function registerSiteFromDeployment(
  db: Firestore,
  input: unknown,
  request: DeploymentRequest,
  verifier: DeploymentVerifier | undefined,
): Promise<RegistrationOutcome> {
  if (!verifier) throw new DeploymentAccessError(503, 'Deployment verification is not configured');
  if (request.method !== 'POST' || request.path !== '/internal/sites/register') {
    throw new DeploymentAccessError(405, 'Deployment registration method or path is invalid');
  }
  let principal: DeploymentPrincipal;
  try {
    principal = await verifier.verify(request);
  } catch (error) {
    if (error instanceof DeploymentAccessError) throw error;
    throw new DeploymentAccessError(503, 'Deployment verification is unavailable');
  }
  if (!principal || principal.audience !== 'landing-register' ||
      !Number.isSafeInteger(principal.expiresAtEpochMs) || principal.expiresAtEpochMs <= Date.now() ||
      typeof principal.subject !== 'string' || !principal.subject.trim()) {
    throw new DeploymentAccessError(401, 'Deployment credential is invalid or expired');
  }
  return registerSiteInFirestore(db, input, principal);
}
