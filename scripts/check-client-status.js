// Script to diagnose client status issues
// Run with: node scripts/check-client-status.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Firebase configuration (using production values from app.config.ts)
const firebaseConfig = {
  apiKey: 'AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo',
  authDomain: 'roundmanagerapp.firebaseapp.com',
  projectId: 'roundmanagerapp',
  storageBucket: 'roundmanagerapp.appspot.com',
  messagingSenderId: '1049000869926',
  appId: '1:1049000869926:web:dbd1ff76e097cae72526e7'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function analyzeClientStatuses() {
  try {
    // Get auth credentials from command line or environment
    const email = process.argv[2] || process.env.TEST_EMAIL;
    const password = process.argv[3] || process.env.TEST_PASSWORD;
    
    if (!email || !password) {
      console.error('Please provide email and password as arguments or in environment variables');
      console.log('Usage: node scripts/check-client-status.js <email> <password>');
      process.exit(1);
    }

    // Sign in
    console.log('Signing in...');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const ownerId = userCredential.user.uid;
    console.log('Signed in as:', ownerId);

    // Fetch ALL clients for this owner
    console.log('\nFetching all clients...');
    const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(clientsQuery);
    
    console.log(`Total clients in database: ${snapshot.size}`);
    console.log('=' .repeat(50));

    // Categorize clients by status
    const statusCategories = {
      active: [],
      exClient: [],
      undefined: [],
      other: []
    };

    snapshot.forEach(doc => {
      const client = { id: doc.id, ...doc.data() };
      
      if (client.status === 'active') {
        statusCategories.active.push(client);
      } else if (client.status === 'ex-client') {
        statusCategories.exClient.push(client);
      } else if (client.status === undefined || client.status === null) {
        statusCategories.undefined.push(client);
      } else {
        // Unexpected status value
        statusCategories.other.push({ ...client, actualStatus: client.status });
      }
    });

    // Report findings
    console.log('\n📊 STATUS BREAKDOWN:');
    console.log('-'.repeat(50));
    console.log(`✅ Active (status='active'): ${statusCategories.active.length}`);
    console.log(`🚫 Ex-Client (status='ex-client'): ${statusCategories.exClient.length}`);
    console.log(`❓ Undefined/Null status: ${statusCategories.undefined.length}`);
    console.log(`⚠️  Other/Unexpected status: ${statusCategories.other.length}`);
    
    // What the app shows
    console.log('\n📱 WHAT THE APP DISPLAYS:');
    console.log('-'.repeat(50));
    const activeClientsCount = statusCategories.active.length + statusCategories.undefined.length + statusCategories.other.length;
    console.log(`Active Clients Screen Total: ${activeClientsCount} (active + undefined + other)`);
    console.log(`Ex-Clients Screen Total: ${statusCategories.exClient.length} (only 'ex-client')`);
    
    // Show problematic clients
    if (statusCategories.undefined.length > 0) {
      console.log('\n⚠️  CLIENTS WITH UNDEFINED/NULL STATUS:');
      console.log('-'.repeat(50));
      statusCategories.undefined.forEach(client => {
        const displayName = client.name || 'No name';
        const displayAddress = client.address1 ? 
          `${client.address1}, ${client.town}, ${client.postcode}` : 
          client.address || 'No address';
        console.log(`- ${displayName} | ${displayAddress} | Account: ${client.accountNumber || 'N/A'}`);
      });
    }

    if (statusCategories.other.length > 0) {
      console.log('\n⚠️  CLIENTS WITH UNEXPECTED STATUS:');
      console.log('-'.repeat(50));
      statusCategories.other.forEach(client => {
        const displayName = client.name || 'No name';
        console.log(`- ${displayName} | Status: "${client.actualStatus}" | Account: ${client.accountNumber || 'N/A'}`);
      });
    }

    // Check for potential issues
    console.log('\n🔍 POTENTIAL ISSUES:');
    console.log('-'.repeat(50));
    
    if (statusCategories.undefined.length > 0) {
      console.log(`❗ ${statusCategories.undefined.length} clients have no status field.`);
      console.log('   These clients are counted as ACTIVE in the app but may be ex-clients.');
      console.log('   Consider updating them to have explicit status values.');
    }
    
    if (statusCategories.other.length > 0) {
      console.log(`❗ ${statusCategories.other.length} clients have unexpected status values.`);
      console.log('   These need to be corrected to either "active" or "ex-client".');
    }

    // Recommendation
    if (statusCategories.undefined.length > 0 || statusCategories.other.length > 0) {
      console.log('\n💡 RECOMMENDATION:');
      console.log('-'.repeat(50));
      console.log('Run a migration to set proper status values for all clients.');
      console.log('Clients without status should be set to "active" if they are current customers.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the analysis
analyzeClientStatuses();
