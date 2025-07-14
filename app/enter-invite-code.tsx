// Invite code via Supabase removed. TODO: Implement Firebase invite code flow here.

import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { db } from '../core/firebase';

export default function EnterInviteCodeScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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
      // Search all accounts for a member with this invite code and status 'invited'
      // (In production, you may want to index invites for faster lookup)
      const accountsCol = collection(db, 'accounts');
      // For simplicity, scan all accounts (could be optimized with a cloud function or index)
      const accountsSnap = await getDocs(accountsCol);
      let found = false;
      for (const accountDoc of accountsSnap.docs) {
        const membersCol = collection(db, `accounts/${accountDoc.id}/members`);
        const memberDocRef = doc(membersCol, inviteCode);
        const memberDocSnap = await getDoc(memberDocRef);
        if (memberDocSnap.exists()) {
          const memberData = memberDocSnap.data();
          if (memberData.status === 'invited' && memberData.inviteCode === inviteCode) {
            // Update the member record to associate with this user
            await setDoc(doc(membersCol, user.uid), {
              ...memberData,
              uid: user.uid,
              email: user.email,
              status: 'active',
              inviteCode: null,
              joinedAt: new Date().toISOString(),
            });
            // Optionally, delete the invite code doc
            await updateDoc(memberDocRef, { status: 'used' });
            setMessage('Invite accepted! You are now a team member.');
            found = true;
            break;
          }
        }
      }
      if (!found) {
        setMessage('Invalid or expired invite code.');
      }
    } catch (err) {
      setMessage('Error accepting invite. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Owner Account</Text>
      <Text style={styles.subtitle}>Enter your invite code below to join a team.</Text>
      <TextInput
        style={styles.input}
        placeholder="Invite Code"
        value={inviteCode}
        onChangeText={setInviteCode}
        autoCapitalize="none"
        editable={!loading}
      />
      <Button title={loading ? 'Joining...' : 'Join Team'} onPress={handleAcceptInvite} disabled={loading || !inviteCode.trim()} />
      {message ? <Text style={{ marginTop: 16, color: message.includes('success') ? 'green' : 'red' }}>{message}</Text> : null}
      <View style={{ height: 16 }} />
      <Button title="Go to Login" onPress={() => router.replace('/login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  subtitle: { fontSize: 16, marginBottom: 16, textAlign: 'center' },
  input: { width: 220, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 16 },
}); 