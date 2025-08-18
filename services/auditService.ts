import { addDoc, collection, collectionGroup, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../core/firebase';
import { getDataOwnerId, getUserSession } from '../core/session';
import type { AuditActionType, AuditEntityType, AuditLog } from '../types/audit';

const AUDIT_COLLECTION = 'auditLogs';

/**
 * Fallback function to determine owner ID when getUserSession/getDataOwnerId fails
 * This helps ensure audit logging works even when session setup is incomplete
 */
async function fallbackGetDataOwnerId(userUid: string): Promise<string | null> {
  try {
    console.warn('🔄 Attempting fallback owner ID resolution for user:', userUid);
    
    // Try to find member record in any account
    const memberQuery = query(
      collectionGroup(db, 'members'),
      where('uid', '==', userUid),
      where('status', '==', 'active'),
      limit(1)
    );
    
    const memberSnapshot = await getDocs(memberQuery);
    
    if (!memberSnapshot.empty) {
      const memberDoc = memberSnapshot.docs[0];
      const accountId = memberDoc.ref.parent.parent?.id;
      if (accountId) {
        console.warn('✅ Fallback successful: Found member record, using accountId:', accountId);
        return accountId;
      }
    }
    
    // If no member record found, assume they're an owner of their own account
    console.warn('⚠️ Fallback: No member record found, assuming user is owner of their own account');
    return userUid;
  } catch (error) {
    console.error('❌ Fallback getDataOwnerId failed:', error);
    return null;
  }
}

/**
 * Log an action performed by a member
 */
export async function logAction(
  actionType: AuditActionType,
  entityType: AuditEntityType,
  entityId: string,
  description: string,
  entityName?: string
): Promise<void> {
  try {
    const session = await getUserSession();
    const currentUser = auth.currentUser;
    
    if (!session || !currentUser) {
      console.warn('Cannot log audit action: no authenticated user session');
      console.warn('Session details:', { hasSession: !!session, hasCurrentUser: !!currentUser, userUid: currentUser?.uid });
      return;
    }

    let ownerId = await getDataOwnerId();
    
    // Enhanced error handling: Try fallback if primary method fails
    if (!ownerId && session?.uid) {
      console.warn('⚠️ getDataOwnerId() returned null, attempting fallback resolution...');
      console.warn('Session info:', { 
        uid: session.uid, 
        accountId: session.accountId, 
        isOwner: session.isOwner,
        hasPerms: !!session.perms 
      });
      
      ownerId = await fallbackGetDataOwnerId(session.uid);
    }
    
    if (!ownerId) {
      console.error('❌ Cannot log audit action: no owner ID found after all attempts');
      console.error('Debug info:', { 
        sessionUid: session?.uid,
        sessionAccountId: session?.accountId,
        sessionIsOwner: session?.isOwner,
        actionType,
        entityType,
        entityId 
      });
      return;
    }

    const auditLog: Omit<AuditLog, 'id'> = {
      timestamp: new Date().toISOString(),
      actorId: session.uid,
      actorEmail: currentUser.email || 'Unknown',
      actionType,
      entityType,
      entityId,
      description,
      ownerId,
    };

    // Only include entityName if it's provided and not undefined
    if (entityName) {
      (auditLog as any).entityName = entityName;
    }

    await addDoc(collection(db, AUDIT_COLLECTION), auditLog);
    console.log(`✅ Audit logged: ${actionType} - ${description} (ownerId: ${ownerId})`);
  } catch (error) {
    // Enhanced error logging with context
    console.error('❌ Failed to log audit action:', error);
    console.error('Context:', { 
      actionType, 
      entityType, 
      entityId, 
      description,
      userUid: auth.currentUser?.uid,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Get audit logs for the current account (accessible by owners and members)
 */
export async function getAuditLogs(limitCount: number = 100): Promise<AuditLog[]> {
  try {
    const session = await getUserSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    // Allow both owners and members to view audit logs for their account
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      throw new Error('No owner ID found');
    }

    const auditQuery = query(
      collection(db, AUDIT_COLLECTION),
      where('ownerId', '==', ownerId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(auditQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AuditLog));
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
}

/**
 * Get audit logs for a specific entity (accessible by owners and members)
 */
export async function getAuditLogsForEntity(
  entityType: AuditEntityType,
  entityId: string,
  limitCount: number = 50
): Promise<AuditLog[]> {
  try {
    const session = await getUserSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    // Allow both owners and members to view audit logs for their account
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      throw new Error('No owner ID found');
    }

    const auditQuery = query(
      collection(db, AUDIT_COLLECTION),
      where('ownerId', '==', ownerId),
      where('entityType', '==', entityType),
      where('entityId', '==', entityId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(auditQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AuditLog));
  } catch (error) {
    console.error('Error fetching audit logs for entity:', error);
    throw error;
  }
}

/**
 * Helper function to format audit descriptions
 */
export function formatAuditDescription(
  actionType: AuditActionType,
  entityName?: string
): string {
  const entityDisplay = entityName ? ` for "${entityName}"` : '';
  
  switch (actionType) {
    case 'client_created':
      return `Created client${entityDisplay}`;
    case 'client_edited':
      return `Changed client details${entityDisplay}`;
    case 'client_archived':
      return `Archived client${entityDisplay}`;
    case 'client_round_order_changed':
      return `Changed round order position${entityDisplay}`;
    case 'quote_created':
      return `Created quote${entityDisplay}`;
    case 'quote_edited':
      return `Modified quote${entityDisplay}`;
    case 'quote_progressed':
      return `Progressed quote to pending${entityDisplay}`;
    case 'quote_deleted':
      return `Deleted quote${entityDisplay}`;
    case 'rota_availability_changed':
      return `Changed availability on rota${entityDisplay}`;
    case 'payment_created':
      return `Recorded payment${entityDisplay}`;
    case 'payment_edited':
      return `Modified payment${entityDisplay}`;
    case 'payment_deleted':
      return `Deleted payment${entityDisplay}`;
    case 'member_permissions_changed':
      return `Changed member permissions${entityDisplay}`;
    case 'member_daily_rate_changed':
      return `Changed member daily rate${entityDisplay}`;
    case 'job_created':
      return `Added one-time job${entityDisplay}`;
    case 'job_price_changed':
      return `Changed job price${entityDisplay}`;
    case 'job_deleted':
      return `Deleted job${entityDisplay}`;
    case 'job_completed':
      return `Marked job complete${entityDisplay}`;
    case 'runsheet_note_added':
      return `Added note to runsheet${entityDisplay}`;
    case 'recurring_service_added':
      return `Added recurring service${entityDisplay}`;
    case 'gocardless_payments_processed':
      return `Processed GoCardless payments${entityDisplay}`;
    default:
      return `Performed ${actionType}${entityDisplay}`;
  }
}

/**
 * Helper function to extract address from client object
 * Handles both legacy address format and new address1/town/postcode format
 */
export function getClientAddress(client: { address?: string; address1?: string; town?: string; postcode?: string }): string {
  // Use new format if available
  if (client.address1 && client.town && client.postcode) {
    return `${client.address1}, ${client.town}, ${client.postcode}`;
  }
  
  // Fall back to legacy address field
  if (client.address) {
    return client.address;
  }
  
  // Fallback if no address available
  return 'Address not available';
}