const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

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

async function checkGoCardlessClients() {
  console.log('Checking GoCardless clients in Firebase...');
  
  try {
    // Get all clients
    const clientsSnapshot = await getDocs(collection(db, 'clients'));
    console.log(`Found ${clientsSnapshot.size} clients to check`);
    
    let gocardlessClients = [];
    let regularClients = [];
    
    for (const clientDoc of clientsSnapshot.docs) {
      const client = clientDoc.data();
      
      if (client.gocardlessEnabled) {
        gocardlessClients.push({
          id: clientDoc.id,
          name: client.name,
          address: client.address1 || client.address,
          customerId: client.gocardlessCustomerId
        });
      } else {
        regularClients.push({
          id: clientDoc.id,
          name: client.name,
          address: client.address1 || client.address
        });
      }
    }
    
    console.log(`\n=== GOCARDLESS CLIENTS (${gocardlessClients.length}) ===`);
    if (gocardlessClients.length > 0) {
      gocardlessClients.forEach(client => {
        console.log(`✅ ${client.name} - ${client.address} - Customer ID: ${client.customerId}`);
      });
    } else {
      console.log('No GoCardless clients found');
    }
    
    console.log(`\n=== REGULAR CLIENTS (${regularClients.length}) ===`);
    if (regularClients.length > 0) {
      regularClients.slice(0, 10).forEach(client => {
        console.log(`📋 ${client.name} - ${client.address}`);
      });
      if (regularClients.length > 10) {
        console.log(`... and ${regularClients.length - 10} more regular clients`);
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total clients: ${clientsSnapshot.size}`);
    console.log(`GoCardless clients: ${gocardlessClients.length}`);
    console.log(`Regular clients: ${regularClients.length}`);
    
    if (gocardlessClients.length > 0) {
      console.log(`\n✅ You have ${gocardlessClients.length} GoCardless clients!`);
      console.log(`Their jobs should show DD badges on the runsheet.`);
    } else {
      console.log(`\n⚠️  No GoCardless clients found.`);
      console.log(`To see DD badges, you need to enable GoCardless for some clients.`);
    }
    
  } catch (error) {
    console.error('Error checking clients:', error);
  }
}

// Run the check
checkGoCardlessClients(); 