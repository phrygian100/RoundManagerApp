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
    
    // Log the current URL for debugging
    if (typeof window !== 'undefined') {
      console.log('🔐 SetPassword: Current URL:', window.location.href);
      console.log('🔐 SetPassword: Search params:', window.location.search);
      console.log('🔐 SetPassword: Hash:', window.location.hash);
    }
    
    const handleTokenVerification = async () => {
      let detectedPasswordReset = false;
      let detectedSignup = false;
      
      // Check if we're in a web environment and have URL parameters
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('token');
        const type = url.searchParams.get('type');

        console.log('🔐 SetPassword (RN): URL params:', { token: !!token, type, fullUrl: url.href });

        if (token && type) {
          try {
            // For password reset, type should be 'recovery'
            if (type === 'recovery') {
              console.log('🔐 SetPassword (RN): Detected password reset flow');
              setIsPasswordResetFlow(true);
              detectedPasswordReset = true;
            } else if (type === 'signup') {
              console.log('🔐 SetPassword (RN): Detected signup flow');
              setIsSignupFlow(true);
              detectedSignup = true;
            } else {
              console.log('🔐 SetPassword (RN): Unknown type:', type);
            }

            // For recovery tokens, try to exchange the code first
            console.log('🔐 SetPassword (RN): Attempting token exchange...');
            
            try {
              await supabase.auth.exchangeCodeForSession(window.location.href);
              console.log('🔐 SetPassword (RN): Token exchange completed');
            } catch (exchangeError) {
              console.error('🔐 SetPassword (RN): Token exchange failed:', exchangeError);
            }
            
            // For password reset flow, clear existing session AFTER trying token exchange
            if (type === 'recovery') {
              console.log('🔐 SetPassword (RN): Clearing existing session for password reset');
              // We'll let the auth state change handler deal with the new session
            }

            // Clean up URL parameters
            url.searchParams.delete('token');
            url.searchParams.delete('type');
            window.history.replaceState({}, '', url.pathname);
          } catch (err) {
            console.error('🔐 SetPassword (RN): Token verification error', err);
          }
        } else {
          console.log('🔐 SetPassword (RN): No URL token/type found');
        }
      }

      // Handle hash-based tokens (legacy format and password reset)
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        
        console.log('🔐 SetPassword (RN): Hash params:', { hasAccess: !!access_token, hasRefresh: !!refresh_token, type, fullHash: window.location.hash });
        
        if (type === 'recovery') {
          console.log('🔐 SetPassword (RN): Detected password reset flow from hash');
          setIsPasswordResetFlow(true);
          detectedPasswordReset = true;
        } else if (type) {
          console.log('🔐 SetPassword (RN): Hash type found but not recovery:', type);
        }
        
        if (access_token && refresh_token) {
          console.log('🔐 SetPassword (RN): Setting session from hash tokens');
          try {
            await supabase.auth.setSession({ access_token, refresh_token });
            console.log('🔐 SetPassword (RN): Hash session set successfully');
          } catch (hashError) {
            console.error('🔐 SetPassword (RN): Hash session failed:', hashError);
          }
          // Clean the URL
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else if (typeof window !== 'undefined' && window.location.hash) {
        console.log('🔐 SetPassword (RN): Hash exists but no access_token:', window.location.hash);
      }

      // Token exchange is now handled above for URL parameters
      console.log('🔐 SetPassword (RN): Token processing completed');
      
      console.log('🔐 SetPassword: Flow detection result:', { detectedPasswordReset, detectedSignup });
      return { detectedPasswordReset, detectedSignup };
    };

    const setupAuthListener = async () => {
      const flowDetection = await handleTokenVerification();
      
      // Listen for auth state changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        console.log('🔐 SetPassword: Auth state change:', { 
          event: _event, 
          hasSession: !!newSession, 
          hadSessionBefore: !!session,
          isPasswordReset: isPasswordResetFlow,
          isSignup: isSignupFlow,
          detectedPasswordReset: flowDetection.detectedPasswordReset,
          detectedSignup: flowDetection.detectedSignup
        });
        
        // Only detect signup flow if we haven't already determined the flow type from URL/hash
        if (!session && newSession && !flowDetection.detectedPasswordReset && !flowDetection.detectedSignup && !isPasswordResetFlow && !isSignupFlow) {
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
    };
    
    setupAuthListener().then(cleanup => {
      return cleanup;
    });
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

  // If the user has a session, check what type of flow this is
  if (session) {
    // For password reset flow, show the reset form
    if (isPasswordResetFlow) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Reset Your Password</Text>
          <Text style={styles.subtitle}>Please enter your new password below:</Text>
          <TextInput
            style={styles.input}
            placeholder="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Button 
            title="Reset Password" 
            onPress={handleSetPassword} 
            disabled={loading} 
          />
        </View>
      );
    }
    
    // For signup verification, show thank you message
    if (isSignupFlow) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Thank you!</Text>
          <Text>Your account has been verified.</Text>
          <View style={{ height: 16 }} />
          <Button title="Go to Login" onPress={() => router.replace('/login')} />
        </View>
      );
    }
    
    // Default case - unknown flow with session, show password set form
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Set Your Password</Text>
        <Text style={styles.subtitle}>Please set a password for your account:</Text>
        <TextInput
          style={styles.input}
          placeholder="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Button 
          title="Save Password" 
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
      <Text style={styles.subtitle}>
        Your password reset link may have expired or is invalid. 
        {'\n\n'}
        Password reset links are only valid for 1 hour after being sent.
      </Text>
      <View style={{ height: 16 }} />
      <Button title="Request New Reset Link" onPress={() => router.replace('/forgot-password')} />
      <View style={{ height: 8 }} />
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