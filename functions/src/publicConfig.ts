import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { Firestore } from 'firebase-admin/firestore';
import { isValidSiteId, projectPublishedConfig, type PublishedConfig } from '@ltm/tracking-core';

export type PublicRelease = {
  config: unknown;
  releaseVersion: number;
  publishedAt: string;
  domain: string;
};
export interface PublicConfigStore {
  read(siteId: string): Promise<PublicRelease | null>;
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid published state');
  return value as Record<string, unknown>;
}

function publishedAtIso(value: unknown): string {
  const date = value instanceof Date ? value : value && typeof value === 'object' && 'toDate' in value &&
    typeof value.toDate === 'function' ? value.toDate() : null;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid release timestamp');
  return date.toISOString();
}

/** Reads only the published pointer and immutable release. No draft or audit data leaves this module. */
export function firestorePublicConfigStore(db: Firestore): PublicConfigStore {
  return {
    read(siteId) {
      const configRef = db.collection('trackingConfigs').doc(siteId);
      const siteRef = db.collection('sites').doc(siteId);
      return db.runTransaction(async transaction => {
        const [configSnapshot, siteSnapshot] = await Promise.all([transaction.get(configRef), transaction.get(siteRef)]);
        if (!configSnapshot.exists || !siteSnapshot.exists) return null;
        const pointer = requiredRecord(configSnapshot.data());
        if (pointer.publishedVersion === 0) return null;
        if (!Number.isSafeInteger(pointer.publishedVersion) || (pointer.publishedVersion as number) < 1) {
          throw new Error('Invalid published version');
        }
        const version = pointer.publishedVersion as number;
        const releaseRef = db.collection('trackingReleases').doc(`${siteId}__v${version}`);
        const releaseSnapshot = await transaction.get(releaseRef);
        if (!releaseSnapshot.exists) throw new Error('Published release is missing');
        const release = requiredRecord(releaseSnapshot.data());
        const site = requiredRecord(siteSnapshot.data());
        if (release.siteId !== siteId || release.version !== version ||
            typeof site.domain !== 'string' || site.domain.length > 253 || !/\.[a-z]{2,}$/.test(site.domain) ||
            !site.domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
          throw new Error('Published release is inconsistent');
        }
        return { config: release.config, releaseVersion: version,
          publishedAt: publishedAtIso(release.publishedAt), domain: site.domain };
      });
    },
  };
}

const cacheControl = 'public, max-age=0, s-maxage=0, must-revalidate';
const noStore = 'no-store';
const jsonType = 'application/json; charset=utf-8';

function respond(response: ServerResponse, status: number, body: string, method: string): void {
  response.statusCode = status;
  response.setHeader('Content-Type', jsonType);
  response.end(method === 'HEAD' ? undefined : body);
}

function ifNoneMatchMatches(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const values = Array.isArray(header) ? header.join(',') : header;
  return values.split(',').some(value => {
    const candidate = value.trim();
    return candidate === '*' || candidate === etag || candidate === `W/${etag}`;
  });
}

/** Standalone public HTTP route. Mount it on a separate server from admin write routes. */
export function createPublicConfigHandler(store: PublicConfigStore) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method?.toUpperCase() ?? '';
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', noStore);
    response.setHeader('Vary', 'Origin');
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/tracking-config') { respond(response, 404, '{"error":"Not found"}', method); return; }
      if (method !== 'GET' && method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        respond(response, 405, '{"error":"Method not allowed"}', method);
        return;
      }
      const ids = url.searchParams.getAll('siteId');
      if (ids.length !== 1 || !isValidSiteId(ids[0]) || Array.from(url.searchParams.keys()).some(key => key !== 'siteId')) {
        respond(response, 400, '{"error":"Invalid siteId"}', method);
        return;
      }
      const release = await store.read(ids[0]);
      if (!release) { respond(response, 404, '{"error":"Not published"}', method); return; }
      const config: PublishedConfig = projectPublishedConfig(release.config, ids[0], release.releaseVersion, release.publishedAt);
      const body = JSON.stringify(config);
      const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
      const origin = request.headers.origin;
      if (typeof origin === 'string' && origin === `https://${release.domain}`) {
        response.setHeader('Access-Control-Allow-Origin', origin);
      }
      response.setHeader('Cache-Control', cacheControl);
      response.setHeader('ETag', etag);
      if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
        response.statusCode = 304;
        response.end();
        return;
      }
      respond(response, 200, body, method);
    } catch {
      response.setHeader('Cache-Control', noStore);
      response.removeHeader('ETag');
      respond(response, 503, '{"error":"Published config unavailable"}', method);
    }
  };
}
