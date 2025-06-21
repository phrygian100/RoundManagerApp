import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';

type SortOption = 'name' | 'nextVisit' | 'roundOrder' | 'none';

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'clients'), (querySnapshot) => {
      const clientsData: Client[] = [];
      querySnapshot.forEach((doc) => {
        clientsData.push({ id: doc.id, ...doc.data() } as Client);
      });
      setClients(clientsData);
      setFilteredClients(clientsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
          default:
            return 0;
        }
      });
    }

    setFilteredClients(filtered);
  }, [searchQuery, clients, sortBy]);

  const handleSort = () => {
    const sortOptions: SortOption[] = ['none', 'name', 'nextVisit', 'roundOrder'];
    const currentIndex = sortOptions.indexOf(sortBy);
    const nextIndex = (currentIndex + 1) % sortOptions.length;
    setSortBy(sortOptions[nextIndex]);
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case 'name': return 'Name';
      case 'nextVisit': return 'Next Visit';
      case 'roundOrder': return 'Round Order';
      default: return 'Sort';
    }
  };

  const handleClientPress = (clientId: string) => {
    router.push({ pathname: '/(tabs)/clients/[id]', params: { id: clientId } } as never);
  };

  const renderClient = ({ item }: { item: Client }) => {
    // Handle both old and new address formats
    const displayAddress = item.address1 && item.town && item.postcode 
      ? `${item.address1}, ${item.town}, ${item.postcode}`
      : item.address || 'No address';

    return (
      <Pressable onPress={() => handleClientPress(item.id)}>
        <ThemedView style={styles.clientItem}>
          <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
          <ThemedText>{item.name}</ThemedText>
          {item.quote && (
            <ThemedText>£{item.quote.toFixed(2)}</ThemedText>
          )}
          {item.frequency && (
            <ThemedText>Every {item.frequency} weeks</ThemedText>
          )}
          {item.nextVisit && (
            <ThemedText>
              Next Visit: {format(parseISO(item.nextVisit), 'd MMMM yyyy')}
            </ThemedText>
          )}
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
      <ThemedText type="title" style={styles.title}>Clients</ThemedText>
      <ThemedView style={styles.headerRow}>
        <ThemedText style={styles.clientCount}>Total: {clients.length} clients</ThemedText>
        <Pressable style={styles.sortButton} onPress={handleSort}>
          <View style={styles.sortIcon}>
            <Ionicons name="funnel" size={20} color="#666" />
          </View>
          <ThemedText style={styles.sortText}>{getSortLabel()}</ThemedText>
        </Pressable>
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
      <Button title="Home" onPress={() => router.replace('/')} />
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
});
