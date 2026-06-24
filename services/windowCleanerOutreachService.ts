import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../core/firebase';
import { WINDOW_CLEANER_OUTREACH_COLLECTION } from '../shared/constants/developer';

export type OutreachTouch = {
  phoneKey: string;
  phone: string;
  town: string;
  businessName: string;
  sentAt: string;
};

export function subscribeOutreachTouches(
  onData: (touches: Record<string, OutreachTouch>) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, WINDOW_CLEANER_OUTREACH_COLLECTION),
    (snapshot) => {
      const map: Record<string, OutreachTouch> = {};
      snapshot.forEach((d) => {
        map[d.id] = d.data() as OutreachTouch;
      });
      onData(map);
    },
    (error) => {
      console.error('Outreach touches subscription error:', error);
      onError?.(error);
    }
  );
}

export async function markOutreachSent(lead: {
  id: string;
  phone: string;
  town: string;
  business_name: string;
}): Promise<void> {
  const sentAt = new Date().toISOString();
  await setDoc(doc(db, WINDOW_CLEANER_OUTREACH_COLLECTION, lead.id), {
    phoneKey: lead.id,
    phone: lead.phone,
    town: lead.town,
    businessName: lead.business_name,
    sentAt,
    updatedAt: serverTimestamp(),
  });
}

export async function clearOutreachTouch(phoneKey: string): Promise<void> {
  await deleteDoc(doc(db, WINDOW_CLEANER_OUTREACH_COLLECTION, phoneKey));
}
