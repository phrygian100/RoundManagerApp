import type { Job } from 'app/types/models';
import { db } from 'core/firebase';
import { addWeeks, format, isBefore, parseISO } from 'date-fns';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import type { Client } from '../../types/client';

const JOBS_COLLECTION = 'jobs';

export async function createJob(job: Omit<Job, 'id'>) {
  const jobsRef = collection(db, JOBS_COLLECTION);
  const docRef = await addDoc(jobsRef, job);
  return docRef.id;
}

export async function getJobsForProvider(providerId: string): Promise<Job[]> {
  const jobsRef = collection(db, JOBS_COLLECTION);
  const q = query(jobsRef, where('providerId', '==', providerId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Job));
}

export async function updateJobStatus(jobId: string, status: Job['status']) {
  const jobRef = doc(db, JOBS_COLLECTION, jobId);
  await updateDoc(jobRef, { status });
}

export async function getJobsForWeek(startDate: string, endDate: string): Promise<Job[]> {
  // scheduledTime is an ISO string (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss)
  const jobsRef = collection(db, JOBS_COLLECTION);
  const q = query(
    jobsRef,
    where('scheduledTime', '>=', startDate),
    where('scheduledTime', '<=', endDate)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Job));
}

export async function getClientById(clientId: string): Promise<Client | null> {
  const docRef = doc(db, 'clients', clientId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Client;
  }
  return null;
}

export async function generateRecurringJobs() {
  const querySnapshot = await getDocs(collection(db, 'clients'));
  const today = new Date();
  const jobsRef = collection(db, 'jobs');
  const allJobsSnapshot = await getDocs(jobsRef);
  const allJobs = allJobsSnapshot.docs.map(doc => doc.data());
  const jobsToCreate: any[] = [];
  querySnapshot.forEach((docSnap) => {
    const client: any = { id: docSnap.id, ...docSnap.data() };
    if (!client.nextVisit || !client.frequency || client.frequency === 'one-off') return;
    let visitDate = parseISO(client.nextVisit);
    for (let i = 0; i < 52; i++) {
      if (isBefore(visitDate, today)) {
        visitDate = addWeeks(visitDate, Number(client.frequency));
        continue;
      }
      const weekStr = format(visitDate, 'yyyy-MM-dd');
      // Only create if this client does not already have a job for this week
      const alreadyHasJob = allJobs.some((job: any) => job.clientId === client.id && job.scheduledTime && job.scheduledTime.startsWith(weekStr));
      if (!alreadyHasJob) {
        jobsToCreate.push({
          clientId: client.id,
          providerId: 'test-provider-1',
          serviceId: 'window-cleaning',
          propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
          scheduledTime: weekStr + 'T09:00:00',
          status: 'pending',
          price: typeof client.quote === 'number' ? client.quote : 25,
          paymentStatus: 'unpaid',
        });
      }
      visitDate = addWeeks(visitDate, Number(client.frequency));
    }
  });
  await Promise.all(jobsToCreate.map(job => addDoc(jobsRef, job)));
} 