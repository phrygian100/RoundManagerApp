import { ThemedText } from '../../../../components/ThemedText';
import { ThemedView } from '../../../../components/ThemedView';
import { db } from '../../../../core/firebase';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Button, Pressable, StyleSheet, TextInput } from 'react-native';


export default function EditClientDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [name, setName] = useState('');
  const [address1, setAddress1] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState(''); // For old address format
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
          setAddress(data.address || '');
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
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }

    if (typeof id === 'string') {
      const updateData: any = {
        name,
        address1,
        town,
        postcode,
        address, // Keep this for backward compatibility if needed
        accountNumber,
        roundOrderNumber: Number(roundOrderNumber),
        quote: Number(quote),
        mobileNumber,
      };

      await updateDoc(doc(db, 'clients', id), updateData);
      router.back();
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  const displayAddress =
    (town && postcode)
      ? `${address1}, ${town}, ${postcode}`
      : address || 'Edit Client Details';

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">{displayAddress}</ThemedText>

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
        placeholder="Address Line 1"
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
        value={address}
        onChangeText={setAddress}
        placeholder="Address"
      />

      <TextInput
        style={styles.input}
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder="Account Number"
      />

      <ThemedText style={styles.label}>Round Order</ThemedText>
      <Pressable style={styles.roundOrderButton} onPress={() => router.push({ pathname: '/round-order-manager', params: { editingClientId: id }})}>
        <ThemedText style={styles.roundOrderButtonText}>
          Change Round Order (Currently: {roundOrderNumber})
        </ThemedText>
      </Pressable>

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
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  roundOrderButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  roundOrderButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
