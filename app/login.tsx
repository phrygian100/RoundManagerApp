import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import { Alert, Button, Image, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth } from '../core/firebase';

// Get build ID from environment or fallback to version
const BUILD_ID = '65b5c35';

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
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        const msg = 'Please verify your email before logging in.';
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Email not verified', msg);
        }
        await auth.signOut();
        return;
      }

      // Set custom claims
      const functions = getFunctions();
      const refreshClaims = httpsCallable(functions, 'refreshClaims');
      const result = await refreshClaims();

      console.log('Claims refresh result:', result.data);

      const refreshResult = result.data as { success: boolean; message?: string };
      if (!refreshResult.success) {
        const msg = `Could not prepare your account. Please contact support. (${
          refreshResult.message || 'No details'
        })`;
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Login Error', msg);
        }
        await auth.signOut();
        return;
      }

      // Force a token refresh to get the new claims
      await user.getIdToken(true);

      // Navigate to home screen on success
      router.replace('/');

    } catch (error: any) {
      console.error('Login error', error);
      const errMsg = error?.code || error?.message || '';
      // Use window.alert for web compatibility
      const showAlert = (title: string, msg: string) => {
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert(title, msg);
        }
      };

      if (errMsg === 'auth/invalid-credential' || errMsg.includes('invalid-credential')) {
        showAlert('Error', 'Incorrect email/password');
      } else if (errMsg === 'auth/invalid-email') {
          showAlert('Error', 'Invalid email format');
      } else if (errMsg === 'auth/user-not-found') {
          showAlert('Error', 'Account not found');
      } else if (errMsg === 'auth/wrong-password') {
          showAlert('Error', 'Incorrect email/password');
      } else if (errMsg === 'auth/too-many-requests') {
          showAlert('Error', 'Too many attempts, please try again later.');
        } else {
          showAlert('Error', errMsg);
        }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image 
        source={require('../assets/images/Logo - Service Platform.png')} 
        style={styles.logo}
        resizeMode="contain"
      />
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
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    padding: 24,
    ...Platform.select({
      web: {
        maxWidth: 500,
        alignSelf: 'center',
        width: '100%'
      }
    })
  },
  logo: {
    width: Platform.select({
      web: 500,  // Increased from 400
      default: 250,  // Increased from 200
    }),
    height: Platform.select({
      web: 200,  // Increased from 160
      default: 100,  // Increased from 80
    }),
    alignSelf: 'center',
    marginBottom: 40,
    resizeMode: 'contain',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
    fontSize: Platform.OS === 'web' ? 16 : 14,
  },
  build: { 
    marginTop: 24, 
    fontSize: 12, 
    textAlign: 'center', 
    color: '#666' 
  },
}); 
 