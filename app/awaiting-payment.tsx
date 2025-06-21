import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';
import type { Job } from './types/models';

export default function AwaitingPaymentScreen() {
  const [loading, setLoading] = useState(true);
  const [accountedJobs, setAccountedJobs] = useState<(Job & { client: Client | null })[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      
      const jobsRef = collection(db, 'jobs');
      const accountedJobsQuery = query(jobsRef, where('status', '==', 'accounted'));
      
      const unsubscribe = onSnapshot(accountedJobsQuery, async (querySnapshot) => {
        const jobsData: (Job & { client: Client | null })[] = [];
        
        const clientIds = [...new Set(querySnapshot.docs.map(doc => doc.data().clientId))];
        
        if (clientIds.length === 0) {
          setAccountedJobs([]);
          setLoading(false);
          return;
        }
        
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
        
        querySnapshot.forEach((doc) => {
          const jobData = { id: doc.id, ...doc.data() } as Job;
          const client = clientsMap.get(jobData.clientId) || null;
          jobsData.push({ ...jobData, client });
        });
        
        jobsData.sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime());
        
        setAccountedJobs(jobsData);
        setLoading(false);
      });
      
      return unsubscribe;
    };
    
    fetchJobs();
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
              const params: any = {
                clientId: client.id,
                amount: item.price.toString(),
                jobId: item.id,
              };
              
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

    const isOneOffJob = ['Gutter cleaning', 'Conservatory roof', 'Soffit and fascias', 'Other'].includes(item.serviceId);

    let recurringJobLabel = '';
    if (!isOneOffJob && client?.frequency) {
        switch(client.frequency) {
            case '4': recurringJobLabel = '4 Weekly Window Clean'; break;
            case '8': recurringJobLabel = '8 Weekly Window Clean'; break;
            case 'one-off': recurringJobLabel = 'One-off Window Clean'; break;
        }
    }

    return (
      <Pressable onPress={handleJobPress}>
        <View style={[styles.jobItem, isOneOffJob && styles.oneOffJobItem]}>
          {isOneOffJob && (
            <View style={styles.oneOffJobLabel}>
              <ThemedText style={styles.oneOffJobText}>{item.serviceId}</ThemedText>
            </View>
          )}
          {recurringJobLabel ? (
            <View style={styles.recurringJobLabel}>
              <ThemedText style={styles.recurringJobText}>{recurringJobLabel}</ThemedText>
            </View>
          ) : null}
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

  const calculateJobsTotal = () => {
    return accountedJobs.reduce((sum, job) => sum + job.price, 0);
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
      <ThemedText type="title" style={styles.title}>Awaiting Payment</ThemedText>
      <ThemedText style={styles.sectionSubtitle}>
        Total: £{calculateJobsTotal().toFixed(2)} ({accountedJobs.length} jobs)
      </ThemedText>
      <FlatList
        data={accountedJobs}
        renderItem={renderJob}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingTop: 10 }}
      />
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
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  jobItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  oneOffJobItem: {
    backgroundColor: '#fffbe6',
    borderColor: '#ffeaa7',
    borderWidth: 1,
  },
  oneOffJobLabel: {
    backgroundColor: '#fdcb6e',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  oneOffJobText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 12,
  },
  recurringJobLabel: {
    backgroundColor: '#e0f7fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  recurringJobText: {
    color: '#00796b',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tapHint: {
    marginTop: 8,
    fontStyle: 'italic',
    color: '#007AFF',
    textAlign: 'right',
  },
}); 