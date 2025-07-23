const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc, query, where, limit } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo",
  authDomain: "roundmanagerapp.firebaseapp.com",
  projectId: "roundmanagerapp",
  storageBucket: "roundmanagerapp.appspot.com",
  messagingSenderId: "1049000869926",
  appId: "1:1049000869926:web:dbd1ff76e097cae72526e7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugGoCardlessJobs() {
  console.log('🔍 Debugging GoCardless jobs - checking for missing customer IDs...');
  
  try {
    // Get a sample of jobs
    const jobsSnapshot = await getDocs(query(collection(db, 'jobs'), limit(50)));
    console.log(`Found ${jobsSnapshot.size} jobs to analyze`);
    
    let ddJobsWithCustomerId = 0;
    let ddJobsWithoutCustomerId = 0;
    let regularJobs = 0;
    let jobsWithNoGoCardlessFields = 0;
    
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      
      console.log(`\n📋 Job ${jobDoc.id}:`);
      console.log(`  - Client ID: ${job.clientId}`);
      console.log(`  - Service: ${job.serviceId}`);
      console.log(`  - gocardlessEnabled: ${job.gocardlessEnabled}`);
      console.log(`  - gocardlessCustomerId: ${job.gocardlessCustomerId}`);
      
      if (job.gocardlessEnabled === undefined) {
        jobsWithNoGoCardlessFields++;
        console.log(`  - ❌ Missing gocardless fields entirely`);
      } else if (job.gocardlessEnabled === true) {
        if (job.gocardlessCustomerId) {
          ddJobsWithCustomerId++;
          console.log(`  - ✅ DD job WITH customer ID: ${job.gocardlessCustomerId}`);
        } else {
          ddJobsWithoutCustomerId++;
          console.log(`  - ⚠️  DD job WITHOUT customer ID (this is the problem!)`);
          
          // Let's check the client to see if it has a customer ID
          try {
            const clientDoc = await getDoc(doc(db, 'clients', job.clientId));
            if (clientDoc.exists()) {
              const client = clientDoc.data();
              console.log(`    Client ${client.name || job.clientId} has gocardlessCustomerId: ${client.gocardlessCustomerId}`);
              if (client.gocardlessCustomerId && !job.gocardlessCustomerId) {
                console.log(`    🔧 This job needs to be updated with the client's customer ID!`);
              }
            }
          } catch (error) {
            console.log(`    Error checking client: ${error.message}`);
          }
        }
      } else {
        regularJobs++;
        console.log(`  - 📋 Regular job (not DD)`);
      }
    }
    
    console.log(`\n=== ANALYSIS SUMMARY ===`);
    console.log(`Total jobs checked: ${jobsSnapshot.size}`);
    console.log(`DD jobs WITH customer ID: ${ddJobsWithCustomerId}`);
    console.log(`DD jobs WITHOUT customer ID: ${ddJobsWithoutCustomerId}`);
    console.log(`Regular jobs: ${regularJobs}`);
    console.log(`Jobs missing gocardless fields: ${jobsWithNoGoCardlessFields}`);
    
    if (ddJobsWithoutCustomerId > 0) {
      console.log(`\n🚨 PROBLEM FOUND: ${ddJobsWithoutCustomerId} DD jobs are missing their gocardlessCustomerId!`);
      console.log(`This means the jobs show DD badges but don't have the customer ID for payment processing.`);
      console.log(`\nSOLUTION: Run the migration script to fix this:`);
      console.log(`node scripts/migrate-gocardless-jobs.js`);
    } else if (ddJobsWithCustomerId > 0) {
      console.log(`\n✅ All DD jobs have customer IDs - everything looks good!`);
    } else {
      console.log(`\nℹ️  No DD jobs found in the sample. Check if you have any gocardless-enabled clients.`);
    }
    
  } catch (error) {
    console.error('Error debugging jobs:', error);
  }
}

// Run the debug
debugGoCardlessJobs(); 