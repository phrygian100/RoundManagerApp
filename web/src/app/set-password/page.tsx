'use client';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function SetPassword() {
  const [pw, setPw] = useState('');
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [isSignupFlow, setIsSignupFlow] = useState(false);
  const [isPasswordResetFlow, setIsPasswordResetFlow] = useState(false);

  useEffect(() => {
    (async () => {
      console.log('🔐 SetPassword (Web): Component mounted');
      
      // 1) Handle tokens that Supabase appends as query params
      const url = new URL(window.location.href);
      const token = url.searchParams.get('token');
      const type = url.searchParams.get('type');

      console.log('🔐 SetPassword (Web): URL params:', { token: !!token, type });

      if (token && type) {
        try {
          // Determine the flow type first
          if (type === 'recovery') {
            console.log('🔐 SetPassword (Web): Detected password reset flow');
            setIsPasswordResetFlow(true);
            
            // CRITICAL: Clear any existing session before processing password reset
            console.log('🔐 SetPassword (Web): Clearing existing session for password reset');
            await supabase.auth.signOut();
          } else if (type === 'signup') {
            console.log('🔐 SetPassword (Web): Detected signup flow');
            setIsSignupFlow(true);
          }

          // For password reset tokens, let Supabase handle the session exchange automatically
          // For other types, use verifyOtp
          if (type !== 'recovery') {
            // @ts-expect-error – email not required for invite token types
            const { error } = await supabase.auth.verifyOtp({
              token,
              type: type as any,
            });
            if (error) {
              console.error('🔐 SetPassword (Web): verifyOtp failed', error.message);
            } else {
              console.log('🔐 SetPassword (Web): Token verified successfully');
            }
          } else {
            console.log('🔐 SetPassword (Web): Recovery token will be handled by session exchange');
          }
        } catch (err) {
          console.error('🔐 SetPassword (Web): Token verification error', err);
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
        console.log('🔐 SetPassword (Web): Auth state change:', { 
          event: _event, 
          hasSession: !!newSession,
          isPasswordReset: isPasswordResetFlow,
          isSignup: isSignupFlow
        });
        setSession(newSession);
        setLoading(false);
      });

      // 5) Fallback: if a session already exists, use it immediately
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        console.log('🔐 SetPassword (Web): Found existing session');
        setSession(data.session);
        setLoading(false);
      }

      return () => subscription.unsubscribe();
    })();
  }, []);

  if (loading) return <p className="p-6">Loading…</p>;

  // If this was a signup verification, just show success message
  if (isSignupFlow && !isPasswordResetFlow) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Email has been verified</h1>
        <p>You can now log in.</p>
        <Link href="/login" className="text-blue-600 underline">Go to Login</Link>
      </div>
    );
  }

  // If no session, the token was invalid or expired
  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Invalid or Expired Link</h1>
        <p>Your password reset link may have expired or is invalid. Please request a new password reset email.</p>
        <Link href="/forgot-password" className="text-blue-600 underline">Request New Reset Link</Link>
      </div>
    );
  }

  const save = async () => {
    if (!pw) return alert('Enter a password');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return alert(error.message);
    setDone(true);
  };

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Password {isPasswordResetFlow ? 'Reset' : 'Set'} Successfully!</h1>
      <p>You can now log in with your new password.</p>
      <Link href="/login" className="text-blue-600 underline">Go to Login</Link>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">
        {isPasswordResetFlow ? 'Reset Your Password' : 'Set Your Password'}
      </h1>
      <p className="text-gray-600">
        {isPasswordResetFlow 
          ? 'Please enter your new password below:'
          : 'Please set a password for your account:'
        }
      </p>
      <input
        type="password"
        placeholder="New password"
        value={pw}
        onChange={e => setPw(e.target.value)}
        className="border p-2 rounded w-64"
      />
      <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded">
        {isPasswordResetFlow ? 'Reset Password' : 'Save Password'}
      </button>
    </div>
  );
} 