import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { updateJobStatus } from '../services/jobService';
import { deletePayment, getAllPayments } from '../services/paymentService';
import type { Client } from '../types/client';
import type { Payment } from '../types/models';

// Mobile browser detection for better touch targets
const isMobileBrowser = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
    (window.innerWidth <= 768);
};

export default function PaymentsListScreen() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<(Payment & { client: Client | null })[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<(Payment & { client: Client | null })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Filters and sorting
  const [methodFilters, setMethodFilters] = useState<{ cash: boolean; direct_debit: boolean; bank_transfer: boolean }>({
    cash: false,
    direct_debit: false,
    bank_transfer: false,
  });
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const router = useRouter();

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      try {
        const paymentsData = await getAllPayments();
        const paymentClientIds = [...new Set(paymentsData.map(payment => payment.clientId))];
        
        if (paymentClientIds.length === 0) {
          setPayments([]);
          setFilteredPayments([]);
          setLoading(false);
          return;
        }

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
        
        const paymentsWithClients = paymentsData.map(payment => ({
          ...payment,
          client: paymentClientsMap.get(payment.clientId) || null,
        }));
        
        paymentsWithClients.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setPayments(paymentsWithClients);
        setFilteredPayments(paymentsWithClients);
      } catch (error) {
        console.error('Error fetching payments:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPayments();
  }, []);

  // Filter and sort payments based on search query and filters
  useEffect(() => {
    if (!payments || payments.length === 0) {
      setFilteredPayments([]);
      return;
    }

    const query = searchQuery.trim().toLowerCase();
    const anyFilterSelected = methodFilters.cash || methodFilters.direct_debit || methodFilters.bank_transfer;

    const filtered = payments.filter(payment => {
      const client = payment.client;
      // Method filters
      if (anyFilterSelected) {
        const method = payment.method;
        const passesMethod =
          (methodFilters.cash && method === 'cash') ||
          (methodFilters.direct_debit && method === 'direct_debit') ||
          (methodFilters.bank_transfer && method === 'bank_transfer');
        if (!passesMethod) return false;
      }

      if (query === '') return true;

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
      if (payment.date.includes(query)) return true;
      
      return false;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.date).getTime() - new Date(a.date).getTime(); // Desc by date
      }
      // amount
      return b.amount - a.amount; // Desc by amount
    });

    setFilteredPayments(sorted);
  }, [searchQuery, payments, methodFilters, sortBy]);

  const toggleMethodFilter = (key: 'cash' | 'direct_debit' | 'bank_transfer') => {
    setMethodFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderPayment = ({ item }: { item: Payment & { client: Client | null } }) => {
    const client = item.client;
    const displayAddress = client?.address1 && client?.town && client?.postcode 
      ? `${client.address1}, ${client.town}, ${client.postcode}`
      : client?.address || 'No address';

    const handleDelete = () => {
      if (Platform.OS === 'web') {
        if (!window.confirm('Are you sure you want to permanently delete this payment? If it is linked to a job, the job will be marked as awaiting payment again.')) {
          return;
        }
        // Delete the payment record
        deletePayment(item.id).then(async () => {
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
          Alert.alert('Success', 'Payment has been deleted.');
          // Manually refresh the list data after deletion
          const updatedPayments = payments.filter(p => p.id !== item.id);
          setPayments(updatedPayments);
        }).catch(error => {
          console.error('Error deleting payment:', error);
          Alert.alert('Error', 'Could not delete payment.');
        });
        return;
      }
      Alert.alert(
        'Delete Payment',
        'Are you sure you want to permanently delete this payment? If it is linked to a job, the job will be marked as awaiting payment again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete the payment record
                await deletePayment(item.id);

                // If a job is linked, revert its status to 'completed'
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

                Alert.alert('Success', 'Payment has been deleted.');
                // Manually refresh the list data after deletion
                const updatedPayments = payments.filter(p => p.id !== item.id);
                setPayments(updatedPayments);
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
      <View style={styles.paymentItem}>
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <ThemedText style={styles.deleteButtonText}>×</ThemedText>
        </Pressable>
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
      <View style={styles.titleRow}>
        <ThemedText type="title" style={styles.title}>Payments</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable style={styles.addButton} onPress={() => router.push({ pathname: '/add-payment', params: { from: '/payments-list' } })}>
            <ThemedText style={styles.addButtonText}>+ Add Payment</ThemedText>
          </Pressable>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/')}> 
            <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
          </Pressable>
        </View>
      </View>
      <ThemedText style={styles.sectionSubtitle}>
        Total: £{calculatePaymentsTotal().toFixed(2)} ({filteredPayments.length} payments)
      </ThemedText>
      
      {/* Search, Filters, Sort */}
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

        {/* Method Filters */}
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, methodFilters.cash && styles.filterChipActive]}
            onPress={() => toggleMethodFilter('cash')}
          >
            <ThemedText style={[styles.filterChipText, methodFilters.cash && styles.filterChipTextActive]}>Cash</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.filterChip, methodFilters.direct_debit && styles.filterChipActive]}
            onPress={() => toggleMethodFilter('direct_debit')}
          >
            <ThemedText style={[styles.filterChipText, methodFilters.direct_debit && styles.filterChipTextActive]}>Direct Debit</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.filterChip, methodFilters.bank_transfer && styles.filterChipActive]}
            onPress={() => toggleMethodFilter('bank_transfer')}
          >
            <ThemedText style={[styles.filterChipText, methodFilters.bank_transfer && styles.filterChipTextActive]}>BACS</ThemedText>
          </Pressable>
        </View>

        {/* Sort Controls */}
        <View style={styles.sortRow}>
          <ThemedText style={styles.sortLabel}>Sort by:</ThemedText>
          <Pressable
            style={[styles.sortChip, sortBy === 'date' && styles.sortChipActive]}
            onPress={() => setSortBy('date')}
          >
            <ThemedText style={[styles.sortChipText, sortBy === 'date' && styles.sortChipTextActive]}>Date</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.sortChip, sortBy === 'amount' && styles.sortChipActive]}
            onPress={() => setSortBy('amount')}
          >
            <ThemedText style={[styles.sortChipText, sortBy === 'amount' && styles.sortChipTextActive]}>Amount</ThemedText>
          </Pressable>
        </View>
      </View>
      
      <FlatList
        data={filteredPayments}
        renderItem={renderPayment}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingTop: 10 }}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText}>
            {searchQuery ? 'No payments found matching your search.' : 'No payments found.'}
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
  paymentItem: {
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
  paymentMethod: {
    marginTop: 8,
    fontWeight: 'bold',
    color: '#333',
  },
  reference: {
    marginTop: 4,
    fontStyle: 'italic',
    color: '#555',
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
  notes: {
    marginTop: 4,
    color: '#777',
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
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  searchRow: {
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  filterChipActive: {
    backgroundColor: '#007AFF15',
    borderColor: '#007AFF',
  },
  filterChipText: {
    color: '#333',
    fontSize: 14,
  },
  filterChipTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  sortLabel: {
    color: '#666',
  },
  sortChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  sortChipActive: {
    backgroundColor: '#007AFF15',
    borderColor: '#007AFF',
  },
  sortChipText: {
    color: '#333',
    fontSize: 14,
  },
  sortChipTextActive: {
    color: '#007AFF',
    fontWeight: '600',
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
}); 