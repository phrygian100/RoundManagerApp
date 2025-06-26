'use client';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function SetPassword() {
  const [pw, setPw] = useState('');
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      // 1) Handle invite / magic-link tokens that Supabase appends as query params
      const url = new URL(window.location.href);
      const token = url.searchParams.get('token');
      const type = url.searchParams.get('type');

      if (token && type) {
        // For email invites Supabase uses type=invite
        // For magic-link sign-in it is type=magiclink
        // @ts-expect-error – email not required for invite token types
        const { error } = await supabase.auth.verifyOtp({
          token,
          type: type as any,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.error('verifyOtp failed', error.message);
        }
        // remove sensitive params from the URL bar
        url.searchParams.delete('token');
        url.searchParams.delete('type');
        window.history.replaceState({}, '', url.pathname);
      }

      // 2) Handle older hash-based magic-link format (#access_token=…&refresh_token=…)
      if (window.location.hash.includes('access_token')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
          // clean the URL
          window.history.replaceState({}, '', url.pathname);
        }
      }

      // 3) Exchange any PKCE code in the URL (OAuth etc.)
      try {
        await supabase.auth.exchangeCodeForSession(window.location.href);
      } catch {
        /* noop */
      }

      // 4) Listen for the auth update that comes right after exchange / verify / setSession
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        setLoading(false);
      });

      // 5) Fallback: if a session already exists, use it immediately
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
        setLoading(false);
      }

      return () => subscription.unsubscribe();
    })();
  }, []);

  if (loading) return <p className="p-6">Loading…</p>;
  if (!session) return (
    <p className="p-6">No active session. Please click the link in your invite email again.</p>
  );

  const save = async () => {
    if (!pw) return alert('Enter a password');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return alert(error.message);
    setDone(true);
  };

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Password set!</h1>
      <Link href="/" className="text-blue-600 underline">Go to app</Link>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Set your password</h1>
      <input
        type="password"
        placeholder="New password"
        value={pw}
        onChange={e => setPw(e.target.value)}
        className="border p-2 rounded"
      />
      <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
    </div>
  );
} 