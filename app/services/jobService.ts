import { addWeeks, format, isBefore, parseISO, startOfWeek } from 'date-fns';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../core/firebase';
import type { Client } from '../../types/client';
import type { Job } from '../types/models';

const JOBS_COLLECTION = 'jobs';

/**
 * Creates required Firestore indexes for the jobs collection
 * This should be called once during app initialization
 */
export async function createRequiredIndexes(): Promise<void> {
  try {
    // Note: Firestore indexes are typically created through the Firebase Console
    // or via the Firebase CLI. Programmatic creation is limited.
    // For now, we'll use a simpler query approach that doesn't require composite indexes
    
    console.log('Checking for required indexes...');
    // The indexes will be created automatically when queries are first run
    // If they don't exist, Firebase will throw an error with a link to create them
    
  } catch (error) {
    console.error('Error checking indexes:', error);
    throw error;
  }
}

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

export async function deleteJob(jobId: string): Promise<void> {
  const jobRef = doc(db, JOBS_COLLECTION, jobId);
  await deleteDoc(jobRef);
}

export async function getJobsForWeek(startDate: string, endDate: string): Promise<Job[]> {
  // scheduledTime is an ISO string (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss)
  // We need to ensure we capture the full day range
  const jobsRef = collection(db, JOBS_COLLECTION);
  const q = query(
    jobsRef,
    where('scheduledTime', '>=', startDate + 'T00:00:00'),
    where('scheduledTime', '<', endDate + 'T00:00:00')
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

/**
 * Creates jobs for a specific client for the next 8 weeks worth of occurrences
 * This function ensures no duplicate jobs are created
 */
export async function createJobsForClient(clientId: string, maxWeeks: number = 8): Promise<number> {
  try {
    // Get the client data
    const client = await getClientById(clientId);
    if (!client || !client.nextVisit || !client.frequency || client.frequency === 'one-off') {
      return 0; // No jobs to create for one-off clients or clients without proper data
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    
    let visitDate = parseISO(client.nextVisit);
    const jobsToCreate: Omit<Job, 'id'>[] = [];
    
    // Generate jobs for the specified number of weeks
    for (let i = 0; i < maxWeeks; i++) {
      // Only skip if the visit date is more than 7 days in the past
      // This allows jobs to be created for the current week
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      if (isBefore(visitDate, weekAgo)) {
        visitDate = addWeeks(visitDate, Number(client.frequency));
        continue;
      }
      
      const weekStr = format(visitDate, 'yyyy-MM-dd');
      
      // Check if a job already exists for this client on this date
      // Use a simpler query that doesn't require composite indexes
      const existingJobsQuery = query(
        collection(db, JOBS_COLLECTION),
        where('clientId', '==', clientId)
      );
      
      const existingJobs = await getDocs(existingJobsQuery);
      
      // Check if any existing job matches this date (client-side filtering)
      const jobExistsForDate = existingJobs.docs.some(doc => {
        const jobData = doc.data();
        const jobDate = jobData.scheduledTime;
        if (!jobDate) return false;
        
        // Check if the job is scheduled for the same date
        const jobDateStr = jobDate.split('T')[0]; // Get just the date part
        return jobDateStr === weekStr;
      });
      
      // Only create job if no existing job for this date
      if (!jobExistsForDate) {
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
    
    // Create all jobs in a batch
    if (jobsToCreate.length > 0) {
      const batch = writeBatch(db);
      jobsToCreate.forEach(job => {
        const newJobRef = doc(collection(db, JOBS_COLLECTION));
        batch.set(newJobRef, job);
      });
      await batch.commit();
    }
    
    return jobsToCreate.length;
  } catch (error) {
    console.error('Error creating jobs for client:', error);
    throw error;
  }
}

/**
 * Creates jobs for all active clients for a specific week
 * This is used during the weekly rollover process
 */
export async function createJobsForWeek(weekStartDate: string): Promise<number> {
  try {
    // Get all active clients
    const clientsQuery = query(
      collection(db, 'clients'),
      where('status', '==', 'active')
    );
    const clientsSnapshot = await getDocs(clientsQuery);
    
    let totalJobsCreated = 0;
    
    // Check each client to see if they need a job for this week
    for (const clientDoc of clientsSnapshot.docs) {
      const client = { id: clientDoc.id, ...clientDoc.data() } as Client;
      
      if (!client.nextVisit || !client.frequency || client.frequency === 'one-off') {
        continue; // Skip one-off clients or clients without proper data
      }
      
      // Calculate if this client should have a job this week
      let visitDate = parseISO(client.nextVisit);
      const targetWeek = parseISO(weekStartDate);
      
      // Find the next occurrence that matches or is after the target week
      while (isBefore(visitDate, targetWeek)) {
        visitDate = addWeeks(visitDate, Number(client.frequency));
      }
      
      // Check if this visit date falls within the target week
      const weekEnd = addWeeks(targetWeek, 1);
      if (visitDate >= targetWeek && visitDate < weekEnd) {
        // Check if a job already exists for this client on this date
        const weekStr = format(visitDate, 'yyyy-MM-dd');
        
        // Use a simpler query that doesn't require composite indexes
        const existingJobsQuery = query(
          collection(db, JOBS_COLLECTION),
          where('clientId', '==', client.id)
        );
        
        const existingJobs = await getDocs(existingJobsQuery);
        
        // Check if any existing job matches this date (client-side filtering)
        const jobExistsForDate = existingJobs.docs.some(doc => {
          const jobData = doc.data();
          const jobDate = jobData.scheduledTime;
          if (!jobDate) return false;
          
          // Check if the job is scheduled for the same date
          const jobDateStr = jobDate.split('T')[0]; // Get just the date part
          return jobDateStr === weekStr;
        });
        
        // Only create job if no existing job for this date
        if (!jobExistsForDate) {
          await createJob({
            clientId: client.id,
            providerId: 'test-provider-1',
            serviceId: 'window-cleaning',
            propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
            scheduledTime: weekStr + 'T09:00:00',
            status: 'pending',
            price: typeof client.quote === 'number' ? client.quote : 25,
            paymentStatus: 'unpaid',
          });
          totalJobsCreated++;
        }
      }
    }
    
    return totalJobsCreated;
  } catch (error) {
    console.error('Error creating jobs for week:', error);
    throw error;
  }
}

/**
 * Handles the weekly rollover process
 * This should be called at 00:00:00 every Monday
 * 1. Moves completed jobs from the previous week to 'accounted' status
 * 2. Creates jobs for the new week for all active clients
 */
export async function handleWeeklyRollover(): Promise<{ jobsCreated: number; jobsAccounted: number }> {
  try {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const previousWeekStart = addWeeks(currentWeekStart, -1);
    const previousWeekEnd = addWeeks(previousWeekStart, 1);
    
    // 1. Move all completed jobs from the previous week to 'accounted' status
    const previousWeekStartStr = format(previousWeekStart, 'yyyy-MM-dd');
    const previousWeekEndStr = format(previousWeekEnd, 'yyyy-MM-dd');
    
    const completedJobsQuery = query(
      collection(db, JOBS_COLLECTION),
      where('scheduledTime', '>=', previousWeekStartStr + 'T00:00:00'),
      where('scheduledTime', '<', previousWeekEndStr + 'T00:00:00'),
      where('status', '==', 'completed')
    );
    
    const completedJobsSnapshot = await getDocs(completedJobsQuery);
    let jobsAccounted = 0;
    
    if (!completedJobsSnapshot.empty) {
      const batch = writeBatch(db);
      completedJobsSnapshot.forEach(doc => {
        batch.update(doc.ref, { status: 'accounted' });
      });
      await batch.commit();
      jobsAccounted = completedJobsSnapshot.size;
    }
    
    // 2. Create jobs for the new week (8 weeks from now)
    const newWeekStart = addWeeks(currentWeekStart, 8);
    const newWeekStartStr = format(newWeekStart, 'yyyy-MM-dd');
    const jobsCreated = await createJobsForWeek(newWeekStartStr);
    
    return { jobsCreated, jobsAccounted };
  } catch (error) {
    console.error('Error in weekly rollover:', error);
    throw error;
  }
}

export async function generateRecurringJobs() {
  const querySnapshot = await getDocs(collection(db, 'clients'));
  const today = new Date();
  const jobsRef = collection(db, 'jobs');
  
  const jobsToCreate: any[] = [];
  querySnapshot.forEach((docSnap) => {
    const client: any = { id: docSnap.id, ...docSnap.data() };
    if (!client.nextVisit || !client.frequency || client.frequency === 'one-off') return;
    let visitDate = parseISO(client.nextVisit);
    for (let i = 0; i < 8; i++) { // Generate for 8 weeks
      if (isBefore(visitDate, today)) {
        visitDate = addWeeks(visitDate, Number(client.frequency));
        continue;
      }
      const weekStr = format(visitDate, 'yyyy-MM-dd');

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
      
      visitDate = addWeeks(visitDate, Number(client.frequency));
    }
  });
  await Promise.all(jobsToCreate.map(job => addDoc(jobsRef, job)));
} 