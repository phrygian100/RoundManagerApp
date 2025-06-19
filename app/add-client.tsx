import { ThemedText } from 'components/ThemedText';
import { ThemedView } from 'components/ThemedView';
import { db } from 'core/firebase';
import { useRouter } from 'expo-router';
import { addDoc, collection } from 'firebase/firestore';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput } from 'react-native';

export default function AddClientScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [frequency, setFrequency] = useState('');
  const [nextVisit, setNextVisit] = useState('');

  const handleSave = async () => {
    if (!name.trim() || !address.trim() || !frequency.trim() || !nextVisit.trim()) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }

    const frequencyNumber = Number(frequency);
    if (isNaN(frequencyNumber) || frequencyNumber <= 0) {
      Alert.alert('Error', 'Frequency must be a positive number.');
      return;
    }

    try {
      await addDoc(collection(db, 'clients'), {
        name,
        address,
        frequency: frequencyNumber,
        nextVisit,
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save client.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Add New Client</ThemedText>

      <ThemedText style={styles.label}>Name</ThemedText>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholder="John Smith"
      />

      <ThemedText style={styles.label}>Address</ThemedText>
      <TextInput
        value={address}
        onChangeText={setAddress}
        style={styles.input}
        placeholder="123 Oak Avenue"
      />

      <ThemedText style={styles.label}>Visit Frequency (days)</ThemedText>
      <TextInput
        value={frequency}
        onChangeText={setFrequency}
        style={styles.input}
        placeholder="e.g. 28"
        keyboardType="numeric"
      />

      <ThemedText style={styles.label}>Next Visit Date (YYYY-MM-DD)</ThemedText>
      <TextInput
        value={nextVisit}
        onChangeText={setNextVisit}
        style={styles.input}
        placeholder="e.g. 2025-07-01"
      />

      <Pressable style={styles.button} onPress={handleSave}>
        <ThemedText style={styles.buttonText}>Save Client</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 60 },
  label: { fontSize: 16, marginBottom: 8, marginTop: 16 },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    marginTop: 32,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
