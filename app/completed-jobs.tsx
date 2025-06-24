import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';
import { deleteJob } from './services/jobService';
import type { Job } from './types/models';

export default function CompletedJobsScreen() {
  const [loading, setLoading] = useState(true);
  const [completedJobs, setCompletedJobs] = useState<(Job & { client: Client | null })[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      
      const jobsRef = collection(db, 'jobs');
      const completedJobsQuery = query(jobsRef, where('status', '==', 'completed'));
      
      const unsubscribe = onSnapshot(completedJobsQuery, async (querySnapshot) => {
        const jobsData: (Job & { client: Client | null })[] = [];
        
        const clientIds = [...new Set(querySnapshot.docs.map(doc => doc.data().clientId))];
        
        if (clientIds.length === 0) {
          setCompletedJobs([]);
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
        
        setCompletedJobs(jobsData);
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

    const isOneOffJob = ['Gutter cleaning', 'Conservatory roof', 'Soffit and fascias', 'Other'].includes(item.serviceId);

    let jobTag = '';
    if (item.serviceId === 'window-cleaning') {
      if (client?.frequency === '4') {
        jobTag = '4 Weekly Window Clean';
      } else if (client?.frequency === '8') {
        jobTag = '8 Weekly Window Clean';
      } else if (client?.frequency === 'one-off') {
        jobTag = 'One-off Window Clean';
      } else {
        jobTag = 'Window Cleaning';
      }
    } else if (item.serviceId) {
      switch (item.serviceId) {
        case 'Gutter cleaning': jobTag = 'Gutter Cleaning'; break;
        case 'Conservatory roof': jobTag = 'Conservatory Roof'; break;
        case 'Soffit and fascias': jobTag = 'Soffit and Fascias'; break;
        case 'One-off window cleaning': jobTag = 'One-off Window Clean'; break;
        case 'Other': jobTag = 'Other Service'; break;
        default: jobTag = item.serviceId;
      }
    } else {
      jobTag = 'Other Service';
    }

    const handleDelete = () => {
      Alert.alert(
        'Delete Job',
        'Are you sure you want to permanently delete this job record?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteJob(item.id);
                Alert.alert('Success', 'Job has been deleted.');
                // Note: The list will update automatically due to the onSnapshot listener
              } catch (error) {
                console.error('Error deleting job:', error);
                Alert.alert('Error', 'Could not delete job.');
              }
            },
          },
        ]
      );
    };

    const handleCreatePayment = () => {
      if (!client) {
        Alert.alert('Error', 'Client information not available.');
        return;
      }

      const address = client.address1 && client.town && client.postcode 
        ? `${client.address1}, ${client.town}, ${client.postcode}`
        : client.address || '';

      router.push({
        pathname: '/add-payment',
        params: {
          jobId: item.id,
          clientId: item.clientId,
          amount: item.price,
          clientName: client.name,
          address: address,
          accountNumber: client.accountNumber || '',
        },
      });
    };

    return (
      <Pressable style={[styles.jobItem, isOneOffJob && styles.oneOffJobItem]} onPress={handleCreatePayment}>
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <ThemedText style={styles.deleteButtonText}>×</ThemedText>
        </Pressable>
        {isOneOffJob && (
          <View style={styles.oneOffJobLabel}>
            <ThemedText style={styles.oneOffJobText}>{item.serviceId}</ThemedText>
          </View>
        )}
        {jobTag ? (
          <View style={styles.recurringJobLabel}>
            <ThemedText style={styles.recurringJobText}>{jobTag}</ThemedText>
          </View>
        ) : null}
        <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
        <ThemedText>{client?.name || 'Unknown client'}</ThemedText>
        <ThemedText>£{item.price.toFixed(2)}</ThemedText>
        <ThemedText>
          Completed: {format(parseISO(item.scheduledTime), 'd MMMM yyyy')}
        </ThemedText>
      </Pressable>
    );
  };

  const calculateJobsTotal = () => {
    return completedJobs.reduce((sum, job) => sum + job.price, 0);
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
      <View style={styles.titleRow}>
        <ThemedText type="title" style={styles.title}>Completed Jobs</ThemedText>
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
        </Pressable>
      </View>
      <ThemedText style={styles.sectionSubtitle}>
        Total: £{calculateJobsTotal().toFixed(2)} ({completedJobs.length} jobs)
      </ThemedText>
      <ThemedText style={styles.tapInstruction}>
        Tap any job to create a payment
      </ThemedText>
      <FlatList
        data={completedJobs}
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
    position: 'relative',
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
    color: '#006064',
    fontWeight: 'bold',
    fontSize: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  homeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 1,
  },
  deleteButtonText: {
    color: '#ff4d4d',
    fontSize: 24,
    fontWeight: 'bold',
  },
  tapInstruction: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
}); 