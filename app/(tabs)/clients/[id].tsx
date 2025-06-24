import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { IconSymbol } from '../../../components/ui/IconSymbol';
import { db } from '../../../core/firebase';
import { isTodayMarkedComplete } from '../../services/jobService';
import type { Client } from '../../types/client';
import type { Job, Payment } from '../../types/models';

type ServiceHistoryItem = (Job & { type: 'job' }) | (Payment & { type: 'payment' });

// Extend Client type to include optional startingBalance
type ClientWithStartingBalance = Client & { startingBalance?: number };

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [jobType, setJobType] = useState('Gutter cleaning');
  const [customJobType, setCustomJobType] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [jobPrice, setJobPrice] = useState('');
  const [jobDate, setJobDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [todayComplete, setTodayComplete] = useState(false);
  const [nextScheduledVisit, setNextScheduledVisit] = useState<string | null>(null);
  const [scheduleCollapsed, setScheduleCollapsed] = useState(false);
  const [pendingJobs, setPendingJobs] = useState<(Job & { type: 'job' })[]>([]);

  const fetchClient = useCallback(async () => {
    if (typeof id === 'string') {
      const docRef = doc(db, 'clients', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setClient({ id: docSnap.id, ...data } as Client);
        setNotes(data.notes || '');
      }
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!client) return;

    const fetchServiceHistory = async () => {
      setLoadingHistory(true);
      setBalance(null); // Reset balance on re-fetch
      try {
        // Fetch all jobs for this client (not just completed)
        const jobsQuery = query(collection(db, 'jobs'), where('clientId', '==', client.id));
        const jobsSnapshot = await getDocs(jobsQuery);
        const jobsData = jobsSnapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id, type: 'job' } as Job & { type: 'job' }))
          .filter(job => job.status === 'completed');

        // Fetch payments
        const paymentsQuery = query(collection(db, 'payments'), where('clientId', '==', client.id));
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsData = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'payment' })) as (Payment & { type: 'payment' })[];
        
        // Calculate balance from the client's perspective (credit is positive, debt is negative)
        const totalBilled = jobsData.reduce((sum, job) => sum + job.price, 0);
        const totalPaid = paymentsData.reduce((sum, payment) => sum + payment.amount, 0);
        setBalance(totalPaid - totalBilled);

        // Combine and sort for history view
        const combinedHistory = [...jobsData, ...paymentsData];
        combinedHistory.sort((a, b) => {
          const dateA = new Date(a.type === 'job' ? (a.scheduledTime || 0) : (a.date || 0)).getTime();
          const dateB = new Date(b.type === 'job' ? (b.scheduledTime || 0) : (b.date || 0)).getTime();
          return dateB - dateA;
        });

        setServiceHistory(combinedHistory);

        // Pending jobs for schedule
        const pending = jobsSnapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id, type: 'job' } as Job & { type: 'job' }))
          .filter(job => job.status !== 'completed');
        setPendingJobs(pending);
      } catch (error) {
        console.error("Error fetching service history:", error);
        Alert.alert("Error", "Could not load service history.");
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchServiceHistory();
  }, [client]);

  useEffect(() => {
    const checkTodayComplete = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday as start of week
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const completedDoc = await getDoc(doc(db, 'completedWeeks', weekStartStr));
      if (completedDoc.exists()) {
        const data = completedDoc.data();
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const todayDay = daysOfWeek[today.getDay() - 1];
        if (data.completedDays && data.completedDays.includes(todayDay)) {
          setTodayComplete(true);
        } else {
          setTodayComplete(false);
        }
      } else {
        setTodayComplete(false);
      }
    };
    checkTodayComplete();
  }, []);

  useEffect(() => {
    if (!client) return;

    // Fetch next scheduled visit (next pending job)
    const fetchNextScheduledVisit = async () => {
      try {
        const jobsQuery = query(
          collection(db, 'jobs'),
          where('clientId', '==', client.id),
          where('status', 'in', ['pending', 'scheduled', 'in_progress'])
        );
        const jobsSnapshot = await getDocs(jobsQuery);
        const now = new Date();
        let nextJobDate: Date | null = null;
        jobsSnapshot.forEach(doc => {
          const job = doc.data();
          if (job.scheduledTime) {
            const jobDate = new Date(job.scheduledTime);
            if (jobDate >= now && (!nextJobDate || jobDate < nextJobDate)) {
              nextJobDate = jobDate;
            }
          }
        });
        setNextScheduledVisit((nextJobDate && Object.prototype.toString.call(nextJobDate) === '[object Date]') ? (nextJobDate as Date).toISOString() : null);
      } catch (error) {
        setNextScheduledVisit(null);
      }
    };

    fetchNextScheduledVisit();
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);  // reset loading state
      fetchClient();
    }, [fetchClient])
  );

  const handleDelete = () => {
    Alert.alert(
      'Archive Client',
      'This will mark the client as an ex-client and they will be moved to the ex-client list. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            if (typeof id === 'string') {
              try {
                await updateDoc(doc(db, 'clients', id), {
                  status: 'ex-client',
                  roundOrderNumber: null
                });
                // Re-number roundOrderNumber for all active clients
                const clientsSnapshot = await getDocs(collection(db, 'clients'));
                const activeClients = clientsSnapshot.docs
                  .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as import('../../types/client').Client))
                  .filter(c => c.status !== 'ex-client' && c.roundOrderNumber != null)
                  .sort((a, b) => (a.roundOrderNumber || 0) - (b.roundOrderNumber || 0));
                for (let i = 0; i < activeClients.length; i++) {
                  const client = activeClients[i];
                  if (client.roundOrderNumber !== i + 1) {
                    await updateDoc(doc(db, 'clients', client.id), { roundOrderNumber: i + 1 });
                  }
                }
                // Delete all jobs for this client that are scheduled for today or in the future and not completed
                const jobsRef = collection(db, 'jobs');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const jobsQuery = query(
                  jobsRef, 
                  where('clientId', '==', id),
                  where('status', '!=', 'completed')
                );
                const jobsSnapshot = await getDocs(jobsQuery);
                const batch = writeBatch(db);
                jobsSnapshot.forEach(jobDoc => {
                  const jobData = jobDoc.data();
                  if (jobData.scheduledTime) {
                    const jobDate = new Date(jobData.scheduledTime);
                    jobDate.setHours(0, 0, 0, 0);
                    if (jobDate >= today) {
                  batch.delete(jobDoc.ref);
                    }
                  }
                });
                await batch.commit();
                router.replace('/clients');
              } catch (error) {
                console.error('Error archiving client:', error);
                Alert.alert('Error', 'Failed to archive client. Please try again.');
              }
            }
          },
        },
      ]
    );
  };

  const handleEditDetails = () => {
    router.push({
      pathname: '/(tabs)/clients/[id]/edit-customer',
      params: { id }
    } as never);
  };

  const handleMakePayment = () => {
    router.push({
      pathname: '/add-payment',
      params: {
        clientId: id,
        clientName: client?.name,
        clientAddress: client?.address1 || client?.address,
        clientAccountNumber: client?.accountNumber
      }
    } as never);
  };

  const handleOpenNotes = () => {
    setNotesModalVisible(true);
  };

  const handleSaveNotes = async () => {
    if (typeof id !== 'string') return;
    
    setSavingNotes(true);
    try {
      await updateDoc(doc(db, 'clients', id), {
        notes: notes
      });
      setNotesModalVisible(false);
      Alert.alert('Success', 'Notes saved successfully!');
    } catch (error) {
      console.error('Error saving notes:', error);
      Alert.alert('Error', 'Failed to save notes. Please try again.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddJob = async () => {
    if (!jobPrice) {
      Alert.alert('Error', 'Please enter a price for the job.');
      return;
    }

    if (jobType === 'Other' && !customJobType.trim()) {
      Alert.alert('Error', 'Please enter a custom job type.');
      return;
    }

    const finalJobType = jobType === 'Other' ? customJobType.trim() : jobType;

    // Prevent adding a job for today if today is marked complete (using utility)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDateOnly = new Date(jobDate);
    jobDateOnly.setHours(0, 0, 0, 0);
    if (jobDateOnly.getTime() === today.getTime()) {
      const todayComplete = await isTodayMarkedComplete();
      if (todayComplete) {
        Alert.alert('Cannot add job', 'Today is marked as complete. You cannot add a job for today.');
        return;
      }
    }

    const jobData = {
      clientId: id,
      providerId: 'test-provider-1',
      serviceId: finalJobType,
      propertyDetails: jobNotes,
      price: Number(jobPrice),
      status: 'pending',
      scheduledTime: format(jobDate, 'yyyy-MM-dd') + 'T09:00:00',
      paymentStatus: 'unpaid',
    };

    console.log('➕ Creating adhoc job:', jobData);

    try {
      await addDoc(collection(db, 'jobs'), jobData);
      Alert.alert('Success', 'Job added successfully.');
      setModalVisible(false);
      setJobNotes('');
      setJobPrice('');
      setCustomJobType('');
    } catch (error) {
      console.error('Error adding job:', error);
      Alert.alert('Error', 'Failed to add job.');
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || jobDate;
    setShowDatePicker(false);
    setJobDate(currentDate);
  };

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!client) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ThemedText type="title">Client not found</ThemedText>
      </ThemedView>
    );
  }

  const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
  const displayAddress = addressParts.length > 0
    ? addressParts.join(', ')
    : client.address || 'No address';

  // Prepend starting balance to service history if present
  const typedClient = client as ClientWithStartingBalance;
  const serviceHistoryWithStartingBalance =
    typedClient.startingBalance !== undefined && typedClient.startingBalance !== 0
      ? ([{ type: 'startingBalance', amount: typedClient.startingBalance }, ...serviceHistory] as any[])
      : serviceHistory;

  return (
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={historyCollapsed ? [] : serviceHistoryWithStartingBalance}
        keyExtractor={(item) => item.type === 'startingBalance' ? 'startingBalance' : (item.id ? `${item.type}-${item.id}` : `${item.type}`)}
        renderItem={loadingHistory ? undefined : renderHistoryItem}
        ListEmptyComponent={
          loadingHistory
            ? <ActivityIndicator />
            : (!historyCollapsed && serviceHistoryWithStartingBalance.length === 0
                ? <ThemedText>No service history found.</ThemedText>
                : null)
        }
        ListHeaderComponent={
          <>
            <View style={styles.titleRow}>
              <ThemedText type="title" style={styles.title}>{displayAddress}</ThemedText>
              <Pressable style={styles.homeButton} onPress={() => router.replace('/')}> 
                <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
              </Pressable>
            </View>
            <View style={styles.infoAndButtonsRow}>
              <View style={styles.clientInfo}>
      <ThemedText style={{ marginTop: 20 }}>Name: {client.name}</ThemedText>
                <ThemedText>Account Number: {client.accountNumber ?? 'N/A'}</ThemedText>
                <ThemedText>Round Order Number: {client.roundOrderNumber ?? 'N/A'}</ThemedText>
      {typeof client.quote === 'number' && !isNaN(client.quote) ? (
        <ThemedText>Quote: £{client.quote.toFixed(2)}</ThemedText>
      ) : (
        <ThemedText>Quote: N/A</ThemedText>
      )}
                {client.frequency && client.frequency !== 'one-off' ? (
        <ThemedText>Visit every {client.frequency} weeks</ThemedText>
                ) : client.frequency === 'one-off' ? (
                  <ThemedText>No recurring work</ThemedText>
                ) : null}
                {nextScheduledVisit ? (
                  <ThemedText>Next scheduled visit: {new Date(nextScheduledVisit).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}</ThemedText>
                ) : (
                  <ThemedText>Next scheduled visit: N/A</ThemedText>
                )}
                <ThemedText>Mobile Number: {client.mobileNumber ?? 'N/A'}</ThemedText>
                {client.email && (
                  <ThemedText>Email: {client.email}</ThemedText>
                )}
                {client.dateAdded && (
                  <ThemedText>Date Added: {new Date(client.dateAdded).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}</ThemedText>
      )}
                {client.source && (
                  <ThemedText>Source: {client.source}</ThemedText>
                )}
              </View>
              <View style={styles.verticalButtons}>
                <Pressable style={styles.verticalButton} onPress={handleEditDetails}>
                  <ThemedText style={styles.verticalButtonIcon}>✏️</ThemedText>
                </Pressable>
                <Pressable style={styles.verticalButton} onPress={() => setModalVisible(true)}>
                  <ThemedText style={styles.verticalButtonIcon}>➕</ThemedText>
                </Pressable>
                <Pressable style={styles.verticalButton} onPress={handleMakePayment}>
                  <ThemedText style={styles.verticalButtonIcon}>💳</ThemedText>
                </Pressable>
                {balance !== null ? (
                  <Pressable 
                    style={[styles.verticalButton, balance < 0 ? styles.negativeBalance : styles.positiveBalance]} 
                    onPress={() => router.push({
                      pathname: '/client-balance',
                      params: { clientId: id, clientName: client.name }
                    } as never)}
                  >
                    <ThemedText style={styles.verticalButtonIcon}>💰</ThemedText>
                  </Pressable>
                ) : (
                  <View style={[styles.verticalButton, styles.disabledButton]}>
                    <ThemedText style={styles.verticalButtonIcon}>💰</ThemedText>
                  </View>
                )}
                <Pressable style={[styles.verticalButton, styles.dangerButton]} onPress={handleDelete}>
                  <ThemedText style={styles.verticalButtonIcon}>🗂️</ThemedText>
                </Pressable>
              </View>
            </View>
            <View style={styles.notesSection}>
              <Pressable style={styles.sectionHeading} onPress={() => setNotesCollapsed(!notesCollapsed)}>
                <IconSymbol name="chevron.right" size={28} color="#888" style={{ transform: [{ rotate: notesCollapsed ? '0deg' : '90deg' }] }} />
                <ThemedText style={styles.sectionHeadingText}>Notes</ThemedText>
              </Pressable>
              {!notesCollapsed && (
                <Pressable style={styles.notesContent} onPress={handleOpenNotes}>
                  {notes ? (
                    <ThemedText style={styles.notesText}>{notes}</ThemedText>
                  ) : (
                    <ThemedText style={styles.notesPlaceholder}>Tap to add notes...</ThemedText>
                  )}
                </Pressable>
              )}
            </View>
            <Pressable style={styles.sectionHeading} onPress={() => setHistoryCollapsed(!historyCollapsed)}>
              <IconSymbol name="chevron.right" size={28} color="#888" style={{ transform: [{ rotate: historyCollapsed ? '0deg' : '90deg' }] }} />
              <ThemedText style={styles.sectionHeadingText}>Service History</ThemedText>
            </Pressable>
          </>
        }
        ListFooterComponent={
          <View style={styles.scheduleContainer}>
            <Pressable style={styles.sectionHeading} onPress={() => setScheduleCollapsed(!scheduleCollapsed)}>
              <IconSymbol name="chevron.right" size={28} color="#888" style={{ transform: [{ rotate: scheduleCollapsed ? '0deg' : '90deg' }] }} />
              <ThemedText style={styles.sectionHeadingText}>Service Schedule</ThemedText>
            </Pressable>
            {!scheduleCollapsed && (
              pendingJobs.length === 0 ? (
                <ThemedText>No pending jobs.</ThemedText>
              ) : (
                [...pendingJobs]
                  .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
                  .map(job => (
                    <View key={job.id} style={[styles.historyItem, styles.jobItem]}>
                      <ThemedText style={styles.historyItemText}>
                        <ThemedText style={{ fontWeight: 'bold' }}>{job.serviceId || 'Job'}:</ThemedText> {format(parseISO(job.scheduledTime), 'do MMMM yyyy')}
                      </ThemedText>
                      <ThemedText style={styles.historyItemText}>
                        Price: £{job.price.toFixed(2)}
                      </ThemedText>
                    </View>
                  ))
              )
            )}
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText type="subtitle">Add a New Job</ThemedText>

            <View style={styles.datePickerContainer}>
              <ThemedText style={styles.dateText}>{format(jobDate, 'do MMMM yyyy')}</ThemedText>
              <Pressable style={styles.calendarButton} onPress={() => setShowDatePicker(true)}>
                <ThemedText style={styles.calendarIcon}>📅</ThemedText>
              </Pressable>
            </View>

            {showDatePicker && (
              <DateTimePicker
                testID="dateTimePicker"
                value={jobDate}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}

            <Picker
              selectedValue={jobType}
              onValueChange={(itemValue) => setJobType(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="Gutter cleaning" value="Gutter cleaning" />
              <Picker.Item label="Conservatory roof" value="Conservatory roof" />
              <Picker.Item label="Soffit and fascias" value="Soffit and fascias" />
              <Picker.Item label="One-off window cleaning" value="One-off window cleaning" />
              <Picker.Item label="Other" value="Other" />
            </Picker>
            
            {jobType === 'Other' && (
              <TextInput
                style={styles.input}
                placeholder="Enter custom job type"
                value={customJobType}
                onChangeText={setCustomJobType}
              />
            )}
            
            <TextInput
              style={styles.input}
              placeholder="Job Notes"
              value={jobNotes}
              onChangeText={setJobNotes}
            />
            <TextInput
              style={styles.input}
              placeholder="Job Price (£)"
              value={jobPrice}
              onChangeText={setJobPrice}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color="red" />
              <Button title="Add Job" onPress={handleAddJob} />
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent={true}
        visible={notesModalVisible}
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText type="subtitle">Edit Notes</ThemedText>
            
            <TextInput
              style={styles.notesInput}
              placeholder="Enter notes for this client..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
            
            <View style={styles.modalButtons}>
              <Button 
                title="Cancel" 
                onPress={() => setNotesModalVisible(false)} 
                color="red" 
              />
              <Button 
                title={savingNotes ? "Saving..." : "Save Notes"} 
                onPress={handleSaveNotes}
                disabled={savingNotes}
              />
            </View>
      </View>
      </View>
      </Modal>
    </ThemedView>
  );
}

const renderHistoryItem = ({ item }: { item: any }) => {
  if (item.type === 'startingBalance') {
    return (
      <View style={styles.historyItem}>
        <ThemedText style={styles.historyItemText}>
          <ThemedText style={{ fontWeight: 'bold' }}>Starting Balance: </ThemedText>
          £{Number(item.amount).toFixed(2)}
        </ThemedText>
      </View>
    );
  } else if (item.type === 'job') {
    return (
      <View style={[styles.historyItem, styles.jobItem]}>
        <ThemedText style={styles.historyItemText}>
          <ThemedText style={{ fontWeight: 'bold' }}>Job:</ThemedText> {format(parseISO(item.scheduledTime), 'do MMMM yyyy')}
        </ThemedText>
        <ThemedText style={styles.historyItemText}>
          Status: <ThemedText style={{ fontWeight: 'bold' }}>{item.status}</ThemedText>
        </ThemedText>
        <ThemedText style={styles.historyItemText}>
          Price: £{item.price.toFixed(2)}
        </ThemedText>
      </View>
    );
  } else if (item.type === 'payment') {
    return (
      <View style={[styles.historyItem, styles.paymentItem]}>
        <ThemedText style={styles.historyItemText}>
          <ThemedText style={{ fontWeight: 'bold' }}>Payment:</ThemedText> {format(parseISO(item.date), 'do MMMM yyyy')}
        </ThemedText>
        <ThemedText style={styles.historyItemText}>
          Amount: <ThemedText style={{ fontWeight: 'bold' }}>£{item.amount.toFixed(2)}</ThemedText>
        </ThemedText>
        <ThemedText style={styles.historyItemText}>
          Method: {item.method.replace('_', ' ')}
        </ThemedText>
        {item.reference && (
          <ThemedText style={styles.historyItemText}>
            Reference: <ThemedText style={{ fontWeight: 'bold' }}>{item.reference}</ThemedText>
          </ThemedText>
        )}
        {item.notes && (
          <ThemedText style={styles.historyItemText}>
            Notes: <ThemedText style={{ fontWeight: 'bold' }}>{item.notes}</ThemedText>
          </ThemedText>
        )}
      </View>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingTop: 60,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    flex: 1,
  },
  homeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  homeButtonText: {
    fontSize: 18,
  },
  historyContainer: {
    marginTop: 24,
    flex: 1,
  },
  historyTitle: {
    marginBottom: 12,
  },
  historyItem: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  jobItem: {
    backgroundColor: '#eef5ff',
    borderColor: '#cce0ff',
    borderWidth: 1,
  },
  paymentItem: {
    backgroundColor: '#e8fff4',
    borderColor: '#b8eed7',
    borderWidth: 1,
  },
  historyItemText: {
    fontSize: 14,
    textTransform: 'capitalize',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
    paddingVertical: 5,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
  },
  calendarButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  calendarIcon: {
    fontSize: 18,
  },
  picker: {
    width: '100%',
    height: 150,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginVertical: 10,
    borderRadius: 5,
    width: '100%',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  infoAndButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 20,
  },
  clientInfo: {
    flex: 1,
    marginRight: 20,
  },
  verticalButtons: {
    flexDirection: 'column',
    gap: 8,
  },
  verticalButton: {
    width: 40,
    height: 40,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  verticalButtonIcon: {
    fontSize: 16,
  },
  negativeBalance: {
    backgroundColor: '#ffe6e6',
    borderColor: '#ffb3b3',
  },
  positiveBalance: {
    backgroundColor: '#e6ffe6',
    borderColor: '#b3ffb3',
  },
  dangerButton: {
    backgroundColor: '#ffe6e6',
    borderColor: '#ffb3b3',
  },
  disabledButton: {
    backgroundColor: '#f0f0f0',
    borderColor: '#d0d0d0',
  },
  notesSection: {
    marginTop: 24,
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 5,
  },
  notesTitle: {
    flex: 1,
  },
  notesContent: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
  },
  notesText: {
    fontSize: 14,
  },
  notesPlaceholder: {
    fontSize: 14,
    color: '#999',
  },
  notesTextInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginVertical: 10,
    borderRadius: 5,
    width: '100%',
    height: 200,
    textAlignVertical: 'top',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 5,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
    gap: 8,
  },
  sectionHeadingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    flex: 0,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
    width: '100%',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    color: '#222',
    marginBottom: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  scheduleContainer: {
    marginTop: 24,
    marginBottom: 8,
  },
});

