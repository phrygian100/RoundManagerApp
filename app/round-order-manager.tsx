import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDocs, orderBy, query, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';

type ClientWithPosition = Client & { 
  isNewClient?: boolean;
  displayPosition: number;
};

export default function RoundOrderManagerScreen() {
  const router = useRouter();
  const { newClientData } = useLocalSearchParams();
  const [clients, setClients] = useState<ClientWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClientPosition, setNewClientPosition] = useState(1);
  const [newClient, setNewClient] = useState<Client | null>(null);

  useEffect(() => {
    const loadClients = async () => {
      try {
        setLoading(true);
        
        // Parse the new client data
        if (newClientData) {
          const parsedData = JSON.parse(newClientData as string);
          setNewClient(parsedData);
        }

        // Get all active clients ordered by round order
        const clientsQuery = query(
          collection(db, 'clients'),
          orderBy('roundOrderNumber', 'asc')
        );
        const clientsSnapshot = await getDocs(clientsQuery);
        
        const existingClients: ClientWithPosition[] = clientsSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          displayPosition: doc.data().roundOrderNumber || 0,
        })) as ClientWithPosition[];

        // Insert new client at position 1 by default
        const newClientWithPosition: ClientWithPosition = {
          ...newClient!,
          isNewClient: true,
          displayPosition: 1,
        };

        // Create the combined list with new client inserted
        const combinedClients = [newClientWithPosition, ...existingClients];
        
        // Update display positions
        combinedClients.forEach((client, index) => {
          client.displayPosition = index + 1;
        });

        setClients(combinedClients);
        setNewClientPosition(1);
      } catch (error) {
        console.error('Error loading clients:', error);
        Alert.alert('Error', 'Failed to load clients.');
      } finally {
        setLoading(false);
      }
    };

    loadClients();
  }, [newClientData]);

  const moveNewClient = (direction: 'up' | 'down') => {
    const newPosition = direction === 'up' 
      ? Math.max(1, newClientPosition - 1)
      : Math.min(clients.length, newClientPosition + 1);

    if (newPosition === newClientPosition) return;

    setNewClientPosition(newPosition);
    
    // Reorder the clients array
    const reorderedClients = [...clients];
    const newClientIndex = reorderedClients.findIndex(client => client.isNewClient);
    
    if (newClientIndex !== -1) {
      const [movedClient] = reorderedClients.splice(newClientIndex, 1);
      reorderedClients.splice(newPosition - 1, 0, movedClient);
      
      // Update display positions
      reorderedClients.forEach((client, index) => {
        client.displayPosition = index + 1;
      });
      
      setClients(reorderedClients);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      
      // Update all clients' round order numbers
      const batch = writeBatch(db);
      
      clients.forEach((client) => {
        if (client.id) { // Skip the new client as it doesn't exist in DB yet
          const clientRef = doc(db, 'clients', client.id);
          batch.update(clientRef, { roundOrderNumber: client.displayPosition });
        }
      });
      
      await batch.commit();
      
      // Store the selected position in AsyncStorage
      await AsyncStorage.setItem('selectedRoundOrder', newClientPosition.toString());
      
      // Return to add-client screen
      router.back();
      
    } catch (error) {
      console.error('Error updating round order:', error);
      Alert.alert('Error', 'Failed to update round order.');
    } finally {
      setLoading(false);
    }
  };

  const renderClient = ({ item, index }: { item: ClientWithPosition; index: number }) => {
    const isNewClient = item.isNewClient;
    const address = item.address1 || item.address || 'No address';
    
    return (
      <View style={[
        styles.clientRow,
        isNewClient && styles.newClientRow
      ]}>
        <View style={styles.positionContainer}>
          <Text style={styles.positionText}>{item.displayPosition}</Text>
        </View>
        <View style={styles.clientInfo}>
          <Text style={[styles.addressText, isNewClient && styles.newClientText]}>
            {address}
          </Text>
          {isNewClient && (
            <Text style={styles.newClientLabel}>NEW CLIENT</Text>
          )}
        </View>
      </View>
    );
  };

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
        Position your new client in the round order
      </ThemedText>

      <View style={styles.controls}>
        <Pressable 
          style={[styles.controlButton, newClientPosition <= 1 && styles.disabledButton]}
          onPress={() => moveNewClient('up')}
          disabled={newClientPosition <= 1}
        >
          <Text style={styles.controlButtonText}>Move Up</Text>
        </Pressable>
        
        <Pressable 
          style={[styles.controlButton, newClientPosition >= clients.length && styles.disabledButton]}
          onPress={() => moveNewClient('down')}
          disabled={newClientPosition >= clients.length}
        >
          <Text style={styles.controlButtonText}>Move Down</Text>
        </Pressable>
      </View>

      <FlatList
        data={clients}
        renderItem={renderClient}
        keyExtractor={(item) => item.isNewClient ? 'new-client' : item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.buttonContainer}>
        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        
        <Pressable style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmButtonText}>Confirm Position</Text>
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
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  controlButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  list: {
    flex: 1,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 8,
    borderRadius: 8,
  },
  newClientRow: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
    borderWidth: 2,
  },
  positionContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  positionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  clientInfo: {
    flex: 1,
  },
  addressText: {
    fontSize: 16,
    fontWeight: '500',
  },
  newClientText: {
    fontWeight: 'bold',
    color: '#2196f3',
  },
  newClientLabel: {
    fontSize: 12,
    color: '#2196f3',
    fontWeight: 'bold',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
}); 