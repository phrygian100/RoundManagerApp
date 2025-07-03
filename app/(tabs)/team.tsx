import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import PermissionGate from '../../components/PermissionGate';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { inviteMember, listMembers, MemberRecord, removeMember, updateMemberDailyRate, updateMemberPerms, updateMemberVehicle } from '../../services/accountService';
import { addVehicle, listVehicles, VehicleRecord } from '../../services/vehicleService';

const PERM_KEYS = [
  { key: 'viewClients', label: 'Clients' },
  { key: 'viewRunsheet', label: 'Runsheets' },
  { key: 'viewPayments', label: 'Accounts' },
];

export default function TeamScreen() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [vehicleName, setVehicleName] = useState('');
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

  const loadVehicles = async () => {
    try {
      const data = await listVehicles();
      setVehicles(data);
    } catch (err) {
      console.error('Error loading vehicles:', err);
    }
  };

  useEffect(() => {
    loadMembers();
    loadVehicles();
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
      <View style={{ width: 120 }}>
        <Picker
          selectedValue={item.vehicleId || 'none'}
          onValueChange={async (val) => {
            const newVal = val === 'none' ? null : val;
            await updateMemberVehicle(item.uid, newVal);
            setMembers(prev => prev.map(m => (m.uid === item.uid ? { ...m, vehicleId: newVal } : m)));
          }}
        >
          <Picker.Item label="None" value="none" />
          {vehicles.map(v => (
            <Picker.Item key={v.id} label={v.name} value={v.id} />
          ))}
        </Picker>
      </View>
      <TextInput
        style={[styles.rateInput]}
        keyboardType="numeric"
        placeholder="£/day"
        value={String(item.dailyRate ?? '')}
        onChangeText={(val) => {
          const num = Number(val);
          setMembers(prev => prev.map(m => (m.uid === item.uid ? { ...m, dailyRate: isNaN(num) ? undefined : num } : m)));
        }}
        onBlur={async () => {
          const num = Number(item.dailyRate);
          if (!isNaN(num)) {
            await updateMemberDailyRate(item.uid, num);
          }
        }}
      />
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
          <Text style={[styles.headerPerm, { width: 120 }]}>Vehicle</Text>
          <Text style={[styles.headerPerm, { width: 80 }]}>£/day</Text>
        </View>
        {vehicles.length > 0 && (
          <View style={{ marginVertical: 16 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Vehicles</Text>
            {vehicles.map(v => (
              <Text key={v.id}>{v.name}</Text>
            ))}
          </View>
        )}
        <FlatList
          data={members}
          keyExtractor={m => m.uid}
          renderItem={renderMember}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
        <Modal visible={showVehicleModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Add Vehicle</Text>
              <TextInput
                placeholder="Name / Registration"
                value={vehicleName}
                onChangeText={setVehicleName}
                style={styles.input}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={[styles.button, { marginRight: 8 }]} onPress={() => setShowVehicleModal(false)}>
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, !(vehicleName) && styles.buttonDisabled]}
                  disabled={!(vehicleName)}
                  onPress={async () => {
                    try {
                      await addVehicle(vehicleName.trim(), 0);
                      setVehicleName('');
                      setShowVehicleModal(false);
                      loadVehicles();
                    } catch (err) {
                      console.error('Error adding vehicle:', err);
                      window.alert('Error adding vehicle');
                    }
                  }}
                >
                  <Text style={styles.buttonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={() => setShowVehicleModal(true)}>
          <Text style={styles.buttonText}>Add Vehicle</Text>
        </TouchableOpacity>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    width: '100%',
  },
  rateInput: { borderWidth: 1, borderColor: '#ccc', padding: 4, width: 80, textAlign: 'center', borderRadius: 6 },
}); 