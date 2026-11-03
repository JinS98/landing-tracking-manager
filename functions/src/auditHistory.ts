import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { isValidSiteId, type ScriptChange } from '@ltm/tracking-core';
import { requireAdminAccess, type AdminAccessDependencies, type GatewayRequest } from './access.ts';

export type AuditRecord = {
  id: string;
  siteId: string;
  action: 'register' | 'draft' | 'publish' | 'rollback';
  actorRef: string;
  beforeVersion: number | null;
  afterVersion: number;
  summary: string;
  changes?: ScriptChange[];
  createdAt: string;
};

/** Returns recent site-scoped audit entries only after the gateway authorizes readHistory. */
export async function listSiteAudit(
  db: Firestore, siteId: string, limit: number, request: GatewayRequest,
  dependencies: Partial<AdminAccessDependencies> | undefined,
): Promise<AuditRecord[]> {
  await requireAdminAccess(dependencies, request, 'readHistory', { siteId });
  if (!isValidSiteId(siteId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid audit query');
  }
  const result = await db.collection('auditLogs').where('siteId', '==', siteId)
    .orderBy('createdAt', 'desc').limit(limit).get();
  return result.docs.map(doc => {
    const value = doc.data();
    if (!['register', 'draft', 'publish', 'rollback'].includes(value.action) ||
        typeof value.actorRef !== 'string' || typeof value.summary !== 'string' ||
        !(value.beforeVersion === null || Number.isSafeInteger(value.beforeVersion)) ||
        !Number.isSafeInteger(value.afterVersion) ||
        !(value.createdAt instanceof Timestamp)) throw new Error('Invalid audit record');
    return { id: doc.id, siteId, action: value.action as AuditRecord['action'],
      actorRef: value.actorRef, beforeVersion: value.beforeVersion,
      afterVersion: value.afterVersion, summary: value.summary,
      ...(Array.isArray(value.changes) ? { changes: value.changes as ScriptChange[] } : {}),
      createdAt: value.createdAt.toDate().toISOString() };
  });
}
