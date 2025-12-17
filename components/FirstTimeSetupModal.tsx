import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, format, startOfWeek } from 'date-fns';
import { addDoc, collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
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
  const { width } = useWindowDimensions();
  const isNarrow = width < 720;
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
            <View style={styles.card}>
              <View style={styles.progressRow}>
                {[1, 2, 3, 4].map((n) => (
                  <View key={n} style={styles.progressItem}>
                    <View style={[styles.progressDot, n <= step ? styles.progressDotActive : null]} />
                    {n !== 4 && <View style={[styles.progressLine, n < step ? styles.progressLineActive : null]} />}
                  </View>
                ))}
              </View>

              <View style={styles.hero}>
                <View style={styles.heroIconCircle}>
                  <Ionicons name="sparkles" size={22} color="#4f46e5" />
                </View>
                <Text style={styles.cardTitle}>Welcome to Guvnor</Text>
                <Text style={styles.cardSubtitle}>Let’s set up your account in under a minute.</Text>
              </View>

              <Text style={styles.questionText}>
                Do you have an invite code to join an existing organisation?
              </Text>

              <View style={[styles.choiceRow, isNarrow && styles.choiceRowStack]}>
                <TouchableOpacity
                  style={[styles.choiceButton, styles.choicePrimary, isNarrow && styles.choiceButtonStack]}
                  onPress={() => handleInviteCodeChoice(true)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="key-outline" size={18} color="#fff" />
                  <Text style={styles.choiceText}>Yes, I have a code</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.choiceButton, styles.choiceSecondary, isNarrow && styles.choiceButtonStack]}
                  onPress={() => handleInviteCodeChoice(false)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="rocket-outline" size={18} color="#fff" />
                  <Text style={styles.choiceText}>No, continue without</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.footerHint}>You can change these settings later.</Text>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <View style={styles.card}>
              <View style={styles.progressRow}>
                {[1, 2, 3, 4].map((n) => (
                  <View key={n} style={styles.progressItem}>
                    <View style={[styles.progressDot, n <= step ? styles.progressDotActive : null]} />
                    {n !== 4 && <View style={[styles.progressLine, n < step ? styles.progressLineActive : null]} />}
                  </View>
                ))}
              </View>

              <View style={styles.hero}>
                <View style={styles.heroIconCircle}>
                  <Ionicons name="business-outline" size={22} color="#4f46e5" />
                </View>
                <Text style={styles.cardTitle}>Business information</Text>
                <Text style={styles.cardSubtitle}>Tell us about your business.</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Business name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your business name"
                    placeholderTextColor="#9ca3af"
                    value={businessName}
                    onChangeText={setBusinessName}
                    editable={!saving}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bank sort code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 12-34-56"
                    placeholderTextColor="#9ca3af"
                    value={bankSortCode}
                    onChangeText={setBankSortCode}
                    editable={!saving}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bank account number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 12345678"
                    placeholderTextColor="#9ca3af"
                    value={bankAccountNumber}
                    onChangeText={setBankAccountNumber}
                    keyboardType="numeric"
                    editable={!saving}
                  />
                </View>
              </View>

              <View style={[styles.actionRow, isNarrow && styles.actionRowStack]}>
                <TouchableOpacity
                  style={[styles.primaryButton, isNarrow && styles.actionBtnStack]}
                  onPress={handleNext}
                  disabled={saving}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <View style={styles.card}>
              <View style={styles.progressRow}>
                {[1, 2, 3, 4].map((n) => (
                  <View key={n} style={styles.progressItem}>
                    <View style={[styles.progressDot, n <= step ? styles.progressDotActive : null]} />
                    {n !== 4 && <View style={[styles.progressLine, n < step ? styles.progressLineActive : null]} />}
                  </View>
                ))}
              </View>

              <View style={styles.hero}>
                <View style={styles.heroIconCircle}>
                  <Ionicons name="calendar-outline" size={22} color="#4f46e5" />
                </View>
                <Text style={styles.cardTitle}>Working days</Text>
                <Text style={styles.cardSubtitle}>Which days do you typically work?</Text>
              </View>

              <Text style={styles.hint}>You can change this later in the Rota screen.</Text>

              <View style={styles.daysContainer}>
                {DAYS_OF_WEEK.map(day => (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.dayButton,
                      workingDays[day.key] && styles.dayButtonActive
                    ]}
                    onPress={() => toggleDay(day.key)}
                    activeOpacity={0.9}
                  >
                    <Ionicons
                      name={workingDays[day.key] ? "checkbox" : "square-outline"}
                      size={22}
                      color={workingDays[day.key] ? "#4f46e5" : "#9ca3af"}
                    />
                    <Text style={[
                      styles.dayText,
                      workingDays[day.key] && styles.dayTextActive
                    ]}>{day.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.actionRow, isNarrow && styles.actionRowStack]}>
                <TouchableOpacity
                  style={[styles.secondaryButton, isNarrow && styles.actionBtnStack]}
                  onPress={() => setStep(2)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, isNarrow && styles.actionBtnStack]}
                  onPress={handleNext}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContainer}>
            <View style={styles.card}>
              <View style={styles.progressRow}>
                {[1, 2, 3, 4].map((n) => (
                  <View key={n} style={styles.progressItem}>
                    <View style={[styles.progressDot, n <= step ? styles.progressDotActive : null]} />
                    {n !== 4 && <View style={[styles.progressLine, n < step ? styles.progressLineActive : null]} />}
                  </View>
                ))}
              </View>

              <View style={styles.hero}>
                <View style={styles.heroIconCircle}>
                  <Ionicons name="car-outline" size={22} color="#4f46e5" />
                </View>
                <Text style={styles.cardTitle}>Vehicle & daily limit</Text>
                <Text style={styles.cardSubtitle}>Set your first vehicle and daily target.</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Vehicle name or registration</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. white transit, AB12 CDE"
                    placeholderTextColor="#9ca3af"
                    value={vehicleNameOrReg}
                    onChangeText={setVehicleNameOrReg}
                    editable={!saving}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Daily turnover limit (£)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 250"
                    placeholderTextColor="#9ca3af"
                    value={dailyTurnoverLimit}
                    onChangeText={setDailyTurnoverLimit}
                    keyboardType="numeric"
                    editable={!saving}
                  />
                  <Text style={styles.explanation}>
                    We will organise your round to this as a limit before spilling work into other days.
                  </Text>
                </View>
              </View>

              <View style={[styles.actionRow, isNarrow && styles.actionRowStack]}>
                <TouchableOpacity
                  style={[styles.secondaryButton, isNarrow && styles.actionBtnStack, saving && styles.buttonDisabled]}
                  onPress={() => setStep(3)}
                  disabled={saving}
                  activeOpacity={0.9}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, isNarrow && styles.actionBtnStack, saving && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Complete setup'}</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    justifyContent: 'center',
  },
  stepContainer: {
    flex: 1,
  },

  // Shared card layout
  card: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      default: {
        elevation: 4,
      },
    }),
  },

  // Progress indicator
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e5e7eb',
  },
  progressDotActive: {
    backgroundColor: '#4f46e5',
  },
  progressLine: {
    width: 36,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 10,
  },
  progressLineActive: {
    backgroundColor: '#c7d2fe',
  },

  // Header
  hero: {
    alignItems: 'center',
    marginBottom: 12,
  },
  heroIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
  },

  // Step 1
  questionText: {
    fontSize: 18,
    color: '#111827',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 18,
    lineHeight: 26,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  choiceRowStack: {
    flexDirection: 'column',
  },
  choiceButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  choiceButtonStack: {
    width: '100%',
  },
  choicePrimary: {
    backgroundColor: '#4f46e5',
  },
  choiceSecondary: {
    backgroundColor: '#16a34a',
  },
  choiceText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footerHint: {
    marginTop: 14,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
  },

  // Forms
  form: {
    marginTop: 8,
    gap: 16,
  },
  hint: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 14,
    textAlign: 'center',
  },
  daysContainer: {
    marginTop: 6,
    marginBottom: 16,
  },
  dayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  dayButtonActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
  },
  dayText: {
    fontSize: 16,
    color: '#374151',
  },
  dayTextActive: {
    color: '#4f46e5',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
  },
  explanation: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  actionRowStack: {
    flexDirection: 'column',
  },
  actionBtnStack: {
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
}); 