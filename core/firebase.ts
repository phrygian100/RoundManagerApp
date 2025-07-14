import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../config';

let app;

// This check prevents the app from crashing during hot-reloading
if (!getApps().length) {
  // Always provide the config object
  app = initializeApp(FIREBASE_CONFIG, 'RoundManagerApp'); 
} else {
  // Get the default app if it already exists
  app = getApp('RoundManagerApp');
}

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

