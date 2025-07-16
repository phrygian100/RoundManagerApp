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
    const jobsForDay = jobs.filter((job: Job & { client: Client | null }) => {
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
  const batch = writeBatch(db);
  
  // Get all jobs for the week sorted by round order (continuous sequence)
  const allWeekJobs = jobs
    .filter(job => job.client) // Only jobs with clients (have round order)
    .sort((a, b) => (a.client?.roundOrderNumber ?? 0) - (b.client?.roundOrderNumber ?? 0));
  
  if (allWeekJobs.length === 0) {
    return result;
  }
  
  // Get available days (days with capacity > 0) in order
  const availableDays = weekCapacity.filter(day => day.totalCapacity > 0);
  
  if (availableDays.length === 0) {
    result.warnings.push('No days with available team members found');
    return result;
  }
  
  // Distribute jobs sequentially across available days
  let currentDayIndex = 0;
  let currentDayValue = 0;
  const jobDistribution: Record<string, (Job & { client: Client | null })[]> = {};
  
  // Initialize distribution arrays for each available day
  availableDays.forEach(day => {
    jobDistribution[day.dateKey] = [];
  });
  
  // Distribute jobs in round order sequence across available days
  for (const job of allWeekJobs) {
    const jobValue = job.price || 0;
    const currentDay = availableDays[currentDayIndex];
    
    // Check if job fits in current day's capacity
    if (currentDayValue + jobValue <= currentDay.totalCapacity || currentDayIndex >= availableDays.length - 1) {
      // Job fits in current day OR we're on the last available day (accept overflow)
      jobDistribution[currentDay.dateKey].push(job);
      currentDayValue += jobValue;
    } else {
      // Move to next available day
      currentDayIndex++;
      if (currentDayIndex < availableDays.length) {
        const nextDay = availableDays[currentDayIndex];
        jobDistribution[nextDay.dateKey].push(job);
        currentDayValue = jobValue;
      } else {
        // No more days available, add to last day
        const lastDay = availableDays[availableDays.length - 1];
        jobDistribution[lastDay.dateKey].push(job);
      }
    }
  }
  
  // Update job schedules based on new distribution
  const daysModified = new Set<string>();
  
  for (const [dateKey, jobsForDay] of Object.entries(jobDistribution)) {
    for (const job of jobsForDay) {
      const currentJobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
      const newScheduledTime = dateKey + 'T09:00:00';
      
      // Only update if the job is moving to a different day
      if (currentJobDate && format(currentJobDate, 'yyyy-MM-dd') !== dateKey) {
        const jobRef = doc(db, 'jobs', job.id);
        batch.update(jobRef, { scheduledTime: newScheduledTime });
        result.redistributedJobs++;
        
        // Track which days were modified
        const dayName = availableDays.find(d => d.dateKey === dateKey)?.dayName;
        if (dayName) {
          daysModified.add(dayName);
        }
      }
    }
  }
  
  // Check for capacity overages and add warnings
  for (const [dateKey, jobsForDay] of Object.entries(jobDistribution)) {
    const dayCapacity = availableDays.find(d => d.dateKey === dateKey);
    if (dayCapacity) {
      const totalValue = jobsForDay.reduce((sum, job) => sum + (job.price || 0), 0);
      if (totalValue > dayCapacity.totalCapacity) {
        const excess = totalValue - dayCapacity.totalCapacity;
        result.warnings.push(`${dayCapacity.dayName} over capacity by £${excess.toFixed(2)}`);
      }
    }
  }
  
  result.daysModified = Array.from(daysModified);
  
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
      .filter((job: Job) => job.scheduledTime >= startDate + 'T00:00:00' && job.scheduledTime < endDate + 'T00:00:00');
  }
}

/**
 * Debug function to analyze capacity for a specific week
 */
export async function debugWeekCapacity(
  weekStart: Date
): Promise<{
  weekInfo: string;
  dailyCapacities: DayCapacity[];
  totalJobs: number;
  redistributionResult?: JobRedistributionResult;
}> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('Not authenticated');
  
  console.log(`🔍 DEBUG: Analyzing capacity for week starting ${format(weekStart, 'yyyy-MM-dd')}`);
  
  // Fetch all required data
  const [jobsForWeek, memberList] = await Promise.all([
    getJobsForWeek(weekStart),
    listMembers()
  ]);
  
  console.log(`📋 Found ${jobsForWeek.length} jobs for the week`);
  console.log(`👥 Found ${memberList.length} team members`);
  
  // Build member map
  const memberMap: Record<string, MemberRecord> = {};
  memberList.forEach((m: MemberRecord) => { 
    memberMap[m.uid] = m;
    console.log(`👤 Member ${m.uid}: dailyRate=${m.dailyRate}, vehicleId=${m.vehicleId}`);
  });
  
  // Get rota for this week
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const rotaMap = await fetchRotaRange(weekStart, weekEnd);
  
  console.log(`📅 Rota data:`, rotaMap);
  
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
  
  console.log(`📊 Jobs with clients: ${jobsWithClients.length}`);
  
  // Get week capacity analysis
  const dailyCapacities = await getWeekCapacity(weekStart, jobsWithClients, memberMap, rotaMap);
  
  // Log daily analysis
  dailyCapacities.forEach(day => {
    console.log(`📈 ${day.dayName} (${day.dateKey}):`);
    console.log(`   Available members: ${day.availableMembers.length}`);
    console.log(`   Total capacity: £${day.totalCapacity}`);
    console.log(`   Current jobs value: £${day.currentJobsValue}`);
    console.log(`   Available capacity: £${day.availableCapacity}`);
    console.log(`   Over capacity: ${day.isOverCapacity}`);
    
    if (day.availableMembers.length > 0) {
      day.availableMembers.forEach(member => {
        console.log(`     - ${member.uid}: £${member.dailyRate}/day`);
      });
    }
  });
  
  // Test redistribution (force current week)
  let redistributionResult: JobRedistributionResult | undefined;
  try {
    redistributionResult = await redistributeJobsForWeek(weekStart, jobsWithClients, memberMap, rotaMap, false);
    console.log(`🔄 Redistribution result:`, redistributionResult);
  } catch (error) {
    console.error(`❌ Redistribution error:`, error);
  }
  
  return {
    weekInfo: `Week ${format(weekStart, 'yyyy-MM-dd')} - ${dailyCapacities.filter(d => d.isOverCapacity).length} days over capacity`,
    dailyCapacities,
    totalJobs: jobsWithClients.length,
    redistributionResult
  };
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