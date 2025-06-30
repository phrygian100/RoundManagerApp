import { createClient } from '@supabase/supabase-js';
import { getUserSession } from './session';

// TODO: Replace with your own Supabase project URL and anon key
const SUPABASE_URL = 'https://rtakdzmnksdtdkmdmlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YWtkem1ua3NkdGRrbWRtbHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NDkxNDYsImV4cCI6MjA2NjQyNTE0Nn0.ioyZ9xYIJwcms3qaGNBJznQ_AolxGmBjEj3MbwI3Wk8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Returns the correct owner ID for data queries.
 * - For owners: returns their own user ID
 * - For members: returns the account_id (owner's ID) from their session claims
 * This ensures members can access the owner's data.
 */
export async function getDataOwnerId(): Promise<string | null> {
  const session = await getUserSession();
  if (!session) return null;
  
  // For members, use the account_id (owner's ID) to access owner's data
  // For owners, account_id equals their own uid
  return session.accountId;
} 