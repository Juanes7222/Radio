import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const raw = import.meta.env.VITE_FIREBASE_CONFIG ?? '';

let firebaseConfig: Record<string, string>;
try {
  console.log('[Firebase] Firebase config loaded from VITE_FIREBASE_CONFIG: ', raw);
  firebaseConfig = raw ? JSON.parse(raw) : {};
  console.log('[Firebase] Firebase config initialized: ', firebaseConfig);
} catch {
  console.warn('[Firebase] VITE_FIREBASE_CONFIG is not valid JSON. Firebase Auth disabled.');
  firebaseConfig = {};
}

const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
