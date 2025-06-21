import * as DocumentPicker from 'expo-document-picker';
import { addDoc, collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import Papa from 'papaparse';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import { db } from '../../core/firebase';
import { generateRecurringJobs } from '../services/jobService';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const file = result.assets[0];
      const response = await fetch(file.uri);
      const csvText = await response.text();
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      if (parsed.errors.length) {
        console.error('CSV Parsing Errors:', parsed.errors);
        Alert.alert('Import Error', 'There was a problem parsing the CSV file. Check console for details.');
        return;
      }
      let imported = 0;
      let skipped: any[] = [];

      for (let i = 0; i < parsed.data.length; i++) {
        const row = parsed.data[i];
        const clientData: any = {
          name: (row as any)['Name']?.trim(),
          address: (row as any)['Address']?.trim(),
          mobileNumber: (row as any)['Mobile Number']?.trim(),
          quote: 0,
          frequency: (row as any)['Visit Frequency']?.trim(),
          nextVisit: '',
          roundOrderNumber: i,
        };

        const quoteString = (row as any)['Quote']?.trim();
        if (quoteString) {
          const sanitizedQuote = quoteString.replace(/[^0-9.-]+/g, '');
          clientData.quote = parseFloat(sanitizedQuote) || 0;
        }

        const nextDueString = (row as any)['Next Due']?.trim();
        if (nextDueString) {
          const parts = nextDueString.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            if (day && month && year && day.length === 2 && month.length === 2 && year.length === 4) {
              clientData.nextVisit = `${year}-${month}-${day}`;
            }
          } else if (nextDueString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            clientData.nextVisit = nextDueString;
          }
        }

        if (clientData.name && clientData.address && clientData.nextVisit) {
          try {
            await addDoc(collection(db, 'clients'), clientData);
            imported++;
          } catch (e) {
            console.error('Firestore write error:', e, 'for row:', row);
            skipped.push(row);
          }
        } else {
            skipped.push(row);
        }
      }

      let message = `Import Complete!\n\nSuccessfully imported: ${imported} clients.`;
      if (skipped.length > 0) {
        message += `\n\nSkipped: ${skipped.length} rows due to missing data (Name, Address, or Next Due Date) or other errors.`;
        console.log('Skipped rows:', skipped);
      }
      Alert.alert('Import Result', message);

    } catch (e) {
      console.error('Import process error:', e);
      Alert.alert('Import Error', 'Failed to import CSV.');
    }
  };

  const handleDeleteAllClients = () => {
    Alert.alert(
      'Delete All Clients',
      'Are you sure you want to delete ALL client records? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const querySnapshot = await getDocs(collection(db, 'clients'));
              const deletePromises = querySnapshot.docs.map((d) => deleteDoc(doc(db, 'clients', d.id)));
              await Promise.all(deletePromises);
              Alert.alert('Success', 'All clients have been deleted.');
            } catch (error) {
              console.error('Error deleting clients:', error);
              Alert.alert('Error', 'Could not delete all clients.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllJobs = () => {
    Alert.alert(
      'Delete All Jobs',
      'Are you sure you want to delete ALL jobs? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const jobsSnapshot = await getDocs(collection(db, 'jobs'));
              const deletePromises = jobsSnapshot.docs.map((d) => deleteDoc(d.ref));
              await Promise.all(deletePromises);
              Alert.alert('Success', 'All jobs have been deleted.');
            } catch (error) {
              console.error('Error deleting jobs:', error);
              Alert.alert('Error', 'Could not delete all jobs.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleGenerateJobs = async () => {
    Alert.alert(
      'Generate Recurring Jobs',
      'This will generate recurring jobs for the next 8 weeks.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          style: 'default',
          onPress: async () => {
            setLoading(true);
            try {
              await generateRecurringJobs();
              Alert.alert('Success', 'Recurring jobs have been generated.');
            } catch (error) {
              console.error('Error generating jobs:', error);
              Alert.alert('Error', 'Could not generate recurring jobs.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRepairClients = async () => {
    setLoading(true);
    setLoadingMessage('Repairing client data...');
    try {
      const clientsRef = collection(db, 'clients');
      const querySnapshot = await getDocs(clientsRef);
      
      const BATCH_SIZE = 450;
      const batches: any[] = [writeBatch(db)];
      let currentBatchIndex = 0;
      let writeCountInCurrentBatch = 0;
      let totalUpdates = 0;

      querySnapshot.docs.forEach((docSnap, index) => {
        const client = docSnap.data();
        if (typeof client.roundOrderNumber !== 'number') {
          if (writeCountInCurrentBatch === BATCH_SIZE) {
            batches.push(writeBatch(db));
            currentBatchIndex++;
            writeCountInCurrentBatch = 0;
          }
          batches[currentBatchIndex].update(docSnap.ref, { roundOrderNumber: index });
          writeCountInCurrentBatch++;
          totalUpdates++;
        }
      });

      if (totalUpdates > 0) {
        for (const batch of batches) {
          await batch.commit();
        }
        Alert.alert('Repair Complete', `${totalUpdates} clients were repaired.`);
      } else {
        Alert.alert('Repair Complete', 'No client data needed repair.');
      }

    } catch (error) {
      console.error('Error repairing clients:', error);
      Alert.alert('Error', 'Could not repair client data.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.buttonContainer}>
        <Button title="Import Clients from CSV" onPress={handleImport} />
      </View>
      <View style={styles.buttonContainer}>
        <Button title={loading ? 'Generating...' : 'Generate Recurring Jobs'} onPress={handleGenerateJobs} disabled={loading} />
      </View>
      <View style={styles.buttonContainer}>
        <Button title="Delete All Jobs" color="red" onPress={handleDeleteAllJobs} />
      </View>
      <View style={styles.buttonContainer}>
        <Button title={loading ? loadingMessage : 'Repair Client Order'} onPress={handleRepairClients} disabled={loading} />
      </View>
      <View style={styles.buttonContainer}>
        <Button title="Delete All Clients" color="red" onPress={handleDeleteAllClients} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  buttonContainer: {
    marginVertical: 10,
    width: '80%',
  }
}); 