import { addDays, formatISO, isBefore, isEqual, parseISO, startOfWeek } from 'date-fns';
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
 * Fetch rota documents between start (inclusive) and end (inclusive).
 * Merges default patterns from rotaRules for any member/day without an explicit entry,
 * so capacity service and runsheet see the same defaults as the rota UI.
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

  // Merge default patterns from rotaRules for members without explicit entries
  const rulesCol = collection(db, `accounts/${sess.accountId}/rotaRules`);
  const rulesSnap = await getDocs(rulesCol);
  if (!rulesSnap.empty) {
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    let current = new Date(start);
    while (isBefore(current, end) || isEqual(current, end)) {
      const key = formatISO(current, { representation: 'date' });
      const dow = current.getDay(); // 0=Sun, 1=Mon ... 6=Sat
      const dayName = dayNames[dow === 0 ? 6 : dow - 1];

      if (!result[key]) result[key] = {};

      rulesSnap.docs.forEach(ruleDoc => {
        const memberId = ruleDoc.id;
        const pattern = ruleDoc.data().pattern;
        if (pattern?.[dayName] && !result[key][memberId]) {
          result[key][memberId] = pattern[dayName] as AvailabilityStatus;
        }
      });

      current = addDays(current, 1);
    }
  }

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
  
  // TODO: Add audit logging for rota changes (requires resolving circular dependency)

  // NOTE: We intentionally do NOT auto-trigger capacity redistribution here.
  // Changing rota should not reshuffle scheduled jobs (which can look like a full runsheet reset).
  // Users can review rota changes first, then manually run the refresh/reset action from the runsheet when ready.
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