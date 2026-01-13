import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PermissionGate from '../components/PermissionGate';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { formatAuditDescription, logAction } from '../services/auditService';

let DatePicker: any = null;
if (Platform.OS === 'web') {
  DatePicker = require('react-datepicker').default;
  require('react-datepicker/dist/react-datepicker.css');
}

interface QuoteRequest {
  id: string;
  name: string;
  phone: string;
  address: string;
  town: string;
  postcode: string;
  email?: string;
  notes?: string;
  status: 'pending' | 'contacted' | 'converted' | 'declined';
  createdAt: string;
  source: string;
}

const sourceOptions = [
  'Google',
  'Facebook',
  'Canvassing',
  'Referral',
  'Word of mouth',
  'Flyers / Leaflets',
  'Cold calling',
  'Van signage/Branding',
  'Found on the curb',
  'Client Portal',
  'Other'
];

export default function NewBusinessScreen() {
  const router = useRouter();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Schedule Quote Modal State
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<QuoteRequest | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    name: '',
    address: '',
    town: '',
    number: '',
    date: '',
    source: 'Client Portal',
    customSource: '',
    notes: ''
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [webDate, setWebDate] = useState<Date | null>(null);
  const [submittingQuote, setSubmittingQuote] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;

    const loadRequests = async () => {
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'quoteRequests'),
        where('businessId', '==', ownerId),
        orderBy('createdAt', 'desc')
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as QuoteRequest[];
        setRequests(data);
        setLoading(false);
      }, (error) => {
        console.error('Error loading quote requests:', error);
        setLoading(false);
      });
    };

    loadRequests();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const handleOpenScheduleQuote = (request: QuoteRequest) => {
    setSelectedRequest(request);
    setQuoteForm({
      name: request.name,
      address: request.address,
      town: request.town,
      number: request.phone,
      date: '',
      source: 'Client Portal',
      customSource: '',
      notes: request.notes || ''
    });
    setScheduleModalVisible(true);
  };

  const handleCreateQuote = async () => {
    if (!quoteForm.name.trim()) {
      const message = 'Please enter a customer name';
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Error', message);
      return;
    }

    setSubmittingQuote(true);
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) throw new Error('No owner ID');

      const scheduledDate = quoteForm.date || new Date().toISOString().split('T')[0];
      const finalSource = quoteForm.source === 'Other' ? quoteForm.customSource : quoteForm.source;

      const quoteData = {
        name: quoteForm.name.trim(),
        address: quoteForm.address.trim(),
        town: quoteForm.town.trim(),
        number: quoteForm.number.trim(),
        // Align with /quotes screen expectations (it displays/group-bys using `date` + `status`)
        date: scheduledDate,
        // Keep legacy field for backward compatibility (some older code may read scheduledTime)
        scheduledTime: scheduledDate,
        status: 'scheduled',
        source: finalSource,
        notes: quoteForm.notes.trim(),
        ownerId,
        createdAt: new Date().toISOString()
      };

      const quoteRef = await addDoc(collection(db, 'quotes'), quoteData);

      // Create a 'Quote' job on the runsheet for the scheduled date (matches /quotes behavior)
      await addDoc(collection(db, 'jobs'), {
        ownerId,
        accountId: ownerId, // Explicitly set accountId for Firestore rules
        clientId: 'QUOTE_' + quoteRef.id,
        scheduledTime: scheduledDate + 'T09:00:00',
        status: 'pending',
        type: 'quote',
        serviceId: 'quote',
        label: 'Quote',
        name: quoteForm.name.trim(),
        address: quoteForm.address.trim(),
        town: quoteForm.town.trim(),
        number: quoteForm.number.trim(),
        quoteId: quoteRef.id,
        source: finalSource,
      });

      // Log the action
      await logAction(
        'quote_created',
        'quote',
        quoteRef.id,
        formatAuditDescription('quote_created', `${quoteForm.address}, ${quoteForm.town}`)
      );

      // Update the quote request status to 'contacted'
      if (selectedRequest) {
        await updateDoc(doc(db, 'quoteRequests', selectedRequest.id), {
          status: 'contacted',
          updatedAt: new Date().toISOString()
        });
      }

      setScheduleModalVisible(false);
      setSelectedRequest(null);

      const successMsg = 'Quote scheduled successfully!';
      Platform.OS === 'web' ? window.alert(successMsg) : Alert.alert('Success', successMsg);

    } catch (error) {
      console.error('Error creating quote:', error);
      const errMsg = 'Failed to create quote. Please try again.';
      Platform.OS === 'web' ? window.alert(errMsg) : Alert.alert('Error', errMsg);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleAddClient = (request: QuoteRequest) => {
    // Navigate to add-client with pre-filled data
    router.push({
      pathname: '/add-client',
      params: {
        name: request.name,
        address1: request.address,
        town: request.town,
        postcode: request.postcode,
        mobileNumber: request.phone,
        email: request.email || '',
        source: 'Client Portal'
      }
    });

    // Update the quote request status to 'converted'
    updateDoc(doc(db, 'quoteRequests', request.id), {
      status: 'converted',
      updatedAt: new Date().toISOString()
    }).catch(err => console.error('Error updating request status:', err));
  };

  const handleDelete = async (requestId: string) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm('Are you sure you want to delete this request?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Request',
            'Are you sure you want to delete this request?',
            [
              { text: 'Cancel', onPress: () => resolve(false) },
              { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
            ]
          );
        });

    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'quoteRequests', requestId));
      } catch (error) {
        console.error('Error deleting request:', error);
        const message = 'Failed to delete request. Please try again.';
        Platform.OS === 'web' ? window.alert(message) : Alert.alert('Error', message);
      }
    }
  };

  const getStatusColor = (status: QuoteRequest['status']) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'contacted': return '#3b82f6';
      case 'converted': return '#10b981';
      case 'declined': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: QuoteRequest['status']) => {
    switch (status) {
      case 'pending': return 'New';
      case 'contacted': return 'Quote Scheduled';
      case 'converted': return 'Converted';
      case 'declined': return 'Declined';
      default: return status;
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <PermissionGate perm="viewNewBusiness" fallback={<View style={styles.container}><Text>You don't have permission to view this page.</Text></View>}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>New Business</Text>
            <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
              <Text style={styles.homeButtonText}>🏠</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Quote requests from your client portal
          </Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount} new {pendingCount === 1 ? 'request' : 'requests'}</Text>
            </View>
          )}
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No Quote Requests Yet</Text>
              <Text style={styles.emptyText}>
                When prospective customers submit quote requests through your client portal, they'll appear here.
              </Text>
            </View>
          ) : (
            requests.map((request) => (
              <View key={request.id} style={styles.card}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.cardName}>{request.name}</Text>
                    <Text style={styles.cardDate}>{formatDate(request.createdAt)}</Text>
                  </View>
                </View>

                {/* Card Body - Contact & Address Info */}
                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>📞</Text>
                    <Text style={styles.infoValue}>{request.phone}</Text>
                  </View>
                  {request.email && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>✉️</Text>
                      <Text style={styles.infoValue}>{request.email}</Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>📍</Text>
                    <Text style={styles.infoValue}>
                      {request.address}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}></Text>
                    <Text style={styles.infoValueSecondary}>
                      {request.town}, {request.postcode}
                    </Text>
                  </View>
                  {request.notes && (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesLabel}>Notes:</Text>
                      <Text style={styles.notesText}>{request.notes}</Text>
                    </View>
                  )}
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <View style={styles.scheduleButtonContainer}>
                    <Pressable 
                      style={styles.scheduleButton}
                      onPress={() => handleOpenScheduleQuote(request)}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#fff" />
                      <Text style={styles.scheduleButtonText}>Schedule Quote</Text>
                    </Pressable>
                    <Text style={styles.buttonTip}>Raise a visit to quote on a later date</Text>
                  </View>
                  
                  <Pressable 
                    style={styles.addClientButton}
                    onPress={() => handleAddClient(request)}
                  >
                    <Ionicons name="person-add-outline" size={18} color="#fff" />
                    <Text style={styles.addClientButtonText}>Add Client</Text>
                  </Pressable>
                </View>

                {/* Delete button */}
                <Pressable 
                  style={styles.deleteButton}
                  onPress={() => handleDelete(request.id)}
                >
                  <Text style={styles.deleteButtonText}>Delete Request</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>

        {/* Schedule Quote Modal */}
        <Modal visible={scheduleModalVisible} animationType="slide" transparent onRequestClose={() => setScheduleModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={styles.headerContent}>
                  <Ionicons name="calendar-outline" size={24} color="#007AFF" style={styles.headerIcon} />
                  <Text style={styles.modalTitle}>Schedule Quote Visit</Text>
                </View>
                <Pressable style={styles.closeButton} onPress={() => setScheduleModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              {/* Modal Body */}
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Customer Information */}
                <View style={styles.sectionGroup}>
                  <Text style={styles.sectionTitle}>Customer Information</Text>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Customer Name *</Text>
                    <TextInput 
                      placeholder="Enter customer name" 
                      value={quoteForm.name} 
                      onChangeText={v => setQuoteForm(f => ({ ...f, name: v }))} 
                      style={styles.input}
                      placeholderTextColor="#999"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Street Address</Text>
                    <TextInput 
                      placeholder="Enter street address" 
                      value={quoteForm.address} 
                      onChangeText={v => setQuoteForm(f => ({ ...f, address: v }))} 
                      style={styles.input}
                      placeholderTextColor="#999"
                    />
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 2 }]}>
                      <Text style={styles.inputLabel}>Town/City</Text>
                      <TextInput 
                        placeholder="Enter town or city" 
                        value={quoteForm.town} 
                        onChangeText={v => setQuoteForm(f => ({ ...f, town: v }))} 
                        style={styles.input}
                        placeholderTextColor="#999"
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                      <Text style={styles.inputLabel}>Phone</Text>
                      <TextInput 
                        placeholder="Phone" 
                        value={quoteForm.number} 
                        onChangeText={v => setQuoteForm(f => ({ ...f, number: v }))} 
                        style={styles.input}
                        keyboardType="phone-pad"
                        placeholderTextColor="#999"
                      />
                    </View>
                  </View>
                </View>

                {/* Quote Details */}
                <View style={styles.sectionGroup}>
                  <Text style={styles.sectionTitle}>Quote Details</Text>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Quote Visit Date</Text>
                    <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                      <Ionicons name="calendar-outline" size={20} color="#666" />
                      <Text style={styles.dateButtonText}>
                        {quoteForm.date ? format(new Date(quoteForm.date), 'do MMMM yyyy') : 'Select date'}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#666" />
                    </Pressable>
                    {showDatePicker && Platform.OS !== 'web' && (
                      <DateTimePicker
                        value={quoteForm.date ? new Date(quoteForm.date) : new Date()}
                        mode="date"
                        display="default"
                        onChange={(_event, selectedDate) => {
                          if (selectedDate) {
                            const yyyy = selectedDate.getFullYear();
                            const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
                            const dd = String(selectedDate.getDate()).padStart(2, '0');
                            setQuoteForm(f => ({ ...f, date: `${yyyy}-${mm}-${dd}` }));
                          }
                          setShowDatePicker(false);
                        }}
                      />
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Lead Source</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={quoteForm.source}
                        onValueChange={v => setQuoteForm(f => ({ ...f, source: v }))}
                        style={styles.picker}
                      >
                        <Picker.Item label="Select source..." value="" />
                        {sourceOptions.map(opt => (
                          <Picker.Item key={opt} label={opt} value={opt} />
                        ))}
                      </Picker>
                    </View>
                    {quoteForm.source === 'Other' && (
                      <View style={styles.customSourceContainer}>
                        <TextInput 
                          placeholder="Specify custom source" 
                          value={quoteForm.customSource} 
                          onChangeText={v => setQuoteForm(f => ({ ...f, customSource: v }))} 
                          style={styles.input}
                          placeholderTextColor="#999"
                        />
                      </View>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Notes</Text>
                    <TextInput 
                      placeholder="Any additional information about this quote" 
                      value={quoteForm.notes} 
                      onChangeText={v => setQuoteForm(f => ({ ...f, notes: v }))} 
                      style={[styles.input, styles.textArea]}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>
              </ScrollView>

              {/* Web Date Picker Overlay */}
              {showDatePicker && Platform.OS === 'web' && DatePicker && (
                <View style={styles.webDatePickerOverlay}>
                  <View style={styles.webDatePickerContainer}>
                    <DatePicker
                      selected={webDate}
                      onChange={(date: Date | null) => {
                        if (date) {
                          const yyyy = date.getFullYear();
                          const mm = String(date.getMonth() + 1).padStart(2, '0');
                          const dd = String(date.getDate()).padStart(2, '0');
                          setQuoteForm(f => ({ ...f, date: `${yyyy}-${mm}-${dd}` }));
                          setWebDate(date);
                        }
                        setShowDatePicker(false);
                      }}
                      inline
                    />
                    <Pressable style={styles.cancelDateButton} onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.cancelDateText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Modal Footer */}
              <View style={styles.modalFooter}>
                <Pressable style={styles.cancelButton} onPress={() => setScheduleModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[styles.createButton, submittingQuote && styles.createButtonDisabled]} 
                  onPress={handleCreateQuote}
                  disabled={submittingQuote}
                >
                  {submittingQuote ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                      <Text style={styles.createButtonText}>Schedule Quote</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  homeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  homeButtonText: {
    fontSize: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  pendingBadgeText: {
    color: '#92400e',
    fontWeight: '600',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  cardDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  infoIcon: {
    fontSize: 14,
    marginRight: 8,
    width: 20,
  },
  infoValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  infoValueSecondary: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  notesBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#374151',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  scheduleButtonContainer: {
    flex: 1,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  scheduleButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonTip: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
  addClientButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  addClientButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontSize: 13,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  sectionGroup: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
    marginLeft: 8,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  customSourceContainer: {
    marginTop: 8,
  },
  webDatePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  webDatePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  cancelDateButton: {
    marginTop: 12,
    padding: 8,
    alignItems: 'center',
  },
  cancelDateText: {
    color: '#007AFF',
    fontSize: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    gap: 6,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
