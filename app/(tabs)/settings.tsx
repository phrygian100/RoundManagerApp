import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import Papa from 'papaparse';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { db } from '../../core/firebase';
import { getUserSession } from '../../core/session';
import { getCurrentUserId, supabase } from '../../core/supabase';
import { leaveTeamSelf } from '../../services/accountService';
import { generateRecurringJobs } from '../../services/jobService';
import { deleteAllPayments } from '../../services/paymentService';

const StyledButton = ({ title, onPress, disabled = false, color }: { title: string; onPress: () => void | Promise<void>; disabled?: boolean; color?: string; }) => {
  const bgColor = disabled
    ? '#ccc'
    : color === 'red'
    ? '#FF3B30'
    : '#007AFF';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnBase, { backgroundColor: bgColor }]}
    >
      <Text style={styles.btnText}>{title}</Text>
    </TouchableOpacity>
  );
};

// --- WEB DIAGNOSTIC: Global file input change logger ---
if (Platform.OS === 'web' && typeof window.addEventListener === 'function') {
  window.addEventListener('change', (e) => {
    const tgt = e.target as HTMLInputElement;
    if (tgt && tgt.type === 'file') {
      // Log basic file info when any file input changes
      const f = tgt.files?.[0];
      if (f) {
        console.log('[GLOBAL] file-input change event fired', f.name, f.size, f.type);
      }
    }
  });
}

// Cross-platform helpers
function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

async function showConfirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
}

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  const requiredFields = ['Address Line 1','Name','Mobile Number','Quote (£)','Account Number','Round Order','Visit Frequency','Starting Date','Starting Balance'];

  // Determine if current user is owner
  useEffect(() => {
    (async () => {
      const sess = await getUserSession();
      setIsOwner(sess?.isOwner ?? true);
    })();
  }, []);

  const handleImport = async () => {
    if (Platform.OS === 'web') {
      // Use native file input for better browser compatibility
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.xlsx,.xls';
      input.style.display = 'none';
      console.log('[IMPORT] created hidden file input');
      document.body.appendChild(input);

      await new Promise<void>((resolve) => {
        input.onchange = async () => {
          console.log('[IMPORT] input onchange fired');
          const file = input.files?.[0];
          if (!file) {
            resolve();
            return;
          }

          try {
            console.log('[IMPORT] Selected file:', file?.name);
            let rows: any[] = [];

            if (file.name.endsWith('.csv')) {
              const text = await file.text();
              const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
              if (parsed.errors.length) {
                console.error('CSV Parsing Errors:', parsed.errors);
                showAlert('Import Error', 'problem parsing csv');
                resolve();
                return;
              }
              rows = parsed.data as any[];
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
              const arrayBuffer = await file.arrayBuffer();
              const workbook = XLSX.read(arrayBuffer, { type: 'array' });
              const sheetName = workbook.SheetNames[0];
              rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            } else {
              showAlert('Unsupported file', 'Please select a CSV or Excel file.');
              resolve();
              return;
            }

            // Validate rows
            const validRows: any[] = [];
            const skipped: any[] = [];
            rows.forEach(r => {
              // Check required fields
              const missing = requiredFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim()==='');
              if (missing.length) {
                skipped.push({ row: r, reason: 'Missing '+missing.join(',') });
              } else {
                validRows.push(r);
              }
            });

            // Confirm import
            const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} clients (skipping ${skipped.length}). Continue?`);
            if (!proceed) return;

            let imported = 0;
            
            for (let i = 0; i < validRows.length; i++) {
              const row = validRows[i];
              const clientData: any = {
                name: (row as any)['Name']?.trim(),
                address: (row as any)['Address Line 1']?.trim(),
                town: (row as any)['Town']?.trim(),
                postcode: (row as any)['Postcode']?.trim(),
                mobileNumber: (row as any)['Mobile Number']?.toString().trim(),
                quote: 0,
                frequency: (row as any)['Visit Frequency']?.trim(),
                nextVisit: '',
                roundOrderNumber: Number((row as any)['Round Order']) || i,
                email: (row as any)['Email']?.trim(),
                source: (row as any)['Source']?.trim(),
                startingBalance: Number((row as any)['Starting Balance']||0),
                accountNumber: (row as any)['Account Number']?.trim(),
              };

              const quoteString = (row as any)['Quote (£)']?.toString().trim();
              if (quoteString) {
                const sanitizedQuote = quoteString.replace(/[^0-9.-]+/g, '');
                clientData.quote = parseFloat(sanitizedQuote) || 0;
              }

              const nextDueString = (row as any)['Starting Date']?.toString().trim();
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
                const ownerId = await getCurrentUserId();
                try {
                  await addDoc(collection(db, 'clients'), {
                    ...clientData,
                    dateAdded: new Date().toISOString(),
                    source: clientData.source || '',
                    email: clientData.email || '',
                    ownerId,
                  });
                  imported++;
                } catch (e) {
                  console.error('Firestore write error:', e, 'for row:', row);
                  skipped.push(row);
                }
              } else {
                  skipped.push(row);
              }
            }

            // After creating clients, immediately generate jobs so runsheets & "Next scheduled visit" populate
            try {
              console.log('[IMPORT] Generating recurring jobs for newly imported clients');
              await generateRecurringJobs();
            } catch (err) {
              console.error('[IMPORT] generateRecurringJobs failed', err);
            }

            let message = `Import Complete!\n\nSuccessfully imported: ${imported} clients.`;
            if (skipped.length > 0) {
              message += `\n\nSkipped: ${skipped.length} rows due to missing data (Name, Address, or Next Due Date) or other errors.`;
              console.log('Skipped rows:', skipped);
            }
            showAlert('Import Result', message);

          } catch (err) {
            console.error('Web import error', err);
            showAlert('Error', 'Import failed');
          } finally {
            resolve();
          }
        };
        input.click();
      });
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const file = result.assets[0];
      console.log('Selected file:', file.name);
      if (file.name.endsWith('.csv')) {
        const response = await fetch(file.uri);
        const csvText = await response.text();
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        if (parsed.errors.length) {
          console.error('CSV Parsing Errors:', parsed.errors);
          Alert.alert('Import Error', 'There was a problem parsing the CSV file.');
          return;
        }
        let rows: any[] = parsed.data as any[];

        // Validate rows
        const validRows: any[] = [];
        const skipped: any[] = [];
        rows.forEach(r => {
          // Check required fields
          const missing = requiredFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim()==='');
          if (missing.length) {
            skipped.push({ row: r, reason: 'Missing '+missing.join(',') });
          } else {
            validRows.push(r);
          }
        });

        // Confirm import
        const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} clients (skipping ${skipped.length}). Continue?`);
        if (!proceed) return;

        let imported = 0;
        
        for (let i = 0; i < validRows.length; i++) {
          const row = validRows[i];
          const clientData: any = {
            name: (row as any)['Name']?.trim(),
            address: (row as any)['Address Line 1']?.trim(),
            town: (row as any)['Town']?.trim(),
            postcode: (row as any)['Postcode']?.trim(),
            mobileNumber: (row as any)['Mobile Number']?.toString().trim(),
            quote: 0,
            frequency: (row as any)['Visit Frequency']?.trim(),
            nextVisit: '',
            roundOrderNumber: Number((row as any)['Round Order']) || i,
            email: (row as any)['Email']?.trim(),
            source: (row as any)['Source']?.trim(),
            startingBalance: Number((row as any)['Starting Balance']||0),
            accountNumber: (row as any)['Account Number']?.trim(),
          };

          const quoteString = (row as any)['Quote (£)']?.toString().trim();
          if (quoteString) {
            const sanitizedQuote = quoteString.replace(/[^0-9.-]+/g, '');
            clientData.quote = parseFloat(sanitizedQuote) || 0;
          }

          const nextDueString = (row as any)['Starting Date']?.toString().trim();
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
            const ownerId = await getCurrentUserId();
            try {
              await addDoc(collection(db, 'clients'), {
                ...clientData,
                dateAdded: new Date().toISOString(),
                source: clientData.source || '',
                email: clientData.email || '',
                ownerId,
              });
              imported++;
            } catch (e) {
              console.error('Firestore write error:', e, 'for row:', row);
              skipped.push(row);
            }
          } else {
              skipped.push(row);
          }
        }

        // Generate jobs for the newly imported clients
        try {
          console.log('[IMPORT] Generating recurring jobs for newly imported clients');
          await generateRecurringJobs();
        } catch (err) {
          console.error('[IMPORT] generateRecurringJobs failed', err);
        }

        let message = `Import Complete!\n\nSuccessfully imported: ${imported} clients.`;
        if (skipped.length > 0) {
          message += `\n\nSkipped: ${skipped.length} rows due to missing data (Name, Address, or Next Due Date) or other errors.`;
          console.log('Skipped rows:', skipped);
        }
        showAlert('Import Result', message);

      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const response = await fetch(file.uri);
        const ab = await response.arrayBuffer();
        const workbook = XLSX.read(ab, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        let rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Validate rows
        const validRows: any[] = [];
        const skipped: any[] = [];
        rows.forEach(r => {
          // Check required fields
          const missing = requiredFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim()==='');
          if (missing.length) {
            skipped.push({ row: r, reason: 'Missing '+missing.join(',') });
          } else {
            validRows.push(r);
          }
        });

        // Confirm import
        const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} clients (skipping ${skipped.length}). Continue?`);
        if (!proceed) return;

        let imported = 0;
        
        for (let i = 0; i < validRows.length; i++) {
          const row = validRows[i];
          const clientData: any = {
            name: (row as any)['Name']?.trim(),
            address: (row as any)['Address Line 1']?.trim(),
            town: (row as any)['Town']?.trim(),
            postcode: (row as any)['Postcode']?.trim(),
            mobileNumber: (row as any)['Mobile Number']?.toString().trim(),
            quote: 0,
            frequency: (row as any)['Visit Frequency']?.trim(),
            nextVisit: '',
            roundOrderNumber: Number((row as any)['Round Order']) || i,
            email: (row as any)['Email']?.trim(),
            source: (row as any)['Source']?.trim(),
            startingBalance: Number((row as any)['Starting Balance']||0),
            accountNumber: (row as any)['Account Number']?.trim(),
          };

          const quoteString = (row as any)['Quote (£)']?.toString().trim();
          if (quoteString) {
            const sanitizedQuote = quoteString.replace(/[^0-9.-]+/g, '');
            clientData.quote = parseFloat(sanitizedQuote) || 0;
          }

          const nextDueString = (row as any)['Starting Date']?.toString().trim();
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
            const ownerId = await getCurrentUserId();
            try {
              await addDoc(collection(db, 'clients'), {
                ...clientData,
                dateAdded: new Date().toISOString(),
                source: clientData.source || '',
                email: clientData.email || '',
                ownerId,
              });
              imported++;
            } catch (e) {
              console.error('Firestore write error:', e, 'for row:', row);
              skipped.push(row);
            }
          } else {
              skipped.push(row);
          }
        }

        // Generate jobs for the newly imported clients
        try {
          console.log('[IMPORT] Generating recurring jobs for newly imported clients');
          await generateRecurringJobs();
        } catch (err) {
          console.error('[IMPORT] generateRecurringJobs failed', err);
        }

        let message = `Import Complete!\n\nSuccessfully imported: ${imported} clients.`;
        if (skipped.length > 0) {
          message += `\n\nSkipped: ${skipped.length} rows due to missing data (Name, Address, or Next Due Date) or other errors.`;
          console.log('Skipped rows:', skipped);
        }
        showAlert('Import Result', message);

      } else {
        Alert.alert('Unsupported file', 'Please select a CSV or Excel file.');
      }
    } catch (e) {
      console.error('Import process error:', e);
      Alert.alert('Import Error', 'Failed to import CSV.');
    }
  };

  const handleDeleteAllClients = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to delete ALL client records? This action cannot be undone.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete All Clients',
            'Are you sure you want to delete ALL client records? This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete All', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    try {
      const ownerId = await getCurrentUserId();
      const q = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs.map((d) => deleteDoc(doc(db, 'clients', d.id)));
      await Promise.all(deletePromises);
      Alert.alert('Success', 'All clients have been deleted.');
    } catch (error) {
      console.error('Error deleting clients:', error);
      Alert.alert('Error', 'Could not delete all clients.');
    }
  };

  const handleDeleteAllJobs = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to delete ALL jobs? This action cannot be undone.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete All Jobs',
            'Are you sure you want to delete ALL jobs? This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete All', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    try {
      setLoading(true);
      const ownerId = await getCurrentUserId();
      const qJobs = query(collection(db, 'jobs'), where('ownerId', '==', ownerId));
      const jobsSnapshot = await getDocs(qJobs);
      const deletePromises = jobsSnapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      Alert.alert('Success', 'All jobs have been deleted.');
    } catch (error) {
      console.error('Error deleting jobs:', error);
      Alert.alert('Error', 'Could not delete all jobs.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllPayments = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('This will permanently delete all payment records. This action cannot be undone.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete All Payments',
            'This will permanently delete all payment records. This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete All', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    try {
      setLoading(true);
      await deleteAllPayments();
      Alert.alert('Success', 'All payments have been deleted.');
    } catch (error) {
      console.error('Error deleting payments:', error);
      Alert.alert('Error', 'Could not delete payments.');
    } finally {
      setLoading(false);
    }
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
              const ownerId = await getCurrentUserId();
              const clientsRef = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (error) {
      console.error('Logout error', error);
      Alert.alert('Error', 'Failed to log out.');
    }
  };

  const handleLeaveTeam = async () => {
    const confirm = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to leave this team? You will lose access to all owner data and create your own personal account.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Leave Team',
            'Are you sure you want to leave this team? You will lose access to all owner data and create your own personal account.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Leave', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirm) return;

    try {
      console.log('== LEAVE TEAM CONFIRMED ==');
      await leaveTeamSelf();
      if (Platform.OS === 'web') {
        window.alert('You have left the team. Please reload the page.');
      } else {
        Alert.alert('Left Team', 'Your account has been reset.');
      }
      await supabase.auth.refreshSession();
      router.replace('/');
    } catch (err) {
      console.error('Error leaving team:', err);
      if (Platform.OS === 'web') {
        window.alert('Error: Could not leave team. See console for details.');
      } else {
        Alert.alert('Error', 'Could not leave team.');
      }
    }
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
        <StyledButton title="Import Clients from CSV" onPress={handleImport} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton
          title={loading ? 'Loading...' : 'Generate Recurring Jobs'}
          onPress={handleGenerateJobs}
          disabled={loading}
        />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton
          title={loading ? 'Loading...' : 'Weekly Rollover (Test)'}
          onPress={handleWeeklyRollover}
          disabled={loading}
        />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton
          title={loading ? 'Loading...' : 'Delete All Payments'}
          onPress={handleDeleteAllPayments}
          disabled={loading}
          color="red"
        />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton
          title={loading && loadingMessage ? loadingMessage : 'Repair Client Order'}
          onPress={handleRepairClients}
          disabled={loading}
        />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton title="Team Members" onPress={() => router.push('/team')} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton title="Delete All Jobs" color="red" onPress={handleDeleteAllJobs} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton title="Delete All Clients" color="red" onPress={handleDeleteAllClients} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton title="Log Out" onPress={handleLogout} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton
          title="Join owner account"
          onPress={() => router.push('/enter-invite-code' as any)}
        />
      </View>

      {!isOwner && (
        <View style={{ marginTop: 24 }}>
          <StyledButton title="Leave Team" color="red" onPress={handleLeaveTeam} />
        </View>
      )}
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
  btnBase: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 