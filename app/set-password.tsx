import { useLocalSearchParams, useRouter } from 'expo-router';
import { confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth } from '../core/firebase';

export default function SetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const oobCode = typeof params.oobCode === 'string' ? params.oobCode : '';
  const mode = typeof params.mode === 'string' ? params.mode : '';
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';
  if (!oobCode || mode !== 'resetPassword') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Invalid Link</Text>
        <Text style={styles.subtitle}>This password reset link is invalid or has expired.</Text>
        <Button title="Go to Login" onPress={() => router.replace('/login')} />
      </View>
    );
  }
  const handleSetPassword = async () => {
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const email = await verifyPasswordResetCode(auth, oobCode);
      await confirmPasswordReset(auth, oobCode, password);
      // Auto sign in
      await signInWithEmailAndPassword(auth, email, password);
      if (inviteCode) {
        const functions = getFunctions();
        const acceptTeamInvite = httpsCallable(functions, 'acceptTeamInvite');
        const result = await acceptTeamInvite({ inviteCode });
        const data = result.data as { success: boolean, message: string };
        if (data.success) {
          setMessage('Team joined successfully!');
          setTimeout(() => router.replace('/'), 1500);
        } else {
          setMessage(data.message || 'Error joining team.');
          setTimeout(() => router.replace('/'), 3000);
        }
      } else {
        setMessage('Password set successfully.');
        setTimeout(() => router.replace('/'), 1500);
      }
    } catch (err: any) {
      setMessage(err.message || 'Error setting password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set Password</Text>
      <TextInput
        style={styles.input}
        placeholder="New Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <Button
        title={loading ? 'Setting...' : 'Set Password'}
        onPress={handleSetPassword}
        disabled={loading}
      />
      {message && <Text style={[styles.subtitle, { color: message.includes('Error') ? 'red' : 'green' }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  subtitle: { fontSize: 16, marginBottom: 16, textAlign: 'center' },
  input: { width: '80%', borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 16, borderRadius: 5 },
}); 