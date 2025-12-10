import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import PermissionGate from '../../components/PermissionGate';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { inviteMember, listMembers, MemberRecord, removeMember, updateMemberDailyRate, updateMemberPerms, updateMemberVehicle } from '../../services/accountService';
import { checkMemberCreationPermission } from '../../services/subscriptionService';
import { addVehicle, deleteVehicle, listVehicles, VehicleRecord } from '../../services/vehicleService';

const PERM_KEYS = [
  { key: 'viewClients', label: 'Clients' },
  { key: 'viewRunsheet', label: 'Runsheets' },
  { key: 'viewPayments', label: 'Accounts' },
  { key: 'viewMaterials', label: 'Materials' },
  { key: 'viewNewBusiness', label: 'New Business' },
];

export default function TeamScreen() {
  const [vehicleRate, setVehicleRate] = useState('');
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
    if (loading) return; // Prevent double-tap
    
    // Check member creation permissions before proceeding
    try {
      const permissionCheck = await checkMemberCreationPermission();
      if (!permissionCheck.canCreate) {
        const errorMessage = permissionCheck.reason || 'Unable to create team members';
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(errorMessage);
        } else {
          Alert.alert('Permission Required', errorMessage);
        }
        return;
      }
    } catch (error) {
      console.error('Error checking member creation permission:', error);
      const errorMessage = 'Unable to verify subscription status. Please try again.';
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
      return;
    }
    
    setLoading(true);
    try {
      console.log('Starting invitation for:', email.trim());
      await inviteMember(email.trim());
      setEmail('');
      console.log('Invitation successful, refreshing member list...');
      await loadMembers(); // Wait for reload
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Invite sent successfully');
      } else {
        Alert.alert('Success', 'Invite sent successfully');
      }
    } catch (err: any) {
      console.error('Invitation failed:', err);
      const errorMessage = `Error: Could not invite member - ${err.message || 'Unknown error'} ${err.code ? `(${err.code})` : ''}`;
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (memberId: string, memberStatus: string) => {
    const actionText = memberStatus === 'invited' ? 'cancel this invitation' : 'remove this member';
    const confirmed = window.confirm(`Are you sure you want to ${actionText}?`);
    
    if (confirmed) {
      try {
        await removeMember(memberId);
        setMembers(prev => prev.filter(m => {
          // For pending invitations, filter by docId; for active members, filter by uid
          return memberStatus === 'invited' ? m.docId !== memberId : m.uid !== memberId;
        }));
      } catch (err) {
        console.error(err);
        window.alert('Error: Could not remove member');
      }
    }
  };

  const handleUpdateVehicle = async (uid: string, vehicleId: string | null) => {
    try {
      await updateMemberVehicle(uid, vehicleId);
      setMembers(prev => prev.map(m => m.uid === uid ? { ...m, vehicleId } : m));
    } catch (err) {
      console.error('Error updating member vehicle:', err);
    }
  };

  const renderMember = ({ item }: { item: MemberRecord }) => {
    // For pending invitations, use docId (invite code); for active members, use uid
    const memberIdentifier = item.status === 'invited' ? item.docId : item.uid;
    
    return (
      <ThemedView style={styles.card}>
        {item.status === 'invited' && (
          <View style={styles.pendingBadge}>
            <ThemedText style={styles.pendingText}>Pending Invitation</ThemedText>
          </View>
        )}
        
        {item.status === 'active' && (
          <View style={styles.detailRow}>
            <ThemedText style={styles.label}>Vehicle:</ThemedText>
            <Picker
              selectedValue={item.vehicleId || 'none'}
              onValueChange={async (val) => {
                const newVal = val === 'none' ? null : val;
                await handleUpdateVehicle(item.uid, newVal);
              }}
              style={styles.picker}
            >
              <Picker.Item label="None" value="none" />
              {vehicles.map(v => (
                <Picker.Item key={v.id} label={v.name} value={v.id} />
              ))}
            </Picker>
          </View>
        )}
        
        <ThemedText type="subtitle" style={styles.memberEmail}>{item.email}</ThemedText>
        
        {item.status === 'active' && (
          <>
            <View style={styles.detailRow}>
              <ThemedText style={styles.label}>£/day:</ThemedText>
              <TextInput
                style={styles.rateInput}
                keyboardType="numeric"
                value={item.dailyRate != null ? String(item.dailyRate) : ''}
                onChangeText={(val) => {
                  const num = Number(val);
                  setMembers(prev => prev.map(m => m.uid === item.uid ? { ...m, dailyRate: isNaN(num) ? undefined : num } : m));
                }}
                onBlur={async () => {
                  if (item.dailyRate != null) {
                    await updateMemberDailyRate(item.uid, item.dailyRate);
                  }
                }}
              />
            </View>
            
            {item.role !== 'owner' && (
              <View style={styles.detailRow}>
                <ThemedText style={styles.label}>Permissions:</ThemedText>
                <View style={styles.permRow}>
                  {PERM_KEYS.map(p => {
                    const hasPerm = !!item.perms?.[p.key];
                    return (
                      <TouchableOpacity
                        key={p.key}
                        style={[
                          styles.permBadge,
                          hasPerm ? styles.permBadgeActive : styles.permBadgeInactive,
                        ]}
                        onPress={() => handleToggle(item.uid, p.key, !hasPerm)}
                      >
                        <ThemedText style={styles.permText}>{p.label}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}
        
        {item.role !== 'owner' && (
          <TouchableOpacity 
            style={styles.deleteButton} 
            onPress={() => handleRemove(memberIdentifier, item.status)}
          >
            <Text style={styles.deleteButtonText}>
              {item.status === 'invited' ? 'Cancel Invitation' : 'Remove'}
            </Text>
          </TouchableOpacity>
        )}
      </ThemedView>
    );
  };

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

        <FlatList
          data={members}
          keyExtractor={m => m.uid}
          renderItem={renderMember}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
        />

        <Modal visible={showVehicleModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Manage Vehicles</Text>
                <TouchableOpacity onPress={() => setShowVehicleModal(false)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.vehicleList}>
                {vehicles.map(v => (
                  <View key={v.id} style={styles.vehicleRow}>
                    <Text style={styles.vehicleName}>{v.name}</Text>
                    <TouchableOpacity onPress={async () => {
                        await deleteVehicle(v.id);
                        loadVehicles();
                      }} style={styles.deleteButton}>
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <TextInput
                placeholder="Name / Registration"
                value={vehicleName}
                onChangeText={setVehicleName}
                style={styles.input}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setShowVehicleModal(false)}>
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, !(vehicleName) && styles.buttonDisabled]}
                  disabled={!(vehicleName)}
                  onPress={async () => {
                    try {
                      await addVehicle(vehicleName.trim());
                      setVehicleName('');
                      loadVehicles();
                    } catch (err) {
                      console.error('Error adding vehicle:', err);
                    }
                  }}
                >
                  <Text style={styles.buttonText}>Add New</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <TouchableOpacity style={styles.fab} onPress={() => setShowVehicleModal(true)}>
          <Text style={styles.fabIcon}>+</Text>
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
  deleteButton: { marginTop: 8, alignSelf: 'flex-end' },
  deleteButtonText: { color: '#FF3B30' },
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
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 16, elevation: 2 },
  memberEmail: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { width: 80, fontWeight: 'bold' },
  picker: { flex: 1 },
  permRow: { flexDirection: 'row', flexWrap: 'wrap' },
  permBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, marginRight: 8, marginBottom: 4 },
  permBadgeActive: { backgroundColor: '#007AFF' },
  permBadgeInactive: { backgroundColor: '#ccc' },
  permText: { color: '#fff', fontSize: 12 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#007AFF', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabIcon: { color: 'white', fontSize: 32, lineHeight: 32 },
  modalTitle: { fontWeight: 'bold', fontSize: 18 },
  vehicleList: { maxHeight: 200 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  vehicleName: { flex: 1 },
  rateInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8, marginRight: 8, borderRadius: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  cancelButton: { backgroundColor: '#ccc', marginLeft: 8 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#000',
  },
  pendingBadge: {
    backgroundColor: '#FFD700', // Gold color for pending
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  pendingText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
}); 