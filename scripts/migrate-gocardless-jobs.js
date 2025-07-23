const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, query, where } = require('firebase/firestore');

// Firebase configuration - you'll need to add your config here
const firebaseConfig = {
  // Add your Firebase config here
  // apiKey: "your-api-key",
  // authDomain: "your-auth-domain",
  // projectId: "your-project-id",
  // storageBucket: "your-storage-bucket",
  // messagingSenderId: "your-messaging-sender-id",
  // appId: "your-app-id"
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
    
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      
      try {
        // Get the associated client
        const clientDoc = await getDocs(doc(db, 'clients', job.clientId));
        
        if (!clientDoc.exists()) {
          console.log(`Client ${job.clientId} not found for job ${jobDoc.id}, skipping...`);
          continue;
        }
        
        const client = clientDoc.data();
        
        // Check if client is gocardless enabled
        const gocardlessEnabled = client.gocardlessEnabled || false;
        const gocardlessCustomerId = client.gocardlessCustomerId || null;
        
        // Update the job with gocardless information
        await updateDoc(doc(db, 'jobs', jobDoc.id), {
          gocardlessEnabled,
          gocardlessCustomerId
        });
        
        updatedCount++;
        console.log(`Updated job ${jobDoc.id} - gocardlessEnabled: ${gocardlessEnabled}, customerId: ${gocardlessCustomerId}`);
        
      } catch (error) {
        errorCount++;
        console.error(`Error updating job ${jobDoc.id}:`, error);
      }
    }
    
    console.log(`Migration completed!`);
    console.log(`Successfully updated: ${updatedCount} jobs`);
    console.log(`Errors: ${errorCount} jobs`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
migrateGoCardlessJobs(); 