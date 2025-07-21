import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

/**
 * Gets the count of all clients for the current owner
 */
export async function getClientCount(): Promise<number> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) return 0;

    const clientsQuery = query(
      collection(db, 'clients'),
      where('ownerId', '==', ownerId)
    );
    
    const snapshot = await getDocs(clientsQuery);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting client count:', error);
    return 0;
  }
}

/**
 * Deletes all clients for the current owner
 * WARNING: This is a destructive operation that cannot be undone
 * Note: This does NOT delete associated jobs - use separate job deletion if needed
 */
export async function deleteAllClients(): Promise<{ deleted: number; error?: string }> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) throw new Error('Not authenticated');

    // Query ALL clients for this owner
    const clientsQuery = query(
      collection(db, 'clients'),
      where('ownerId', '==', ownerId)
    );
    
    const snapshot = await getDocs(clientsQuery);
    if (snapshot.empty) {
      return { deleted: 0 };
    }

    // Delete in batches (Firestore limit is 500 operations per batch)
    const batchSize = 500;
    let deleted = 0;
    
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchDocs = snapshot.docs.slice(i, i + batchSize);
      
      batchDocs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      deleted += batchDocs.length;
    }

    return { deleted };
  } catch (error) {
    console.error('Error deleting all clients:', error);
    return { deleted: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
} 