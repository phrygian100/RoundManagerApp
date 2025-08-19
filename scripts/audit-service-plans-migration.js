// Read-only audit to prepare migration to servicePlans
// - Derives a next-future anchor date per client/service
// - Uses earliest pending job on/after today, or rolls nextVisit forward by frequency
// - Prints a summary; DOES NOT write to Firestore

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');
const { addWeeks, format, isBefore, parseISO } = require('date-fns');

// Firebase configuration (same pattern as other Node scripts)
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

async function auditServicePlansMigration() {
  const ownerId = process.env.OWNER_ID || null;
  console.log('Audit: starting', ownerId ? `(filter ownerId=${ownerId})` : '(all owners)');

  const clientsQuery = ownerId
    ? query(collection(db, 'clients'), where('ownerId', '==', ownerId))
    : collection(db, 'clients');
  const clientsSnap = await getDocs(clientsQuery);
  const clients = clientsSnap.docs.map(d => ({ id: d.id, ...(d.data()) }));

  const report = [];
  for (const client of clients) {
    const jobs = await getPendingJobsForClient(client.id);

    // Base window-cleaning (legacy fields)
    if (client.frequency && client.frequency !== 'one-off') {
      const freq = Number(client.frequency);
      let anchor = earliestPendingOnOrAfterToday(jobs, 'window-cleaning');
      if (!anchor && client.nextVisit) anchor = rollForwardToToday(client.nextVisit, freq);
      report.push({
        clientId: client.id,
        clientName: client.name || '',
        serviceType: 'window-cleaning',
        frequencyWeeks: freq,
        candidateAnchor: anchor || 'MISSING',
        source: anchor ? 'pending_jobs_or_seed_rolled' : 'missing',
      });
    }

    // Additional services
    if (Array.isArray(client.additionalServices)) {
      for (const s of client.additionalServices) {
        if (!s || !s.isActive) continue;
        let anchor = earliestPendingOnOrAfterToday(jobs, s.serviceType);
        if (!anchor && s.nextVisit) anchor = rollForwardToToday(s.nextVisit, s.frequency);
        report.push({
          clientId: client.id,
          clientName: client.name || '',
          serviceType: s.serviceType,
          frequencyWeeks: s.frequency,
          candidateAnchor: anchor || 'MISSING',
          source: anchor ? 'pending_jobs_or_seed_rolled' : 'missing',
        });
      }
    }
  }

  console.log('Service Plans Migration Audit');
  // Print limited rows for readability
  console.table(report.slice(0, 100));
  console.log(`Total candidates: ${report.length}`);
  const missing = report.filter(r => r.candidateAnchor === 'MISSING');
  if (missing.length) console.warn(`Missing anchors: ${missing.length}`);
}

if (require.main === module) {
  auditServicePlansMigration().catch(err => {
    console.error(err);
    process.exit(1);
  });
}


