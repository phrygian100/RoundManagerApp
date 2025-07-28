import WheelPicker from '@quidone/react-native-wheel-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDocs, orderBy, query, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { isTodayMarkedComplete } from '../services/jobService';
import type { Client } from '../types/client';

type ClientWithPosition = Client & { 
  displayPosition: number;
};

const { height: screenHeight } = Dimensions.get('window');
const ITEM_HEIGHT = 60;
const VISIBLE_ITEMS = 7;

// Enhanced mobile browser detection
const isMobileBrowser = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
    (window.innerWidth <= 768); // Also consider small screens as mobile
};

export default function RoundOrderManagerScreen() {
  const router = useRouter();
  const { newClientData, editingClientId } = useLocalSearchParams();
  const [clients, setClients] = useState<ClientWithPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState(1);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const longPressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        let needsManualSort = false;
        try {
          clientsSnapshot = await getDocs(clientsQuery);
        } catch (err) {
          console.warn('RoundOrderManager: missing index for clients order query, falling back', err);
          const qs = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
          clientsSnapshot = qs;
          needsManualSort = true; // Flag that we need to manually sort
        }
        
        const allClients: ClientWithPosition[] = clientsSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          displayPosition: doc.data().roundOrderNumber || 0,
        })) as ClientWithPosition[];

        // Only include active clients
        let activeClients = allClients.filter(c => c.status !== 'ex-client');
        
        // Manual sort by roundOrderNumber when database index is missing
        if (needsManualSort) {
          activeClients.sort((a, b) => (a.roundOrderNumber || 999999) - (b.roundOrderNumber || 999999));
        }
        
        if (newClientData) {
          // CREATE MODE
          activeClientData = JSON.parse(newClientData as string);
          clientsList = activeClients.map(client => ({
            ...client,
            displayPosition: client.roundOrderNumber || 0
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
              .map(client => ({
                ...client,
                displayPosition: client.roundOrderNumber || 0
              }));
            initialPosition = clientToEdit.roundOrderNumber;
          } else {
            // Fallback if client not found
            clientsList = activeClients.map(client => ({
              ...client,
              displayPosition: client.roundOrderNumber || 0
            }));
          }
        }
        
        setClients(clientsList);
        setActiveClient(activeClientData);
        setSelectedPosition(initialPosition);

        // Scroll to initial position after a short delay (mobile only)
        if (Platform.OS !== 'web') {
          setTimeout(() => {
            if (flatListRef.current && initialPosition > 0) {
              const scrollToIndex = Math.max(0, initialPosition - 1);
              flatListRef.current.scrollToOffset({
                offset: scrollToIndex * ITEM_HEIGHT,
                animated: false
              });
            }
          }, 100);
        }

      } catch (error) {
        console.error('Error loading clients:', error);
        if (Platform.OS === 'web') {
          window.alert('Error: Failed to load clients.');
        } else {
          Alert.alert('Error', 'Failed to load clients.');
        }
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
        if (Platform.OS === 'web') {
          window.alert('Error: No client data available.');
        } else {
          Alert.alert('Error', 'No client data available.');
        }
        return;
      }

      // For new clients (not yet saved), skip database operations and just navigate back with position
      if (newClientData && !activeClient.id) {
        console.log('New client - skipping database operations, just returning position');
        // Navigate back to add-client with the selected position
        const simpleParams = {
          name: activeClient.name || '',
          address1: activeClient.address1 || '',
          town: activeClient.town || '',
          postcode: activeClient.postcode || '',
          frequency: String(activeClient.frequency || ''),
          nextVisit: activeClient.nextVisit || '',
          mobileNumber: activeClient.mobileNumber || '',
          quote: String(activeClient.quote || ''),
          accountNumber: String(activeClient.accountNumber || ''),
          status: activeClient.status || 'active',
          source: activeClient.source || '',
          email: activeClient.email || '',
          roundOrderNumber: String(selectedPosition)
        };
        router.push({
          pathname: '/add-client',
          params: simpleParams
        });
        return;
      }

      // Step 1: Get ALL active clients from database (only for existing client operations)
      const allClientsQuery = query(
        collection(db, 'clients'),
        where('ownerId', '==', ownerId)
      );
      const allClientsSnapshot = await getDocs(allClientsQuery);
      
      // Step 2: Filter to only active clients and sort by current round order
      let activeClientsList = allClientsSnapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as Client))
        .filter(client => client.status !== 'ex-client')
        .sort((a, b) => (a.roundOrderNumber || 0) - (b.roundOrderNumber || 0));

      // Step 3: If editing a client, remove it from the list first
      if (editingClientId) {
        const editClientId = typeof editingClientId === 'string' ? editingClientId : editingClientId[0];
        activeClientsList = activeClientsList.filter(client => client.id !== editClientId);
      }

      // Step 4: Insert the client at the selected position
      const finalOrderedList = [...activeClientsList];
      finalOrderedList.splice(selectedPosition - 1, 0, activeClient);

      // Step 5: Update ALL clients with sequential round order numbers
      const batch = writeBatch(db);
      
      finalOrderedList.forEach((client, index) => {
        const newRoundOrderNumber = index + 1;
        const clientRef = doc(db, 'clients', client.id);
        
        // Ensure client has an ID before attempting update
        if (!client.id) {
          console.error('Client missing ID:', client);
          throw new Error('Client missing ID - cannot update round order');
        }
        
        console.log(`Updating client ${client.id} to round order ${newRoundOrderNumber}`);
        
        // Always update round order number
        batch.update(clientRef, { roundOrderNumber: newRoundOrderNumber });
        
        // If this is a restored client, also update status
        if (newClientData && client.id === activeClient.id) {
          batch.update(clientRef, { status: 'active' });
        }
      });

      console.log('Committing batch update for round order changes...');
      await batch.commit();
      console.log('Batch update completed successfully');

      // Handle navigation and job generation for restored clients
      if (newClientData && activeClient.id) {
        // This is a restored client - generate jobs if needed
        const { id, ...clientData } = activeClient;
        const skipToday = await isTodayMarkedComplete();
        
        if (clientData.frequency !== 'one-off') {
          // Generate jobs for restored client
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          let visitDate = clientData.nextVisit ? new Date(clientData.nextVisit) : today;
          
          if (visitDate < today) {
            const freq = Number(clientData.frequency);
            while (visitDate < today) {
              visitDate.setDate(visitDate.getDate() + freq * 7);
            }
          }
          
          const jobsToCreate = [];
          for (let i = 0; i < 8; i++) {
            const weekStr = visitDate.toISOString().split('T')[0];
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
            const jobBatch = writeBatch(db);
            jobsToCreate.forEach(job => {
              const newJobRef = doc(jobsRef);
              jobBatch.set(newJobRef, job);
            });
            await jobBatch.commit();
          }
        }
        
        // Navigate to restored client's detail page
        router.push({ pathname: '/(tabs)/clients/[id]', params: { id } });
        return;
      }

      // Clear any stored round order data
      await AsyncStorage.removeItem('selectedRoundOrder');
      
      // Navigate appropriately (for existing client operations only)
      if (editingClientId) {
        router.back(); // Go back to client details
      } else {
        router.push('/clients'); // Go to clients list
      }
      
    } catch (error) {
      console.error('Error creating client:', error);
      if (Platform.OS === 'web') {
        window.alert('Error: Failed to create client.');
      } else {
        Alert.alert('Error', 'Failed to create client.');
      }
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
        if (activeClient && editingClientId) {
          // Edit mode - show the client being edited
          const addressParts = [activeClient.address1, activeClient.town, activeClient.postcode].filter(Boolean);
          displayText = addressParts.length > 0 ? addressParts.join(', ') : (activeClient.address || 'No address');
        } else {
          // Create mode - show NEW CLIENT
          displayText = 'NEW CLIENT';
        }
      } else if (pos > selectedPosition) {
        // Show clients that will be at this position after NEW CLIENT is inserted
        // Find client that will be at position (pos - 1) in the current array
        const adjustedPosition = pos - 1;
        const client = clients.find(c => c.displayPosition === adjustedPosition);
        if (client) {
          const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
          displayText = addressParts.length > 0 ? addressParts.join(', ') : (client.address || 'No address');
        } else {
          displayText = `Position ${pos}`;
        }
      } else {
        // Show clients that will stay at this position
        const client = clients.find(c => c.displayPosition === pos);
        if (client) {
          const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
          displayText = addressParts.length > 0 ? addressParts.join(', ') : (client.address || 'No address');
        } else {
          displayText = `Position ${pos}`;
        }
      }
      
      const isSelected = pos === selectedPosition;
      displayItems.push(
        <View key={pos} style={[styles.clientItem, isSelected && styles.selectedClientItem]}>
          <ThemedText style={[styles.positionText, isSelected && styles.selectedPositionText]}>{pos}</ThemedText>
          <ThemedText style={[styles.addressText, isSelected && styles.selectedAddressText]}>
            {displayText}
          </ThemedText>
        </View>
      );
    }
    
    return displayItems;
  };

  // Mobile-specific functions - Simplest possible implementation
  const createMobileDisplayList = () => {
    const displayList = [];
    
    // Sort clients by their displayPosition to ensure correct order
    const sortedClients = [...clients].sort((a, b) => (a.displayPosition || 0) - (b.displayPosition || 0));
    
    // Create a simple list: just clients with NEW CLIENT inserted at selected position
    sortedClients.forEach((client) => {
      if (client.displayPosition === selectedPosition) {
        // Insert NEW CLIENT before this client
        displayList.push({
          id: 'new-client',
          isNewClient: true,
          address: 'NEW CLIENT',
          displayPosition: selectedPosition
        });
      }
      
      displayList.push({
        ...client,
        isNewClient: false
      });
    });
    
    // If NEW CLIENT should be at the end (after all existing clients)
    const maxClientPosition = Math.max(0, ...sortedClients.map(c => c.displayPosition || 0));
    if (selectedPosition > maxClientPosition) {
      displayList.push({
        id: 'new-client',
        isNewClient: true,
        address: 'NEW CLIENT',
        displayPosition: selectedPosition
      });
    }
    
    return displayList;
  };

  const renderMobileItem = ({ item, index }: { item: any; index: number }) => {
    const isNewClient = item.isNewClient;
    let displayText = '';
    let position = item.displayPosition || (index + 1);
    
    if (isNewClient) {
      displayText = 'NEW CLIENT';
      position = selectedPosition;
    } else {
      const addressParts = [item.address1, item.town, item.postcode].filter(Boolean);
      displayText = addressParts.length > 0 ? addressParts.join(', ') : (item.address || 'No address');
      position = item.displayPosition || 0;
    }
    
    const isSelected = isNewClient || position === selectedPosition;
    
    return (
      <View style={[styles.clientItem, isSelected && styles.selectedClientItem]}>
        <ThemedText style={[styles.positionText, isSelected && styles.selectedPositionText]}>{position}</ThemedText>
        <ThemedText style={[styles.addressText, isSelected && styles.selectedAddressText]}>{displayText}</ThemedText>
      </View>
    );
  };

  const onScrollMobile = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    
    // Simplest calculation: divide scroll by item height to get index
    const index = Math.round(y / ITEM_HEIGHT);
    const newPosition = index + 1;
    
    handlePositionChange(newPosition);
  };

  // Long press functionality for mobile browsers
  const startLongPress = (direction: 'up' | 'down' | 'up10' | 'down10') => {
    // Only enable for mobile browsers
    if (Platform.OS !== 'web' || !isMobileBrowser()) return;
    
    // Clear any existing timers
    stopLongPress();
    
    // Start long press after 500ms delay
    longPressTimeout.current = setTimeout(() => {
      // Start repeating the action every 100ms
      longPressInterval.current = setInterval(() => {
        if (direction === 'up') {
          moveUp();
        } else if (direction === 'down') {
          moveDown();
        } else if (direction === 'up10') {
          moveUp10();
        } else if (direction === 'down10') {
          moveDown10();
        }
      }, 100);
    }, 500);
  };

  const stopLongPress = () => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    if (longPressInterval.current) {
      clearInterval(longPressInterval.current);
      longPressInterval.current = null;
    }
  };

  // Navigation functions
  const moveUp = () => {
    console.log('Moving up from position:', selectedPosition);
    const newPosition = selectedPosition - 1;
    const clampedPosition = Math.max(1, newPosition);
    if (clampedPosition !== selectedPosition) {
      handlePositionChange(clampedPosition);
    } else {
      // Stop long press if we've reached the boundary
      stopLongPress();
    }
  };

  const moveDown = () => {
    console.log('Moving down from position:', selectedPosition);
    const newPosition = selectedPosition + 1;
    const maxPosition = clients.length + 1;
    const clampedPosition = Math.min(maxPosition, newPosition);
    if (clampedPosition !== selectedPosition) {
      handlePositionChange(clampedPosition);
    } else {
      // Stop long press if we've reached the boundary
      stopLongPress();
    }
  };

  const moveUp10 = () => {
    console.log('Moving up 10 from position:', selectedPosition);
    const newPosition = selectedPosition + 10;
    const maxPosition = clients.length + 1;
    const clampedPosition = Math.min(maxPosition, newPosition);
    if (clampedPosition !== selectedPosition) {
      handlePositionChange(clampedPosition);
    } else {
      // Stop long press if we've reached the boundary
      stopLongPress();
    }
  };

  const moveDown10 = () => {
    console.log('Moving down 10 from position:', selectedPosition);
    const newPosition = selectedPosition - 10;
    const clampedPosition = Math.max(1, newPosition);
    if (clampedPosition !== selectedPosition) {
      handlePositionChange(clampedPosition);
    } else {
      // Stop long press if we've reached the boundary
      stopLongPress();
    }
  };

  // Focus management for keyboard events (web only)
  useEffect(() => {
    // More robust web environment detection
    if (Platform.OS === 'web' && 
        typeof window !== 'undefined' && 
        window.addEventListener && 
        typeof window.addEventListener === 'function') {
      const handleKeyDown = (event: KeyboardEvent) => {
        console.log('Key pressed:', event.key);
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveUp();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveDown();
        }
      };

      try {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
          if (window.removeEventListener && typeof window.removeEventListener === 'function') {
            window.removeEventListener('keydown', handleKeyDown);
          }
        };
      } catch (error) {
        console.warn('Failed to add keyboard event listeners:', error);
      }
    }
  }, [selectedPosition, clients.length]);

  // Cleanup long press timers on unmount
  useEffect(() => {
    return () => {
      stopLongPress();
    };
  }, []);

  // Create wheel picker data
  const wheelPickerData = clients.map((client, index) => ({
    value: index + 1,
    label: `${index + 1}. ${client.name || 'Unnamed Client'}`,
  }));

  // Add the client being positioned at the selected position
  const wheelPickerDataWithNewClient = [...wheelPickerData];
  let insertLabel = '';
  if (activeClient && editingClientId) {
    // Edit mode - show the client being edited
    const addressParts = [activeClient.address1, activeClient.town, activeClient.postcode].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(', ') : (activeClient.address || 'No address');
    insertLabel = `${selectedPosition}. ${address}`;
  } else {
    // Create mode - show NEW CLIENT
    insertLabel = `${selectedPosition}. NEW CLIENT`;
  }
  
  wheelPickerDataWithNewClient.splice(selectedPosition - 1, 0, {
    value: selectedPosition,
    label: insertLabel,
  });

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

      <View style={styles.listContainer}>
        {Platform.OS === 'web' ? (
          // Web version with mobile-specific improvements
          isMobileBrowser() ? (
            // Mobile browser version - simplified and touch-optimized
            <View style={styles.mobileContainer}>
              <View style={styles.mobilePickerWrapper}>
                <View style={styles.list}>
                  {renderPositionList()}
                </View>
              </View>
              
              {/* Navigation buttons grouped together for mobile */}
              <View style={styles.mobileNavigationButtons}>
                <Pressable 
                  style={[styles.mobileNavButton, selectedPosition <= 1 && styles.mobileNavButtonDisabled]}
                  onPress={moveUp}
                  onPressIn={() => startLongPress('up')}
                  onPressOut={stopLongPress}
                  disabled={selectedPosition <= 1}
                >
                  <ThemedText style={styles.mobileNavButtonText}>▲</ThemedText>
                </Pressable>
                
                <Pressable 
                  style={[styles.mobileNavButton, styles.mobileNavButton10, selectedPosition <= 10 && styles.mobileNavButtonDisabled]}
                  onPress={moveDown10}
                  onPressIn={() => startLongPress('down10')}
                  onPressOut={stopLongPress}
                  disabled={selectedPosition <= 10}
                >
                  <ThemedText style={styles.mobileNavButtonText10}>-10</ThemedText>
                </Pressable>
                
                <Pressable 
                  style={[styles.mobileNavButton, styles.mobileNavButton10, selectedPosition >= clients.length + 1 - 9 && styles.mobileNavButtonDisabled]}
                  onPress={moveUp10}
                  onPressIn={() => startLongPress('up10')}
                  onPressOut={stopLongPress}
                  disabled={selectedPosition >= clients.length + 1 - 9}
                >
                  <ThemedText style={styles.mobileNavButtonText10}>+10</ThemedText>
                </Pressable>
                
                <Pressable 
                  style={[styles.mobileNavButton, selectedPosition >= clients.length + 1 && styles.mobileNavButtonDisabled]}
                  onPress={moveDown}
                  onPressIn={() => startLongPress('down')}
                  onPressOut={stopLongPress}
                  disabled={selectedPosition >= clients.length + 1}
                >
                  <ThemedText style={styles.mobileNavButtonText}>▼</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            // Desktop browser version
            <>
              <View style={styles.navigationButtons}>
                <Pressable 
                  style={[styles.navButton, selectedPosition <= 1 && styles.navButtonDisabled]}
                  onPress={moveUp}
                  disabled={selectedPosition <= 1}
                >
                  <ThemedText style={styles.navButtonText}>↑</ThemedText>
                </Pressable>
              </View>
              
              <View style={styles.pickerWrapper}>
                <View style={styles.list}>
                  {renderPositionList()}
                </View>
              </View>
              
              <View style={styles.navigationButtons}>
                <Pressable 
                  style={[styles.navButton, selectedPosition >= clients.length + 1 && styles.navButtonDisabled]}
                  onPress={moveDown}
                  disabled={selectedPosition >= clients.length + 1}
                >
                  <ThemedText style={styles.navButtonText}>↓</ThemedText>
                </Pressable>
              </View>
            </>
          )
        ) : (
          // Mobile version: Wheel Picker
          <View style={styles.wheelPickerContainer}>
            <WheelPicker
              data={wheelPickerDataWithNewClient}
              value={selectedPosition}
              onValueChanged={({ item }: { item: { value: number; label: string } }) => setSelectedPosition(item.value)}
              itemHeight={60}
              visibleItemCount={7}
              itemTextStyle={styles.wheelPickerItem}
              style={styles.wheelPicker}
            />
          </View>
        )}
      </View>
      
      {/* Action buttons with better positioning for mobile */}
      <View style={[styles.actionButtonsContainer, isMobileBrowser() && styles.mobileActionButtonsContainer]}>
        <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={loading}>
          <ThemedText style={styles.buttonText}>Cancel</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.confirmButton, loading && { backgroundColor: '#ccc' }]}
          onPress={handleConfirm}
          disabled={loading}
        >
          <ThemedText style={styles.buttonText}>
            {loading ? 'Saving...' : 'Confirm Position'}
          </ThemedText>
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
    paddingBottom: Platform.OS === 'web' ? (isMobileBrowser() ? 20 : 100) : 100,
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
  // Mobile browser specific styles
  mobileContainer: {
    flex: 1,
    width: '100%',
    paddingBottom: 100, // Space for fixed action buttons
  },
  mobilePickerWrapper: {
    flex: 1,
    width: '100%',
    marginBottom: 20,
    maxHeight: ITEM_HEIGHT * VISIBLE_ITEMS,
    overflow: 'scroll',
  },

  mobileNavigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginHorizontal: 8,
    marginBottom: 16,
  },
  mobileNavButton: {
    backgroundColor: '#007AFF',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  mobileNavButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  mobileNavButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  mobileNavButton10: {
    width: 60,
    height: 60,
  },
  mobileNavButtonText10: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Desktop styles (unchanged)
  pickerWrapper: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    width: '100%',
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
  selectedClientItem: {
    backgroundColor: '#e3f2fd',
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  selectedPositionText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  selectedAddressText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  // Action buttons
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  mobileActionButtonsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    marginTop: 0,
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
    paddingVertical: isMobileBrowser() ? 16 : 8,
    minHeight: isMobileBrowser() ? 80 : 60,
  },
  navButton: {
    backgroundColor: '#007AFF',
    width: isMobileBrowser() ? 60 : 50,
    height: isMobileBrowser() ? 60 : 50,
    borderRadius: isMobileBrowser() ? 30 : 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: isMobileBrowser() ? 8 : 4,
    ...(isMobileBrowser() && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    }),
  },
  navButtonDisabled: {
    backgroundColor: '#ccc',
  },
  navButtonText: {
    color: '#fff',
    fontSize: isMobileBrowser() ? 28 : 24,
    fontWeight: 'bold',
  },
  wheelPickerContainer: {
    flex: 1,
    marginVertical: 20,
    justifyContent: 'center',
  },
  wheelPicker: {
    height: 400,
  },
  wheelPickerItem: {
    fontSize: 16,
    color: '#333',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});