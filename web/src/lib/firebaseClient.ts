import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

// Import the shared Firebase config from the main app
import { FIREBASE_CONFIG } from '../../../config';

let app: FirebaseApp;
let auth: Auth;

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  app = initializeApp(FIREBASE_CONFIG);
} else {
  app = getApp();
}

// Initialize Auth service
auth = getAuth(app);

export { auth };
