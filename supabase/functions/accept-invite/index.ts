// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient<Deno.Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

/**
 * POST { uid: string, code: string }
 * Verifies the invitation code, links the user to the owner account, applies permissions
 */
serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const { uid, code } = await req.json();
    if (!uid || !code) return new Response('uid and code required', { status: 400 });

    // 1. find the pending member row with this invite_code
    const { data: member, error } = await supabase
      .from('members')
      .select('*')
      .eq('invite_code', code)
      .eq('status', 'invited')
      .single();
    if (error || !member) return new Response('invalid code', { status: 404 });

    // 2. link the record to this uid and mark active
    const { error: updErr } = await supabase
      .from('members')
      .update({ uid, status: 'active' })
      .eq('invite_code', code);
    if (updErr) throw updErr;

    // 3. set custom claims on the auth user
    const claims: any = {
      account_id: member.account_id,
      is_owner: false,
      perms: member.perms || {},
    };
    await supabase.auth.admin.updateUserById(uid, { user_metadata: claims });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500 });
  }
}); 