import { addWeeks, format, isBefore, parseISO, startOfWeek } from 'date-fns';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { USE_SERVICE_PLANS_GENERATION } from '../shared/features';
import type { Client } from '../types/client';
import type { Job } from '../types/models';
import type { ServicePlan } from '../types/servicePlan';
import { deactivatePlanIfPastLastService, getNextFutureAnchor, getServicePlansForClient } from './servicePlanService';

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
  
  // Get client information to include gocardless fields
  let gocardlessEnabled = false;
  let gocardlessCustomerId: string | undefined;
  
  try {
    const clientDoc = await getDoc(doc(db, 'clients', job.clientId));
    if (clientDoc.exists()) {
      const client = clientDoc.data();
      gocardlessEnabled = client.gocardlessEnabled || false;
      gocardlessCustomerId = client.gocardlessCustomerId;
    }
  } catch (error) {
    console.warn('Failed to fetch client gocardless info for job creation:', error);
    // Continue with job creation even if client fetch fails
  }
  
  const jobsRef = collection(db, JOBS_COLLECTION);
  
  // Build job data, filtering out undefined values that Firebase doesn't allow
  const jobData: any = {
    ...job, 
    ownerId,
    gocardlessEnabled
  };
  
  // Only include gocardlessCustomerId if it has a value
  if (gocardlessCustomerId) {
    jobData.gocardlessCustomerId = gocardlessCustomerId;
  }
  
  const docRef = await addDoc(jobsRef, jobData);
  
  // Trigger capacity redistribution for future weeks when a new job is added
  try {
    // Only trigger if the job is scheduled for a future week
    const jobDate = parseISO(job.scheduledTime);
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const jobWeekStart = startOfWeek(jobDate, { weekStartsOn: 1 });
    
    if (jobWeekStart > currentWeekStart) {
      // Dynamically import to avoid circular dependencies
      const { triggerCapacityRedistribution } = await import('./capacityService');
      await triggerCapacityRedistribution('job_added', [jobWeekStart]);
    }
  } catch (error) {
    console.warn('Failed to trigger capacity redistribution after job creation:', error);
    // Don't fail the job creation if capacity redistribution fails
  }
  
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

export async function updateJobStatus(jobId: string, status: Job['status'], completionSequence?: number) {
  const jobRef = doc(db, JOBS_COLLECTION, jobId);
  const updateData: any = { status };
  
  // If marking as completed, also save the completion sequence and date
  if (status === 'completed' && completionSequence !== undefined) {
    updateData.completionSequence = completionSequence;
    updateData.completedAt = new Date().toISOString();
  } else if (status !== 'completed') {
    // If unmarking as complete (undo), remove completion data
    updateData.completionSequence = null;
    updateData.completedAt = null;
  }
  
  await updateDoc(jobRef, updateData);
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
 * Creates jobs for a specific client for the next year (52 weeks) worth of occurrences
 * This function ensures no duplicate jobs are created
 */
export async function createJobsForClient(clientId: string, maxWeeks: number = 52, skipTodayIfComplete: boolean = false): Promise<number> {
  try {
    // New logic: use service plans if present; otherwise, fall back to legacy client fields
    let totalJobsCreated = 0;

    const ownerId = await getDataOwnerId();
    if (!ownerId) return 0;
    const client = await getClientById(clientId);
    if (!client) return 0;

    const plans: ServicePlan[] = USE_SERVICE_PLANS_GENERATION ? await getServicePlansForClient(clientId) : [];
    if (USE_SERVICE_PLANS_GENERATION && plans.length > 0) {
      // Generate from service plans
      for (const plan of plans) {
        await deactivatePlanIfPastLastService(plan.id);
        if (!plan.isActive) continue;

        const anchor = await getNextFutureAnchor(plan);
        if (!anchor) continue;

        const jobsToCreate: Omit<Job, 'id'>[] = [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let visitDate = parseISO(anchor);

        // Check if today is marked complete if requested
        let skipToday = false;
        if (skipTodayIfComplete) {
          try {
            const weekStart = startOfWeek(today, { weekStartsOn: 1 });
            const weekStartStr = format(weekStart, 'yyyy-MM-dd');
            const completedDoc = await getDoc(doc(db, 'completedWeeks', `${ownerId}_${weekStartStr}`));
            if (completedDoc.exists()) {
              const data = completedDoc.data();
              const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
              const todayDay = daysOfWeek[today.getDay() - 1];
              if (data.completedDays && data.completedDays.includes(todayDay)) skipToday = true;
            }
          } catch {}
        }

        for (let i = 0; i < maxWeeks; i++) {
          // Respect lastServiceDate
          if (plan.lastServiceDate && isBefore(parseISO(plan.lastServiceDate), visitDate)) break;

          const weekStr = format(visitDate, 'yyyy-MM-dd');
          // Dedup: does job already exist for this date/service?
          // Check both current scheduledTime AND originalScheduledTime (for moved jobs)
          const existingJobsQuery = query(
            collection(db, JOBS_COLLECTION),
            where('ownerId', '==', ownerId),
            where('clientId', '==', clientId)
          );
          const existingJobs = await getDocs(existingJobsQuery);
          const jobExistsForDate = existingJobs.docs.some(doc => {
            const jobData = doc.data();
            const jobDate = jobData.scheduledTime;
            const originalDate = jobData.originalScheduledTime;
            if (!jobDate) return false;
            const jobDateStr = jobDate.split('T')[0];
            const originalDateStr = originalDate ? originalDate.split('T')[0] : null;
            // Match if current date OR original date (before move) matches the target date
            const dateMatches = jobDateStr === weekStr || originalDateStr === weekStr;
            return dateMatches && jobData.serviceId === plan.serviceType;
          });

          const isToday = visitDate.getTime() === today.getTime();
          if (!jobExistsForDate && !(skipToday && isToday)) {
            jobsToCreate.push({
              ownerId,
              clientId: client.id,
              providerId: 'test-provider-1',
              serviceId: plan.serviceType,
              propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
              scheduledTime: weekStr + 'T09:00:00',
              status: 'pending',
              price: Number(plan.price) || (typeof client.quote === 'number' ? client.quote : 25),
              paymentStatus: 'unpaid',
            });
          }

          if (plan.scheduleType === 'recurring' && plan.frequencyWeeks) {
            visitDate = addWeeks(visitDate, plan.frequencyWeeks);
          } else {
            break; // one-off
          }
        }

        if (jobsToCreate.length > 0) {
          const batch = writeBatch(db);
          jobsToCreate.forEach(job => {
            const newJobRef = doc(collection(db, JOBS_COLLECTION));
            const jobData: any = {
              ...job,
              gocardlessEnabled: client.gocardlessEnabled || false,
            };
            if (client.gocardlessCustomerId) jobData.gocardlessCustomerId = client.gocardlessCustomerId;
            batch.set(newJobRef, jobData);
          });
          await batch.commit();
          totalJobsCreated += jobsToCreate.length;
        }
      }

      return totalJobsCreated;
    }

    // Legacy fallback path (until all clients are migrated)
    // Existing logic remains unchanged below
    // Create regular window cleaning jobs if client has recurring frequency
    if (client.nextVisit && client.frequency && client.frequency !== 'one-off') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let visitDate = parseISO(client.nextVisit);
      const jobsToCreate: Omit<Job, 'id'>[] = [];
      let skipToday = false;
      if (skipTodayIfComplete) {
        try {
          const weekStart = startOfWeek(today, { weekStartsOn: 1 });
          const weekStartStr = format(weekStart, 'yyyy-MM-dd');
          const completedDoc = await getDoc(doc(db, 'completedWeeks', `${ownerId}_${weekStartStr}`));
          if (completedDoc.exists()) {
            const data = completedDoc.data();
            const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const todayDay = daysOfWeek[today.getDay() - 1];
            if (data.completedDays && data.completedDays.includes(todayDay)) skipToday = true;
          }
        } catch {}
      }

      for (let i = 0; i < maxWeeks; i++) {
        if (isBefore(visitDate, today)) {
          visitDate = addWeeks(visitDate, Number(client.frequency));
          continue;
        }
        const weekStr = format(visitDate, 'yyyy-MM-dd');
        // Dedup: Check both current scheduledTime AND originalScheduledTime (for moved jobs)
        const existingJobsQuery = query(
          collection(db, JOBS_COLLECTION),
          where('ownerId', '==', ownerId),
          where('clientId', '==', clientId)
        );
        const existingJobs = await getDocs(existingJobsQuery);
        const jobExistsForDate = existingJobs.docs.some(doc => {
          const jobData = doc.data();
          const jobDate = jobData.scheduledTime;
          const originalDate = jobData.originalScheduledTime;
          if (!jobDate) return false;
          const jobDateStr = jobDate.split('T')[0];
          const originalDateStr = originalDate ? originalDate.split('T')[0] : null;
          // Match if current date OR original date (before move) matches the target date
          const dateMatches = jobDateStr === weekStr || originalDateStr === weekStr;
          return dateMatches && jobData.serviceId === 'window-cleaning';
        });
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

      if (jobsToCreate.length > 0) {
        const batch = writeBatch(db);
        jobsToCreate.forEach(job => {
          const newJobRef = doc(collection(db, JOBS_COLLECTION));
          const jobData: any = { ...job, gocardlessEnabled: client.gocardlessEnabled || false };
          if (client.gocardlessCustomerId) jobData.gocardlessCustomerId = client.gocardlessCustomerId;
          batch.set(newJobRef, jobData);
        });
        await batch.commit();
        totalJobsCreated += jobsToCreate.length;
      }
    }

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
        // Also check originalScheduledTime for moved jobs to prevent duplicates
        const jobExistsForDate = existingJobs.docs.some(doc => {
          const jobData = doc.data();
          const jobDate = jobData.scheduledTime;
          const originalDate = jobData.originalScheduledTime;
          if (!jobDate) return false;
          
          // Check if the job is scheduled for the same date OR was originally scheduled for this date
          const jobDateStr = jobDate.split('T')[0]; // Get just the date part
          const originalDateStr = originalDate ? originalDate.split('T')[0] : null;
          return jobDateStr === weekStr || originalDateStr === weekStr;
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

      // Build job data, filtering out undefined values
      const jobData: any = {
        ownerId,
        clientId: client.id,
        providerId: 'test-provider-1',
        serviceId: 'window-cleaning',
        propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
        scheduledTime: weekStr + 'T09:00:00',
        status: 'pending',
        price: typeof client.quote === 'number' ? client.quote : 25,
        paymentStatus: 'unpaid',
        gocardlessEnabled: client.gocardlessEnabled || false,
      };
      
      // Only include gocardlessCustomerId if it has a value
      if (client.gocardlessCustomerId) {
        jobData.gocardlessCustomerId = client.gocardlessCustomerId;
      }
      
      jobsToCreate.push(jobData);
      
      visitDate = addWeeks(visitDate, Number(client.frequency));
    }
  });
  await Promise.all(jobsToCreate.map(job => addDoc(jobsRef, job)));
}

/**
 * Creates jobs for additional recurring services for a specific client
 */
export async function createJobsForServicePlan(plan: ServicePlan, client: Client, weeksAhead: number = 52): Promise<number> {
  if (!plan.isActive || plan.scheduleType !== 'recurring' || !plan.frequencyWeeks || !plan.startDate) {
    return 0;
  }
  
  const ownerId = await getDataOwnerId();
  if (!ownerId) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let visitDate = parseISO(plan.startDate);
  visitDate.setHours(0, 0, 0, 0);
  
  // If the start date is in the past, calculate the next occurrence
  while (visitDate < today) {
    visitDate = addWeeks(visitDate, plan.frequencyWeeks);
  }
  
  const jobsToCreate = [];
  const maxDate = addWeeks(today, weeksAhead);
  
  while (visitDate <= maxDate) {
    // Respect lastServiceDate
    if (plan.lastServiceDate && visitDate > parseISO(plan.lastServiceDate)) break;
    
    const weekStr = format(visitDate, 'yyyy-MM-dd');
    
    // Check if job already exists for this date/service
    // First get all jobs for this client and service
    const existingJobsQuery = query(
      collection(db, JOBS_COLLECTION),
      where('ownerId', '==', ownerId),
      where('clientId', '==', client.id)
    );
    const existingJobsSnapshot = await getDocs(existingJobsQuery);
    
    // Then filter in memory for the specific service and date
    // Also check originalScheduledTime for moved jobs to prevent duplicates
    const existingJobs = existingJobsSnapshot.docs.filter(doc => {
      const data = doc.data();
      if (data.serviceId !== plan.serviceType) return false;
      if (!data.scheduledTime) return false;
      const jobDate = data.scheduledTime.split('T')[0];
      const originalDate = data.originalScheduledTime ? data.originalScheduledTime.split('T')[0] : null;
      // Match if current date OR original date (before move) matches the target date
      return jobDate === weekStr || originalDate === weekStr;
    });
    
    if (existingJobs.length === 0) {
      jobsToCreate.push({
        ownerId,
        clientId: client.id,
        providerId: 'test-provider-1',
        serviceId: plan.serviceType,
        propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
        scheduledTime: weekStr + 'T09:00:00',
        status: 'pending' as const,
        price: Number(plan.price),
        paymentStatus: 'unpaid' as const,
        gocardlessEnabled: client.gocardlessEnabled || false,
        gocardlessCustomerId: client.gocardlessCustomerId,
      });
    }
    
    visitDate = addWeeks(visitDate, plan.frequencyWeeks);
  }
  
  // Create jobs in batch
  if (jobsToCreate.length > 0) {
    const batch = writeBatch(db);
    jobsToCreate.forEach(jobData => {
      // Remove undefined gocardlessCustomerId if not present
      if (!jobData.gocardlessCustomerId) {
        delete (jobData as any).gocardlessCustomerId;
      }
      const docRef = doc(collection(db, JOBS_COLLECTION));
      batch.set(docRef, jobData);
    });
    await batch.commit();
  }
  
  return jobsToCreate.length;
}

export async function createJobsForAdditionalServices(clientId: string, maxWeeks: number = 52): Promise<number> {
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
        // Also check originalScheduledTime for moved jobs to prevent duplicates
        const jobExistsForDateAndService = existingJobs.docs.some(doc => {
          const jobData = doc.data();
          const jobDate = jobData.scheduledTime;
          const originalDate = jobData.originalScheduledTime;
          if (!jobDate) return false;

          const jobDateStr = jobDate.split('T')[0];
          const originalDateStr = originalDate ? originalDate.split('T')[0] : null;
          // Match if current date OR original date (before move) matches the target date
          const dateMatches = jobDateStr === serviceDateStr || originalDateStr === serviceDateStr;
          return dateMatches && jobData.serviceId === service.serviceType;
        });

        // Only create job if no existing job for this date and service
        if (!jobExistsForDateAndService) {
          // Build job data, filtering out undefined values
          const jobData: any = {
            ownerId,
            clientId: client.id,
            providerId: 'test-provider-1',
            serviceId: service.serviceType,
            propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
            scheduledTime: serviceDateStr + 'T09:00:00',
            status: 'pending',
            price: service.price,
            paymentStatus: 'unpaid',
            gocardlessEnabled: client.gocardlessEnabled || false,
          };
          
          // Only include gocardlessCustomerId if it has a value
          if (client.gocardlessCustomerId) {
            jobData.gocardlessCustomerId = client.gocardlessCustomerId;
          }
          
          jobsToCreate.push(jobData);
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

/**
 * Gets the count of all jobs for the current owner
 */
export async function getJobCount(): Promise<number> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.error('getJobCount: No owner ID found - authentication issue');
      return 0;
    }

    const jobsQuery = query(
      collection(db, JOBS_COLLECTION),
      where('ownerId', '==', ownerId)
    );
    
    const snapshot = await getDocs(jobsQuery);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting job count:', error);
    return 0;
  }
}

/**
 * Deletes all jobs for the current owner
 * WARNING: This is a destructive operation that cannot be undone
 */
export async function deleteAllJobs(): Promise<{ deleted: number; error?: string }> {
  try {
    console.log('deleteAllJobs: Starting deletion process...');
    
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.error('deleteAllJobs: No owner ID found - authentication issue');
      throw new Error('Not authenticated - unable to determine account owner');
    }

    console.log('deleteAllJobs: Owner ID confirmed:', ownerId);

    // Query ALL jobs for this owner (no status filter - delete everything)
    const jobsQuery = query(
      collection(db, JOBS_COLLECTION),
      where('ownerId', '==', ownerId)
    );
    
    const snapshot = await getDocs(jobsQuery);
    console.log('deleteAllJobs: Found', snapshot.size, 'jobs to delete');
    
    if (snapshot.empty) {
      return { deleted: 0 };
    }

    // Delete in batches (Firestore limit is 500 operations per batch)
    const batchSize = 500;
    let deleted = 0;
    
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchDocs = snapshot.docs.slice(i, i + batchSize);
      
      batchDocs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      deleted += batchDocs.length;
      console.log('deleteAllJobs: Deleted batch', Math.floor(i / batchSize) + 1, 'of', Math.ceil(snapshot.docs.length / batchSize));
    }

    console.log('deleteAllJobs: Successfully deleted', deleted, 'jobs');
    return { deleted };
  } catch (error) {
    console.error('Error deleting all jobs:', error);
    return { deleted: 0, error: error instanceof Error ? error.message : 'Unknown error' };
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
    const todayDay = daysOfWeek[today.getDay() === 0 ? 6 : today.getDay() - 1];
    if (data.completedDays && data.completedDays.includes(todayDay)) {
      return true;
    }
  }
  return false;
}

