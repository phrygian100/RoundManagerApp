import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getCurrentUserId } from '../core/supabase';
import { updateJobStatus } from '../services/jobService';
import { deletePayment } from '../services/paymentService';
import type { Job, Payment } from '../types/models';

type SectionData = {
  title: string;
  data: (Job | Payment)[];
};

const ClientBalanceScreen = () => {
  const { clientId, clientName } = useLocalSearchParams<{ clientId: string; clientName: string }>();
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<SectionData[]>([]);
  const router = useRouter();
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [startingBalance, setStartingBalance] = useState(0);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      // Fetch client document for startingBalance
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (clientDoc.exists()) {
        const data = clientDoc.data();
        setStartingBalance(Number(data.startingBalance) || 0);
      } else {
        setStartingBalance(0);
      }

      const ownerId = await getCurrentUserId();
      // Fetch completed jobs
      const completedJobsQuery = query(
        collection(db, 'jobs'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', clientId),
        where('status', '==', 'completed')
      );
      const completedJobsSnapshot = await getDocs(completedJobsQuery);
      const completedJobs = completedJobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Job[];
      const completedTotal = completedJobs.reduce((sum, job) => sum + job.price, 0);
      setTotalCompleted(completedTotal);

      // Fetch payments
      const paymentsQuery = query(collection(db, 'payments'), where('ownerId', '==', ownerId), where('clientId', '==', clientId));
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Payment[];
      const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
      setTotalPaid(paidTotal);

      // Create sections
      const currentSections: SectionData[] = [];
      if (payments.length > 0) {
        currentSections.push({ title: 'Payment History', data: payments });
      }
      if (completedJobs.length > 0) {
        currentSections.push({ title: 'Completed Jobs', data: completedJobs });
      }
      setSections(currentSections);
    } catch (error) {
      console.error("Error fetching client balance data:", error);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renderItem = ({ item }: { item: Job | Payment }) => {
    if ('serviceId' in item) { // This is a Job
      const isCompleted = item.status === 'completed';
      
      const handleDeleteJob = () => {
        Alert.alert(
          'Delete Job',
          'Are you sure you want to permanently delete this completed job?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  // Delete the job from Firestore
                  await deleteDoc(doc(db, 'jobs', item.id));
                  fetchData(); 
                  Alert.alert('Success', 'Job deleted.');
                } catch (error) {
                  console.error('Error deleting job:', error);
                  Alert.alert('Error', 'Could not delete job.');
                }
              },
            },
          ]
        );
      };

      return (
        <View style={styles.itemContainer}>
          <Pressable style={styles.deleteButton} onPress={handleDeleteJob}>
            <ThemedText style={styles.deleteButtonText}>❌</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              if (isCompleted) {
                router.push({
                  pathname: '/add-payment',
                  params: {
                    jobId: item.id,
                    clientId: item.clientId,
                    amount: item.price,
                    clientName: clientName
                  },
                });
              }
            }}
          >
            <ThemedText>Date: {format(parseISO(item.scheduledTime), 'do MMM yyyy')}</ThemedText>
            <ThemedText>Service: {item.serviceId}</ThemedText>
            <ThemedText style={{ fontWeight: 'bold' }}>Price: £{item.price.toFixed(2)}</ThemedText>
          </Pressable>
        </View>
      );
    } else { // This is a Payment
      const handleDelete = () => {
        Alert.alert(
          'Delete Payment',
          'Are you sure you want to permanently delete this payment? If linked to a job, the job status will be reverted.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deletePayment(item.id);
                  if (item.jobId) {
                    try {
                      await updateJobStatus(item.jobId, 'completed');
                    } catch (jobError: any) {
                      if (
                        jobError.code === 'not-found' ||
                        jobError.message?.includes('No document to update')
                      ) {
                        // Job already deleted, ignore
                      } else {
                        throw jobError;
                      }
                    }
                  }
                  fetchData(); 
                  Alert.alert('Success', 'Payment deleted.');
                } catch (error) {
                  console.error('Error deleting payment:', error);
                  Alert.alert('Error', 'Could not delete payment.');
                }
              },
            },
          ]
        );
      };

      return (
        <View style={styles.itemContainer}>
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <ThemedText style={styles.deleteButtonText}>❌</ThemedText>
          </Pressable>
          <ThemedText>Date: {format(parseISO(item.date), 'do MMM yyyy')}</ThemedText>
          <ThemedText>Method: {item.method}</ThemedText>
          <ThemedText style={{ fontWeight: 'bold' }}>Amount: £{item.amount.toFixed(2)}</ThemedText>
        </View>
      );
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
  }

  const balance = totalPaid - totalCompleted + startingBalance;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.summaryContainer}>
        <ThemedText style={styles.clientName}>{clientName}</ThemedText>
        <ThemedText style={styles.balanceText}>
          Current Balance: 
          <ThemedText style={[styles.balanceAmount, { color: balance >= 0 ? 'green' : 'red' }]}>
             £{balance.toFixed(2)}
          </ThemedText>
        </ThemedText>
        {startingBalance !== 0 && (
          <ThemedText>Starting Balance: £{startingBalance.toFixed(2)}</ThemedText>
        )}
        <ThemedText>Total Completed Jobs: £{totalCompleted.toFixed(2)}</ThemedText>
        <ThemedText>Total Paid: £{totalPaid.toFixed(2)}</ThemedText>
        <Button title="Go Back" onPress={() => router.back()} />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={({ section: { title } }) => (
          <ThemedText style={styles.sectionHeader}>{title}</ThemedText>
        )}
      />
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  clientName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  balanceText: {
    fontSize: 18,
    marginBottom: 8,
  },
  balanceAmount: {
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 12,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: '#eee',
    paddingTop: 16,
    backgroundColor: 'white',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  deleteButtonText: {
    color: '#ff4d4d',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemContainer: {
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});

export default ClientBalanceScreen; 