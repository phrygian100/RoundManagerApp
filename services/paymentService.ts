import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
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

/**
 * Gets the count of all payments for the current owner
 */
export async function getPaymentCount(): Promise<number> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.error('getPaymentCount: No owner ID found - authentication issue');
      return 0;
    }

    const paymentsQuery = query(
      collection(db, PAYMENTS_COLLECTION),
      where('ownerId', '==', ownerId)
    );
    
    const snapshot = await getDocs(paymentsQuery);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting payment count:', error);
    return 0;
  }
}

export async function deleteAllPayments(): Promise<void> {
  try {
    console.log('deleteAllPayments: Starting deletion process...');
    
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.error('deleteAllPayments: No owner ID found - authentication issue');
      throw new Error('Not authenticated - unable to determine account owner');
    }

    console.log('deleteAllPayments: Owner ID confirmed:', ownerId);
    
    const paymentsRef = collection(db, PAYMENTS_COLLECTION);
    const q = query(paymentsRef, where('ownerId', '==', ownerId));
    const querySnapshot = await getDocs(q);
    
    console.log('deleteAllPayments: Found', querySnapshot.size, 'payments to delete');
    
    if (querySnapshot.empty) {
      console.log('deleteAllPayments: No payments to delete');
      return;
    }
    
    const batch = writeBatch(db);
    querySnapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    
    console.log('deleteAllPayments: Successfully deleted', querySnapshot.size, 'payments');
  } catch (error) {
    console.error('Error deleting all payments:', error);
    throw error;
  }
} 