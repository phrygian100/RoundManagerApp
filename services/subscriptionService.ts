import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getDataOwnerId, getUserSession } from '../core/session';
import { User } from '../types/models';

// Developer account UID for exemption
const DEVELOPER_UID = 'X4TtaVGKUtQSCtPLF8wsHsVZ0oW2';

export type SubscriptionTier = 'free' | 'premium' | 'exempt';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'exempt';

export interface EffectiveSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  clientLimit: number | null; // null = unlimited
  canCreateMembers: boolean;
  isExempt: boolean;
  renewalDate?: string | null; // ISO date string for next renewal
}

/**
 * Get the effective subscription for the current user
 * Handles member inheritance from account owner
 */
export async function getEffectiveSubscription(): Promise<EffectiveSubscription> {
  try {
    const session = await getUserSession();
    if (!session) {
      throw new Error('No user session found');
    }

    let userData: User;

    if (session.isOwner) {
      // User is account owner, use their own subscription
      const userDoc = await getDoc(doc(db, 'users', session.uid));
      if (!userDoc.exists()) {
        throw new Error('User document not found');
      }
      userData = userDoc.data() as User;
    } else {
      // User is a member, inherit from account owner
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        throw new Error('Account owner not found');
      }
      const ownerDoc = await getDoc(doc(db, 'users', ownerId));
      if (!ownerDoc.exists()) {
        throw new Error('Account owner document not found');
      }
      userData = ownerDoc.data() as User;
    }

    // Check for developer exemption
    const isExempt = userData.isExempt || 
                    userData.id === DEVELOPER_UID || 
                    session.uid === DEVELOPER_UID;

    if (isExempt) {
      return {
        tier: 'exempt',
        status: 'exempt',
        clientLimit: null,
        canCreateMembers: true,
        isExempt: true,
        renewalDate: null,
      };
    }

    // Default to free tier if not set
    const tier = userData.subscriptionTier || 'free';
    const status = userData.subscriptionStatus || 'active';
    const renewalDate = userData.subscriptionRenewalDate || null;

    return {
      tier,
      status,
      clientLimit: tier === 'free' ? 20 : null,
      canCreateMembers: tier === 'premium' || tier === 'exempt',
      isExempt: false,
      renewalDate,
    };
  } catch (error) {
    console.error('Error getting effective subscription:', error);
    // Fallback to free tier
    return {
      tier: 'free',
      status: 'active',
      clientLimit: 20,
      canCreateMembers: false,
      isExempt: false,
      renewalDate: null,
    };
  }
}

/**
 * Check if user can add more clients
 */
export async function checkClientLimit(): Promise<{ canAdd: boolean; currentCount: number; limit: number | null }> {
  try {
    const subscription = await getEffectiveSubscription();
    
    if (subscription.clientLimit === null) {
      // Unlimited
      return { canAdd: true, currentCount: 0, limit: null };
    }

    // Count current clients
    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      throw new Error('Owner ID not found');
    }

    const clientsQuery = query(
      collection(db, 'clients'),
      where('ownerId', '==', ownerId),
      where('status', '!=', 'ex-client')
    );
    const clientsSnapshot = await getDocs(clientsQuery);
    const currentCount = clientsSnapshot.size;

    return {
      canAdd: currentCount < subscription.clientLimit,
      currentCount,
      limit: subscription.clientLimit,
    };
  } catch (error) {
    console.error('Error checking client limit:', error);
    return { canAdd: false, currentCount: 0, limit: 20 };
  }
}

/**
 * Check if user can create team members
 */
export async function checkMemberCreationPermission(): Promise<{ canCreate: boolean; reason?: string }> {
  try {
    const subscription = await getEffectiveSubscription();
    
    if (subscription.canCreateMembers) {
      return { canCreate: true };
    }

    return {
      canCreate: false,
      reason: 'Team member creation requires a Premium subscription. Upgrade to add unlimited clients and team members.',
    };
  } catch (error) {
    console.error('Error checking member creation permission:', error);
    return {
      canCreate: false,
      reason: 'Unable to verify subscription status. Please try again.',
    };
  }
}

/**
 * Migration function to set up initial subscription tiers
 * Call this once to initialize existing users
 */
export async function migrateUsersToSubscriptions(): Promise<{ updated: number; exempt: number; errors: number }> {
  let updated = 0;
  let exempt = 0;
  let errors = 0;

  try {
    // Get all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const batch = writeBatch(db);

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data() as User;
        const userRef = doc(db, 'users', userDoc.id);

        // Skip if already has subscription data
        if (userData.subscriptionTier) {
          continue;
        }

        // Check if this is the developer account
        if (userDoc.id === DEVELOPER_UID) {
          batch.update(userRef, {
            subscriptionTier: 'exempt',
            subscriptionStatus: 'exempt',
            isExempt: true,
            clientLimit: null,
          });
          exempt++;
        } else {
          // Set all other users to free tier
          batch.update(userRef, {
            subscriptionTier: 'free',
            subscriptionStatus: 'active',
            isExempt: false,
            clientLimit: 20,
          });
          updated++;
        }
      } catch (error) {
        console.error(`Error processing user ${userDoc.id}:`, error);
        errors++;
      }
    }

    // Commit the batch
    await batch.commit();

    console.log(`Migration complete: ${updated} users set to free, ${exempt} exempt accounts, ${errors} errors`);
    return { updated, exempt, errors };
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

/**
 * Manually set a user's subscription tier (for admin use)
 */
export async function setUserSubscription(
  userId: string,
  tier: SubscriptionTier,
  status: SubscriptionStatus = 'active'
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const updates: Partial<User> = {
      subscriptionTier: tier,
      subscriptionStatus: status,
      isExempt: tier === 'exempt',
      clientLimit: tier === 'free' ? 20 : null,
    };

    await updateDoc(userRef, updates);
    console.log(`Updated subscription for user ${userId} to ${tier}`);
  } catch (error) {
    console.error('Error setting user subscription:', error);
    throw error;
  }
}

/**
 * Get subscription display information
 */
export function getSubscriptionDisplayInfo(subscription: EffectiveSubscription) {
  switch (subscription.tier) {
    case 'free':
      return {
        name: 'Free Plan',
        description: 'Up to 20 clients',
        color: '#6b7280',
        badge: 'FREE',
      };
    case 'premium':
      return {
        name: 'Premium Plan',
        description: 'Unlimited clients + team members',
        color: '#4f46e5',
        badge: 'PREMIUM',
      };
    case 'exempt':
      return {
        name: 'Developer Account',
        description: 'Unlimited access',
        color: '#059669',
        badge: 'EXEMPT',
      };
    default:
      return {
        name: 'Unknown Plan',
        description: '',
        color: '#6b7280',
        badge: 'UNKNOWN',
      };
  }
} 