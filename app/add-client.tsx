import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { useQuoteToClient } from '../contexts/QuoteToClientContext';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { createJobsForClient } from '../services/jobService';

function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function AddClientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isMountedRef = useRef(true);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [address1, setAddress1] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [frequency, setFrequency] = useState<'4' | '8' | 'one-off'>('4');
  const [nextVisit, setNextVisit] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [quote, setQuote] = useState('');
  const [accountNumber, setAccountNumber] = useState<number | null>(null);
  const [roundOrderNumber, setRoundOrderNumber] = useState<number | null>(null);
  const [totalClients, setTotalClients] = useState(0);
  const [showRoundOrderButton, setShowRoundOrderButton] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [source, setSource] = useState('');
  const [customSource, setCustomSource] = useState('');
  const [showCustomSourceInput, setShowCustomSourceInput] = useState(false);
  const [email, setEmail] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startingBalance, setStartingBalance] = useState('0');
  const { quoteData, clearQuoteData } = useQuoteToClient();

  const sourceOptions = [
    'Google',
    'Facebook',
    'Canvassing',
    'Referral',
    'Word of mouth',
    'Flyers / Leaflets',
    'Cold calling',
    'Van signage/Branding',
    'Found on the curb',
    'Other'
  ];

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!nextVisit) {
      const today = new Date();
      setNextVisit(format(today, 'yyyy-MM-dd'));
    }

    const fetchNextNumbers = async () => {
      try {
        console.log('Fetching next numbers...');
        
        // Fetch next account number
        const ownerId = await getDataOwnerId();
        let nextAccountNumber = 1;
        try {
          const q = query(
            collection(db, 'clients'),
            where('ownerId', '==', ownerId),
            orderBy('accountNumber', 'desc'),
            limit(1)
          );
          const qs = await getDocs(q);
          if (!qs.empty) {
            const highestClient = qs.docs[0].data();
            nextAccountNumber = (highestClient.accountNumber || 0) + 1;
          }
        } catch (err) {
          console.warn('Composite index missing for accountNumber query, falling back', err);
          const qs = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
          qs.forEach(docSnap => {
            const num = docSnap.data().accountNumber || 0;
            if (num >= nextAccountNumber) nextAccountNumber = num + 1;
          });
        }
        
        if (isMountedRef.current) {
          setAccountNumber(nextAccountNumber);
        }

        // Get total number of clients to determine round order behavior
        const allClientsSnapshot = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
        const clientCount = allClientsSnapshot.size;
        console.log('Current client count:', clientCount);
        
        if (isMountedRef.current) {
          setTotalClients(clientCount);
          
          // Show round order button for 3rd client onwards
          const shouldShowRoundOrderButton = clientCount >= 2;
          setShowRoundOrderButton(shouldShowRoundOrderButton);
          console.log('Should show round order button:', shouldShowRoundOrderButton);
          
          // Set default round order number for first 2 clients
          if (clientCount < 2) {
            setRoundOrderNumber(clientCount + 1);
            console.log('Set round order to:', clientCount + 1);
          }
        }
      } catch (error) {
        console.error('Error fetching next numbers:', error);
      }
    };

    fetchNextNumbers();
  }, []);

  useEffect(() => {
    // If returning from round order manager, update all fields from params if present
    if (params.roundOrderNumber) setRoundOrderNumber(Number(params.roundOrderNumber));
    if (params.name) setName(String(params.name));
    if (params.address1) setAddress1(String(params.address1));
    if (params.town) setTown(String(params.town));
    if (params.postcode) setPostcode(String(params.postcode));
    if (params.frequency) setFrequency(params.frequency as '4' | '8' | 'one-off');
    if (params.nextVisit) setNextVisit(String(params.nextVisit));
    if (params.mobileNumber) setMobileNumber(String(params.mobileNumber));
    if (params.quote) setQuote(String(params.quote));
    if (params.accountNumber) setAccountNumber(Number(params.accountNumber));
    if (params.status) {/* ignore, always 'active' for new */}
    if (params.source) setSource(String(params.source));
    if (params.email) setEmail(String(params.email));
  }, [params]);

  useEffect(() => {
    if (quoteData) {
      setName(quoteData.name || '');
      setAddress1(quoteData.address || '');
      setTown(quoteData.town || '');
      setMobileNumber(quoteData.number || '');
      setQuote(quoteData.value || '');
      // Normalize frequency
      let freq = quoteData.frequency || '';
      if (freq === '4 weekly') freq = '4';
      if (freq === '8 weekly') freq = '8';
      setFrequency((freq as '4' | '8' | 'one-off') || '4');
      // setNotes(quoteData.notes || '');
      // setNextVisit(quoteData.date || '');
    }
  }, [quoteData]);

  const handleSave = async () => {
    console.log('handleSave: Save Client button pressed');
    if (isSaving) {
      console.log('Already saving, preventing duplicate submission');
      return;
    }

    if (!name.trim() || !address1.trim() || !town.trim() || !frequency.trim() || !nextVisit.trim() || !mobileNumber.trim() || !quote.trim()) {
      console.log('Validation failed: missing required fields');
      Alert.alert('Error', 'Please fill out all required fields.');
      return;
    }

    const startingBalanceValue = Number(startingBalance);
    if (isNaN(startingBalanceValue)) {
      console.log('Validation failed: invalid starting balance');
      Alert.alert('Error', 'Starting Balance must be a valid number.');
      return;
    }

    let frequencyValue: number | string;
    if (frequency === 'one-off') {
      frequencyValue = 'one-off';
    } else {
      frequencyValue = Number(frequency);

      if (isNaN(frequencyValue) || frequencyValue <= 0) {
        console.log('Validation failed: invalid frequency');
        Alert.alert('Error', 'Frequency must be 4, 8, or one-off.');
        return;
      }
    }

    const quoteValue = Number(quote);
    if (isNaN(quoteValue) || quoteValue < 0) {
      console.log('Validation failed: invalid quote value');
      Alert.alert('Error', 'Quote must be a valid number.');
      return;
    }

    try {
      setIsSaving(true);
      console.log('Starting client creation...');
      
      // Create the client first
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        Alert.alert('Error', 'Could not determine account owner. Please log in again.');
        setIsSaving(false);
        return;
      }
      const clientRef = await addDoc(collection(db, 'clients'), {
        name,
        address1,
        town,
        postcode,
        // For backward compatibility, also store combined address
        address: `${address1}, ${town}, ${postcode}`,
        frequency: frequencyValue,
        nextVisit,
        mobileNumber,
        quote: quoteValue,
        accountNumber,
        roundOrderNumber,
        status: 'active',
        dateAdded: new Date().toISOString(),
        source: source === 'Other' ? customSource : source,
        email,
        startingBalance: startingBalanceValue,
        ownerId,
      });

      console.log('Client created with ID:', clientRef.id);

      // Create jobs for the new client (only for recurring clients, not one-off)
      if (frequencyValue !== 'one-off') {
        try {
          const jobsCreated = await createJobsForClient(clientRef.id, 8, true);
          console.log(`Created ${jobsCreated} jobs for new client`);
        } catch (jobError) {
          console.error('Error creating jobs for new client:', jobError);
          // Don't fail the client creation if job creation fails
        }
      }

      // After saving client, if quoteData is present, mark quote as complete
      if (quoteData) {
        console.log('Updating quote status to complete for quote id:', quoteData.id);
        await updateDoc(doc(db, 'quotes', quoteData.id), { status: 'complete' });
        clearQuoteData();
      }

      console.log('Client creation completed successfully, navigating to home');
      router.replace('/');
    } catch (error) {
      console.log('Error in handleSave:', error);
      Alert.alert('Error', 'Could not save client.');
      console.error('Error saving client:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRoundOrderPress = () => {
    // Prepare the new client data, including address1, town, postcode
    const newClientData = {
      name,
      address1,
      town,
      postcode,
      frequency,
      nextVisit,
      mobileNumber,
      quote: Number(quote),
      accountNumber,
      status: 'active',
      source: source === 'Other' ? customSource : source,
      email,
    };

    // Navigate to round order manager with the client data
    router.push({
      pathname: '/round-order-manager' as any,
      params: { newClientData: JSON.stringify(newClientData) }
    });
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContentContainer}>

        <View style={styles.titleRow}>
          <ThemedText type="title">Add New Client</ThemedText>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
            <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.label}>Address Line 1</ThemedText>
        <TextInput
          value={address1}
          onChangeText={setAddress1}
          style={styles.input}
          placeholder="123 Oak Avenue"
        />
        <ThemedText style={styles.label}>Town</ThemedText>
        <TextInput
          value={town}
          onChangeText={setTown}
          style={styles.input}
          placeholder="Springfield"
        />
        <ThemedText style={styles.label}>Postcode</ThemedText>
        <TextInput
          value={postcode}
          onChangeText={setPostcode}
          style={styles.input}
          placeholder="AB12 3CD"
        />

        <ThemedText style={styles.label}>Name</ThemedText>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="John Smith"
        />

        <ThemedText style={styles.label}>Mobile Number</ThemedText>
        <TextInput
          value={mobileNumber}
          onChangeText={setMobileNumber}
          style={styles.input}
          placeholder="07xxx..."
          keyboardType="phone-pad"
        />

        <ThemedText style={styles.label}>Email</ThemedText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="john.smith@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <ThemedText style={styles.label}>Source</ThemedText>
        <Picker
          selectedValue={source}
          onValueChange={(itemValue) => {
            setSource(itemValue as string);
            setShowCustomSourceInput(itemValue === 'Other');
            if (itemValue !== 'Other') {
              setCustomSource('');
            }
          }}
          style={styles.input}
        >
          {sourceOptions.map((option) => (
            <Picker.Item key={option} label={option} value={option} />
          ))}
        </Picker>

        {showCustomSourceInput && (
          <>
            <ThemedText style={styles.label}>Custom Source</ThemedText>
            <TextInput
              value={customSource}
              onChangeText={setCustomSource}
              style={styles.input}
              placeholder="Enter custom source..."
            />
          </>
        )}

        <ThemedText style={styles.label}>Quote (£)</ThemedText>
        <TextInput
          value={quote}
          onChangeText={setQuote}
          style={styles.input}
          placeholder="e.g. 25"
          keyboardType="numeric"
        />

        <ThemedText style={styles.label}>Account Number</ThemedText>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={accountNumber ? String(accountNumber) : 'Loading...'}
          editable={false}
        />

        <ThemedText style={styles.label}>Round Order</ThemedText>
        <Pressable style={styles.roundOrderButton} onPress={handleRoundOrderPress}>
          <ThemedText style={styles.roundOrderButtonText}>
            {roundOrderNumber ? `Round Order: ${roundOrderNumber}` : 'Set Round Order Position'}
          </ThemedText>
        </Pressable>

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

        <ThemedText style={styles.label}>Starting Date</ThemedText>
        {Platform.OS === 'web' ? (
          <input
            type="date"
            value={nextVisit}
            onChange={e => setNextVisit(e.target.value)}
            style={{ ...styles.input, height: 50, padding: 10, fontSize: 16 }}
          />
        ) : (
          <>
            <Pressable
              style={[styles.input, { justifyContent: 'center' }]}
              onPress={() => setShowDatePicker(true)}
            >
              <ThemedText>
                {nextVisit ? format(parseISO(nextVisit), 'do MMMM yyyy') : 'Select date'}
              </ThemedText>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={nextVisit ? parseISO(nextVisit) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) {
                    setNextVisit(format(selectedDate, 'yyyy-MM-dd'));
                  }
                }}
              />
            )}
          </>
        )}

        <ThemedText style={styles.label}>Starting Balance</ThemedText>
        <TextInput
          value={startingBalance}
          onChangeText={text => {
            // Only allow valid numbers (including negative)
            if (/^-?\d*(\.\d*)?$/.test(text)) setStartingBalance(text);
          }}
          style={styles.input}
          placeholder="0"
          keyboardType="numeric"
        />

        <Button
          title={isSaving ? 'Saving...' : 'Save Client'}
          onPress={handleSave}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContentContainer: {
    padding: 16,
    paddingTop: 60,
    paddingBottom: 100,
  },
  label: { fontSize: 16, marginBottom: 8, marginTop: 16 },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  disabledInput: {
    backgroundColor: '#f0f0f0',
    color: '#999',
  },
  button: {
    backgroundColor: '#007AFF',
    marginTop: 32,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  roundOrderButton: {
    height: 50,
    borderColor: '#007AFF',
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roundOrderButtonText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  homeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});
