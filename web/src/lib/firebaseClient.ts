import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

// Firebase Configuration for Next.js Web App
const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.EXPO_PUBLIC_FIREBASE_APP_ID || ""
};

// Validate Firebase configuration
const isValidConfig = Object.values(FIREBASE_CONFIG).every(value => value !== "");

if (!isValidConfig) {
  console.warn('⚠️  Firebase configuration incomplete. Some features may not work properly.');
  console.warn('Please ensure the following environment variables are set:');
  console.warn('- NEXT_PUBLIC_FIREBASE_API_KEY');
  console.warn('- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  console.warn('- NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  console.warn('- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  console.warn('- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  console.warn('- NEXT_PUBLIC_FIREBASE_APP_ID');
}

// Initialize Firebase only if config is valid
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (isValidConfig) {
  app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
  auth = getAuth(app);
} else {
  // Create a mock auth object for build time when config is missing
  console.warn('Firebase not initialized due to missing configuration');
}

// Export auth with null check
export { auth };
