import { addDays, format, startOfWeek } from 'date-fns';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';
import { AvailabilityStatus, setAvailability } from './rotaService';

export type WeeklyPattern = {
  monday: AvailabilityStatus;
  tuesday: AvailabilityStatus;
  wednesday: AvailabilityStatus;
  thursday: AvailabilityStatus;
  friday: AvailabilityStatus;
  saturday: AvailabilityStatus;
  sunday: AvailabilityStatus;
};

export type RotaRule = {
  memberId: string;
  pattern: WeeklyPattern;
  updatedAt: string;
  updatedBy: string;
};

export const DAY_KEYS: (keyof WeeklyPattern)[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export const DEFAULT_PATTERN: WeeklyPattern = {
  monday: 'on',
  tuesday: 'on',
  wednesday: 'on',
  thursday: 'on',
  friday: 'on',
  saturday: 'off',
  sunday: 'off',
};

export async function getRotaRule(memberId: string): Promise<RotaRule | null> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  const docRef = doc(db, `accounts/${sess.accountId}/rotaRules/${memberId}`);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data() as RotaRule;
}

export async function getAllRotaRules(): Promise<Record<string, RotaRule>> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  const col = collection(db, `accounts/${sess.accountId}/rotaRules`);
  const snap = await getDocs(col);
  const result: Record<string, RotaRule> = {};
  snap.docs.forEach(d => {
    result[d.id] = d.data() as RotaRule;
  });
  return result;
}

export async function setRotaRule(memberId: string, pattern: WeeklyPattern): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  const docRef = doc(db, `accounts/${sess.accountId}/rotaRules/${memberId}`);
  await setDoc(docRef, {
    memberId,
    pattern,
    updatedAt: new Date().toISOString(),
    updatedBy: sess.uid,
  });
}

/**
 * Apply a weekly pattern for a member across N weeks starting from the given date.
 * Writes standard rota documents so fetchRotaRange / capacity / runsheet are unaffected.
 */
export async function applyPatternForWeeks(
  memberId: string,
  pattern: WeeklyPattern,
  startDate: Date,
  numberOfWeeks: number,
): Promise<number> {
  const start = startOfWeek(startDate, { weekStartsOn: 1 });
  let daysWritten = 0;

  for (let week = 0; week < numberOfWeeks; week++) {
    const weekStart = addDays(start, week * 7);
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const dayDate = addDays(weekStart, dayIdx);
      const dateKey = format(dayDate, 'yyyy-MM-dd');
      const dayKey = DAY_KEYS[dayIdx];
      const status = pattern[dayKey];
      await setAvailability(dateKey, memberId, status);
      daysWritten++;
    }
  }

  return daysWritten;
}
