import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export type UserSession = {
  uid: string;
  accountId: string;
  isOwner: boolean;
  perms: Record<string, boolean>;
};

/**
 * Returns the current session enriched with custom claims (accountId, isOwner, perms).
 * If the user is not authenticated it resolves to null.
 */
export async function getUserSession(): Promise<UserSession | null> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return null;

  // Try to load user doc
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) return null;
  const userData: any = userDoc.data();

  // If user is a member of a team, look up their member record
  let isOwner = true;
  let perms: Record<string, boolean> = {};
  let accountId = user.uid;

  if (userData.accountId && userData.accountId !== user.uid) {
    // Member of a team
    accountId = userData.accountId;
    const memberDoc = await getDoc(doc(db, `accounts/${accountId}/members/${user.uid}`));
    if (memberDoc.exists()) {
      const memberData: any = memberDoc.data();
      isOwner = memberData.role === 'owner';
      perms = memberData.perms || {};
    } else {
      // Fallback: treat as owner if no member doc
      isOwner = true;
      perms = {};
    }
  } else {
    // Owner of their own account
    isOwner = true;
    perms = userData.perms || { viewClients: true, viewRunsheet: true, viewPayments: false };
    accountId = user.uid;
  }

  return {
    uid: user.uid,
    accountId,
    isOwner,
    perms,
  };
} 