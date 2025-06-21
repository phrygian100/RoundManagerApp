import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Button, View } from 'react-native';
import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { db } from '../../../core/firebase';
import type { Client } from '../../../types/client';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <ThemedView style={{ flex: 1, padding: 20, paddingTop: 40 }}>
      <ThemedText type="title">Client Details</ThemedText>
      <ThemedText style={{ marginTop: 20 }}>Name: {client.name}</ThemedText>
      <ThemedText>Address: {client.address1}</ThemedText>
      <ThemedText>Town: {client.town}</ThemedText>
      <ThemedText>Postcode: {client.postcode}</ThemedText>
      <ThemedText>Account Number: {client.accountNumber}</ThemedText>
      <ThemedText>Round Order Number: {client.roundOrderNumber}</ThemedText>
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
    </ThemedView>
  );
}

