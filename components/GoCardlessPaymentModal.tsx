import { format } from 'date-fns';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    View
} from 'react-native';
import { createPayment, getPaymentsForJob } from '../services/paymentService';
import type { Client } from '../types/client';
import type { Job } from '../types/models';
import { ThemedText } from './ThemedText';

interface GoCardlessPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  job: Job | null;
  client: Client | null;
}

export default function GoCardlessPaymentModal({
  visible,
  onClose,
  job,
  client,
}: GoCardlessPaymentModalProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirmPayment = async () => {
    if (!job || !client) return;

    setLoading(true);
    try {
      // Check if payment already exists for this job
      const existingPayments = await getPaymentsForJob(job.id);
      if (existingPayments.length > 0) {
        Alert.alert(
          'Payment Already Exists',
          'A payment has already been created for this job. Please check the accounts screen for payment details.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Create GoCardless API payment via Firebase Function
      const functions = getFunctions(getApp());
      const createGoCardlessPayment = httpsCallable(functions, 'createGoCardlessPayment');
      
      const paymentDate = format(new Date(), 'yyyy-MM-dd');
      
      // Use job's GoCardless settings or fall back to client's settings
      const gocardlessCustomerId = job.gocardlessCustomerId || client?.gocardlessCustomerId;
      
      // Format the service date as ddmmyyyy
      const serviceDate = format(new Date(job.scheduledTime), 'ddMMyyyy');
      
      // Create description with service type and date
      const serviceDescription = job.serviceId || 'Window cleaning';
      const description = `${serviceDescription} ${serviceDate}`;
      
      const paymentRequest = {
        amount: job.price,
        currency: 'GBP',
        customerId: gocardlessCustomerId!,
        description: description,
        reference: `DD-${paymentDate}-${job.id}`
      };

      const result = await createGoCardlessPayment(paymentRequest);
      const response = result.data as any;
      
      if (response.success) {
        console.log('GoCardless payment created:', response.payment.id);
      } else {
        throw new Error(response.message || 'Payment creation failed');
      }

      // Create local payment record
      const paymentData = {
        clientId: job.clientId,
        jobId: job.id,
        amount: job.price,
        date: paymentDate,
        method: 'direct_debit' as const,
        reference: `DD-${paymentDate}-${job.id}`,
        notes: `GoCardless payment for ${client.name} - ${job.propertyDetails}`,
      };

      await createPayment(paymentData);

      // Show success message
      const successMessage = `Direct debit payment of £${job.price.toFixed(2)} has been initiated for ${client.name}.`;
      
      if (Platform.OS === 'web') {
        window.alert(successMessage);
      } else {
        Alert.alert('Payment Initiated', successMessage, [
          { text: 'OK', onPress: onClose }
        ]);
      }

      onClose();
    } catch (error) {
      console.error('Error creating GoCardless payment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (Platform.OS === 'web') {
        window.alert(`Failed to initiate payment: ${errorMessage}`);
      } else {
        Alert.alert('Payment Failed', `Failed to initiate payment: ${errorMessage}`, [
          { text: 'OK' }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (!loading) {
      onClose();
    }
  };

  if (!job || !client) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ThemedText style={styles.title}>Initiate Direct Debit Payment</ThemedText>
          
          <View style={styles.content}>
            <ThemedText style={styles.label}>Client:</ThemedText>
            <ThemedText style={styles.value}>{client.name}</ThemedText>
            
            <ThemedText style={styles.label}>Address:</ThemedText>
            <ThemedText style={styles.value}>{job.propertyDetails}</ThemedText>
            
            <ThemedText style={styles.label}>Amount:</ThemedText>
            <ThemedText style={styles.amount}>£{job.price.toFixed(2)}</ThemedText>
            
            <ThemedText style={styles.description}>
              This will create a direct debit payment request via GoCardless for the amount shown above.
            </ThemedText>
          </View>

          <View style={styles.buttonContainer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              disabled={loading}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </Pressable>
            
            <Pressable
              style={[styles.button, styles.confirmButton, loading && styles.disabledButton]}
              onPress={handleConfirmPayment}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.confirmButtonText}>Confirm Payment</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
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
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    margin: 20,
    maxWidth: 400,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  content: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    marginBottom: 8,
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
}); 