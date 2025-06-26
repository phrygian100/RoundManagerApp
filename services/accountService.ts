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
};

const DEFAULT_PERMS: Record<string, boolean> = {
  viewRunsheet: true,
  viewClients: true,
  viewCompletedJobs: false,
  viewPayments: false,
  editJobs: false,
};

export async function listMembers(): Promise<MemberRecord[]> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');
  const membersRef = collection(db, `accounts/${sess.accountId}/members`);
  const snap = await getDocs(membersRef);
  return snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) as MemberRecord[];
}

export async function inviteMember(email: string): Promise<void> {
  const sess = await getUserSession();
  if (!sess) throw new Error('Not authenticated');

  // Call server-side edge function (keeps service-role key off the client)
  try {
    const { supabase } = await import('../core/supabase');
    const { error } = await supabase.functions.invoke('invite-member', {
      body: {
        email,
        accountId: sess.accountId,
        perms: DEFAULT_PERMS,
      },
    });
    if (error) throw error;
  } catch (err) {
    console.warn('Edge invite failed, falling back to Firestore-only invite', err);
    // Minimal fallback so owner still sees a placeholder row
    const memberRef = doc(db, `accounts/${sess.accountId}/members/${email}`);
    await setDoc(memberRef, {
      email,
      role: 'member',
      perms: DEFAULT_PERMS,
      status: 'invited',
      createdAt: new Date().toISOString(),
    });
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