import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Button, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { createPayment } from '../services/paymentService';
import type { Client } from '../types/client';
import type { Payment } from '../types/models';
import { displayAccountNumber } from '../utils/account';

export default function AddPaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<Payment['method']>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [isFromJob, setIsFromJob] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'clients'));
        const clientsData: Client[] = [];
        querySnapshot.forEach((doc) => {
          clientsData.push({ id: doc.id, ...doc.data() } as Client);
        });
        setClients(clientsData);
        
        // Check if we have pre-filled data from a job
        if (params.clientId && params.amount) {
          setSelectedClientId(params.clientId as string);
          setAmount(params.amount as string);
          setIsFromJob(true);
          
          // Auto-populate reference with client's account number
          const selectedClient = clientsData.find(client => client.id === params.clientId);
          if (selectedClient?.accountNumber) {
            setReference(`Account: ${displayAccountNumber(selectedClient.accountNumber)}`);
          } else if (params.reference) {
            setReference(params.reference as string);
          }
          
          // Don't auto-populate notes - leave blank for user to fill in
        } else if (params.clientId) {
          // Coming from client detail screen
          setSelectedClientId(params.clientId as string);
          
          // Pre-populate reference with account number if available
          if (params.accountNumber) {
            const acc = Array.isArray(params.accountNumber) ? params.accountNumber[0] : params.accountNumber;
            setReference(`Account: ${displayAccountNumber(acc)}`);
          }
          
          // Pre-populate notes with address if available
          if (params.address) {
            setNotes(`Address: ${params.address}`);
          }
        } else if (clientsData.length > 0) {
          setSelectedClientId(clientsData[0].id);
        }
      } catch (error) {
        console.error('Error fetching clients:', error);
        Alert.alert('Error', 'Failed to load clients');
      }
    };

    fetchClients();
  }, []);

  // Auto-fill reference when client is selected
  useEffect(() => {
    const selectedClient = clients.find(client => client.id === selectedClientId);
    if (selectedClient && selectedClient.accountNumber) {
      setReference(`Account: ${displayAccountNumber(selectedClient.accountNumber)}`);
    } else if (selectedClient) {
      setReference('');
    }
  }, [selectedClientId, clients]);

  const handleSave = async () => {
    if (!selectedClientId || !amount.trim() || !paymentDate.trim()) {
      Alert.alert('Error', 'Please fill out all required fields.');
      return;
    }

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    setLoading(true);
    try {
      const paymentData: any = {
        clientId: selectedClientId,
        amount: amountValue,
        date: paymentDate,
        method: paymentMethod,
      };

      // Only include reference if it has a meaningful value
      if (reference.trim()) {
        paymentData.reference = reference.trim();
      }

      // Only include notes if it has a meaningful value
      if (notes.trim()) {
        paymentData.notes = notes.trim();
      }

      // If the payment is from a job, include the jobId
      if (params.jobId) {
        paymentData.jobId = params.jobId as string;
      }

      await createPayment(paymentData);

      // Note: We don't update job status to 'paid' anymore since completed jobs should remain as 'completed'
      // The payment is linked to the job via jobId for reference purposes

      Alert.alert('Success', 'Payment added successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error creating payment:', error);
      Alert.alert('Error', 'Failed to add payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getClientDisplayName = (client: Client) => {
    const address = client.address1 && client.town && client.postcode 
      ? `${client.address1}, ${client.town}`
      : client.address || 'No address';
    return `${client.name} - ${address}`;
  };

  const selectedClient = clients.find(client => client.id === selectedClientId);

  const filteredClients = clients.filter(client => {
    const search = clientSearch.toLowerCase();
    return (
      client.name.toLowerCase().includes(search) ||
      (client.address1 && client.address1.toLowerCase().includes(search)) ||
      (client.town && client.town.toLowerCase().includes(search)) ||
      (client.address && client.address.toLowerCase().includes(search))
    );
  });

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {isFromJob ? 'Create Payment from Job' : 'Add Payment'}
      </ThemedText>
      
      {isFromJob && (
        <View style={styles.infoBox}>
          <ThemedText style={styles.infoText}>
            Creating payment for completed job
          </ThemedText>
        </View>
      )}
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.form}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Client *</ThemedText>
            {!isFromJob ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Search clients by name or address"
                  value={clientSearch}
                  onChangeText={text => {
                    setClientSearch(text);
                    setShowClientList(true);
                  }}
                  onFocus={() => setShowClientList(true)}
                />
                {showClientList && filteredClients.length > 0 && (
                  <View style={styles.clientList}>
                    {filteredClients.map(item => (
                      <Pressable
                        key={item.id}
                        style={styles.clientListItem}
                        onPress={() => {
                          setSelectedClientId(item.id);
                          setClientSearch(getClientDisplayName(item));
                          setShowClientList(false);
                        }}
                      >
                        <ThemedText>{getClientDisplayName(item)}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <TextInput
                style={[styles.input, { backgroundColor: '#f0f0f0', color: '#999' }]}
                value={selectedClient ? getClientDisplayName(selectedClient) : ''}
                editable={false}
              />
            )}
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Amount (£) *</ThemedText>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Payment Date *</ThemedText>
            <Pressable
              style={styles.input}
              onPress={() => setShowDatePicker(true)}
            >
              <ThemedText>
                {paymentDate ? paymentDate : 'Select date'}
              </ThemedText>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={paymentDate ? new Date(paymentDate) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) {
                    setPaymentDate(format(selectedDate, 'yyyy-MM-dd'));
                  }
                }}
              />
            )}
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Payment Method</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as Payment['method'])}
                style={styles.picker}
              >
                <Picker.Item label="Cash" value="cash" />
                <Picker.Item label="Card" value="card" />
                <Picker.Item label="Bank Transfer" value="bank_transfer" />
                <Picker.Item label="Cheque" value="cheque" />
                <Picker.Item label="Other" value="other" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Reference</ThemedText>
            <TextInput
              style={[styles.input, ((selectedClient && selectedClient.accountNumber) || isFromJob) && styles.disabledInput]}
              value={reference}
              onChangeText={setReference}
              placeholder={selectedClient?.accountNumber ? `Account: ${displayAccountNumber(selectedClient.accountNumber)}` : "Payment reference or cheque number"}
              placeholderTextColor="#999"
              editable={!(selectedClient && selectedClient.accountNumber) && !isFromJob}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Notes (Optional)</ThemedText>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes"
              multiline
              numberOfLines={3}
              placeholderTextColor="#999"
            />
          </View>
          
          {/* Add extra padding at the bottom to ensure notes field is visible */}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.buttonContainer}>
        <Button
          title={loading ? 'Saving...' : 'Save Payment'}
          onPress={handleSave}
          disabled={loading}
        />
        <Button title="Cancel" onPress={() => router.back()} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#333',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 20,
    paddingBottom: 20,
  },
  infoBox: {
    backgroundColor: '#f0f8ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#b0d4f1',
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
  },
  disabledInput: {
    backgroundColor: '#f0f0f0',
    color: '#666',
  },
  bottomPadding: {
    height: 100,
  },
  clientList: {
    maxHeight: 180,
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 2,
    marginBottom: 8,
    zIndex: 10,
  },
  clientListItem: {
    padding: 12,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
}); 