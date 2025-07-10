import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../core/supabase';

export default function SetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any | null>(null);
  const [isSignupFlow, setIsSignupFlow] = useState(false);
  const [isPasswordResetFlow, setIsPasswordResetFlow] = useState(false);

  useEffect(() => {
    console.log('🔐 SetPassword: Component mounted');
    
    const handleTokenVerification = async () => {
      // Check if we're in a web environment and have URL parameters
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('token');
        const type = url.searchParams.get('type');

        console.log('🔐 SetPassword: URL params:', { token: !!token, type });

        if (token && type) {
          try {
            // For password reset, type should be 'recovery'
            if (type === 'recovery') {
              console.log('🔐 SetPassword: Detected password reset flow');
              setIsPasswordResetFlow(true);
            } else if (type === 'signup') {
              console.log('🔐 SetPassword: Detected signup flow');
              setIsSignupFlow(true);
            }

            // For recovery tokens, we don't need to manually verify - 
            // Supabase will handle this when we exchange the code for session
            console.log('🔐 SetPassword: Token found, will be handled by session exchange');

            // Clean up URL parameters
            url.searchParams.delete('token');
            url.searchParams.delete('type');
            window.history.replaceState({}, '', url.pathname);
          } catch (err) {
            console.error('🔐 SetPassword: Token verification error', err);
          }
        }
      }

      // Handle hash-based tokens (legacy format)
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
          // Clean the URL
          window.history.replaceState({}, '', window.location.pathname);
        }
      }

      // Exchange any PKCE code in the URL
      try {
        if (typeof window !== 'undefined') {
          await supabase.auth.exchangeCodeForSession(window.location.href);
        }
      } catch {
        /* noop */
      }
    };

    handleTokenVerification();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('🔐 SetPassword: Auth state change:', { 
        event: _event, 
        hasSession: !!newSession, 
        hadSessionBefore: !!session,
        isPasswordReset: isPasswordResetFlow,
        isSignup: isSignupFlow
      });
      
      // Only detect signup flow if we haven't already determined the flow type
      if (!session && newSession && !isPasswordResetFlow && !isSignupFlow) {
        console.log('🔐 SetPassword: Detected signup flow (fallback)');
        setIsSignupFlow(true);
      }
      
      setSession(newSession);
      setLoading(false);
    });

    // Fallback for an already active session
    supabase.auth.getSession().then(({ data }) => {
      console.log('🔐 SetPassword: Initial session check:', { hasSession: !!data.session });
      if (data.session) {
        setSession(data.session);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSetPassword = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('Success', 'Password updated successfully! You can now log in with your new password.');
      router.replace('/login');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // If this was a signup verification, the user doesn't need to set a password yet
  if (isSignupFlow && !isPasswordResetFlow) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Thank you!</Text>
        <Text>Your account has been verified.</Text>
        <View style={{ height: 16 }} />
        <Button title="Go to Login" onPress={() => router.replace('/login')} />
      </View>
    );
  }

  // If the user has a session (from password reset or magic link), let them set password
  if (session) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>
          {isPasswordResetFlow ? 'Reset Your Password' : 'Set Your Password'}
        </Text>
        <Text style={styles.subtitle}>
          {isPasswordResetFlow 
            ? 'Please enter your new password below:'
            : 'Please set a password for your account:'
          }
        </Text>
        <TextInput
          style={styles.input}
          placeholder="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Button 
          title={isPasswordResetFlow ? "Reset Password" : "Save Password"} 
          onPress={handleSetPassword} 
          disabled={loading} 
        />
      </View>
    );
  }

  // If there's no session, the token was invalid or expired
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invalid or Expired Link</Text>
      <Text>Your password reset link may have expired or is invalid. Please request a new password reset email.</Text>
      <View style={{ height: 16 }} />
      <Button title="Go to Login" onPress={() => router.replace('/login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  subtitle: { fontSize: 16, marginBottom: 24, textAlign: 'center', color: '#666' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
}); 