import { getAuth } from 'firebase/auth';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
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

  // Ensure owner row exists (client-side check)
  const sess = await getUserSession();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  if (!sess || !currentUser) throw new Error('Not authenticated');

  const ownerExists = members.some(m => m.role === 'owner');
  if (!ownerExists) {
    // This part should ideally be handled by a cloud function or on registration
    // For now, we'll keep the client-side fallback to ensure UI consistency
    const ownerData: MemberRecord = {
      uid: sess.uid,
      email: currentUser.email || '', // Use auth user email
      role: 'owner',
      perms: DEFAULT_PERMS,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    members.push(ownerData);
  }
  return members;
}

export async function inviteMember(email: string): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  // Check if member already exists first
  const existingMembers = await listMembers();
  const existingMember = existingMembers.find(m => m.email.toLowerCase() === email.toLowerCase());
  if (existingMember) {
    throw new Error(`User ${email} is already a team member or has a pending invitation`);
  }

  // Create a Firestore invite (no email sent)
  const inviteCode = String(Math.floor(100000 + Math.random() * 900000));
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${inviteCode}`);
  await setDoc(memberRef, {
    email,
    role: 'member',
    perms: DEFAULT_PERMS,
    status: 'invited',
    inviteCode,
    createdAt: new Date().toISOString(),
  });

  // Supabase invite-member/email flows removed. TODO: Implement with Firebase if needed.
}

export async function updateMemberPerms(uid: string, perms: Record<string, boolean>): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${uid}`);
  await updateDoc(memberRef, { perms });
}

export async function removeMember(uid: string): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${uid}`);
  await deleteDoc(memberRef);
}

export async function leaveTeamSelf(): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  if (sess.isOwner) {
    // Owners cannot leave their own team – nothing to do
    return;
  }
  const memberRef = doc(db, `accounts/${sess.accountId}/members/${sess.uid}`);
  await deleteDoc(memberRef);
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
 