import Constants from 'expo-constants';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import { FIREBASE_CONFIG } from '../config';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

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

// Initialize Firebase app
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Firebase Auth for React Native before calling getAuth
// This registers the 'auth' component in RN and prevents "Component auth has not been registered yet"
if (Platform.OS !== 'web') {
  try {
    initializeAuth(app);
  } catch (_) {
    // ignore if already initialized
  }
}

// Initialize Firebase services
auth = getAuth(app);
db = getFirestore(app);

export { app, auth, db };

