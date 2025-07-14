// Invite code via Supabase removed. TODO: Implement Firebase invite code flow here.

import { useRouter } from 'expo-router';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

export default function EnterInviteCodeScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Owner Account</Text>
      <Text style={styles.subtitle}>Invite code flow via Supabase has been removed. Please implement Firebase invite code flow here.</Text>
      <View style={{ height: 16 }} />
      <Button title="Go to Login" onPress={() => router.replace('/login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  subtitle: { fontSize: 16, marginBottom: 16, textAlign: 'center' },
}); 