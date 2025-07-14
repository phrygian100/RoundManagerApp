import { FIREBASE_CONFIG } from '../config';

const firebaseConfig = {
  apiKey:             process.env.EXPO_PUBLIC_FIREBASE_API_KEY          || FIREBASE_CONFIG.apiKey,
  authDomain:         process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN      || FIREBASE_CONFIG.authDomain,
  projectId:          process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID       || FIREBASE_CONFIG.projectId,
  storageBucket:      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET   || FIREBASE_CONFIG.storageBucket,
  messagingSenderId:  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || FIREBASE_CONFIG.messagingSenderId,
  appId:              process.env.EXPO_PUBLIC_FIREBASE_APP_ID           || FIREBASE_CONFIG.appId,
};

if (!firebaseConfig.apiKey) {
  throw new Error('Firebase config is missing. Check config.ts or your env-vars.');
}

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export { app, auth, db };

