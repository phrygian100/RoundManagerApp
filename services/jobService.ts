import { addMonths, addWeeks, format, isBefore, parseISO, startOfWeek } from 'date-fns';
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
    accountId: ownerId, // Explicitly set accountId for Firestore rules (getDataOwnerId returns accountId)
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
  
  // Read current state so we only trigger follow-up logic on true transitions.
  let previousStatus: Job['status'] | undefined;
  let shouldTriggerTopUp = false;
  try {
    if (status === 'completed') {
      const snap = await getDoc(jobRef);
      if (snap.exists()) {
        const data: any = snap.data();
        previousStatus = data?.status;
        // Only trigger once when transitioning into completed
        shouldTriggerTopUp = previousStatus !== 'completed';
      }
    }
  } catch (e) {
    // If we can't read the job doc (rules / transient), don't block completion.
    // We also won't attempt top-up because we can't safely determine transition.
    shouldTriggerTopUp = false;
  }
  
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

  // After marking a job completed, ensure future recurring jobs exist (24-month rolling window).
  // This is best-effort: never block job completion if generation fails.
  if (status === 'completed' && shouldTriggerTopUp) {
    try {
      await topUpRecurringJobsAfterCompletion(jobId, 24);
    } catch (e) {
      console.warn('updateJobStatus: schedule top-up failed (non-fatal)', e);
    }
  }
}

export async function deleteJob(jobId: string): Promise<void> {
  const jobRef = doc(db, JOBS_COLLECTION, jobId);
  await deleteDoc(jobRef);
}

function dateOnlyFromIsoDateTime(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  return value.includes('T') ? value.split('T')[0] : value;
}

function parseFlexibleDateOnly(value: any): Date | null {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;

  // Accept `yyyy-MM-dd` (Firestore / HTML date input value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return normalizeMidnight(parseISO(s));
    } catch {
      return null;
    }
  }

  // Accept legacy `dd/MM/yyyy` or `dd-MM-yyyy`
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
    if (yyyy < 1900 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    // Use local time midnight; JS Date months are 0-based.
    const d = new Date(yyyy, mm - 1, dd);
    if (Number.isNaN(d.getTime())) return null;
    return normalizeMidnight(d);
  }

  // Fallback: try Date parsing (last resort)
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return normalizeMidnight(d);
}

function normalizeMidnight(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isUpcomingStatus(status: any): boolean {
  return status === 'pending' || status === 'scheduled' || status === 'in_progress';
}

async function getActiveRecurringPlanForService(clientId: string, serviceId: string): Promise<ServicePlan | null> {
  const plans = await getServicePlansForClient(clientId);
  const match = plans.find(p => p.serviceType === serviceId && p.isActive && p.scheduleType === 'recurring');
  return match || null;
}

export type BackfillRecurringSchedulesResult = {
  plansScanned: number;
  clientsScanned: number;
  plansBackfilled: number;
  clientsAffected: number;
  jobsCreated: number;
  // Small debug payload for UI display (bounded)
  affectedClients?: Array<{
    clientId: string;
    name?: string;
    accountNumber?: string;
    servicesBackfilled: string[];
    jobsCreated: number;
  }>;
};

/**
 * Manual maintenance tool:
 * For each active recurring service plan, if the client has NO upcoming jobs for that service,
 * generate a rolling window of jobs for the next `monthsAhead` months.
 *
 * This is intended to repair clients who currently show "No pending jobs" despite having active plans.
 *
 * Notes:
 * - Only considers `servicePlans` (does not use legacy client frequency/nextVisit).
 * - Only applies to `isActive: true` + `scheduleType: 'recurring'` plans.
 * - Dedupe is date-level for (clientId + serviceId), using both `scheduledTime` and `originalScheduledTime`.
 * - Respects `lastServiceDate` as an inclusive hard stop.
 */
export async function backfillRecurringSchedulesForActivePlans(monthsAhead: number = 24): Promise<BackfillRecurringSchedulesResult> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) {
    return { plansScanned: 0, clientsScanned: 0, plansBackfilled: 0, clientsAffected: 0, jobsCreated: 0 };
  }

  const today = normalizeMidnight(new Date());

  // Fetch plans for this account.
  // IMPORTANT: In some legacy/team-created docs, `ownerId` may be a member UID while `accountId`
  // is the true account owner. We scan BOTH and merge, then filter client-side.
  const plansByOwnerSnap = await getDocs(query(
    collection(db, 'servicePlans'),
    where('ownerId', '==', ownerId),
  ));
  const plansByAccountSnap = await getDocs(query(
    collection(db, 'servicePlans'),
    where('accountId', '==', ownerId),
  ));

  const planMap = new Map<string, any>();
  plansByOwnerSnap.docs.forEach(d => planMap.set(d.id, { id: d.id, ...(d.data() as any) }));
  plansByAccountSnap.docs.forEach(d => planMap.set(d.id, { id: d.id, ...(d.data() as any) }));

  const allPlans = Array.from(planMap.values()) as ServicePlan[];
  const recurringPlans = allPlans
    .map((p: any) => {
      if (!p) return null;
      const scheduleType = typeof p.scheduleType === 'string' ? p.scheduleType.trim().toLowerCase() : '';
      const freq = Number(p.frequencyWeeks);
      return {
        ...p,
        scheduleType,
        frequencyWeeks: freq,
      } as any as ServicePlan;
    })
    .filter((p: any) =>
      p &&
      p.isActive === true &&
      p.scheduleType === 'recurring' &&
      typeof p.clientId === 'string' &&
      typeof p.serviceType === 'string' &&
      Number.isFinite(p.frequencyWeeks) &&
      p.frequencyWeeks > 0
    ) as ServicePlan[];

  // Load all clients for this owner and exclude archived (ex-client).
  // IMPORTANT: Same as above, scan BOTH `ownerId` and `accountId` and merge.
  const clientsByOwnerSnap = await getDocs(query(
    collection(db, 'clients'),
    where('ownerId', '==', ownerId)
  ));
  const clientsByAccountSnap = await getDocs(query(
    collection(db, 'clients'),
    where('accountId', '==', ownerId)
  ));

  const clientMap = new Map<string, any>();
  clientsByOwnerSnap.docs.forEach(d => clientMap.set(d.id, { id: d.id, ...(d.data() as any) }));
  clientsByAccountSnap.docs.forEach(d => clientMap.set(d.id, { id: d.id, ...(d.data() as any) }));

  const clients = Array.from(clientMap.values()) as any[];
  const activeClients = clients.filter(c => (c?.status || '') !== 'ex-client');

  // Group plans by clientId so we can load jobs once per client.
  const plansByClient = new Map<string, ServicePlan[]>();
  for (const plan of recurringPlans) {
    const cid = plan.clientId;
    const arr = plansByClient.get(cid) || [];
    arr.push(plan);
    plansByClient.set(cid, arr);
  }

  let plansBackfilled = 0;
  let clientsAffected = 0;
  let jobsCreated = 0;
  const affectedClients: BackfillRecurringSchedulesResult['affectedClients'] = [];

  // Only consider clients that have at least one active recurring plan.
  const candidateClients = activeClients.filter(c => plansByClient.has(c.id));

  for (const c of candidateClients) {
    const clientId = c.id;
    const clientPlans = plansByClient.get(clientId) || [];
    if (clientPlans.length === 0) continue;

    // Use the client record we already loaded (includes address parts, quote, GoCardless flags, etc.)
    const client: any = c;

    // Load all jobs for this client once; filter in memory.
    const existingSnap = await getDocs(query(
      collection(db, JOBS_COLLECTION),
      where('ownerId', '==', ownerId),
      where('clientId', '==', clientId)
    ));
    const existingJobs = existingSnap.docs.map(d => d.data() as any);

    // Requirement: only backfill clients with 0 upcoming jobs (any service).
    const upcomingCount = existingJobs.filter(j => {
      if (!isUpcomingStatus(j?.status)) return false;
      const dStr = dateOnlyFromIsoDateTime(j?.scheduledTime);
      const d = dStr ? parseFlexibleDateOnly(dStr) : null;
      if (!d) return false;
      return !isBefore(d, today);
    }).length;
    if (upcomingCount > 0) continue;

    let clientCreatedAny = 0;
    const servicesBackfilledForClient: string[] = [];

    for (const plan of clientPlans) {
      const serviceId = plan.serviceType;

      // Respect lastServiceDate: if it's in the past, treat as inactive.
      if (plan.lastServiceDate) {
        try {
          const last = parseFlexibleDateOnly(plan.lastServiceDate);
          if (!last) throw new Error('Invalid lastServiceDate');
          if (isBefore(last, today)) continue;
        } catch {
          // Ignore parse failures; proceed.
        }
      }

      const freq = Number((plan as any).frequencyWeeks);
      if (!Number.isFinite(freq) || freq <= 0) continue;

      // Determine anchor from the last completed job for this recurring service.
      // If none exist, fall back to plan.startDate (if parseable).
      const jobsForService = existingJobs
        .filter(j => j && j.serviceId === serviceId && typeof j.scheduledTime === 'string');

      const completedStatuses = new Set(['completed', 'accounted', 'paid']);
      let lastCompleted: Date | null = null;
      let lastAnyPast: Date | null = null;

      for (const j of jobsForService) {
        const dStr = dateOnlyFromIsoDateTime(j.scheduledTime);
        const d = dStr ? parseFlexibleDateOnly(dStr) : null;
        if (!d) continue;
        if (isBefore(d, today) || d.getTime() === today.getTime()) {
          // Track last job of any status in the past/present
          if (!lastAnyPast || d.getTime() > lastAnyPast.getTime()) lastAnyPast = d;
          // Track last completed-like job in the past/present
          if (completedStatuses.has(j.status) && (!lastCompleted || d.getTime() > lastCompleted.getTime())) {
            lastCompleted = d;
          }
        }
      }

      const base = lastCompleted || lastAnyPast;
      let anchorDate: Date | null = null;
      if (base) {
        anchorDate = normalizeMidnight(addWeeks(base, freq));
      } else if (plan.startDate) {
        // If we have no history for this service, use plan.startDate as a seed.
        anchorDate = parseFlexibleDateOnly(plan.startDate);
      }
      if (!anchorDate) continue;

      while (isBefore(anchorDate, today)) {
        anchorDate = normalizeMidnight(addWeeks(anchorDate, freq));
      }

      const horizonEnd = normalizeMidnight(addMonths(anchorDate, Math.max(1, Math.floor(monthsAhead))));

      // Build dedupe keys for this service (scheduled date + original date).
      const existingKeys = new Set<string>();
      for (const j of existingJobs) {
        if (j.serviceId !== serviceId) continue;
        const scheduled = dateOnlyFromIsoDateTime(j.scheduledTime);
        if (scheduled) existingKeys.add(scheduled);
        const original = dateOnlyFromIsoDateTime(j.originalScheduledTime);
        if (original) existingKeys.add(original);
      }

      const toCreate: any[] = [];
      let visitDate = anchorDate;
      while (visitDate.getTime() <= horizonEnd.getTime()) {
        // Respect lastServiceDate as an inclusive hard stop.
        if (plan.lastServiceDate) {
          try {
            const last = parseFlexibleDateOnly(plan.lastServiceDate);
            if (!last) throw new Error('Invalid lastServiceDate');
            if (isBefore(last, visitDate)) break;
          } catch {}
        }

        const dayStr = format(visitDate, 'yyyy-MM-dd');
        if (!existingKeys.has(dayStr)) {
          const jobData: any = {
            ownerId,
            accountId: ownerId,
            clientId: client.id,
            providerId: 'test-provider-1',
            serviceId,
            propertyDetails: `${client.address1 || (client as any).address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
            scheduledTime: dayStr + 'T09:00:00',
            status: 'pending' as const,
            price: Number(plan.price) || (typeof (client as any).quote === 'number' ? (client as any).quote : 25),
            paymentStatus: 'unpaid' as const,
            gocardlessEnabled: (client as any).gocardlessEnabled || false,
          };
          if ((client as any).gocardlessCustomerId) jobData.gocardlessCustomerId = (client as any).gocardlessCustomerId;
          toCreate.push(jobData);
          existingKeys.add(dayStr);
        }

        visitDate = normalizeMidnight(addWeeks(visitDate, freq));
      }

      if (toCreate.length > 0) {
        const batchSize = 450;
        for (let i = 0; i < toCreate.length; i += batchSize) {
          const batch = writeBatch(db);
          const slice = toCreate.slice(i, i + batchSize);
          slice.forEach((jobData) => {
            const ref = doc(collection(db, JOBS_COLLECTION));
            batch.set(ref, jobData);
          });
          await batch.commit();
        }

        plansBackfilled += 1;
        clientCreatedAny += toCreate.length;
        jobsCreated += toCreate.length;
        servicesBackfilledForClient.push(serviceId);

        // Keep plan anchor aligned for UX (so Manage Services shows a future "Next Service").
        try {
          const anchorStr = format(anchorDate, 'yyyy-MM-dd');
          const planStart = plan.startDate ? parseFlexibleDateOnly(plan.startDate) : null;
          if (!planStart || isBefore(planStart, today)) {
            await updateDoc(doc(db, 'servicePlans', plan.id), { startDate: anchorStr, updatedAt: new Date().toISOString() });
          }
        } catch (e) {
          console.warn('backfillRecurringSchedulesForActivePlans: failed to update plan startDate (non-fatal)', e);
        }
      }
    }

    if (clientCreatedAny > 0) {
      clientsAffected += 1;
      if ((affectedClients || []).length < 10) {
        affectedClients?.push({
          clientId,
          name: c?.name,
          accountNumber: c?.accountNumber,
          servicesBackfilled: Array.from(new Set(servicesBackfilledForClient)),
          jobsCreated: clientCreatedAny,
        });
      }
    }
  }

  return {
    plansScanned: recurringPlans.length,
    clientsScanned: candidateClients.length,
    plansBackfilled,
    clientsAffected,
    jobsCreated,
    affectedClients,
  };
}

/**
 * After a job is marked completed, ensure we have a rolling window of future jobs
 * for the matching active recurring service plan.
 *
 * Rules:
 * - Only runs for service plans that are `isActive` and `scheduleType === 'recurring'`.
 * - Uses the next already-scheduled upcoming job for that service as the anchor (if present),
 *   otherwise derives the next occurrence from the completed job date + frequency.
 * - Generates occurrences for `monthsAhead` into the future (default 24 months).
 * - Dedupes by date (yyyy-MM-dd) across both `scheduledTime` and `originalScheduledTime`.
 * - Does NOT generate for ad-hoc/one-off jobs that have no matching recurring service plan.
 */
export async function topUpRecurringJobsAfterCompletion(jobId: string, monthsAhead: number = 24): Promise<number> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return 0;

  const completedJobSnap = await getDoc(doc(db, JOBS_COLLECTION, jobId));
  if (!completedJobSnap.exists()) return 0;
  const completedJob: any = { id: completedJobSnap.id, ...(completedJobSnap.data() as any) };

  const clientId = String(completedJob.clientId || '');
  const serviceId = String(completedJob.serviceId || '');
  if (!clientId || !serviceId) return 0;

  // Only proceed if this job corresponds to an active recurring service plan.
  let plan = await getActiveRecurringPlanForService(clientId, serviceId);
  if (!plan) return 0;

  // Auto-deactivate if past lastServiceDate, then re-check active.
  try {
    await deactivatePlanIfPastLastService(plan.id);
  } catch {}
  // Defensive check: if lastServiceDate is in the past, treat as inactive.
  const today = normalizeMidnight(new Date());
  if (plan.lastServiceDate) {
    const last = parseFlexibleDateOnly(plan.lastServiceDate);
    if (!last) return 0;
    if (isBefore(last, today)) return 0;
  }
  const freq = Number((plan as any).frequencyWeeks);
  if (!plan.isActive || plan.scheduleType !== 'recurring' || !Number.isFinite(freq) || freq <= 0) return 0;

  const client = await getClientById(clientId);
  if (!client) return 0;

  // Load all jobs for this client once; filter in memory to avoid composite index requirements.
  const existingSnap = await getDocs(query(
    collection(db, JOBS_COLLECTION),
    where('ownerId', '==', ownerId),
    where('clientId', '==', clientId)
  ));
  const existingJobs = existingSnap.docs.map(d => d.data() as any);

  // Determine completed job date (midnight)
  const completedDateStr = dateOnlyFromIsoDateTime(completedJob.scheduledTime);
  if (!completedDateStr) return 0;
  const completedDate = parseFlexibleDateOnly(completedDateStr);
  if (!completedDate) return 0;

  // Find the next already-scheduled upcoming job (pending/scheduled/in_progress) for this service after the completed date.
  let nextScheduled: Date | null = null;
  for (const j of existingJobs) {
    if (j.serviceId !== serviceId) continue;
    if (!isUpcomingStatus(j.status)) continue;
    const dStr = dateOnlyFromIsoDateTime(j.scheduledTime);
    if (!dStr) continue;
    const d = parseFlexibleDateOnly(dStr);
    if (!d) continue;
    if (d.getTime() <= completedDate.getTime()) continue;
    if (!nextScheduled || d.getTime() < nextScheduled.getTime()) nextScheduled = d;
  }

  // Choose anchor: next scheduled job if present, otherwise derive from recurrence.
  let anchor = nextScheduled ? nextScheduled : addWeeks(completedDate, freq);
  anchor = normalizeMidnight(anchor);
  while (isBefore(anchor, today)) {
    anchor = normalizeMidnight(addWeeks(anchor, freq));
  }

  const horizonEnd = normalizeMidnight(addMonths(anchor, Math.max(1, Math.floor(monthsAhead))));

  // Build dedupe keys for this service (scheduled date + original date).
  const existingKeys = new Set<string>();
  for (const j of existingJobs) {
    if (j.serviceId !== serviceId) continue;
    const scheduled = dateOnlyFromIsoDateTime(j.scheduledTime);
    if (scheduled) existingKeys.add(scheduled);
    const original = dateOnlyFromIsoDateTime(j.originalScheduledTime);
    if (original) existingKeys.add(original);
  }

  const jobsToCreate: any[] = [];
  let visitDate = anchor;

  while (visitDate.getTime() <= horizonEnd.getTime()) {
    // Respect lastServiceDate as an inclusive hard stop.
    if (plan.lastServiceDate) {
      const last = parseFlexibleDateOnly(plan.lastServiceDate);
      if (!last) break;
      // Break if we've moved beyond the last allowed service date.
      if (isBefore(last, visitDate)) break;
    }

    const dayStr = format(visitDate, 'yyyy-MM-dd');
    if (!existingKeys.has(dayStr)) {
      const jobData: any = {
        ownerId,
        accountId: ownerId, // Explicitly set accountId for Firestore rules
        clientId: client.id,
        providerId: 'test-provider-1',
        serviceId,
        propertyDetails: `${client.address1 || (client as any).address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
        scheduledTime: dayStr + 'T09:00:00',
        status: 'pending' as const,
        price: Number(plan.price) || (typeof (client as any).quote === 'number' ? (client as any).quote : 25),
        paymentStatus: 'unpaid' as const,
        gocardlessEnabled: (client as any).gocardlessEnabled || false,
      };
      if ((client as any).gocardlessCustomerId) jobData.gocardlessCustomerId = (client as any).gocardlessCustomerId;
      jobsToCreate.push(jobData);
      existingKeys.add(dayStr);
    }

    visitDate = normalizeMidnight(addWeeks(visitDate, freq));
  }

  if (jobsToCreate.length > 0) {
    const batchSize = 450;
    for (let i = 0; i < jobsToCreate.length; i += batchSize) {
      const batch = writeBatch(db);
      const slice = jobsToCreate.slice(i, i + batchSize);
      slice.forEach((jobData) => {
        const ref = doc(collection(db, JOBS_COLLECTION));
        batch.set(ref, jobData);
      });
      await batch.commit();
    }
  }

  // Keep the plan anchor ("Next Service") aligned to the next future occurrence for UX clarity.
  try {
    const anchorStr = format(anchor, 'yyyy-MM-dd');
    const planStart = plan.startDate ? parseFlexibleDateOnly(plan.startDate) : null;
    if (!planStart || isBefore(planStart, today)) {
      await updateDoc(doc(db, 'servicePlans', plan.id), { startDate: anchorStr, updatedAt: new Date().toISOString() });
    }
  } catch (e) {
    // Non-fatal: job generation already happened.
    console.warn('topUpRecurringJobsAfterCompletion: failed to update plan startDate (non-fatal)', e);
  }

  return jobsToCreate.length;
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
  const clientsSnap = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));

  // Normalize "today" to midnight so date comparisons are consistent.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const jobsRef = collection(db, 'jobs');
  const jobsToCreate: any[] = [];

  // NOTE:
  // - This function is called by bulk import flows to populate runsheets.
  // - Historically it could be run multiple times and would create duplicates.
  // - We dedupe at *date level* (yyyy-MM-dd) per (clientId + serviceId), which still allows
  //   users to manually create multiple jobs on the same day when needed.
  //
  // Dedupe is based on BOTH scheduledTime and originalScheduledTime (moved jobs should still
  // reserve their original date, matching the behavior in createJobsForClient()).
  for (const clientDoc of clientsSnap.docs) {
    const client: any = { id: clientDoc.id, ...clientDoc.data() };
    if (!client.nextVisit || !client.frequency || client.frequency === 'one-off') continue;

    const freq = Number(client.frequency);
    if (!Number.isFinite(freq) || freq <= 0) continue;

    // Load existing jobs for this client once, so repeated runs are idempotent.
    const existingSnap = await getDocs(query(
      collection(db, JOBS_COLLECTION),
      where('ownerId', '==', ownerId),
      where('clientId', '==', client.id)
    ));

    const existingKeys = new Set<string>();
    existingSnap.docs.forEach((d) => {
      const data: any = d.data();
      const serviceId = data.serviceId || 'window-cleaning';

      const scheduledDate = typeof data.scheduledTime === 'string' ? data.scheduledTime.split('T')[0] : null;
      if (scheduledDate) existingKeys.add(`${serviceId}|${scheduledDate}`);

      const originalDate = typeof data.originalScheduledTime === 'string' ? data.originalScheduledTime.split('T')[0] : null;
      if (originalDate) existingKeys.add(`${serviceId}|${originalDate}`);
    });

    let visitDate = parseISO(client.nextVisit);
    visitDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 8; i++) {
      if (isBefore(visitDate, today)) {
        visitDate = addWeeks(visitDate, freq);
        continue;
      }

      const dateStr = format(visitDate, 'yyyy-MM-dd');
      const serviceId = 'window-cleaning';
      const key = `${serviceId}|${dateStr}`;

      if (!existingKeys.has(key)) {
        const jobData: any = {
          ownerId,
          accountId: ownerId, // Explicitly set accountId for Firestore rules
          clientId: client.id,
          providerId: 'test-provider-1',
          serviceId,
          propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
          scheduledTime: dateStr + 'T09:00:00',
          status: 'pending',
          price: typeof client.quote === 'number' ? client.quote : 25,
          paymentStatus: 'unpaid',
          gocardlessEnabled: client.gocardlessEnabled || false,
        };

        if (client.gocardlessCustomerId) {
          jobData.gocardlessCustomerId = client.gocardlessCustomerId;
        }

        jobsToCreate.push(jobData);
        // Prevent duplicates within the same run too.
        existingKeys.add(key);
      }

      visitDate = addWeeks(visitDate, freq);
    }
  }

  if (jobsToCreate.length === 0) return;

  // Write in batches (Firestore limit: 500 ops per batch).
  const batchSize = 450;
  for (let i = 0; i < jobsToCreate.length; i += batchSize) {
    const batch = writeBatch(db);
    const slice = jobsToCreate.slice(i, i + batchSize);
    slice.forEach((job) => {
      const ref = doc(collection(db, JOBS_COLLECTION));
      batch.set(ref, job);
    });
    await batch.commit();
  }
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
  const originalStart = new Date(visitDate);
  while (visitDate < today) {
    visitDate = addWeeks(visitDate, plan.frequencyWeeks);
  }
  
  // Keep the plan's "Next Service" anchor in the future for UX/consistency.
  // This helps avoid stale startDate values lingering in Manage Services.
  try {
    if (visitDate.getTime() !== originalStart.getTime()) {
      const newAnchor = format(visitDate, 'yyyy-MM-dd');
      await updateDoc(doc(db, 'servicePlans', plan.id), { startDate: newAnchor, updatedAt: new Date().toISOString() });
    }
  } catch (e) {
    console.warn('createJobsForServicePlan: failed to update plan startDate (non-fatal)', e);
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
        accountId: ownerId, // Explicitly set accountId for Firestore rules
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
            accountId: ownerId, // Explicitly set accountId for Firestore rules
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
  if (!ownerId) return false;

  try {
    const completedDoc = await getDoc(doc(db, 'completedWeeks', `${ownerId}_${weekStartStr}`));
    if (!completedDoc.exists()) return false;

    const data: any = completedDoc.data();
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    // getDay: 0=Sunday, 1=Monday, ...
    const todayDay = daysOfWeek[today.getDay() === 0 ? 6 : today.getDay() - 1];
    return Array.isArray(data.completedDays) && data.completedDays.includes(todayDay);
  } catch (err) {
    // IMPORTANT: If we can't read completedWeeks due to rules / missing doc behavior,
    // do NOT block job creation. Treat as "not marked complete".
    console.warn('isTodayMarkedComplete: unable to read completedWeeks; treating as not complete', err);
    return false;
  }
}

