/**
 * Script to create a business portal document in Firestore
 * This makes a business discoverable for client portal login
 * 
 * Usage: node scripts/create-business-portal.js <email> <password>
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');

// Firebase config - same as your app
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createBusinessPortal(email, password) {
  try {
    console.log('🔐 Signing in as:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('✅ Signed in successfully');

    // Get user document to find business name
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      console.error('❌ User document not found');
      process.exit(1);
    }

    const userData = userDoc.data();
    const businessName = userData.businessName;

    if (!businessName) {
      console.error('❌ No business name found for this user');
      process.exit(1);
    }

    console.log('📋 Business Name:', businessName);

    // Create normalized portal ID
    const normalizedName = businessName.replace(/\s+/g, '').toLowerCase();
    console.log('🔗 Portal URL will be: guvnor.app/' + normalizedName);

    // Create the business portal document
    const portalData = {
      ownerId: user.uid,
      businessName: businessName,
      ownerName: userData.name || '',
      email: userData.email || email,
      createdAt: new Date().toISOString(),
      enabled: true
    };

    await setDoc(doc(db, 'businessPortals', normalizedName), portalData);
    console.log('✅ Business portal created successfully!');
    console.log('🌐 Clients can now access: https://guvnor.app/' + normalizedName);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get credentials from command line arguments
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Usage: node scripts/create-business-portal.js <email> <password>');
  console.log('Example: node scripts/create-business-portal.js travis_gm@live.co.uk yourpassword');
  process.exit(1);
}

createBusinessPortal(email, password);

