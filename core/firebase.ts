import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Get the config from the `extra` field of app.config.js
const firebaseConfig = Constants.expoConfig?.extra?.firebase;

let app;

// Check if the config was loaded
if (!firebaseConfig?.apiKey) {
  throw new Error('Firebase config not found in app.config.js. Check your setup.');
}

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

