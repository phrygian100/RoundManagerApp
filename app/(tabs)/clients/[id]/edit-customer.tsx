import { Ionicons } from '@expo/vector-icons';
import { addWeeks, format, startOfWeek } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../../../../components/ThemedText';
import { db } from '../../../../core/firebase';
import { getDataOwnerId } from '../../../../core/session';
import { formatAuditDescription, logAction } from '../../../../services/auditService';
import { createJobsForClient } from '../../../../services/jobService';

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // Client details state
  const [name, setName] = useState('');
  const [address1, setAddress1] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState(''); // For old address format
  const [accountNumber, setAccountNumber] = useState('');
  const [roundOrderNumber, setRoundOrderNumber] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');

  // Legacy routine state (hidden in UI, kept for backward compatibility if needed)
  const [frequency, setFrequency] = useState('');
  const [nextVisit, setNextVisit] = useState('');
  const [weekOptions, setWeekOptions] = useState<string[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeSection, setActiveSection] = useState<'details'>('details');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    const today = new Date();
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const weeks = Array.from({ length: 12 }, (_, i) =>
      format(addWeeks(startOfThisWeek, i), 'yyyy-MM-dd')
    );
    setWeekOptions(weeks);
  }, []);

  useEffect(() => {
    if (typeof id === 'string') {
      const fetchClient = async () => {
        const docRef = doc(db, 'clients', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          // Set client details
          setName(data.name || '');
          setAddress1(data.address1 || '');
          setTown(data.town || '');
          setPostcode(data.postcode || '');
          setAddress(data.address || '');
          setAccountNumber(data.accountNumber || '');
          setRoundOrderNumber(data.roundOrderNumber ? String(data.roundOrderNumber) : '');
          setMobileNumber(data.mobileNumber || '');
          setEmail(data.email || '');
          
          // Legacy service routine (not shown in UI)
          setFrequency(data.frequency?.toString() || '');
          setNextVisit(data.nextVisit || '');
        }
        setLoading(false);
      };

      fetchClient();
    }
  }, [id]);

  const regenerateJobsForClient = async () => {
    if (typeof id !== 'string') return;
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) throw new Error('Could not determine owner ID');
      const jobsRef = collection(db, 'jobs');
      const futureJobsQuery = query(
        jobsRef, 
        where('clientId', '==', id),
        where('ownerId', '==', ownerId),
        where('status', 'in', ['pending', 'scheduled', 'in_progress'])
      );
      const futureJobsSnapshot = await getDocs(futureJobsQuery);
      const batch = writeBatch(db);
      futureJobsSnapshot.forEach((jobDoc) => batch.delete(jobDoc.ref));
      await batch.commit();
      const jobsCreated = await createJobsForClient(id, 8, false);
      return jobsCreated;
    } catch (error) {
      console.error('Error regenerating jobs:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }

    if (typeof id === 'string') {
      setUpdating(true);
      try {
        const updateData: any = {
          name,
          address1,
          town,
          postcode,
          address: `${address1}, ${town}, ${postcode}`,
          accountNumber,
          roundOrderNumber: Number(roundOrderNumber),
          mobileNumber,
          email,
        };

        // Do not update legacy routine unless both are present
        if (frequency.trim() && nextVisit.trim()) {
          const frequencyNumber = Number(frequency);
          if (isNaN(frequencyNumber) || frequencyNumber <= 0) {
            Alert.alert('Error', 'Frequency must be a positive number.');
            setUpdating(false);
            return;
          }
          updateData.frequency = frequencyNumber;
          updateData.nextVisit = nextVisit;
        }

        await updateDoc(doc(db, 'clients', id), updateData);
        const clientAddress = `${address1}, ${town}, ${postcode}`;
        await logAction(
          'client_edited',
          'client',
          id,
          formatAuditDescription('client_edited', clientAddress)
        );

        if (frequency.trim() && nextVisit.trim()) {
          const jobsCreated = await regenerateJobsForClient();
          Alert.alert('Success', `Customer updated and ${jobsCreated} jobs regenerated!`);
        } else {
          Alert.alert('Success', 'Customer details updated!');
        }
        router.back();
      } catch (error) {
        console.error('Error updating client:', error);
        Alert.alert('Error', 'Failed to update client. Please try again.');
      } finally {
        setUpdating(false);
      }
    }
  };

  const handleClose = () => {
    router.back();
  };

  if (loading) {
    return (
      <Modal visible={true} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.loadingContainer}>
              <ThemedText style={styles.loadingText}>Loading customer details...</ThemedText>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  const displayAddress =
    (address1 && town && postcode)
      ? `${address1}, ${town}, ${postcode}`
      : address || 'Edit Customer';

  return (
    <Modal visible={true} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerContent}>
              <ThemedText style={styles.modalTitle}>Edit Customer</ThemedText>
              <ThemedText style={styles.customerAddress}>{displayAddress}</ThemedText>
            </View>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          {/* Section Tabs */}
          <View style={styles.tabContainer}>
            <Pressable 
              style={[styles.tab, styles.activeTab]} 
              onPress={() => {}}
            >
              <Ionicons 
                name="person-outline" 
                size={18} 
                color={'#fff'} 
                style={styles.tabIcon}
              />
              <ThemedText style={[styles.tabText, styles.activeTabText]}>
                Customer Details
              </ThemedText>
            </Pressable>
          </View>

          {/* Modal Body */}
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              {/* Basic Information */}
              <View style={styles.sectionGroup}>
                <ThemedText style={styles.sectionTitle}>Basic Information</ThemedText>
                
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Customer Name *</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter customer name"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Address Line 1</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={address1}
                    onChangeText={setAddress1}
                    placeholder="Street address"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 2 }]}>
                    <ThemedText style={styles.inputLabel}>Town/City</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={town}
                      onChangeText={setTown}
                      placeholder="Town or city"
                      placeholderTextColor="#999"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <ThemedText style={styles.inputLabel}>Postcode</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={postcode}
                      onChangeText={setPostcode}
                      placeholder="Postcode"
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>

                {address && (
                  <View style={styles.inputGroup}>
                    <ThemedText style={styles.inputLabel}>Legacy Address</ThemedText>
                    <TextInput
                      style={[styles.input, styles.legacyInput]}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Legacy address format"
                      placeholderTextColor="#999"
                      editable={false}
                    />
                    <ThemedText style={styles.helperText}>This field is read-only and will be updated automatically</ThemedText>
                  </View>
                )}
              </View>

              {/* Account Information */}
              <View style={styles.sectionGroup}>
                <ThemedText style={styles.sectionTitle}>Account Information</ThemedText>
                
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Account Number</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={accountNumber}
                    onChangeText={setAccountNumber}
                    placeholder="Account number"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Round Order</ThemedText>
                  <Pressable 
                    style={styles.roundOrderButton} 
                    onPress={() => router.push({ pathname: '/round-order-manager', params: { editingClientId: id }})}
                  >
                    <Ionicons name="list-outline" size={20} color="#007AFF" />
                    <ThemedText style={styles.roundOrderButtonText}>
                      Change Round Order (Currently: {roundOrderNumber || 'Not set'})
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={20} color="#007AFF" />
                  </Pressable>
                </View>
              </View>

              {/* Contact Information */}
              <View style={styles.sectionGroup}>
                <ThemedText style={styles.sectionTitle}>Contact Information</ThemedText>
                
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Mobile Number</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                    placeholder="Mobile number"
                    keyboardType="phone-pad"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Email Address</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Modal Footer */}
          <View style={styles.modalFooter}>
            <Pressable style={styles.cancelButton} onPress={handleClose} disabled={updating}>
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable 
              style={[styles.saveButton, updating && styles.saveButtonDisabled]} 
              onPress={handleSave} 
              disabled={updating}
            >
              {updating ? (
                <>
                  <ThemedText style={styles.saveButtonText}>Updating...</ThemedText>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  
  // Header styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerContent: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  customerAddress: {
    fontSize: 16,
    color: '#666',
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    margin: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  tabIcon: {
    marginRight: 8,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  
  // Body styles
  modalBody: {
    flex: 1,
    paddingHorizontal: 24,
  },
  section: {
    paddingBottom: 20,
  },
  sectionGroup: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  
  // Input styles
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    color: '#333',
  },
  legacyInput: {
    backgroundColor: '#f0f0f0',
    color: '#666',
  },
  helperText: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    fontStyle: 'italic',
  },
  
  // Special input styles
  roundOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  roundOrderButtonText: {
    flex: 1,
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  webDateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    color: '#333',
  },
  
  // Summary styles
  summaryCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    width: 80,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  
  // Footer styles
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#999',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Loading styles
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
}); 