import { useRouter } from 'expo-router';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId, waitForAuthReady } from '../core/session';
import type { Client } from '../types/client';

export default function ExClientsScreen() {
  const router = useRouter();
  const [exClients, setExClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const setupListener = async () => {
      // IMPORTANT: wait for Auth hydration before hitting locked-down Firestore (web).
      const user = await waitForAuthReady(5000);
      if (!user) {
        setExClients([]);
        setLoading(false);
        return () => {};
      }

      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        setExClients([]);
        setLoading(false);
        return () => {};
      }

      const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const unsubscribe = onSnapshot(
        clientsQuery,
        (querySnapshot) => {
          const clientsData: Client[] = [];
          querySnapshot.forEach((doc) => {
            const client = { id: doc.id, ...doc.data() } as Client;
            if (client.status === 'ex-client') {
              clientsData.push(client);
            }
          });
          setExClients(clientsData);
          setLoading(false);
        },
        (error) => {
          console.error('ExClients listener error:', error);
          setExClients([]);
          setLoading(false);
        }
      );

      return unsubscribe;
    };
    let unsub: () => void;
    setupListener().then(u => { unsub = u; });
    return () => { if (unsub) unsub(); };
  }, []);
  
  const handleRestoreClient = (clientId: string) => {
    const client = exClients.find(c => c.id === clientId);
    if (!client) return;
    Alert.alert(
      "Restore Client",
      "Are you sure you want to restore this client? They will be moved back to the active client list and you will be prompted to set their round order.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            try {
              // IMPORTANT: wait for Auth hydration before write (prevents unauthenticated writes on web).
              const user = await waitForAuthReady(5000);
              if (!user) {
                Alert.alert('Error', 'Authentication error. Please refresh and try again.');
                return;
              }

              const ownerId = await getDataOwnerId();
              if (!ownerId) {
                Alert.alert('Error', 'Could not determine account owner. Please log out and back in.');
                return;
              }

              // Restore and normalize ownership fields for locked-down rules/query consistency.
              await updateDoc(doc(db, 'clients', clientId), {
                status: 'active',
                roundOrderNumber: null,
                ownerId,
                accountId: ownerId,
                updatedAt: new Date().toISOString(),
              });
              // After status is updated, navigate to round order manager
              router.push({
                pathname: '/round-order-manager',
                params: { newClientData: JSON.stringify({ ...client, status: 'active', roundOrderNumber: null }) }
              });
            } catch (error) {
              console.error("Error restoring client: ", error);
              const msg = error instanceof Error ? error.message : String(error || '');
              if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
                Alert.alert(
                  'Permission Error',
                  'Could not restore this client due to account permissions. Please go to Settings and tap "Refresh Account", or log out and back in.'
                );
              } else {
                Alert.alert("Error", "Could not restore client.");
              }
            }
          },
        },
      ]
    );
  };

  const renderClient = ({ item }: { item: Client }) => {
    const displayAddress = item.address1 && item.town && item.postcode 
      ? `${item.address1}, ${item.town}, ${item.postcode}`
      : item.address || 'No address';

    return (
      <View style={styles.clientItem}>
        <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
        <ThemedText>{item.name}</ThemedText>
        <Pressable style={styles.restoreButton} onPress={() => handleRestoreClient(item.id)}>
          <ThemedText style={styles.restoreButtonText}>Restore</ThemedText>
        </Pressable>
      </View>
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
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <ThemedText style={{ color: '#007AFF' }}>{'< Back to Clients'}</ThemedText>
      </Pressable>
      <ThemedText type="title" style={styles.title}>Ex-Clients</ThemedText>
      <FlatList
        data={exClients}
        renderItem={renderClient}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText}>
            No ex-clients found.
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
  emptyText: { textAlign: 'center', marginTop: 50 },
  backButton: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  restoreButton: {
    marginTop: 12,
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
}); 