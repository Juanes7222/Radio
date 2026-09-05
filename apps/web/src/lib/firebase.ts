import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const raw = import.meta.env.VITE_FIREBASE_CONFIG ?? '';

let firebaseConfig: Record<string, string>;
try {
  firebaseConfig = raw ? JSON.parse(raw) : {};
} catch {
  firebaseConfig = {};
}

const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
