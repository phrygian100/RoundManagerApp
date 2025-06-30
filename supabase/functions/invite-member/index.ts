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
        // `getUserByEmail` is not available in supabase-js v2 yet. We need to look the
        // user up manually via `listUsers` and filter by email. We only fetch the
        // first page (1000 users) which is sufficient for typical account sizes.
        const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) {
          // Throw a new, explicit error to ensure we get a proper stack trace.
          // The Supabase client seems to be throwing an empty object on failure.
          throw new Error('supabase.auth.admin.listUsers() failed. Original error: ' + JSON.stringify(listErr));
        }
        const existingUid = listData?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
        await upsertMember(existingUid, accountId, perms, email, inviteCode);
        await sendCustomInviteEmail(email, inviteCode);
        return new Response(JSON.stringify({ ok: true, uid: existingUid }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        // The invite call failed for a reason other than the email existing.
        // Throw a new, explicit error to make sure it gets logged.
        throw new Error('supabase.auth.admin.inviteUserByEmail() failed. Original error: ' + JSON.stringify(inviteErr));
      }
    }

    const uid = inviteData.user?.id;

    await upsertMember(uid, accountId, perms, email, inviteCode);

    return new Response(JSON.stringify({ ok: true, uid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('--- INVITE MEMBER FUNCTION FAILED ---');
    console.error('Caught object:', err);
    try {
      console.error('Stringified for inspection:', JSON.stringify(err));
    } catch (e) {
      console.error('Could not stringify the error object.');
    }
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
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