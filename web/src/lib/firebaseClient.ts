import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

// Import the shared Firebase config from the main app
import { FIREBASE_CONFIG } from '../../../config';

// Initialize Firebase only if it hasn't been initialized yet
const app: FirebaseApp = !getApps().length 
  ? initializeApp(FIREBASE_CONFIG)
  : getApp();

// Initialize Auth service
const auth: Auth = getAuth(app);

export { auth };
