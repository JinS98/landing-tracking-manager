import { FieldValue, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { diffScriptChanges, isValidSiteId, parseDraftConfig, projectPublishedConfig, type DraftConfig, type PublishedConfig } from '@ltm/tracking-core';
import { requireAdminAccess, type AdminAccessDependencies, type GatewayRequest } from './access.ts';

export class ReleaseWorkflowError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.status = status;
    this.name = 'ReleaseWorkflowError';
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validVersion = (value: unknown, minimum = 0): value is number =>
  Number.isSafeInteger(value) && (value as number) >= minimum;
const sameScripts = (left: DraftConfig, right: DraftConfig): boolean =>
  JSON.stringify({ common: left.common, conversions: left.conversions }) ===
  JSON.stringify({ common: right.common, conversions: right.conversions });

function requireSiteId(siteId: string): void {
  if (!isValidSiteId(siteId)) throw new ReleaseWorkflowError(400, 'Invalid siteId');
}

function configState(value: unknown, siteId: string): { draft: DraftConfig; draftVersion: number; publishedVersion: number } {
  if (!record(value) || !validVersion(value.draftVersion) || !validVersion(value.publishedVersion)) {
    throw new ReleaseWorkflowError(409, 'Tracking config is inconsistent');
  }
  try {
    const draft = parseDraftConfig(value.draft, siteId);
    if (draft.version !== value.draftVersion) throw new Error('Draft version mismatch');
    return { draft, draftVersion: value.draftVersion, publishedVersion: value.publishedVersion };
  } catch { throw new ReleaseWorkflowError(409, 'Tracking config is inconsistent'); }
}

function releaseDraft(value: unknown, siteId: string, version: number): DraftConfig {
  if (!record(value) || value.siteId !== siteId || value.version !== version) {
    throw new ReleaseWorkflowError(409, 'Published release is inconsistent');
  }
  try { return parseDraftConfig(value.config, siteId); }
  catch { throw new ReleaseWorkflowError(409, 'Published release is inconsistent'); }
}

async function readConfig(transaction: Transaction, db: Firestore, siteId: string) {
  const siteRef = db.collection('sites').doc(siteId);
  const configRef = db.collection('trackingConfigs').doc(siteId);
  const [site, config] = await Promise.all([transaction.get(siteRef), transaction.get(configRef)]);
  if (!site.exists || !config.exists) throw new ReleaseWorkflowError(404, 'Site or tracking config does not exist');
  return { configRef, state: configState(config.data(), siteId) };
}

/** Server-only draft write. The caller must supply a server-routed siteId and verified gateway dependencies. */
export async function saveAdminDraft(
  db: Firestore, siteId: string, rawDraft: unknown, expectedVersion: number,
  request: GatewayRequest, dependencies: Partial<AdminAccessDependencies> | undefined,
): Promise<DraftConfig> {
  const operator = await requireAdminAccess(dependencies, request, 'saveDraft', { siteId });
  requireSiteId(siteId);
  if (!validVersion(expectedVersion)) throw new ReleaseWorkflowError(400, 'Invalid expectedVersion');
  let input: DraftConfig;
  try { input = parseDraftConfig(rawDraft, siteId); }
  catch { throw new ReleaseWorkflowError(400, 'Invalid draft config'); }
  if (input.version !== expectedVersion) throw new ReleaseWorkflowError(400, 'Draft version differs from expectedVersion');
  const auditRef = db.collection('auditLogs').doc();
  return db.runTransaction(async transaction => {
    const { configRef, state } = await readConfig(transaction, db, siteId);
    if (state.draftVersion !== expectedVersion) throw new ReleaseWorkflowError(409, 'Draft version changed');
    const next = { ...input, version: expectedVersion + 1 };
    const changes = diffScriptChanges(state.draft, next);
    const now = FieldValue.serverTimestamp();
    transaction.update(configRef, { draft: next, draftVersion: next.version, updatedAt: now, updatedBy: operator.subject });
    transaction.create(auditRef, { siteId, action: 'draft', actorRef: operator.subject,
      summary: `Draft v${next.version} saved`, changes, beforeVersion: expectedVersion, afterVersion: next.version, createdAt: now });
    return next;
  });
}

/** Creates an immutable release and advances the public pointer in one Firestore transaction. */
export async function publishAdminDraft(
  db: Firestore, siteId: string, expectedDraftVersion: number,
  request: GatewayRequest, dependencies: Partial<AdminAccessDependencies> | undefined,
): Promise<PublishedConfig> {
  const operator = await requireAdminAccess(dependencies, request, 'publish', { siteId });
  requireSiteId(siteId);
  if (!validVersion(expectedDraftVersion)) throw new ReleaseWorkflowError(400, 'Invalid expectedVersion');
  const auditRef = db.collection('auditLogs').doc();
  const publishedAt = Timestamp.now();
  return db.runTransaction(async transaction => {
    const { configRef, state } = await readConfig(transaction, db, siteId);
    if (state.draftVersion !== expectedDraftVersion) throw new ReleaseWorkflowError(409, 'Draft version changed');
    if (state.publishedVersion === 0 && state.draft.common.length === 0) {
      throw new ReleaseWorkflowError(409, 'Add a common script before the first publish');
    }
    let previous: DraftConfig | null = null;
    if (state.publishedVersion > 0) {
      const latestRef = db.collection('trackingReleases').doc(`${siteId}__v${state.publishedVersion}`);
      const latest = await transaction.get(latestRef);
      if (!latest.exists) throw new ReleaseWorkflowError(409, 'Published release is missing');
      previous = releaseDraft(latest.data(), siteId, state.publishedVersion);
      if (sameScripts(state.draft, previous)) {
        throw new ReleaseWorkflowError(409, 'Draft matches the published release');
      }
    }
    const version = state.publishedVersion + 1;
    const changes = diffScriptChanges(previous, state.draft);
    const releaseRef = db.collection('trackingReleases').doc(`${siteId}__v${version}`);
    const now = FieldValue.serverTimestamp();
    transaction.create(releaseRef, { siteId, version, config: state.draft, sourceDraftVersion: state.draftVersion,
      publishedAt, actorRef: operator.subject });
    transaction.update(configRef, { publishedVersion: version, updatedAt: now, updatedBy: operator.subject });
    transaction.create(auditRef, { siteId, action: 'publish', actorRef: operator.subject,
      summary: `Release v${version} published`, changes, beforeVersion: state.publishedVersion, afterVersion: version, createdAt: now });
    return projectPublishedConfig(state.draft, siteId, version, publishedAt.toDate().toISOString());
  });
}

/** Restores old content as a new release; prior releases are never modified. */
export async function rollbackAdminRelease(
  db: Firestore, siteId: string, targetVersion: number, expectedPublishedVersion: number,
  request: GatewayRequest, dependencies: Partial<AdminAccessDependencies> | undefined,
): Promise<PublishedConfig> {
  const operator = await requireAdminAccess(dependencies, request, 'rollback', { siteId });
  requireSiteId(siteId);
  if (!validVersion(targetVersion, 1) || !validVersion(expectedPublishedVersion, 1)) {
    throw new ReleaseWorkflowError(400, 'Invalid release version');
  }
  const auditRef = db.collection('auditLogs').doc();
  const publishedAt = Timestamp.now();
  return db.runTransaction(async transaction => {
    const { configRef, state } = await readConfig(transaction, db, siteId);
    if (state.publishedVersion !== expectedPublishedVersion) throw new ReleaseWorkflowError(409, 'Published version changed');
    const latestRef = db.collection('trackingReleases').doc(`${siteId}__v${state.publishedVersion}`);
    const targetRef = db.collection('trackingReleases').doc(`${siteId}__v${targetVersion}`);
    const [latest, target] = await Promise.all([transaction.get(latestRef), transaction.get(targetRef)]);
    if (!target.exists) throw new ReleaseWorkflowError(404, 'Target release does not exist');
    if (!latest.exists) throw new ReleaseWorkflowError(409, 'Published release is missing');
    const previous = releaseDraft(latest.data(), siteId, state.publishedVersion);
    const restored = releaseDraft(target.data(), siteId, targetVersion);
    if (sameScripts(previous, restored)) throw new ReleaseWorkflowError(409, 'Target matches the published release');
    const version = state.publishedVersion + 1;
    const changes = diffScriptChanges(previous, restored);
    const draft = { ...restored, version: state.draftVersion + 1 };
    const releaseRef = db.collection('trackingReleases').doc(`${siteId}__v${version}`);
    const now = FieldValue.serverTimestamp();
    transaction.create(releaseRef, { siteId, version, config: draft, sourceDraftVersion: draft.version, sourceVersion: targetVersion,
      publishedAt, actorRef: operator.subject });
    transaction.update(configRef, { draft, draftVersion: draft.version, publishedVersion: version,
      updatedAt: now, updatedBy: operator.subject });
    transaction.create(auditRef, { siteId, action: 'rollback', actorRef: operator.subject,
      summary: `Release v${targetVersion} restored as v${version}`, beforeVersion: state.publishedVersion,
      afterVersion: version, changes, createdAt: now });
    return projectPublishedConfig(draft, siteId, version, publishedAt.toDate().toISOString());
  });
}
