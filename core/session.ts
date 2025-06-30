import { deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { supabase } from './supabase';

export type UserSession = {
  uid: string;
  accountId: string;
  isOwner: boolean;
  perms: Record<string, boolean>;
};

/**
 * Returns the current session enriched with custom claims (account_id, is_owner, perms).
 * If the user is not authenticated it resolves to null.
 */
export async function getUserSession(): Promise<UserSession | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  
  // Check for permission update notifications
  await checkPermissionUpdateNotification(user.id);
  
  const claims: any = (user as any).user_metadata || {};
  console.log('JWT Claims from user_metadata:', claims);
  // Supabase places custom JWT claims under app_metadata.claims when using GoTrue, but when we use the edge function
  // they are flattened into user.user_metadata.
  const accountId = claims.account_id || claims.accountId || user.id;
  const isOwner = claims.is_owner !== undefined ? !!claims.is_owner : accountId === user.id;
  const session = {
    uid: user.id,
    accountId,
    isOwner,
    perms: claims.perms || {},
  };
  console.log('Final session object:', session);
  return session;
}

/**
 * Checks if there's a permission update notification for the current user
 */
async function checkPermissionUpdateNotification(uid: string): Promise<void> {
  try {
    const sess = await getUserSessionQuick(); // Get session without notification check to avoid recursion
    if (!sess) return;
    
    const notificationRef = doc(db, `accounts/${sess.accountId}/notifications/${uid}`);
    const notificationSnap = await getDoc(notificationRef);
    
    if (notificationSnap.exists()) {
      const notification = notificationSnap.data();
      if (notification.type === 'permissions_updated') {
        console.log('Permission update notification found, refreshing session...');
        
        // Refresh the session to get updated JWT claims
        await supabase.auth.refreshSession();
        
        // Show user notification
        if (typeof window !== 'undefined') {
          const shouldRefresh = window.confirm('Your permissions have been updated. Refresh the page to see changes?');
          if (shouldRefresh) {
            window.location.reload();
          }
        }
        
        // Delete the notification so it doesn't trigger again
        await deleteDoc(notificationRef);
      }
    }
  } catch (error) {
    console.error('Error checking permission update notification:', error);
  }
}

/**
 * Quick session getter that doesn't check notifications (to avoid recursion)
 */
async function getUserSessionQuick(): Promise<UserSession | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  
  const claims: any = (user as any).user_metadata || {};
  const accountId = claims.account_id || claims.accountId || user.id;
  const isOwner = claims.is_owner !== undefined ? !!claims.is_owner : accountId === user.id;
  
  return {
    uid: user.id,
    accountId,
    isOwner,
    perms: claims.perms || {},
  };
} 