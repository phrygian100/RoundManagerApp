import { addDays, endOfWeek, format, isThisWeek, startOfWeek } from 'date-fns';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { manualRefreshWeekCapacity, triggerCapacityRedistribution } from './capacityService';

/**
 * Resets jobs for a specific day back to round order by:
 * - Removing all ETAs (setting eta: null)
 * - Removing all manual vehicle assignments (setting vehicleId: null)
 * - Only affects jobs with status 'pending' or 'scheduled'
 */
export async function resetDayToRoundOrder(dayDate: Date): Promise<{ success: boolean; jobsReset: number; error?: string }> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      return { success: false, jobsReset: 0, error: 'No owner ID found' };
    }

    const dateStr = format(dayDate, 'yyyy-MM-dd');
    
    // Query jobs for the specific day
    const jobsRef = collection(db, 'jobs');
    const jobsQuery = query(
      jobsRef,
      where('ownerId', '==', ownerId),
      where('scheduledTime', '>=', dateStr),
      where('scheduledTime', '<', format(addDays(dayDate, 1), 'yyyy-MM-dd')),
      where('status', 'in', ['pending', 'scheduled'])
    );

    const jobsSnapshot = await getDocs(jobsQuery);
    const jobsToReset = jobsSnapshot.docs;

    if (jobsToReset.length === 0) {
      return { success: true, jobsReset: 0 };
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

    // After clearing manual overrides, re-apply capacity redistribution so overflow
    // spills into subsequent days based on daily turnover limits.
    // For current week, we must force apply (default triggers intentionally skip current week).
    try {
      const weekStart = startOfWeek(dayDate, { weekStartsOn: 1 });
      if (isThisWeek(weekStart, { weekStartsOn: 1 })) {
        await manualRefreshWeekCapacity(weekStart);
      } else {
        await triggerCapacityRedistribution('job_added', [weekStart]);
      }
    } catch (err) {
      console.warn('resetDayToRoundOrder: capacity redistribution failed (non-fatal):', err);
    }

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