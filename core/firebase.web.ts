import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { FIREBASE_CONFIG } from '../config';

let app;
let auth;
let db;
let storage;

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

// Persist Firestore data in IndexedDB so runsheets/clients viewed while online
// stay readable offline, and writes (e.g. marking jobs complete in the field)
// are journaled locally and synced when connectivity returns.
// SSR/static export has no IndexedDB, so fall back to the default in-memory cache.
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('Persistent Firestore cache unavailable; using in-memory cache.', e);
    db = getFirestore(app);
  }
} else {
  db = getFirestore(app);
}
storage = getStorage(app);

export { app, auth, db, storage };
