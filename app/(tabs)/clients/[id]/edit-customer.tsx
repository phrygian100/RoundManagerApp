import DateTimePicker from '@react-native-community/datetimepicker';
import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Button, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../../../../components/ThemedText';
import { ThemedView } from '../../../../components/ThemedView';
import { db } from '../../../../core/firebase';
import { getDataOwnerId } from '../../../../core/session';
import { formatAuditDescription, logAction } from '../../../../services/auditService';
import { createJobsForClient } from '../../../../services/jobService';

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // Client details state
  const [name, setName] = useState('');
  const [address1, setAddress1] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState(''); // For old address format
  const [accountNumber, setAccountNumber] = useState('');
  const [roundOrderNumber, setRoundOrderNumber] = useState('');
  const [quote, setQuote] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');

  // Service routine state
  const [frequency, setFrequency] = useState('');
  const [nextVisit, setNextVisit] = useState('');
  const [weekOptions, setWeekOptions] = useState<string[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeSection, setActiveSection] = useState<'details' | 'routine'>('details');
  const [showDatePicker, setShowDatePicker] = useState(false);

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
          
          // Set client details
          setName(data.name || '');
          setAddress1(data.address1 || '');
          setTown(data.town || '');
          setPostcode(data.postcode || '');
          setAddress(data.address || '');
          setAccountNumber(data.accountNumber || '');
          setRoundOrderNumber(data.roundOrderNumber ? String(data.roundOrderNumber) : '');
          setQuote(data.quote !== undefined ? String(data.quote) : '');
          setMobileNumber(data.mobileNumber || '');
          setEmail(data.email || '');
          
          // Set service routine
          setFrequency(data.frequency?.toString() || '');
          setNextVisit(data.nextVisit || '');
        }
        setLoading(false);
      };

      fetchClient();
    }
  }, [id]);

  const regenerateJobsForClient = async () => {
    if (typeof id !== 'string') return;
    
    try {
      console.log('Starting job regeneration for client:', id);
      
      // 1. Delete existing future jobs for this client
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        console.error('Could not determine owner ID');
        throw new Error('Could not determine owner ID');
      }
      
      const jobsRef = collection(db, 'jobs');
      const futureJobsQuery = query(
        jobsRef, 
        where('clientId', '==', id),
        where('ownerId', '==', ownerId),
        where('status', 'in', ['pending', 'scheduled', 'in_progress'])
      );
      
      const futureJobsSnapshot = await getDocs(futureJobsQuery);
      console.log('Found', futureJobsSnapshot.size, 'existing future jobs to delete');
      
      const batch = writeBatch(db);
      
      futureJobsSnapshot.forEach((jobDoc) => {
        batch.delete(jobDoc.ref);
      });
      
      await batch.commit();
      console.log('Deleted existing future jobs');

      // 2. Use the centralized job creation function
      const jobsCreated = await createJobsForClient(id, 8, false);
      console.log('Successfully created', jobsCreated, 'new jobs');
      
      return jobsCreated;
    } catch (error) {
      console.error('Error regenerating jobs:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }

    if (typeof id === 'string') {
      setUpdating(true);
      try {
        const updateData: any = {
          name,
          address1,
          town,
          postcode,
          address: `${address1}, ${town}, ${postcode}`,
          accountNumber,
          roundOrderNumber: Number(roundOrderNumber),
          quote: Number(quote),
          mobileNumber,
          email,
        };

        // Add service routine data if provided
        if (frequency.trim() && nextVisit.trim()) {
          const frequencyNumber = Number(frequency);
          if (isNaN(frequencyNumber) || frequencyNumber <= 0) {
            Alert.alert('Error', 'Frequency must be a positive number.');
            setUpdating(false);
            return;
          }
          updateData.frequency = frequencyNumber;
          updateData.nextVisit = nextVisit;
        }

        await updateDoc(doc(db, 'clients', id), updateData);
        
        // Log the client edit action
        const clientAddress = `${address1}, ${town}, ${postcode}`;
        await logAction(
          'client_edited',
          'client',
          id,
          formatAuditDescription('client_edited', clientAddress)
        );
        
        // Regenerate jobs if service routine was updated
        if (frequency.trim() && nextVisit.trim()) {
          const jobsCreated = await regenerateJobsForClient();
          Alert.alert('Success', `Customer updated and ${jobsCreated} jobs regenerated!`);
        } else {
          Alert.alert('Success', 'Customer details updated!');
        }
        
        router.back();
      } catch (error) {
        console.error('Error updating client:', error);
        Alert.alert('Error', 'Failed to update client. Please try again.');
      } finally {
        setUpdating(false);
      }
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
      : address || 'Edit Customer';

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">{displayAddress}</ThemedText>

      {/* Section Tabs */}
      <View style={styles.tabContainer}>
        <Pressable 
          style={[styles.tab, activeSection === 'details' && styles.activeTab]} 
          onPress={() => setActiveSection('details')}
        >
          <ThemedText style={[styles.tabText, activeSection === 'details' && styles.activeTabText]}>
            Customer Details
          </ThemedText>
        </Pressable>
        <Pressable 
          style={[styles.tab, activeSection === 'routine' && styles.activeTab]} 
          onPress={() => setActiveSection('routine')}
        >
          <ThemedText style={[styles.tabText, activeSection === 'routine' && styles.activeTabText]}>
            Service Routine
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {activeSection === 'details' ? (
          <View style={styles.section}>
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
              placeholder="Address (legacy format)"
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

            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
            />
          </View>
        ) : (
          <View style={styles.section}>
            <ThemedText style={styles.label}>Name</ThemedText>
            <ThemedText style={styles.readOnlyText}>{name}</ThemedText>

            <ThemedText style={styles.label}>Address</ThemedText>
            <ThemedText style={styles.readOnlyText}>
              {address1 && town && postcode 
                ? `${address1}, ${town}, ${postcode}` 
                : address || 'No address'}
            </ThemedText>

            <ThemedText style={styles.label}>Visit Frequency (weeks)</ThemedText>
            <TextInput
              style={styles.input}
              value={frequency}
              onChangeText={setFrequency}
              placeholder="e.g. 4"
              keyboardType="numeric"
            />

            <ThemedText style={styles.label}>Date</ThemedText>
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
                  style={styles.input}
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
                    minimumDate={new Date()}
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
          </View>
        )}
      </ScrollView>

      <View style={[styles.buttonContainer, { marginBottom: 32 }]}>
        <Button title="Save Changes" onPress={handleSave} disabled={updating} />
        {updating && (
          <ThemedText style={styles.loadingText}>Updating customer...</ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    marginVertical: 20,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginVertical: 8,
    borderRadius: 8,
    fontSize: 16,
  },
  readOnlyText: {
    fontSize: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginVertical: 8,
    color: '#666',
  },
  picker: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginVertical: 8,
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
  buttonContainer: {
    paddingTop: 20,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 16,
    color: '#666',
    fontStyle: 'italic',
  },
}); 