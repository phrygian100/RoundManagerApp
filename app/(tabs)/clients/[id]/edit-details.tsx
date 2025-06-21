import { ThemedText } from '../../../../components/ThemedText';
import { ThemedView } from '../../../../components/ThemedView';
import { db } from '../../../../core/firebase';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, TextInput } from 'react-native';


export default function EditClientDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [name, setName] = useState('');
  const [address1, setAddress1] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [roundOrderNumber, setRoundOrderNumber] = useState('');
  const [quote, setQuote] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof id === 'string') {
      const fetchClient = async () => {
        const docRef = doc(db, 'clients', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name || '');
          setAddress1(data.address1 || '');
          setTown(data.town || '');
          setPostcode(data.postcode || '');
          setAccountNumber(data.accountNumber || '');
          setRoundOrderNumber(data.roundOrderNumber ? String(data.roundOrderNumber) : '');
          setQuote(data.quote !== undefined ? String(data.quote) : '');
          setMobileNumber(data.mobileNumber || '');
        }
        setLoading(false);
      };

      fetchClient();
    }
  }, [id]);

  const handleSave = async () => {
    if (!name.trim() || !address1.trim() || !town.trim() || !postcode.trim() || !accountNumber.trim() || !roundOrderNumber.trim() || !quote.trim() || !mobileNumber.trim()) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }

    if (typeof id === 'string') {
      await updateDoc(doc(db, 'clients', id), {
        name,
        address1,
        town,
        postcode,
        accountNumber,
        roundOrderNumber: Number(roundOrderNumber),
        quote: Number(quote),
        mobileNumber,
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
        value={address1}
        onChangeText={setAddress1}
        placeholder="Address (1st line)"
      />

      <TextInput
        style={styles.input}
        value={town}
        onChangeText={setTown}
        placeholder="Town"
      />

      <TextInput
        style={styles.input}
        value={postcode}
        onChangeText={setPostcode}
        placeholder="Postcode"
      />

      <TextInput
        style={styles.input}
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder="Account Number"
      />

      <TextInput
        style={styles.input}
        value={roundOrderNumber}
        onChangeText={setRoundOrderNumber}
        placeholder="Round Order Number"
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        value={quote}
        onChangeText={setQuote}
        placeholder="Quote (£)"
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        value={mobileNumber}
        onChangeText={setMobileNumber}
        placeholder="Mobile Number"
        keyboardType="phone-pad"
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
