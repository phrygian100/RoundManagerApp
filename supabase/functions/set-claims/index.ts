// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: set-claims
// Triggered on auth events OR manual calls; sets custom JWT claims (account_id, is_owner, perms)
// Requires env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient<Deno.Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

type AuthPayload = {
  event: 'SIGNED_IN' | 'USER_CREATED';
  session: {
    user: { id: string; email: string };
  };
};

type ManualPayload = {
  uid: string;
  accountId: string;
  forceReset?: boolean;
};

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('set-claims function called');
    const payload = await req.json();
    console.log('Payload received:', JSON.stringify(payload));
    
    let uid: string;
    
    // Handle both auth events and manual calls
    if (payload.event) {
      // Auth event payload
      const authPayload = payload as AuthPayload;
      uid = authPayload.session.user.id;
      console.log('Processing auth event for uid:', uid);
    } else {
      // Manual call payload
      const manualPayload = payload as ManualPayload;
      uid = manualPayload.uid;
      console.log('Processing manual call for uid:', uid);
    }

    console.log('Looking up member record for uid:', uid);
    
    // Find member doc (handle duplicates by taking most recent)
    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error finding member:', error);
      return new Response('member lookup error: ' + JSON.stringify(error), { 
        status: 400,
        headers: corsHeaders
      });
    }
    
    const member = members?.[0]; // Take most recent record
    
    let claims: any;
    if (member) {
      console.log('Found member record:', JSON.stringify(member));
      claims = {
        account_id: member.account_id,
        is_owner: member.role === 'owner',
        perms: member.perms || {},
      };
    } else {
      // No member record – treat as personal owner reset if manual accountId provided
      const manualPayload = payload as ManualPayload;
      if (!manualPayload.accountId) {
        console.log('No member record and no accountId provided, nothing to update');
        return new Response('no member record found', {
          status: 200,
          headers: corsHeaders,
        });
      }
      console.log('No member record found, resetting claims to personal account owner');
      claims = {
        account_id: manualPayload.accountId,
        is_owner: true,
        perms: {},
      };
    }

    const manualPayload = payload as ManualPayload;

    if (manualPayload.forceReset) {
      console.log('forceReset flag detected – overriding member record');
      claims = {
        account_id: manualPayload.accountId,
        is_owner: true,
        perms: {},
      };
    } else if (member) {
      console.log('Found member record:', JSON.stringify(member));
      claims = {
        account_id: member.account_id,
        is_owner: member.role === 'owner',
        perms: member.perms || {},
      };
    }

    console.log('Setting JWT claims:', JSON.stringify(claims));

    const { error: updateError } = await supabase.auth.admin.updateUserById(uid, {
      user_metadata: claims,
    });

    if (updateError) {
      console.error('Error updating user metadata:', updateError);
      return new Response('update error: ' + JSON.stringify(updateError), { 
        status: 500,
        headers: corsHeaders
      });
    }

    // If forceReset, delete any member rows for this uid to avoid it being recreated
    if (manualPayload.forceReset) {
      const { error: delErr } = await supabase
        .from('members')
        .delete()
        .eq('uid', uid);
      if (delErr) {
        console.error('Error deleting member rows during forceReset:', delErr);
      } else {
        console.log('Deleted member rows for uid during forceReset');
      }
    }

    console.log('Successfully updated JWT claims for uid:', uid);
    return new Response('claims updated successfully', { headers: corsHeaders });
  } catch (err) {
    console.error('set-claims function error:', err);
    return new Response('internal error: ' + String(err), { 
      status: 500,
      headers: corsHeaders
    });
  }
}); 