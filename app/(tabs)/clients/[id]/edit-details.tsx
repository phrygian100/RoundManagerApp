import { ThemedText } from 'components/ThemedText';
import { ThemedView } from 'components/ThemedView';
import { db } from 'core/firebase';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, TextInput } from 'react-native';


export default function EditClientDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof id === 'string') {
      const fetchClient = async () => {
        const docRef = doc(db, 'clients', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name || '');
          setAddress(data.address || '');
        }
        setLoading(false);
      };

      fetchClient();
    }
  }, [id]);

  const handleSave = async () => {
    if (!name.trim() || !address.trim()) {
      Alert.alert('Error', 'Please enter both name and address.');
      return;
    }

    if (typeof id === 'string') {
      await updateDoc(doc(db, 'clients', id), {
        name,
        address,
      });
      router.replace({ pathname: '/(tabs)/clients/[id]', params: { id } });
    }
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
      <ThemedText type="title">Edit Client Details</ThemedText>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Client Name"
      />

      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="Client Address"
      />

      <Button title="Save Changes" onPress={handleSave} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginVertical: 10,
    borderRadius: 8,
  },
});
