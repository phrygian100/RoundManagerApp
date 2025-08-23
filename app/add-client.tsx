import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { useQuoteToClient } from '../contexts/QuoteToClientContext';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { formatAuditDescription, logAction } from '../services/auditService';
import { getNextAccountNumber } from '../services/clientService';
import { createJobsForClient } from '../services/jobService';
import { checkClientLimit } from '../services/subscriptionService';

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
  const [frequency, setFrequency] = useState<number | 'one-off'>(4);
  const [isOneOff, setIsOneOff] = useState(false);
  const [frequencyText, setFrequencyText] = useState('4');
  const [nextVisit, setNextVisit] = useState(() => {
    const today = new Date();
    return format(today, 'yyyy-MM-dd');
  });
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

  // Memoized handlers to prevent unnecessary re-renders
  const handleOneOffToggle = useCallback(() => {
    const newIsOneOff = !isOneOff;
    setIsOneOff(newIsOneOff);
    
    if (newIsOneOff) {
      setFrequency('one-off');
      setFrequencyText('');
    } else {
      const newFrequency = Number(frequencyText) || 4;
      setFrequency(newFrequency);
    }
  }, [isOneOff, frequencyText]);

  const handleFrequencyTextChange = useCallback((text: string) => {
    // Only allow positive numbers
    if (/^\d*$/.test(text)) {
      setFrequencyText(text);
      const num = Number(text);
      if (num > 0) {
        setFrequency(num);
      }
    }
  }, []);

  const handleSourceChange = useCallback((itemValue: string) => {
    setSource(itemValue);
    setShowCustomSourceInput(itemValue === 'Other');
    if (itemValue !== 'Other') {
      setCustomSource('');
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const fetchNextNumbers = async () => {
      try {
        console.log('Fetching next numbers...');
        const nextAccountNumber = await getNextAccountNumber();
        if (isMountedRef.current) {
          setAccountNumber(nextAccountNumber);
        }

        // Get total number of clients to determine round order behavior
        const ownerId = await getDataOwnerId();
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
    const updates: (() => void)[] = [];
    
    if (params.roundOrderNumber) updates.push(() => setRoundOrderNumber(Number(params.roundOrderNumber)));
    if (params.name) updates.push(() => setName(String(params.name)));
    if (params.address1) updates.push(() => setAddress1(String(params.address1)));
    if (params.town) updates.push(() => setTown(String(params.town)));
    if (params.postcode) updates.push(() => setPostcode(String(params.postcode)));
    if (params.nextVisit) updates.push(() => setNextVisit(String(params.nextVisit)));
    if (params.mobileNumber) updates.push(() => setMobileNumber(String(params.mobileNumber)));
    if (params.quote) updates.push(() => setQuote(String(params.quote)));
    if (params.accountNumber) updates.push(() => setAccountNumber(Number(params.accountNumber)));
    if (params.source) updates.push(() => setSource(String(params.source)));
    if (params.email) updates.push(() => setEmail(String(params.email)));
    
    // Handle frequency updates in a batch
    if (params.frequency) {
      const freq = String(params.frequency);
      if (freq === 'one-off') {
        updates.push(() => {
          setIsOneOff(true);
          setFrequency('one-off');
          setFrequencyText('');
        });
      } else {
        const numFreq = Number(freq) || 4;
        updates.push(() => {
          setIsOneOff(false);
          setFrequency(numFreq);
          setFrequencyText(String(numFreq));
        });
      }
    }
    
    // Batch all updates
    updates.forEach(update => update());
  }, [params]);

  useEffect(() => {
    if (quoteData) {
      // Batch all quote data updates
      const updates = () => {
        setName(quoteData.name || '');
        setAddress1(quoteData.address || '');
        setTown(quoteData.town || '');
        setMobileNumber(quoteData.number || '');
        setQuote(quoteData.value || '');
        
        // Normalize frequency
        let freq = quoteData.frequency || '';
        if (freq === '4 weekly') freq = '4';
        if (freq === '8 weekly') freq = '8';
        if (freq === 'one-off' || freq === 'one off') {
          setIsOneOff(true);
          setFrequency('one-off');
          setFrequencyText('');
        } else {
          const numFreq = Number(freq) || 4;
          setIsOneOff(false);
          setFrequency(numFreq);
          setFrequencyText(String(numFreq));
        }
      };
      
      updates();
    }
  }, [quoteData]);

  const handleSave = async () => {
    console.log('handleSave: Save Client button pressed');
    if (isSaving) {
      console.log('Already saving, preventing duplicate submission');
      return;
    }

    // Check subscription limits before proceeding
    try {
      console.log('🔍 Checking client limit before save...');
      const clientLimitCheck = await checkClientLimit();
      console.log('🔍 Client limit check result:', clientLimitCheck);
      
      if (!clientLimitCheck.canAdd) {
        console.log('🚫 Client limit reached - showing upgrade alert');
        const message = clientLimitCheck.limit 
          ? `You've reached the limit of ${clientLimitCheck.limit} clients on your current plan. You currently have ${clientLimitCheck.currentCount} clients.\n\n🚀 Upgrade to Premium for:\n• Unlimited clients\n• Team member creation\n• Priority support\n\nOnly £18/month`
          : 'Unable to add more clients at this time.';
        
        if (Platform.OS === 'web') {
          window.alert('🚫 Client Limit Reached\n\n' + message);
        } else {
          Alert.alert('🚫 Client Limit Reached', message);
        }
        return;
      }
      console.log('✅ Client limit check passed - can add client');
    } catch (error) {
      console.error('❌ Error checking client limit:', error);
      const errorMessage = 'Unable to verify subscription status. Please try again.';
      if (Platform.OS === 'web') {
        window.alert('Error\n\n' + errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
      return;
    }

    if (!name.trim() || !address1.trim() || !town.trim() || !nextVisit.trim() || !mobileNumber.trim() || !quote.trim()) {
      console.log('Validation failed: missing required fields');
      Alert.alert('Error', 'Please fill out all required fields.');
      return;
    }

    // Validate frequency
    if (!isOneOff && (!frequencyText.trim() || isNaN(Number(frequencyText)) || Number(frequencyText) <= 0)) {
      console.log('Validation failed: invalid frequency');
      Alert.alert('Error', 'Please enter a valid frequency (number of weeks) or select One-off.');
      return;
    }

    const startingBalanceValue = Number(startingBalance);
    if (isNaN(startingBalanceValue)) {
      console.log('Validation failed: invalid starting balance');
      Alert.alert('Error', 'Starting Balance must be a valid number.');
      return;
    }

    // Validate round order number is set
    if (roundOrderNumber === null || roundOrderNumber === undefined) {
      console.log('Validation failed: missing round order number');
      Alert.alert('Error', 'Please set a round order position for this client.');
      return;
    }

    let frequencyValue: number | string;
    if (frequency === 'one-off') {
      frequencyValue = 'one-off';
    } else {
      frequencyValue = Number(frequency);

      if (isNaN(frequencyValue) || frequencyValue <= 0) {
        console.log('Validation failed: invalid frequency');
        Alert.alert('Error', 'Frequency must be a positive number of weeks.');
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
        accountNumber: `RWC${accountNumber}`, // Format as RWC### for consistency with CSV imports
        roundOrderNumber,
        status: 'active',
        dateAdded: new Date().toISOString(),
        source: source === 'Other' ? customSource : source,
        email,
        startingBalance: startingBalanceValue,
        ownerId,
      });

      console.log('Client created with ID:', clientRef.id);

      // Log the client creation action
      const clientAddress = `${address1}, ${town}, ${postcode}`;
      await logAction(
        'client_created',
        'client',
        clientRef.id,
        formatAuditDescription('client_created', clientAddress)
      );

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

      // After saving client, if quoteData is present, handle quote notes and mark quote as complete
      if (quoteData) {
        // If quote has notes, add them as the first account note
        if (quoteData.notes) {
          const firstNote = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            author: 'Imported from Quote',
            authorId: 'system',
            text: quoteData.notes
          };
          
          await updateDoc(doc(db, 'clients', clientRef.id), {
            accountNotes: [firstNote]
          });
        }
        
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
          onValueChange={handleSourceChange}
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
          value={accountNumber ? `RWC${accountNumber}` : 'Loading...'}
          editable={false}
        />

        <ThemedText style={styles.label}>Round Order</ThemedText>
        <Pressable style={styles.roundOrderButton} onPress={handleRoundOrderPress}>
          <ThemedText style={styles.roundOrderButtonText}>
            {roundOrderNumber ? `Round Order: ${roundOrderNumber}` : 'Set Round Order Position'}
          </ThemedText>
        </Pressable>

        <ThemedText style={styles.label}>Visit Frequency</ThemedText>
        <View style={styles.frequencyContainer}>
          <Pressable 
            style={[styles.checkboxContainer, isOneOff && styles.checkboxChecked]}
            onPress={handleOneOffToggle}
          >
            <ThemedText style={styles.checkboxText}>One-off</ThemedText>
          </Pressable>
          <View 
            style={[
              styles.frequencyInputContainer, 
              { display: isOneOff ? 'none' : 'flex' }
            ]}
            key="frequency-input-container"
          >
            <TextInput
              value={frequencyText}
              onChangeText={handleFrequencyTextChange}
              style={styles.frequencyInput}
              placeholder="e.g. 4"
              keyboardType="numeric"
            />
            <ThemedText style={styles.frequencyLabel}>weeks</ThemedText>
          </View>
        </View>

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
                  console.log('DateTimePicker onChange:', { event, selectedDate, platform: Platform.OS });
                  
                  // On Android, the picker closes automatically when a date is selected
                  // On iOS, we need to handle the spinner mode differently
                  if (Platform.OS === 'android') {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
                      console.log('Android: Setting nextVisit to:', formattedDate);
                      setNextVisit(formattedDate);
                    }
                  } else {
                    // iOS spinner mode - only update when user confirms
                    if (event.type === 'set' && selectedDate) {
                      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
                      console.log('iOS: Setting nextVisit to:', formattedDate);
                      setNextVisit(formattedDate);
                    }
                    if (event.type === 'dismissed') {
                      setShowDatePicker(false);
                    }
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
  frequencyContainer: {
    gap: 12,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxText: {
    fontSize: 16,
    fontWeight: '500',
  },
  frequencyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  frequencyInput: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  frequencyLabel: {
    fontSize: 16,
    color: '#666',
  },
});
