import { getAuth } from 'firebase/auth';
import { addDoc, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId, getUserSession } from '../core/session';
import type { AuditActionType, AuditEntityType, AuditLog } from '../types/audit';

const AUDIT_COLLECTION = 'auditLogs';

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
    const auth = getAuth();
    const currentUser = auth.currentUser;
    
    if (!session || !currentUser) {
      console.warn('Cannot log audit action: no authenticated user session');
      return;
    }

    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      console.warn('Cannot log audit action: no owner ID found');
      return;
    }

    const auditLog: Omit<AuditLog, 'id'> = {
      timestamp: new Date().toISOString(),
      actorId: session.uid,
      actorEmail: currentUser.email || 'Unknown',
      actionType,
      entityType,
      entityId,
      entityName,
      description,
      ownerId,
    };

    await addDoc(collection(db, AUDIT_COLLECTION), auditLog);
    console.log(`✅ Audit logged: ${actionType} - ${description}`);
  } catch (error) {
    // Don't let audit logging failure break the main operation
    console.error('Failed to log audit action:', error);
  }
}

/**
 * Get audit logs for the current account (owner-only)
 */
export async function getAuditLogs(limitCount: number = 100): Promise<AuditLog[]> {
  try {
    const session = await getUserSession();
    if (!session || !session.isOwner) {
      throw new Error('Access denied: Only owners can view audit logs');
    }

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
 * Get audit logs for a specific entity (owner-only)
 */
export async function getAuditLogsForEntity(
  entityType: AuditEntityType,
  entityId: string,
  limitCount: number = 50
): Promise<AuditLog[]> {
  try {
    const session = await getUserSession();
    if (!session || !session.isOwner) {
      throw new Error('Access denied: Only owners can view audit logs');
    }

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
    default:
      return `Performed ${actionType}${entityDisplay}`;
  }
} 