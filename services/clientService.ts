import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

/**
 * Gets the count of all clients for the current owner
 */
export async function getClientCount(): Promise<number> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.error('getClientCount: No owner ID found - authentication issue');
      return 0;
    }

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
    console.log('deleteAllClients: Starting deletion process...');
    
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.error('deleteAllClients: No owner ID found - authentication issue');
      throw new Error('Not authenticated - unable to determine account owner');
    }

    console.log('deleteAllClients: Owner ID confirmed:', ownerId);

    // Query ALL clients for this owner
    const clientsQuery = query(
      collection(db, 'clients'),
      where('ownerId', '==', ownerId)
    );
    
    const snapshot = await getDocs(clientsQuery);
    console.log('deleteAllClients: Found', snapshot.size, 'clients to delete');
    
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
      console.log('deleteAllClients: Deleted batch', Math.floor(i / batchSize) + 1, 'of', Math.ceil(snapshot.docs.length / batchSize));
    }

    console.log('deleteAllClients: Successfully deleted', deleted, 'clients');
    return { deleted };
  } catch (error) {
    console.error('Error deleting all clients:', error);
    return { deleted: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
} 