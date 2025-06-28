// Supabase Edge Function: invite-member
// Creates a user via admin API, stores member row, and sends invite link
// POST { email: string, accountId: string, perms?: Record<string, boolean> }
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
// Remote imports for Deno runtime (won't type-check in the Node toolchain)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.29.3';

const supabase = createClient<Deno.Database>(
  Deno.env.get('SUPABASE_URL')!,
  // Using custom secret name (SERVICE_ROLE_KEY) because Supabase reserves SUPABASE_* prefix for internal use
  Deno.env.get('SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const { email, accountId, perms = {}, inviteCode: providedCode } = await req.json();
    if (!email || !accountId) {
      return new Response('email and accountId required', { status: 400 });
    }

    // 1. generate a short numeric code (6 digits) the member will enter during signup
    const inviteCode = String(Math.floor(100000 + Math.random() * 900000));

    // 2. send invite email (creates user if not exists and emails link)
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: Deno.env.get('INVITE_REDIRECT_URL') || 'http://localhost:3000/set-password',
      // Pass the inviteCode inside emailData so that the email template can include it (Supabase supports {{invite_code}} var)
      emailRedirectTo: undefined,
      data: { invite_code: inviteCode },
    });
    if (inviteErr) throw inviteErr;

    const uid = inviteData.user?.id;

    // 2. upsert member row (so owner sees placeholder even before accept)
    if (uid) {
      const { error: upsertErr } = await supabase.from('members').upsert({
        uid,
        account_id: accountId,
        role: 'member',
        perms,
        status: 'invited',
        email,
        invite_code: inviteCode,
        created_at: new Date().toISOString(),
      });
      if (upsertErr) throw upsertErr;
    }

    return new Response(JSON.stringify({ ok: true, uid }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500 });
  }
}); 