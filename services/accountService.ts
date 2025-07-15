import { getAuth } from 'firebase/auth';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';
// Supabase invite-member/email flows removed. TODO: Implement with Firebase if needed.

export type MemberRecord = {
  uid: string;
  email: string;
  role: 'owner' | 'member';
  perms: Record<string, boolean>;
  status: 'invited' | 'active' | 'disabled';
  createdAt: string;
  vehicleId?: string | null;
  dailyRate?: number;
};

const DEFAULT_PERMS: Record<string, boolean> = {
  viewClients: true,
  viewRunsheet: true,
  viewPayments: false,
};

export async function listMembers(): Promise<MemberRecord[]> {
  const functions = getFunctions();
  const listMembersFn = httpsCallable(functions, 'listMembers');
  const result = await listMembersFn();
  const members = result.data as MemberRecord[];
  return members;
}

export async function inviteMember(email: string): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const existingMembers = await listMembers();
  const existingMember = existingMembers.find(m => m.email.toLowerCase() === email.toLowerCase());
  if (existingMember) {
    throw new Error(`User ${email} is already a team member or has a pending invitation`);
  }
  const functions = getFunctions();
  const inviteMemberFn = httpsCallable(functions, 'inviteMember');
  await inviteMemberFn({ email });
}

export async function updateMemberPerms(uid: string, perms: Record<string, boolean>): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${uid}`);
  await updateDoc(memberRef, { perms });
}

export async function removeMember(uid: string): Promise<void> {
  const functions = getFunctions();
  const removeMemberFn = httpsCallable(functions, 'removeMember');
  await removeMemberFn({ memberUid: uid });
}

export async function leaveTeamSelf(): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  if (sess.isOwner && sess.accountId === sess.uid) {
    // Owners cannot leave their own team – nothing to do
    return;
  }
  
  // Delete member record
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${sess.uid}`);
  await deleteDoc(memberRef);
  
  // Update user's document to reset accountId to their own uid
  const userRef = doc(db, 'users', sess.uid);
  await updateDoc(userRef, {
    accountId: sess.uid,
    updatedAt: new Date().toISOString(),
  });
  
  // Refresh claims to update permissions
  const functions = getFunctions();
  const refreshClaims = httpsCallable(functions, 'refreshClaims');
  await refreshClaims();
  
  // Force token refresh to get new claims
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (currentUser) {
    await currentUser.getIdToken(true);
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
 