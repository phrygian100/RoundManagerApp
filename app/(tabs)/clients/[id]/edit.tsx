import { Picker } from '@react-native-picker/picker';
import { addWeeks, format, startOfWeek } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, TextInput } from 'react-native';
import { ThemedText } from '../../../../components/ThemedText';
import { ThemedView } from '../../../../components/ThemedView';
import { db } from '../../../../core/firebase';

export default function EditClientScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [frequency, setFrequency] = useState('');
  const [nextVisit, setNextVisit] = useState('');
  const [weekOptions, setWeekOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const weeks = Array.from({ length: 12 }, (_, i) =>
      format(addWeeks(startOfThisWeek, i), 'yyyy-MM-dd')
    );
    setWeekOptions(weeks);
  }, []);

  useEffect(() => {
    if (typeof id === 'string') {
      const fetchClient = async () => {
        const docRef = doc(db, 'clients', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name || '');
          setAddress(data.address || '');
          setFrequency(data.frequency?.toString() || '');
          setNextVisit(data.nextVisit || '');
        }
        setLoading(false);
      };

      fetchClient();
    }
  }, [id]);

  const handleSave = async () => {
    if (!frequency.trim() || !nextVisit.trim()) {
      Alert.alert('Error', 'Please fill out both frequency and next visit.');
      return;
    }

    const frequencyNumber = Number(frequency);
    if (isNaN(frequencyNumber) || frequencyNumber <= 0) {
      Alert.alert('Error', 'Frequency must be a positive number.');
      return;
    }

    if (typeof id === 'string') {
      await updateDoc(doc(db, 'clients', id), {
        frequency: frequencyNumber,
        nextVisit,
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
      <ThemedText type="title">Edit Service Routine</ThemedText>

      <ThemedText style={styles.label}>Name</ThemedText>
      <ThemedText>{name}</ThemedText>

      <ThemedText style={styles.label}>Address</ThemedText>
      <ThemedText>{address}</ThemedText>

      <ThemedText style={styles.label}>Visit Frequency (weeks)</ThemedText>
      <TextInput
        style={styles.input}
        value={frequency}
        onChangeText={setFrequency}
        placeholder="e.g. 4"
        keyboardType="numeric"
      />

      <ThemedText style={styles.label}>Week Commencing</ThemedText>
      <Picker
        selectedValue={nextVisit}
        onValueChange={(itemValue: string) => setNextVisit(itemValue)}
        style={styles.input}
      >
        {weekOptions.map((week) => (
          <Picker.Item key={week} label={week} value={week} />
        ))}
      </Picker>

      <Button title="Save Changes" onPress={handleSave} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    marginTop: 20,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
  },
});

