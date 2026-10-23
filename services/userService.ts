import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { BusinessTypeConfig, getBusinessTypeConfig } from '../shared/constants/businessTypes';
import type { User } from '../types/models';

const USERS_COLLECTION = 'users';
const BUSINESS_PORTALS_COLLECTION = 'businessPortals';

// The vertical of the account (owner's user doc) the current session works in.
// Cached per owner since display code calls this on every screen mount.
let cachedBusinessTypeOwner: string | null = null;
let cachedBusinessTypeConfig: BusinessTypeConfig | null = null;

/**
 * Resolve the business-type display config for the current account.
 * Missing/legacy accounts resolve to window cleaning (see businessTypes.ts).
 */
export async function getAccountBusinessTypeConfig(): Promise<BusinessTypeConfig> {
  try {
    const ownerId = await getDataOwnerId();
    if (!ownerId) return getBusinessTypeConfig(null);
    if (cachedBusinessTypeOwner === ownerId && cachedBusinessTypeConfig) {
      return cachedBusinessTypeConfig;
    }
    const profile = await getUserProfile(ownerId);
    const config = getBusinessTypeConfig((profile as any)?.businessType);
    cachedBusinessTypeOwner = ownerId;
    cachedBusinessTypeConfig = config;
    return config;
  } catch {
    return getBusinessTypeConfig(null);
  }
}

/** Invalidate the cached business type (call after the user changes it in settings). */
export function clearAccountBusinessTypeCache() {
  cachedBusinessTypeOwner = null;
  cachedBusinessTypeConfig = null;
}

/**
 * Normalizes a business name for use as a URL/document ID
 * e.g., "TGM Window Cleaning" -> "tgmwindowcleaning"
 */
function normalizeBusinessName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

/** Firestore document ids cannot contain "/" and a few other values are reserved. */
function portalDocumentId(businessName: string): string {
  const compact = normalizeBusinessName(businessName).replace(/\//g, '');
  if (compact && compact !== '.' && compact !== '..' && !compact.startsWith('__')) {
    return compact.slice(0, 120);
  }
  return compact.replace(/[^a-z0-9]/g, '').slice(0, 120) || 'business';
}

export async function createUserProfile(user: User) {
  const userRef = doc(db, USERS_COLLECTION, user.id);
  await setDoc(userRef, user);

  // Auto-create business portal if businessName is set
  if (user.businessName) {
    await updateBusinessPortal(user.id, user.businessName, user.name, user.email);
  }
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const userRef = doc(db, USERS_COLLECTION, userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as User;
  }
  return null;
}

export async function updateUserProfile(userId: string, data: Partial<User>) {
  const userRef = doc(db, USERS_COLLECTION, userId);
  
  // If businessName is being updated, also update the business portal
  if (data.businessName !== undefined) {
    // Get the current user profile to check for old business name
    const currentProfile = await getUserProfile(userId);
    const oldBusinessName = currentProfile?.businessName;
    const newBusinessName = data.businessName;

    // If business name changed, delete old portal and create new one
    if (oldBusinessName && oldBusinessName !== newBusinessName) {
      const oldNormalized = normalizeBusinessName(oldBusinessName);
      await deleteDoc(doc(db, BUSINESS_PORTALS_COLLECTION, oldNormalized));
    }

    // Create/update the new portal
    if (newBusinessName) {
      const ownerName = data.name || currentProfile?.name || '';
      const email = data.email || currentProfile?.email || '';
      await updateBusinessPortal(userId, newBusinessName, ownerName, email);
    }
  }

  await updateDoc(userRef, data);
}

/**
 * Reconcile `businessPortals/{normalizedName}` with `users/{userId}` after any
 * direct `users` write that sets `businessName` without going through
 * {@link updateUserProfile} (e.g. first-time setup modal).
 */
export async function syncBusinessPortalFromUserDocument(
  userId: string,
  options?: { previousBusinessName?: string | null }
): Promise<void> {
  const profile = await getUserProfile(userId);
  const newBusinessName = (profile?.businessName || '').trim();
  const prev = (options?.previousBusinessName ?? '').trim();

  if (prev && prev !== newBusinessName) {
    const oldNormalized = normalizeBusinessName(prev);
    try {
      await deleteDoc(doc(db, BUSINESS_PORTALS_COLLECTION, oldNormalized));
    } catch {
      // ignore missing old portal
    }
  }

  if (newBusinessName) {
    await updateBusinessPortal(
      userId,
      newBusinessName,
      profile?.name || '',
      profile?.email || ''
    );
  }
}

/**
 * Creates or updates a business portal document for client portal access
 * This enables URLs like guvnor.app/businessname to work
 */
async function updateBusinessPortal(
  ownerId: string, 
  businessName: string, 
  ownerName?: string, 
  email?: string
) {
  let portalId = portalDocumentId(businessName);
  let portalRef = doc(db, BUSINESS_PORTALS_COLLECTION, portalId);
  const now = new Date().toISOString();
  let existing = await getDoc(portalRef);
  if (existing.exists()) {
    const owner = (existing.data() as { ownerId?: string })?.ownerId;
    if (owner && owner !== ownerId) {
      // Another business already uses this name. Don't overwrite their portal.
      portalId = `${portalId.slice(0, 100)}-${ownerId.slice(0, 8).toLowerCase()}`;
      portalRef = doc(db, BUSINESS_PORTALS_COLLECTION, portalId);
      existing = await getDoc(portalRef);
    }
  }
  let createdAt = now;
  if (existing.exists()) {
    const d = existing.data() as { createdAt?: string; ownerId?: string };
    if (d?.ownerId === ownerId && typeof d.createdAt === 'string' && d.createdAt) {
      createdAt = d.createdAt;
    }
  }

  await setDoc(portalRef, {
    ownerId,
    businessName,
    normalizedName: portalId,
    ownerName: ownerName || '',
    email: email || '',
    createdAt,
    updatedAt: now,
  });
} 