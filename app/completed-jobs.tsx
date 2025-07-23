import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { deleteJob } from '../services/jobService';
import type { Client } from '../types/client';
import type { Job } from '../types/models';
import { getJobAccountDisplay } from '../utils/jobDisplay';

// Mobile browser detection for better touch targets
const isMobileBrowser = () => {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
    (window.innerWidth <= 768);
};

export default function CompletedJobsScreen() {
  const [loading, setLoading] = useState(true);
  const [completedJobs, setCompletedJobs] = useState<(Job & { client: Client | null })[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<(Job & { client: Client | null })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      
      const jobsRef = collection(db, 'jobs');
      const ownerId = await getDataOwnerId();
      const completedJobsQuery = query(jobsRef, where('ownerId', '==', ownerId), where('status', '==', 'completed'));
      
      const unsubscribe = onSnapshot(completedJobsQuery, async (querySnapshot) => {
        const jobsData: (Job & { client: Client | null })[] = [];
        
        const clientIds = [...new Set(querySnapshot.docs.map(doc => doc.data().clientId))];
        
        if (clientIds.length === 0) {
          setCompletedJobs([]);
          setFilteredJobs([]);
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
        setFilteredJobs(jobsData);
        setLoading(false);
      });
      
      return unsubscribe;
    };
    
    fetchJobs();
  }, []);

  // Filter jobs based on search query
  useEffect(() => {
    if (!completedJobs || completedJobs.length === 0) {
      setFilteredJobs([]);
      return;
    }

    if (searchQuery.trim() === '') {
      setFilteredJobs(completedJobs);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = completedJobs.filter(job => {
      const client = job.client;
      
      // Search by client name
      if (client?.name?.toLowerCase().includes(query)) return true;
      
      // Search by address
      if (client?.address1?.toLowerCase().includes(query)) return true;
      if (client?.town?.toLowerCase().includes(query)) return true;
      if (client?.postcode?.toLowerCase().includes(query)) return true;
      if (client?.address?.toLowerCase().includes(query)) return true;
      
      // Search by full address string
      const fullAddress = client?.address1 && client?.town && client?.postcode 
        ? `${client.address1}, ${client.town}, ${client.postcode}`.toLowerCase()
        : (client?.address?.toLowerCase() || '');
      if (fullAddress.includes(query)) return true;
      
      // Search by date
      if (job.scheduledTime.includes(query)) return true;
      
      return false;
    });

    setFilteredJobs(filtered);
  }, [searchQuery, completedJobs]);

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
          from: '/completed-jobs'
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
        {client?.accountNumber && (
          <View style={styles.accountNumberContainer}>
            {(() => {
              const accountDisplay = getJobAccountDisplay(item, client);
              if (accountDisplay.isGoCardless && accountDisplay.style) {
                return (
                  <View style={[styles.ddBadge, { backgroundColor: accountDisplay.style.backgroundColor }]}>
                    <ThemedText style={[styles.ddText, { color: accountDisplay.style.color }]}>
                      {accountDisplay.text}
                    </ThemedText>
                  </View>
                );
              } else {
                return (
                  <ThemedText style={styles.accountNumberText}>{accountDisplay.text}</ThemedText>
                );
              }
            })()}
          </View>
        )}
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
        Total: £{calculateJobsTotal().toFixed(2)} ({filteredJobs.length} jobs)
      </ThemedText>
      <ThemedText style={styles.tapInstruction}>
        Tap any job to create a payment
      </ThemedText>
      
      {/* Search Input */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <View style={styles.searchIcon}>
            <ThemedText style={styles.searchIconText}>🔍</ThemedText>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, address, or date..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
            // Mobile-specific props
            {...(Platform.OS === 'web' && isMobileBrowser() && {
              autoComplete: 'off',
              autoCorrect: false,
              spellCheck: false,
            })}
            // Platform-specific keyboard handling
            {...(Platform.OS !== 'web' && {
              returnKeyType: 'search',
            })}
          />
        </View>
      </View>
      
      <FlatList
        data={filteredJobs}
        renderItem={renderJob}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingTop: 10 }}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText}>
            {searchQuery ? 'No jobs found matching your search.' : 'No completed jobs found.'}
          </ThemedText>
        }
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
  searchRow: {
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
    // Mobile-specific padding for better touch targets
    paddingVertical: Platform.OS === 'web' && isMobileBrowser() ? 16 : 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchIconText: {
    fontSize: 16,
    color: '#666',
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'web' && isMobileBrowser() ? 16 : 12,
    fontSize: Platform.OS === 'web' && isMobileBrowser() ? 18 : 16,
    color: '#333',
    // Mobile-specific improvements
    ...(Platform.OS === 'web' && isMobileBrowser() && {
      minHeight: 44, // Minimum touch target
    }),
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    marginTop: 40,
  },
  accountNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  accountNumberText: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },
  ddBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  ddText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
}); 