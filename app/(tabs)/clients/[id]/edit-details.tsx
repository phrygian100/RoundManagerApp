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
    // Check if we have either new format (address1 + town + postcode) or old format (address)
    const hasNewFormat = town.trim() && postcode.trim();
    const hasOldFormat = address.trim();
    
    if (!name.trim() || (!hasNewFormat && !hasOldFormat) || !accountNumber.trim() || !roundOrderNumber.trim() || !quote.trim() || !mobileNumber.trim()) {
      Alert.alert('Error', 'Please fill out all required fields. You need either the new address format (Address, Town, Postcode) or the old address format.');
      return;
    }

    if (typeof id === 'string') {
      const updateData: any = {
        name,
        accountNumber,
        roundOrderNumber: Number(roundOrderNumber),
        quote: Number(quote),
        mobileNumber,
      };

      // Use new format if provided, otherwise use old format
      if (hasNewFormat) {
        updateData.town = town;
        updateData.postcode = postcode;
        // Clear old address if using new format
        updateData.address = '';
      } else {
        updateData.address = address;
        // Clear new format fields if using old format
        updateData.town = '';
        updateData.postcode = '';
      }

      await updateDoc(doc(db, 'clients', id), updateData);
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
