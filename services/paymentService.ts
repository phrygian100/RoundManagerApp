import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import type { Payment } from '../types/models';

const PAYMENTS_COLLECTION = 'payments';

export async function createPayment(payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>) {
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const now = new Date().toISOString();
  const paymentData = {
    ...payment,
    createdAt: now,
    updatedAt: now,
  };
  const docRef = await addDoc(paymentsRef, paymentData);
  return docRef.id;
}

export async function getPaymentsForClient(clientId: string): Promise<Payment[]> {
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const q = query(paymentsRef, where('clientId', '==', clientId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function getAllPayments(): Promise<Payment[]> {
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const querySnapshot = await getDocs(paymentsRef);
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
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  await deleteDoc(paymentRef);
}

export async function getPaymentsByDateRange(startDate: string, endDate: string): Promise<Payment[]> {
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const q = query(
    paymentsRef,
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function deleteAllPayments(): Promise<void> {
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const querySnapshot = await getDocs(paymentsRef);
  
  if (querySnapshot.empty) {
    return;
  }
  
  const batch = writeBatch(db);
  querySnapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
} 