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
export async function getUserSession(skipNotificationCheck = false): Promise<UserSession | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  
  // Check for permission update notifications (unless we're already in the check)
  if (!skipNotificationCheck) {
    await checkPermissionUpdateNotification(user.id);
    
    // After notification check, get fresh session data
    const { data: freshData } = await supabase.auth.getSession();
    const freshUser = freshData.session?.user;
    if (!freshUser) return null;
    
    const freshClaims: any = (freshUser as any).user_metadata || {};
    console.log('Fresh JWT Claims from user_metadata:', freshClaims);
    const accountId = freshClaims.account_id || freshClaims.accountId || freshUser.id;
    const isOwner = freshClaims.is_owner !== undefined ? !!freshClaims.is_owner : accountId === freshUser.id;
    const session = {
      uid: freshUser.id,
      accountId,
      isOwner,
      perms: freshClaims.perms || {},
    };
    console.log('Final fresh session object:', session);
    return session;
  }
  
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
 * Updated to trigger deployment of notification system
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
        
        // Delete the notification FIRST to prevent repeated triggers
        await deleteDoc(notificationRef);
        
        // Refresh the session to get updated JWT claims
        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
          console.error('Error refreshing session:', error);
        } else {
          console.log('Session refreshed successfully');
        }
        
        // Show user notification and redirect to home
        if (typeof window !== 'undefined') {
          window.alert('Your permissions have been updated. You will be redirected to the home page.');
          // Navigate to home instead of reload to avoid routing issues
          window.location.href = '/';
        }
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
  return getUserSession(true); // Skip notification check
} 