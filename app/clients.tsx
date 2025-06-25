import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client as BaseClient } from '../types/client';
import type { Job, Payment } from '../types/models';

type Client = BaseClient & { startingBalance?: number };
type SortOption = 'name' | 'nextVisit' | 'roundOrder' | 'none' | 'balance';

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('none');
  const [loading, setLoading] = useState(true);
  const [clientBalances, setClientBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [nextVisits, setNextVisits] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'clients'), (querySnapshot) => {
      const clientsData: Client[] = [];
      querySnapshot.forEach((doc) => {
        const client = { id: doc.id, ...doc.data() } as Client;
        if (client.status !== 'ex-client') {
          clientsData.push(client);
        }
      });
      setClients(clientsData);
      setFilteredClients(clientsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (clients.length === 0) return;

    const fetchClientBalances = async () => {
      setLoadingBalances(true);
      try {
        // Fetch all relevant jobs and payments in optimized queries
        const jobsQuery = query(collection(db, 'jobs'), where('status', '==', 'completed'));
        const jobsSnapshot = await getDocs(jobsQuery);
        const allJobs = jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Job[];

        const paymentsQuery = query(collection(db, 'payments'));
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const allPayments = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Payment[];
        
        const balances: Record<string, number> = {};
        clients.forEach(client => {
          const clientJobs = allJobs.filter(job => job.clientId === client.id);
          const clientPayments = allPayments.filter(payment => payment.clientId === client.id);
          
          const totalBilled = clientJobs.reduce((sum, job) => sum + job.price, 0);
          const totalPaid = clientPayments.reduce((sum, payment) => sum + payment.amount, 0);
          const startingBalance = Number(client.startingBalance) || 0;
          balances[client.id] = totalPaid - totalBilled + startingBalance;
        });

        setClientBalances(balances);
      } catch (error) {
        console.error("Error fetching client balances:", error);
      } finally {
        setLoadingBalances(false);
      }
    };

    fetchClientBalances();
  }, [clients]);

  useEffect(() => {
    if (clients.length === 0) return;

    // Fetch next scheduled visit for each client
    const fetchNextVisits = async () => {
      const result: Record<string, string | null> = {};
      for (const client of clients) {
        try {
          const jobsQuery = query(
            collection(db, 'jobs'),
            where('clientId', '==', client.id),
            where('status', 'in', ['pending', 'scheduled', 'in_progress'])
          );
          const jobsSnapshot = await getDocs(jobsQuery);
          const now = new Date();
          let nextJobDate: Date | null = null;
          jobsSnapshot.forEach(doc => {
            const job = doc.data();
            if (job.scheduledTime) {
              const jobDate: Date = new Date(job.scheduledTime);
              if (jobDate >= now && (!nextJobDate || jobDate < nextJobDate)) {
                nextJobDate = jobDate;
              }
            }
          });
          result[client.id] = nextJobDate ? (nextJobDate as Date).toISOString() : null;
        } catch (error) {
          result[client.id] = null;
        }
      }
      setNextVisits(result);
    };

    fetchNextVisits();
  }, [clients]);

  useEffect(() => {
    let filtered = clients;
    
    // Apply search filter
    if (searchQuery.trim() !== '') {
      filtered = clients.filter(client => {
        const searchTerm = searchQuery.toLowerCase();
        
        // Search in name
        if (client.name?.toLowerCase().includes(searchTerm)) return true;
        
        // Search in new address format
        if (client.address1?.toLowerCase().includes(searchTerm)) return true;
        if (client.town?.toLowerCase().includes(searchTerm)) return true;
        if (client.postcode?.toLowerCase().includes(searchTerm)) return true;
        
        // Search in old address format
        if (client.address?.toLowerCase().includes(searchTerm)) return true;
        
        // Search in full address string (for partial matches)
        const fullAddress = client.address1 && client.town && client.postcode 
          ? `${client.address1}, ${client.town}, ${client.postcode}`.toLowerCase()
          : client.address?.toLowerCase() || '';
        
        if (fullAddress.includes(searchTerm)) return true;
        
        return false;
      });
    }

    // Apply sorting
    if (sortBy !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return (a.name || '').localeCompare(b.name || '');
          case 'nextVisit':
            const aDate = a.nextVisit ? parseISO(a.nextVisit) : new Date(9999, 11, 31);
            const bDate = b.nextVisit ? parseISO(b.nextVisit) : new Date(9999, 11, 31);
            return aDate.getTime() - bDate.getTime();
          case 'roundOrder':
            return (a.roundOrderNumber || 0) - (b.roundOrderNumber || 0);
          case 'balance':
            const balanceA = clientBalances[a.id] ?? 0;
            const balanceB = clientBalances[b.id] ?? 0;
            return balanceA - balanceB; // Sorts from most debt to most credit
          default:
            return 0;
        }
      });
    }

    setFilteredClients(filtered);
  }, [searchQuery, clients, sortBy, clientBalances]);

  const handleSort = () => {
    const sortOptions: SortOption[] = ['none', 'name', 'nextVisit', 'roundOrder', 'balance'];
    const currentIndex = sortOptions.indexOf(sortBy);
    const nextIndex = (currentIndex + 1) % sortOptions.length;
    setSortBy(sortOptions[nextIndex]);
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case 'name': return 'Name';
      case 'nextVisit': return 'Next Visit';
      case 'roundOrder': return 'Round Order';
      case 'balance': return 'Balance';
      default: return 'Sort';
    }
  };

  const handleClientPress = (clientId: string) => {
    router.push({ pathname: '/(tabs)/clients/[id]', params: { id: clientId } } as never);
  };

  const renderClient = ({ item }: { item: Client }) => {
    const addressParts = [item.address1, item.town, item.postcode].filter(Boolean);
    const displayAddress = addressParts.length > 0
      ? addressParts.join(', ')
      : item.address || 'No address';

    const balance = clientBalances[item.id];

    return (
      <Pressable onPress={() => handleClientPress(item.id)}>
        <ThemedView style={styles.clientItem}>
          {loadingBalances ? (
            <ActivityIndicator style={styles.balanceBadge} size="small" />
          ) : (
            <View style={[styles.balanceBadge, { backgroundColor: balance < 0 ? '#ff4d4d' : '#4CAF50' }]}>
              <ThemedText style={styles.balanceText}>£{balance.toFixed(2)}</ThemedText>
            </View>
          )}
          <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
          <ThemedText>{item.name}</ThemedText>
          {item.quote && (
            <ThemedText>£{item.quote.toFixed(2)}</ThemedText>
          )}
          {item.frequency && (
            <ThemedText>Every {item.frequency} weeks</ThemedText>
          )}
          <ThemedText>
            Next Visit: {nextVisits[item.id]
              ? format(parseISO(nextVisits[item.id]!), 'd MMMM yyyy')
              : 'N/A'}
          </ThemedText>
          {item.roundOrderNumber != null && (
            <ThemedText>Round Order: {String(item.roundOrderNumber)}</ThemedText>
          )}
        </ThemedView>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.titleRow}>
        <ThemedText type="title" style={styles.title}>Clients</ThemedText>
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
        </Pressable>
      </View>
      <ThemedView style={styles.headerRow}>
        <ThemedText style={styles.clientCount}>Total: {clients.length} clients</ThemedText>
        <View style={{ flexDirection: 'row' }}>
          <Pressable style={[styles.sortButton, { marginRight: 8 }]} onPress={handleSort}>
            <View style={styles.sortIcon}>
              <Ionicons name="funnel" size={20} color="#666" />
            </View>
            <ThemedText style={styles.sortText}>{getSortLabel()}</ThemedText>
          </Pressable>
          <Pressable style={styles.sortButton} onPress={() => router.push('/ex-clients')}>
            <ThemedText style={styles.sortText}>Ex-Clients</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
      <ThemedView style={styles.searchRow}>
        <ThemedView style={styles.searchContainer}>
          <View style={styles.searchIcon}>
            <Ionicons name="search" size={20} color="#666" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search clients..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </ThemedView>
      </ThemedView>
      <Pressable style={styles.button} onPress={() => router.push('/add-client')}>
        <ThemedText style={styles.buttonText}>Add Client</ThemedText>
      </Pressable>
      <FlatList
        data={filteredClients}
        renderItem={renderClient}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText}>
            {searchQuery ? 'No clients found matching your search.' : 'No clients found.'}
          </ThemedText>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  title: { paddingHorizontal: 16, marginBottom: 16 },
  list: { flex: 1, paddingHorizontal: 16 },
  clientItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    position: 'relative',
  },
  button: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 50 },
  clientCount: {
    paddingHorizontal: 16,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sortIcon: {
    marginRight: 4,
  },
  sortText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
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
  balanceBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 1,
  },
  balanceText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
