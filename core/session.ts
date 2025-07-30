import { getAuth } from 'firebase/auth';
import { collectionGroup, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase';

export type UserSession = {
  uid: string;
  accountId: string;
  isOwner: boolean;
  perms: Record<string, boolean>;
};

type UserData = {
  accountId?: string;
  perms?: Record<string, boolean>;
};

type MemberData = {
  role: string;
  perms?: Record<string, boolean>;
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
  if (!userDoc.exists()) {
    return null;
  }
  const userData = userDoc.data() as UserData;

  // If user is a member of a team, look up their member record
  let isOwner = true;
  let perms: Record<string, boolean> = {};
  let accountId = user.uid;

  if (userData.accountId && userData.accountId !== user.uid) {
    // Member of a team
    accountId = userData.accountId;
    const memberDoc = await getDoc(doc(db, `accounts/${accountId}/members/${user.uid}`));
    if (memberDoc.exists()) {
      const memberData = memberDoc.data() as MemberData;
      isOwner = memberData.role === 'owner';
      perms = memberData.perms || {};
    } else {
      // Fallback: treat as owner if no member doc
      isOwner = true;
      perms = {};
    }
  } else {
    // Owner of their own account OR potential legacy member without accountId
    isOwner = true;
    perms = userData.perms || { viewClients: true, viewRunsheet: true, viewPayments: false };
    accountId = user.uid;

    // 🔄 Legacy fallback: if accountId equals user.uid we might be dealing with a historical member record
    try {
      const memberQuery = query(
        collectionGroup(db, 'members'),
        where('uid', '==', user.uid),
        where('status', '==', 'active'),
        limit(1)
      );
      const memberSnap = await getDocs(memberQuery);
      if (!memberSnap.empty) {
        const memberDoc = memberSnap.docs[0];
        const legacyAccountId = memberDoc.ref.parent.parent?.id;
        if (legacyAccountId) {
          accountId = legacyAccountId;
          const memberData = memberDoc.data() as MemberData;
          isOwner = memberData.role === 'owner';
          perms = memberData.perms || perms;
        }
      }
    } catch (err) {
      console.warn('⚠️ Fallback member record lookup failed:', err);
    }
  }

  return {
    uid: user.uid,
    accountId,
    isOwner,
    perms,
  };
}

/**
 * Returns the current Firebase Auth user UID, or null if not signed in.
 */
export function getCurrentUserId(): string | null {
  const auth = getAuth();
  return auth.currentUser ? auth.currentUser.uid : null;
}

/**
 * Returns the data owner ID (accountId) for the current user, or null if not signed in.
 * This is the user's own UID if they are an owner, or their accountId if they are a team member.
 */
export async function getDataOwnerId(): Promise<string | null> {
  const session = await getUserSession();
  return session ? session.accountId : null;
} 