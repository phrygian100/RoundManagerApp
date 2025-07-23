const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, limit } = require('firebase/firestore');

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

async function checkGoCardlessJobs() {
  console.log('Checking GoCardless jobs in Firebase...');
  
  try {
    // Get a sample of jobs to check
    const jobsSnapshot = await getDocs(query(collection(db, 'jobs'), limit(20)));
    console.log(`Found ${jobsSnapshot.size} jobs to check`);
    
    let jobsWithGoCardless = 0;
    let jobsWithoutGoCardless = 0;
    let ddJobs = 0;
    
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      
      console.log(`\nJob ${jobDoc.id}:`);
      console.log(`  - Client ID: ${job.clientId}`);
      console.log(`  - Service: ${job.serviceId}`);
      console.log(`  - Scheduled: ${job.scheduledTime}`);
      console.log(`  - gocardlessEnabled: ${job.gocardlessEnabled}`);
      console.log(`  - gocardlessCustomerId: ${job.gocardlessCustomerId}`);
      
      if (job.gocardlessEnabled !== undefined) {
        jobsWithGoCardless++;
        if (job.gocardlessEnabled) {
          ddJobs++;
          console.log(`  - ✅ This is a DD job!`);
        }
      } else {
        jobsWithoutGoCardless++;
        console.log(`  - ❌ Missing gocardless fields`);
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Jobs with gocardless fields: ${jobsWithGoCardless}`);
    console.log(`Jobs without gocardless fields: ${jobsWithoutGoCardless}`);
    console.log(`DD jobs found: ${ddJobs}`);
    
    if (jobsWithoutGoCardless > 0) {
      console.log(`\n⚠️  Some jobs are missing gocardless fields. You may need to run the migration script.`);
    } else {
      console.log(`\n✅ All checked jobs have gocardless fields populated.`);
    }
    
  } catch (error) {
    console.error('Error checking jobs:', error);
  }
}

// Run the check
checkGoCardlessJobs(); 