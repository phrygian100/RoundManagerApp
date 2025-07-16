import { useFocusEffect } from '@react-navigation/native';
import { startOfWeek } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Papa from 'papaparse';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { auth, db } from '../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../core/session';
import { leaveTeamSelf } from '../../services/accountService';
import { generateRecurringJobs } from '../../services/jobService';
import { createPayment, deleteAllPayments } from '../../services/paymentService';

// Helper function to format mobile numbers for UK
const formatMobileNumber = (input: string): string => {
  if (!input) return '';
  const cleanNumber = input.replace(/\D/g, ''); // Remove non-digits
  if (cleanNumber.length === 10 && !cleanNumber.startsWith('0')) {
    return `0${cleanNumber}`; // Add leading 0 if missing
  }
  return input.trim(); // Return original if already formatted or invalid
};

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
  const [isMemberOfAnotherAccount, setIsMemberOfAnotherAccount] = useState<boolean | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isRefreshingCapacity, setIsRefreshingCapacity] = useState(false);

  // Updated required fields - made Email optional, Mobile Number optional for CSV import  
  const requiredFields = ['Address Line 1','Name','Quote (£)','Account Number','Round Order','Visit Frequency','Starting Date'];

  // Determine if current user is owner and if they're a member of another account
  useEffect(() => {
    (async () => {
      const sess = await getUserSession();
      if (sess) {
        setIsOwner(sess.isOwner);
        // Check if user is a member of another account (their accountId is different from their uid)
        setIsMemberOfAnotherAccount(sess.accountId !== sess.uid);
      } else {
        setIsOwner(true);
        setIsMemberOfAnotherAccount(false);
      }
    })();
  }, []);

  // Reload member status when screen gains focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const sess = await getUserSession();
        if (sess) {
          setIsOwner(sess.isOwner);
          setIsMemberOfAnotherAccount(sess.accountId !== sess.uid);
        }
      })();
    }, [])
  );

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
            rows.forEach((r, index) => {
              // Check required fields
              const missing = requiredFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim()==='');
              if (missing.length) {
                const rowIdentifier = (r as any)['Name'] || (r as any)['Account Number'] || `Row ${index + 2}`; // +2 because of header row
                skipped.push({ row: r, reason: 'Missing '+missing.join(','), identifier: rowIdentifier });
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
              
              // Process visit frequency - support any number or 'one-off'
              let frequency: number | string = 'one-off';
              const frequencyValue = (row as any)['Visit Frequency']?.toString().trim();
              if (frequencyValue) {
                if (frequencyValue.toLowerCase() === 'one-off' || frequencyValue.toLowerCase() === 'one off') {
                  frequency = 'one-off';
                } else {
                  const numFreq = Number(frequencyValue);
                  if (!isNaN(numFreq) && numFreq > 0) {
                    frequency = numFreq;
                  }
                }
              }

              // Add RWC prefix to account number if not already present
              let accountNumber = (row as any)['Account Number']?.toString().trim();
              if (accountNumber) {
                // Remove any existing RWC prefix first to prevent duplicates
                const cleanAccountNumber = accountNumber.replace(/^RWC/i, '').trim();
                accountNumber = `RWC${cleanAccountNumber}`;
              }

              const clientData: any = {
                name: (row as any)['Name']?.trim(),
                address1: (row as any)['Address Line 1']?.trim(),
                town: (row as any)['Town']?.trim(),
                postcode: (row as any)['Postcode']?.trim(),
                // For backward compatibility, also store combined address
                address: `${(row as any)['Address Line 1']?.trim() || ''}, ${(row as any)['Town']?.trim() || ''}, ${(row as any)['Postcode']?.trim() || ''}`,
                mobileNumber: formatMobileNumber((row as any)['Mobile Number']?.toString().trim() || ''),
                quote: 0,
                frequency: frequency,
                nextVisit: '',
                roundOrderNumber: Number((row as any)['Round Order']) || i + 1,
                email: (row as any)['Email']?.trim() || '',
                source: (row as any)['Source']?.trim() || '',
                startingBalance: Number((row as any)['Starting Balance'] || 0),
                accountNumber: accountNumber || '',
                runsheetNotes: (row as any)['Runsheet Note']?.trim() || '',
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

              // Process account notes
              const accountNotesText = (row as any)['Account notes']?.trim();
              if (accountNotesText) {
                const accountNote = {
                  id: Date.now().toString() + '_' + i,
                  date: new Date().toISOString(),
                  author: 'CSV Import',
                  authorId: 'system',
                  text: accountNotesText
                };
                clientData.accountNotes = [accountNote];
              }

              if (clientData.name && clientData.address1 && clientData.nextVisit) {
                const ownerId = await getDataOwnerId();
                if (!ownerId) {
                  showAlert('Error', 'Could not determine account owner. Please log in again.');
                  skipped.push(row);
                  continue;
                }
                try {
                  await addDoc(collection(db, 'clients'), {
                    ...clientData,
                    dateAdded: new Date().toISOString(),
                    status: 'active',
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
              message += `\n\nSkipped ${skipped.length} rows:`;
              skipped.forEach((s, idx) => {
                if (idx < 5) { // Limit to first 5 for readability
                  message += `\n• ${s.identifier}: ${s.reason}`;
                }
              });
              if (skipped.length > 5) {
                message += `\n• ... and ${skipped.length - 5} more`;
              }
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
        rows.forEach((r, index) => {
          // Check required fields
          const missing = requiredFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim()==='');
          if (missing.length) {
            const rowIdentifier = (r as any)['Name'] || (r as any)['Account Number'] || `Row ${index + 2}`; // +2 because of header row
            skipped.push({ row: r, reason: 'Missing '+missing.join(','), identifier: rowIdentifier });
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
          
          // Process visit frequency - support any number or 'one-off'
          let frequency: number | string = 'one-off';
          const frequencyValue = (row as any)['Visit Frequency']?.toString().trim();
          if (frequencyValue) {
            if (frequencyValue.toLowerCase() === 'one-off' || frequencyValue.toLowerCase() === 'one off') {
              frequency = 'one-off';
            } else {
              const numFreq = Number(frequencyValue);
              if (!isNaN(numFreq) && numFreq > 0) {
                frequency = numFreq;
              }
            }
          }

          // Add RWC prefix to account number if not already present
          let accountNumber = (row as any)['Account Number']?.toString().trim();
          if (accountNumber) {
            // Remove any existing RWC prefix first to prevent duplicates
            const cleanAccountNumber = accountNumber.replace(/^RWC/i, '').trim();
            accountNumber = `RWC${cleanAccountNumber}`;
          }

          const clientData: any = {
            name: (row as any)['Name']?.trim(),
            address1: (row as any)['Address Line 1']?.trim(),
            town: (row as any)['Town']?.trim(),
            postcode: (row as any)['Postcode']?.trim(),
            // For backward compatibility, also store combined address
            address: `${(row as any)['Address Line 1']?.trim() || ''}, ${(row as any)['Town']?.trim() || ''}, ${(row as any)['Postcode']?.trim() || ''}`,
            mobileNumber: formatMobileNumber((row as any)['Mobile Number']?.toString().trim() || ''),
            quote: 0,
            frequency: frequency,
            nextVisit: '',
            roundOrderNumber: Number((row as any)['Round Order']) || i + 1,
            email: (row as any)['Email']?.trim() || '',
            source: (row as any)['Source']?.trim() || '',
            startingBalance: Number((row as any)['Starting Balance'] || 0),
            accountNumber: accountNumber || '',
            runsheetNotes: (row as any)['Runsheet Note']?.trim() || '',
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

          // Process account notes
          const accountNotesText = (row as any)['Account notes']?.trim();
          if (accountNotesText) {
            const accountNote = {
              id: Date.now().toString() + '_' + i,
              date: new Date().toISOString(),
              author: 'CSV Import',
              authorId: 'system',
              text: accountNotesText
            };
            clientData.accountNotes = [accountNote];
          }

          if (clientData.name && clientData.address1 && clientData.nextVisit) {
            const ownerId = await getDataOwnerId();
            if (!ownerId) {
              showAlert('Error', 'Could not determine account owner. Please log in again.');
              skipped.push(row);
              continue;
            }
            try {
              await addDoc(collection(db, 'clients'), {
                ...clientData,
                dateAdded: new Date().toISOString(),
                status: 'active',
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
          console.log('[DEBUG] Building detailed error message for', skipped.length, 'skipped rows');
          console.log('[DEBUG] Skipped array:', skipped);
          message += `\n\nSkipped ${skipped.length} rows:`;
          skipped.forEach((s, idx) => {
            if (idx < 5) { // Limit to first 5 for readability
              console.log(`[DEBUG] Adding row ${idx + 1}: ${s.identifier}: ${s.reason}`);
              message += `\n• ${s.identifier}: ${s.reason}`;
            }
          });
          if (skipped.length > 5) {
            message += `\n• ... and ${skipped.length - 5} more`;
          }
          console.log('[DEBUG] Final message:', message);
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
        rows.forEach((r, index) => {
          // Check required fields
          const missing = requiredFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim()==='');
          if (missing.length) {
            const rowIdentifier = (r as any)['Name'] || (r as any)['Account Number'] || `Row ${index + 2}`; // +2 because of header row
            skipped.push({ row: r, reason: 'Missing '+missing.join(','), identifier: rowIdentifier });
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
          
          // Process visit frequency - support any number or 'one-off'
          let frequency: number | string = 'one-off';
          const frequencyValue = (row as any)['Visit Frequency']?.toString().trim();
          if (frequencyValue) {
            if (frequencyValue.toLowerCase() === 'one-off' || frequencyValue.toLowerCase() === 'one off') {
              frequency = 'one-off';
            } else {
              const numFreq = Number(frequencyValue);
              if (!isNaN(numFreq) && numFreq > 0) {
                frequency = numFreq;
              }
            }
          }

          // Add RWC prefix to account number if not already present
          let accountNumber = (row as any)['Account Number']?.toString().trim();
          if (accountNumber) {
            // Remove any existing RWC prefix first to prevent duplicates
            const cleanAccountNumber = accountNumber.replace(/^RWC/i, '').trim();
            accountNumber = `RWC${cleanAccountNumber}`;
          }

          const clientData: any = {
            name: (row as any)['Name']?.trim(),
            address1: (row as any)['Address Line 1']?.trim(),
            town: (row as any)['Town']?.trim(),
            postcode: (row as any)['Postcode']?.trim(),
            // For backward compatibility, also store combined address
            address: `${(row as any)['Address Line 1']?.trim() || ''}, ${(row as any)['Town']?.trim() || ''}, ${(row as any)['Postcode']?.trim() || ''}`,
            mobileNumber: formatMobileNumber((row as any)['Mobile Number']?.toString().trim() || ''),
            quote: 0,
            frequency: frequency,
            nextVisit: '',
            roundOrderNumber: Number((row as any)['Round Order']) || i + 1,
            email: (row as any)['Email']?.trim() || '',
            source: (row as any)['Source']?.trim() || '',
            startingBalance: Number((row as any)['Starting Balance'] || 0),
            accountNumber: accountNumber || '',
            runsheetNotes: (row as any)['Runsheet Note']?.trim() || '',
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

          // Process account notes
          const accountNotesText = (row as any)['Account notes']?.trim();
          if (accountNotesText) {
            const accountNote = {
              id: Date.now().toString() + '_' + i,
              date: new Date().toISOString(),
              author: 'CSV Import',
              authorId: 'system',
              text: accountNotesText
            };
            clientData.accountNotes = [accountNote];
          }

          if (clientData.name && clientData.address1 && clientData.nextVisit) {
            const ownerId = await getDataOwnerId();
            if (!ownerId) {
              showAlert('Error', 'Could not determine account owner. Please log in again.');
              skipped.push(row);
              continue;
            }
            try {
              await addDoc(collection(db, 'clients'), {
                ...clientData,
                dateAdded: new Date().toISOString(),
                status: 'active',
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
          message += `\n\nSkipped ${skipped.length} rows:`;
          skipped.forEach((s, idx) => {
            if (idx < 5) { // Limit to first 5 for readability
              message += `\n• ${s.identifier}: ${s.reason}`;
            }
          });
          if (skipped.length > 5) {
            message += `\n• ... and ${skipped.length - 5} more`;
          }
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

  const handleImportPayments = async () => {
    if (Platform.OS === 'web') {
      // Use native file input for better browser compatibility
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.xlsx,.xls';
      input.style.display = 'none';
      document.body.appendChild(input);

      await new Promise<void>((resolve) => {
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve();
            return;
          }

          try {
            let rows: any[] = [];

            if (file.name.endsWith('.csv')) {
              const text = await file.text();
              const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
              if (parsed.errors.length) {
                console.error('CSV Parsing Errors:', parsed.errors);
                showAlert('Import Error', 'Problem parsing CSV file');
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

            // First, get all clients to create account number -> clientId mapping
            const ownerId = await getDataOwnerId();
            if (!ownerId) {
              showAlert('Error', 'Could not determine account owner. Please log in again.');
              resolve();
              return;
            }

            const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
            const clientsSnapshot = await getDocs(clientsQuery);
            const accountToClientMap = new Map<string, string>();
            
            clientsSnapshot.docs.forEach(doc => {
              const data = doc.data();
              if (data.accountNumber) {
                accountToClientMap.set(data.accountNumber.toUpperCase(), doc.id);
              }
            });

            // Validate rows
            const validRows: any[] = [];
            const skipped: any[] = [];
            const requiredPaymentFields = ['Account Number', 'Date', 'Amount (£)', 'Type'];
            
            rows.forEach((r, index) => {
              // Check required fields
              const missing = requiredPaymentFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim() === '');
              if (missing.length) {
                const rowIdentifier = (r as any)['Account Number'] || `Row ${index + 2}`;
                skipped.push({ row: r, reason: 'Missing ' + missing.join(', '), identifier: rowIdentifier });
              } else {
                // Check if account exists
                let accountNumber = (r as any)['Account Number']?.toString().trim();
                if (!accountNumber.toUpperCase().startsWith('RWC')) {
                  accountNumber = 'RWC' + accountNumber;
                }
                if (!accountToClientMap.has(accountNumber.toUpperCase())) {
                  const rowIdentifier = accountNumber || `Row ${index + 2}`;
                  skipped.push({ row: r, reason: 'Account not found', identifier: rowIdentifier });
                } else {
                  validRows.push(r);
                }
              }
            });

            // Confirm import
            const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} payments (skipping ${skipped.length}). Continue?`);
            if (!proceed) {
              resolve();
              return;
            }

            let imported = 0;
            
            for (let i = 0; i < validRows.length; i++) {
              const row = validRows[i];
              
              // Process account number
              let accountNumber = (row as any)['Account Number']?.toString().trim();
              if (!accountNumber.toUpperCase().startsWith('RWC')) {
                accountNumber = 'RWC' + accountNumber;
              }
              const clientId = accountToClientMap.get(accountNumber.toUpperCase());
              
              if (!clientId) continue; // Shouldn't happen due to validation above
              
              // Parse amount
              const amountString = (row as any)['Amount (£)']?.toString().trim();
              const sanitizedAmount = amountString.replace(/[^0-9.-]+/g, '');
              const amount = parseFloat(sanitizedAmount) || 0;
              
              // Parse date
              let paymentDate = '';
              const dateString = (row as any)['Date']?.toString().trim();
              if (dateString) {
                // Try DD/MM/YYYY format first
                const parts = dateString.split('/');
                if (parts.length === 3) {
                  const [day, month, year] = parts;
                  if (day && month && year && day.length === 2 && month.length === 2 && year.length === 4) {
                    paymentDate = `${year}-${month}-${day}`;
                  }
                } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  // Already in YYYY-MM-DD format
                  paymentDate = dateString;
                }
              }
              
              if (!paymentDate) {
                skipped.push({ row, reason: 'Invalid date format', identifier: accountNumber });
                continue;
              }
              
              // Map payment type
              const typeString = (row as any)['Type']?.toString().trim().toLowerCase();
              let method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other' = 'other';
              
              if (typeString === 'cash') method = 'cash';
              else if (typeString === 'card') method = 'card';
              else if (typeString === 'bacs' || typeString === 'bank' || typeString === 'bank transfer') method = 'bank_transfer';
              else if (typeString === 'cheque' || typeString === 'check') method = 'cheque';
              
              // Get notes
              const notes = (row as any)['Notes']?.trim() || '';
              
              try {
                await createPayment({
                  clientId,
                  amount,
                  date: paymentDate,
                  method,
                  notes: notes || undefined
                });
                imported++;
              } catch (e) {
                console.error('Error creating payment:', e, 'for row:', row);
                skipped.push({ row, reason: 'Database error', identifier: accountNumber });
              }
            }

            let message = `Import Complete!\n\nSuccessfully imported: ${imported} payments.`;
            if (skipped.length > 0) {
              message += `\n\nSkipped ${skipped.length} rows:`;
              skipped.forEach((s, idx) => {
                if (idx < 5) {
                  message += `\n• ${s.identifier}: ${s.reason}`;
                }
              });
              if (skipped.length > 5) {
                message += `\n• ... and ${skipped.length - 5} more`;
              }
            }
            showAlert('Import Result', message);

          } catch (err) {
            console.error('Payment import error', err);
            showAlert('Error', 'Import failed');
          } finally {
            resolve();
          }
        };
        input.click();
      });
      return;
    }

    // Mobile implementation (similar structure)
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const file = result.assets[0];
      
      let rows: any[] = [];
      
      if (file.name.endsWith('.csv')) {
        const response = await fetch(file.uri);
        const csvText = await response.text();
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        if (parsed.errors.length) {
          console.error('CSV Parsing Errors:', parsed.errors);
          Alert.alert('Import Error', 'There was a problem parsing the CSV file.');
          return;
        }
        rows = parsed.data as any[];
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const response = await fetch(file.uri);
        const ab = await response.arrayBuffer();
        const workbook = XLSX.read(ab, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else {
        Alert.alert('Unsupported file', 'Please select a CSV or Excel file.');
        return;
      }

      // Same processing logic as web version
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        showAlert('Error', 'Could not determine account owner. Please log in again.');
        return;
      }

      const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const clientsSnapshot = await getDocs(clientsQuery);
      const accountToClientMap = new Map<string, string>();
      
      clientsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.accountNumber) {
          accountToClientMap.set(data.accountNumber.toUpperCase(), doc.id);
        }
      });

      const validRows: any[] = [];
      const skipped: any[] = [];
      const requiredPaymentFields = ['Account Number', 'Date', 'Amount (£)', 'Type'];
      
      rows.forEach((r, index) => {
        const missing = requiredPaymentFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim() === '');
        if (missing.length) {
          const rowIdentifier = (r as any)['Account Number'] || `Row ${index + 2}`;
          skipped.push({ row: r, reason: 'Missing ' + missing.join(', '), identifier: rowIdentifier });
        } else {
          let accountNumber = (r as any)['Account Number']?.toString().trim();
          if (!accountNumber.toUpperCase().startsWith('RWC')) {
            accountNumber = 'RWC' + accountNumber;
          }
          if (!accountToClientMap.has(accountNumber.toUpperCase())) {
            const rowIdentifier = accountNumber || `Row ${index + 2}`;
            skipped.push({ row: r, reason: 'Account not found', identifier: rowIdentifier });
          } else {
            validRows.push(r);
          }
        }
      });

      const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} payments (skipping ${skipped.length}). Continue?`);
      if (!proceed) return;

      let imported = 0;
      
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        
        let accountNumber = (row as any)['Account Number']?.toString().trim();
        if (!accountNumber.toUpperCase().startsWith('RWC')) {
          accountNumber = 'RWC' + accountNumber;
        }
        const clientId = accountToClientMap.get(accountNumber.toUpperCase());
        
        if (!clientId) continue;
        
        const amountString = (row as any)['Amount (£)']?.toString().trim();
        const sanitizedAmount = amountString.replace(/[^0-9.-]+/g, '');
        const amount = parseFloat(sanitizedAmount) || 0;
        
        let paymentDate = '';
        const dateString = (row as any)['Date']?.toString().trim();
        if (dateString) {
          const parts = dateString.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            if (day && month && year && day.length === 2 && month.length === 2 && year.length === 4) {
              paymentDate = `${year}-${month}-${day}`;
            }
          } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            paymentDate = dateString;
          }
        }
        
        if (!paymentDate) {
          skipped.push({ row, reason: 'Invalid date format', identifier: accountNumber });
          continue;
        }
        
        const typeString = (row as any)['Type']?.toString().trim().toLowerCase();
        let method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'other' = 'other';
        
        if (typeString === 'cash') method = 'cash';
        else if (typeString === 'card') method = 'card';
        else if (typeString === 'bacs' || typeString === 'bank' || typeString === 'bank transfer') method = 'bank_transfer';
        else if (typeString === 'cheque' || typeString === 'check') method = 'cheque';
        
        const notes = (row as any)['Notes']?.trim() || '';
        
        try {
          await createPayment({
            clientId,
            amount,
            date: paymentDate,
            method,
            notes: notes || undefined
          });
          imported++;
        } catch (e) {
          console.error('Error creating payment:', e, 'for row:', row);
          skipped.push({ row, reason: 'Database error', identifier: accountNumber });
        }
      }

      let message = `Import Complete!\n\nSuccessfully imported: ${imported} payments.`;
      if (skipped.length > 0) {
        message += `\n\nSkipped ${skipped.length} rows:`;
        skipped.forEach((s, idx) => {
          if (idx < 5) {
            message += `\n• ${s.identifier}: ${s.reason}`;
          }
        });
        if (skipped.length > 5) {
          message += `\n• ... and ${skipped.length - 5} more`;
        }
      }
      showAlert('Import Result', message);
      
    } catch (e) {
      console.error('Import process error:', e);
      Alert.alert('Import Error', 'Failed to import CSV.');
    }
  };

  const handleImportCompletedJobs = async () => {
    if (Platform.OS === 'web') {
      // Use native file input for better browser compatibility
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.xlsx,.xls';
      input.style.display = 'none';
      document.body.appendChild(input);

      await new Promise<void>((resolve) => {
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve();
            return;
          }

          try {
            let rows: any[] = [];

            if (file.name.endsWith('.csv')) {
              const text = await file.text();
              const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
              if (parsed.errors.length) {
                console.error('CSV Parsing Errors:', parsed.errors);
                showAlert('Import Error', 'Problem parsing CSV file');
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

            // First, get all clients to create account number -> clientId mapping
            const ownerId = await getDataOwnerId();
            if (!ownerId) {
              showAlert('Error', 'Could not determine account owner. Please log in again.');
              resolve();
              return;
            }

            const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
            const clientsSnapshot = await getDocs(clientsQuery);
            const accountToClientMap = new Map<string, { id: string; address: string }>();
            
            clientsSnapshot.docs.forEach(doc => {
              const data = doc.data();
              if (data.accountNumber) {
                const address = `${data.address1 || data.address || ''}, ${data.town || ''}, ${data.postcode || ''}`;
                accountToClientMap.set(data.accountNumber.toUpperCase(), { id: doc.id, address });
              }
            });

            // Validate rows
            const validRows: any[] = [];
            const skipped: any[] = [];
            const requiredJobFields = ['Account Number', 'Date', 'Amount (£)'];
            
            rows.forEach((r, index) => {
              // Check required fields
              const missing = requiredJobFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim() === '');
              if (missing.length) {
                const rowIdentifier = (r as any)['Account Number'] || `Row ${index + 2}`;
                skipped.push({ row: r, reason: 'Missing ' + missing.join(', '), identifier: rowIdentifier });
              } else {
                // Check if account exists
                let accountNumber = (r as any)['Account Number']?.toString().trim();
                if (!accountNumber.toUpperCase().startsWith('RWC')) {
                  accountNumber = 'RWC' + accountNumber;
                }
                if (!accountToClientMap.has(accountNumber.toUpperCase())) {
                  const rowIdentifier = accountNumber || `Row ${index + 2}`;
                  skipped.push({ row: r, reason: 'Account not found', identifier: rowIdentifier });
                } else {
                  validRows.push(r);
                }
              }
            });

            // Confirm import
            const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} completed jobs (skipping ${skipped.length}). Continue?`);
            if (!proceed) {
              resolve();
              return;
            }

            let imported = 0;
            
            for (let i = 0; i < validRows.length; i++) {
              const row = validRows[i];
              
              // Process account number
              let accountNumber = (row as any)['Account Number']?.toString().trim();
              if (!accountNumber.toUpperCase().startsWith('RWC')) {
                accountNumber = 'RWC' + accountNumber;
              }
              const clientInfo = accountToClientMap.get(accountNumber.toUpperCase());
              
              if (!clientInfo) continue; // Shouldn't happen due to validation above
              
              // Parse amount
              const amountString = (row as any)['Amount (£)']?.toString().trim();
              const sanitizedAmount = amountString.replace(/[^0-9.-]+/g, '');
              const amount = parseFloat(sanitizedAmount) || 0;
              
              // Parse date
              let jobDate = '';
              const dateString = (row as any)['Date']?.toString().trim();
              if (dateString) {
                // Try DD/MM/YYYY format first
                const parts = dateString.split('/');
                if (parts.length === 3) {
                  const [day, month, year] = parts;
                  if (day && month && year && day.length === 2 && month.length === 2 && year.length === 4) {
                    jobDate = `${year}-${month}-${day}`;
                  }
                } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  // Already in YYYY-MM-DD format
                  jobDate = dateString;
                }
              }
              
              if (!jobDate) {
                skipped.push({ row, reason: 'Invalid date format', identifier: accountNumber });
                continue;
              }
              
              try {
                await addDoc(collection(db, 'jobs'), {
                  ownerId,
                  clientId: clientInfo.id,
                  providerId: 'test-provider-1',
                  serviceId: 'Historic Completed Service',
                  propertyDetails: clientInfo.address,
                  scheduledTime: jobDate + 'T09:00:00',
                  status: 'completed',
                  price: amount,
                  paymentStatus: 'unpaid'
                });
                imported++;
              } catch (e) {
                console.error('Error creating job:', e, 'for row:', row);
                skipped.push({ row, reason: 'Database error', identifier: accountNumber });
              }
            }

            let message = `Import Complete!\n\nSuccessfully imported: ${imported} completed jobs.`;
            if (skipped.length > 0) {
              message += `\n\nSkipped ${skipped.length} rows:`;
              skipped.forEach((s, idx) => {
                if (idx < 5) {
                  message += `\n• ${s.identifier}: ${s.reason}`;
                }
              });
              if (skipped.length > 5) {
                message += `\n• ... and ${skipped.length - 5} more`;
              }
            }
            showAlert('Import Result', message);

          } catch (err) {
            console.error('Job import error', err);
            showAlert('Error', 'Import failed');
          } finally {
            resolve();
          }
        };
        input.click();
      });
      return;
    }

    // Mobile implementation (similar structure)
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const file = result.assets[0];
      
      let rows: any[] = [];
      
      if (file.name.endsWith('.csv')) {
        const response = await fetch(file.uri);
        const csvText = await response.text();
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        if (parsed.errors.length) {
          console.error('CSV Parsing Errors:', parsed.errors);
          Alert.alert('Import Error', 'There was a problem parsing the CSV file.');
          return;
        }
        rows = parsed.data as any[];
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const response = await fetch(file.uri);
        const ab = await response.arrayBuffer();
        const workbook = XLSX.read(ab, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else {
        Alert.alert('Unsupported file', 'Please select a CSV or Excel file.');
        return;
      }

      // Same processing logic as web version
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        showAlert('Error', 'Could not determine account owner. Please log in again.');
        return;
      }

      const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const clientsSnapshot = await getDocs(clientsQuery);
      const accountToClientMap = new Map<string, { id: string; address: string }>();
      
      clientsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.accountNumber) {
          const address = `${data.address1 || data.address || ''}, ${data.town || ''}, ${data.postcode || ''}`;
          accountToClientMap.set(data.accountNumber.toUpperCase(), { id: doc.id, address });
        }
      });

      const validRows: any[] = [];
      const skipped: any[] = [];
      const requiredJobFields = ['Account Number', 'Date', 'Amount (£)'];
      
      rows.forEach((r, index) => {
        const missing = requiredJobFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim() === '');
        if (missing.length) {
          const rowIdentifier = (r as any)['Account Number'] || `Row ${index + 2}`;
          skipped.push({ row: r, reason: 'Missing ' + missing.join(', '), identifier: rowIdentifier });
        } else {
          let accountNumber = (r as any)['Account Number']?.toString().trim();
          if (!accountNumber.toUpperCase().startsWith('RWC')) {
            accountNumber = 'RWC' + accountNumber;
          }
          if (!accountToClientMap.has(accountNumber.toUpperCase())) {
            const rowIdentifier = accountNumber || `Row ${index + 2}`;
            skipped.push({ row: r, reason: 'Account not found', identifier: rowIdentifier });
          } else {
            validRows.push(r);
          }
        }
      });

      const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} completed jobs (skipping ${skipped.length}). Continue?`);
      if (!proceed) return;

      let imported = 0;
      
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        
        let accountNumber = (row as any)['Account Number']?.toString().trim();
        if (!accountNumber.toUpperCase().startsWith('RWC')) {
          accountNumber = 'RWC' + accountNumber;
        }
        const clientInfo = accountToClientMap.get(accountNumber.toUpperCase());
        
        if (!clientInfo) continue;
        
        const amountString = (row as any)['Amount (£)']?.toString().trim();
        const sanitizedAmount = amountString.replace(/[^0-9.-]+/g, '');
        const amount = parseFloat(sanitizedAmount) || 0;
        
        let jobDate = '';
        const dateString = (row as any)['Date']?.toString().trim();
        if (dateString) {
          const parts = dateString.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            if (day && month && year && day.length === 2 && month.length === 2 && year.length === 4) {
              jobDate = `${year}-${month}-${day}`;
            }
          } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            jobDate = dateString;
          }
        }
        
        if (!jobDate) {
          skipped.push({ row, reason: 'Invalid date format', identifier: accountNumber });
          continue;
        }
        
        try {
          await addDoc(collection(db, 'jobs'), {
            ownerId,
            clientId: clientInfo.id,
            providerId: 'test-provider-1',
            serviceId: 'Historic Completed Service',
            propertyDetails: clientInfo.address,
            scheduledTime: jobDate + 'T09:00:00',
            status: 'completed',
            price: amount,
            paymentStatus: 'unpaid'
          });
          imported++;
        } catch (e) {
          console.error('Error creating job:', e, 'for row:', row);
          skipped.push({ row, reason: 'Database error', identifier: accountNumber });
        }
      }

      let message = `Import Complete!\n\nSuccessfully imported: ${imported} completed jobs.`;
      if (skipped.length > 0) {
        message += `\n\nSkipped ${skipped.length} rows:`;
        skipped.forEach((s, idx) => {
          if (idx < 5) {
            message += `\n• ${s.identifier}: ${s.reason}`;
          }
        });
        if (skipped.length > 5) {
          message += `\n• ... and ${skipped.length - 5} more`;
        }
      }
      showAlert('Import Result', message);
      
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
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        showAlert('Error', 'Could not determine account owner. Please log in again.');
        return;
      }
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
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        showAlert('Error', 'Could not determine account owner. Please log in again.');
        setLoading(false);
        return;
      }
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
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        showAlert('Error', 'Could not determine account owner. Please log in again.');
        setLoading(false);
        return;
      }
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
              const ownerId = await getDataOwnerId();
              if (!ownerId) {
                showAlert('Error', 'Could not determine account owner. Please log in again.');
                setLoading(false);
                setLoadingMessage('');
                return;
              }
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
      // Sign out from Firebase
      await signOut(auth);

      // Supabase sign out removed (legacy)

      // Do NOT navigate manually; RootLayout will detect the auth state change
      // and redirect unauthenticated users to /login automatically.
      // This avoids the race condition where we redirect too early and then
      // immediately bounce back to the home screen because the user session
      // hasn’t fully cleared yet.
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
      // Supabase refreshSession removed (legacy)
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

  const handleRefreshAccount = async () => {
    setLoading(true);
    setLoadingMessage('Refreshing account...');
    try {
      const functions = getFunctions();
      const refreshClaims = httpsCallable(functions, 'refreshClaims');
      const result = await refreshClaims();
      
      console.log('Claims refresh result:', result.data);
      
      // Force a token refresh to get the new claims
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true);
      }
      
      if (Platform.OS === 'web') {
        window.alert('Account refreshed successfully! The page will reload to apply changes.');
        window.location.reload();
      } else {
        Alert.alert(
          'Success', 
          'Account refreshed successfully! Please restart the app to see changes.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error refreshing account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (Platform.OS === 'web') {
        window.alert(`Failed to refresh account: ${errorMessage}`);
      } else {
        Alert.alert('Error', `Failed to refresh account: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // Refresh capacity for current week
  const handleRefreshCapacityForCurrentWeek = async () => {
    setIsRefreshingCapacity(true);
    try {
      const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
      const { manualRefreshWeekCapacity } = await import('../../services/capacityService');
      const result = await manualRefreshWeekCapacity(currentWeek);
      
      let alertMessage = `Capacity refresh completed for current week!\n\n`;
      
      if (result.redistributedJobs > 0) {
        alertMessage += `• ${result.redistributedJobs} jobs redistributed\n`;
        alertMessage += `• Modified days: ${result.daysModified.join(', ')}\n`;
        
        if (result.warnings.length > 0) {
          alertMessage += `\nWarnings:\n${result.warnings.map((w: string) => `• ${w}`).join('\n')}`;
        }
      } else {
        alertMessage += `No jobs needed redistribution - all days are within capacity limits.`;
        
        if (result.warnings.length > 0) {
          alertMessage += `\n\nNotes:\n${result.warnings.map((w: string) => `• ${w}`).join('\n')}`;
        }
      }
      
      Alert.alert('Capacity Refresh Complete', alertMessage);
    } catch (error) {
      console.error('Error refreshing capacity:', error);
      Alert.alert('Error', 'Failed to refresh capacity. Please try again.');
    } finally {
      setIsRefreshingCapacity(false);
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
        <StyledButton title="Import Payments from CSV" onPress={handleImportPayments} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton title="Import Completed Jobs from CSV" onPress={handleImportCompletedJobs} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton
          title={loading && loadingMessage === 'Refreshing account...' ? loadingMessage : 'Refresh Account'}
          onPress={handleRefreshAccount}
          disabled={loading}
        />
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
        <StyledButton
          title={isRefreshingCapacity ? 'Refreshing...' : 'Refresh Capacity for Current Week'}
          onPress={handleRefreshCapacityForCurrentWeek}
          disabled={isRefreshingCapacity || loading}
        />
      </View>

      {/* Only show Team Members button for owners (not members of other accounts) */}
      {isOwner && !isMemberOfAnotherAccount && (
        <View style={styles.buttonContainer}>
          <StyledButton title="Team Members" onPress={() => router.push('/team')} />
        </View>
      )}

      <View style={styles.buttonContainer}>
        <StyledButton title="Delete All Jobs" color="red" onPress={handleDeleteAllJobs} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton title="Delete All Clients" color="red" onPress={handleDeleteAllClients} />
      </View>

      <View style={styles.buttonContainer}>
        <StyledButton title="Log Out" onPress={handleLogout} />
      </View>

      {/* Only show Join owner account button if not already a member of another account */}
      {!isMemberOfAnotherAccount && (
        <View style={styles.buttonContainer}>
          <StyledButton
            title="Join owner account"
            onPress={() => router.push('/enter-invite-code' as any)}
          />
        </View>
      )}

      {/* Show Leave Team button for members of other accounts */}
      {isMemberOfAnotherAccount && (
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