import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';
import { getAllPayments } from './services/paymentService';
import type { Job, Payment } from './types/models';

export default function AccountsScreen() {
  const [loading, setLoading] = useState(true);
  const [accountedJobs, setAccountedJobs] = useState<(Job & { client: Client | null })[]>([]);
  const [payments, setPayments] = useState<(Payment & { client: Client | null })[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        // Fetch all accounted jobs
        const jobsRef = collection(db, 'jobs');
        const accountedJobsQuery = query(jobsRef, where('status', '==', 'accounted'));
        
        const unsubscribe = onSnapshot(accountedJobsQuery, async (querySnapshot) => {
          const jobsData: (Job & { client: Client | null })[] = [];
          
          // Get all client IDs from the jobs
          const clientIds = [...new Set(querySnapshot.docs.map(doc => doc.data().clientId))];
          
          // Fetch all clients in batches
          const clientChunks = [];
          for (let i = 0; i < clientIds.length; i += 30) {
            clientChunks.push(clientIds.slice(i, i + 30));
          }
          
          const clientsMap = new Map<string, Client>();
          const clientPromises = clientChunks.map(chunk => 
            getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
          );
          const clientSnapshots = await Promise.all(clientPromises);
          
          clientSnapshots.forEach((snapshot: any) => {
            snapshot.forEach((docSnap: any) => {
              clientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
            });
          });
          
          // Map jobs with their clients
          querySnapshot.forEach((doc) => {
            const jobData = { id: doc.id, ...doc.data() } as Job;
            const client = clientsMap.get(jobData.clientId) || null;
            jobsData.push({ ...jobData, client });
          });
          
          // Sort by scheduled time (most recent first)
          jobsData.sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime());
          
          setAccountedJobs(jobsData);
        });

        // Fetch all payments
        const paymentsData = await getAllPayments();
        
        // Get client IDs from payments
        const paymentClientIds = [...new Set(paymentsData.map(payment => payment.clientId))];
        
        // Fetch clients for payments
        const paymentClientChunks = [];
        for (let i = 0; i < paymentClientIds.length; i += 30) {
          paymentClientChunks.push(paymentClientIds.slice(i, i + 30));
        }
        
        const paymentClientsMap = new Map<string, Client>();
        const paymentClientPromises = paymentClientChunks.map(chunk => 
          getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
        );
        const paymentClientSnapshots = await Promise.all(paymentClientPromises);
        
        paymentClientSnapshots.forEach((snapshot: any) => {
          snapshot.forEach((docSnap: any) => {
            paymentClientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
          });
        });
        
        // Map payments with their clients
        const paymentsWithClients = paymentsData.map(payment => ({
          ...payment,
          client: paymentClientsMap.get(payment.clientId) || null,
        }));
        
        // Sort by date (most recent first)
        paymentsWithClients.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setPayments(paymentsWithClients);
        setLoading(false);
        
        return unsubscribe;
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const renderJob = ({ item }: { item: Job & { client: Client | null } }) => {
    const client = item.client;
    const displayAddress = client?.address1 && client?.town && client?.postcode 
      ? `${client.address1}, ${client.town}, ${client.postcode}`
      : client?.address || 'No address';

    const handleJobPress = () => {
      if (!client) {
        Alert.alert('Error', 'Client information not available');
        return;
      }
      
      Alert.alert(
        'Mark as Paid',
        `Would you like to mark this job as paid?\n\nClient: ${client.name}\nAmount: £${item.price.toFixed(2)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Yes, Create Payment', 
            onPress: () => {
              // Navigate to add payment with pre-filled data
              const params: any = {
                clientId: client.id,
                amount: item.price.toString(),
                jobId: item.id,
              };
              
              // Only include reference if client has an account number
              if (client.accountNumber) {
                params.reference = client.accountNumber;
              }
              
              router.push({
                pathname: '/add-payment',
                params
              } as never);
            }
          }
        ]
      );
    };

    return (
      <Pressable onPress={handleJobPress}>
        <View style={styles.jobItem}>
          <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
          <ThemedText>{client?.name || 'Unknown client'}</ThemedText>
          <ThemedText>£{item.price.toFixed(2)}</ThemedText>
          <ThemedText>
            Completed: {format(parseISO(item.scheduledTime), 'd MMMM yyyy')}
          </ThemedText>
          <ThemedText style={styles.tapHint}>Tap to mark as paid</ThemedText>
        </View>
      </Pressable>
    );
  };

  const renderPayment = ({ item }: { item: Payment & { client: Client | null } }) => {
    const client = item.client;
    const displayAddress = client?.address1 && client?.town && client?.postcode 
      ? `${client.address1}, ${client.town}, ${client.postcode}`
      : client?.address || 'No address';

    return (
      <View style={styles.paymentItem}>
        <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
        <ThemedText>{client?.name || 'Unknown client'}</ThemedText>
        <ThemedText>£{item.amount.toFixed(2)}</ThemedText>
        <ThemedText style={styles.paymentMethod}>{item.method.replace('_', ' ').toUpperCase()}</ThemedText>
        <ThemedText>
          Date: {format(parseISO(item.date), 'd MMMM yyyy')}
        </ThemedText>
        {item.reference && (
          <ThemedText style={styles.reference}>Ref: {item.reference}</ThemedText>
        )}
        {item.notes && (
          <ThemedText style={styles.notes}>{item.notes}</ThemedText>
        )}
      </View>
    );
  };

  const calculateJobsTotal = () => {
    return accountedJobs.reduce((sum, job) => sum + job.price, 0);
  };

  const calculatePaymentsTotal = () => {
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Accounts</ThemedText>
      
      <FlatList
        data={[
          { type: 'jobs', data: accountedJobs },
          { type: 'payments', data: payments }
        ]}
        renderItem={({ item }) => {
          if (item.type === 'jobs') {
            return (
              <View style={styles.section}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                  Completed Jobs
                </ThemedText>
                <ThemedText style={styles.sectionSubtitle}>
                  Total: £{calculateJobsTotal().toFixed(2)} ({accountedJobs.length} jobs)
                </ThemedText>
                {item.data.length > 0 ? (
                  (item.data as (Job & { client: Client | null })[]).map((job: Job & { client: Client | null }) => (
                    <View key={`job-${job.id}`}>
                      {renderJob({ item: job })}
                    </View>
                  ))
                ) : (
                  <ThemedText style={styles.emptyText}>No completed jobs yet.</ThemedText>
                )}
              </View>
            );
          } else {
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View>
                    <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                      Payments
                    </ThemedText>
                    <ThemedText style={styles.sectionSubtitle}>
                      Total: £{calculatePaymentsTotal().toFixed(2)} ({payments.length} payments)
                    </ThemedText>
                  </View>
                  <Pressable 
                    style={styles.addButton} 
                    onPress={() => router.push('/add-payment')}
                  >
                    <ThemedText style={styles.addButtonText}>Add Payment</ThemedText>
                  </Pressable>
                </View>
                {item.data.length > 0 ? (
                  (item.data as (Payment & { client: Client | null })[]).map((payment: Payment & { client: Client | null }) => (
                    <View key={`payment-${payment.id}`}>
                      {renderPayment({ item: payment })}
                    </View>
                  ))
                ) : (
                  <ThemedText style={styles.emptyText}>No payments recorded yet.</ThemedText>
                )}
              </View>
            );
          }
        }}
        keyExtractor={(item, index) => `${item.type}-${index}`}
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={true}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button title="Home" onPress={() => router.replace('/')} />
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 24, 
    paddingTop: 60 
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    marginBottom: 24 
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  sectionTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    marginBottom: 4 
  },
  sectionSubtitle: { 
    fontSize: 16, 
    color: '#666',
    marginBottom: 8
  },
  list: { 
    maxHeight: 300
  },
  jobItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  paymentItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#f0f8ff',
    borderWidth: 1,
    borderColor: '#b0d4f1',
  },
  paymentMethod: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#007AFF',
    textTransform: 'uppercase',
  },
  reference: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  notes: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: { 
    textAlign: 'center', 
    marginTop: 20,
    color: '#666'
  },
  tapHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  scrollContainer: {
    flex: 1,
  },
  footer: {
    padding: 24,
  },
}); 