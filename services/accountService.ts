import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';

export type MemberRecord = {
  uid: string;
  email: string;
  role: 'owner' | 'member';
  perms: Record<string, boolean>;
  status: 'invited' | 'active' | 'disabled';
  createdAt: string;
  vehicleId?: string | null;
  /** Cost capacity this member can handle per day (£). */
  dailyRate?: number;
};

const DEFAULT_PERMS: Record<string, boolean> = {
  viewClients: true,
  viewRunsheet: true,
  viewPayments: false,
};

/**
 * Syncs members from Supabase (where edge functions write) to Firestore (where app reads)
 */
async function syncMembersFromSupabase(): Promise<void> {
  const sess = await getUserSession();
  if (!sess) return;

  try {
    const { supabase } = await import('../core/supabase');
    console.log('Fetching members from Supabase for account:', sess.accountId);
    
    // Get members from Supabase
    const { data: supabaseMembers, error } = await supabase
      .from('members')
      .select('*')
      .eq('account_id', sess.accountId);
    
    if (error) {
      console.error('Error fetching from Supabase:', error);
      return;
    }
    
    console.log('Found members in Supabase:', supabaseMembers);
    
    if (!supabaseMembers || supabaseMembers.length === 0) return;
    
    // Sync each member to Firestore
    for (const member of supabaseMembers) {
      const firestoreMemberRef = doc(db, `accounts/${sess.accountId}/members/${member.uid || member.invite_code}`);
      await setDoc(firestoreMemberRef, {
        email: member.email,
        role: member.role,
        perms: member.perms || DEFAULT_PERMS,
        status: member.status,
        inviteCode: member.invite_code,
        createdAt: member.created_at,
      }, { merge: true });
      console.log('Synced member to Firestore:', member.email);
      // Clean up old placeholder doc that used the numeric invite_code as the doc ID
      // When the invite was first created, we stored a Firestore doc with id = invite_code
      // (because uid was null). Once the invite is accepted we now have a real uid, so
      // we can safely delete that placeholder to avoid duplicates in Team & Rota.
      if (member.uid && member.invite_code) {
        try {
          const placeholderRef = doc(db, `accounts/${sess.accountId}/members/${member.invite_code}`);
          await deleteDoc(placeholderRef);
          console.log('Removed placeholder member doc for invite_code', member.invite_code);
        } catch (cleanupErr) {
          // Not fatal; placeholder might already be gone.
          console.warn('Could not delete placeholder doc', cleanupErr);
        }
      }
    }
  } catch (err) {
    console.error('Error syncing members from Supabase:', err);
  }
}

export async function listMembers(): Promise<MemberRecord[]> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  
  // First sync from Supabase to Firestore
  await syncMembersFromSupabase();
  
  // Then read from Firestore
  const membersRef = collection(db, `accounts/${sess.accountId}/members`);
  const snap = await getDocs(membersRef);
  const members = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) as MemberRecord[];
  
  // Ensure owner row exists
  const ownerExists = members.some(m => m.role === 'owner');
  if (!ownerExists) {
    try {
      const { supabase } = await import('../core/supabase');
      const { data: sessData } = await supabase.auth.getSession();
      const authUser = sessData.session?.user;
      if (authUser) {
        const ownerDocRef = doc(db, `accounts/${sess.accountId}/members/${authUser.id}`);
        const ownerData: MemberRecord = {
          uid: authUser.id,
          email: authUser.email || 'owner@example.com',
          role: 'owner',
          perms: DEFAULT_PERMS,
          status: 'active',
          createdAt: new Date().toISOString(),
          vehicleId: null,
          dailyRate: 0,
        } as MemberRecord;
        await setDoc(ownerDocRef, ownerData, { merge: true });
        members.push(ownerData);
      }
    } catch (err) {
      console.error('Error ensuring owner member doc:', err);
    }
  }
  console.log('Final members list from Firestore:', members);
  return members;
}

export async function inviteMember(email: string): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  // Call server-side edge function (keeps service-role key off the client)
  try {
    const { supabase } = await import('../core/supabase');
    const inviteCode = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await supabase.functions.invoke('invite-member', {
      body: {
        email,
        accountId: sess.accountId,
        perms: DEFAULT_PERMS,
        inviteCode,
      },
    });
    if (error) throw error;
  } catch (err) {
    console.warn('Edge invite failed, falling back to Firestore-only invite', err);
    const inviteCode = String(Math.floor(100000 + Math.random() * 900000));
    // Minimal fallback so owner still sees a placeholder row plus code displayed in UI
    const memberRef = doc(db, `accounts/${sess.accountId}/members/${inviteCode}`);
    await setDoc(memberRef, {
      email,
      role: 'member',
      perms: DEFAULT_PERMS,
      status: 'invited',
      inviteCode,
      createdAt: new Date().toISOString(),
    });
  }
}

export async function updateMemberPerms(uid: string, perms: Record<string, boolean>): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  
  console.log('Updating permissions for uid:', uid, 'perms:', perms);
  
  // Update Firestore
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${uid}`);
  await updateDoc(memberRef, { perms });
  
  // Also update Supabase so it syncs with JWT claims
  try {
    const { supabase } = await import('../core/supabase');
    const { error } = await supabase
      .from('members')
      .update({ perms })
      .eq('uid', uid)
      .eq('account_id', sess.accountId);
    
    if (error) {
      console.error('Error updating permissions in Supabase:', error);
    } else {
      console.log('Successfully updated permissions in Supabase');
    }
    
    // Update JWT claims immediately for the affected user
    const { error: claimsError } = await supabase.functions.invoke('set-claims', {
      body: { uid, accountId: sess.accountId }
    });
    
    if (claimsError) {
      console.error('Error updating JWT claims:', claimsError);
    } else {
      console.log('Successfully triggered claims update');
    }
    
    // Store a notification for the member that their permissions changed
    // This will be checked when they next load a page
    try {
      const notificationRef = doc(db, `accounts/${sess.accountId}/notifications/${uid}`);
      await setDoc(notificationRef, {
        type: 'permissions_updated',
        timestamp: new Date().toISOString(),
        message: 'Your permissions have been updated. Please refresh the page to see changes.',
      }, { merge: true });
      console.log('Created permission update notification for member');
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
    }
    
    // If the current user is the one being updated, refresh their session immediately
    if (uid === sess.uid) {
      console.log('Refreshing current user session to apply new permissions');
      await supabase.auth.refreshSession();
      // Reload the page to ensure new permissions take effect
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  } catch (err) {
    console.error('Error syncing permissions to Supabase:', err);
  }
}

export async function removeMember(uid: string): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  
  // 1. Delete from Firestore
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${uid}`);
  await deleteDoc(memberRef);
  
  try {
    const { supabase } = await import('../core/supabase');
    
    // 2. Delete from Supabase members table
    const { error: deleteErr } = await supabase
      .from('members')
      .delete()
      .eq('uid', uid);
    
    if (deleteErr) {
      console.error('Error deleting member in Supabase:', deleteErr);
    } else {
      console.log('Deleted member row from Supabase');
    }
    
    // 3. Reset JWT claims for the removed user (makes them an owner of their own account)
    const { error: claimsError } = await supabase.functions.invoke('set-claims', {
      body: { uid, accountId: uid, forceReset: true },
    });
    
    if (claimsError) {
      console.error('Error resetting JWT claims for removed member:', claimsError);
    }
    
    // 4. Notify the removed user so they refresh session
    try {
      const notificationRef = doc(db, `accounts/${sess.accountId}/notifications/${uid}`);
      await setDoc(notificationRef, {
        type: 'member_removed',
        timestamp: new Date().toISOString(),
        message: 'You have been removed from the team. Your account has been reset to personal mode.',
      }, { merge: true });
      console.log('Created member_removed notification for user');
    } catch (notifErr) {
      console.error('Error creating member removal notification:', notifErr);
    }
  } catch (err) {
    console.error('Error removing member (Supabase sync):', err);
  }
}

export async function leaveTeamSelf(): Promise<void> {
  // Member self-service: leave current team and reset to personal owner account
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  if (sess.isOwner) {
    // Owners cannot leave their own team – nothing to do
    console.warn('leaveTeamSelf called by owner – ignoring');
    return;
  }

  // Best-effort Firestore cleanup – if security rules prevent this it should not block the reset
  try {
    const memberRef = doc(db, `accounts/${sess.accountId}/members/${sess.uid}`);
    await deleteDoc(memberRef);
    console.log('Deleted Firestore member doc for self');
  } catch (err) {
    console.warn('Could not delete Firestore member doc (likely permission issue):', err);
  }

  try {
    const { supabase } = await import('../core/supabase');

    // Call set-claims to reset JWT claims and delete member rows server-side
    const { error } = await supabase.functions.invoke('set-claims', {
      body: { uid: sess.uid, accountId: sess.uid, forceReset: true },
    });
    if (error) {
      console.error('Error invoking set-claims for leaveTeamSelf:', error);
      throw error;
    }

    console.log('Successfully invoked set-claims, user should now be personal owner');
  } catch (err) {
    console.error('leaveTeamSelf error:', err);
    throw err;
  }
}

export async function updateMemberVehicle(uid: string, vehicleId: string | null): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${uid}`);
  await updateDoc(memberRef, { vehicleId });
}

export async function updateMemberDailyRate(uid: string, dailyRate: number): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  const memberRef = doc(db, `accounts/${sess.accountId}/members/${uid}`);
  await updateDoc(memberRef, { dailyRate });
} 