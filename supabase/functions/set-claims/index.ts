// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: set-claims
// Triggered on auth events; sets custom JWT claims (account_id, is_owner, perms)
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

serve(async (req) => {
  try {
    const payload = await req.json() as AuthPayload;
    const uid = payload.session.user.id;

    // 1. find member doc
    const { data: member, error } = await supabase
      .from('members') // placeholder table; Firestore used in app; you may migrate this logic server-side later.
      .select('*')
      .eq('uid', uid)
      .single();

    if (error || !member) {
      // No member record yet -> do nothing
      return new Response('no member', { status: 200 });
    }

    const claims: any = {
      account_id: member.account_id,
      is_owner: member.role === 'owner',
      perms: member.perms || {},
    };

    await supabase.auth.admin.updateUserById(uid, {
      user_metadata: claims,
    });

    return new Response('claims set');
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500 });
  }
}); 