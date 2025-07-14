import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../config';

let app;
let auth;
let db;

// Validate that all expected keys are present so the build fails fast with a clear error.
const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

const missingKeys = requiredKeys.filter((key) => !(FIREBASE_CONFIG as any)[key]);

if (missingKeys.length) {
  throw new Error(
    `Firebase config is missing the following keys: ${missingKeys.join(', ')}. ` +
      'Check your EXPO_PUBLIC_FIREBASE_* environment variables.'
  );
}

if (!getApps().length) {
  app = initializeApp(FIREBASE_CONFIG);
} else {
  app = getApp();
}

auth = getAuth(app);
db = getFirestore(app);

export { app, auth, db };
