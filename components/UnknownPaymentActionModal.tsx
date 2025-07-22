import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { deleteUnknownPayment, linkUnknownPaymentToClient, type UnknownPayment } from '../services/unknownPaymentService';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

type Client = {
  id: string;
  name: string;
  accountNumber?: string;
  address1?: string;
  town?: string;
  postcode?: string;
};

type UnknownPaymentActionModalProps = {
  visible: boolean;
  payment: UnknownPayment | null;
  onClose: () => void;
  onSuccess: () => void;
};

export default function UnknownPaymentActionModal({
  visible,
  payment,
  onClose,
  onSuccess
}: UnknownPaymentActionModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<'menu' | 'link' | 'delete'>('menu');

  useEffect(() => {
    if (visible && action === 'link') {
      loadClients();
    }
  }, [visible, action]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredClients(clients);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = clients.filter(client => 
        client.name.toLowerCase().includes(query) ||
        (client.accountNumber && client.accountNumber.toLowerCase().includes(query)) ||
        (client.address1 && client.address1.toLowerCase().includes(query)) ||
        (client.town && client.town.toLowerCase().includes(query)) ||
        (client.postcode && client.postcode.toLowerCase().includes(query))
      );
      setFilteredClients(filtered);
    }
  }, [searchQuery, clients]);

  const loadClients = async () => {
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) return;

      const clientsRef = collection(db, 'clients');
      const clientsQuery = query(clientsRef, where('ownerId', '==', ownerId));
      const querySnapshot = await getDocs(clientsQuery);
      
      const clientsData: Client[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        clientsData.push({
          id: doc.id,
          name: data.name || 'Unknown Client',
          accountNumber: data.accountNumber,
          address1: data.address1,
          town: data.town,
          postcode: data.postcode,
        });
      });
      
      setClients(clientsData);
      setFilteredClients(clientsData);
    } catch (error) {
      console.error('Error loading clients:', error);
      Alert.alert('Error', 'Failed to load clients');
    }
  };

  const handleDelete = async () => {
    console.log('handleDelete called');
    console.log('Current payment:', payment);
    
    if (!payment) {
      console.error('No payment selected for deletion');
      return;
    }

    console.log('About to show Alert.alert...');
    
    // For web platforms, Alert.alert might not work properly
    if (Platform.OS === 'web') {
      console.log('Running on web platform, using confirm instead of Alert.alert');
      const confirmed = window.confirm(`Are you sure you want to delete this payment of £${payment.amount.toFixed(2)}?`);
      if (confirmed) {
        console.log('Delete confirmed via window.confirm, starting deletion...');
        setLoading(true);
        try {
          await deleteUnknownPayment(payment.id);
          console.log('Payment deleted successfully');
          alert('Payment deleted successfully');
          handleClose();
          onSuccess();
        } catch (error) {
          console.error('Error deleting payment:', error);
          alert('Failed to delete payment');
        } finally {
          setLoading(false);
        }
      } else {
        console.log('Delete cancelled via window.confirm');
      }
    } else {
      // Mobile platforms
      Alert.alert(
        'Confirm Delete',
        `Are you sure you want to delete this payment of £${payment.amount.toFixed(2)}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              console.log('Delete confirmed, starting deletion...');
              setLoading(true);
              try {
                await deleteUnknownPayment(payment.id);
                console.log('Payment deleted successfully');
                Alert.alert('Success', 'Payment deleted successfully');
                handleClose();
                onSuccess();
              } catch (error) {
                console.error('Error deleting payment:', error);
                Alert.alert('Error', 'Failed to delete payment');
              } finally {
                setLoading(false);
              }
            }
          }
        ]
      );
    }
  };

  const handleLinkWithClient = async (clientId: string) => {
    console.log('handleLinkWithClient called with clientId:', clientId);
    console.log('Current payment:', payment);
    
    if (!payment) {
      console.error('No payment selected');
      return;
    }

    setLoading(true);
    try {
      console.log('Calling linkUnknownPaymentToClient...');
      await linkUnknownPaymentToClient(payment.id, clientId);
      console.log('linkUnknownPaymentToClient completed successfully');
      
      const client = clients.find(c => c.id === clientId);
      Alert.alert('Success', `Payment linked to ${client?.name || 'client'} successfully`);
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error linking payment:', error);
      Alert.alert('Error', 'Failed to link payment to client');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAction('menu');
    setSearchQuery('');
    setLoading(false);
    onClose();
  };

  const renderClientItem = ({ item }: { item: Client }) => (
    <Pressable 
      style={styles.clientItem} 
      onPress={() => {
        console.log('Client item pressed:', item.name, item.id);
        handleLinkWithClient(item.id);
      }}
      android_ripple={{ color: '#e0e0e0' }}
      android_disableSound={false}
    >
      <ThemedText style={styles.clientName}>{item.name}</ThemedText>
      {item.accountNumber && (
        <ThemedText style={styles.clientAccount}>Account: {item.accountNumber}</ThemedText>
      )}
      {(item.address1 || item.town || item.postcode) && (
        <ThemedText style={styles.clientAddress}>
          {[item.address1, item.town, item.postcode].filter(Boolean).join(', ')}
        </ThemedText>
      )}
    </Pressable>
  );

  const renderMenu = () => (
    <View style={styles.menuContainer}>
      <ThemedText type="title" style={styles.menuTitle}>Payment Options</ThemedText>
      
      {payment && (
        <View style={styles.paymentInfo}>
          <ThemedText style={styles.paymentAmount}>£{payment.amount.toFixed(2)}</ThemedText>
          <ThemedText style={styles.paymentDate}>
            {new Date(payment.date).toLocaleDateString('en-GB')}
          </ThemedText>
          <ThemedText style={styles.paymentMethod}>{payment.method}</ThemedText>
          {payment.originalAccountIdentifier && (
            <ThemedText style={styles.paymentAccount}>
              Account: {payment.originalAccountIdentifier}
            </ThemedText>
          )}
        </View>
      )}

      <Pressable 
        style={[styles.menuButton, styles.linkButton]} 
        onPress={() => {
          console.log('Link button pressed');
          setAction('link');
        }}
        android_ripple={{ color: '#0056b3' }}
        android_disableSound={false}
      >
        <ThemedText style={styles.linkButtonText}>Link with a client account</ThemedText>
      </Pressable>

      <Pressable 
        style={[styles.menuButton, styles.deleteButton]} 
        onPress={() => {
          console.log('Delete button pressed');
          handleDelete();
        }}
        android_ripple={{ color: '#cc0000' }}
        android_disableSound={false}
      >
        <ThemedText style={styles.deleteButtonText}>Delete Payment</ThemedText>
      </Pressable>

      <Pressable 
        style={[styles.menuButton, styles.cancelButton]} 
        onPress={() => {
          console.log('Cancel button pressed');
          handleClose();
        }}
        android_ripple={{ color: '#d0d0d0' }}
        android_disableSound={false}
      >
        <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
      </Pressable>
    </View>
  );

  const renderLinkClient = () => {
    console.log('Rendering link client view with', filteredClients.length, 'clients');
    return (
      <View style={styles.linkContainer}>
        <ThemedText type="title" style={styles.linkTitle}>Select Client</ThemedText>
        
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients by name, account, or address..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <FlatList
          data={filteredClients}
          renderItem={renderClientItem}
          keyExtractor={item => item.id}
          style={styles.clientList}
          contentContainerStyle={styles.clientListContent}
        />

        <Pressable 
          style={[styles.menuButton, styles.backButton]} 
          onPress={() => {
            console.log('Back button pressed');
            setAction('menu');
          }}
          android_ripple={{ color: '#d0d0d0' }}
          android_disableSound={false}
        >
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.modalContent}>
          {action === 'menu' && renderMenu()}
          {action === 'link' && renderLinkClient()}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 12,
    padding: 20,
  },
  menuContainer: {
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  paymentInfo: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  paymentAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  paymentDate: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  paymentMethod: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  paymentAccount: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  menuButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  linkButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  backButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  linkContainer: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'white',
    fontSize: 16,
    marginBottom: 16,
  },
  clientList: {
    flex: 1,
    marginBottom: 16,
  },
  clientListContent: {
    paddingBottom: 16,
  },
  clientItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  clientAccount: {
    fontSize: 14,
    color: '#666',
  },
  clientAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
}); 