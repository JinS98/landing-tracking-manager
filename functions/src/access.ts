/** Server-only access boundary. This module does not expose an HTTP handler. */
export type GatewayRequest = {
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  // Server transport metadata, never copied from a client-supplied header.
  transport: { peerAddress: string; tlsClientIdentity?: string };
};

export type Operator = {
  subject: string;
  gateway: string;
  sessionId: string;
  expiresAtEpochMs: number;
};

export type AdminAction =
  | 'readCompanies' | 'readSites' | 'getDraft' | 'readHistory' | 'registerCompany' | 'importSites'
  | 'registerSite' | 'saveDraft' | 'publish' | 'rollback';
export type AdminResource = { siteId?: string; companyId?: string };

export class AdminAccessError extends Error {
  readonly status: 400 | 401 | 403 | 405 | 409 | 503;
  constructor(status: 400 | 401 | 403 | 405 | 409 | 503, message: string) {
    super(message);
    this.status = status;
    this.name = 'AdminAccessError';
  }
}

/** Must verify the gateway assertion and trusted ingress; raw identity headers are not proof. */
export interface AccessVerifier {
  verify(request: GatewayRequest): Promise<Operator>;
}

/** Must validate a session-bound token and origin for state-changing browser requests. */
export interface CsrfVerifier {
  assertValid(request: GatewayRequest, operator: Operator): Promise<void>;
}

/** Must check the action and resource scope using the verified operator only. */
export interface AdminAuthorizer {
  assertAllowed(operator: Operator, action: AdminAction, resource: AdminResource): Promise<void>;
}

export type AdminAccessDependencies = {
  verifier: AccessVerifier;
  csrf: CsrfVerifier;
  authorizer: AdminAuthorizer;
};

const methods: Record<AdminAction, 'GET' | 'POST' | 'PUT'> = {
  readCompanies: 'GET', readSites: 'GET', getDraft: 'GET', readHistory: 'GET',
  registerCompany: 'POST',
  importSites: 'POST',
  registerSite: 'POST', saveDraft: 'PUT', publish: 'POST', rollback: 'POST',
};
const siteScoped = new Set<AdminAction>(['getDraft', 'readHistory', 'registerSite', 'saveDraft', 'publish', 'rollback']);

/** Action/resource must come from server routing, never from a caller-supplied role or action field.
 * Rejects incomplete integration; verifier/CSRF/authorizer implementations are not shipped. */
export async function requireAdminAccess(
  dependencies: Partial<AdminAccessDependencies> | undefined,
  request: GatewayRequest,
  action: AdminAction,
  resource: AdminResource = {},
): Promise<Operator> {
  if (!dependencies?.verifier || !dependencies.csrf || !dependencies.authorizer) {
    throw new AdminAccessError(503, 'Admin access is not configured');
  }
  if (request.method.toUpperCase() !== methods[action]) {
    throw new AdminAccessError(405, 'Method is not allowed for this admin action');
  }
  if (siteScoped.has(action) && !resource.siteId?.trim()) {
    throw new AdminAccessError(400, 'siteId is required');
  }
  if (action === 'registerSite' && !resource.companyId?.trim()) {
    throw new AdminAccessError(400, 'companyId is required');
  }

  let operator: Operator;
  try {
    operator = await dependencies.verifier.verify(request);
  } catch (error) {
    if (error instanceof AdminAccessError) throw error;
    throw new AdminAccessError(503, 'Gateway verification is unavailable');
  }
  if (!operator || !operator.subject?.trim() || !operator.gateway?.trim() ||
      !operator.sessionId?.trim() || !Number.isSafeInteger(operator.expiresAtEpochMs) ||
      operator.expiresAtEpochMs <= Date.now()) {
    throw new AdminAccessError(401, 'Operator session is invalid or expired');
  }

  try {
    if (methods[action] !== 'GET') await dependencies.csrf.assertValid(request, operator);
    await dependencies.authorizer.assertAllowed(operator, action, resource);
  } catch (error) {
    if (error instanceof AdminAccessError) throw error;
    throw new AdminAccessError(503, 'Admin access check is unavailable');
  }
  return operator;
}
