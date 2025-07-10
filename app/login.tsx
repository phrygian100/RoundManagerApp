import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../core/supabase';

// Get build ID from environment or fallback to version
const BUILD_ID = 
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.EXPO_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  Constants.expoConfig?.version ||
  'dev';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const errMsg = error.message || '';
        // Use window.alert for web compatibility
        const showAlert = (title: string, msg: string) => {
          if (typeof window !== 'undefined') {
            window.alert(msg);
          } else {
            Alert.alert(title, msg);
          }
        };

        if (errMsg.includes('Invalid login credentials')) {
          showAlert('Error', 'Incorrect email/password');
        } else if (errMsg.includes('Email not confirmed')) {
          showAlert('Error', 'Check your emails');
        } else {
          showAlert('Error', errMsg);
        }
        setLoading(false);
        return;
      }
      // Navigate to home screen or wherever appropriate
      router.replace('/');
    } catch (error: any) {
      console.error('Login error', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title={loading ? 'Logging in...' : 'Login'} onPress={handleLogin} disabled={loading} />
      <View style={{ height: 12 }} />
      <Button title="Forgot Password?" onPress={() => router.push('/forgot-password')} />
      <View style={{ height: 12 }} />
      <Button title="Register" onPress={() => router.push('/register')} />
      <Text style={styles.build}>Build: {BUILD_ID}</Text>
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
  build: { marginTop: 24, fontSize: 12, textAlign: 'center', color: '#666' },
}); 