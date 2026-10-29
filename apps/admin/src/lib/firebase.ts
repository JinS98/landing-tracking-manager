import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const demoMode = import.meta.env.VITE_DEMO_MODE !== 'false';
export const firebaseApp: FirebaseApp | null = !demoMode && firebaseConfig.apiKey && firebaseConfig.projectId ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null;
export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;
// Production Firestore CRUD / Auth integration is intentionally NOT implemented in this scaffold.
// Never treat client-side demo state as authorized published tracking config.
