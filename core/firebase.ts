import Constants from 'expo-constants';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import { FIREBASE_CONFIG } from '../config';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

// Prefer EXPO_PUBLIC_* env vars; fall back to app config extra.firebase; then to FIREBASE_CONFIG
const extraFirebase: Partial<Record<string, string>> =
  ((Constants?.expoConfig as any)?.extra?.firebase as any) || {};

const firebaseConfig = {
  apiKey:             process.env.EXPO_PUBLIC_FIREBASE_API_KEY          || (extraFirebase.apiKey as string)          || FIREBASE_CONFIG.apiKey,
  authDomain:         process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN      || (extraFirebase.authDomain as string)      || FIREBASE_CONFIG.authDomain,
  projectId:          process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID       || (extraFirebase.projectId as string)       || FIREBASE_CONFIG.projectId,
  storageBucket:      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET   || (extraFirebase.storageBucket as string)   || FIREBASE_CONFIG.storageBucket,
  messagingSenderId:  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (extraFirebase.messagingSenderId as string) || FIREBASE_CONFIG.messagingSenderId,
  appId:              process.env.EXPO_PUBLIC_FIREBASE_APP_ID           || (extraFirebase.appId as string)           || FIREBASE_CONFIG.appId,
};

// Debug logging for Firebase config
console.log('Firebase Config Debug:', {
  apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}...` : 'undefined',
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  envApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ? 'set' : 'not set',
  fromExtra: !!extraFirebase && Object.keys(extraFirebase).length > 0,
});

const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key as keyof typeof firebaseConfig]);

if (missingKeys.length) {
  throw new Error(
    `Firebase config is missing the following keys: ${missingKeys.join(', ')}. ` +
      'Check your EXPO_PUBLIC_FIREBASE_* environment variables.'
  );
}

if (Platform.OS !== 'web') {
  // Native (iOS/Android): metro.config.js aliases the firebase/* imports in this
  // file (and everywhere else) to React Native Firebase. The default app is
  // configured from the native google-services.json / GoogleService-Info.plist,
  // auth state persists on-device automatically, and Firestore ships with disk
  // persistence enabled by default — runsheets viewed online stay readable
  // offline and field writes are queued until connectivity returns.
  app = getApp();
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  // Web: firebase JS SDK, initialised from EXPO_PUBLIC_* / extra.firebase config.
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  // Persist Firestore data in IndexedDB so runsheets/clients viewed while
  // online stay readable offline, and writes (e.g. marking jobs complete in the
  // field) are journaled locally and synced when connectivity returns.
  // SSR/static export has no IndexedDB, so it keeps the default cache.
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
}

export { app, auth, db, storage };

