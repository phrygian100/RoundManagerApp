import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';
import type { Job } from './types/models';

export default function AccountsScreen() {
  const [loading, setLoading] = useState(true);
  const [accountedJobs, setAccountedJobs] = useState<(Job & { client: Client | null })[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchAccountedJobs = async () => {
      setLoading(true);
      
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
        setLoading(false);
      });
      
      return unsubscribe;
    };
    
    fetchAccountedJobs();
  }, []);

  const renderJob = ({ item }: { item: Job & { client: Client | null } }) => {
    const client = item.client;
    const displayAddress = client?.address1 && client?.town && client?.postcode 
      ? `${client.address1}, ${client.town}, ${client.postcode}`
      : client?.address || 'No address';

    return (
      <View style={styles.jobItem}>
        <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
        <ThemedText>{client?.name || 'Unknown client'}</ThemedText>
        <ThemedText>£{item.price.toFixed(2)}</ThemedText>
        <ThemedText>
          Completed: {format(parseISO(item.scheduledTime), 'd MMMM yyyy')}
        </ThemedText>
      </View>
    );
  };

  const calculateTotal = () => {
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
      <ThemedText type="title" style={styles.title}>Accounts</ThemedText>
      <ThemedText style={styles.subtitle}>
        Total: £{calculateTotal().toFixed(2)} ({accountedJobs.length} jobs)
      </ThemedText>
      <Button title="Home" onPress={() => router.replace('/')} />
      <FlatList
        data={accountedJobs}
        renderItem={renderJob}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText}>No completed jobs in accounts yet.</ThemedText>
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
    marginBottom: 8 
  },
  subtitle: { 
    fontSize: 18, 
    marginBottom: 24,
    color: '#666'
  },
  list: { 
    flex: 1 
  },
  jobItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyText: { 
    textAlign: 'center', 
    marginTop: 50,
    color: '#666'
  },
}); 