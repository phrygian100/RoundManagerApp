const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc, query, where } = require('firebase/firestore');

// Firebase config - you'll need to add your config here
const firebaseConfig = {
  // Add your Firebase config here
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixQuoteJobs() {
  try {
    console.log('🔍 Searching for quote jobs without ownerId...');
    
    // Get all jobs with serviceId 'quote'
    const jobsRef = collection(db, 'jobs');
    const quoteJobsQuery = query(jobsRef, where('serviceId', '==', 'quote'));
    const snapshot = await getDocs(quoteJobsQuery);
    
    console.log(`📋 Found ${snapshot.size} quote jobs`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const docSnap of snapshot.docs) {
      const jobData = docSnap.data();
      
      if (!jobData.ownerId) {
        console.log(`❌ Quote job ${docSnap.id} missing ownerId`);
        
        // Try to determine ownerId from the quoteId
        if (jobData.quoteId) {
          try {
            // Get the quote document to find the owner
            const quoteRef = doc(db, 'quotes', jobData.quoteId);
            const quoteSnap = await getDocs(quoteRef);
            
            if (quoteSnap.exists()) {
              // For now, we'll need to manually set the ownerId
              // This is a limitation since we can't determine the owner from the quote alone
              console.log(`⚠️  Quote job ${docSnap.id} needs manual ownerId assignment`);
              skippedCount++;
            }
          } catch (error) {
            console.error(`Error checking quote ${jobData.quoteId}:`, error);
            skippedCount++;
          }
        } else {
          console.log(`⚠️  Quote job ${docSnap.id} has no quoteId, cannot determine owner`);
          skippedCount++;
        }
      } else {
        console.log(`✅ Quote job ${docSnap.id} already has ownerId: ${jobData.ownerId}`);
        fixedCount++;
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`✅ Jobs already fixed: ${fixedCount}`);
    console.log(`⚠️  Jobs needing manual fix: ${skippedCount}`);
    console.log(`\n💡 To fix remaining jobs, you'll need to manually update them with the correct ownerId.`);
    
  } catch (error) {
    console.error('Error fixing quote jobs:', error);
  }
}

// Run the migration
fixQuoteJobs().then(() => {
  console.log('Migration completed');
  process.exit(0);
}).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
}); 