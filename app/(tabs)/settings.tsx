import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import Papa from 'papaparse';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { db } from '../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../core/session';
import { deleteAllClients, getClientCount } from '../../services/clientService';
import { deleteAllJobs, generateRecurringJobs, getJobCount } from '../../services/jobService';
import { createPayment, deleteAllPayments, getPaymentCount } from '../../services/paymentService';
import { EffectiveSubscription, getEffectiveSubscription } from '../../services/subscriptionService';
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

  // Bank & Business Info modal state
  const [bankInfoModalVisible, setBankInfoModalVisible] = useState(false);
  const [bankInfoForm, setBankInfoForm] = useState({
    businessName: '',
    bankSortCode: '',
    bankAccountNumber: ''
  });
  const [savingBankInfo, setSavingBankInfo] = useState(false);

  // Updated required fields - made Email optional, Mobile Number optional for CSV import  
  const requiredFields = ['Address Line 1','Name','Quote (£)','Account Number','Round Order','Visit Frequency','Starting Date'];

  // Check client limit based on subscription
  const checkClientLimit = async () => {
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        return { canAdd: false, limit: null, currentCount: 0 };
      }

      // Get current client count
      const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const clientsSnapshot = await getDocs(clientsQuery);
      const currentCount = clientsSnapshot.size;

      // Get subscription info
      const currentSubscription = subscription || await getEffectiveSubscription();
      
      if (!currentSubscription) {
        return { canAdd: false, limit: null, currentCount };
      }

      // Check limits based on subscription tier
      if (currentSubscription.tier === 'premium' || currentSubscription.tier === 'exempt') {
        return { canAdd: true, limit: null, currentCount }; // Unlimited
      } else {
        const limit = currentSubscription.clientLimit || 20; // Use subscription limit or default to 20
        return { canAdd: currentCount < limit, limit, currentCount };
      }
    } catch (error) {
      console.error('Error checking client limit:', error);
      return { canAdd: false, limit: null, currentCount: 0 };
    }
  };

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

  // Load bank & business info for editing
  const loadBankInfo = async () => {
    try {
      const session = await getUserSession();
      if (session?.uid) {
        const userProfile = await getUserProfile(session.uid);
        if (userProfile) {
          setBankInfoForm({
            businessName: userProfile.businessName || '',
            bankSortCode: userProfile.bankSortCode || '',
            bankAccountNumber: userProfile.bankAccountNumber || ''
          });
        }
      }
    } catch (error) {
      console.error('Error loading bank info:', error);
    }
  };

  // Save bank & business info changes
  const handleSaveBankInfo = async () => {
    if (!bankInfoForm.businessName.trim()) {
      Alert.alert('Error', 'Business name is required.');
      return;
    }

    setSavingBankInfo(true);
    try {
      const session = await getUserSession();
      if (!session?.uid) {
        Alert.alert('Error', 'User session not found.');
        return;
      }

      await updateUserProfile(session.uid, {
        businessName: bankInfoForm.businessName.trim(),
        bankSortCode: bankInfoForm.bankSortCode.trim(),
        bankAccountNumber: bankInfoForm.bankAccountNumber.trim(),
      });

      Alert.alert('Success', 'Bank and business information updated successfully.');
      setBankInfoModalVisible(false);
    } catch (error) {
      console.error('Error saving bank info:', error);
      Alert.alert('Error', 'Failed to save bank and business information.');
    } finally {
      setSavingBankInfo(false);
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
                // Check limit before each client creation to prevent exceeding limits during batch import
                if (!limitReached) {
                  try {
                    const currentLimitCheck = await checkClientLimit();
                    if (!currentLimitCheck.canAdd) {
                      limitReached = true;
                      const message = currentLimitCheck.limit 
                        ? `Reached the limit of ${currentLimitCheck.limit} clients. Skipping remaining ${validRows.length - i} clients.\n\n🚀 Upgrade to Premium for:\n• Unlimited clients\n• Team member creation\n• Priority support\n\nOnly £18/month`
                        : 'Unable to add more clients at this time.';
                    
                      showAlert('Client Limit Reached', message);
                      // Skip remaining clients due to limit
                      for (let j = i; j < validRows.length; j++) {
                        skipped.push(validRows[j]);
                      }
                      break;
                    }
                  } catch (error) {
                    console.error('Error checking client limit during import:', error);
                    showAlert('Error', 'Unable to verify subscription status. Skipping remaining clients.');
                    // Skip remaining clients due to error
                    for (let j = i; j < validRows.length; j++) {
                      skipped.push(validRows[j]);
                    }
                    break;
                  }
                }

                if (limitReached) {
                  skipped.push(row);
                  continue;
                }

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
            return;
          }
        } catch (error) {
          console.error('Error checking client limit:', error);
          showAlert('Error', 'Unable to verify subscription status. Please try again.');
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
            // Check limit before each client creation to prevent exceeding limits during batch import
            if (!limitReached) {
              try {
                const currentLimitCheck = await checkClientLimit();
                if (!currentLimitCheck.canAdd) {
                  limitReached = true;
                  const message = currentLimitCheck.limit 
                    ? `Reached the limit of ${currentLimitCheck.limit} clients. Skipping remaining ${validRows.length - i} clients.\n\nUpgrade to Premium for unlimited clients.`
                    : 'Unable to add more clients at this time.';
                
                  showAlert('Client Limit Reached', message);
                  // Skip remaining clients due to limit
                  for (let j = i; j < validRows.length; j++) {
                    skipped.push(validRows[j]);
                  }
                  break;
                }
              } catch (error) {
                console.error('Error checking client limit during import:', error);
                showAlert('Error', 'Unable to verify subscription status. Skipping remaining clients.');
                // Skip remaining clients due to error
                for (let j = i; j < validRows.length; j++) {
                  skipped.push(validRows[j]);
                }
                break;
              }
            }

            if (limitReached) {
              skipped.push(row);
              continue;
            }

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
            return;
          }
        } catch (error) {
          console.error('Error checking client limit:', error);
          showAlert('Error', 'Unable to verify subscription status. Please try again.');
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
            // Check limit before each client creation to prevent exceeding limits during batch import
            if (!limitReached) {
              try {
                const currentLimitCheck = await checkClientLimit();
                if (!currentLimitCheck.canAdd) {
                  limitReached = true;
                  const message = currentLimitCheck.limit 
                    ? `Reached the limit of ${currentLimitCheck.limit} clients. Skipping remaining ${validRows.length - i} clients.\n\nUpgrade to Premium for unlimited clients.`
                    : 'Unable to add more clients at this time.';
                
                  showAlert('Client Limit Reached', message);
                  // Skip remaining clients due to limit
                  for (let j = i; j < validRows.length; j++) {
                    skipped.push(validRows[j]);
                  }
                  break;
                }
              } catch (error) {
                console.error('Error checking client limit during import:', error);
                showAlert('Error', 'Unable to verify subscription status. Skipping remaining clients.');
                // Skip remaining clients due to error
                for (let j = i; j < validRows.length; j++) {
                  skipped.push(validRows[j]);
                }
                break;
              }
            }

            if (limitReached) {
              skipped.push(row);
              continue;
            }

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
                message += `\n• ... and ${skipped.length - 5} more`;
              }
              console.log('Skipped rows:', skipped);
            }
            showAlert('Import Result', message);

          } catch (e) {
            console.error('Import process error:', e);
            Alert.alert('Import Error', 'Failed to import CSV.');
          } finally {
            resolve();
          }
        };
        input.click();
      });
      return;
    }

    // Non-web platform implementation (React Native)
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

        // Get all clients to create account number -> clientId mapping
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
            accountToClientMap.set(data.accountNumber.toUpperCase(), {
              id: doc.id,
              address: data.address || `${data.address1 || ''}, ${data.town || ''}, ${data.postcode || ''}`
            });
          }
        });

        // Validate rows
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

        // Confirm import
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
      } else {
        Alert.alert('Unsupported file', 'Please select a CSV file.');
      }
      
    } catch (e) {
      console.error('Import process error:', e);
      Alert.alert('Import Error', 'Failed to import CSV.');
    }
  };

  // Return complete settings UI
  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        {/* Profile Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Profile</ThemedText>
          <StyledButton
            title="Edit Profile"
            onPress={() => {
              loadUserProfile();
              setProfileModalVisible(true);
            }}
          />
          {isOwner && (
            <StyledButton
              title="Bank & Business Info"
              onPress={() => {
                loadBankInfo();
                setBankInfoModalVisible(true);
              }}
            />
          )}
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Subscription</ThemedText>
          {loadingSubscription ? (
            <ThemedText style={styles.loadingText}>Loading subscription...</ThemedText>
          ) : subscription ? (
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <ThemedText style={styles.subscriptionTier}>
                  {subscription.tier === 'free' ? 'Free Plan' : 
                   subscription.tier === 'premium' ? 'Premium Plan' : 'Developer Account'}
                </ThemedText>
                <View style={[styles.subscriptionBadge, { 
                  backgroundColor: subscription.tier === 'free' ? '#6b7280' : 
                                   subscription.tier === 'premium' ? '#4f46e5' : '#059669' 
                }]}>
                  <ThemedText style={styles.subscriptionBadgeText}>
                    {subscription.tier.toUpperCase()}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={styles.subscriptionDescription}>
                {subscription.tier === 'free' ? 'Up to 20 clients' :
                 subscription.tier === 'premium' ? 'Unlimited clients + team members' :
                 'Unlimited access'}
              </ThemedText>
              {subscription.clientLimit && (
                <ThemedText style={styles.subscriptionLimit}>
                  Client limit: {subscription.clientLimit}
                </ThemedText>
              )}
            </View>
          ) : (
            <ThemedText style={styles.errorText}>Unable to load subscription information</ThemedText>
          )}
          
          {/* Migration button for owners only */}
          {isOwner && (
            <StyledButton
              title="Initialize Subscription Tiers"
              onPress={async () => {
                Alert.alert(
                  'Initialize Subscription System',
                  'This will set up subscription tiers for all users. This should only be done once. Continue?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Initialize', 
                      onPress: async () => {
                        try {
                          setLoading(true);
                          const { migrateUsersToSubscriptions } = await import('../../services/subscriptionService');
                          const result = await migrateUsersToSubscriptions();
                          Alert.alert(
                            'Migration Complete',
                            `Updated ${result.updated} users to free tier, ${result.exempt} exempt accounts created, ${result.errors} errors occurred.`
                          );
                          await loadSubscription(); // Refresh subscription data
                        } catch (error) {
                          console.error('Migration error:', error);
                          Alert.alert('Error', 'Failed to initialize subscription tiers.');
                        } finally {
                          setLoading(false);
                        }
                      }
                    }
                  ]
                );
              }}
            />
          )}
        </View>

        {/* Import Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Import Data</ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Import clients, payments, or completed jobs from CSV or Excel files
          </ThemedText>
          
          <StyledButton
            title="Import Clients"
            onPress={handleImport}
            disabled={loading}
          />
          
          <StyledButton
            title="Import Payments"
            onPress={handleImportPayments}
            disabled={loading}
          />
          
          <StyledButton
            title="Import Completed Jobs"
            onPress={handleImportCompletedJobs}
            disabled={loading}
          />
        </View>

        {/* Capacity Management */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Capacity Management</ThemedText>
          <StyledButton
            title={isRefreshingCapacity ? "Refreshing..." : "Refresh Capacity for Current Week"}
            onPress={async () => {
              setIsRefreshingCapacity(true);
              try {
                const { startOfWeek } = await import('date-fns');
                const { manualRefreshWeekCapacity } = await import('../../services/capacityService');
                
                const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                const result = await manualRefreshWeekCapacity(currentWeekStart);
                
                let message = `Capacity refresh complete!\n\nJobs redistributed: ${result.redistributedJobs}`;
                if (result.warnings.length > 0) {
                  message += `\n\nWarnings:\n${result.warnings.join('\n')}`;
                }
                
                Alert.alert('Capacity Refreshed', message);
              } catch (error) {
                console.error('Error refreshing capacity:', error);
                Alert.alert('Error', 'Failed to refresh capacity. Please try again.');
              } finally {
                setIsRefreshingCapacity(false);
              }
            }}
            disabled={isRefreshingCapacity}
          />
        </View>

        {/* Admin Section - Owner Only */}
        {isOwner && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Admin Tools</ThemedText>
            <ThemedText style={styles.warningText}>
              ⚠️ Dangerous operations - use with caution
            </ThemedText>
            
            <StyledButton
              title="Delete All Clients"
              onPress={async () => {
                try {
                  setLoading(true);
                  const count = await getClientCount();
                  setLoading(false);
                  
                  if (count === 0) {
                    showAlert('No Clients', 'You have no clients to delete.');
                    return;
                  }
                  
                  // First confirmation - show count and warning
                  const firstConfirm = await showConfirm(
                    'Warning: Delete All Clients',
                    `You are about to delete ${count} client${count > 1 ? 's' : ''}.\n\n⚠️ This action:\n• Will permanently delete ALL your clients\n• Cannot be undone\n• Will NOT delete associated jobs\n\nAre you sure you want to proceed?`
                  );
                  
                  if (!firstConfirm) return;
                  
                  // Second confirmation - final check
                  const finalConfirm = await showConfirm(
                    '⚠️ FINAL WARNING ⚠️',
                    `This is your last chance to cancel.\n\nDELETE ALL ${count} CLIENTS PERMANENTLY?`
                  );
                  
                  if (!finalConfirm) return;
                  
                  try {
                    setLoading(true);
                    const result = await deleteAllClients();
                    
                    if (result.error) {
                      showAlert('Error', `Failed to delete clients: ${result.error}`);
                    } else {
                      showAlert('Success', `${result.deleted} clients have been permanently deleted.`);
                    }
                  } catch (error) {
                    console.error('Error deleting clients:', error);
                    showAlert('Error', 'Failed to delete clients.');
                  } finally {
                    setLoading(false);
                  }
                } catch (error) {
                  console.error('Error getting client count:', error);
                  showAlert('Error', 'Failed to get client count.');
                  setLoading(false);
                }
              }}
              color="red"
              disabled={loading}
            />
            
            <StyledButton
              title="Delete All Jobs"
              onPress={async () => {
                try {
                  setLoading(true);
                  const count = await getJobCount();
                  setLoading(false);
                  
                  if (count === 0) {
                    showAlert('No Jobs', 'You have no jobs to delete.');
                    return;
                  }
                  
                  // First confirmation - show count and warning
                  const firstConfirm = await showConfirm(
                    'Warning: Delete All Jobs',
                    `You are about to delete ${count} job${count > 1 ? 's' : ''}.\n\n⚠️ This action:\n• Will permanently delete ALL your jobs (past and future)\n• Cannot be undone\n• Includes completed jobs and history\n\nAre you sure you want to proceed?`
                  );
                  
                  if (!firstConfirm) return;
                  
                  // Second confirmation - final check
                  const finalConfirm = await showConfirm(
                    '⚠️ FINAL WARNING ⚠️',
                    `This is your last chance to cancel.\n\nDELETE ALL ${count} JOBS PERMANENTLY?`
                  );
                  
                  if (!finalConfirm) return;
                  
                  try {
                    setLoading(true);
                    const result = await deleteAllJobs();
                    
                    if (result.error) {
                      showAlert('Error', `Failed to delete jobs: ${result.error}`);
                    } else {
                      showAlert('Success', `${result.deleted} jobs have been permanently deleted.`);
                    }
                  } catch (error) {
                    console.error('Error deleting jobs:', error);
                    showAlert('Error', 'Failed to delete jobs.');
                  } finally {
                    setLoading(false);
                  }
                } catch (error) {
                  console.error('Error getting job count:', error);
                  showAlert('Error', 'Failed to get job count.');
                  setLoading(false);
                }
              }}
              color="red"
              disabled={loading}
            />
            
            <StyledButton
              title="Delete All Payments"
              onPress={async () => {
                try {
                  setLoading(true);
                  const count = await getPaymentCount();
                  setLoading(false);
                  
                  if (count === 0) {
                    showAlert('No Payments', 'You have no payments to delete.');
                    return;
                  }
                  
                  // First confirmation - show count and warning
                  const firstConfirm = await showConfirm(
                    'Warning: Delete All Payments',
                    `You are about to delete ${count} payment${count > 1 ? 's' : ''}.\n\n⚠️ This action:\n• Will permanently delete ALL payment records\n• Cannot be undone\n• Will affect client balances\n\nAre you sure you want to proceed?`
                  );
                  
                  if (!firstConfirm) return;
                  
                  // Second confirmation - final check
                  const finalConfirm = await showConfirm(
                    '⚠️ FINAL WARNING ⚠️',
                    `This is your last chance to cancel.\n\nDELETE ALL ${count} PAYMENTS PERMANENTLY?`
                  );
                  
                  if (!finalConfirm) return;
                  
                  try {
                    setLoading(true);
                    await deleteAllPayments();
                    showAlert('Success', `${count} payments have been permanently deleted.`);
                  } catch (error) {
                    console.error('Error deleting payments:', error);
                    showAlert('Error', 'Failed to delete payments.');
                  } finally {
                    setLoading(false);
                  }
                } catch (error) {
                  console.error('Error getting payment count:', error);
                  showAlert('Error', 'Failed to get payment count.');
                  setLoading(false);
                }
              }}
              color="red"
              disabled={loading}
            />
          </View>
        )}

        {/* Account Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Account</ThemedText>
          <StyledButton
            title="Sign Out"
            onPress={async () => {
              const confirmed = await showConfirm(
                'Sign Out',
                'Are you sure you want to sign out?'
              );
              
              if (confirmed) {
                try {
                  console.log('🔑 Signing out user...');
                  const { signOut } = await import('firebase/auth');
                  const { auth } = await import('../../core/firebase');
                  await signOut(auth);
                  console.log('🔑 Sign out successful, redirecting to login');
                  router.replace('/login');
                } catch (error) {
                  console.error('Error signing out:', error);
                  showAlert('Error', 'Failed to sign out.');
                }
              }
            }}
          />
        </View>
      </ScrollView>

      {/* Profile Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText style={styles.modalTitle}>Edit Profile</ThemedText>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Name *"
              value={profileForm.name}
              onChangeText={(text) => setProfileForm(prev => ({ ...prev, name: text }))}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Address Line 1"
              value={profileForm.address1}
              onChangeText={(text) => setProfileForm(prev => ({ ...prev, address1: text }))}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Town"
              value={profileForm.town}
              onChangeText={(text) => setProfileForm(prev => ({ ...prev, town: text }))}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Postcode"
              value={profileForm.postcode}
              onChangeText={(text) => setProfileForm(prev => ({ ...prev, postcode: text }))}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Contact Number"
              value={profileForm.contactNumber}
              keyboardType="phone-pad"
              onChangeText={(text) => setProfileForm(prev => ({ ...prev, contactNumber: text }))}
            />
            
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setProfileModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                <Text style={styles.saveButtonText}>
                  {savingProfile ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bank & Business Info Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={bankInfoModalVisible}
        onRequestClose={() => setBankInfoModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText style={styles.modalTitle}>Bank & Business Info</ThemedText>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Business Name *"
              value={bankInfoForm.businessName}
              onChangeText={(text) => setBankInfoForm(prev => ({ ...prev, businessName: text }))}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Bank Sort Code"
              value={bankInfoForm.bankSortCode}
              onChangeText={(text) => setBankInfoForm(prev => ({ ...prev, bankSortCode: text }))}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Bank Account Number"
              value={bankInfoForm.bankAccountNumber}
              onChangeText={(text) => setBankInfoForm(prev => ({ ...prev, bankAccountNumber: text }))}
              keyboardType="numeric"
            />
            
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setBankInfoModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveBankInfo}
                disabled={savingBankInfo}
              >
                <Text style={styles.saveButtonText}>
                  {savingBankInfo ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#dc3545',
    textAlign: 'center',
    padding: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#f56500',
    marginBottom: 12,
    fontWeight: '500',
  },
  subscriptionCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subscriptionTier: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subscriptionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  subscriptionBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  subscriptionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  subscriptionLimit: {
    fontSize: 12,
    color: '#999',
  },
  btnBase: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
    alignItems: 'center',
  },
  btnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});