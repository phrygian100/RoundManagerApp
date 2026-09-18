// One-off: move Play-demo jobs dated 2026-09-17 to 2026-09-18 (today's 9am slot
// already passed, so clients showed "Next Visit: N/A" in screenshots).
// Usage: node scripts/_seed_play_demo3.cjs <email> <password>

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, getDocs, query, where, updateDoc, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo',
  authDomain: 'roundmanagerapp.firebaseapp.com',
  projectId: 'roundmanagerapp',
  storageBucket: 'roundmanagerapp.appspot.com',
  messagingSenderId: '1049000869926',
  appId: '1:1049000869926:web:dbd1ff76e097cae72526e7',
};

const FROM = '2026-09-17';
const TO = '2026-09-18';

async function main() {
  const [email, password] = process.argv.slice(2);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const ownerId = cred.user.uid;

  const clients = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
  for (const c of clients.docs) {
    if (c.data().nextVisit === FROM) {
      await updateDoc(doc(db, 'clients', c.id), { nextVisit: TO });
      console.log(`client ${c.data().name}: nextVisit -> ${TO}`);
    }
  }

  const jobs = await getDocs(query(collection(db, 'jobs'), where('ownerId', '==', ownerId)));
  for (const j of jobs.docs) {
    const st = j.data().scheduledTime || '';
    if (st.startsWith(FROM)) {
      const newTime = `${TO}T09:00:00.000Z`;
      await updateDoc(doc(db, 'jobs', j.id), { scheduledTime: newTime, originalScheduledTime: newTime });
      console.log(`job ${j.id}: ${st} -> ${newTime}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('Failed:', e.message || e); process.exit(1); });
