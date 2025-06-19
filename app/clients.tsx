import { ThemedText } from 'components/ThemedText';
import { ThemedView } from 'components/ThemedView';
import { db } from 'core/firebase';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';



type Client = {
  id: string;
  name: string;
  address: string;
  frequency?: number;
  nextVisit?: string;
};

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'clients'), (querySnapshot) => {
      const clientsData: Client[] = [];
      querySnapshot.forEach((doc) => {
        clientsData.push({ id: doc.id, ...doc.data() } as Client);
      });
      setClients(clientsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleClientPress = (clientId: string) => {
    router.push({ pathname: '/(tabs)/clients/[id]', params: { id: clientId } } as never);
  };

  const renderClient = ({ item }: { item: Client }) => (
    <Pressable onPress={() => handleClientPress(item.id)}>
      <ThemedView style={styles.clientItem}>
        <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
        <ThemedText>{item.address}</ThemedText>
        {item.frequency && (
          <ThemedText>Every {item.frequency} weeks</ThemedText>
        )}
        {item.nextVisit && (
          <ThemedText>
            Next Visit: {format(parseISO(item.nextVisit), 'd MMMM yyyy')}
          </ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );

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
      <FlatList
        data={clients}
        renderItem={renderClient}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText}>No clients found.</ThemedText>
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
});
