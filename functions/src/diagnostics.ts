import type { IncomingMessage, ServerResponse } from 'node:http';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isValidSiteId } from '@ltm/tracking-core';

type Diagnostic = { siteId: string; kind: 'config_loaded' | 'adapter_setup' | 'adapter_failed' | 'consent_blocked' | 'ready' | 'init_failed';
  releaseVersion?: number; provider?: string };
const kinds = new Set(['config_loaded', 'adapter_setup', 'adapter_failed', 'consent_blocked', 'ready', 'init_failed']);

function reply(response: ServerResponse, status: number, message: string) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({ status: message }));
}

export function createDiagnosticHandler(db: Firestore) {
  return async (request: IncomingMessage & { body?: unknown }, response: ServerResponse) => {
    response.setHeader('Vary', 'Origin');
    if (request.method !== 'POST' || request.url !== '/tracking-diagnostic') {
      reply(response, 404, 'not-found'); return;
    }
    try {
      let raw = request.body;
      if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
      if (typeof raw === 'string' && Buffer.byteLength(raw) > 2048) { reply(response, 413, 'too-large'); return; }
      if (typeof raw !== 'string' && (!raw || typeof raw !== 'object')) {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 2048) { reply(response, 413, 'too-large'); return; }
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks).toString('utf8');
      }
      const signal = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Diagnostic;
      if (!signal || !isValidSiteId(signal.siteId) || !kinds.has(signal.kind) ||
          (signal.releaseVersion !== undefined && (!Number.isSafeInteger(signal.releaseVersion) || signal.releaseVersion < 1)) ||
          (signal.provider !== undefined && !['gtm', 'googleAds', 'naverWcs', 'karrot', 'meta', 'tiktok'].includes(signal.provider))) {
        reply(response, 400, 'invalid'); return;
      }
      const ref = db.collection('sites').doc(signal.siteId);
      const site = await ref.get();
      if (!site.exists || request.headers.origin !== `https://${site.get('domain')}`) {
        reply(response, 403, 'forbidden'); return;
      }
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
      const last = site.get('lastDiagnosticAt')?.toDate?.();
      if (!last || Date.now() - last.getTime() >= 60_000 || (signal.kind === 'ready' && site.get('sdkStatus') !== 'installed')) {
        await ref.update({ lastDiagnosticAt: FieldValue.serverTimestamp(), lastDiagnosticKind: signal.kind,
          ...(signal.releaseVersion ? { lastDiagnosticRelease: signal.releaseVersion } : {}),
          ...(signal.kind === 'ready' ? { sdkStatus: 'installed' } : {}) });
      }
      reply(response, 202, 'accepted');
    } catch { reply(response, 400, 'invalid'); }
  };
}
