import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Button, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../core/supabase';
import { createUserProfile } from '../services/userService';

const roles = ['client', 'provider'] as const;

type Role = typeof roles[number];

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<Role>('provider');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!name || !email || !phone || !password || !confirm) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    try {
      setLoading(true);
      // Sign up and get the newly created user ID directly
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${location.origin}` },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (!uid) {
        throw new Error('Unable to retrieve user ID after registration.');
      }
      // Save profile in Firestore
      await createUserProfile({
        id: uid,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role,
      });

      Alert.alert('Success', 'Account created! Please check your email to verify your account.');
      // Redirect to login screen
      router.replace('/login');
    } catch (error: any) {
      console.error('Registration error', error);
      const message = error.message || 'Registration failed.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
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
        placeholder="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextInput
        style={styles.input}
        placeholder="Re-enter Password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        contextMenuHidden={Platform.OS !== 'web'}
        // Prevent paste / Ctrl+V on web
        {...(Platform.OS === 'web' ? { onPaste: (e: any) => e.preventDefault() } : {})}
      />
      <View style={styles.roleContainer}>
        {roles.map((r) => (
          <Button
            key={r}
            title={r.charAt(0).toUpperCase() + r.slice(1)}
            onPress={() => setRole(r)}
            color={role === r ? '#007AFF' : '#ccc'}
            disabled={r === 'client'}
          />
        ))}
      </View>
      <Button title={loading ? 'Registering...' : 'Register'} onPress={handleRegister} disabled={loading} />
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
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
}); 