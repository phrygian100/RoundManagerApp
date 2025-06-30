// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient<Deno.Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  } as Record<string, string>;
}

/**
 * POST { uid: string, code: string, password?: string }
 * Verifies the invitation code, links the user to the owner account, applies permissions
 */
serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('accept-invite called');
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const { uid: uidFromBody, code, password } = await req.json();
    console.log('Received code:', code, 'uid:', uidFromBody);
    if (!code) return new Response('code required', { status: 400 });

    // 1. find the pending member row with this invite_code
    console.log('Looking for invite code in database...');
    const { data: member, error } = await supabase
      .from('members')
      .select('*')
      .eq('invite_code', code)
      .eq('status', 'invited')
      .single();
    console.log('Member lookup result - found:', !!member, 'error:', !!error);
    if (error || !member) {
      console.log('Invalid code or not found');
      return new Response('invalid code', { status: 404 });
    }

    let uid = uidFromBody;
    // 2. link the record to this uid (if provided) or use existing uid and mark active
    if (!uid) uid = member.uid;

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

    // If a password was supplied, update it alongside metadata (allows invited users to set password)
    const updateAttrs: any = { user_metadata: claims };
    if (password) {
      updateAttrs.password = password;
      // Mark email as confirmed so the invited user can sign in right away
      updateAttrs.email_confirm = true;
    }

    if (uid) {
      await supabase.auth.admin.updateUserById(uid, updateAttrs);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500, headers: buildCorsHeaders(req) });
  }
}); 