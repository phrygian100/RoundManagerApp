import { supabase } from './supabase';

export type UserSession = {
  uid: string;
  accountId: string;
  isOwner: boolean;
  perms: Record<string, boolean>;
};

/**
 * Returns the current session enriched with custom claims (account_id, is_owner, perms).
 * If the user is not authenticated it resolves to null.
 */
export async function getUserSession(): Promise<UserSession | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const claims: any = (user as any).user_metadata || {};
  console.log('JWT Claims from user_metadata:', claims);
  // Supabase places custom JWT claims under app_metadata.claims when using GoTrue, but when we use the edge function
  // they are flattened into user.user_metadata.
  const accountId = claims.account_id || claims.accountId || user.id;
  const isOwner = claims.is_owner !== undefined ? !!claims.is_owner : accountId === user.id;
  const session = {
    uid: user.id,
    accountId,
    isOwner,
    perms: claims.perms || {},
  };
  console.log('Final session object:', session);
  return session;
} 