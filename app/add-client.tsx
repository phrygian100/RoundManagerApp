import { Picker } from '@react-native-picker/picker';
import { ThemedText } from 'components/ThemedText';
import { ThemedView } from 'components/ThemedView';
import { db } from 'core/firebase';
import { addWeeks, format, format as formatDate, parseISO, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { addDoc, collection } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput } from 'react-native';

function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function AddClientScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [frequency, setFrequency] = useState<'4' | '8' | 'one-off'>('4');
  const [nextVisit, setNextVisit] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [quote, setQuote] = useState('');
  const [mondayOptions, setMondayOptions] = useState<string[]>([]);

  useEffect(() => {
    const today = new Date();
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const mondays = Array.from({ length: 12 }, (_, i) =>
      format(addWeeks(startOfThisWeek, i), 'yyyy-MM-dd')
    );
    setMondayOptions(mondays);
    if (!nextVisit) setNextVisit(mondays[0]);
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !address.trim() || !frequency.trim() || !nextVisit.trim() || !mobileNumber.trim() || !quote.trim()) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }

    let frequencyValue: number | string;
    if (frequency === 'one-off') {
      frequencyValue = 'one-off';
    } else {
      frequencyValue = Number(frequency);
      if (isNaN(frequencyValue) || frequencyValue <= 0) {
        Alert.alert('Error', 'Frequency must be 4, 8, or one-off.');
        return;
      }
    }

    const quoteValue = Number(quote);
    if (isNaN(quoteValue) || quoteValue < 0) {
      Alert.alert('Error', 'Quote must be a valid number.');
      return;
    }

    try {
      await addDoc(collection(db, 'clients'), {
        name,
        address,
        frequency: frequencyValue,
        nextVisit,
        mobileNumber,
        quote: quoteValue,
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

      <ThemedText style={styles.label}>Mobile Number</ThemedText>
      <TextInput
        value={mobileNumber}
        onChangeText={setMobileNumber}
        style={styles.input}
        placeholder="07xxx..."
        keyboardType="phone-pad"
      />

      <ThemedText style={styles.label}>Quote (£)</ThemedText>
      <TextInput
        value={quote}
        onChangeText={setQuote}
        style={styles.input}
        placeholder="e.g. 25"
        keyboardType="numeric"
      />

      <ThemedText style={styles.label}>Visit Frequency</ThemedText>
      <Picker
        selectedValue={frequency}
        onValueChange={(itemValue) => setFrequency(itemValue as '4' | '8' | 'one-off')}
        style={styles.input}
      >
        <Picker.Item label="Every 4 weeks" value="4" />
        <Picker.Item label="Every 8 weeks" value="8" />
        <Picker.Item label="One-off" value="one-off" />
      </Picker>

      <ThemedText style={styles.label}>Week Commencing</ThemedText>
      <Picker
        selectedValue={nextVisit}
        onValueChange={setNextVisit}
        style={styles.input}
      >
        {mondayOptions.map((monday) => {
          const date = parseISO(monday);
          const day = getOrdinal(date.getDate());
          const month = formatDate(date, 'LLLL');
          const year = date.getFullYear();
          const label = `${day} ${month} ${year}`;
          return <Picker.Item key={monday} label={label} value={monday} />;
        })}
      </Picker>

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
