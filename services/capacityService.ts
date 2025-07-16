import { addDays, endOfWeek, format, isThisWeek, parseISO, startOfWeek } from 'date-fns';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client } from '../types/client';
import type { Job } from '../types/models';
import { listMembers, MemberRecord } from './accountService';
import { AvailabilityStatus, fetchRotaRange } from './rotaService';
import { listVehicles } from './vehicleService';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export type DayCapacity = {
  date: Date;
  dateKey: string;
  dayName: string;
  totalCapacity: number;
  currentJobsValue: number;
  availableCapacity: number;
  isOverCapacity: boolean;
  availableMembers: MemberRecord[];
};

export type JobRedistributionResult = {
  redistributedJobs: number;
  daysModified: string[];
  warnings: string[];
};

/**
 * Calculate the daily capacity for a specific date based on available team members
 */
export async function calculateDayCapacity(
  date: Date,
  memberMap: Record<string, MemberRecord>,
  rotaMap: Record<string, Record<string, AvailabilityStatus>>,
  jobsForDay: (Job & { client: Client | null })[]
): Promise<DayCapacity> {
  const dateKey = format(date, 'yyyy-MM-dd');
  const dayName = format(date, 'EEEE');
  const rotaForDay = rotaMap[dateKey] || {};
  
  // Get available members for this day
  const availableMembers = Object.values(memberMap).filter(m => 
    (rotaForDay[m.uid] ?? 'on') === 'on' && m.dailyRate && m.dailyRate > 0
  );
  
  // Calculate total capacity
  const totalCapacity = availableMembers.reduce((sum, m) => sum + (m.dailyRate || 0), 0);
  
  // Calculate current jobs value
  const currentJobsValue = jobsForDay.reduce((sum, job) => sum + (job.price || 0), 0);
  
  // Calculate available capacity
  const availableCapacity = totalCapacity - currentJobsValue;
  const isOverCapacity = currentJobsValue > totalCapacity;
  
  return {
    date,
    dateKey,
    dayName,
    totalCapacity,
    currentJobsValue,
    availableCapacity,
    isOverCapacity,
    availableMembers
  };
}

/**
 * Get week capacity data for all days in a week
 */
export async function getWeekCapacity(
  weekStart: Date,
  jobs: (Job & { client: Client | null })[],
  memberMap: Record<string, MemberRecord>,
  rotaMap: Record<string, Record<string, AvailabilityStatus>>
): Promise<DayCapacity[]> {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekCapacity: DayCapacity[] = [];
  
  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(weekStart, i);
    
    // Get jobs for this day
    const jobsForDay = jobs.filter((job) => {
      const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
      return jobDate && jobDate.toDateString() === dayDate.toDateString();
    });
    
    const dayCapacity = await calculateDayCapacity(dayDate, memberMap, rotaMap, jobsForDay);
    weekCapacity.push(dayCapacity);
  }
  
  return weekCapacity;
}

/**
 * Redistribute jobs within a week based on capacity constraints
 */
export async function redistributeJobsForWeek(
  weekStart: Date,
  jobs: (Job & { client: Client | null })[],
  memberMap: Record<string, MemberRecord>,
  rotaMap: Record<string, Record<string, AvailabilityStatus>>,
  skipCurrentWeek: boolean = true
): Promise<JobRedistributionResult> {
  const result: JobRedistributionResult = {
    redistributedJobs: 0,
    daysModified: [],
    warnings: []
  };
  
  // Don't auto-apply to current week unless specifically requested
  if (skipCurrentWeek && isThisWeek(weekStart, { weekStartsOn: 1 })) {
    result.warnings.push('Skipped current week - use manual refresh to apply to current week');
    return result;
  }
  
  const weekCapacity = await getWeekCapacity(weekStart, jobs, memberMap, rotaMap);
  const jobsToRedistribute: (Job & { client: Client | null })[] = [];
  const batch = writeBatch(db);
  
  // Process each day from Monday to Sunday
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayCapacity = weekCapacity[dayIndex];
    
    if (!dayCapacity.isOverCapacity) continue;
    
    // Get jobs for this day sorted by round order
    const jobsForDay = jobs.filter((job) => {
      const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
      return jobDate && jobDate.toDateString() === dayCapacity.date.toDateString();
    }).sort((a, b) => (a.client?.roundOrderNumber ?? 0) - (b.client?.roundOrderNumber ?? 0));
    
    // Calculate which jobs need to be moved
    let runningTotal = 0;
    const jobsToMove: (Job & { client: Client | null })[] = [];
    
    for (const job of jobsForDay) {
      runningTotal += (job.price || 0);
      if (runningTotal > dayCapacity.totalCapacity) {
        jobsToMove.push(job);
      }
    }
    
    if (jobsToMove.length === 0) continue;
    
    // Find target day(s) for overflow jobs
    let targetDayIndex = dayIndex + 1;
    const jobsStillToMove = [...jobsToMove];
    
    while (jobsStillToMove.length > 0 && targetDayIndex < 7) {
      const targetDayCapacity = weekCapacity[targetDayIndex];
      
      // Check if target day has capacity and available members
      if (targetDayCapacity.totalCapacity === 0) {
        result.warnings.push(`${targetDayCapacity.dayName} has no available team members`);
        targetDayIndex++;
        continue;
      }
      
      // Move jobs that fit into this day's available capacity
      const jobsToMoveToday: (Job & { client: Client | null })[] = [];
      let moveRunningTotal = 0;
      
      for (let i = 0; i < jobsStillToMove.length; i++) {
        const job = jobsStillToMove[i];
        const jobValue = job.price || 0;
        
        if (moveRunningTotal + jobValue <= targetDayCapacity.availableCapacity) {
          jobsToMoveToday.push(job);
          moveRunningTotal += jobValue;
        } else {
          break; // Can't fit any more jobs in this day
        }
      }
      
      // Update job schedules for jobs that can be moved
      for (const job of jobsToMoveToday) {
        const newScheduledTime = format(targetDayCapacity.date, 'yyyy-MM-dd') + 'T09:00:00';
        const jobRef = doc(db, 'jobs', job.id);
        batch.update(jobRef, { scheduledTime: newScheduledTime });
        
        // Remove from jobs still to move
        const index = jobsStillToMove.indexOf(job);
        if (index > -1) {
          jobsStillToMove.splice(index, 1);
        }
        
        result.redistributedJobs++;
      }
      
      // Update target day capacity for next iteration
      weekCapacity[targetDayIndex].currentJobsValue += moveRunningTotal;
      weekCapacity[targetDayIndex].availableCapacity -= moveRunningTotal;
      
      if (jobsToMoveToday.length > 0) {
        result.daysModified.push(targetDayCapacity.dayName);
      }
      
      targetDayIndex++;
    }
    
    // If it's the last day or no more capacity in the week, keep remaining jobs
    if (jobsStillToMove.length > 0) {
      if (dayIndex === 6) {
        result.warnings.push(`${jobsStillToMove.length} jobs remain over capacity on ${dayCapacity.dayName} (final day of week)`);
      } else {
        result.warnings.push(`${jobsStillToMove.length} jobs could not be redistributed from ${dayCapacity.dayName} - insufficient capacity in remaining days`);
      }
    }
    
    if (result.redistributedJobs > 0) {
      result.daysModified.push(dayCapacity.dayName);
    }
  }
  
  // Commit all job updates
  if (result.redistributedJobs > 0) {
    await batch.commit();
  }
  
  return result;
}

/**
 * Manual refresh function for current week capacity redistribution
 */
export async function manualRefreshWeekCapacity(
  weekStart: Date
): Promise<JobRedistributionResult> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('Not authenticated');
  
  // Fetch all required data
  const [jobsForWeek, memberList, vehicles] = await Promise.all([
    getJobsForWeek(weekStart),
    listMembers(),
    listVehicles()
  ]);
  
  // Build member map
  const memberMap: Record<string, MemberRecord> = {};
  memberList.forEach((m: MemberRecord) => { memberMap[m.uid] = m; });
  
  // Get rota for this week
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const rotaMap = await fetchRotaRange(weekStart, weekEnd);
  
  // Fetch client data for jobs
  const clientIds = [...new Set(jobsForWeek.map(job => job.clientId))];
  const clientChunks = [];
  for (let i = 0; i < clientIds.length; i += 30) {
    clientChunks.push(clientIds.slice(i, i + 30));
  }
  
  const clientsMap = new Map<string, Client>();
  const clientPromises = clientChunks.map(chunk => 
    getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
  );
  const clientSnapshots = await Promise.all(clientPromises);
  
  clientSnapshots.forEach(snapshot => {
    snapshot.forEach(docSnap => {
      clientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
    });
  });
  
  // Map clients back to jobs
  const jobsWithClients = jobsForWeek.map(job => ({
    ...job,
    client: clientsMap.get(job.clientId) || null,
  }));
  
  // Perform redistribution (force current week)
  return await redistributeJobsForWeek(weekStart, jobsWithClients, memberMap, rotaMap, false);
}

/**
 * Get jobs for a specific week
 */
async function getJobsForWeek(weekStart: Date): Promise<Job[]> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  
  const startDate = format(weekStart, 'yyyy-MM-dd');
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const endDate = format(addDays(weekEnd, 1), 'yyyy-MM-dd'); // Make exclusive
  
  const jobsQuery = query(
    collection(db, 'jobs'),
    where('ownerId', '==', ownerId),
    where('scheduledTime', '>=', startDate + 'T00:00:00'),
    where('scheduledTime', '<', endDate + 'T00:00:00')
  );
  
  try {
    const querySnapshot = await getDocs(jobsQuery);
    return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Job));
  } catch (error: any) {
    console.warn('getJobsForWeek: primary query failed, using fallback', error);
    const ownerOnlyQuery = query(collection(db, 'jobs'), where('ownerId', '==', ownerId));
    const fallbackSnap = await getDocs(ownerOnlyQuery);
    return fallbackSnap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Job))
      .filter(job => job.scheduledTime >= startDate + 'T00:00:00' && job.scheduledTime < endDate + 'T00:00:00');
  }
}

/**
 * Trigger capacity redistribution for future weeks when data changes
 */
export async function triggerCapacityRedistribution(
  triggerType: 'job_added' | 'team_availability_changed' | 'daily_limit_changed',
  affectedWeeks?: Date[]
): Promise<{ weekResults: { week: string; result: JobRedistributionResult }[]; totalRedistributed: number }> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('Not authenticated');
  
  let weeksToProcess: Date[] = [];
  
  if (affectedWeeks) {
    weeksToProcess = affectedWeeks;
  } else {
    // Default: process next 8 weeks (excluding current week)
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    
    for (let i = 1; i <= 8; i++) {
      weeksToProcess.push(addDays(currentWeekStart, i * 7));
    }
  }
  
  const weekResults: { week: string; result: JobRedistributionResult }[] = [];
  let totalRedistributed = 0;
  
  // Process each week
  for (const weekStart of weeksToProcess) {
    try {
      const [jobsForWeek, memberList] = await Promise.all([
        getJobsForWeek(weekStart),
        listMembers()
      ]);
      
      if (jobsForWeek.length === 0) continue;
      
      // Build member map
      const memberMap: Record<string, MemberRecord> = {};
      memberList.forEach((m: MemberRecord) => { memberMap[m.uid] = m; });
      
      // Get rota for this week
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const rotaMap = await fetchRotaRange(weekStart, weekEnd);
      
      // Fetch client data
      const clientIds = [...new Set(jobsForWeek.map(job => job.clientId))];
      const clientChunks = [];
      for (let i = 0; i < clientIds.length; i += 30) {
        clientChunks.push(clientIds.slice(i, i + 30));
      }
      
      const clientsMap = new Map<string, Client>();
      const clientPromises = clientChunks.map(chunk => 
        getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
      );
      const clientSnapshots = await Promise.all(clientPromises);
      
      clientSnapshots.forEach(snapshot => {
        snapshot.forEach(docSnap => {
          clientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
        });
      });
      
      // Map clients back to jobs
      const jobsWithClients = jobsForWeek.map(job => ({
        ...job,
        client: clientsMap.get(job.clientId) || null,
      }));
      
      // Perform redistribution
      const result = await redistributeJobsForWeek(weekStart, jobsWithClients, memberMap, rotaMap, true);
      
      weekResults.push({
        week: format(weekStart, 'yyyy-MM-dd'),
        result
      });
      
      totalRedistributed += result.redistributedJobs;
      
    } catch (error) {
      console.error(`Error processing week ${format(weekStart, 'yyyy-MM-dd')}:`, error);
      weekResults.push({
        week: format(weekStart, 'yyyy-MM-dd'),
        result: {
          redistributedJobs: 0,
          daysModified: [],
          warnings: [`Error processing week: ${error}`]
        }
      });
    }
  }
  
  return { weekResults, totalRedistributed };
} 