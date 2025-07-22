import { addDoc, collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { logAction } from './auditService';

const UNKNOWN_PAYMENTS_COLLECTION = 'unknownPayments';

export type UnknownPayment = {
  id: string;
  ownerId?: string;
  amount: number;
  date: string;
  method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other';
  notes?: string;
  // Import metadata
  importDate: string;
  importFilename: string;
  csvRowNumber: number;
  originalAccountIdentifier: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateUnknownPaymentData = {
  amount: number;
  date: string;
  method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other';
  notes?: string;
  originalAccountIdentifier?: string; // Optional for manually created payments
};

export async function createUnknownPayment(data: CreateUnknownPaymentData): Promise<string> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('User not authenticated');
  
  const now = new Date().toISOString();
  const unknownPaymentData = {
    ...data,
    ownerId,
    importDate: now,
    importFilename: 'Manual Entry',
    csvRowNumber: 0,
    originalAccountIdentifier: data.originalAccountIdentifier || 'No Account',
    createdAt: now,
    updatedAt: now,
  };
  
  const docRef = await addDoc(collection(db, UNKNOWN_PAYMENTS_COLLECTION), unknownPaymentData);
  return docRef.id;
}

export async function deleteUnknownPayment(unknownPaymentId: string): Promise<void> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) throw new Error('User not authenticated');
  
  const unknownPaymentRef = doc(db, UNKNOWN_PAYMENTS_COLLECTION, unknownPaymentId);
  await deleteDoc(unknownPaymentRef);
}

export async function linkUnknownPaymentToClient(
  unknownPaymentId: string, 
  clientId: string
): Promise<void> {
  try {
    console.log('Starting linkUnknownPaymentToClient with:', { unknownPaymentId, clientId });
    
    const ownerId = await getDataOwnerId();
    if (!ownerId) throw new Error('User not authenticated');
    
    console.log('Owner ID:', ownerId);
    
    // Get the unknown payment data using a different approach
    const unknownPaymentsRef = collection(db, UNKNOWN_PAYMENTS_COLLECTION);
    const unknownPaymentQuery = query(unknownPaymentsRef, where('__name__', '==', unknownPaymentId));
    const unknownPaymentSnapshot = await getDocs(unknownPaymentQuery);
    
    if (unknownPaymentSnapshot.empty) {
      throw new Error('Unknown payment not found');
    }
    
    const unknownPaymentDoc = unknownPaymentSnapshot.docs[0];
    const unknownPaymentData = unknownPaymentDoc.data() as UnknownPayment;
    
    console.log('Unknown payment data:', unknownPaymentData);
    
    // Create a batch for atomic operations
    const batch = writeBatch(db);
    
    // Create the regular payment
    const paymentData = {
      ownerId: unknownPaymentData.ownerId,
      clientId,
      amount: unknownPaymentData.amount,
      date: unknownPaymentData.date,
      method: unknownPaymentData.method,
      notes: unknownPaymentData.notes || undefined,
      reference: `Linked from unknown payment (${unknownPaymentData.originalAccountIdentifier})`,
      createdAt: unknownPaymentData.createdAt,
      updatedAt: new Date().toISOString(),
    };
    
    const paymentRef = doc(collection(db, 'payments'));
    batch.set(paymentRef, paymentData);
    
    // Delete the unknown payment
    batch.delete(unknownPaymentDoc.ref);
    
    console.log('Committing batch...');
    
    // Commit the batch
    await batch.commit();
    
    console.log('Batch committed successfully');
    
    // Create audit log entry
    await logAction(
      'payment_created',
      'payment',
      paymentRef.id,
      `Linked unknown payment of £${unknownPaymentData.amount.toFixed(2)} to client ${clientId}`,
      unknownPaymentData.originalAccountIdentifier
    );
    
    console.log('Audit log created successfully');
  } catch (error) {
    console.error('Error in linkUnknownPaymentToClient:', error);
    throw error;
  }
}

export async function getUnknownPayments(): Promise<UnknownPayment[]> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return [];
  
  const unknownPaymentsRef = collection(db, UNKNOWN_PAYMENTS_COLLECTION);
  const q = query(unknownPaymentsRef, where('ownerId', '==', ownerId));
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({ 
    id: doc.id, 
    ...doc.data() 
  } as UnknownPayment));
} 