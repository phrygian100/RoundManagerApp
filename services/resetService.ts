import { addDays, endOfWeek, format, isThisWeek, startOfWeek } from 'date-fns';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { manualRefreshWeekCapacity, triggerCapacityRedistribution } from './capacityService';

/**
 * Resets jobs for a specific day back to round order by:
 * - Removing all ETAs (setting eta: null)
 * - Removing all manual vehicle assignments (setting vehicleId: null)
 * - Affects all non-completed jobs on that day (includes jobs with missing/legacy statuses)
 */
export async function resetDayToRoundOrder(dayDate: Date): Promise<{ success: boolean; jobsReset: number; error?: string }> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      return { success: false, jobsReset: 0, error: 'No owner ID found' };
    }

    console.log('resetDayToRoundOrder: starting with ownerId:', ownerId, 'day:', dayDate.toISOString());

    const startStr = format(dayDate, 'yyyy-MM-dd') + 'T00:00:00';
    const endStr = format(addDays(dayDate, 1), 'yyyy-MM-dd') + 'T00:00:00';

    // Query jobs for the specific day.
    // Primary: range query on scheduledTime.
    // Fallback: owner-only query + client-side filtering (avoids missing composite index issues).
    const jobsRef = collection(db, 'jobs');
    // NOTE: Keep this type simple — some bundlers choke on `await` inside type queries.
    let docsToConsider: any[];

    try {
      const jobsQuery = query(
        jobsRef,
        where('ownerId', '==', ownerId),
        where('scheduledTime', '>=', startStr),
        where('scheduledTime', '<', endStr)
      );
      console.log('resetDayToRoundOrder: trying primary query with', startStr, 'to', endStr);
      const jobsSnapshot = await getDocs(jobsQuery);
      docsToConsider = jobsSnapshot.docs;
      console.log('resetDayToRoundOrder: primary query found', docsToConsider.length, 'docs');
    } catch (err) {
      console.warn('resetDayToRoundOrder: primary query failed; falling back to owner-only query', err);
      const ownerOnlyQuery = query(jobsRef, where('ownerId', '==', ownerId));
      const fallbackSnap = await getDocs(ownerOnlyQuery);
      docsToConsider = fallbackSnap.docs.filter((d) => {
        const data: any = d.data();
        const st = data?.scheduledTime;
        return typeof st === 'string' && st >= startStr && st < endStr;
      });
      console.log('resetDayToRoundOrder: fallback query found', docsToConsider.length, 'docs');
    }

    // Clear ETAs/vehicle assignments for all non-completed jobs (includes jobs with missing status).
    const jobsToReset = docsToConsider.filter((d) => {
      const data: any = d.data();
      console.log('resetDayToRoundOrder: job', d.id, 'status:', data?.status, 'scheduledTime:', data?.scheduledTime);
      return data?.status !== 'completed';
    });

    console.log('resetDayToRoundOrder: will reset', jobsToReset.length, 'jobs');

    if (jobsToReset.length === 0) {
      return { success: true, jobsReset: 0 };
    }

    // Reset jobs in batch
    const batch = writeBatch(db);

    jobsToReset.forEach((jobDoc) => {
      const jobRef = doc(db, 'jobs', jobDoc.id);
      console.log('resetDayToRoundOrder: batch updating job', jobDoc.id);
      batch.update(jobRef, {
        eta: null,
        vehicleId: null
      });
    });

    console.log('resetDayToRoundOrder: committing batch...');
    await batch.commit();
    console.log('resetDayToRoundOrder: batch committed successfully');

    return { success: true, jobsReset: jobsToReset.length };
  } catch (error) {
    console.error('Error resetting day to round order:', error);
    return {
      success: false,
      jobsReset: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Resets jobs for an entire week back to round order by:
 * - Removing all ETAs (setting eta: null)
 * - Removing all manual vehicle assignments (setting vehicleId: null)
 * - Only affects jobs with status 'pending' or 'scheduled'
 * - Only affects future days (not past or completed days)
 */
export async function resetWeekToRoundOrder(weekStartDate: Date): Promise<{ success: boolean; jobsReset: number; daysReset: number; error?: string }> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      return { success: false, jobsReset: 0, daysReset: 0, error: 'No owner ID found' };
    }

    const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: 1 });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Query jobs for the entire week
    const jobsRef = collection(db, 'jobs');
    const jobsQuery = query(
      jobsRef,
      where('ownerId', '==', ownerId),
      where('scheduledTime', '>=', format(weekStart, 'yyyy-MM-dd') + 'T00:00:00'),
      where('scheduledTime', '<', format(addDays(weekEnd, 1), 'yyyy-MM-dd') + 'T00:00:00'),
      where('status', 'in', ['pending', 'scheduled'])
    );

    const jobsSnapshot = await getDocs(jobsQuery);
    const allJobs = jobsSnapshot.docs;

    // Filter to only include future jobs (not past or today)
    const jobsToReset = allJobs.filter(jobDoc => {
      const jobData = jobDoc.data();
      const jobDate = new Date(jobData.scheduledTime);
      jobDate.setHours(0, 0, 0, 0);
      return jobDate > today; // Only future jobs
    });

    if (jobsToReset.length === 0) {
      return { success: true, jobsReset: 0, daysReset: 0 };
    }

    // Reset jobs in batch
    const batch = writeBatch(db);
    
    jobsToReset.forEach((jobDoc) => {
      const jobRef = doc(db, 'jobs', jobDoc.id);
      batch.update(jobRef, {
        eta: null,
        vehicleId: null
      });
    });

    await batch.commit();

    // Count unique days that were reset
    const uniqueDays = new Set(
      jobsToReset.map(jobDoc => {
        const jobData = jobDoc.data();
        return jobData.scheduledTime.split('T')[0]; // Get date part only
      })
    );

    // After clearing manual overrides, re-apply capacity redistribution so overflow
    // spills into subsequent days based on daily turnover limits.
    // For current week, we must force apply (default triggers intentionally skip current week).
    try {
      if (isThisWeek(weekStart, { weekStartsOn: 1 })) {
        await manualRefreshWeekCapacity(weekStart);
      } else {
        await triggerCapacityRedistribution('job_added', [weekStart]);
      }
    } catch (err) {
      console.warn('resetWeekToRoundOrder: capacity redistribution failed (non-fatal):', err);
    }

    return { 
      success: true, 
      jobsReset: jobsToReset.length, 
      daysReset: uniqueDays.size 
    };
  } catch (error) {
    console.error('Error resetting week to round order:', error);
    return { 
      success: false, 
      jobsReset: 0, 
      daysReset: 0,
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
} 