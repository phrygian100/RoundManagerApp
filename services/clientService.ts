import { collection, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

/**
 * Updates GoCardless settings for a specific client
 */
export async function updateClientGoCardlessSettings(
  clientId: string,
  settings: { enabled: boolean; customerId?: string }
): Promise<void> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      throw new Error('User not authenticated');
    }

    const clientRef = doc(db, 'clients', clientId);
    
    const updateData: any = {
      gocardlessEnabled: settings.enabled,
      updatedAt: new Date().toISOString(),
    };

    if (settings.enabled) {
      updateData.gocardlessCustomerId = settings.customerId;
    } else {
      // Clear the customer ID when disabled
      updateData.gocardlessCustomerId = null;
    }

    await updateDoc(clientRef, updateData);

    // Update all jobs for this client that are on incomplete runsheets
    await updateClientJobsGoCardlessSettings(clientId, settings);
  } catch (error) {
    console.error('Error updating GoCardless settings:', error);
    throw error;
  }
}

/**
 * Update GoCardless settings for all jobs belonging to a client
 * Only updates jobs on runsheets that haven't been completed yet
 */
async function updateClientJobsGoCardlessSettings(
  clientId: string,
  settings: { enabled: boolean; customerId?: string }
): Promise<void> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      throw new Error('User not authenticated');
    }

    // Get all jobs for this client
    const jobsQuery = query(
      collection(db, 'jobs'),
      where('ownerId', '==', ownerId),
      where('clientId', '==', clientId)
    );
    
    const jobsSnapshot = await getDocs(jobsQuery);
    
    if (jobsSnapshot.empty) {
      return;
    }

    // Get all completed days to filter out jobs on completed runsheets
    const completedDaysQuery = query(
      collection(db, 'completedDays'),
      where('ownerId', '==', ownerId)
    );
    
    const completedDaysSnapshot = await getDocs(completedDaysQuery);
    const completedDays = new Set<string>();
    
    completedDaysSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.dayTitle) {
        completedDays.add(data.dayTitle);
      }
    });

    // Filter jobs that are on incomplete runsheets
    const jobsToUpdate: any[] = [];
    
    jobsSnapshot.forEach(doc => {
      const jobData = doc.data();
      const scheduledDate = new Date(jobData.scheduledTime);
      const dayTitle = scheduledDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      // Only update jobs on runsheets that haven't been completed
      if (!completedDays.has(dayTitle)) {
        jobsToUpdate.push({
          id: doc.id,
          ref: doc.ref,
          data: jobData
        });
      }
    });

    if (jobsToUpdate.length === 0) {
      return;
    }

    // Update jobs in batches
    const batchSize = 500;
    for (let i = 0; i < jobsToUpdate.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchJobs = jobsToUpdate.slice(i, i + batchSize);
      
      batchJobs.forEach(job => {
        batch.update(job.ref, {
          gocardlessEnabled: settings.enabled,
          gocardlessCustomerId: settings.enabled ? settings.customerId : null,
          updatedAt: new Date().toISOString()
        });
      });
      
      await batch.commit();
    }

    console.log(`Updated GoCardless settings for ${jobsToUpdate.length} jobs for client ${clientId}`);
  } catch (error) {
    console.error('Error updating client jobs GoCardless settings:', error);
    // Don't throw error here as the client update was successful
    // Just log the error for debugging
  }
}

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

/**
 * Compute the next unique client account number for the current owner.
 * Scans all existing `clients` for this owner, supports both string (e.g. "RWC123")
 * and numeric account number formats, and returns max + 1. Falls back to 1 when none exist.
 */
export async function getNextAccountNumber(): Promise<number> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) {
    console.error('getNextAccountNumber: No owner ID found - authentication issue');
    return 1;
  }

  try {
    const clientsQuery = query(
      collection(db, 'clients'),
      where('ownerId', '==', ownerId)
    );
    const snapshot = await getDocs(clientsQuery);

    let highestNumber = 0;
    snapshot.forEach(docSnap => {
      const acc = (docSnap.data() as any).accountNumber;
      let numericValue = 0;

      if (typeof acc === 'string') {
        const prefixed = acc.toUpperCase().startsWith('RWC');
        const numericPart = prefixed ? acc.replace(/^RWC/i, '') : acc;
        const parsed = parseInt(String(numericPart).trim(), 10);
        if (!isNaN(parsed)) numericValue = parsed;
      } else if (typeof acc === 'number') {
        numericValue = acc;
      }

      if (numericValue > highestNumber) highestNumber = numericValue;
    });

    return highestNumber + 1;
  } catch (error) {
    console.error('getNextAccountNumber: Failed to compute next account number', error);
    return 1;
  }
}