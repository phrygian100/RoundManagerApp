// Password reset via Supabase removed. TODO: Implement Firebase password reset flow here.

import { useRouter } from 'expo-router';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

export default function SetPasswordScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Password Reset</Text>
      <Text style={styles.subtitle}>Password reset via Supabase has been removed. Please implement Firebase password reset here.</Text>
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