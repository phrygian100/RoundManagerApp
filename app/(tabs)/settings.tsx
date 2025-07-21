import { useFocusEffect } from '@react-navigation/native';
import { startOfWeek } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import Papa from 'papaparse';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { auth, db } from '../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../core/session';
import { leaveTeamSelf } from '../../services/accountService';
import { generateRecurringJobs } from '../../services/jobService';
import { createPayment, deleteAllPayments } from '../../services/paymentService';
import { EffectiveSubscription, getEffectiveSubscription, getSubscriptionDisplayInfo, migrateUsersToSubscriptions } from '../../services/subscriptionService';
import { getUserProfile, updateUserProfile } from '../../services/userService';

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
  const [isRefreshingCapacity, setIsRefreshingCapacity] = useState(false);

  // Subscription state
  const [subscription, setSubscription] = useState<EffectiveSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  // Profile edit modal state
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    address1: '',
    town: '',
    postcode: '',
    contactNumber: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Updated required fields - made Email optional, Mobile Number optional for CSV import  
  const requiredFields = ['Address Line 1','Name','Quote (£)','Account Number','Round Order','Visit Frequency','Starting Date'];

  // Load subscription information
  const loadSubscription = async () => {
    try {
      setLoadingSubscription(true);
      const subscriptionData = await getEffectiveSubscription();
      setSubscription(subscriptionData);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoadingSubscription(false);
    }
  };

  // Load user profile data for editing
  const loadUserProfile = async () => {
    try {
      const session = await getUserSession();
      if (session?.uid) {
        const userProfile = await getUserProfile(session.uid);
        if (userProfile) {
          setProfileForm({
            name: userProfile.name || '',
            address1: userProfile.address1 || '',
            town: userProfile.town || '',
            postcode: userProfile.postcode || '',
            contactNumber: userProfile.phone || ''
          });
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!profileForm.name.trim()) {
      Alert.alert('Error', 'Name is required.');
      return;
    }

    setSavingProfile(true);
    try {
      const session = await getUserSession();
      if (!session?.uid) {
        Alert.alert('Error', 'User session not found.');
        return;
      }

      const updateData: any = {
        name: profileForm.name.trim(),
        phone: profileForm.contactNumber.trim(),
        updatedAt: new Date().toISOString(),
      };

      // Add address fields if provided
      if (profileForm.address1.trim()) updateData.address1 = profileForm.address1.trim();
      if (profileForm.town.trim()) updateData.town = profileForm.town.trim();
      if (profileForm.postcode.trim()) updateData.postcode = profileForm.postcode.trim();

      // Create combined address for backward compatibility
      if (profileForm.address1.trim() || profileForm.town.trim() || profileForm.postcode.trim()) {
        updateData.address = [profileForm.address1.trim(), profileForm.town.trim(), profileForm.postcode.trim()]
          .filter(Boolean)
          .join(', ');
      }

      await updateUserProfile(session.uid, updateData);
      
      Alert.alert('Success', 'Profile updated successfully!');
      setProfileModalVisible(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

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
      
      // Load subscription information
      await loadSubscription();
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

            // Check subscription limits before confirming import
            try {
              const clientLimitCheck = await checkClientLimit();
              if (!clientLimitCheck.canAdd) {
                const message = clientLimitCheck.limit 
                  ? `You've reached the limit of ${clientLimitCheck.limit} clients on your current plan. You currently have ${clientLimitCheck.currentCount} clients.\n\nUpgrade to Premium for unlimited clients.`
                  : 'Unable to add more clients at this time.';
                
                showAlert('Client Limit Reached', message);
                resolve();
                return;
              }

              // Calculate how many clients can actually be imported
              const availableSlots = clientLimitCheck.limit ? Math.max(0, clientLimitCheck.limit - clientLimitCheck.currentCount) : validRows.length;
              const canImportCount = Math.min(validRows.length, availableSlots);
              const willSkipDueToLimit = validRows.length - canImportCount;

              let confirmMessage = `This will create ${canImportCount} clients (skipping ${skipped.length} invalid rows)`;
              if (willSkipDueToLimit > 0) {
                confirmMessage += ` and ${willSkipDueToLimit} additional clients due to your subscription limit`;
              }
              confirmMessage += '. Continue?';

              // Confirm import
              const proceed = await showConfirm('Confirm Import', confirmMessage);
              if (!proceed) {
                resolve();
                return;
              }
            } catch (error) {
              console.error('Error checking client limit:', error);
              showAlert('Error', 'Unable to verify subscription status. Please try again.');
              resolve();
              return;
            }

            let imported = 0;
            let limitReached = false;
            
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

        // Check subscription limits before confirming import
        try {
          const clientLimitCheck = await checkClientLimit();
          if (!clientLimitCheck.canAdd) {
            const message = clientLimitCheck.limit 
              ? `You've reached the limit of ${clientLimitCheck.limit} clients on your current plan. You currently have ${clientLimitCheck.currentCount} clients.\n\nUpgrade to Premium for unlimited clients.`
              : 'Unable to add more clients at this time.';
            
            showAlert('Client Limit Reached', message);
            resolve();
            return;
          }

          // Calculate how many clients can actually be imported
          const availableSlots = clientLimitCheck.limit ? Math.max(0, clientLimitCheck.limit - clientLimitCheck.currentCount) : validRows.length;
          const canImportCount = Math.min(validRows.length, availableSlots);
          const willSkipDueToLimit = validRows.length - canImportCount;

          let confirmMessage = `This will create ${canImportCount} clients (skipping ${skipped.length} invalid rows)`;
          if (willSkipDueToLimit > 0) {
            confirmMessage += ` and ${willSkipDueToLimit} additional clients due to your subscription limit`;
          }
          confirmMessage += '. Continue?';

          // Confirm import
          const proceed = await showConfirm('Confirm Import', confirmMessage);
          if (!proceed) {
            resolve();
            return;
          }
        } catch (error) {
          console.error('Error checking client limit:', error);
          showAlert('Error', 'Unable to verify subscription status. Please try again.');
          resolve();
          return;
        }

        let imported = 0;
        let limitReached = false;
        
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

        // Check subscription limits before confirming import
        try {
          const clientLimitCheck = await checkClientLimit();
          if (!clientLimitCheck.canAdd) {
            const message = clientLimitCheck.limit 
              ? `You've reached the limit of ${clientLimitCheck.limit} clients on your current plan. You currently have ${clientLimitCheck.currentCount} clients.\n\nUpgrade to Premium for unlimited clients.`
              : 'Unable to add more clients at this time.';
            
            showAlert('Client Limit Reached', message);
            resolve();
            return;
          }

          // Calculate how many clients can actually be imported
          const availableSlots = clientLimitCheck.limit ? Math.max(0, clientLimitCheck.limit - clientLimitCheck.currentCount) : validRows.length;
          const canImportCount = Math.min(validRows.length, availableSlots);
          const willSkipDueToLimit = validRows.length - canImportCount;

          let confirmMessage = `This will create ${canImportCount} clients (skipping ${skipped.length} invalid rows)`;
          if (willSkipDueToLimit > 0) {
            confirmMessage += ` and ${willSkipDueToLimit} additional clients due to your subscription limit`;
          }
          confirmMessage += '. Continue?';

          // Confirm import
          const proceed = await showConfirm('Confirm Import', confirmMessage);
          if (!proceed) {
            resolve();
            return;
          }
        } catch (error) {
          console.error('Error checking client limit:', error);
          showAlert('Error', 'Unable to verify subscription status. Please try again.');
          resolve();
          return;
        }

        let imported = 0;
        let limitReached = false;
        
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
            const unknownAccountRows: any[] = [];
            const skipped: any[] = [];
            const requiredPaymentFields = ['Account Number', 'Date', 'Amount (£)', 'Type'];
            
            rows.forEach((r, index) => {
              // Check required fields
              const missing = requiredPaymentFields.filter(f => !(r as any)[f] || String((r as any)[f]).trim() === '');
              if (missing.length) {
                const rowIdentifier = (r as any)['Account Number'] || `Row ${index + 2}`;
                skipped.push({ row: r, reason: 'Missing ' + missing.join(', '), identifier: rowIdentifier, rowNumber: index + 2 });
              } else {
                // Check if account exists
                let accountNumber = (r as any)['Account Number']?.toString().trim();
                if (!accountNumber.toUpperCase().startsWith('RWC')) {
                  accountNumber = 'RWC' + accountNumber;
                }
                if (!accountToClientMap.has(accountNumber.toUpperCase())) {
                  const rowIdentifier = accountNumber || `Row ${index + 2}`;
                  unknownAccountRows.push({ row: r, rowNumber: index + 2, accountNumber });
                } else {
                  validRows.push(r);
                }
              }
            });

            // Confirm import
            const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} payments and ${unknownAccountRows.length} unknown payments (skipping ${skipped.length}). Continue?`);
            if (!proceed) {
              resolve();
              return;
            }

            let imported = 0;
            let unknownImported = 0;
            
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

            // Process unknown account payments
            for (let i = 0; i < unknownAccountRows.length; i++) {
              const { row, rowNumber, accountNumber } = unknownAccountRows[i];
              
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
              
              const now = new Date().toISOString();
              
              try {
                await addDoc(collection(db, 'unknownPayments'), {
                  ownerId,
                  amount,
                  date: paymentDate,
                  method,
                  notes: notes || undefined,
                  // Import metadata
                  importDate: now,
                  importFilename: file.name,
                  csvRowNumber: rowNumber,
                  originalAccountIdentifier: accountNumber,
                  createdAt: now,
                  updatedAt: now,
                });
                unknownImported++;
              } catch (e) {
                console.error('Error creating unknown payment:', e, 'for row:', row);
                skipped.push({ row, reason: 'Database error', identifier: accountNumber });
              }
            }

            let message = `Import Complete!\n\nSuccessfully imported: ${imported} payments.`;
            if (unknownImported > 0) {
              message += `\n\nImported ${unknownImported} unknown payments (accounts not found).`;
            }
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
      const unknownAccountRows: any[] = [];
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
            unknownAccountRows.push({ row: r, rowNumber: index + 2, accountNumber });
          } else {
            validRows.push(r);
          }
        }
      });

      const proceed = await showConfirm('Confirm Import', `This will create ${validRows.length} payments and ${unknownAccountRows.length} unknown payments (skipping ${skipped.length}). Continue?`);
      if (!proceed) return;

      let imported = 0;
      let unknownImported = 0;
      
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

      for (let i = 0; i < unknownAccountRows.length; i++) {
        const { row, rowNumber, accountNumber } = unknownAccountRows[i];
        
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
        
        const now = new Date().toISOString();
        
        try {
          await addDoc(collection(db, 'unknownPayments'), {
            ownerId,
            amount,
            date: paymentDate,
            method,
            notes: notes || undefined,
            // Import metadata
            importDate: now,
            importFilename: file.name,
            csvRowNumber: rowNumber,
            originalAccountIdentifier: accountNumber,
            createdAt: now,
            updatedAt: now,
          });
          unknownImported++;
        } catch (e) {
          console.error('Error creating unknown payment:', e, 'for row:', row);
          skipped.push({ row, reason: 'Database error', identifier: accountNumber });
        }
      }

      let message = `Import Complete!\n\nSuccessfully imported: ${imported} payments.`;
      if (unknownImported > 0) {
        message += `\n\nImported ${unknownImported} unknown payments (accounts not found).`;
      }
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
                message += `