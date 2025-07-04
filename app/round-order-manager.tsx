import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDocs, orderBy, query, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/supabase';
import { isTodayMarkedComplete } from '../services/jobService';
import type { Client } from '../types/client';

type ClientWithPosition = Client & { 
  displayPosition: number;
};

const { height: screenHeight } = Dimensions.get('window');
const ITEM_HEIGHT = 60;
const VISIBLE_ITEMS = 7;

export default function RoundOrderManagerScreen() {
  const router = useRouter();
  const { newClientData, editingClientId } = useLocalSearchParams();
  const [clients, setClients] = useState<ClientWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState(1);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const loadClients = async () => {
      try {
        setLoading(true);
        let initialPosition = 1;
        let clientsList: ClientWithPosition[] = [];
        let activeClientData: Client | null = null;
        
        const ownerId = await getDataOwnerId();
        const clientsQuery = query(
          collection(db, 'clients'),
          where('ownerId', '==', ownerId),
          orderBy('roundOrderNumber', 'asc')
        );
        let clientsSnapshot;
        try {
          clientsSnapshot = await getDocs(clientsQuery);
        } catch (err) {
          console.warn('RoundOrderManager: missing index for clients order query, falling back', err);
          const qs = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
          clientsSnapshot = qs;
        }
        
        const allClients: ClientWithPosition[] = clientsSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          displayPosition: doc.data().roundOrderNumber || 0,
        })) as ClientWithPosition[];

        // Only include active clients
        const activeClients = allClients.filter(c => c.status !== 'ex-client');
        
        if (newClientData) {
          // CREATE MODE
          activeClientData = JSON.parse(newClientData as string);
          clientsList = activeClients.map((client, index) => ({
            ...client,
            displayPosition: index + 1
          }));
          initialPosition = 1; // Default to first position
        } else if (typeof editingClientId === 'string') {
          // EDIT MODE
          const clientToEdit = activeClients.find(c => c.id === editingClientId);
          if (clientToEdit) {
            activeClientData = clientToEdit;
            // Exclude the client being edited from the list
            clientsList = activeClients
              .filter(c => c.id !== editingClientId)
              .map((client, index) => ({
                ...client,
                displayPosition: index + 1
              }));
            initialPosition = clientToEdit.roundOrderNumber;
          } else {
            // Fallback if client not found
            clientsList = activeClients.map((client, index) => ({
              ...client,
              displayPosition: index + 1
            }));
          }
        }
        
        setClients(clientsList);
        setActiveClient(activeClientData);
        setSelectedPosition(initialPosition);

        // Scroll to initial position after a short delay
        setTimeout(() => {
          if (flatListRef.current && initialPosition > 0) {
            const scrollToIndex = Math.max(0, initialPosition - 1);
            flatListRef.current.scrollToOffset({
              offset: scrollToIndex * ITEM_HEIGHT,
              animated: false
            });
          }
        }, 100);

      } catch (error) {
        console.error('Error loading clients:', error);
        Alert.alert('Error', 'Failed to load clients.');
      } finally {
        setLoading(false);
      }
    };

    loadClients();
  }, [newClientData, editingClientId]);

  const handlePositionChange = (newPosition: number) => {
    const maxPosition = clients.length + 1;
    const clampedPosition = Math.max(1, Math.min(maxPosition, newPosition));
    if (clampedPosition !== selectedPosition) {
      setSelectedPosition(clampedPosition);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      
      const ownerId = await getDataOwnerId();

      if (!activeClient) {
        Alert.alert('Error', 'No client data available.');
        return;
      }

      // First, update all existing clients' round order numbers
      const batch = writeBatch(db);
      
      // Create new client list with the new client inserted at the selected position
      const updatedClients = [...clients];
      updatedClients.splice(selectedPosition - 1, 0, { 
        ...activeClient, 
        displayPosition: selectedPosition 
      });
      
      // Update round order numbers for all clients
      updatedClients.forEach((client, index) => {
        if (client.id) {
          const clientRef = doc(db, 'clients', client.id);
          batch.update(clientRef, { roundOrderNumber: index + 1 });
        }
      });
      
      if (newClientData) {
        // If restoring a client (has id), update the existing document
        if (activeClient) {
          const { id, ...clientData } = activeClient;
          if (id) {
            // Restoring: update existing client
            const clientRef = doc(db, 'clients', id);
            batch.update(clientRef, {
              ...clientData,
              roundOrderNumber: selectedPosition,
              status: 'active',
            });
            // After batch commit, regenerate jobs for this client (from today onwards)
            const skipToday = await isTodayMarkedComplete();
            await batch.commit();
            // Regenerate jobs for this client (from today onwards)
            if (clientData.frequency !== 'one-off') {
              // Custom job generation: only for dates from today onwards
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              let visitDate = clientData.nextVisit ? new Date(clientData.nextVisit) : today;
              if (visitDate < today) {
                // Move to the next valid date
                const freq = Number(clientData.frequency);
                while (visitDate < today) {
                  visitDate.setDate(visitDate.getDate() + freq * 7);
                }
              }
              // Generate up to 8 jobs from the next valid visitDate
              const jobsToCreate = [];
              for (let i = 0; i < 8; i++) {
                const weekStr = visitDate.toISOString().split('T')[0];
                // If today is to be skipped, skip job for today
                if (!(skipToday && visitDate.getTime() === today.getTime())) {
                  jobsToCreate.push({
                    ownerId,
                    clientId: id,
                    providerId: 'test-provider-1',
                    serviceId: 'window-cleaning',
                    propertyDetails: `${clientData.address1 || clientData.address || ''}, ${clientData.town || ''}, ${clientData.postcode || ''}`,
                    scheduledTime: weekStr + 'T09:00:00',
                    status: 'pending',
                    price: typeof clientData.quote === 'number' ? clientData.quote : 25,
                    paymentStatus: 'unpaid',
                  });
                }
                visitDate.setDate(visitDate.getDate() + Number(clientData.frequency) * 7);
              }
              if (jobsToCreate.length > 0) {
                const jobsRef = collection(db, 'jobs');
                const addBatch = writeBatch(db);
                jobsToCreate.forEach(job => {
                  const newJobRef = doc(jobsRef);
                  addBatch.set(newJobRef, job);
                });
                await addBatch.commit();
              }
            }
            // After job regeneration, navigate to the restored client's detail screen
            router.push({ pathname: '/(tabs)/clients/[id]', params: { id } });
            return; // Skip the rest of the batch.commit below, already committed
          } else {
            // Truly new client: return to add-client with all data and round order
            router.push({
              pathname: '/add-client',
              params: {
                ...clientData,
                roundOrderNumber: String(selectedPosition),
              }
            });
            return;
          }
        }
      }

      await batch.commit();

      // Clear any stored round order data (from old flows)
      await AsyncStorage.removeItem('selectedRoundOrder');
      
      // Navigate back to clients list or client details
      if (editingClientId) {
        router.back();
      } else if (newClientData) {
        router.push({ pathname: '/add-client', params: { roundOrderNumber: String(selectedPosition) } });
      } else {
        router.push('/clients');
      }
      
    } catch (error) {
      console.error('Error creating client:', error);
      Alert.alert('Error', 'Failed to create client.');
    } finally {
      setLoading(false);
    }
  };

  const renderPositionList = () => {
    const maxPosition = clients.length + 1;
    const centerIndex = Math.floor(VISIBLE_ITEMS / 2);
    const startPosition = Math.max(1, selectedPosition - centerIndex);
    const endPosition = Math.min(maxPosition, startPosition + VISIBLE_ITEMS - 1);
    
    const displayItems = [];
    
    for (let pos = startPosition; pos <= endPosition; pos++) {
      let displayText = '';
      
      if (pos === selectedPosition) {
        displayText = 'NEW CLIENT';
      } else if (pos > selectedPosition) {
        // Show clients that will be at this position after NEW CLIENT is inserted
        const clientIndex = pos - 2; // -1 for position->index, -1 for NEW CLIENT insertion
        if (clientIndex >= 0 && clientIndex < clients.length) {
          const client = clients[clientIndex];
          const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
          displayText = addressParts.length > 0 ? addressParts.join(', ') : (client.address || 'No address');
        } else {
          displayText = `Position ${pos}`;
        }
      } else {
        // Show clients that will stay at this position
        const clientIndex = pos - 1;
        if (clientIndex >= 0 && clientIndex < clients.length) {
          const client = clients[clientIndex];
          const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
          displayText = addressParts.length > 0 ? addressParts.join(', ') : (client.address || 'No address');
        } else {
          displayText = `Position ${pos}`;
        }
      }
      
      displayItems.push(
        <View key={pos} style={styles.clientItem}>
          <Text style={styles.positionText}>{pos}</Text>
          <Text style={styles.addressText}>
            {displayText}
          </Text>
        </View>
      );
    }
    
    return displayItems;
  };

  const handleKeyPress = (event: any) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const newPosition = selectedPosition + direction;
      const maxPosition = clients.length + 1;
      const clampedPosition = Math.max(1, Math.min(maxPosition, newPosition));
      handlePositionChange(clampedPosition);
    }
  };

  // Focus management for keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyPress(event);
    };

    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedPosition]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Round Order Manager</ThemedText>
      <ThemedText style={styles.subtitle}>
        {newClientData ? 'Position your new client' : 'Change client position'}
      </ThemedText>

      <View style={styles.instructions}>
        <ThemedText style={styles.instructionText}>
          • Use ↑ and ↓ arrow keys or buttons to choose where to insert the new client
        </ThemedText>
        <ThemedText style={styles.instructionText}>
          • The blue highlight shows the selected position
        </ThemedText>
        <ThemedText style={styles.instructionText}>
          • All clients at or below this position will move down by one
        </ThemedText>
      </View>

      <View style={styles.listContainer}>
        <View style={styles.navigationButtons}>
          <Pressable 
            style={[styles.navButton, selectedPosition <= 1 && styles.navButtonDisabled]}
            onPress={() => handlePositionChange(selectedPosition - 1)}
            disabled={selectedPosition <= 1}
          >
            <Text style={styles.navButtonText}>↑</Text>
          </Pressable>
        </View>
        
        <View style={styles.pickerWrapper}>
          <View style={styles.list}>
            {renderPositionList()}
          </View>
          <View style={styles.pickerHighlight} pointerEvents="none">
            <Text style={styles.highlightPositionText}>{selectedPosition}</Text>
            <Text style={styles.highlightClientText}>
              {activeClient ? 'NEW CLIENT' : 'Position ' + selectedPosition}
            </Text>
          </View>
        </View>
        
        <View style={styles.navigationButtons}>
          <Pressable 
            style={[styles.navButton, selectedPosition >= clients.length + 1 && styles.navButtonDisabled]}
            onPress={() => handlePositionChange(selectedPosition + 1)}
            disabled={selectedPosition >= clients.length + 1}
          >
            <Text style={styles.navButtonText}>↓</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
        <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={loading}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.confirmButton, loading && { backgroundColor: '#ccc' }]}
          onPress={handleConfirm}
          disabled={loading}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>
            {loading ? 'Saving...' : 'Confirm Position'}
          </Text>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 60,
    paddingBottom: 100,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  instructions: {
    backgroundColor: '#f0f8ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#333',
  },
  listContainer: {
    flex: 1,
    marginBottom: 16,
    alignItems: 'center',
  },
  pickerWrapper: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    width: '100%',
  },
  pickerHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  highlightPositionText: {
    width: 40,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  highlightClientText: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  list: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      // Web-specific scroll improvements
      scrollBehavior: 'smooth',
      WebkitOverflowScrolling: 'touch',
    }),
  },
  clientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 8,
    borderRadius: 8,
    height: ITEM_HEIGHT,
  },
  positionText: {
    width: 40,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  addressText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  cancelButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
  },
  navigationButtons: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  navButton: {
    backgroundColor: '#007AFF',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  navButtonDisabled: {
    backgroundColor: '#ccc',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
});