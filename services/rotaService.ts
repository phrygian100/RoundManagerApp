import { formatISO, isBefore, isEqual, parseISO, startOfWeek } from 'date-fns';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';

export type AvailabilityStatus = 'on' | 'off' | 'n/a';

export type RotaRecord = {
  date: string; // yyyy-MM-dd
  map: Record<string, AvailabilityStatus>; // memberId -> status
};

function dateKey(date: Date): string {
  return formatISO(date, { representation: 'date' });
}

/**
 * Fetch rota documents between start (inclusive) and end (inclusive)
 */
export async function fetchRotaRange(start: Date, end: Date): Promise<Record<string, Record<string, AvailabilityStatus>>> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  const rotaCol = collection(db, `accounts/${sess.accountId}/rota`);
  const snap = await getDocs(rotaCol);
  const result: Record<string, Record<string, AvailabilityStatus>> = {};
  snap.docs.forEach(d => {
    const data = d.data() as any;
    const key = d.id; // yyyy-MM-dd
    const dateVal = parseISO(key);
    if ((isEqual(dateVal, start) || isBefore(start, dateVal)) && (isEqual(dateVal, end) || isBefore(dateVal, end))) {
      result[key] = data as Record<string, AvailabilityStatus>;
    }
  });
  return result;
}

/**
 * Update a specific member's status for a date.
 */
export async function setAvailability(date: string, memberId: string, status: AvailabilityStatus): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const docRef = doc(db, `accounts/${sess.accountId}/rota/${date}`);
  // Use setDoc merge to avoid overwriting others
  await setDoc(docRef, { [memberId]: status }, { merge: true });
  
  // Trigger capacity redistribution for future weeks when availability changes
  try {
    const changeDate = parseISO(date);
    const weekStart = startOfWeek(changeDate, { weekStartsOn: 1 });
    
    // Only trigger for future weeks - current week uses manual "Refresh Capacity" button
    console.log(`🔄 Triggering capacity redistribution for availability change on: ${date}`);
    
    // Dynamically import to avoid circular dependencies
    const { triggerCapacityRedistribution } = await import('./capacityService');
    
    // Use the proper trigger function that respects current week protection
    const result = await triggerCapacityRedistribution('team_availability_changed', [weekStart]);
    
    console.log(`✅ Capacity redistribution completed:`, result);
    
    if (result.totalRedistributed > 0) {
      console.log(`📊 ${result.totalRedistributed} total jobs redistributed across ${result.weekResults.length} weeks`);
      result.weekResults.forEach(weekResult => {
        if (weekResult.result.redistributedJobs > 0) {
          console.log(`  Week ${weekResult.week}: ${weekResult.result.redistributedJobs} jobs redistributed`);
        }
      });
    }
    
  } catch (error) {
    console.error('Failed to trigger capacity redistribution after availability change:', error);
    // Don't fail the availability update if capacity redistribution fails
  }
}

/**
 * Deletes rota documents older than the provided cutoff date (exclusive).
 */
export async function cleanupOldRota(cutoff: Date): Promise<void> {
  const sess = await getUserSession();
  if (!sess) return;
  const rotaCol = collection(db, `accounts/${sess.accountId}/rota`);
  const snap = await getDocs(rotaCol);
  const batchDeletes: Promise<void>[] = [];
  snap.docs.forEach(d => {
    const dateVal = parseISO(d.id);
    if (isBefore(dateVal, cutoff)) {
      batchDeletes.push(deleteDoc(d.ref));
    }
  });
  await Promise.all(batchDeletes);
} 