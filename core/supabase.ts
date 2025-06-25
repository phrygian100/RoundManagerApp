import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your own Supabase project URL and anon key
const SUPABASE_URL = 'https://rtakdzmnksdtdkmdmlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YWtkem1ua3NkdGRrbWRtbHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NDkxNDYsImV4cCI6MjA2NjQyNTE0Nn0.ioyZ9xYIJwcms3qaGNBJznQ_AolxGmBjEj3MbwI3Wk8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
} 