import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { createAdminHandler, firebaseAdminAccess } from './adminServer.ts';
import { createPublicConfigHandler, firestorePublicConfigStore } from './publicConfig.ts';
import { createDiagnosticHandler } from './diagnostics.ts';

initializeApp();
const db = getFirestore();
const region = 'asia-northeast3';

export const adminApi = onRequest({ region, maxInstances: 3, memory: '256MiB', timeoutSeconds: 300, invoker: 'public' }, (request, response) => {
  const email = process.env.ADMIN_EMAIL ?? '';
  const origin = process.env.ADMIN_ORIGIN ?? 'https://pixel-manager.web.app';
  if (!email) { response.status(503).json({ error: 'Admin identity is not configured' }); return; }
  return createAdminHandler(db, firebaseAdminAccess(email, origin))(request, response);
});

export const trackingConfig = onRequest({ region, maxInstances: 3, memory: '256MiB', invoker: 'public' }, (request, response) =>
  createPublicConfigHandler(firestorePublicConfigStore(db))(request, response));

export const trackingDiagnostic = onRequest({ region, maxInstances: 2, memory: '256MiB', invoker: 'public' }, (request, response) =>
  createDiagnosticHandler(db)(request, response));
