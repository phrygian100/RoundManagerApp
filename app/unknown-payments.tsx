import { useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import PermissionGate from '../components/PermissionGate';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

type UnknownPayment = {
  id: string;
  ownerId?: string;
  amount: number;
  date: string;
  method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other';
  notes?: string;
  // Import metadata
  importDate: string;
  importFilename: string;
  csvRowNumber: number;
  originalAccountIdentifier: string;
  createdAt: string;
  updatedAt: string;
};

export default function UnknownPaymentsScreen() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<UnknownPayment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<UnknownPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchUnknownPayments = async () => {
      setLoading(true);
      const ownerId = await getDataOwnerId();
      
      const paymentsRef = collection(db, 'unknownPayments');
      const paymentsQuery = query(
        paymentsRef, 
        where('ownerId', '==', ownerId),
        orderBy('date', 'desc')
      );
      
      const unsubscribe = onSnapshot(paymentsQuery, (querySnapshot) => {
        const fetchedPayments: UnknownPayment[] = [];
        querySnapshot.forEach((doc) => {
          fetchedPayments.push({
            id: doc.id,
            ...doc.data()
          } as UnknownPayment);
        });
        setPayments(fetchedPayments);
        setFilteredPayments(fetchedPayments);
        setLoading(false);
      });

      return () => unsubscribe();
    };
    
    fetchUnknownPayments();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPayments(payments);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = payments.filter(payment => {
        return (
          payment.originalAccountIdentifier.toLowerCase().includes(query) ||
          payment.amount.toString().includes(query) ||
          payment.date.includes(query) ||
          (payment.notes && payment.notes.toLowerCase().includes(query))
        );
      });
      setFilteredPayments(filtered);
    }
  }, [searchQuery, payments]);

  const renderPayment = ({ item }: { item: UnknownPayment }) => {
    const formattedDate = new Date(item.date).toLocaleDateString('en-GB');
    const importedDate = new Date(item.importDate).toLocaleDateString('en-GB');
    
    return (
      <View style={styles.paymentItem}>
        <View style={styles.paymentHeader}>
          <ThemedText style={styles.accountIdentifier}>{item.originalAccountIdentifier}</ThemedText>
          <ThemedText style={styles.amount}>£{item.amount.toFixed(2)}</ThemedText>
        </View>
        <ThemedText style={styles.date}>Payment Date: {formattedDate}</ThemedText>
        <ThemedText style={styles.method}>Method: {item.method}</ThemedText>
        {item.notes && <ThemedText style={styles.notes}>Notes: {item.notes}</ThemedText>}
        <View style={styles.metadata}>
          <ThemedText style={styles.metadataText}>
            Imported from {item.importFilename} (row {item.csvRowNumber}) on {importedDate}
          </ThemedText>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <PermissionGate perm="viewPayments" fallback={<ThemedView style={styles.container}><ThemedText>You don't have permission to view payments.</ThemedText></ThemedView>}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ThemedText type="title" style={styles.title}>Unknown Payments</ThemedText>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <ThemedText style={styles.backButtonText}>Back</ThemedText>
            </Pressable>
          </View>
          <ThemedText style={styles.subtitle}>
            Payments that couldn't be matched to existing accounts during import
          </ThemedText>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search by account, amount, date, or notes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {filteredPayments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              {searchQuery ? 'No payments found matching your search' : 'No unknown payments'}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={filteredPayments}
            renderItem={renderPayment}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}
      </ThemedView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  backButton: {
    padding: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: 'white',
  },
  listContent: {
    paddingBottom: 24,
  },
  paymentItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  accountIdentifier: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6b6b', // Red to indicate unknown
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  date: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  method: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  notes: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  metadata: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
    marginTop: 8,
  },
  metadataText: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
}); 