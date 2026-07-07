import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, type IdTokenResult, type User } from 'firebase/auth';
import { auth, db } from './firebase';

export type UserSession = {
  uid: string;
  accountId: string;
  isOwner: boolean;
  perms: Record<string, boolean>;
};

/**
 * Waits for Firebase Auth to finish initializing and returns the current user (or null).
 *
 * Why: After locking Firestore down (no public reads), calling Firestore before Auth hydration
 * can throw "Missing or insufficient permissions" on web due to unauthenticated reads.
 */
export async function waitForAuthReady(timeoutMs: number = 5000): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;

  return await new Promise<User | null>((resolve) => {
    let done = false;
    const finish = (u: User | null) => {
      if (done) return;
      done = true;
      resolve(u);
    };

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      unsubscribe();
      finish(u);
    });

    setTimeout(() => {
      try {
        unsubscribe();
      } catch (_) {
        // ignore
      }
      finish(auth.currentUser ?? null);
    }, timeoutMs);
  });
}

// Guard so the "claims look unset" forced token refresh in getUserSession() runs at most
// once per signed-in user per app session. getIdTokenResult(true) is a network round trip;
// for accounts whose custom claims were never set server-side the refreshed token *still*
// has no claims, so without this guard every getUserSession() call would pay that round
// trip forever — which made screens that call it repeatedly (e.g. the runsheet) crawl.
let claimsRefreshAttemptedForUid: string | null = null;
let claimsRefreshInFlight: Promise<IdTokenResult> | null = null;

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
  // Don't bail before Auth has hydrated. On a hard refresh (notably Safari/iOS) the
  // restored user may not be on `auth.currentUser` synchronously yet.
  const user = auth.currentUser ?? (await waitForAuthReady());
  if (!user) return null;

  // Prefer Auth token claims (set via refreshClaims Cloud Function) to avoid brittle Firestore lookups.
  // This is important under locked-down rules where collectionGroup member discovery may be denied.
  let claimsAccountId: string | null = null;
  let claimsIsOwner: boolean | null = null;
  try {
    let tokenResult = await user.getIdTokenResult();
    let claims: any = tokenResult?.claims || {};
    // Safari/iOS (and others) can restore a cached auth session on a hard refresh before the
    // custom claims are attached to the in-memory token. If the claims look unset, force a single
    // token refresh so a team member isn't briefly mis-resolved as the owner of their own (Free)
    // account — which is what flashes the Free-plan banner before a second refresh "fixes" it.
    // At most ONE forced refresh per user per app session (shared by concurrent callers);
    // accounts that genuinely have no claims fall back to the Firestore-derived session below.
    if (
      claims.accountId === undefined &&
      claims.isOwner === undefined &&
      claimsRefreshAttemptedForUid !== user.uid
    ) {
      if (!claimsRefreshInFlight) {
        const uid = user.uid;
        claimsRefreshInFlight = user.getIdTokenResult(true).finally(() => {
          claimsRefreshAttemptedForUid = uid;
          claimsRefreshInFlight = null;
        });
      }
      tokenResult = await claimsRefreshInFlight;
      claims = tokenResult?.claims || {};
    }
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