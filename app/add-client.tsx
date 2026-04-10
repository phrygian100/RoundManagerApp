import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import 'react-datepicker/dist/react-datepicker.css';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

let DatePicker: any = null;
if (Platform.OS === 'web') {
  DatePicker = require('react-datepicker').default;
  require('react-datepicker/dist/react-datepicker.css');
}
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

function getParamValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
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
  const [webDate, setWebDate] = useState<Date>(new Date());
  const [startingBalance, setStartingBalance] = useState('0');
  const lastAppliedParamsSignatureRef = useRef<string>('');
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

  const handleQuickFrequencySelect = useCallback((weeks: number) => {
    setIsOneOff(false);
    setFrequency(weeks);
    setFrequencyText(String(weeks));
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
    const incoming = {
      roundOrderNumber: getParamValue(params.roundOrderNumber as any),
      name: getParamValue(params.name as any),
      address1: getParamValue(params.address1 as any),
      town: getParamValue(params.town as any),
      postcode: getParamValue(params.postcode as any),
      nextVisit: getParamValue(params.nextVisit as any),
      mobileNumber: getParamValue(params.mobileNumber as any),
      quote: getParamValue(params.quote as any),
      accountNumber: getParamValue(params.accountNumber as any),
      source: getParamValue(params.source as any),
      email: getParamValue(params.email as any),
      frequency: getParamValue(params.frequency as any),
    };

    // Prevent re-applying identical params on every render.
    const signature = JSON.stringify(incoming);
    if (lastAppliedParamsSignatureRef.current === signature) {
      return;
    }

    // If there are no incoming params, don't overwrite local edits.
    const hasAnyIncomingValue = Object.values(incoming).some(Boolean);
    if (!hasAnyIncomingValue) {
      return;
    }
    lastAppliedParamsSignatureRef.current = signature;

    // If returning from round order manager, update all fields from params if present.
    const updates: (() => void)[] = [];
    
    if (incoming.roundOrderNumber) updates.push(() => setRoundOrderNumber(Number(incoming.roundOrderNumber)));
    if (incoming.name) updates.push(() => setName(incoming.name));
    if (incoming.address1) updates.push(() => setAddress1(incoming.address1));
    if (incoming.town) updates.push(() => setTown(incoming.town));
    if (incoming.postcode) updates.push(() => setPostcode(incoming.postcode));
    if (incoming.nextVisit) updates.push(() => {
      setNextVisit(incoming.nextVisit);
      const parsedDate = parseISO(incoming.nextVisit);
      if (!Number.isNaN(parsedDate.getTime())) {
        setWebDate(parsedDate);
      }
    });
    if (incoming.mobileNumber) updates.push(() => setMobileNumber(incoming.mobileNumber));
    if (incoming.quote) updates.push(() => setQuote(incoming.quote));
    if (incoming.accountNumber) updates.push(() => setAccountNumber(Number(incoming.accountNumber)));
    if (incoming.source) updates.push(() => setSource(incoming.source));
    if (incoming.email) updates.push(() => setEmail(incoming.email));
    
    // Handle frequency updates in a batch
    if (incoming.frequency) {
      const freq = incoming.frequency;
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
  }, [
    params.roundOrderNumber,
    params.name,
    params.address1,
    params.town,
    params.postcode,
    params.nextVisit,
    params.mobileNumber,
    params.quote,
    params.accountNumber,
    params.source,
    params.email,
    params.frequency,
  ]);

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
        accountId: ownerId, // Explicitly set accountId for Firestore rules (getDataOwnerId returns accountId)
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
          const jobsCreated = await createJobsForClient(clientRef.id, 52, true);
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
          <View style={styles.quickFrequencyRow}>
            {[4, 6, 8].map((weeks) => {
              const isActive = !isOneOff && Number(frequency) === weeks;
              return (
                <Pressable
                  key={weeks}
                  style={[styles.quickFrequencyChip, isActive && styles.quickFrequencyChipActive]}
                  onPress={() => handleQuickFrequencySelect(weeks)}
                >
                  <ThemedText style={[styles.quickFrequencyChipText, isActive && styles.quickFrequencyChipTextActive]}>
                    {weeks} weekly
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Pressable 
            style={[styles.checkboxContainer, isOneOff && styles.checkboxChecked]}
            onPress={handleOneOffToggle}
          >
            <ThemedText style={[styles.checkboxText, isOneOff && styles.checkboxTextChecked]}>
              {isOneOff ? '✓ One-off job' : 'One-off job'}
            </ThemedText>
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

        <ThemedText style={styles.label}>First Service Date</ThemedText>
        <Pressable
          style={[styles.input, { justifyContent: 'center' }]}
          onPress={() => setShowDatePicker(true)}
        >
          <ThemedText>
            {nextVisit ? format(parseISO(nextVisit), 'do MMMM yyyy') : 'Select date'}
          </ThemedText>
        </Pressable>
        
        {/* Native Date Picker */}
        {showDatePicker && Platform.OS !== 'web' && (
          <DateTimePicker
            value={nextVisit ? parseISO(nextVisit) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              // On Android, the picker closes automatically when a date is selected
              // On iOS, we need to handle the spinner mode differently
              if (Platform.OS === 'android') {
                setShowDatePicker(false);
                if (selectedDate) {
                  const formattedDate = format(selectedDate, 'yyyy-MM-dd');
                  setNextVisit(formattedDate);
                }
              } else {
                // iOS spinner mode - only update when user confirms
                if (event.type === 'set' && selectedDate) {
                  const formattedDate = format(selectedDate, 'yyyy-MM-dd');
                  setNextVisit(formattedDate);
                }
                if (event.type === 'dismissed') {
                  setShowDatePicker(false);
                }
              }
            }}
          />
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

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <ThemedText style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Client'}</ThemedText>
        </Pressable>
      </ScrollView>

      {/* Web Date Picker Overlay - outside ScrollView for proper positioning */}
      {showDatePicker && Platform.OS === 'web' && DatePicker && (
        <View style={styles.webDatePickerOverlay}>
          <View style={styles.webDatePickerContainer}>
            <DatePicker
              selected={webDate}
              onChange={(date: Date | null) => {
                if (date) {
                  const yyyy = date.getFullYear();
                  const mm = String(date.getMonth() + 1).padStart(2, '0');
                  const dd = String(date.getDate()).padStart(2, '0');
                  setNextVisit(`${yyyy}-${mm}-${dd}`);
                  setWebDate(date);
                }
                setShowDatePicker(false);
              }}
              inline
            />
            <Pressable style={styles.cancelDateButton} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.cancelDateText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  quickFrequencyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickFrequencyChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickFrequencyChipActive: {
    borderColor: '#007AFF',
    backgroundColor: '#eaf3ff',
  },
  quickFrequencyChipText: {
    color: '#37474f',
    fontWeight: '600',
  },
  quickFrequencyChipTextActive: {
    color: '#007AFF',
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
  checkboxTextChecked: {
    color: '#fff',
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
  webDatePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  webDatePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  cancelDateButton: {
    marginTop: 12,
    padding: 10,
    alignItems: 'center',
  },
  cancelDateText: {
    color: '#007AFF',
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    marginTop: 24,
    borderRadius: 10,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ec3f7',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
