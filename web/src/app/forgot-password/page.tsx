'use client';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!email) {
      alert('Please enter your email address');
      return;
    }
    
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'https://www.guvnor.app/set-password',
      });
      
      if (error) throw error;
      
      setSent(true);
    } catch (err: any) {
      console.error('Reset password error', err);
      alert(err.message || 'Unable to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Email Sent!</h1>
        <p>Password reset email sent. Check your inbox.</p>
        <Link href="/login" className="text-blue-600 underline">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Reset Password</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="border p-2 rounded w-64"
        disabled={loading}
      />
      <button 
        onClick={handleSend}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {loading ? 'Sending...' : 'Send Reset Email'}
      </button>
      <Link href="/login" className="text-blue-600 underline">
        Back to Login
      </Link>
    </div>
  );
} 