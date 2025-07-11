import { addWeeks, format, getDay, isBefore, parseISO, startOfWeek } from 'date-fns';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/supabase';
import type { Client } from '../types/client';
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
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('User not authenticated');
  const jobsRef = collection(db, JOBS_COLLECTION);
  const docRef = await addDoc(jobsRef, { ...job, ownerId });
  return docRef.id;
}

export async function getJobsForProvider(providerId: string): Promise<Job[]> {
  const jobsRef = collection(db, JOBS_COLLECTION);
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  const q = query(jobsRef, where('ownerId', '==', ownerId), where('providerId', '==', providerId));
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
  const jobsRef = collection(db, JOBS_COLLECTION);
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  const nextDay = new Date(endDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const inclusiveEndDate = format(nextDay, 'yyyy-MM-dd');
  const q = query(
    jobsRef,
    where('ownerId', '==', ownerId),
    where('scheduledTime', '>=', startDate + 'T00:00:00'),
    where('scheduledTime', '<', inclusiveEndDate + 'T00:00:00')
  );
  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Job));
  } catch (error: any) {
    console.warn('getJobsForWeek: primary query failed (likely missing composite index)', error);
    // Fallback: fetch by ownerId only, then filter client-side by date range
    const ownerOnlyQuery = query(jobsRef, where('ownerId', '==', ownerId));
    const fallbackSnap = await getDocs(ownerOnlyQuery);
    return fallbackSnap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Job))
      .filter(job => job.scheduledTime >= startDate + 'T00:00:00' && job.scheduledTime < inclusiveEndDate + 'T00:00:00');
  }
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
export async function createJobsForClient(clientId: string, maxWeeks: number = 8, skipTodayIfComplete: boolean = false): Promise<number> {
  try {
    // Get the client data
    const client = await getClientById(clientId);
    if (!client) {
      return 0;
    }

    let totalJobsCreated = 0;

    // Create regular window cleaning jobs if client has recurring frequency
    if (client.nextVisit && client.frequency && client.frequency !== 'one-off') {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day
      
      let visitDate = parseISO(client.nextVisit);
      const jobsToCreate: Omit<Job, 'id'>[] = [];
      
      // Check if today is marked as complete if skipTodayIfComplete is true
      let skipToday = false;
      if (skipTodayIfComplete) {
        try {
          const ownerId = await getDataOwnerId();
          const weekStart = startOfWeek(today, { weekStartsOn: 1 });
          const weekStartStr = format(weekStart, 'yyyy-MM-dd');
          const completedDoc = await getDoc(doc(db, 'completedWeeks', `${ownerId}_${weekStartStr}`));
          if (completedDoc.exists()) {
            const data = completedDoc.data();
            const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const todayDay = daysOfWeek[today.getDay() - 1];
            if (data.completedDays && data.completedDays.includes(todayDay)) {
              skipToday = true;
            }
          }
        } catch (e) {}
      }
      
      // Generate regular window cleaning jobs for the specified number of weeks
      for (let i = 0; i < maxWeeks; i++) {
        // Only generate jobs for today (if not complete) and future dates
        if (isBefore(visitDate, today)) {
          visitDate = addWeeks(visitDate, Number(client.frequency));
          continue;
        }
        
        const weekStr = format(visitDate, 'yyyy-MM-dd');
        
        // Check if a job already exists for this client on this date
        // Use a simpler query that doesn't require composite indexes
        const ownerId = await getDataOwnerId();
        if (!ownerId) continue;
        const existingJobsQuery = query(
          collection(db, JOBS_COLLECTION),
          where('ownerId', '==', ownerId),
          where('clientId', '==', clientId)
        );
        
        const existingJobs = await getDocs(existingJobsQuery);
        
        // Check if any existing job matches this date and is window cleaning (client-side filtering)
        const jobExistsForDate = existingJobs.docs.some(doc => {
          const jobData = doc.data();
          const jobDate = jobData.scheduledTime;
          if (!jobDate) return false;
          
          // Check if the job is scheduled for the same date and is window cleaning
          const jobDateStr = jobDate.split('T')[0]; // Get just the date part
          return jobDateStr === weekStr && jobData.serviceId === 'window-cleaning';
        });
        
        // Only create job if no existing job for this date and not skipping today if today is complete
        const isToday = visitDate.getTime() === today.getTime();
        if (!jobExistsForDate && !(skipToday && isToday)) {
          jobsToCreate.push({
            ownerId,
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
      
      // Create all regular window cleaning jobs in a batch
      if (jobsToCreate.length > 0) {
        const batch = writeBatch(db);
        jobsToCreate.forEach(job => {
          const newJobRef = doc(collection(db, JOBS_COLLECTION));
          batch.set(newJobRef, job);
        });
        await batch.commit();
        totalJobsCreated += jobsToCreate.length;
      }
    }

    // Create jobs for additional recurring services
    const additionalJobsCreated = await createJobsForAdditionalServices(clientId, maxWeeks);
    totalJobsCreated += additionalJobsCreated;
    
    return totalJobsCreated;
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
    const ownerId = await getDataOwnerId();
    if (!ownerId) return 0;
    const clientsQuery = query(
      collection(db, 'clients'),
      where('status', '==', 'active'),
      where('ownerId', '==', ownerId)
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
          where('ownerId', '==', ownerId),
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
 * 1. Moves completed jobs from the previous week to 'completed' status
 * 2. Creates jobs for the new week for all active clients
 */
export async function handleWeeklyRollover(): Promise<{ jobsCreated: number; jobsCompleted: number }> {
  try {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const previousWeekStart = addWeeks(currentWeekStart, -1);
    const previousWeekEnd = addWeeks(previousWeekStart, 1);
    
    // 1. Move all completed jobs from the previous week to 'completed' status
    const previousWeekStartStr = format(previousWeekStart, 'yyyy-MM-dd');
    const previousWeekEndStr = format(previousWeekEnd, 'yyyy-MM-dd');
    
    const completedJobsQuery = query(
      collection(db, JOBS_COLLECTION),
      where('scheduledTime', '>=', previousWeekStartStr + 'T00:00:00'),
      where('scheduledTime', '<', previousWeekEndStr + 'T00:00:00'),
      where('status', '==', 'completed')
    );
    
    const completedJobsSnapshot = await getDocs(completedJobsQuery);
    let jobsCompleted = 0;
    
    if (!completedJobsSnapshot.empty) {
      const batch = writeBatch(db);
      completedJobsSnapshot.forEach(doc => {
        batch.update(doc.ref, { status: 'completed' });
      });
      await batch.commit();
      jobsCompleted = completedJobsSnapshot.size;
    }
    
    // 2. Create jobs for the new week (8 weeks from now)
    const newWeekStart = addWeeks(currentWeekStart, 8);
    const newWeekStartStr = format(newWeekStart, 'yyyy-MM-dd');
    const jobsCreated = await createJobsForWeek(newWeekStartStr);
    
    return { jobsCreated, jobsCompleted };
  } catch (error) {
    console.error('Error in weekly rollover:', error);
    throw error;
  }
}

export async function generateRecurringJobs() {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return;
  const querySnapshot = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
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
        ownerId,
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

/**
 * Creates jobs for additional recurring services for a specific client
 */
export async function createJobsForAdditionalServices(clientId: string, maxWeeks: number = 8): Promise<number> {
  try {
    const client = await getClientById(clientId);
    if (!client || !client.additionalServices || client.additionalServices.length === 0) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ownerId = await getDataOwnerId();
    if (!ownerId) return 0;

    const jobsToCreate: Omit<Job, 'id'>[] = [];

    // Process each additional service
    for (const service of client.additionalServices) {
      if (!service.isActive) continue;

      let serviceDate = parseISO(service.nextVisit);
      
      // Generate jobs for this service for the specified number of weeks
      for (let i = 0; i < maxWeeks; i++) {
        // Only generate jobs for today and future dates
        if (isBefore(serviceDate, today)) {
          serviceDate = addWeeks(serviceDate, service.frequency);
          continue;
        }

        const serviceDateStr = format(serviceDate, 'yyyy-MM-dd');

        // Check if a job already exists for this service on this date
        const existingJobsQuery = query(
          collection(db, JOBS_COLLECTION),
          where('ownerId', '==', ownerId),
          where('clientId', '==', clientId)
        );

        const existingJobs = await getDocs(existingJobsQuery);

        // Check if any existing job matches this date and service type
        const jobExistsForDateAndService = existingJobs.docs.some(doc => {
          const jobData = doc.data();
          const jobDate = jobData.scheduledTime;
          if (!jobDate) return false;

          const jobDateStr = jobDate.split('T')[0];
          return jobDateStr === serviceDateStr && jobData.serviceId === service.serviceType;
        });

        // Only create job if no existing job for this date and service
        if (!jobExistsForDateAndService) {
          jobsToCreate.push({
            ownerId,
            clientId: client.id,
            providerId: 'test-provider-1',
            serviceId: service.serviceType,
            propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
            scheduledTime: serviceDateStr + 'T09:00:00',
            status: 'pending',
            price: service.price,
            paymentStatus: 'unpaid',
          });
        }

        serviceDate = addWeeks(serviceDate, service.frequency);
      }
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
    console.error('Error creating jobs for additional services:', error);
    throw error;
  }
}

// Utility to check if today is marked as complete in completedWeeks
export async function isTodayMarkedComplete(): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const ownerId = await getDataOwnerId();
  const completedDoc = await getDoc(doc(db, 'completedWeeks', `${ownerId}_${weekStartStr}`));
  if (completedDoc.exists()) {
    const data = completedDoc.data();
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    // getDay: 0=Sunday, 1=Monday, ...
    const todayDay = daysOfWeek[getDay(today) === 0 ? 6 : getDay(today) - 1];
    if (data.completedDays && data.completedDays.includes(todayDay)) {
      return true;
    }
  }
  return false;
}

