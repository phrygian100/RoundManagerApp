import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDocs, orderBy, query, writeBatch } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';
import { createJobsForClient } from './services/jobService';

type ClientWithPosition = Client & { 
  isNewClient?: boolean;
  displayPosition: number;
};

const { height: screenHeight } = Dimensions.get('window');
const ITEM_HEIGHT = 60;
const VISIBLE_ITEMS = 7;

export default function RoundOrderManagerScreen() {
  const router = useRouter();
  const { newClientData } = useLocalSearchParams();
  const [clients, setClients] = useState<ClientWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClientPosition, setNewClientPosition] = useState(1);
  const [newClient, setNewClient] = useState<Client | null>(null);
  const flatListRef = useRef<FlatList>(null);

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

        setClients(existingClients);
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

  const handlePositionChange = (position: number) => {
    const newPosition = Math.max(1, Math.min(clients.length + 1, position));
    if (newPosition !== newClientPosition) {
      setNewClientPosition(newPosition);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      
      if (!newClient) {
        Alert.alert('Error', 'No client data available.');
        return;
      }

      // First, update all existing clients' round order numbers
      const batch = writeBatch(db);
      
      // Create new client list with the new client inserted at the selected position
      const updatedClients = [...clients];
      updatedClients.splice(newClientPosition - 1, 0, { 
        ...newClient, 
        isNewClient: true,
        displayPosition: newClientPosition 
      });
      
      // Update round order numbers for all clients
      updatedClients.forEach((client, index) => {
        if (client.id) { // Only update existing clients
          const clientRef = doc(db, 'clients', client.id);
          batch.update(clientRef, { roundOrderNumber: index + 1 });
        }
      });
      
      await batch.commit();
      
      // Now create the new client with the selected round order position
      const clientRef = await addDoc(collection(db, 'clients'), {
        ...newClient,
        roundOrderNumber: newClientPosition,
        status: 'active',
      });

      console.log('Client created with ID:', clientRef.id);

      // Create jobs for the new client (only for recurring clients, not one-off)
      if (newClient.frequency !== 'one-off') {
        try {
          const jobsCreated = await createJobsForClient(clientRef.id, 8);
          console.log(`Created ${jobsCreated} jobs for new client`);
        } catch (jobError) {
          console.error('Error creating jobs for new client:', jobError);
          // Don't fail the client creation if job creation fails
        }
      }

      // Clear any stored round order data
      await AsyncStorage.removeItem('selectedRoundOrder');
      
      // Navigate back to clients list
      router.push('/clients');
      
    } catch (error) {
      console.error('Error creating client:', error);
      Alert.alert('Error', 'Failed to create client.');
    } finally {
      setLoading(false);
    }
  };

  const renderClientItem = ({ item, index }: { item: ClientWithPosition | Client; index: number }) => {
    const isNewClient = 'isNewClient' in item && item.isNewClient;
    const address = item.address1 || item.address || 'No address';
    const position = 'displayPosition' in item ? item.displayPosition : index + 1;
    
    return (
      <View style={[
        styles.clientItem
      ]}>
        <Text style={styles.positionText}>{position}</Text>
        <Text style={[
          styles.addressText
        ]}>
          {isNewClient ? 'NEW CLIENT' : address}
        </Text>
      </View>
    );
  };

  // Create the display list with new client inserted
  const displayList = [
    ...clients.slice(0, newClientPosition - 1),
    { ...newClient!, isNewClient: true, displayPosition: newClientPosition },
    ...clients.slice(newClientPosition - 1)
  ].map((client, index) => ({...client, displayPosition: index + 1}));

  const onScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    handlePositionChange(index + 1);
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

      <View style={styles.instructions}>
        <ThemedText style={styles.instructionText}>
          • Scroll to see where the new client will be inserted
        </ThemedText>
        <ThemedText style={styles.instructionText}>
          • The blue highlighted client shows the new client
        </ThemedText>
        <ThemedText style={styles.instructionText}>
          • All clients below will move down by one position
        </ThemedText>
      </View>

      <View style={styles.listContainer}>
        <View style={styles.pickerWrapper}>
          <FlatList
            data={displayList}
            renderItem={({item, index}) => {
              const isSelected = index === newClientPosition -1;
              return (
                <View style={[styles.clientItem, isSelected && styles.newClientItem]}>
                   <Text style={styles.positionText}>{index + 1}</Text>
                   <Text style={[styles.addressText, isSelected && styles.newClientText]}>
                    {'isNewClient' in item && item.isNewClient ? "NEW CLIENT" : item.address1 || item.address}
                   </Text>
                </View>
              )
            }}
            keyExtractor={(item, index) => 
              'isNewClient' in item && item.isNewClient ? 'new-client' : item.id || `client-${index}`
            }
            style={styles.list}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            onMomentumScrollEnd={onScroll}
            getItemLayout={(data, index) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            })}
            contentContainerStyle={{
              paddingTop: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
              paddingBottom: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
            }}
          />
          <View style={styles.pickerHighlight} pointerEvents="none" />
        </View>
      </View>

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
  },
  list: {
    flex: 1,
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
  newClientItem: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
    borderWidth: 2,
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
  newClientText: {
    fontWeight: 'bold',
    color: '#2196f3',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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