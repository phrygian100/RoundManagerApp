// Script to fix client status issues
// Run with: node scripts/fix-client-status.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

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

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function fixClientStatuses() {
  try {
    // Get auth credentials from command line or environment
    const email = process.argv[2] || process.env.TEST_EMAIL;
    const password = process.argv[3] || process.env.TEST_PASSWORD;
    
    if (!email || !password) {
      console.error('Please provide email and password as arguments or in environment variables');
      console.log('Usage: node scripts/fix-client-status.js <email> <password>');
      process.exit(1);
    }

    // Sign in
    console.log('Signing in...');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const ownerId = userCredential.user.uid;
    console.log('Signed in as:', ownerId);

    // Fetch ALL clients for this owner
    console.log('\nAnalyzing clients...');
    const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(clientsQuery);
    
    console.log(`Total clients found: ${snapshot.size}`);
    console.log('=' .repeat(50));

    // Find clients with missing or invalid status
    const clientsToFix = [];
    
    snapshot.forEach(doc => {
      const client = { id: doc.id, ...doc.data() };
      
      if (client.status === undefined || client.status === null || 
          (client.status !== 'active' && client.status !== 'ex-client')) {
        clientsToFix.push(client);
      }
    });

    if (clientsToFix.length === 0) {
      console.log('✅ All clients have valid status values!');
      console.log('No fixes needed.');
      rl.close();
      process.exit(0);
    }

    // Show clients that need fixing
    console.log(`\n⚠️  Found ${clientsToFix.length} clients with missing or invalid status:`);
    console.log('-'.repeat(50));
    
    clientsToFix.forEach((client, index) => {
      const displayName = client.name || 'No name';
      const displayAddress = client.address1 ? 
        `${client.address1}, ${client.town}, ${client.postcode}` : 
        client.address || 'No address';
      const currentStatus = client.status === undefined ? 'undefined' : 
                          client.status === null ? 'null' : 
                          `"${client.status}"`;
      console.log(`${index + 1}. ${displayName}`);
      console.log(`   Address: ${displayAddress}`);
      console.log(`   Account: ${client.accountNumber || 'N/A'}`);
      console.log(`   Current status: ${currentStatus}`);
      console.log(`   Round Order: ${client.roundOrderNumber || 'Not set'}`);
      console.log('');
    });

    // Ask user what to do
    console.log('\n🔧 FIX OPTIONS:');
    console.log('-'.repeat(50));
    console.log('1. Set all to "active" (recommended for current customers)');
    console.log('2. Review each client individually');
    console.log('3. Cancel (no changes)');
    
    const choice = await askQuestion('\nEnter your choice (1-3): ');

    if (choice === '3') {
      console.log('Cancelled. No changes made.');
      rl.close();
      process.exit(0);
    }

    const updates = [];

    if (choice === '1') {
      // Set all to active
      clientsToFix.forEach(client => {
        updates.push({ id: client.id, status: 'active' });
      });
    } else if (choice === '2') {
      // Review each individually
      for (const client of clientsToFix) {
        const displayName = client.name || 'No name';
        const displayAddress = client.address1 ? 
          `${client.address1}, ${client.town}, ${client.postcode}` : 
          client.address || 'No address';
        
        console.log('\n' + '-'.repeat(50));
        console.log(`Client: ${displayName}`);
        console.log(`Address: ${displayAddress}`);
        console.log(`Account: ${client.accountNumber || 'N/A'}`);
        
        const statusChoice = await askQuestion('Set status to (a)ctive, (e)x-client, or (s)kip? ');
        
        if (statusChoice.toLowerCase() === 'a') {
          updates.push({ id: client.id, status: 'active' });
        } else if (statusChoice.toLowerCase() === 'e') {
          updates.push({ id: client.id, status: 'ex-client' });
        }
      }
    } else {
      console.log('Invalid choice. Exiting.');
      rl.close();
      process.exit(1);
    }

    if (updates.length === 0) {
      console.log('\nNo updates to make.');
      rl.close();
      process.exit(0);
    }

    // Confirm updates
    console.log(`\n📝 Ready to update ${updates.length} clients:`);
    const activeCount = updates.filter(u => u.status === 'active').length;
    const exCount = updates.filter(u => u.status === 'ex-client').length;
    console.log(`- ${activeCount} will be set to "active"`);
    console.log(`- ${exCount} will be set to "ex-client"`);
    
    const confirm = await askQuestion('\nProceed with updates? (y/n): ');
    
    if (confirm.toLowerCase() !== 'y') {
      console.log('Cancelled. No changes made.');
      rl.close();
      process.exit(0);
    }

    // Perform updates in batches
    console.log('\nUpdating clients...');
    const batch = writeBatch(db);
    let batchCount = 0;
    
    for (const update of updates) {
      const clientRef = doc(db, 'clients', update.id);
      batch.update(clientRef, { 
        status: update.status,
        updatedAt: new Date().toISOString()
      });
      batchCount++;
      
      // Firestore batch limit is 500
      if (batchCount === 500) {
        await batch.commit();
        console.log(`Updated ${batchCount} clients...`);
        batchCount = 0;
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`\n✅ Successfully updated ${updates.length} clients!`);
    console.log('\nChanges made:');
    console.log(`- ${activeCount} clients set to "active"`);
    console.log(`- ${exCount} clients set to "ex-client"`);
    
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    rl.close();
    process.exit(1);
  }
}

// Run the fix
fixClientStatuses();
