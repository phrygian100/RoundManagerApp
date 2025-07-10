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

  useEffect(() => {
    console.log('🔐 SetPassword: Component mounted');
    // This screen handles both magic link logins and email verifications.
    // Supabase puts the token in the URL hash, which the supabase-js client
    // handles automatically. We just need to listen for the session to update.

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('🔐 SetPassword: Auth state change:', { event: _event, hasSession: !!newSession, hadSessionBefore: !!session });
      // The session is established, so the token was valid.
      // If there was no session before, this is a signup verification.
      if (!session && newSession) {
        console.log('🔐 SetPassword: Detected signup flow');
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
      Alert.alert('Success', 'Password updated');
      router.replace('/');
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

  // If this was a signup verification, the user doesn't need to set a password yet,
  // they've already set it. Just show a success message.
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

  // If the user followed a magic link to sign in, they will have a session
  // but might want to set a password for the first time.
  if (session) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Set Your Password</Text>
        <TextInput
          style={styles.input}
          placeholder="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Button title="Save Password" onPress={handleSetPassword} disabled={loading} />
      </View>
    );
  }

  // If there's no session, the token was invalid or expired.
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invalid Link</Text>
      <Text>Your verification link may have expired. Please try logging in again.</Text>
      <View style={{ height: 16 }} />
      <Button title="Go to Login" onPress={() => router.replace('/login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
}); 