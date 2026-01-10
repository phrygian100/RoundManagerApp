import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

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
  const user = auth.currentUser;
  if (!user) return null;

  // Prefer Auth token claims (set via refreshClaims Cloud Function) to avoid brittle Firestore lookups.
  // This is important under locked-down rules where collectionGroup member discovery may be denied.
  let claimsAccountId: string | null = null;
  let claimsIsOwner: boolean | null = null;
  try {
    const tokenResult = await user.getIdTokenResult();
    const claims: any = tokenResult?.claims || {};
    if (typeof claims.accountId === 'string' && claims.accountId) {
      claimsAccountId = claims.accountId;
    }
    if (typeof claims.isOwner === 'boolean') {
      claimsIsOwner = claims.isOwner;
    }
  } catch (_) {
    // Ignore and fall back to Firestore-derived session
  }

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

  // Determine accountId from best available source
  if (userData.accountId && userData.accountId !== user.uid) {
    // Member of a team
    accountId = userData.accountId;
  } else if (claimsAccountId && claimsAccountId !== user.uid) {
    accountId = claimsAccountId;
  } else {
    accountId = user.uid;
    // keep default; we'll fill perms/isOwner below
  }

  // Resolve member/owner role and permissions
  if (accountId !== user.uid) {
    // Member of a team (or at least operating under a team accountId)
    try {
      const memberDoc = await getDoc(doc(db, `accounts/${accountId}/members/${user.uid}`));
      if (memberDoc.exists()) {
        const memberData = memberDoc.data() as MemberData;
        isOwner = memberData.role === 'owner';
        perms = memberData.perms || {};
      } else {
        // If claims say owner/member, respect that; otherwise deny elevated perms
        isOwner = claimsIsOwner ?? false;
        perms = {};
      }
    } catch (err) {
      // If we can't read member doc, fall back to claims only
      isOwner = claimsIsOwner ?? false;
      perms = {};
    }
  } else {
    // Owner of their own account
    isOwner = claimsIsOwner ?? true;
    perms = userData.perms || { viewClients: true, viewRunsheet: true, viewPayments: false };
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