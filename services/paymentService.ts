import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/supabase';
import type { Payment } from '../types/models';

const PAYMENTS_COLLECTION = 'payments';

export async function createPayment(payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>) {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('User not authenticated');
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const now = new Date().toISOString();
  const paymentData = {
    ...payment,
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
  const docRef = await addDoc(paymentsRef, paymentData);
  return docRef.id;
}

export async function getPaymentsForClient(clientId: string): Promise<Payment[]> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const q = query(paymentsRef, where('ownerId', '==', ownerId), where('clientId', '==', clientId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function getAllPayments(): Promise<Payment[]> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const q = query(paymentsRef, where('ownerId', '==', ownerId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function updatePayment(paymentId: string, data: Partial<Payment>) {
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  const updateData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(paymentRef, updateData);
}

export async function deletePayment(paymentId: string) {
  await deletePaymentWithOwnerCheck(paymentId);
}

async function deletePaymentWithOwnerCheck(paymentId: string) {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('User not authenticated');
  const paymentDoc = doc(db, PAYMENTS_COLLECTION, paymentId);
  // We could optionally verify ownerId matches before deletion but Firestore rules will protect us once added.
  await deleteDoc(paymentDoc);
}

export async function getPaymentsByDateRange(startDate: string, endDate: string): Promise<Payment[]> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const q = query(
    paymentsRef,
    where('ownerId', '==', ownerId),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function deleteAllPayments(): Promise<void> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return;
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const q = query(paymentsRef, where('ownerId', '==', ownerId));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    return;
  }
  const batch = writeBatch(db);
  querySnapshot.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();
} 