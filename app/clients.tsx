import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import PermissionGate from '../components/PermissionGate';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client as BaseClient } from '../types/client';
import type { Job, Payment } from '../types/models';
import { displayAccountNumber } from '../utils/account';

 type Client = BaseClient & { startingBalance?: number };
 type SortOption = 'address' | 'nextVisit' | 'roundOrder' | 'none' | 'balance' | 'accountNumber' | 'weeklyInterval';

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
  const [originalVisits, setOriginalVisits] = useState<Record<string, string | null>>({}); // Original dates before jobs were moved
  const [showActiveInfoModal, setShowActiveInfoModal] = useState(false);

  useEffect(() => {
    const load = async () => {
      const ownerId = await getDataOwnerId();
      const q = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
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
      return unsubscribe;
    };
    load();
  }, []);

  useEffect(() => {
    if (clients.length === 0) return;

    const fetchClientBalances = async () => {
      setLoadingBalances(true);
      try {
        const ownerId = await getDataOwnerId();
        const jobsQuery = query(collection(db, 'jobs'), where('ownerId', '==', ownerId), where('status', '==', 'completed'));
        const jobsSnapshot = await getDocs(jobsQuery);
        const allJobs = jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Job[];

        const paymentsQuery = query(collection(db, 'payments'), where('ownerId', '==', ownerId));
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

  // Fetch next scheduled visit for each client
  const fetchNextVisits = async () => {
    if (clients.length === 0) return;
    
    try {
      const ownerId = await getDataOwnerId();
      
      // Get all pending/scheduled/in_progress jobs for this data owner
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('ownerId', '==', ownerId),
        where('status', 'in', ['pending', 'scheduled', 'in_progress'])
      );
      
      const jobsSnapshot = await getDocs(jobsQuery);
      const now = new Date();
      
      // Group jobs by clientId and find the next scheduled date for each
      const clientNextVisits: Record<string, string | null> = {};
      const clientOriginalVisits: Record<string, string | null> = {};
      
      // Initialize all clients with null
      clients.forEach(client => {
        clientNextVisits[client.id] = null;
        clientOriginalVisits[client.id] = null;
      });
      
      // Process all jobs and find earliest future date for each client
      jobsSnapshot.forEach(doc => {
        const job = doc.data();
        if (job.clientId && job.scheduledTime) {
          const jobDate = new Date(job.scheduledTime);
          if (jobDate >= now) {
            const currentNext = clientNextVisits[job.clientId];
            if (!currentNext || jobDate < new Date(currentNext)) {
              clientNextVisits[job.clientId] = jobDate.toISOString();
              // Track original date if job was moved
              clientOriginalVisits[job.clientId] = job.originalScheduledTime || null;
            }
          }
        }
      });
      
      setNextVisits(clientNextVisits);
      setOriginalVisits(clientOriginalVisits);
    } catch (error) {
      console.error('Error fetching next visits:', error);
      // Set all clients to null on error
      const emptyResult: Record<string, string | null> = {};
      clients.forEach(client => {
        emptyResult[client.id] = null;
      });
      setNextVisits(emptyResult);
      setOriginalVisits(emptyResult);
    }
  };

  useEffect(() => {
    fetchNextVisits();
  }, [clients]);

  // Refresh next visits when screen gains focus (in case jobs were added/updated)
  useFocusEffect(
    useCallback(() => {
      fetchNextVisits();
    }, [clients])
  );

  useEffect(() => {
    // Ensure we have valid data before applying filters
    if (!clients || clients.length === 0) {
      setFilteredClients([]);
      return;
    }

    let filtered = [...clients]; // Create a safe copy
    
    // Apply search filter
    if (searchQuery.trim() !== '') {
      filtered = clients.filter(client => {
        const searchTerm = searchQuery.toLowerCase();
        
        // Search in name
        if (client.name && typeof client.name === 'string' && client.name.toLowerCase().includes(searchTerm)) return true;
        
        // Search in new address format
        if (client.address1 && typeof client.address1 === 'string' && client.address1.toLowerCase().includes(searchTerm)) return true;
        if (client.town && typeof client.town === 'string' && client.town.toLowerCase().includes(searchTerm)) return true;
        if (client.postcode && typeof client.postcode === 'string' && client.postcode.toLowerCase().includes(searchTerm)) return true;
        
        // Search in old address format
        if (client.address && typeof client.address === 'string' && client.address.toLowerCase().includes(searchTerm)) return true;
        
        // Search in full address string (for partial matches)
        const fullAddress = client.address1 && client.town && client.postcode 
          ? `${client.address1}, ${client.town}, ${client.postcode}`.toLowerCase()
          : (client.address && typeof client.address === 'string' ? client.address.toLowerCase() : '');
        
        if (fullAddress.includes(searchTerm)) return true;
        
        return false;
      });
    }

    // Apply sorting - ensure we have a valid sortBy value
    if (sortBy && sortBy !== 'none' && filtered.length > 0) {
      try {
        filtered = [...filtered].sort((a, b) => {
          switch (sortBy) {
            case 'address':
              // Sort by address (address1, town, postcode)
              const aAddress = [a.address1, a.town, a.postcode].filter(Boolean).join(', ') || a.address || '';
              const bAddress = [b.address1, b.town, b.postcode].filter(Boolean).join(', ') || b.address || '';
              return aAddress.localeCompare(bAddress);
            case 'accountNumber':
              // Sort account numbers from RWC1 upwards
              const aAccount = a.accountNumber || '';
              const bAccount = b.accountNumber || '';
              
              // Extract numeric part from account numbers (e.g., "RWC123" -> 123)
              const extractNumber = (account: string): number => {
                const match = account.match(/\d+/);
                return match ? parseInt(match[0], 10) : 0;
              };
              
              const aNum = extractNumber(aAccount);
              const bNum = extractNumber(bAccount);
              
              return aNum - bNum;
            case 'nextVisit':
              // Safer date parsing for sorting - use nextVisits state data
              let aDate: Date;
              let bDate: Date;
              
              try {
                const aNextVisit = nextVisits[a.id];
                aDate = aNextVisit ? parseISO(aNextVisit) : new Date(9999, 11, 31);
                if (aDate.toString() === 'Invalid Date') aDate = new Date(9999, 11, 31);
              } catch {
                aDate = new Date(9999, 11, 31);
              }
              
              try {
                const bNextVisit = nextVisits[b.id];
                bDate = bNextVisit ? parseISO(bNextVisit) : new Date(9999, 11, 31);
                if (bDate.toString() === 'Invalid Date') bDate = new Date(9999, 11, 31);
              } catch {
                bDate = new Date(9999, 11, 31);
              }
              
              return aDate.getTime() - bDate.getTime();
            case 'roundOrder':
              // Ensure we handle null/undefined/non-numeric values safely
              const aRoundOrder = typeof a.roundOrderNumber === 'number' ? a.roundOrderNumber : 999999;
              const bRoundOrder = typeof b.roundOrderNumber === 'number' ? b.roundOrderNumber : 999999;
              return aRoundOrder - bRoundOrder;
            case 'balance':
              const balanceA = clientBalances[a.id] ?? 0;
              const balanceB = clientBalances[b.id] ?? 0;
              return balanceA - balanceB; // Sorts from most debt to most credit
            case 'weeklyInterval':
              // Sort by main client frequency (weeks). Fallback to smallest active additional service interval.
              const parseFrequency = (value: unknown): number => {
                if (typeof value === 'number') return value;
                if (typeof value === 'string') {
                  const match = value.match(/\d+/);
                  if (match) return parseInt(match[0], 10);
                }
                return Number.POSITIVE_INFINITY;
              };

              const getClientInterval = (client: Client): number => {
                const primary = parseFrequency(client.frequency as unknown);
                if (primary !== Number.POSITIVE_INFINITY) return primary;
                if (Array.isArray(client.additionalServices) && client.additionalServices.length > 0) {
                  const activeFrequencies = client.additionalServices
                    .filter(s => s && (s as any).isActive !== false)
                    .map(s => parseFrequency(s.frequency));
                  const min = Math.min(...activeFrequencies);
                  return isFinite(min) ? min : Number.POSITIVE_INFINITY;
                }
                return Number.POSITIVE_INFINITY;
              };

              const aInterval = getClientInterval(a);
              const bInterval = getClientInterval(b);
              return aInterval - bInterval;
            default:
              return 0;
          }
        });
      } catch (error) {
        console.warn('Sorting error:', error);
        // If sorting fails, use the unsorted filtered list
      }
    }

    setFilteredClients(filtered);
  }, [searchQuery, clients, sortBy, clientBalances, nextVisits]);

  const handleSort = () => {
    const sortOptions: SortOption[] = ['none', 'address', 'nextVisit', 'roundOrder', 'balance', 'accountNumber', 'weeklyInterval'];
    const currentIndex = sortOptions.indexOf(sortBy);
    const nextIndex = (currentIndex + 1) % sortOptions.length;
    setSortBy(sortOptions[nextIndex]);
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case 'address': return 'Address';
      case 'accountNumber': return 'Account Number';
      case 'nextVisit': return 'Next Visit';
      case 'roundOrder': return 'Round Order';
      case 'balance': return 'Balance';
      case 'weeklyInterval': return 'Weekly Interval';
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

    const balance = clientBalances[item.id] ?? 0;

    // Safely format next visit date
    let nextVisitDisplay = 'N/A';
    const nextVisit = nextVisits[item.id];
    const originalVisit = originalVisits[item.id];
    if (nextVisit) {
      try {
        const parsedDate = parseISO(nextVisit);
        if (parsedDate && parsedDate.toString() !== 'Invalid Date') {
          // Check if job was moved (has original date that differs from current)
          if (originalVisit) {
            const parsedOriginalDate = parseISO(originalVisit);
            const originalDateStr = originalVisit.split('T')[0];
            const currentDateStr = nextVisit.split('T')[0];
            if (parsedOriginalDate && parsedOriginalDate.toString() !== 'Invalid Date' && originalDateStr !== currentDateStr) {
              // Show "(moved from...)" notation - show NEW date with original date reference
              nextVisitDisplay = `${format(parsedDate, 'd MMM yyyy')} (moved from ${format(parsedOriginalDate, 'd MMM')})`;
            } else {
              nextVisitDisplay = format(parsedDate, 'd MMMM yyyy');
            }
          } else {
            nextVisitDisplay = format(parsedDate, 'd MMMM yyyy');
          }
        }
      } catch (error) {
        nextVisitDisplay = 'N/A';
      }
    }

    return (
      <Pressable onPress={() => handleClientPress(item.id)}>
        <ThemedView style={styles.clientItem}>
          {loadingBalances ? (
            <ActivityIndicator style={styles.balanceBadge} size="small" />
          ) : (
            <View style={[
              styles.balanceBadge, 
              item.gocardlessEnabled 
                ? { backgroundColor: '#FFD700' } // Yellow for DD
                : { backgroundColor: balance < 0 ? '#ff4d4d' : '#4CAF50' } // Red/Green for balance
            ]}>
              <ThemedText style={[
                styles.balanceText,
                item.gocardlessEnabled && { color: '#000000' } // Black text for DD
              ]}>
                {item.gocardlessEnabled ? 'DD' : `£${balance.toFixed(2)}`}
              </ThemedText>
            </View>
          )}
          <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
          <ThemedText>{item.name || 'No name'}</ThemedText>
          {item.accountNumber && (
            <ThemedText style={styles.accountNumberText}>Account: {displayAccountNumber(item.accountNumber)}</ThemedText>
          )}
          {item.quote && typeof item.quote === 'number' && (
            <ThemedText>£{item.quote.toFixed(2)}</ThemedText>
          )}
          {item.frequency && (typeof item.frequency === 'string' || typeof item.frequency === 'number') && (
            <ThemedText>Every {String(item.frequency)} weeks</ThemedText>
          )}
          <ThemedText>Next Visit: {nextVisitDisplay}</ThemedText>
          {typeof item.roundOrderNumber === 'number' && item.roundOrderNumber > 0 && (
            <ThemedText>Round Order: {item.roundOrderNumber}</ThemedText>
          )}
        </ThemedView>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  // Calculate active clients (those with future service dates)
  const activeClientsCount = clients.filter(client => {
    const nextVisit = nextVisits[client.id];
    if (!nextVisit || nextVisit === 'N/A') return false;
    
    try {
      const visitDate = new Date(nextVisit);
      const now = new Date();
      return visitDate >= now;
    } catch {
      return false;
    }
  }).length;

  return (
    <PermissionGate perm="viewClients" fallback={<ThemedView style={styles.container}><ThemedText>You don't have permission to view clients.</ThemedText></ThemedView>}>
      <ThemedView style={styles.container}>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>Clients</ThemedText>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
            <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
          </Pressable>
        </View>
        <ThemedView style={styles.headerRow}>
          <View>
            <ThemedText style={styles.clientCount}>Total: {clients?.length || 0} clients</ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ThemedText style={[styles.clientCount, { marginTop: 4 }]}>Active: {activeClientsCount} clients</ThemedText>
              <Pressable onPress={() => setShowActiveInfoModal(true)} style={{ marginLeft: 8, marginTop: 4 }}>
                <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
              </Pressable>
            </View>
          </View>
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
          keyExtractor={(item, index) => item?.id ? String(item.id) : `client-${index}`}
          key={`clients-${sortBy}-${searchQuery}`}
          style={styles.list}
          ListEmptyComponent={
            <ThemedText style={styles.emptyText}>
              {searchQuery ? 'No clients found matching your search.' : 'No clients found.'}
            </ThemedText>
          }
        />
        
        {/* Info Modal for Active Clients */}
        <Modal
          visible={showActiveInfoModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowActiveInfoModal(false)}
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => setShowActiveInfoModal(false)}
          >
            <View style={styles.modalContent}>
              <ThemedText style={styles.modalTitle}>Active Clients</ThemedText>
              <ThemedText style={styles.modalText}>
                This shows the count of clients who have future services scheduled.
              </ThemedText>
              <ThemedText style={[styles.modalText, { marginTop: 10 }]}>
                Clients without upcoming jobs are not included in this count.
              </ThemedText>
              <Pressable 
                style={styles.modalButton} 
                onPress={() => setShowActiveInfoModal(false)}
              >
                <ThemedText style={styles.modalButtonText}>Got it</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </ThemedView>
    </PermissionGate>
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
  accountNumberText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    margin: 20,
    maxWidth: 400,
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginTop: 20,
    alignSelf: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
