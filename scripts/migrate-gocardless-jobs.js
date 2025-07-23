const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, query, where, getDoc } = require('firebase/firestore');

// Firebase configuration from the project
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

async function migrateGoCardlessJobs() {
  console.log('Starting GoCardless jobs migration...');
  
  try {
    // Get all jobs
    const jobsSnapshot = await getDocs(collection(db, 'jobs'));
    console.log(`Found ${jobsSnapshot.size} jobs to process`);
    
    let updatedCount = 0;
    let errorCount = 0;
    let ddJobsFound = 0;
    
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      
      try {
        // Get the associated client
        const clientDoc = await getDoc(doc(db, 'clients', job.clientId));
        
        if (!clientDoc.exists()) {
          console.log(`Client ${job.clientId} not found for job ${jobDoc.id}, skipping...`);
          continue;
        }
        
        const client = clientDoc.data();
        
        // Check if client is gocardless enabled
        const gocardlessEnabled = client.gocardlessEnabled || false;
        const gocardlessCustomerId = client.gocardlessCustomerId || null;
        
        if (gocardlessEnabled) {
          ddJobsFound++;
          console.log(`Found DD job for client ${client.name || job.clientId} - Customer ID: ${gocardlessCustomerId}`);
        }
        
        // Update the job with gocardless information
        await updateDoc(doc(db, 'jobs', jobDoc.id), {
          gocardlessEnabled,
          gocardlessCustomerId
        });
        
        updatedCount++;
        if (updatedCount % 10 === 0) {
          console.log(`Progress: ${updatedCount}/${jobsSnapshot.size} jobs updated`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`Error updating job ${jobDoc.id}:`, error);
      }
    }
    
    console.log(`\n=== MIGRATION COMPLETED ===`);
    console.log(`Total jobs processed: ${jobsSnapshot.size}`);
    console.log(`Successfully updated: ${updatedCount} jobs`);
    console.log(`Errors: ${errorCount} jobs`);
    console.log(`DD jobs found: ${ddJobsFound} jobs`);
    
    if (ddJobsFound > 0) {
      console.log(`\n✅ Found ${ddJobsFound} jobs that should show DD badges on the runsheet!`);
    } else {
      console.log(`\n⚠️  No DD jobs found. Make sure you have clients with gocardlessEnabled: true`);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
migrateGoCardlessJobs(); 