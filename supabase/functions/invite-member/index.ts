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
  // Using SUPABASE_SERVICE_ROLE_KEY for consistency across all edge functions
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
    // Debug: Log environment variable availability
    console.log('SUPABASE_URL exists:', !!Deno.env.get('SUPABASE_URL'));
    console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const { email, accountId, perms = {}, inviteCode: providedCode } = await req.json();
    if (!email || !accountId) {
      return new Response('email and accountId required', { status: 400 });
    }

    // 1. generate a short numeric code (6 digits) the member will enter during signup
    const inviteCode = providedCode || String(Math.floor(100000 + Math.random() * 900000));

    // 2. send invite email (creates user if not exists and emails link)
    console.log('Attempting inviteUserByEmail for:', email);
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: Deno.env.get('INVITE_REDIRECT_URL') || 'https://'+ (Deno.env.get('SITE_DOMAIN')||'example.com') +'/set-password',
      data: { invite_code: inviteCode },
    });
    console.log('inviteUserByEmail result - data:', !!inviteData, 'error:', !!inviteErr);

    if (inviteErr) {
      if (inviteErr.code === 'email_exists') {
        // user already exists; fetch uid, upsert member row, and send email via Resend
        // `getUserByEmail` is not available in supabase-js v2 yet. We need to look the
        // user up manually via `listUsers` and filter by email. We only fetch the
        // first page (1000 users) which is sufficient for typical account sizes.
        console.log('Email exists, attempting listUsers...');
        const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        console.log('listUsers result - data:', !!listData, 'error:', !!listErr);
        if (listErr) {
          // Throw a new, explicit error to ensure we get a proper stack trace.
          // The Supabase client seems to be throwing an empty object on failure.
          throw new Error('supabase.auth.admin.listUsers() failed. Original error: ' + JSON.stringify(listErr));
        }
        const existingUid = listData?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
        console.log('Found existing user:', !!existingUid);
        
        try {
          await upsertMember(existingUid, accountId, perms, email, inviteCode);
          console.log('upsertMember completed for existing user');
          
          await sendCustomInviteEmail(email, inviteCode);
          console.log('sendCustomInviteEmail completed for existing user');
        } catch (memberError) {
          console.error('Failed to process existing user invitation:', memberError);
          throw memberError;
        }
        
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

    try {
      await upsertMember(uid, accountId, perms, email, inviteCode);
      console.log('Member record created successfully, returning success');
    } catch (memberError) {
      console.error('Failed to create member record:', memberError);
      throw memberError;
    }

    return new Response(JSON.stringify({ ok: true, uid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('--- INVITE MEMBER FUNCTION FAILED ---');
    console.error('Error type:', typeof err);
    console.error('Error message:', err?.message || 'No message');
    console.error('Error stack:', err?.stack || 'No stack');
    console.error('Full error object:', err);
    
    // Return more specific error message
    const errorMessage = err?.message || 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      error: 'invite_failed', 
      message: errorMessage,
      details: String(err)
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function sendCustomInviteEmail(to: string, code: string) {
  console.log('Starting sendCustomInviteEmail for:', to);
  
  const apiKey = Deno.env.get('RESEND_API_KEY');
  console.log('RESEND_API_KEY exists:', !!apiKey);
  
  if (!apiKey) {
    console.error('RESEND_API_KEY not found - email will not be sent');
    return;
  }

  const body = {
    from: Deno.env.get('EMAIL_FROM') || 'no-reply@tgmwindowcleaning.co.uk',
    to,
    subject: 'You have been invited',
    html: `<h2>You've been invited!</h2><p>You have been invited to download the app as a member.</p><p>Your code is <strong>${code}</strong></p>`,
  };

  console.log('Sending email via Resend to:', to);
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    
    const result = await response.text();
    console.log('Resend API response status:', response.status);
    console.log('Resend API response:', result);
    
    if (!response.ok) {
      throw new Error(`Resend API failed: ${response.status} - ${result}`);
    }
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

async function upsertMember(
  uid: string | null,
  accountId: string,
  perms: Record<string, boolean>,
  email: string,
  inviteCode: string,
) {
  console.log('upsertMember called with:', { uid, accountId, email, inviteCode });
  
  // Use simple upsert - safer and won't cause 500 errors
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
  
  if (error) {
    console.error('Error in upsertMember:', error);
    throw error;
  }
  
  console.log('Member record upserted successfully for:', email);
} 