import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PermissionGate } from '../../components/PermissionGate';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { inviteMember, listMembers, MemberRecord, removeMember, updateMemberPerms } from '../../services/accountService';

const PERM_KEYS = [
  { key: 'viewRunsheet', label: 'Runsheet' },
  { key: 'viewClients', label: 'Clients' },
  { key: 'viewCompletedJobs', label: 'Completed Jobs' },
  { key: 'viewPayments', label: 'Payments' },
];

export default function TeamScreen() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const loadMembers = async () => {
    try {
      console.log('Loading members...');
      const data = await listMembers();
      console.log('Members loaded from Firestore:', data);
      setMembers(data);
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const handleToggle = async (uid: string, permKey: string, value: boolean) => {
    const member = members.find(m => m.uid === uid);
    if (!member) return;
    const newPerms = { ...member.perms, [permKey]: value };
    setMembers(prev => prev.map(m => (m.uid === uid ? { ...m, perms: newPerms } : m)));
    await updateMemberPerms(uid, newPerms);
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await inviteMember(email.trim());
      setEmail('');
      loadMembers();
      window.alert('Invite sent');
    } catch (err) {
      console.error(err);
      window.alert('Error: Could not invite member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (uid: string) => {
    const confirmed = window.confirm('Are you sure you want to remove this member?');
    
    if (confirmed) {
      try {
        await removeMember(uid);
        setMembers(prev => prev.filter(m => m.uid !== uid));
      } catch (err) {
        console.error(err);
        window.alert('Error: Could not remove member');
      }
    }
  };

  const renderMember = ({ item }: { item: MemberRecord }) => (
    <View style={styles.memberRow}>
      <Text style={styles.email}>{item.email}</Text>
      {PERM_KEYS.map(p => (
        <View key={p.key} style={{ alignItems: 'center' }}>
          <Switch
            value={!!item.perms?.[p.key]}
            onValueChange={val => handleToggle(item.uid, p.key, val)}
          />
        </View>
      ))}
      <TouchableOpacity style={styles.deleteButton} onPress={() => handleRemove(item.uid)}>
        <Text style={styles.deleteButtonText}>🗑</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <PermissionGate perm="isOwner" fallback={<ThemedText>No access</ThemedText>}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Team Members</ThemedText>

        <View style={styles.inviteRow}>
          <TextInput
            placeholder="email@example.com"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleInvite} 
            disabled={loading}
          >
            <Text style={styles.buttonText}>Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshButton} onPress={loadMembers}>
            <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRow}>
          <Text style={[styles.email, { fontWeight: 'bold' }]}>Email</Text>
          {PERM_KEYS.map(p => (
            <Text key={p.key} style={styles.headerPerm}>{p.label}</Text>
          ))}
        </View>
        <FlatList
          data={members}
          keyExtractor={m => m.uid}
          renderItem={renderMember}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </ThemedView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  inviteRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8, marginRight: 8, borderRadius: 6 },
  button: {
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 6,
    marginRight: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  refreshButton: {
    backgroundColor: '#34C759',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 30,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  headerRow: { flexDirection: 'row', marginBottom: 8 },
  headerPerm: { width: 80, fontWeight: 'bold', textAlign: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  email: { flex: 1 },
}); 