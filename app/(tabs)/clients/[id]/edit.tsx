import { Picker } from '@react-native-picker/picker';
import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
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
  const [updating, setUpdating] = useState(false);

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

  const regenerateJobsForClient = async () => {
    if (typeof id !== 'string') return;
    
    try {
      console.log('Starting job regeneration for client:', id);
      
      // 1. Delete existing future jobs for this client
      const jobsRef = collection(db, 'jobs');
      const futureJobsQuery = query(
        jobsRef, 
        where('clientId', '==', id),
        where('status', 'in', ['pending', 'in-progress'])
      );
      
      const futureJobsSnapshot = await getDocs(futureJobsQuery);
      console.log('Found', futureJobsSnapshot.size, 'existing future jobs to delete');
      
      const batch = writeBatch(db);
      
      futureJobsSnapshot.forEach((jobDoc) => {
        batch.delete(jobDoc.ref);
      });
      
      await batch.commit();
      console.log('Deleted existing future jobs');

      // 2. Get the updated client data
      const clientDoc = await getDoc(doc(db, 'clients', id));
      if (!clientDoc.exists()) {
        console.log('Client not found after update');
        return;
      }
      
      const clientData = clientDoc.data();
      console.log('Client data:', clientData);
      
      // 3. Generate new jobs for this client
      let jobsToCreate: any[] = [];
      if (clientData.nextVisit && clientData.frequency && clientData.frequency !== 'one-off') {
        let visitDate = parseISO(clientData.nextVisit);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day
        
        console.log('Starting date:', visitDate);
        console.log('Today:', today);
        console.log('Frequency:', clientData.frequency);
        
        for (let i = 0; i < 8; i++) { // Generate for 8 weeks
          // Always create jobs starting from the nextVisit date, regardless of whether it's in the past
          const weekStr = format(visitDate, 'yyyy-MM-dd');
          const jobData = {
            clientId: id,
            providerId: 'test-provider-1',
            serviceId: 'window-cleaning',
            propertyDetails: `${clientData.address1 || clientData.address || ''}, ${clientData.town || ''}, ${clientData.postcode || ''}`,
            scheduledTime: weekStr + 'T09:00:00',
            status: 'pending',
            price: typeof clientData.quote === 'number' ? clientData.quote : 25,
            paymentStatus: 'unpaid',
          };
          jobsToCreate.push(jobData);
          console.log('Adding job for week:', weekStr);
          
          visitDate = addWeeks(visitDate, Number(clientData.frequency));
        }
        
        console.log('Creating', jobsToCreate.length, 'new jobs');
        
        // Add new jobs
        if (jobsToCreate.length > 0) {
          const addBatch = writeBatch(db);
          jobsToCreate.forEach(job => {
            const newJobRef = doc(collection(db, 'jobs'));
            addBatch.set(newJobRef, job);
          });
          await addBatch.commit();
          console.log('Successfully created new jobs');
        }
      } else {
        console.log('Client has no nextVisit, frequency, or is one-off');
      }
      
      Alert.alert('Success', `Service routine updated and ${jobsToCreate.length} jobs regenerated!`);
    } catch (error) {
      console.error('Error regenerating jobs:', error);
      Alert.alert('Error', 'Failed to regenerate jobs. Please try again.');
    }
  };

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
      setUpdating(true);
      try {
        await updateDoc(doc(db, 'clients', id), {
          frequency: frequencyNumber,
          nextVisit,
        });
        
        // Regenerate jobs for this client
        await regenerateJobsForClient();
        
        router.replace({ pathname: '/(tabs)/clients/[id]', params: { id } });
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

      <Button title="Save Changes" onPress={handleSave} disabled={updating} />
      {updating && (
        <ThemedText style={styles.loadingText}>Updating service routine and regenerating jobs...</ThemedText>
      )}
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
  loadingText: {
    textAlign: 'center',
    marginTop: 16,
    color: '#666',
    fontStyle: 'italic',
  },
});

