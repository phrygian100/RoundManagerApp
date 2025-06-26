import { createClient } from '@supabase/supabase-js';

// DEBUG log env var during server build
// eslint-disable-next-line no-console
console.log('Loaded NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
); 