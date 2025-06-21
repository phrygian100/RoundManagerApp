import { useFocusEffect } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, StyleSheet, View } from 'react-native';
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
      'Delete Client',
      'This will delete the client and all their pending/future jobs. Completed jobs will be preserved with client information. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (typeof id === 'string') {
              try {
                // 1. Delete the client
                await deleteDoc(doc(db, 'clients', id));
                
                // 2. Find and delete all pending/future jobs for this client
                const jobsRef = collection(db, 'jobs');
                const pendingJobsQuery = query(
                  jobsRef, 
                  where('clientId', '==', id),
                  where('status', 'in', ['pending', 'in-progress'])
                );
                
                const pendingJobsSnapshot = await getDocs(pendingJobsQuery);
                const batch = writeBatch(db);
                
                pendingJobsSnapshot.forEach((jobDoc) => {
                  batch.delete(jobDoc.ref);
                });
                
                await batch.commit();
                
                router.replace('/clients');
              } catch (error) {
                console.error('Error deleting client:', error);
                Alert.alert('Error', 'Failed to delete client. Please try again.');
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
      <View style={{ marginTop: 32 }}>
      <Button title="Delete Client" color="red" onPress={handleDelete} />
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
  }
});

