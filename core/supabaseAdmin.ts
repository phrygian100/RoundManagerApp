import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rtakdzmnksdtdkmdmlvu.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  // In the mobile bundle this will be undefined (admin never runs there). That's fine.
  console.warn('[supabaseAdmin] SERVICE_ROLE_KEY env var not set. Admin client will be unusable.');
}

// NOTE: Loading dotenv in a React-Native bundle fails because it tries to
// `require` Node core modules like `fs`/`path` which aren't available in the
// JSC runtime. We only need dotenv when this helper runs in a pure Node
// environment (local scripts, edge functions, etc.).  When the file is
// bundled into the Expo / React-Native app we skip it.

// Dynamically load dotenv **only** when the code is executed in Node.
try {
  // In React-Native, process.versions is undefined. When the code runs in a
  // real Node environment (scripts, edge functions) it exists. We still want
  // dotenv *there*, but we must keep Metro from bundling it – otherwise it
  // drags in Node-core deps like `path`.

  if (typeof process !== 'undefined' && process.versions?.node) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // Use eval so Metro can't statically analyse the require() and will skip it.
    // This makes the import noop in the React-Native bundle while still working
    // in Node.
    const dot = eval('require')("dotenv");
    dot.config();
  }
} catch {
  /* no-op – safe to ignore in RN runtime */
}

export const supabaseAdmin = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : undefined as unknown as ReturnType<typeof createClient>; 