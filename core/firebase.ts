import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
// AsyncStorage is needed for native persistence
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_CONFIG } from '../config';

let app;
let auth;
let db;

// This prevents Firebase from initializing more than once
if (!getApps().length) {
  try {
    app = initializeApp(FIREBASE_CONFIG);
    
    // Initialize Auth with platform-specific persistence
    if (Platform.OS === 'web') {
      // The standard getAuth is for web and handles persistence automatically.
      auth = getAuth(app);
    } else {
      // For native, we must explicitly set persistence with AsyncStorage.
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    }

    db = getFirestore(app);

  } catch (e) {
    console.error("Firebase initialization error", e);
    // You might want to show an error to the user here
  }
} else {
  // If already initialized, get the existing app and services
  app = getApp();
  auth = getAuth(app);
  db = getFirestore(app);
}

// Export the initialized services
export { app, auth, db };

