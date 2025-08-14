import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, format, startOfWeek } from 'date-fns';
import { addDoc, collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../core/firebase';
import { getUserSession } from '../core/session';
import { AvailabilityStatus } from '../services/rotaService';

interface FirstTimeSetupModalProps {
  visible: boolean;
  onComplete: (hasInviteCode: boolean) => void;
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday', dayIndex: 0 },
  { key: 'tuesday', label: 'Tuesday', dayIndex: 1 },
  { key: 'wednesday', label: 'Wednesday', dayIndex: 2 },
  { key: 'thursday', label: 'Thursday', dayIndex: 3 },
  { key: 'friday', label: 'Friday', dayIndex: 4 },
  { key: 'saturday', label: 'Saturday', dayIndex: 5 },
  { key: 'sunday', label: 'Sunday', dayIndex: 6 },
];

export default function FirstTimeSetupModal({ visible, onComplete }: FirstTimeSetupModalProps) {
  const [step, setStep] = useState(1);
  const [hasInviteCode, setHasInviteCode] = useState<boolean | null>(null);
  const [workingDays, setWorkingDays] = useState<Record<string, boolean>>({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
  });
  const [vehicleNameOrReg, setVehicleNameOrReg] = useState('');
  const [dailyTurnoverLimit, setDailyTurnoverLimit] = useState('');
  
  // Business info fields
  const [businessName, setBusinessName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  
  const [saving, setSaving] = useState(false);

  // Persist draft state so a brief remount does not lose progress
  const draftKey = useMemo(() => {
    const uid = auth.currentUser?.uid;
    return uid ? `firstTimeSetupDraft:${uid}` : null;
  }, [auth.currentUser?.uid]);

  // Load draft when modal becomes visible
  useEffect(() => {
    if (!visible || !draftKey) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (typeof draft.step === 'number') setStep(draft.step);
        if (typeof draft.hasInviteCode !== 'undefined') setHasInviteCode(draft.hasInviteCode);
        if (draft.workingDays && typeof draft.workingDays === 'object') setWorkingDays(draft.workingDays);
        if (typeof draft.vehicleNameOrReg === 'string') setVehicleNameOrReg(draft.vehicleNameOrReg);
        if (typeof draft.dailyTurnoverLimit === 'string') setDailyTurnoverLimit(draft.dailyTurnoverLimit);
        if (typeof draft.businessName === 'string') setBusinessName(draft.businessName);
        if (typeof draft.bankSortCode === 'string') setBankSortCode(draft.bankSortCode);
        if (typeof draft.bankAccountNumber === 'string') setBankAccountNumber(draft.bankAccountNumber);
      } catch (e) {
        console.warn('Failed to load first-time setup draft', e);
      }
    })();
  }, [visible, draftKey]);

  // Save draft whenever fields change while visible
  useEffect(() => {
    if (!visible || !draftKey) return;
    const payload = JSON.stringify({
      step,
      hasInviteCode,
      workingDays,
      vehicleNameOrReg,
      dailyTurnoverLimit,
      businessName,
      bankSortCode,
      bankAccountNumber,
    });
    AsyncStorage.setItem(draftKey, payload).catch((e) =>
      console.warn('Failed to save first-time setup draft', e)
    );
  }, [visible, draftKey, step, hasInviteCode, workingDays, vehicleNameOrReg, dailyTurnoverLimit, businessName, bankSortCode, bankAccountNumber]);

  const toggleDay = (day: string) => {
    setWorkingDays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const handleInviteCodeChoice = (hasCode: boolean) => {
    setHasInviteCode(hasCode);
    if (hasCode) {
      // Close modal and let them navigate to invite code screen
      onComplete(true);
    } else {
      setStep(2);
    }
  };

  const handleNext = () => {
    if (step === 2) {
      // Validate business name is provided
      if (!businessName.trim()) {
        Alert.alert('Error', 'Please enter your business name.');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Validate at least one working day is selected
      const hasWorkingDay = Object.values(workingDays).some(v => v);
      if (!hasWorkingDay) {
        Alert.alert('Error', 'Please select at least one working day.');
        return;
      }
      setStep(4);
    }
  };

  const setupDefaultRota = async (session: any) => {
    try {
      // Set up default rota for the next 52 weeks based on selected working days
      const today = new Date();
      const start = startOfWeek(today, { weekStartsOn: 1 });
      
      for (let week = 0; week < 52; week++) {
        const weekStart = addDays(start, week * 7);
        
        for (const dayConfig of DAYS_OF_WEEK) {
          const dayDate = addDays(weekStart, dayConfig.dayIndex);
          const dateKey = format(dayDate, 'yyyy-MM-dd');
          const status: AvailabilityStatus = workingDays[dayConfig.key] ? 'on' : 'off';
          
          // Create rota document for this day
          const rotaRef = doc(db, `accounts/${session.accountId}/rota/${dateKey}`);
          await setDoc(rotaRef, { [session.uid]: status }, { merge: true });
        }
      }
    } catch (error) {
      console.error('Error setting up default rota:', error);
    }
  };

  const handleSave = async () => {
    if (!vehicleNameOrReg.trim()) {
      Alert.alert('Error', 'Please enter a vehicle name or registration.');
      return;
    }
    if (!dailyTurnoverLimit.trim() || isNaN(Number(dailyTurnoverLimit))) {
      Alert.alert('Error', 'Please enter a valid daily turnover limit.');
      return;
    }

    setSaving(true);
    try {
      const session = await getUserSession();
      if (!session) throw new Error('No session found');

      // Update user document with setup completion, preferences, and business info
      await updateDoc(doc(db, 'users', session.uid), {
        firstTimeSetupCompleted: true,
        defaultWorkingDays: workingDays,
        vehicleName: vehicleNameOrReg.trim(),
        dailyTurnoverLimit: Number(dailyTurnoverLimit),
        businessName: businessName.trim(),
        bankSortCode: bankSortCode.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        updatedAt: new Date().toISOString(),
      });

      // Set up default rota
      await setupDefaultRota(session);

      // Create vehicle
      const vehicleDoc = await addDoc(collection(db, `accounts/${session.accountId}/vehicles`), {
        name: vehicleNameOrReg.trim(),
        registration: vehicleNameOrReg.trim(),
        dailyLimit: Number(dailyTurnoverLimit),
        createdAt: new Date().toISOString(),
        ownerId: session.accountId,
      });

      // Create/update member record with vehicle assignment and daily rate
      await setDoc(doc(db, `accounts/${session.accountId}/members/${session.uid}`), {
        uid: session.uid,
        email: auth.currentUser?.email || '',
        role: 'owner',
        perms: {
          viewClients: true,
          viewRunsheet: true,
          viewPayments: true,
        },
        status: 'active',
        vehicleId: vehicleDoc.id,
        dailyRate: Number(dailyTurnoverLimit),
        createdAt: new Date().toISOString(),
      }, { merge: true });

      // Show success message briefly, then auto-navigate
      Alert.alert(
        'Setup Complete',
        'Your account has been configured successfully!'
      );
      
      // Clear any saved draft now that setup is complete
      if (draftKey) {
        try { await AsyncStorage.removeItem(draftKey); } catch {}
      }

      // Auto-navigate after a short delay
      setTimeout(() => {
        onComplete(false);
      }, 1500);
    } catch (error) {
      console.error('Error saving setup:', error);
      Alert.alert('Error', 'Failed to save setup. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {}}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Welcome to Guvnor!</Text>
            <Text style={styles.subtitle}>Let's set up your account</Text>
            
            <View style={styles.questionContainer}>
              <Text style={styles.question}>
                Do you have an invite code to join an existing organisation?
              </Text>
              
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={[styles.choiceButton, styles.yesButton]}
                  onPress={() => handleInviteCodeChoice(true)}
                >
                  <Text style={styles.buttonText}>Yes, I have a code</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.choiceButton, styles.noButton]}
                  onPress={() => handleInviteCodeChoice(false)}
                >
                  <Text style={styles.buttonText}>No, continue without</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Business Information</Text>
            <Text style={styles.subtitle}>Tell us about your business</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your business name"
                value={businessName}
                onChangeText={setBusinessName}
                editable={!saving}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank Sort Code</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 12-34-56"
                value={bankSortCode}
                onChangeText={setBankSortCode}
                editable={!saving}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank Account Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 12345678"
                value={bankAccountNumber}
                onChangeText={setBankAccountNumber}
                keyboardType="numeric"
                editable={!saving}
              />
            </View>
            
            <Button title="Next" onPress={handleNext} />
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Working Days</Text>
            <Text style={styles.subtitle}>Which days do you typically work?</Text>
            <Text style={styles.hint}>You can change this later in the Rota screen</Text>
            
            <View style={styles.daysContainer}>
              {DAYS_OF_WEEK.map(day => (
                <TouchableOpacity
                  key={day.key}
                  style={[
                    styles.dayButton,
                    workingDays[day.key] && styles.dayButtonActive
                  ]}
                  onPress={() => toggleDay(day.key)}
                >
                  <Ionicons 
                    name={workingDays[day.key] ? "checkbox" : "square-outline"} 
                    size={24} 
                    color={workingDays[day.key] ? "#007AFF" : "#999"}
                  />
                  <Text style={[
                    styles.dayText,
                    workingDays[day.key] && styles.dayTextActive
                  ]}>{day.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.buttonContainer}>
              <Button 
                title="Back" 
                onPress={() => setStep(2)} 
                color="#666"
              />
              <Button title="Next" onPress={handleNext} />
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Vehicle & Daily Limit</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Name or Registration</Text>
              <TextInput
                style={styles.input}
                placeholder="eg. registration, white transit, bicycle"
                value={vehicleNameOrReg}
                onChangeText={setVehicleNameOrReg}
                editable={!saving}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Daily Turnover Limit (£)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 250"
                value={dailyTurnoverLimit}
                onChangeText={setDailyTurnoverLimit}
                keyboardType="numeric"
                editable={!saving}
              />
              <Text style={styles.explanation}>
                We will organise your round to this as a limit before spilling work into other days
              </Text>
            </View>
            
            <View style={styles.buttonContainer}>
              <Button 
                title="Back" 
                onPress={() => setStep(3)} 
                color="#666"
                disabled={saving}
              />
              <Button 
                title={saving ? "Saving..." : "Complete Setup"} 
                onPress={handleSave}
                disabled={saving}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  stepContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  questionContainer: {
    marginTop: 40,
  },
  question: {
    fontSize: 20,
    marginBottom: 30,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    gap: 15,
  },
  choiceButton: {
    flex: 1,
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  yesButton: {
    backgroundColor: '#007AFF',
  },
  noButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 14,
    color: '#999',
    marginBottom: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  daysContainer: {
    marginVertical: 20,
  },
  dayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 10,
  },
  dayButtonActive: {
    backgroundColor: '#e3f2fd',
  },
  dayText: {
    fontSize: 16,
    color: '#666',
  },
  dayTextActive: {
    color: '#007AFF',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  explanation: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
}); 