// Write migration to create servicePlans from existing client routine fields and jobs
// - Idempotent: checks for existing plan (ownerId+clientId+serviceType)
// - Derives next-future anchor from pending jobs else rolls seed forward
// - DOES NOT modify existing jobs

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, query, where, limit } = require('firebase/firestore');
const { addWeeks, format, isBefore, parseISO } = require('date-fns');

const firebaseConfig = {
  apiKey: "AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo",
  authDomain: "roundmanagerapp.firebaseapp.com",
  projectId: "roundmanagerapp",
  storageBucket: "roundmanagerapp.appspot.com",
  messagingSenderId: "1049000869926",
  appId: "1:1049000869926:web:dbd1ff76e097cae72526e7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getPendingJobsForClient(clientId) {
  const jobsSnap = await getDocs(query(
    collection(db, 'jobs'),
    where('clientId', '==', clientId),
    where('status', 'in', ['pending', 'scheduled', 'in_progress'])
  ));
  return jobsSnap.docs.map(d => ({ id: d.id, ...(d.data()) }));
}

function earliestPendingOnOrAfterToday(jobs, serviceId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = null;
  for (const j of jobs) {
    if (!j.scheduledTime) continue;
    if (serviceId && j.serviceId !== serviceId) continue;
    const d = new Date(j.scheduledTime);
    if (d >= today && (!next || d < next)) next = d;
  }
  return next ? format(next, 'yyyy-MM-dd') : null;
}

function rollForwardToToday(seed, frequencyWeeks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = parseISO(seed);
  while (isBefore(d, today)) d = addWeeks(d, frequencyWeeks);
  return format(d, 'yyyy-MM-dd');
}

async function ensurePlan(ownerId, client, serviceType, scheduleType, frequencyWeeks, seedDate, price) {
  // Check for existing plan
  const existingQ = query(
    collection(db, 'servicePlans'),
    where('ownerId', '==', ownerId),
    where('clientId', '==', client.id),
    where('serviceType', '==', serviceType),
    where('scheduleType', '==', scheduleType)
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) {
    return { created: false, id: existingSnap.docs[0].id };
  }

  const now = new Date().toISOString();
  const docData = {
    ownerId,
    clientId: client.id,
    serviceType,
    scheduleType,
    price: Number(price) || (typeof client.quote === 'number' ? client.quote : 25),
    isActive: true,
    lastServiceDate: null,
    createdAt: now,
    updatedAt: now,
  };

  if (scheduleType === 'recurring') {
    docData.frequencyWeeks = frequencyWeeks;
    docData.startDate = seedDate;
  } else {
    docData.scheduledDate = seedDate;
  }

  const ref = await addDoc(collection(db, 'servicePlans'), docData);
  return { created: true, id: ref.id };
}

async function migrate(ownerId) {
  const clientsQuery = ownerId
    ? query(collection(db, 'clients'), where('ownerId', '==', ownerId))
    : collection(db, 'clients');
  const clientsSnap = await getDocs(clientsQuery);
  const clients = clientsSnap.docs.map(d => ({ id: d.id, ...(d.data()) }));

  let created = 0;
  let skipped = 0;
  for (const client of clients) {
    const jobs = await getPendingJobsForClient(client.id);

    // Base window-cleaning (recurring only)
    if (client.frequency && client.frequency !== 'one-off') {
      const freq = Number(client.frequency);
      let anchor = earliestPendingOnOrAfterToday(jobs, 'window-cleaning');
      if (!anchor && client.nextVisit) anchor = rollForwardToToday(client.nextVisit, freq);
      if (anchor) {
        const res = await ensurePlan(ownerId || client.ownerId, client, 'window-cleaning', 'recurring', freq, anchor, client.quote);
        created += res.created ? 1 : 0;
      } else {
        skipped++;
      }
    }

    // Additional services (recurring only)
    if (Array.isArray(client.additionalServices)) {
      for (const s of client.additionalServices) {
        if (!s || !s.isActive) continue;
        let anchor = earliestPendingOnOrAfterToday(jobs, s.serviceType);
        if (!anchor && s.nextVisit) anchor = rollForwardToToday(s.nextVisit, s.frequency);
        if (anchor) {
          const res = await ensurePlan(ownerId || client.ownerId, client, s.serviceType, 'recurring', s.frequency, anchor, s.price);
          created += res.created ? 1 : 0;
        } else {
          skipped++;
        }
      }
    }
  }

  console.log(`Migration complete. Plans created: ${created}. Missing anchors (skipped): ${skipped}.`);
}

if (require.main === module) {
  const ownerId = process.env.OWNER_ID || null;
  migrate(ownerId).catch(err => {
    console.error(err);
    process.exit(1);
  });
}


