/** Server-only contracts. Implementations must trust a company gateway, never a browser role field. */
export type GatewayRequest = { headers: Readonly<Record<string, string | undefined>> };
export type Operator = { subject: string; gateway: string };
export type AdminAction = 'registerSite' | 'saveDraft' | 'publish' | 'rollback' | 'readHistory';

export interface AccessVerifier {
  verify(request: GatewayRequest): Promise<Operator>;
}

export interface AdminAuthorizer {
  assertAllowed(operator: Operator, action: AdminAction, siteId?: string): Promise<void>;
}

// No HTTP handler is exported until both contracts have real implementations.
