// One-off: add extra fake clients/jobs to the Play demo account (screenshot polish).
// Usage: node scripts/_seed_play_demo2.cjs <email> <password>
// Do not commit credentials. Fake Leeds clients only — no real PII.

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, addDoc, getDocs, query, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo',
  authDomain: 'roundmanagerapp.firebaseapp.com',
  projectId: 'roundmanagerapp',
  storageBucket: 'roundmanagerapp.appspot.com',
  messagingSenderId: '1049000869926',
  appId: '1:1049000869926:web:dbd1ff76e097cae72526e7',
};

// Jobs clustered on Thu 17 + Fri 18 Sept so the runsheet screenshot looks busy.
const CLIENTS = [
  { name: 'Priya Kaur', address1: '15 Elm Grove', town: 'Leeds', postcode: 'LS4 2BQ', nextVisit: '2026-09-17', quote: 20, roundOrderNumber: 5, mobileNumber: '07000000005' },
  { name: 'Alfie Turner', address1: '67 Victoria Road', town: 'Leeds', postcode: 'LS6 1DR', nextVisit: '2026-09-17', quote: 16, roundOrderNumber: 6, mobileNumber: '07000000006' },
  { name: 'Grace Osei', address1: '12 Chapel Hill', town: 'Headingley', postcode: 'LS6 3RW', nextVisit: '2026-09-17', quote: 30, roundOrderNumber: 7, mobileNumber: '07000000007' },
  { name: 'Tommy Barnes', address1: '4 Orchard Close', town: 'Leeds', postcode: 'LS5 3ED', nextVisit: '2026-09-18', quote: 18, roundOrderNumber: 8, mobileNumber: '07000000008' },
  { name: 'Ellie Fletcher', address1: '29 Westfield Terrace', town: 'Leeds', postcode: 'LS3 1AB', nextVisit: '2026-09-18', quote: 22, roundOrderNumber: 9, mobileNumber: '07000000009' },
  { name: 'Noah Simmons', address1: '88 Harrogate Lane', town: 'Leeds', postcode: 'LS7 4PL', nextVisit: '2026-09-18', quote: 26, roundOrderNumber: 10, mobileNumber: '07000000010' },
];

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('Usage: node scripts/_seed_play_demo2.cjs <email> <password>');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Signing in as ${email}...`);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const ownerId = cred.user.uid;

  const existing = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
  const existingNames = new Set(existing.docs.map((d) => d.data().name));
  console.log(`Account has ${existing.size} client(s).`);

  const now = new Date().toISOString();
  let startIdx = existing.size;
  for (const c of CLIENTS) {
    if (existingNames.has(c.name)) {
      console.log(`Skipping ${c.name} (already exists)`);
      continue;
    }
    startIdx += 1;
    const address = `${c.address1}, ${c.town}, ${c.postcode}`;
    const clientRef = await addDoc(collection(db, 'clients'), {
      name: c.name,
      address1: c.address1,
      town: c.town,
      postcode: c.postcode,
      address,
      frequency: 4,
      nextVisit: c.nextVisit,
      mobileNumber: c.mobileNumber,
      quote: c.quote,
      accountNumber: `RWC${String(startIdx).padStart(3, '0')}`,
      roundOrderNumber: c.roundOrderNumber,
      status: 'active',
      dateAdded: now,
      source: 'Play Store demo',
      email: '',
      startingBalance: 0,
      ownerId,
      accountId: ownerId,
    });

    const scheduledTime = `${c.nextVisit}T09:00:00.000Z`;
    await addDoc(collection(db, 'jobs'), {
      ownerId,
      accountId: ownerId,
      clientId: clientRef.id,
      serviceId: 'window-cleaning',
      propertyDetails: address,
      scheduledTime,
      originalScheduledTime: scheduledTime,
      status: 'pending',
      price: c.quote,
      paymentStatus: 'unpaid',
    });
    console.log(`Created ${c.name} (${clientRef.id}) job ${c.nextVisit}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', (err && err.message) || err);
    process.exit(1);
  });
