import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Modal, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { db } from '../../../core/firebase';
import type { Client } from '../../../types/client';
import type { Job, Payment } from '../../types/models';

type ServiceHistoryItem = (Job & { type: 'job' }) | (Payment & { type: 'payment' });

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [jobType, setJobType] = useState('Gutter cleaning');
  const [jobNotes, setJobNotes] = useState('');
  const [jobPrice, setJobPrice] = useState('');
  const [jobDate, setJobDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchClient = useCallback(async () => {
    if (typeof id === 'string') {
      const docRef = doc(db, 'clients', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setClient({ id: docSnap.id, ...docSnap.data() } as Client);
      }
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!client) return;

    const fetchServiceHistory = async () => {
      setLoadingHistory(true);
      try {
        // Fetch jobs
        const jobsQuery = query(collection(db, 'jobs'), where('clientId', '==', client.id), where('status', 'in', ['completed', 'accounted']));
        const jobsSnapshot = await getDocs(jobsQuery);
        const jobsData = jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'job' })) as (Job & { type: 'job' })[];

        // Fetch payments
        const paymentsQuery = query(collection(db, 'payments'), where('clientId', '==', client.id));
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsData = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'payment' })) as (Payment & { type: 'payment' })[];

        // Combine and sort
        const combinedHistory = [...jobsData, ...paymentsData];
        combinedHistory.sort((a, b) => {
          const dateA = new Date(a.type === 'job' ? (a.scheduledTime || 0) : (a.date || 0)).getTime();
          const dateB = new Date(b.type === 'job' ? (b.scheduledTime || 0) : (b.date || 0)).getTime();
          return dateB - dateA;
        });

        setServiceHistory(combinedHistory);
      } catch (error) {
        console.error("Error fetching service history:", error);
        Alert.alert("Error", "Could not load service history.");
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchServiceHistory();
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
                  status: 'ex-client'
                });
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
    if (typeof id === 'string') {
      router.push({ pathname: '/(tabs)/clients/[id]/edit-details', params: { id } } as never);
    }
  };

  const handleEditRoutine = () => {
    if (typeof id === 'string') {
      router.push({ pathname: '/(tabs)/clients/[id]/edit', params: { id } } as never);
    }
  };

  const handleAddJob = async () => {
    if (!jobPrice) {
      Alert.alert('Error', 'Please enter a price for the job.');
      return;
    }

    try {
      await addDoc(collection(db, 'jobs'), {
        clientId: id,
        serviceId: jobType,
        propertyDetails: jobNotes,
        price: Number(jobPrice),
        status: 'pending',
        scheduledTime: jobDate.toISOString(),
        paymentStatus: 'unpaid',
      });
      Alert.alert('Success', 'Job added successfully.');
      setModalVisible(false);
      setJobNotes('');
      setJobPrice('');
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

  const displayAddress =
    client.address1 && client.town && client.postcode
      ? `${client.address1}, ${client.town}, ${client.postcode}`
      : client.address || 'No address';

  return (
    <ThemedView style={{ flex: 1, padding: 20, paddingTop: 40 }}>
      <ThemedText type="title">{displayAddress}</ThemedText>
      <ThemedText style={{ marginTop: 20 }}>Name: {client.name}</ThemedText>
      
      <ThemedText>Account Number: {client.accountNumber ?? 'N/A'}</ThemedText>
      <ThemedText>Round Order Number: {client.roundOrderNumber ?? 'N/A'}</ThemedText>
      {typeof client.quote === 'number' && !isNaN(client.quote) ? (
        <ThemedText>Quote: £{client.quote.toFixed(2)}</ThemedText>
      ) : (
        <ThemedText>Quote: N/A</ThemedText>
      )}
      {client.frequency && (
        <ThemedText>Visit every {client.frequency} weeks</ThemedText>
      )}
      {client.nextVisit && (
        <ThemedText>Next scheduled visit: {new Date(client.nextVisit).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}</ThemedText>
      )}
      <ThemedText>Mobile Number: {client.mobileNumber ?? 'N/A'}</ThemedText>

      <Button title="Edit Client Details" onPress={handleEditDetails} />
      <Button title="Edit Service Routine" onPress={handleEditRoutine} />
      <Button title="Add Job" onPress={() => setModalVisible(true)} />
      <View style={{ marginTop: 32 }}>
      <Button title="Archive Client" color="red" onPress={handleDelete} />
      </View>
      <View style={{ marginTop: 32 }}>
        <Button title="Home" onPress={() => router.replace('/')} />
      </View>

      <View style={styles.historyContainer}>
        <ThemedText type="subtitle" style={styles.historyTitle}>Service History</ThemedText>
        {loadingHistory ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={serviceHistory}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            renderItem={renderHistoryItem}
            ListEmptyComponent={<ThemedText>No service history found.</ThemedText>}
          />
        )}
      </View>

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
              <ThemedText>Job Date: {format(jobDate, 'do MMMM yyyy')}</ThemedText>
              <Button title="Change Date" onPress={() => setShowDatePicker(true)} />
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
              <Picker.Item label="Other" value="Other" />
            </Picker>
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
    </ThemedView>
  );
}

const renderHistoryItem = ({ item }: { item: ServiceHistoryItem }) => {
  if (item.type === 'job') {
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
  } else {
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
      </View>
    );
  }
};

const styles = StyleSheet.create({
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
    alignItems: 'center',
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
});

