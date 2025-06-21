import { Picker } from '@react-native-picker/picker';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';
import { createPayment } from './services/paymentService';
import type { Payment } from './types/models';

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
          
          // Set reference if provided
          if (params.reference) {
            setReference(params.reference as string);
          }
          
          // Don't auto-populate notes - leave blank for user to fill in
        } else if (clientsData.length > 0) {
          setSelectedClientId(clientsData[0].id);
        }
      } catch (error) {
        console.error('Error fetching clients:', error);
        Alert.alert('Error', 'Failed to load clients');
      }
    };

    fetchClients();
  }, [params]);

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

      await createPayment(paymentData);

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
      
      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>Client *</ThemedText>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedClientId}
              onValueChange={setSelectedClientId}
              style={styles.picker}
              enabled={!isFromJob} // Disable if coming from job
            >
              {clients.map((client) => (
                <Picker.Item
                  key={client.id}
                  label={getClientDisplayName(client)}
                  value={client.id}
                />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>Amount (£) *</ThemedText>
          <TextInput
            style={[styles.input, isFromJob && styles.disabledInput]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            placeholderTextColor="#999"
            editable={!isFromJob} // Disable if coming from job
          />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>Payment Date *</ThemedText>
          <TextInput
            style={styles.input}
            value={paymentDate}
            onChangeText={setPaymentDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999"
          />
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
          <ThemedText style={styles.label}>Reference (Optional)</ThemedText>
          <TextInput
            style={styles.input}
            value={reference}
            onChangeText={setReference}
            placeholder={selectedClient?.accountNumber ? `Account: ${selectedClient.accountNumber}` : "Payment reference or cheque number"}
            placeholderTextColor="#999"
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
      </ScrollView>

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
    height: 80,
    textAlignVertical: 'top',
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
}); 