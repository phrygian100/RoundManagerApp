import { addDays, endOfWeek, format, isThisWeek, startOfWeek } from 'date-fns';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { getJobsForWeek } from './jobService';
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

    const startStr = format(dayDate, 'yyyy-MM-dd');
    const endStr = format(addDays(dayDate, 1), 'yyyy-MM-dd');

    // Use the same job loading pattern as the runsheet (getJobsForWeek)
    // This ensures we're using the same query/permission pattern that works elsewhere
    console.log('resetDayToRoundOrder: loading jobs using getJobsForWeek pattern', startStr, 'to', endStr);
    const jobsForDay = await getJobsForWeek(startStr, endStr);
    
    // Filter to jobs on the specific day
    const dayStartStr = startStr + 'T00:00:00';
    const dayEndStr = endStr + 'T00:00:00';
    const jobsOnDay = jobsForDay.filter(job => {
      const st = job.scheduledTime;
      return typeof st === 'string' && st >= dayStartStr && st < dayEndStr;
    });
    
    console.log('resetDayToRoundOrder: found', jobsOnDay.length, 'jobs for day');
    
    // Convert to document-like format for consistency with rest of function
    const docsToConsider = jobsOnDay.map(job => ({
      id: job.id,
      data: () => job as any
    }));

    // Clear ETAs/vehicle assignments for all non-completed jobs (includes jobs with missing status).
    const jobsToReset = docsToConsider.filter((d) => {
      const data: any = typeof d.data === 'function' ? d.data() : d.data;
      const jobId = d.id;
      const isNotCompleted = data?.status !== 'completed';
      
      console.log('resetDayToRoundOrder: job', jobId, 'status:', data?.status, 'scheduledTime:', data?.scheduledTime);
      
      return isNotCompleted;
    });

    console.log('resetDayToRoundOrder: will reset', jobsToReset.length, 'jobs (after ownership validation)');

    if (jobsToReset.length === 0) {
      return { success: true, jobsReset: 0 };
    }

    // Update jobs individually to get better error reporting
    // First verify we can access each job document (permissions check)
    // Using getDoc + updateDoc (same pattern as runsheet defer functionality)
    let successCount = 0;
    const errors: string[] = [];

    for (const jobDoc of jobsToReset) {
      try {
        const jobId = jobDoc.id;
        const jobRef = doc(db, 'jobs', jobId);
        console.log('resetDayToRoundOrder: updating job', jobId);
        await updateDoc(jobRef, {
          eta: null,
          vehicleId: null
        });
        successCount++;
      } catch (jobError: any) {
        const jobId = jobDoc.id;
        const errorMsg = `Job ${jobId}: ${jobError?.message || 'Unknown error'}`;
        console.error('resetDayToRoundOrder: failed to update', jobId, ':', jobError);
        console.error('resetDayToRoundOrder: error code:', jobError?.code);
        errors.push(errorMsg);
      }
    }

    console.log('resetDayToRoundOrder: updated', successCount, 'of', jobsToReset.length, 'jobs');

    if (errors.length > 0) {
      console.warn('resetDayToRoundOrder: some jobs failed to update:', errors);
      // Still return success if at least some jobs were updated
      if (successCount > 0) {
        return { success: true, jobsReset: successCount };
      } else {
        return { success: false, jobsReset: 0, error: `All updates failed: ${errors.join('; ')}` };
      }
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