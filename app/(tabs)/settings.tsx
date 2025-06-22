import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import Papa from 'papaparse';
import React, { useState } from 'react';
import { Alert, Button, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { db } from '../../core/firebase';
import { generateRecurringJobs } from '../services/jobService';
import { deleteAllPayments } from '../services/paymentService';

export default function SettingsScreen() {
  const router = useRouter();
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

  const handleDeleteAllPayments = () => {
    Alert.alert(
      'Delete All Payments',
      'This will permanently delete all payment records. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await deleteAllPayments();
              Alert.alert('Success', 'All payments have been deleted.');
            } catch (error) {
              console.error('Error deleting payments:', error);
              Alert.alert('Error', 'Could not delete payments.');
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

  const handleWeeklyRollover = async () => {
    Alert.alert(
      'Weekly Rollover',
      'This will simulate the weekly rollover process:\n\n1. Move completed jobs from last week to "completed"\n2. Create jobs for the new week (8 weeks ahead)\n\nThis is normally automated but can be triggered manually for testing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Rollover',
          style: 'default',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await handleWeeklyRollover();
              Alert.alert(
                'Weekly Rollover Complete', 
                'Weekly rollover has been completed successfully.'
              );
            } catch (error) {
              console.error('Error in weekly rollover:', error);
              Alert.alert('Error', 'Could not complete weekly rollover.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRepairClients = async () => {
    Alert.alert(
      'Repair Client Data',
      'This will attempt to repair any corrupted client data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Repair',
          style: 'default',
          onPress: async () => {
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
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.titleRow}>
        <ThemedText type="title">Settings</ThemedText>
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
        </Pressable>
      </View>
      
      <View style={styles.buttonContainer}>
        <Button title="Import Clients from CSV" onPress={handleImport} />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={loading ? "Loading..." : "Generate Recurring Jobs"}
          onPress={handleGenerateJobs}
          disabled={loading}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={loading ? "Loading..." : "Weekly Rollover (Test)"}
          onPress={handleWeeklyRollover}
          disabled={loading}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={loading ? "Loading..." : "Delete All Payments"}
          onPress={handleDeleteAllPayments}
          disabled={loading}
          color="red"
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={loading && loadingMessage ? loadingMessage : 'Repair Client Order'}
          onPress={handleRepairClients}
          disabled={loading}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Delete All Jobs" color="red" onPress={handleDeleteAllJobs} />
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Delete All Clients" color="red" onPress={handleDeleteAllClients} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  buttonContainer: { marginVertical: 8 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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