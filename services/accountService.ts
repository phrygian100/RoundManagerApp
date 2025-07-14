import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';
// Only for invite-member edge function call
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  // Read from Firestore
  const membersRef = collection(db, `accounts/${sess.accountId}/members`);
  const snap = await getDocs(membersRef);
  const members = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) as MemberRecord[];

  // Ensure owner row exists
  const ownerExists = members.some(m => m.role === 'owner');
  if (!ownerExists) {
    const ownerDocRef = doc(db, `accounts/${sess.accountId}/members/${sess.uid}`);
    const ownerData: MemberRecord = {
      uid: sess.uid,
      email: '', // Could fetch from users/{uid} if needed
      role: 'owner',
      perms: DEFAULT_PERMS,
      status: 'active',
      createdAt: new Date().toISOString(),
      vehicleId: null,
      dailyRate: 0,
    };
    await setDoc(ownerDocRef, ownerData, { merge: true });
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

  // Call Supabase edge function to send invite email via Resend
  const { error } = await supabase.functions.invoke('invite-member', {
    body: {
      email,
      accountId: sess.accountId,
      perms: DEFAULT_PERMS,
      inviteCode,
    },
  });
  if (error) {
    throw new Error(error.message || 'Failed to send invite email');
  }
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