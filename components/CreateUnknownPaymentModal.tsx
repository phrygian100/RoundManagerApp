import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, TextInput, View } from 'react-native';
import { createUnknownPayment, type CreateUnknownPaymentData } from '../services/unknownPaymentService';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

type CreateUnknownPaymentModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CreateUnknownPaymentModal({ 
  visible, 
  onClose, 
  onSuccess 
}: CreateUnknownPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other'>('cash');
  const [notes, setNotes] = useState('');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!amount || !date) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const paymentData: CreateUnknownPaymentData = {
        amount: numAmount,
        date,
        method,
        notes: notes.trim() || undefined,
        originalAccountIdentifier: accountIdentifier.trim() || undefined,
      };

      await createUnknownPayment(paymentData);
      Alert.alert('Success', 'Unknown payment created successfully');
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating unknown payment:', error);
      Alert.alert('Error', 'Failed to create unknown payment');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setMethod('cash');
    setNotes('');
    setAccountIdentifier('');
    setLoading(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>Create Unknown Payment</ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Amount (£) *</ThemedText>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="numeric"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Date *</ThemedText>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Payment Method *</ThemedText>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={method}
                  onValueChange={(value) => setMethod(value)}
                  enabled={!loading}
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
              <ThemedText style={styles.label}>Account Identifier (Optional)</ThemedText>
              <TextInput
                style={styles.input}
                value={accountIdentifier}
                onChangeText={setAccountIdentifier}
                placeholder="Account number or identifier"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Notes (Optional)</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes about this payment"
                multiline
                numberOfLines={3}
                editable={!loading}
              />
            </View>
          </View>

          <View style={styles.buttons}>
            <ThemedView style={[styles.button, styles.cancelButton]} onTouchEnd={handleClose}>
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </ThemedView>
            <ThemedView 
              style={[styles.button, styles.submitButton, loading && styles.disabledButton]} 
              onTouchEnd={loading ? undefined : handleSubmit}
            >
              <ThemedText style={styles.submitButtonText}>
                {loading ? 'Creating...' : 'Create Payment'}
              </ThemedText>
            </ThemedView>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 12,
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  form: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'white',
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: 'white',
  },
  picker: {
    height: 50,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
}); 