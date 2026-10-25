import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { TextInput as TextInputType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuideHelpButton } from '../../components/GuideHelpButton';
import PermissionGate from '../../components/PermissionGate';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { inviteMember, listMembers, MemberRecord, removeMember, updateMemberDailyRate, updateMemberPerms, updateMemberVehicle } from '../../services/accountService';
import { checkMemberCreationPermission } from '../../services/subscriptionService';
import { addVehicle, deleteVehicle, listVehicles, VehicleRecord } from '../../services/vehicleService';

const PERM_KEYS = [
  { key: 'viewClients', label: 'Clients' },
  { key: 'viewRunsheet', label: 'Runsheets' },
  { key: 'viewRoundOrder', label: 'Round Order' },
  { key: 'viewPayments', label: 'Accounts' },
  { key: 'viewMaterials', label: 'Materials' },
  { key: 'viewTerritory', label: 'Territory' },
  { key: 'viewNewBusiness', label: 'New Business' },
];

const AVATAR_COLOURS = ['#0c1b3c', '#1565c0', '#6a1b9a', '#00695c', '#e65100', '#ad1457'];

/** Two letters from the email, so each person has a stable avatar. */
function initials(email: string): string {
  const local = (email || '?').split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
  return (local.slice(0, 2) || '?').toUpperCase();
}

function avatarColour(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}

/** Owner first, then active members, then outstanding invites. */
function memberRank(m: MemberRecord): number {
  if (m.role === 'owner') return 0;
  if (m.status === 'invited') return 2;
  return 1;
}

export default function TeamScreen() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [vehicleName, setVehicleName] = useState('');
  const vehicleNameInputRef = useRef<TextInputType>(null);
  const router = useRouter();

  // If this account already has team members, prevent it from joining another team as a member.
  const hasNonOwnerMembers = members.some(m => m.role !== 'owner');

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

  useEffect(() => {
    if (!showVehicleModal) return;
    // Allow the modal to render before focusing (helps on web + native)
    const t = setTimeout(() => vehicleNameInputRef.current?.focus?.(), 50);
    return () => clearTimeout(t);
  }, [showVehicleModal]);

  const handleOpenAddVan = () => {
    setShowVehicleModal(true);
  };

  const handleLinkAccountWithCode = () => {
    if (hasNonOwnerMembers) {
      const msg =
        "This account already has team members. You can't join another team while you have members linked to this account.";
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(msg);
      } else {
        Alert.alert('Not available', msg);
      }
      return;
    }

    const message =
      "This will link your account to another owner using a code. You'll become a team member on their account and lose owner access to this team until you leave that team.";

    const proceed = () => router.push('/enter-invite-code');

    if (typeof window !== 'undefined' && window.confirm) {
      const ok = window.confirm(`Join another team?\n\n${message}`);
      if (ok) proceed();
      return;
    }

    Alert.alert('Join another team?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: proceed },
    ]);
  };

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
    const confirmMsg = `Are you sure you want to ${actionText}?`;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(confirmMsg)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Confirm', confirmMsg, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    
    if (confirmed) {
      try {
        await removeMember(memberId);
        setMembers(prev => prev.filter(m => {
          // For pending invitations, filter by docId; for active members, filter by uid
          return memberStatus === 'invited' ? m.docId !== memberId : m.uid !== memberId;
        }));
      } catch (err) {
        console.error(err);
        const errMsg = 'Error: Could not remove member';
        if (Platform.OS === 'web') {
          window.alert(errMsg);
        } else {
          Alert.alert('Error', errMsg);
        }
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

  const orderedMembers = useMemo(
    () => [...members].sort((a, b) => memberRank(a) - memberRank(b) || a.email.localeCompare(b.email)),
    [members]
  );

  const renderMember = ({ item }: { item: MemberRecord }) => {
    // For pending invitations, use docId (invite code); for active members, use uid
    const memberIdentifier = item.status === 'invited' ? item.docId : item.uid;
    const isOwner = item.role === 'owner';
    const isInvited = item.status === 'invited';
    const roleLabel = isOwner ? 'Owner' : isInvited ? 'Invited' : 'Member';

    return (
      <View style={[styles.card, isOwner && styles.cardOwner, isInvited && styles.cardInvited]}>
        <View style={styles.cardHead}>
          <View style={[styles.avatar, { backgroundColor: avatarColour(item.email || '') }]}>
            <Text style={styles.avatarText}>{initials(item.email || '')}</Text>
          </View>
          <View style={styles.cardHeadText}>
            <Text style={styles.memberEmail} numberOfLines={1}>{item.email}</Text>
            <View style={[styles.rolePill, isOwner && styles.roleOwner, isInvited && styles.roleInvited]}>
              <Text style={[styles.roleText, isOwner && styles.roleTextOnFill, isInvited && styles.roleInvitedText]}>{roleLabel}</Text>
            </View>
          </View>
          {!isOwner && (
            <Pressable
              style={styles.removeBtn}
              onPress={() => { if (memberIdentifier) handleRemove(memberIdentifier, item.status); }}
              accessibilityLabel={isInvited ? 'Cancel invitation' : 'Remove member'}
            >
              <Ionicons name="trash-outline" size={18} color="#c62828" />
            </Pressable>
          )}
        </View>

        {isInvited && (
          <Text style={styles.invitedNote}>Waiting for them to accept the invite.</Text>
        )}

        {item.status === 'active' && (
          <>
            <Text style={styles.fieldLabel}>Van</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, !item.vehicleId && styles.chipOn]}
                onPress={() => handleUpdateVehicle(item.uid, null)}
              >
                <Text style={[styles.chipText, !item.vehicleId && styles.chipTextOn]}>None</Text>
              </Pressable>
              {vehicles.map(v => {
                const on = item.vehicleId === v.id;
                return (
                  <Pressable
                    key={v.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => handleUpdateVehicle(item.uid, v.id)}
                  >
                    <Ionicons name="car-outline" size={14} color={on ? '#fff' : '#475467'} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{v.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Day rate</Text>
            <View style={styles.rateBox}>
              <Text style={styles.ratePrefix}>£</Text>
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
              <Text style={styles.rateSuffix}>per day</Text>
            </View>

            {!isOwner && (
              <>
                <Text style={styles.fieldLabel}>Access</Text>
                <View style={styles.chipRow}>
                  {PERM_KEYS.map(p => {
                    const hasPerm = !!item.perms?.[p.key];
                    return (
                      <Pressable
                        key={p.key}
                        style={[styles.chip, hasPerm && styles.chipOn]}
                        onPress={() => handleToggle(item.uid, p.key, !hasPerm)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: hasPerm }}
                      >
                        <Ionicons
                          name={hasPerm ? 'checkmark' : 'ellipse-outline'}
                          size={13}
                          color={hasPerm ? '#fff' : '#98a2b3'}
                        />
                        <Text style={[styles.chipText, hasPerm && styles.chipTextOn]}>{p.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {isOwner && <Text style={styles.ownerNote}>Full access to everything.</Text>}
          </>
        )}
      </View>
    );
  };

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pagePadding = width < 600 ? 16 : 24;

  return (
    <PermissionGate perm="isOwner" fallback={<ThemedText>No access</ThemedText>}>
      <ThemedView style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'web' ? 16 : 8) }]}>
        <View style={[styles.page, { paddingHorizontal: pagePadding }]}>
          <View style={styles.header}>
            <Pressable
              style={styles.backButton}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityLabel="Back"
            >
              <Ionicons name="arrow-back" size={20} color="#0c1b3c" />
            </Pressable>
            <View style={styles.headerText}>
              <ThemedText type="title" style={styles.title}>Team</ThemedText>
              <Text style={styles.subtitle}>
                {members.length} {members.length === 1 ? 'person' : 'people'}
                {' · '}
                {vehicles.length} {vehicles.length === 1 ? 'van' : 'vans'}
              </Text>
            </View>
            <GuideHelpButton slug="memberaccounts" color="#1976d2" />
            <Pressable style={styles.vansButton} onPress={handleOpenAddVan} accessibilityLabel="Manage vans">
              <Ionicons name="car-outline" size={16} color="#0c1b3c" />
              <Text style={styles.vansButtonText}>Vans</Text>
            </Pressable>
          </View>

          {!hasNonOwnerMembers && (
            <View style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <Ionicons name="link-outline" size={18} color="#0c1b3c" />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoTitle}>Have a team code?</Text>
                <Text style={styles.infoSubtitle}>
                  Link this account to another owner. You’ll become a team member on their account.
                </Text>
              </View>
              <Pressable style={styles.infoButton} onPress={handleLinkAccountWithCode}>
                <Text style={styles.infoButtonText}>Enter code</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>Invite someone</Text>
            <View style={styles.inviteRow}>
              <TextInput
                placeholder="email@example.com"
                placeholderTextColor="#98a2b3"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.inviteButton, (loading || !email.trim()) && styles.buttonDisabled]}
                onPress={handleInvite}
                disabled={loading || !email.trim()}
              >
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={styles.inviteButtonText}>{loading ? 'Sending…' : 'Invite'}</Text>
              </Pressable>
              <Pressable style={styles.refreshButton} onPress={loadMembers} accessibilityLabel="Refresh">
                <Ionicons name="refresh" size={18} color="#0c1b3c" />
              </Pressable>
            </View>
          </View>

          <FlatList
            data={orderedMembers}
            keyExtractor={m => `${m.status}-${m.docId || m.uid}`}
            renderItem={renderMember}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          />
        </View>

        <Modal visible={showVehicleModal} animationType="fade" transparent onRequestClose={() => setShowVehicleModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Vans</Text>
                <Pressable onPress={() => setShowVehicleModal(false)} style={styles.closeButton} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color="#475467" />
                </Pressable>
              </View>
              <ScrollView style={styles.vehicleList}>
                {vehicles.length === 0 && (
                  <Text style={styles.emptyVans}>No vans yet. Add one below, then assign it on a person’s card.</Text>
                )}
                {vehicles.map(v => (
                  <View key={v.id} style={styles.vehicleRow}>
                    <View style={styles.vehicleIcon}>
                      <Ionicons name="car-outline" size={16} color="#0c1b3c" />
                    </View>
                    <Text style={styles.vehicleName}>{v.name}</Text>
                    <Pressable
                      onPress={async () => {
                        await deleteVehicle(v.id);
                        loadVehicles();
                      }}
                      hitSlop={8}
                      accessibilityLabel={`Delete ${v.name}`}
                    >
                      <Text style={styles.vehicleDelete}>Delete</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
              <TextInput
                ref={vehicleNameInputRef}
                placeholder="Registration or name"
                placeholderTextColor="#98a2b3"
                value={vehicleName}
                onChangeText={setVehicleName}
                style={styles.modalInput}
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancel} onPress={() => setShowVehicleModal(false)}>
                  <Text style={styles.modalCancelText}>Close</Text>
                </Pressable>
                <Pressable
                  style={[styles.inviteButton, !vehicleName.trim() && styles.buttonDisabled]}
                  disabled={!vehicleName.trim()}
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
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.inviteButtonText}>Add van</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ThemedView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  page: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backButton: {
    flexShrink: 0,
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e6e8ee', alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { fontSize: 26, lineHeight: 30 },
  subtitle: { fontSize: 13, color: '#667085', marginTop: 2 },
  vansButton: {
    flexShrink: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e6e8ee',
    paddingHorizontal: 12, height: 40, borderRadius: 20,
  },
  vansButtonText: { color: '#0c1b3c', fontWeight: '700', fontSize: 14 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#e6e8ee',
  },
  infoIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2f6',
    alignItems: 'center', justifyContent: 'center',
  },
  infoBody: { flex: 1, minWidth: 180 },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#101828' },
  infoSubtitle: { fontSize: 13, color: '#667085', marginTop: 2 },
  infoButton: { backgroundColor: '#0c1b3c', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  infoButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  inviteCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#e6e8ee',
  },
  inviteTitle: { fontSize: 13, fontWeight: '700', color: '#667085', marginBottom: 8 },
  inviteRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  input: {
    flexGrow: 1, flexBasis: 220, minWidth: 180,
    borderWidth: 1, borderColor: '#d0d5dd', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 15, color: '#101828',
  },
  inviteButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1565c0', paddingHorizontal: 14, height: 42, borderRadius: 10,
  },
  inviteButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  buttonDisabled: { opacity: 0.45 },
  refreshButton: {
    width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#d0d5dd',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  list: { flex: 1 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#e6e8ee', borderLeftWidth: 4, borderLeftColor: '#1565c0',
  },
  cardOwner: { borderLeftColor: '#0c1b3c' },
  cardInvited: { borderLeftColor: '#f9a825' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardHeadText: { flex: 1, gap: 4 },
  memberEmail: { fontSize: 16, fontWeight: '700', color: '#101828' },
  rolePill: {
    alignSelf: 'flex-start', backgroundColor: '#e8f1fb',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  roleOwner: { backgroundColor: '#0c1b3c' },
  roleInvited: { backgroundColor: '#f9a825' },
  roleText: { fontSize: 11, fontWeight: '700', color: '#1565c0' },
  roleTextOnFill: { color: '#fff' },
  roleInvitedText: { color: '#5d4037' },
  removeBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fdecea',
  },
  invitedNote: { marginTop: 12, fontSize: 13, color: '#667085' },
  fieldLabel: {
    marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: '700',
    color: '#667085', textTransform: 'uppercase', letterSpacing: 0.4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0d5dd',
  },
  chipOn: { backgroundColor: '#0c1b3c', borderColor: '#0c1b3c' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#344054' },
  chipTextOn: { color: '#fff' },
  rateBox: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 10, paddingHorizontal: 12, height: 42,
    backgroundColor: '#fff',
  },
  ratePrefix: { fontSize: 15, fontWeight: '700', color: '#667085' },
  rateInput: { width: 72, fontSize: 15, color: '#101828', padding: 0 },
  rateSuffix: { fontSize: 13, color: '#98a2b3' },
  ownerNote: { marginTop: 12, fontSize: 13, color: '#667085' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(16,24,40,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, width: '100%', maxWidth: 440,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#101828' },
  closeButton: { padding: 4 },
  vehicleList: { maxHeight: 260 },
  emptyVans: { fontSize: 13, color: '#667085', paddingVertical: 12 },
  vehicleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f2f4f7',
  },
  vehicleIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#eef2f6',
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#101828' },
  vehicleDelete: { color: '#c62828', fontWeight: '600', fontSize: 13 },
  modalInput: {
    borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#101828', marginTop: 12,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  modalCancel: {
    paddingHorizontal: 14, height: 42, borderRadius: 10, backgroundColor: '#f2f4f7',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { color: '#344054', fontWeight: '700', fontSize: 14 },
}); 