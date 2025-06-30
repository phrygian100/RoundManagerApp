// Supabase Edge Function: invite-member
// Creates a user via admin API, stores member row, and sends invite link
// POST { email: string, accountId: string, perms?: Record<string, boolean> }
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
// Remote imports for Deno runtime (won't type-check in the Node toolchain)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient<Deno.Database>(
  Deno.env.get('SUPABASE_URL')!,
  // Using custom secret name (SERVICE_ROLE_KEY) because Supabase reserves SUPABASE_* prefix for internal use
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

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const { email, accountId, perms = {}, inviteCode: providedCode } = await req.json();
    if (!email || !accountId) {
      return new Response('email and accountId required', { status: 400 });
    }

    // 1. generate a short numeric code (6 digits) the member will enter during signup
    const inviteCode = providedCode || String(Math.floor(100000 + Math.random() * 900000));

    // 2. send invite email (creates user if not exists and emails link)
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: Deno.env.get('INVITE_REDIRECT_URL') || 'https://'+ (Deno.env.get('SITE_DOMAIN')||'example.com') +'/set-password',
      data: { invite_code: inviteCode },
    });

    if (inviteErr) {
      if (inviteErr.code === 'email_exists') {
        // user already exists; fetch uid, upsert member row, and send email via Resend
        const { data: existing } = await supabase.auth.admin.getUserByEmail(email);
        const existingUid = existing?.user?.id ?? null;
        await upsertMember(existingUid, accountId, perms, email, inviteCode);
        await sendCustomInviteEmail(email, inviteCode);
        return new Response(JSON.stringify({ ok: true, uid: existingUid }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        throw inviteErr;
      }
    }

    const uid = inviteData.user?.id;

    await upsertMember(uid, accountId, perms, email, inviteCode);

    return new Response(JSON.stringify({ ok: true, uid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500, headers: buildCorsHeaders(req) });
  }
});

async function sendCustomInviteEmail(to: string, code: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return;

  const body = {
    from: Deno.env.get('EMAIL_FROM') || 'no-reply@tgmwindowcleaning.co.uk',
    to,
    subject: 'You have been invited',
    html: `<h2>You've been invited!</h2><p>You have been invited to download the app as a member.</p><p>Your code is <strong>${code}</strong></p>`,
  };

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

async function upsertMember(
  uid: string | null,
  accountId: string,
  perms: Record<string, boolean>,
  email: string,
  inviteCode: string,
) {
  const { error } = await supabase.from('members').upsert({
    uid,
    account_id: accountId,
    role: 'member',
    perms,
    status: 'invited',
    email,
    invite_code: inviteCode,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
} 