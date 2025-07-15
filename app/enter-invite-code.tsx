// Invite code via Supabase removed. TODO: Implement Firebase invite code flow here.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

export default function EnterInviteCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialCode = typeof params.code === 'string' ? params.code : '';
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const auth = getAuth();
  const user = auth.currentUser;

  const handleAcceptInvite = async () => {
    setMessage('');
    setLoading(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        setMessage('You must be logged in to accept an invite.');
        setLoading(false);
        return;
      }

      const functions = getFunctions();
      const acceptTeamInvite = httpsCallable(functions, 'acceptTeamInvite');
      const result = await acceptTeamInvite({ inviteCode });

      const data = result.data as { success: boolean, message: string };

      if (data.success) {
        setMessage(data.message);
        // Redirect to home or team page after success
        setTimeout(() => router.replace('/'), 1500);
      } else {
        setMessage(data.message || 'An unknown error occurred.');
      }
    } catch (err: any) {
      console.error('Accept invite error:', err);
      setMessage(err.message || 'Error accepting invite. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Owner Account</Text>
      <Text style={styles.subtitle}>Enter your invite code below to join a team.</Text>
      {!user && (
        <Text style={{ color: 'red', marginBottom: 16, textAlign: 'center' }}>
          You must be logged in to join a team. If you don't have an account, register first.
        </Text>
      )}
      <TextInput
        style={styles.input}
        placeholder="Invite Code"
        value={inviteCode}
        onChangeText={setInviteCode}
        autoCapitalize="none"
        editable={!loading}
      />
      <Button 
        title={loading ? 'Joining...' : 'Join Team'} 
        onPress={handleAcceptInvite} 
        disabled={loading || !inviteCode.trim() || !user} 
      />
      {message ? <Text style={{ marginTop: 16, color: message.includes('accepted') ? 'green' : 'red' }}>{message}</Text> : null}
      <View style={{ height: 16 }} />
      <Button title="Go to Login" onPress={() => router.replace('/login')} />
      <View style={{ height: 8 }} />
      <Button title="Register" onPress={() => router.replace('/register')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  subtitle: { fontSize: 16, marginBottom: 16, textAlign: 'center' },
  input: { width: 220, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 16 },
}); 
 