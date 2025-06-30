import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../core/supabase';

export default function EnterInviteCodeScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (code.trim().length < 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit code.');
      return;
    }

    Alert.alert(
      'Warning',
      'Joining an owner account will delete your current personal data and convert your login to a member. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Starting accept invite process with code:', code.trim());
              setLoading(true);
              const uid = (await supabase.auth.getUser()).data.user?.id;
              console.log('User ID:', uid);
              if (!uid) throw new Error('Not signed in');

              console.log('Calling accept-invite function...');
              const { error } = await supabase.functions.invoke('accept-invite', {
                body: { uid, code: code.trim() },
              });
              console.log('Function call result - error:', error);
              if (error) throw error;

              Alert.alert('Success', 'You are now a member of the owner account. Please log in again.');
              await supabase.auth.signOut();
              router.replace('/login');
            } catch (err: any) {
              console.error('Join owner error', err);
              Alert.alert('Error', err.message || 'Failed to join owner account.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Owner Account</Text>
      <TextInput
        style={styles.input}
        placeholder="6-digit code"
        value={code}
        onChangeText={setCode}
        keyboardType="numeric"
        maxLength={6}
        autoFocus
      />
      <Button title={loading ? 'Submitting...' : 'Submit'} onPress={handleSubmit} disabled={loading} />
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