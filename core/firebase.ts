import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../config';

let app;
let auth;
let db;

if (!getApps().length) {
  app = initializeApp(FIREBASE_CONFIG);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  db = getFirestore(app);
} else {
  app = getApp();
  auth = getAuth(app); // Re-uses existing auth instance
  db = getFirestore(app);
}

export { app, auth, db };

