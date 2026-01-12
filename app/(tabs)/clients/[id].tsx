import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { addWeeks, format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import GoCardlessSettingsModal from '../../../components/GoCardlessSettingsModal';
import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { IconSymbol } from '../../../components/ui/IconSymbol';
import { Colors } from '../../../constants/Colors';
import { auth, db } from '../../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../../core/session';
import { useColorScheme } from '../../../hooks/useColorScheme';
import { formatAuditDescription, getClientAddress, logAction } from '../../../services/auditService';
import { updateClientGoCardlessSettings } from '../../../services/clientService';
import { createJobsForAdditionalServices, isTodayMarkedComplete } from '../../../services/jobService';
import { updatePayment } from '../../../services/paymentService';
import type { AdditionalService, Client } from '../../../types/client';
import type { Job, Payment } from '../../../types/models';
import type { ServicePlan } from '../../../types/servicePlan';
import { displayAccountNumber } from '../../../utils/account';

type ServiceHistoryItem = (Job & { type: 'job' }) | (Payment & { type: 'payment' });

// Extend Client type to include optional startingBalance
type ClientWithStartingBalance = Client & { startingBalance?: number };

const isSameDay = (a: Date | null | undefined, b: Date | null | undefined) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

// Mobile browser detection for better touch targets
const isMobileBrowser = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
    (window.innerWidth <= 768);
};

export default function ClientDetailScreen() {
  const params = useLocalSearchParams();
  const id = typeof (params as any).id === 'string' ? (params as any).id : '';
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [jobType, setJobType] = useState('Gutter cleaning');
  const [customJobType, setCustomJobType] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [jobPrice, setJobPrice] = useState('');
  const [jobDate, setJobDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [accountNotesCollapsed, setAccountNotesCollapsed] = useState(false);
  const [accountNotesModalVisible, setAccountNotesModalVisible] = useState(false);
  const [newAccountNoteText, setNewAccountNoteText] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [todayComplete, setTodayComplete] = useState(false);
  const [nextScheduledVisit, setNextScheduledVisit] = useState<string | null>(null);
  const [originalScheduledVisit, setOriginalScheduledVisit] = useState<string | null>(null); // Original date before job was moved
  const [nextJobWasMoved, setNextJobWasMoved] = useState(false); // Fallback for jobs moved before tracking was added
  const [scheduleCollapsed, setScheduleCollapsed] = useState(false);
  const [pendingJobs, setPendingJobs] = useState<(Job & { type: 'job' })[]>([]);
  const [movePaymentModalVisible, setMovePaymentModalVisible] = useState(false);
  const [paymentToMove, setPaymentToMove] = useState<(Payment & { type: 'payment' }) | null>(null);
  const [clientsForMove, setClientsForMove] = useState<Client[]>([]);
  const [loadingClientsForMove, setLoadingClientsForMove] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [selectedMoveClient, setSelectedMoveClient] = useState<Client | null>(null);
  const [movingPayment, setMovingPayment] = useState(false);
  
  // Additional recurring work states
  const [modalMode, setModalMode] = useState<'one-time' | 'recurring'>('one-time');
  const [recurringServiceType, setRecurringServiceType] = useState('Gutter cleaning');
  const [customRecurringServiceType, setCustomRecurringServiceType] = useState('');
  const [recurringFrequency, setRecurringFrequency] = useState(12); // weeks
  const [recurringPrice, setRecurringPrice] = useState('');
  const [recurringNextVisit, setRecurringNextVisit] = useState(new Date());
  const [showRecurringDatePicker, setShowRecurringDatePicker] = useState(false);

  // Additional service edit states
  const [editServiceModalVisible, setEditServiceModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<AdditionalService | null>(null);
  const [editServiceType, setEditServiceType] = useState('');
  const [editCustomServiceType, setEditCustomServiceType] = useState('');
  const [editServiceFrequency, setEditServiceFrequency] = useState(12);
  const [editServicePrice, setEditServicePrice] = useState('');
  const [editServiceNextVisit, setEditServiceNextVisit] = useState(new Date());
  const [showEditServiceDatePicker, setShowEditServiceDatePicker] = useState(false);
  
  // Service plans state
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);

  // GoCardless settings modal state
  const [gocardlessModalVisible, setGocardlessModalVisible] = useState(false);

  const planByService = useMemo(() => {
    const map: Record<string, ServicePlan> = {};
    servicePlans.forEach(plan => {
      if (plan.serviceType) {
        map[plan.serviceType] = plan;
      }
    });
    return map;
  }, [servicePlans]);

  const nextPendingJobByService = useMemo(() => {
    const map: Record<string, (Job & { type: 'job' })> = {};
    pendingJobs.forEach(job => {
      const key = job.serviceId || 'default';
      if (!map[key]) {
        map[key] = job;
        return;
      }
      const existingDate = new Date(map[key].scheduledTime || 0).getTime();
      const jobDate = new Date(job.scheduledTime || 0).getTime();
      if (jobDate < existingDate) {
        map[key] = job;
      }
    });
    return map;
  }, [pendingJobs]);

  // Get responsive layout like accounts screen
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isLargeScreen = isWeb && width > 768;

  // Helper function to calculate what date a job SHOULD be on based on service plan
  const calculateExpectedJobDate = (jobDate: string, plan: ServicePlan): string | null => {
    if (!plan.startDate || !plan.frequencyWeeks || plan.scheduleType !== 'recurring') {
      return null;
    }
    
    try {
      const jobDateTime = parseISO(jobDate);
      const planStart = parseISO(plan.startDate);
      
      // Find which occurrence this should be
      let expectedDate = new Date(planStart);
      
      // If job is before plan start, it shouldn't exist
      if (jobDateTime < planStart) {
        return null;
      }
      
      // Calculate which occurrence this should be
      const weeksDiff = Math.round((jobDateTime.getTime() - planStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const occurrenceNumber = Math.floor(weeksDiff / plan.frequencyWeeks);
      
      // Calculate the expected date for this occurrence
      expectedDate = addWeeks(planStart, occurrenceNumber * plan.frequencyWeeks);
      
      return format(expectedDate, 'yyyy-MM-dd');
    } catch {
      return null;
    }
  };

  const fetchClient = useCallback(async () => {
    if (typeof id === 'string') {
      const docRef = doc(db, 'clients', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setClient({ id: docSnap.id, ...data } as Client);
        setNotes(data.runsheetNotes || data.notes || '');
      }
      
      // Fetch service plans
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) {
          throw new Error('Missing ownerId (data owner id) for service plan query');
        }
        const plansQuery = query(
          collection(db, 'servicePlans'),
          where('ownerId', '==', ownerId),
          where('clientId', '==', id)
        );
        const plansSnapshot = await getDocs(plansQuery);
        const plans = plansSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as ServicePlan));
        setServicePlans(plans);
      } catch (error) {
        console.error('Error fetching service plans:', error);
        setServicePlans([]);
      }
      
      setLoading(false);
    }
  }, [id]);

  const fetchServiceHistory = useCallback(async () => {
    if (!client) return;

    setLoadingHistory(true);
    setBalance(null); // Reset balance on re-fetch
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        throw new Error('Missing ownerId (data owner id) for history query');
      }

      // Fetch all jobs for this client (not just completed)
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', client.id)
      );
      const jobsSnapshot = await getDocs(jobsQuery);
      const jobsData = jobsSnapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id, type: 'job' } as Job & { type: 'job' }))
        .filter(job => job.status === 'completed');

      // Fetch payments
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', client.id)
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const paymentsData = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'payment' })) as (Payment & { type: 'payment' })[];
      
      // Calculate balance from the client's perspective (credit is positive, debt is negative)
      const totalBilled = jobsData.reduce((sum, job) => sum + job.price, 0);
      const totalPaid = paymentsData.reduce((sum, payment) => sum + payment.amount, 0);
      setBalance(totalPaid - totalBilled);

      // Combine and sort for history view
      const combinedHistory = [...jobsData, ...paymentsData];
      combinedHistory.sort((a, b) => {
        const dateA = new Date(a.type === 'job' ? (a.scheduledTime || 0) : (a.date || 0)).getTime();
        const dateB = new Date(b.type === 'job' ? (b.scheduledTime || 0) : (b.date || 0)).getTime();
        return dateB - dateA;
      });

      setServiceHistory(combinedHistory);

      // Pending jobs for schedule
      const pending = jobsSnapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id, type: 'job' } as Job & { type: 'job' }))
        .filter(job => job.status !== 'completed')
        // Sort by scheduled date (earliest first)
        .sort((a, b) => {
          const dateA = new Date(a.scheduledTime || 0).getTime();
          const dateB = new Date(b.scheduledTime || 0).getTime();
          return dateA - dateB;
        });
      setPendingJobs(pending);
    } catch (error) {
      console.error("Error fetching service history:", error);
      Alert.alert("Error", "Could not load service history.");
    } finally {
      setLoadingHistory(false);
    }
  }, [client]);

  useEffect(() => {
    fetchServiceHistory();
  }, [client, fetchServiceHistory]);

  const loadClientsForMove = useCallback(async () => {
    if (clientsForMove.length > 0 || loadingClientsForMove) return;
    try {
      setLoadingClientsForMove(true);
      const ownerId = await getDataOwnerId();
      if (!ownerId) return;

      const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
      const snapshot = await getDocs(clientsQuery);
      const allClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClientsForMove(allClients);
    } catch (error) {
      console.error('Error loading clients for payment move:', error);
    } finally {
      setLoadingClientsForMove(false);
    }
  }, [clientsForMove.length, loadingClientsForMove]);

  const handleMovePaymentPress = (payment: Payment & { type: 'payment' }) => {
    setPaymentToMove(payment);
    setSelectedMoveClient(null);
    setClientSearchQuery('');
    setMovePaymentModalVisible(true);
    loadClientsForMove();
  };

  const filteredMoveClients = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase();
    return clientsForMove
      .filter(c => c.id !== client?.id)
      .filter(c => {
        if (!q) return true;
        const haystack = [
          c.name,
          c.accountNumber,
          c.address1,
          c.town,
          c.postcode
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [client?.id, clientSearchQuery, clientsForMove]);

  const handleConfirmMovePayment = async () => {
    if (!paymentToMove || !selectedMoveClient) {
      Alert.alert('Select client', 'Please pick a client to move this payment to.');
      return;
    }

    try {
      setMovingPayment(true);
      await updatePayment(paymentToMove.id, {
        clientId: selectedMoveClient.id,
        jobId: null,
      });
      Alert.alert('Payment moved', `Payment moved to ${selectedMoveClient.name || 'client'}.`);
      setMovePaymentModalVisible(false);
      setPaymentToMove(null);
      fetchServiceHistory();
    } catch (error) {
      console.error('Error moving payment:', error);
      Alert.alert('Error', 'Could not move the payment. Please try again.');
    } finally {
      setMovingPayment(false);
    }
  };

  const renderHistoryItem = useCallback(({ item }: { item: ServiceHistoryItem | { type: 'startingBalance'; amount: number } }) => {
    if (item.type === 'startingBalance') {
      return (
        <View style={[styles.historyItem, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <ThemedText style={styles.historyItemText}>
            <ThemedText style={{ fontWeight: 'bold' }}>Starting Balance:</ThemedText>{' '}£{Number((item as any).amount).toFixed(2)}
          </ThemedText>
        </View>
      );
    } else if (item.type === 'job') {
      return (
        <View style={[styles.historyItem, styles.jobItem, { backgroundColor: theme.jobItemBackground, borderColor: theme.jobItemBorder }]}>
          <ThemedText style={styles.historyItemText}>
            <ThemedText style={{ fontWeight: 'bold' }}>Job:</ThemedText>{' '}{format(parseISO((item as any).scheduledTime), 'do MMMM yyyy')}
          </ThemedText>
          <ThemedText style={styles.historyItemText}>
            <ThemedText>Status:</ThemedText>{' '}<ThemedText style={{ fontWeight: 'bold' }}>{(item as any).status}</ThemedText>
          </ThemedText>
          <ThemedText style={styles.historyItemText}>Price: £{(item as any).price.toFixed(2)}</ThemedText>
        </View>
      );
    } else if (item.type === 'payment') {
      const payment = item as Payment & { type: 'payment' };
      return (
        <View style={[styles.historyItem, styles.paymentItem, { backgroundColor: theme.paymentItemBackground, borderColor: theme.paymentItemBorder }]}>
          <View style={styles.paymentHeaderRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.historyItemText}>
                <ThemedText style={{ fontWeight: 'bold' }}>Payment:</ThemedText>{' '} {format(parseISO(payment.date), 'do MMMM yyyy')}
              </ThemedText>
              <ThemedText style={styles.historyItemText}>
                Amount:{' '}<ThemedText style={{ fontWeight: 'bold' }}>£{payment.amount.toFixed(2)}</ThemedText>
              </ThemedText>
              <ThemedText style={styles.historyItemText}>Method: {payment.method.replace('_', ' ')}</ThemedText>
              {payment.reference && (
                <ThemedText style={styles.historyItemText}>Reference:{' '}<ThemedText style={{ fontWeight: 'bold' }}>{payment.reference}</ThemedText></ThemedText>
              )}
              {payment.notes && (
                <ThemedText style={styles.historyItemText}>Notes:{' '}<ThemedText style={{ fontWeight: 'bold' }}>{payment.notes}</ThemedText></ThemedText>
              )}
            </View>
            <Pressable
              style={styles.movePaymentButton}
              onPress={() => handleMovePaymentPress(payment)}
            >
              <Ionicons name="swap-horizontal" size={16} color="#fff" style={{ marginRight: 6 }} />
              <ThemedText style={styles.movePaymentButtonText}>Move</ThemedText>
            </Pressable>
          </View>
        </View>
      );
    }
    return null;
  }, [handleMovePaymentPress, theme]);

  // Optionally open Add Service modal when navigated from Manage Services,
  // then immediately clear the trigger param so it doesn't persist
  useEffect(() => {
    try {
      const p = params as any;
      if (p.openAddServiceModal === '1') {
        setModalVisible(true);
        // Remove the param to prevent future automatic opens
        router.replace({ pathname: '/(tabs)/clients/[id]', params: { id } } as never);
      }
    } catch {}
  }, [id]);

  useEffect(() => {
    const checkTodayComplete = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday as start of week
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const ownerId = await getDataOwnerId();
      if (!ownerId) return;
      const completedDoc = await getDoc(doc(db, 'completedWeeks', `${ownerId}_${weekStartStr}`));
      if (completedDoc.exists()) {
        const data = completedDoc.data();
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const todayDay = daysOfWeek[today.getDay() - 1];
        if (data.completedDays && data.completedDays.includes(todayDay)) {
          setTodayComplete(true);
        } else {
          setTodayComplete(false);
        }
      } else {
        setTodayComplete(false);
      }
    };
    checkTodayComplete();
  }, []);

  useEffect(() => {
    if (!client) return;

    // Fetch next scheduled visit (next pending job)
    const fetchNextScheduledVisit = async () => {
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) {
          setNextScheduledVisit(null);
          setOriginalScheduledVisit(null);
          setNextJobWasMoved(false);
          return;
        }

        const jobsQuery = query(
          collection(db, 'jobs'),
          where('ownerId', '==', ownerId),
          where('clientId', '==', client.id),
          where('status', 'in', ['pending', 'scheduled', 'in_progress'])
        );
        const jobsSnapshot = await getDocs(jobsQuery);
        const now = new Date();
        let nextJobDate: Date | null = null;
        let nextJobOriginalDate: string | null = null;
        let nextJobIsDeferred: boolean = false;
        jobsSnapshot.forEach(doc => {
          const job = doc.data();
          if (job.scheduledTime) {
            const jobDate = new Date(job.scheduledTime);
            if (jobDate >= now && (!nextJobDate || jobDate < nextJobDate)) {
              nextJobDate = jobDate;
              // Track the original date if job was moved
              nextJobOriginalDate = job.originalScheduledTime || null;
              // Also track isDeferred as fallback for jobs moved before tracking was added
              nextJobIsDeferred = job.isDeferred || false;
            }
          }
        });
        setNextScheduledVisit((nextJobDate && Object.prototype.toString.call(nextJobDate) === '[object Date]') ? (nextJobDate as Date).toISOString() : null);
        setOriginalScheduledVisit(nextJobOriginalDate);
        setNextJobWasMoved(nextJobIsDeferred);
      } catch (error) {
        setNextScheduledVisit(null);
        setOriginalScheduledVisit(null);
        setNextJobWasMoved(false);
      }
    };

    fetchNextScheduledVisit();
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);  // reset loading state
      fetchClient();
    }, [fetchClient])
  );

  const performArchive = async () => {
    if (typeof id === 'string') {
      try {
        console.log('🗂️ Starting archive process for client:', id);
        
        // First, verify the user has proper permissions
        console.log('🗂️ Getting user session...');
        const session = await getUserSession();
        if (!session) {
          console.log('🗂️ No session found');
          if (Platform.OS === 'web') {
            window.alert('Could not verify your permissions. Please log out and log back in.');
          } else {
            Alert.alert('Error', 'Could not verify your permissions. Please log out and log back in.');
          }
          return;
        }
        
        console.log('🗂️ Archive attempt by user:', {
          uid: session.uid,
          accountId: session.accountId,
          isOwner: session.isOwner,
          perms: session.perms
        });
        
        // Check if member has viewClients permission
        if (!session.isOwner && !session.perms.viewClients) {
          console.log('🗂️ Permission denied - user lacks viewClients permission');
          if (Platform.OS === 'web') {
            window.alert('You do not have permission to archive clients.');
          } else {
            Alert.alert('Error', 'You do not have permission to archive clients.');
          }
          return;
        }
        
        console.log('🗂️ Permissions verified, proceeding with archive...');
        
        // Get the round order number of the client being archived
        const clientToArchive = client;
        const archivedPosition = clientToArchive?.roundOrderNumber;
        console.log('🗂️ Client to archive:', { name: clientToArchive?.name, roundOrderNumber: archivedPosition });
        
        // Use a batch for atomic updates
        console.log('🗂️ Creating batch for client archive...');
        const archiveBatch = writeBatch(db);
        
        // Archive the client
        const clientRef = doc(db, 'clients', id);
        archiveBatch.update(clientRef, {
          status: 'ex-client',
          roundOrderNumber: null
        });
        console.log('🗂️ Added client update to batch');
        
        // Only decrement clients with round order numbers greater than the archived client
        if (archivedPosition) {
          console.log('🗂️ Getting owner ID for round order updates...');
          const ownerId = await getDataOwnerId();
          console.log('🗂️ Owner ID:', ownerId);
          
          const clientsQuery = query(
            collection(db, 'clients'),
            where('ownerId', '==', ownerId),
            where('roundOrderNumber', '>', archivedPosition)
          );
          console.log('🗂️ Querying clients with round order > ', archivedPosition);
          const clientsSnapshot = await getDocs(clientsQuery);
          console.log('🗂️ Found', clientsSnapshot.size, 'clients to update round order');
          
          clientsSnapshot.docs.forEach(docSnap => {
            const clientData = docSnap.data();
            if (clientData.status !== 'ex-client') {
              const clientUpdateRef = doc(db, 'clients', docSnap.id);
              archiveBatch.update(clientUpdateRef, { 
                roundOrderNumber: clientData.roundOrderNumber - 1 
              });
            }
          });
          console.log('🗂️ Added round order updates to batch');
        }
        
        console.log('🗂️ Committing client archive batch...');
        await archiveBatch.commit();
        console.log('🗂️ Client archive batch committed successfully');
        
        // Log the client archiving action
        console.log('🗂️ Logging archive action...');
        const clientAddress = clientToArchive ? getClientAddress(clientToArchive) : 'Unknown address';
        await logAction(
          'client_archived',
          'client',
          id,
          formatAuditDescription('client_archived', clientAddress)
        );
        console.log('🗂️ Archive action logged successfully');
        
        // Delete all jobs for this client that are scheduled for today or in the future and not completed
        console.log('🗂️ Deleting future jobs for client...');
        const ownerId = await getDataOwnerId();
        if (!ownerId) throw new Error('Missing ownerId (data owner id) for job cleanup');

        const jobsRef = collection(db, 'jobs');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const jobsQuery = query(
          jobsRef, 
          where('ownerId', '==', ownerId),
          where('clientId', '==', id),
          where('status', '!=', 'completed')
        );
        const jobsSnapshot = await getDocs(jobsQuery);
        console.log('🗂️ Found', jobsSnapshot.size, 'uncompleted jobs to potentially delete');
        
        const batch = writeBatch(db);
        let jobsToDelete = 0;
        jobsSnapshot.forEach(jobDoc => {
          const jobData = jobDoc.data();
          if (jobData.scheduledTime) {
            const jobDate = new Date(jobData.scheduledTime);
            jobDate.setHours(0, 0, 0, 0);
            if (jobDate >= today) {
              batch.delete(jobDoc.ref);
              jobsToDelete++;
            }
          }
        });
        console.log('🗂️ Deleting', jobsToDelete, 'future jobs');
        await batch.commit();
        console.log('🗂️ Job deletion batch committed successfully');
        
        console.log('🗂️ Archive process completed, navigating to clients list');
        router.replace('/clients');
      } catch (error: any) {
        console.error('Error archiving client:', error);
        console.error('Error details:', {
          code: error?.code,
          message: error?.message,
          stack: error?.stack,
          name: error?.name
        });
        
        // Provide more specific error messages with platform-specific alerts
        if (error?.code === 'permission-denied') {
          const message = 'You do not have permission to archive this client. Please ensure you are properly logged in and have the necessary permissions. Try logging out and back in.';
          if (Platform.OS === 'web') {
            window.alert(message);
          } else {
            Alert.alert('Permission Denied', message);
          }
        } else if (error?.message?.includes('Missing or insufficient permissions')) {
          const message = 'Your account permissions may need to be refreshed. Please go to Settings and tap "Refresh Account", or log out and log back in.';
          if (Platform.OS === 'web') {
            window.alert(message);
          } else {
            Alert.alert('Permission Error', message);
          }
        } else {
          // For debugging: show the actual error message temporarily
          const debugMessage = `Failed to archive client: ${error?.message || error?.code || 'Unknown error'}. Check console for details.`;
          if (Platform.OS === 'web') {
            window.alert(debugMessage);
          } else {
            Alert.alert('Error', debugMessage);
          }
        }
      }
    }
  };

  const handleDelete = () => {
    const confirmationMessage = 'This will mark the client as an ex-client and they will be moved to the ex-client list. Are you sure?';
    
    if (Platform.OS === 'web') {
      if (window.confirm(confirmationMessage)) {
        performArchive();
      }
    } else {
      Alert.alert(
        'Archive Client',
        confirmationMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            style: 'destructive',
            onPress: performArchive,
          },
        ]
      );
    }
  };


  const handleEditDetails = () => {
    router.push({
      pathname: '/(tabs)/clients/[id]/edit-customer',
      params: { id }
    } as never);
  };

  const handleMakePayment = () => {
    router.push({
      pathname: '/add-payment',
      params: {
        clientId: id,
        clientName: client?.name,
        clientAddress: client?.address1 || client?.address,
        clientAccountNumber: client?.accountNumber,
        from: `/clients/${id}`
      }
    } as never);
  };

  const handleOpenNotes = () => {
    setNotesModalVisible(true);
  };

  const handleGocardlessSettings = () => {
    setGocardlessModalVisible(true);
  };

  const handleSaveGocardlessSettings = async (settings: { enabled: boolean; customerId: string }) => {
    if (typeof id !== 'string') return;
    
    try {
      await updateClientGoCardlessSettings(id, settings);
      // Refresh client data to show updated settings
      fetchClient();
    } catch (error) {
      console.error('Error saving GoCardless settings:', error);
      throw error; // Let the modal handle the error display
    }
  };

  const handleSaveNotes = async () => {
    if (typeof id !== 'string') return;
    
    setSavingNotes(true);
    try {
      // Also migrate legacy notes field if it exists
      const updateData: any = {
        runsheetNotes: notes
      };
      // Clear legacy notes field if migrating
      if (client?.notes && !client?.runsheetNotes) {
        updateData.notes = null;
      }
      await updateDoc(doc(db, 'clients', id), updateData);
      setNotesModalVisible(false);
      Alert.alert('Success', 'Notes saved successfully!');
    } catch (error) {
      console.error('Error saving notes:', error);
      Alert.alert('Error', 'Failed to save notes. Please try again.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddJob = async () => {
    if (!jobPrice) {
      Alert.alert('Error', 'Please enter a price for the job.');
      return;
    }

    if (jobType === 'Other' && !customJobType.trim()) {
      Alert.alert('Error', 'Please enter a custom job type.');
      return;
    }

    const finalJobType = jobType === 'Other' ? customJobType.trim() : jobType;

    // Prevent adding a job for today if today is marked complete (using utility)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDateOnly = new Date(jobDate);
    jobDateOnly.setHours(0, 0, 0, 0);
    if (jobDateOnly.getTime() === today.getTime()) {
      const todayComplete = await isTodayMarkedComplete();
      if (todayComplete) {
        Alert.alert('Cannot add job', 'Today is marked as complete. You cannot add a job for today.');
        return;
      }
    }

    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      Alert.alert('Error', 'Could not determine owner.');
      return;
    }

    // Build job data, filtering out undefined values that Firebase doesn't allow
    const jobData: any = {
      ownerId, // Legacy support
      accountId: ownerId, // Explicitly set accountId for Firestore rules (getDataOwnerId returns accountId)
      clientId: id,
      providerId: 'test-provider-1',
      serviceId: finalJobType,
      propertyDetails: jobNotes,
      price: Number(jobPrice),
      status: 'pending',
      scheduledTime: format(jobDate, 'yyyy-MM-dd') + 'T09:00:00',
      paymentStatus: 'unpaid',
      gocardlessEnabled: client?.gocardlessEnabled || false,
    };
    
    // Only include gocardlessCustomerId if it has a value
    if (client?.gocardlessCustomerId) {
      jobData.gocardlessCustomerId = client.gocardlessCustomerId;
    }

    console.log('➕ Creating adhoc job:', jobData);

    try {
      await addDoc(collection(db, 'jobs'), jobData);
      
      // Log the job creation action - include client address
      if (client) {
        const clientAddress = getClientAddress(client);
        await logAction(
          'job_created',
          'job',
          typeof jobData.clientId === 'string' ? jobData.clientId : Array.isArray(jobData.clientId) ? jobData.clientId[0] : '',
          formatAuditDescription('job_created', `${clientAddress} (${finalJobType} on ${format(jobDate, 'do MMM yyyy')})`)
        );
      }
      Alert.alert('Success', 'Job added successfully.');
      setModalVisible(false);
      setJobNotes('');
      setJobPrice('');
      setCustomJobType('');
    } catch (error) {
      console.error('Error adding job:', error);
      Alert.alert('Error', 'Failed to add job.');
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setJobDate(selectedDate);
    }
  };

  const onRecurringDateChange = (event: any, selectedDate?: Date) => {
    setShowRecurringDatePicker(false);
    if (selectedDate) {
      setRecurringNextVisit(selectedDate);
    }
  };

  const onEditServiceDateChange = (event: any, selectedDate?: Date) => {
    setShowEditServiceDatePicker(false);
    if (selectedDate) {
      setEditServiceNextVisit(selectedDate);
    }
  };

  const handleAddRecurringService = async () => {
    if (!recurringPrice) {
      Alert.alert('Error', 'Please enter a price for the recurring service.');
      return;
    }

    if (recurringServiceType === 'Other' && !customRecurringServiceType.trim()) {
      Alert.alert('Error', 'Please enter a custom service type.');
      return;
    }

    if (!recurringFrequency || recurringFrequency < 4 || recurringFrequency > 52) {
      Alert.alert('Error', 'Please select a frequency between 4 and 52 weeks.');
      return;
    }

    const finalServiceType = recurringServiceType === 'Other' ? customRecurringServiceType.trim() : recurringServiceType;

    try {
      const newAdditionalService: AdditionalService = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        serviceType: finalServiceType,
        frequency: recurringFrequency,
        price: Number(recurringPrice),
        nextVisit: format(recurringNextVisit, 'yyyy-MM-dd'),
        isActive: true,
      };

      // Update client document with new additional service
      const currentAdditionalServices = client?.additionalServices || [];
      const updatedAdditionalServices = [...currentAdditionalServices, newAdditionalService];

      await updateDoc(doc(db, 'clients', id as string), {
        additionalServices: updatedAdditionalServices
      });

      // Log the recurring service addition action - include client address  
      if (client) {
        const clientAddress = getClientAddress(client);
        await logAction(
          'recurring_service_added',
          'client',
          id as string,
          formatAuditDescription('recurring_service_added', `${clientAddress} (${finalServiceType}, ${recurringFrequency} weekly)`)
        );
      }

      // Update local state
      setClient(prev => prev ? { ...prev, additionalServices: updatedAdditionalServices } : null);

      // Generate jobs for the new recurring service
      try {
        const jobsCreated = await createJobsForAdditionalServices(id as string, 52);
        console.log(`Created ${jobsCreated} jobs for new recurring service`);
      } catch (jobError) {
        console.error('Error creating jobs for new recurring service:', jobError);
        // Don't fail the service creation if job creation fails
      }

      Alert.alert('Success', 'Recurring service added successfully and jobs have been scheduled.');
      setModalVisible(false);
      setRecurringPrice('');
      setCustomRecurringServiceType('');
      setRecurringNextVisit(new Date());
      
      // Refresh the service history to show new jobs
      fetchClient();
    } catch (error) {
      console.error('Error adding recurring service:', error);
      Alert.alert('Error', 'Failed to add recurring service.');
    }
  };

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!client) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ThemedText type="title">Client not found</ThemedText>
      </ThemedView>
    );
  }

  const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
  const displayAddress = addressParts.length > 0
    ? addressParts.join(', ')
    : client.address || 'No address';

  // Prepend starting balance to service history if present
  const typedClient = client as ClientWithStartingBalance;
  const serviceHistoryWithStartingBalance =
    typedClient.startingBalance !== undefined && typedClient.startingBalance !== 0
      ? ([{ type: 'startingBalance', amount: typedClient.startingBalance }, ...serviceHistory] as any[])
      : serviceHistory;

  // Add SectionCard component matching quotes/accounts screens
  const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <View style={[styles.sectionCard, { backgroundColor: theme.sectionCard, borderColor: theme.sectionCardBorder }]}>
      <View style={[styles.sectionCardHeader, { backgroundColor: theme.sectionCardHeader, borderColor: theme.sectionCardBorder }]}>
        {icon}
        <ThemedText style={[styles.sectionCardTitle, { color: theme.text }]}>{title}</ThemedText>
      </View>
      <View style={styles.sectionCardContent}>{children}</View>
    </View>
  );

  const InfoRow = ({ label, value }: { label: string; value: string | React.ReactNode }) => (
    <View style={[styles.infoRow, { borderBottomColor: theme.divider }]}>
      <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>{label}:</ThemedText>
      <ThemedText style={[styles.infoValue, { color: theme.text }]}>{value}</ThemedText>
    </View>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      {/* Header Bar - matching accounts/quotes style */}
      <View style={[styles.headerBar, { backgroundColor: theme.sectionCard, borderBottomColor: theme.sectionCardBorder }]}>
        <ThemedText style={[styles.headerTitle, { color: theme.text }]}>{displayAddress}</ThemedText>
        <Pressable style={[styles.homeButton, { backgroundColor: theme.notesBackground }]} onPress={() => router.replace('/')}> 
          <Ionicons name="home-outline" size={22} color="#1976d2" />
        </Pressable>
      </View>

      <ScrollView 
        style={styles.scrollContainer} 
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {isLargeScreen ? (
          <View style={styles.desktopContainer}>
            {/* Left Column: Client Information */}
            <View style={styles.leftColumn}>
              {/* Client Information Card */}
              <SectionCard 
                title="Client Information" 
                icon={<Ionicons name="person-outline" size={22} color="#1976d2" />}
              >
                <InfoRow label="Name" value={client.name} />
                <InfoRow label="Account Number" value={displayAccountNumber(client.accountNumber)} />
                <InfoRow label="Round Order Number" value={client.roundOrderNumber ?? 'N/A'} />
              </SectionCard>

              {/* Service Details Card */}
              <SectionCard 
                title="Service Details" 
                icon={<Ionicons name="build-outline" size={22} color="#1976d2" />}
              >
                {servicePlans.length > 0 ? (
                  (() => {
                    const activePlans = servicePlans.filter(p => p.isActive);
                    if (activePlans.length === 0) {
                      return (
                        <View>
                          <InfoRow label="Service" value="N/A" />
                          <InfoRow label="Type" value="N/A" />
                          <InfoRow label="Frequency" value="N/A" />
                          <InfoRow label="Price" value="N/A" />
                          <InfoRow label="Next Service" value="N/A" />
                        </View>
                      );
                    }
                    return activePlans.map((plan, index) => (
                      <View key={plan.id} style={index > 0 ? { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' } : {}}>
                        <InfoRow label="Service" value={plan.serviceType} />
                        <InfoRow label="Type" value={plan.scheduleType === 'recurring' ? 'Recurring' : 'One-off'} />
                        {plan.scheduleType === 'recurring' && (
                          <InfoRow label="Frequency" value={`Every ${plan.frequencyWeeks} weeks`} />
                        )}
                        <InfoRow label="Price" value={`£${plan.price.toFixed(2)}`} />
                        <InfoRow 
                          label="Next Service" 
                          value={(() => {
                            const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            });
                            
                            // Get the next pending job for this service type
                            const planNextJob = plan.serviceType ? nextPendingJobByService[plan.serviceType] : undefined;
                            
                            // If there's a pending job and it's marked as deferred
                            if (planNextJob && planNextJob.isDeferred && plan.startDate) {
                              // Job was moved - show what it SHOULD be (from plan) then where it is
                              return `${formatDate(plan.startDate)} (moved to ${formatDate(planNextJob.scheduledTime)})`;
                            }
                            
                            // Job not moved - show either actual job date or plan anchor
                            if (planNextJob) {
                              return formatDate(planNextJob.scheduledTime);
                            } else if (plan.startDate) {
                              return formatDate(plan.startDate);
                            } else if (plan.scheduledDate) {
                              return formatDate(plan.scheduledDate);
                            }
                            
                            return 'Not scheduled';
                          })()}
                        />
                      </View>
                    ));
                  })()
                ) : (
                  // Fallback to legacy fields if no service plans
                  <>
                    <InfoRow 
                      label="Quote" 
                      value={typeof client.quote === 'number' && !isNaN(client.quote) 
                        ? `£${client.quote.toFixed(2)}` 
                        : 'N/A'
                      } 
                    />
                    <InfoRow 
                      label="Frequency" 
                      value={client.frequency && client.frequency !== 'one-off' 
                        ? `Visit every ${client.frequency} weeks` 
                        : client.frequency === 'one-off' 
                          ? 'No recurring work' 
                          : 'N/A'
                      } 
                    />
                    <InfoRow 
                      label="Next Scheduled Visit" 
                      value={(() => {
                        if (!nextScheduledVisit) return 'N/A';
                        
                        const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        });
                        
                        // For legacy clients, use the client.nextVisit as the expected anchor
                        const legacyAnchor = client.nextVisit ? parseISO(client.nextVisit) : null;
                        const actualJobDate = parseISO(nextScheduledVisit);
                        
                        // Check if job was moved from its expected legacy anchor
                        if (legacyAnchor && !isSameDay(legacyAnchor, actualJobDate)) {
                          return `${formatDate(legacyAnchor.toISOString())} (moved to ${formatDate(nextScheduledVisit)})`;
                        }
                        
                        return formatDate(nextScheduledVisit);
                      })()} 
                    />
                  </>
                )}
              </SectionCard>

              {/* Contact Information Card */}
              <SectionCard 
                title="Contact Information" 
                icon={<Ionicons name="call-outline" size={22} color="#1976d2" />}
              >
                <InfoRow label="Mobile Number" value={client.mobileNumber ?? 'N/A'} />
                {client.email && (
                  <InfoRow label="Email" value={client.email} />
                )}
              </SectionCard>

              {/* Account Details Card */}
              <SectionCard 
                title="Account Details" 
                icon={<Ionicons name="document-text-outline" size={22} color="#1976d2" />}
              >
                {client.dateAdded && (
                  <InfoRow 
                    label="Date Added" 
                    value={new Date(client.dateAdded).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })} 
                  />
                )}
                {client.source && (
                  <InfoRow label="Source" value={client.source} />
                )}
                <InfoRow 
                  label="GoCardless Customer" 
                  value={client.gocardlessEnabled ? 'Yes' : 'No'} 
                />
              </SectionCard>
            </View>

            {/* Right Column: Additional Services & Actions */}
            <View style={styles.rightColumn}>
              {/* Additional Services Card */}
              {client.additionalServices && client.additionalServices.filter(service => service.isActive).length > 0 && (
                <SectionCard 
                  title="Additional Services" 
                  icon={<Ionicons name="list-outline" size={22} color="#1976d2" />}
                >
                  {client.additionalServices.filter(service => service.isActive).map((service) => (
                    <Pressable key={service.id} onPress={() => {
                      setSelectedService(service);
                      // Check if it's a predefined service type or a custom one
                      const predefinedTypes = ['Gutter cleaning', 'Solar panel cleaning', 'Conservatory roof', 'Soffit and fascias', 'Pressure washing'];
                      if (predefinedTypes.includes(service.serviceType)) {
                        setEditServiceType(service.serviceType);
                        setEditCustomServiceType('');
                      } else {
                        setEditServiceType('Other');
                        setEditCustomServiceType(service.serviceType);
                      }
                      setEditServiceFrequency(service.frequency);
                      setEditServicePrice(service.price.toString());
                      setEditServiceNextVisit(new Date(service.nextVisit));
                      setShowEditServiceDatePicker(false);
                      setEditServiceModalVisible(true);
                    }}>
                      <View style={styles.additionalServiceCard}>
                        <ThemedText style={styles.additionalServiceName}>
                          {service.serviceType}
                        </ThemedText>
                        <ThemedText style={styles.additionalServiceDetails}>
                          Every {service.frequency} weeks
                        </ThemedText>
                        <ThemedText style={styles.additionalServicePrice}>
                          £{service.price.toFixed(2)}
                        </ThemedText>
                        <ThemedText style={styles.additionalServiceNext}>
                          Next: {new Date(service.nextVisit).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </SectionCard>
              )}

              {/* Action Buttons Card */}
              <SectionCard 
                title="Quick Actions" 
                icon={<Ionicons name="settings-outline" size={22} color="#1976d2" />}
              >
                <View style={styles.actionButtonsGrid}>
                  <Pressable style={styles.actionButton} onPress={handleEditDetails}>
                    <Ionicons name="create-outline" size={20} color="#1976d2" />
                    <ThemedText style={styles.actionButtonText}>Edit Details</ThemedText>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: '/(tabs)/clients/[id]/manage-services', params: { id } } as never)}>
                    <Ionicons name="construct-outline" size={20} color="#1976d2" />
                    <ThemedText style={styles.actionButtonText}>Manage Services</ThemedText>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => setModalVisible(true)}>
                    <Ionicons name="add-circle-outline" size={20} color="#1976d2" />
                    <ThemedText style={styles.actionButtonText}>Ad-hoc Job</ThemedText>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={handleMakePayment}>
                    <Ionicons name="card-outline" size={20} color="#1976d2" />
                    <ThemedText style={styles.actionButtonText}>Add Payment</ThemedText>
                  </Pressable>
                  {balance !== null && (
                    <Pressable 
                      style={[styles.actionButton, balance < 0 ? styles.negativeBalanceAction : styles.positiveBalanceAction]} 
                      onPress={() => router.push({
                        pathname: '/client-balance',
                        params: { clientId: id, clientName: client.name }
                      } as never)}
                    >
                      <Ionicons name="wallet-outline" size={20} color={balance < 0 ? "#f44336" : "#4CAF50"} />
                      <ThemedText style={[styles.actionButtonText, { color: balance < 0 ? "#f44336" : "#4CAF50" }]}>
                        Balance: £{Math.abs(balance).toFixed(2)}
                      </ThemedText>
                    </Pressable>
                  )}
                  <Pressable style={[styles.actionButton, styles.dangerAction]} onPress={handleDelete}>
                    <Ionicons name="archive-outline" size={20} color="#f44336" />
                    <ThemedText style={[styles.actionButtonText, { color: "#f44336" }]}>Archive Client</ThemedText>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={handleGocardlessSettings}>
                    <ThemedText style={styles.ddButtonText}>DD</ThemedText>
                    <ThemedText style={styles.actionButtonText}>GoCardless</ThemedText>
                  </Pressable>
                </View>
              </SectionCard>
            </View>
          </View>
        ) : (
          // Mobile/stacked layout
          <View style={styles.mobileContainer}>
            {/* Client Information Card */}
            <SectionCard 
              title="Client Information" 
              icon={<Ionicons name="person-outline" size={22} color="#1976d2" />}
            >
              <InfoRow label="Name" value={client.name} />
              <InfoRow label="Account Number" value={displayAccountNumber(client.accountNumber)} />
              <InfoRow label="Round Order Number" value={client.roundOrderNumber ?? 'N/A'} />
            </SectionCard>

            {/* Service Details Card */}
            <SectionCard 
              title="Service Details" 
              icon={<Ionicons name="build-outline" size={22} color="#1976d2" />}
            >
              {servicePlans.length > 0 ? (
                (() => {
                  const activePlans = servicePlans.filter(p => p.isActive);
                  if (activePlans.length === 0) {
                    return (
                      <View>
                        <InfoRow label="Service" value="N/A" />
                        <InfoRow label="Type" value="N/A" />
                        <InfoRow label="Frequency" value="N/A" />
                        <InfoRow label="Price" value="N/A" />
                        <InfoRow label="Next Service" value="N/A" />
                      </View>
                    );
                  }
                  return activePlans.map((plan, index) => (
                  <View key={plan.id} style={index > 0 ? { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' } : {}}>
                    <InfoRow label="Service" value={plan.serviceType} />
                    <InfoRow label="Type" value={plan.scheduleType === 'recurring' ? 'Recurring' : 'One-off'} />
                    {plan.scheduleType === 'recurring' && (
                      <InfoRow label="Frequency" value={`Every ${plan.frequencyWeeks} weeks`} />
                    )}
                    <InfoRow label="Price" value={`£${plan.price.toFixed(2)}`} />
                    <InfoRow 
                      label="Next Service" 
                      value={(() => {
                        const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        });
                        
                        // If we have next scheduled visit info and it's been moved, show both dates
                        if (nextScheduledVisit && originalScheduledVisit) {
                          const originalDateStr = originalScheduledVisit.split('T')[0];
                          const currentDateStr = nextScheduledVisit.split('T')[0];
                          // Only show moved notation if dates are actually different
                          if (originalDateStr !== currentDateStr) {
                            return `${formatDate(nextScheduledVisit)} (moved from ${formatDate(originalScheduledVisit)})`;
                          }
                        }
                        
                        // Fallback: if job was deferred but we don't have original date (moved before tracking was added)
                        if (nextScheduledVisit && nextJobWasMoved && !originalScheduledVisit) {
                          return `${formatDate(nextScheduledVisit)} (moved)`;
                        }
                        
                        // Show actual next scheduled visit if available
                        if (nextScheduledVisit) {
                          return formatDate(nextScheduledVisit);
                        }
                        
                        // Fall back to plan dates
                        if (plan.scheduleType === 'recurring') {
                          return plan.startDate 
                            ? formatDate(plan.startDate)
                            : 'Not scheduled';
                        } else {
                          return plan.scheduledDate
                            ? formatDate(plan.scheduledDate)
                            : 'Not scheduled';
                        }
                      })()}
                    />
                  </View>
                  ));
                })()
              ) : (
                // Fallback to legacy fields if no service plans
                <>
                  <InfoRow 
                    label="Quote" 
                    value={typeof client.quote === 'number' && !isNaN(client.quote) 
                      ? `£${client.quote.toFixed(2)}` 
                      : 'N/A'
                    } 
                  />
                  <InfoRow 
                    label="Frequency" 
                    value={client.frequency && client.frequency !== 'one-off' 
                      ? `Visit every ${client.frequency} weeks` 
                      : client.frequency === 'one-off' 
                        ? 'No recurring work' 
                        : 'N/A'
                    } 
                  />
                  <InfoRow 
                    label="Next Scheduled Visit" 
                    value={(() => {
                      if (!nextScheduledVisit) return 'N/A';
                      
                      const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      });
                      
                      // For legacy clients, use the client.nextVisit as the expected anchor
                      const legacyAnchor = client.nextVisit ? parseISO(client.nextVisit) : null;
                      const actualJobDate = parseISO(nextScheduledVisit);
                      
                      // Check if job was moved from its expected legacy anchor
                      if (legacyAnchor && !isSameDay(legacyAnchor, actualJobDate)) {
                        return `${formatDate(legacyAnchor.toISOString())} (moved to ${formatDate(nextScheduledVisit)})`;
                      }
                      
                      return formatDate(nextScheduledVisit);
                    })()} 
                  />
                </>
              )}
            </SectionCard>

            {/* Contact Information Card */}
            <SectionCard 
              title="Contact Information" 
              icon={<Ionicons name="call-outline" size={22} color="#1976d2" />}
            >
              <InfoRow label="Mobile Number" value={client.mobileNumber ?? 'N/A'} />
              {client.email && (
                <InfoRow label="Email" value={client.email} />
              )}
            </SectionCard>

            {/* Account Details Card */}
            <SectionCard 
              title="Account Details" 
              icon={<Ionicons name="document-text-outline" size={22} color="#1976d2" />}
            >
              {client.dateAdded && (
                <InfoRow 
                  label="Date Added" 
                  value={new Date(client.dateAdded).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })} 
                />
              )}
              {client.source && (
                <InfoRow label="Source" value={client.source} />
              )}
              <InfoRow 
                label="GoCardless Customer" 
                value={client.gocardlessEnabled ? 'Yes' : 'No'} 
              />
            </SectionCard>

            {/* Additional Services Card */}
            {client.additionalServices && client.additionalServices.filter(service => service.isActive).length > 0 && (
              <SectionCard 
                title="Additional Services" 
                icon={<Ionicons name="list-outline" size={22} color="#1976d2" />}
              >
                {client.additionalServices.filter(service => service.isActive).map((service) => (
                  <Pressable key={service.id} onPress={() => {
                    setSelectedService(service);
                    const predefinedTypes = ['Gutter cleaning', 'Solar panel cleaning', 'Conservatory roof', 'Soffit and fascias', 'Pressure washing'];
                    if (predefinedTypes.includes(service.serviceType)) {
                      setEditServiceType(service.serviceType);
                      setEditCustomServiceType('');
                    } else {
                      setEditServiceType('Other');
                      setEditCustomServiceType(service.serviceType);
                    }
                    setEditServiceFrequency(service.frequency);
                    setEditServicePrice(service.price.toString());
                    setEditServiceNextVisit(new Date(service.nextVisit));
                    setShowEditServiceDatePicker(false);
                    setEditServiceModalVisible(true);
                  }}>
                    <View style={styles.additionalServiceCard}>
                      <ThemedText style={styles.additionalServiceName}>
                        {service.serviceType}
                      </ThemedText>
                      <ThemedText style={styles.additionalServiceDetails}>
                        Every {service.frequency} weeks
                      </ThemedText>
                      <ThemedText style={styles.additionalServicePrice}>
                        £{service.price.toFixed(2)}
                      </ThemedText>
                      <ThemedText style={styles.additionalServiceNext}>
                        Next: {new Date(service.nextVisit).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </SectionCard>
            )}

            {/* Action Buttons Card */}
            <SectionCard 
              title="Quick Actions" 
              icon={<Ionicons name="settings-outline" size={22} color="#1976d2" />}
            >
              <View style={styles.actionButtonsGrid}>
                <Pressable style={styles.actionButton} onPress={handleEditDetails}>
                  <Ionicons name="create-outline" size={20} color="#1976d2" />
                  <ThemedText style={styles.actionButtonText}>Edit Details</ThemedText>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: '/(tabs)/clients/[id]/manage-services', params: { id } } as never)}>
                  <Ionicons name="construct-outline" size={20} color="#1976d2" />
                  <ThemedText style={styles.actionButtonText}>Manage Services</ThemedText>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => setModalVisible(true)}>
                  <Ionicons name="add-circle-outline" size={20} color="#1976d2" />
                  <ThemedText style={styles.actionButtonText}>Ad-hoc Job</ThemedText>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={handleMakePayment}>
                  <Ionicons name="card-outline" size={20} color="#1976d2" />
                  <ThemedText style={styles.actionButtonText}>Add Payment</ThemedText>
                </Pressable>
                {balance !== null && (
                  <Pressable 
                    style={[styles.actionButton, balance < 0 ? styles.negativeBalanceAction : styles.positiveBalanceAction]} 
                    onPress={() => router.push({
                      pathname: '/client-balance',
                      params: { clientId: id, clientName: client.name }
                    } as never)}
                  >
                    <Ionicons name="wallet-outline" size={20} color={balance < 0 ? "#f44336" : "#4CAF50"} />
                    <ThemedText style={[styles.actionButtonText, { color: balance < 0 ? "#f44336" : "#4CAF50" }]}>
                      Balance: £{Math.abs(balance).toFixed(2)}
                    </ThemedText>
                  </Pressable>
                )}
                <Pressable style={[styles.actionButton, styles.dangerAction]} onPress={handleDelete}>
                  <Ionicons name="archive-outline" size={20} color="#f44336" />
                  <ThemedText style={[styles.actionButtonText, { color: "#f44336" }]}>Archive Client</ThemedText>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={handleGocardlessSettings}>
                  <ThemedText style={styles.ddButtonText}>DD</ThemedText>
                  <ThemedText style={styles.actionButtonText}>GoCardless</ThemedText>
                </Pressable>
              </View>
            </SectionCard>
          </View>
        )}

        {/* Notes Section */}
        <View style={styles.notesSection}>
          <Pressable style={styles.sectionHeading} onPress={() => setNotesCollapsed(!notesCollapsed)}>
            <IconSymbol name="chevron.right" size={28} color={theme.secondaryText} style={{ transform: [{ rotate: notesCollapsed ? '0deg' : '90deg' }] }} />
            <ThemedText style={[styles.sectionHeadingText, { color: theme.text }]}>Runsheet Notes</ThemedText>
          </Pressable>
          {!notesCollapsed && (
            <Pressable style={[styles.notesContent, { borderColor: theme.inputBorder }]} onPress={handleOpenNotes}>
              {notes ? (
                <ThemedText style={styles.notesText}>{notes}</ThemedText>
              ) : (
                <ThemedText style={[styles.notesPlaceholder, { color: theme.tertiaryText }]}>Tap to add runsheet notes...</ThemedText>
              )}
            </Pressable>
          )}
        </View>
            
        {/* Account Notes Section */}
        <View style={styles.notesSection}>
          <Pressable style={styles.sectionHeading} onPress={() => setAccountNotesCollapsed(!accountNotesCollapsed)}>
            <IconSymbol name="chevron.right" size={28} color={theme.secondaryText} style={{ transform: [{ rotate: accountNotesCollapsed ? '0deg' : '90deg' }] }} />
            <ThemedText style={[styles.sectionHeadingText, { color: theme.text }]}>Account Notes</ThemedText>
          </Pressable>
          {!accountNotesCollapsed && (
            <View>
              <Pressable 
                style={[styles.notesContent, { backgroundColor: theme.notesBackground, borderColor: theme.inputBorder, marginBottom: 10 }]} 
                onPress={() => setAccountNotesModalVisible(true)}
              >
                <ThemedText style={{ color: '#1976d2', fontWeight: 'bold' }}>+ Add New Note</ThemedText>
              </Pressable>
              {client?.accountNotes && client.accountNotes.length > 0 ? (
                client.accountNotes.map((note) => (
                  <View key={note.id} style={[styles.notesContent, { borderColor: theme.inputBorder, marginBottom: 8 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <ThemedText style={{ fontSize: 12, color: theme.secondaryText }}>{note.author}</ThemedText>
                      <ThemedText style={{ fontSize: 12, color: theme.secondaryText }}>
                        {new Date(note.date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </ThemedText>
                    </View>
                    <ThemedText>{note.text}</ThemedText>
                  </View>
                ))
              ) : (
                <ThemedText style={[styles.notesPlaceholder, { color: theme.tertiaryText }]}>No account notes yet</ThemedText>
              )}
            </View>
          )}
        </View>
        
        {/* Service History Section */}
        <View style={styles.notesSection}>
          <Pressable style={styles.sectionHeading} onPress={() => setHistoryCollapsed(!historyCollapsed)}>
            <IconSymbol name="chevron.right" size={28} color={theme.secondaryText} style={{ transform: [{ rotate: historyCollapsed ? '0deg' : '90deg' }] }} />
            <ThemedText style={[styles.sectionHeadingText, { color: theme.text }]}>Service History</ThemedText>
          </Pressable>
          {!historyCollapsed && (
            <FlatList
              data={serviceHistoryWithStartingBalance}
              keyExtractor={(item) => item.type === 'startingBalance' ? 'startingBalance' : (item.id ? `${item.type}-${item.id}` : `${item.type}`)}
              renderItem={loadingHistory ? undefined : renderHistoryItem}
              ListEmptyComponent={
                loadingHistory
                  ? <ActivityIndicator />
                  : <ThemedText>No service history found.</ThemedText>
              }
              contentContainerStyle={styles.historyContainer}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        {/* Service Schedule Section */}
        <View style={styles.notesSection}>
          <Pressable style={styles.sectionHeading} onPress={() => setScheduleCollapsed(!scheduleCollapsed)}>
            <IconSymbol name="chevron.right" size={28} color={theme.secondaryText} style={{ transform: [{ rotate: scheduleCollapsed ? '0deg' : '90deg' }] }} />
            <ThemedText style={[styles.sectionHeadingText, { color: theme.text }]}>Service Schedule</ThemedText>
          </Pressable>
          {!scheduleCollapsed && (
            pendingJobs.length === 0 ? (
              <ThemedText>No pending jobs.</ThemedText>
            ) : (
              <FlatList
                data={pendingJobs}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  // Get the service plan for this job to determine expected date
                  const plan = item.serviceId ? planByService[item.serviceId] : undefined;
                  const expectedDate = plan?.startDate || null;

                  return (
                  <View key={item.id} style={[styles.historyItem, styles.jobItem, { backgroundColor: theme.jobItemBackground, borderColor: theme.jobItemBorder }]}>
                    <View style={styles.jobItemContent}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.historyItemText}>
                          <ThemedText style={{ fontWeight: 'bold' }}>{item.serviceId || 'Job'}:</ThemedText>{' '}
                          {format(parseISO(item.scheduledTime), 'do MMMM yyyy')}
                          {item.isDeferred && expectedDate && (
                            <ThemedText style={{ color: '#f57c00', fontStyle: 'italic' }}>
                              {' '}(Moved from {format(parseISO(expectedDate), 'do MMM yyyy')})
                            </ThemedText>
                          )}
                        </ThemedText>
                        <ThemedText style={styles.historyItemText}>
                          Price: £{item.price.toFixed(2)}
                        </ThemedText>
                      </View>
                      <Pressable
                        style={styles.deleteJobButton}
                        onPress={async () => {
                          const confirmDelete = () => {
                            const performDelete = async () => {
                              try {
                                await deleteDoc(doc(db, 'jobs', item.id));
                                // Update local state to remove the deleted job
                                setPendingJobs(prev => prev.filter(job => job.id !== item.id));
                                if (Platform.OS === 'web') {
                                  // Brief success feedback
                                  console.log('Job deleted successfully');
                                } else {
                                  // Mobile can use a brief toast or just update the UI
                                  console.log('Job deleted successfully');
                                }
                              } catch (error) {
                                console.error('Error deleting job:', error);
                                if (Platform.OS === 'web') {
                                  alert('Failed to delete job. Please try again.');
                                } else {
                                  Alert.alert('Error', 'Failed to delete job. Please try again.');
                                }
                              }
                            };
                            performDelete();
                          };
                          
                          if (Platform.OS === 'web') {
                            if (window.confirm(`Delete this ${item.serviceId || 'job'} scheduled for ${format(parseISO(item.scheduledTime), 'do MMMM yyyy')}?`)) {
                              confirmDelete();
                            }
                          } else {
                            Alert.alert(
                              'Delete Job',
                              `Delete this ${item.serviceId || 'job'} scheduled for ${format(parseISO(item.scheduledTime), 'do MMMM yyyy')}?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: confirmDelete
                                }
                              ]
                            );
                          }
                        }}
                      >
                        <Ionicons name="close-circle" size={24} color="#f44336" />
                      </Pressable>
                    </View>
                  </View>
                );
                }}
                contentContainerStyle={styles.historyContainer}
                showsVerticalScrollIndicator={false}
              />
            )
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText type="subtitle">Add a New Job</ThemedText>

            {/* Mode Toggle Buttons */}
            <View style={styles.modeToggleContainer}>
              <Pressable 
                style={[styles.modeToggleButton, modalMode === 'one-time' && styles.activeToggleButton]}
                onPress={() => setModalMode('one-time')}
              >
                <ThemedText style={[styles.modeToggleText, modalMode === 'one-time' && styles.activeToggleText]}>
                  One-time Job
                </ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.modeToggleButton, modalMode === 'recurring' && styles.activeToggleButton]}
                onPress={() => setModalMode('recurring')}
              >
                <ThemedText style={[styles.modeToggleText, modalMode === 'recurring' && styles.activeToggleText]}>
                  Additional Recurring Work
                </ThemedText>
              </Pressable>
            </View>

            {modalMode === 'one-time' ? (
              <>
                <View style={styles.datePickerContainer}>
                  <ThemedText style={styles.dateText}>{format(jobDate, 'do MMMM yyyy')}</ThemedText>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={format(jobDate, 'yyyy-MM-dd')}
                      onChange={e => {
                        const newDate = new Date(e.target.value + 'T00:00:00');
                        setJobDate(newDate);
                      }}
                      style={{ marginLeft: 10, padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 16 }}
                    />
                  ) : (
                    <Pressable style={styles.calendarButton} onPress={() => setShowDatePicker(true)}>
                      <ThemedText style={styles.calendarIcon}>📅</ThemedText>
                    </Pressable>
                  )}
                </View>
                {showDatePicker && Platform.OS !== 'web' && (
                  <DateTimePicker
                    testID="dateTimePicker"
                    value={jobDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                  />
                )}

                <Picker
                  selectedValue={jobType}
                  onValueChange={(itemValue) => setJobType(itemValue)}
                  style={styles.picker}
                >
                  <Picker.Item label="Gutter cleaning" value="Gutter cleaning" />
                  <Picker.Item label="Conservatory roof" value="Conservatory roof" />
                  <Picker.Item label="Soffit and fascias" value="Soffit and fascias" />
                  <Picker.Item label="One-off window cleaning" value="One-off window cleaning" />
                  <Picker.Item label="Other" value="Other" />
                </Picker>
                
                {jobType === 'Other' && (
                  <TextInput
                    style={styles.input}
                    placeholder="Enter custom job type"
                    value={customJobType}
                    onChangeText={setCustomJobType}
                  />
                )}
                
                <TextInput
                  style={styles.jobNotesInput}
                  placeholder="Job Notes"
                  value={jobNotes}
                  onChangeText={setJobNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Job Price (£)"
                  value={jobPrice}
                  onChangeText={setJobPrice}
                  keyboardType="numeric"
                />
                <View style={styles.modalButtons}>
                  <Button title="Cancel" onPress={() => setModalVisible(false)} color="red" />
                  <Button title="Add Job" onPress={handleAddJob} />
                </View>
              </>
            ) : (
              <>
                <View style={styles.datePickerContainer}>
                  <ThemedText style={styles.dateText}>First visit: {format(recurringNextVisit, 'do MMMM yyyy')}</ThemedText>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={format(recurringNextVisit, 'yyyy-MM-dd')}
                      onChange={e => {
                        const newDate = new Date(e.target.value + 'T00:00:00');
                        setRecurringNextVisit(newDate);
                      }}
                      style={{ marginLeft: 10, padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 16 }}
                    />
                  ) : (
                    <Pressable style={styles.calendarButton} onPress={() => setShowRecurringDatePicker(true)}>
                      <ThemedText style={styles.calendarIcon}>📅</ThemedText>
                    </Pressable>
                  )}
                </View>
                {showRecurringDatePicker && Platform.OS !== 'web' && (
                  <DateTimePicker
                    testID="recurringDateTimePicker"
                    value={recurringNextVisit}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onRecurringDateChange}
                  />
                )}

                <Picker
                  selectedValue={recurringServiceType}
                  onValueChange={(itemValue) => setRecurringServiceType(itemValue)}
                  style={styles.picker}
                >
                  <Picker.Item label="Gutter cleaning" value="Gutter cleaning" />
                  <Picker.Item label="Solar panel cleaning" value="Solar panel cleaning" />
                  <Picker.Item label="Conservatory roof" value="Conservatory roof" />
                  <Picker.Item label="Soffit and fascias" value="Soffit and fascias" />
                  <Picker.Item label="Pressure washing" value="Pressure washing" />
                  <Picker.Item label="Other" value="Other" />
                </Picker>
                
                {recurringServiceType === 'Other' && (
                  <TextInput
                    style={styles.input}
                    placeholder="Enter custom service type"
                    value={customRecurringServiceType}
                    onChangeText={setCustomRecurringServiceType}
                  />
                )}

                {/* Frequency Picker */}
                <ThemedText style={styles.fieldLabel}>Frequency (weeks between visits):</ThemedText>
                <Picker
                  selectedValue={recurringFrequency}
                  onValueChange={(itemValue) => setRecurringFrequency(itemValue)}
                  style={styles.picker}
                >
                  {[4,8,12,16,20,24,28,32,36,40,44,48,52].map(weeks => (
                    <Picker.Item key={weeks} label={`${weeks} weeks`} value={weeks} />
                  ))}
                </Picker>
                
                <TextInput
                  style={styles.input}
                  placeholder="Service Price (£)"
                  value={recurringPrice}
                  onChangeText={setRecurringPrice}
                  keyboardType="numeric"
                />
                <View style={styles.modalButtons}>
                  <Button title="Cancel" onPress={() => setModalVisible(false)} color="red" />
                  <Button title="Add Recurring Service" onPress={handleAddRecurringService} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent={true}
        visible={notesModalVisible}
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText type="subtitle">Edit Runsheet Notes</ThemedText>
            
            <TextInput
              style={styles.notesInput}
              placeholder="Enter notes that will appear on the runsheet..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
            
            <View style={styles.modalButtons}>
              <Button 
                title="Cancel" 
                onPress={() => setNotesModalVisible(false)} 
                color="red" 
              />
              <Button 
                title={savingNotes ? "Saving..." : "Save Notes"} 
                onPress={handleSaveNotes}
                disabled={savingNotes}
              />
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Account Notes Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={accountNotesModalVisible}
        onRequestClose={() => {
          setAccountNotesModalVisible(false);
          setNewAccountNoteText('');
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText type="subtitle">Add Account Note</ThemedText>
            
            <TextInput
              style={styles.notesInput}
              placeholder="Enter your note..."
              value={newAccountNoteText}
              onChangeText={setNewAccountNoteText}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              autoFocus
            />
            
            <View style={styles.modalButtons}>
              <Button 
                title="Cancel" 
                onPress={() => {
                  setAccountNotesModalVisible(false);
                  setNewAccountNoteText('');
                }} 
                color="red" 
              />
              <Button 
                title="Add Note" 
                onPress={async () => {
                  if (!newAccountNoteText.trim()) {
                    Alert.alert('Error', 'Please enter a note');
                    return;
                  }
                  
                  try {
                    // Get current user info
                    const user = auth.currentUser;
                    if (!user) {
                      Alert.alert('Error', 'You must be logged in to add notes');
                      return;
                    }
                    
                    // Create new note
                    const newNote = {
                      id: Date.now().toString(),
                      date: new Date().toISOString(),
                      author: user.email || 'Unknown',
                      authorId: user.uid,
                      text: newAccountNoteText.trim()
                    };
                    
                    // Update client with new note
                    const existingNotes = client?.accountNotes || [];
                    await updateDoc(doc(db, 'clients', id as string), {
                      accountNotes: [newNote, ...existingNotes]
                    });
                    
                    // Update local state
                    setClient(prev => prev ? {
                      ...prev,
                      accountNotes: [newNote, ...existingNotes]
                    } : null);
                    
                    // Close modal and reset
                    setAccountNotesModalVisible(false);
                    setNewAccountNoteText('');
                    Alert.alert('Success', 'Note added successfully');
                  } catch (error) {
                    console.error('Error adding note:', error);
                    Alert.alert('Error', 'Failed to add note. Please try again.');
                  }
                }}
                disabled={!newAccountNoteText.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Additional Service Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editServiceModalVisible}
        onRequestClose={() => {
          setEditServiceModalVisible(false);
          setSelectedService(null);
          setEditServiceType('');
          setEditCustomServiceType('');
          setEditServiceFrequency(12);
          setEditServicePrice('');
          setEditServiceNextVisit(new Date());
          setShowEditServiceDatePicker(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <ThemedText type="subtitle">{selectedService ? 'Edit Additional Service' : 'Add Additional Service'}</ThemedText>

                         <Picker
               selectedValue={editServiceType}
               onValueChange={(itemValue) => setEditServiceType(itemValue)}
               style={styles.picker}
             >
               <Picker.Item label="Gutter cleaning" value="Gutter cleaning" />
               <Picker.Item label="Solar panel cleaning" value="Solar panel cleaning" />
               <Picker.Item label="Conservatory roof" value="Conservatory roof" />
               <Picker.Item label="Soffit and fascias" value="Soffit and fascias" />
               <Picker.Item label="Pressure washing" value="Pressure washing" />
               <Picker.Item label="Other" value="Other" />
             </Picker>
            
            {editServiceType === 'Other' && (
              <TextInput
                style={styles.input}
                placeholder="Enter custom service type"
                value={editCustomServiceType}
                onChangeText={setEditCustomServiceType}
              />
            )}

            {/* Frequency Picker */}
            <ThemedText style={styles.fieldLabel}>Frequency (weeks between visits):</ThemedText>
            <Picker
              selectedValue={editServiceFrequency}
              onValueChange={(itemValue) => setEditServiceFrequency(itemValue)}
              style={styles.picker}
            >
              {[4,8,12,16,20,24,28,32,36,40,44,48,52].map(weeks => (
                <Picker.Item key={weeks} label={`${weeks} weeks`} value={weeks} />
              ))}
            </Picker>
            
            <TextInput
              style={styles.input}
              placeholder="Service Price (£)"
              value={editServicePrice}
              onChangeText={setEditServicePrice}
              keyboardType="numeric"
            />

            <View style={styles.datePickerContainer}>
              <ThemedText style={styles.dateText}>Next visit: {format(editServiceNextVisit, 'do MMMM yyyy')}</ThemedText>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={format(editServiceNextVisit, 'yyyy-MM-dd')}
                  onChange={e => {
                    const newDate = new Date(e.target.value + 'T00:00:00');
                    setEditServiceNextVisit(newDate);
                  }}
                  style={{ marginLeft: 10, padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 16 }}
                />
              ) : (
                <Pressable style={styles.calendarButton} onPress={() => setShowEditServiceDatePicker(true)}>
                  <ThemedText style={styles.calendarIcon}>📅</ThemedText>
                </Pressable>
              )}
            </View>
            {showEditServiceDatePicker && Platform.OS !== 'web' && (
              <DateTimePicker
                testID="editServiceDateTimePicker"
                value={editServiceNextVisit}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onEditServiceDateChange}
              />
            )}

            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setEditServiceModalVisible(false)} color="red" />
              {selectedService && (
                <Button 
                  title="Delete Service" 
                  onPress={() => {
                    const performDelete = async () => {
                      try {
                        const currentAdditionalServices = client?.additionalServices || [];
                        const updatedAdditionalServices = currentAdditionalServices.filter(service => 
                          service.id !== selectedService.id
                        );

                        await updateDoc(doc(db, 'clients', id as string), {
                          additionalServices: updatedAdditionalServices
                        });

                        setClient(prev => prev ? { ...prev, additionalServices: updatedAdditionalServices } : null);
                        // Delete any pending/scheduled/in_progress jobs for this additional service
                        try {
                          const ownerId = await getDataOwnerId();
                          if (!ownerId) throw new Error('Missing ownerId (data owner id) for job cleanup');
                          const jobsSnap = await getDocs(
                            query(
                              collection(db, 'jobs'),
                              where('ownerId', '==', ownerId),
                              where('clientId', '==', id as string)
                            )
                          );
                          for (const jobDoc of jobsSnap.docs) {
                            const jd: any = jobDoc.data();
                            const st = jd.status;
                            if (jd.serviceId === selectedService.serviceType && (st === 'pending' || st === 'scheduled' || st === 'in_progress')) {
                              try { await deleteDoc(jobDoc.ref); } catch {}
                            }
                          }
                          // Update local schedule list
                          setPendingJobs(prev => prev.filter(j => j.serviceId !== selectedService.serviceType));
                        } catch (jobDelErr) {
                          console.warn('Failed to delete jobs for removed additional service', jobDelErr);
                        }
                        setEditServiceModalVisible(false);
                        setSelectedService(null);
                        setEditServiceType('');
                        setEditCustomServiceType('');
                        setEditServiceFrequency(12);
                        setEditServicePrice('');
                        setEditServiceNextVisit(new Date());
                        setShowEditServiceDatePicker(false);
                        
                        if (Platform.OS === 'web') {
                          alert('Service deleted successfully.');
                        } else {
                          Alert.alert('Success', 'Service deleted successfully.');
                        }
                        fetchClient(); // Refresh history
                      } catch (error) {
                        console.error('Error deleting service:', error);
                        if (Platform.OS === 'web') {
                          alert('Failed to delete service. Please try again.');
                        } else {
                          Alert.alert('Error', 'Failed to delete service. Please try again.');
                        }
                      }
                    };

                    if (Platform.OS === 'web') {
                      if (window.confirm('Are you sure you want to delete this additional service? This cannot be undone.')) {
                        performDelete();
                      }
                    } else {
                      Alert.alert(
                        'Delete Service',
                        'Are you sure you want to delete this additional service? This cannot be undone.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: performDelete,
                          },
                        ]
                      );
                    }
                  }}
                  color="red"
                />
              )}
              <Button 
                title={selectedService ? "Save Changes" : "Add Service"} 
                onPress={async () => {
                  if (!editServicePrice) {
                    Alert.alert('Error', 'Please enter a price for the service.');
                    return;
                  }

                  if (editServiceType === 'Other' && !editCustomServiceType.trim()) {
                    Alert.alert('Error', 'Please enter a custom service type.');
                    return;
                  }

                  if (!editServiceFrequency || editServiceFrequency < 4 || editServiceFrequency > 52) {
                    Alert.alert('Error', 'Please select a frequency between 4 and 52 weeks.');
                    return;
                  }

                  const finalServiceType = editServiceType === 'Other' ? editCustomServiceType.trim() : editServiceType;

                  try {
                    const updatedService: AdditionalService = {
                      ...selectedService!,
                      serviceType: finalServiceType,
                      frequency: editServiceFrequency,
                      price: Number(editServicePrice),
                      nextVisit: format(editServiceNextVisit, 'yyyy-MM-dd'),
                      isActive: true, // Assuming editing means keeping it active
                    };

                    const currentAdditionalServices = client?.additionalServices || [];
                    const updatedAdditionalServices = currentAdditionalServices.map(service => 
                      service.id === updatedService.id ? updatedService : service
                    );

                    await updateDoc(doc(db, 'clients', id as string), {
                      additionalServices: updatedAdditionalServices
                    });

                    setClient(prev => prev ? { ...prev, additionalServices: updatedAdditionalServices } : null);
                    setEditServiceModalVisible(false);
                    setSelectedService(null);
                    setEditServiceType('');
                    setEditCustomServiceType('');
                    setEditServiceFrequency(12);
                    setEditServicePrice('');
                    setEditServiceNextVisit(new Date());
                    setShowEditServiceDatePicker(false);
                    Alert.alert('Success', 'Service updated successfully.');
                    fetchClient(); // Refresh history
                  } catch (error) {
                    console.error('Error updating service:', error);
                    Alert.alert('Error', 'Failed to update service. Please try again.');
                  }
                }}
                disabled={!editServicePrice.trim() || !editServiceType || !editServiceFrequency}
              />
            </View>
          </View>
        </View>
      </Modal>
      
      {/* GoCardless Settings Modal */}
      <GoCardlessSettingsModal
        visible={gocardlessModalVisible}
        onClose={() => setGocardlessModalVisible(false)}
        client={client}
        onSave={handleSaveGocardlessSettings}
      />

      {/* Move Payment Modal */}
      <Modal
        visible={movePaymentModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setMovePaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%', paddingBottom: 16 }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Move Payment</ThemedText>
              <Pressable style={styles.closeButton} onPress={() => setMovePaymentModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>

            {paymentToMove && (
              <View style={{ marginBottom: 12 }}>
                <ThemedText style={styles.historyItemText}>
                  Amount: <ThemedText style={{ fontWeight: 'bold' }}>£{paymentToMove.amount.toFixed(2)}</ThemedText>
                </ThemedText>
                <ThemedText style={styles.historyItemText}>
                  Date: {format(parseISO(paymentToMove.date), 'do MMM yyyy')}
                </ThemedText>
                {paymentToMove.reference ? (
                  <ThemedText style={styles.historyItemText}>Reference: {paymentToMove.reference}</ThemedText>
                ) : null}
              </View>
            )}

            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ fontWeight: 'bold', marginBottom: 6 }}>Select destination client</ThemedText>
              <TextInput
                placeholder="Search by name, account number, or address"
                value={clientSearchQuery}
                onChangeText={setClientSearchQuery}
                style={styles.searchInput}
              />
            </View>

            {loadingClientsForMove ? (
              <ActivityIndicator />
            ) : (
              <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
                {filteredMoveClients.length === 0 ? (
                  <ThemedText>No matching clients.</ThemedText>
                ) : (
                  filteredMoveClients.map(c => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.clientSelectRow,
                        selectedMoveClient?.id === c.id && styles.clientSelectRowActive
                      ]}
                      onPress={() => setSelectedMoveClient(c)}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontWeight: '600' }}>{c.name || 'Unnamed client'}</ThemedText>
                        <ThemedText style={{ color: '#555' }}>
                          {c.accountNumber ? displayAccountNumber(c.accountNumber) : 'No account number'}
                        </ThemedText>
                        <ThemedText style={{ color: '#777', fontSize: 12 }}>
                          {[c.address1, c.town, c.postcode].filter(Boolean).join(', ')}
                        </ThemedText>
                      </View>
                      {selectedMoveClient?.id === c.id && (
                        <Ionicons name="checkmark-circle" size={22} color="#2e7d32" />
                      )}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}

            <Pressable
              style={[
                styles.saveButton,
                (!selectedMoveClient || movingPayment) && { opacity: 0.6 }
              ]}
              onPress={handleConfirmMovePayment}
              disabled={!selectedMoveClient || movingPayment}
            >
              {movingPayment ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.saveButtonText}>Move Payment</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingTop: 60,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    flex: 1,
  },
  homeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#eaf2ff',
  },
  homeButtonText: {
    fontSize: 18,
  },
  historyContainer: {
    marginTop: 12,
  },
  historyTitle: {
    marginBottom: 12,
  },
  historyItem: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  jobItem: {
    backgroundColor: '#eef5ff',
    borderColor: '#cce0ff',
    borderWidth: 1,
  },
  paymentItem: {
    backgroundColor: '#e8fff4',
    borderColor: '#b8eed7',
    borderWidth: 1,
  },
  paymentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  movePaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976d2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  movePaymentButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  historyItemText: {
    fontSize: 14,
    textTransform: 'capitalize',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '95%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#263238',
  },
  closeButton: {
    padding: 6,
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
    paddingVertical: 5,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
  },
  calendarButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  calendarIcon: {
    fontSize: 18,
  },
  picker: {
    width: '100%',
    height: 50,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginVertical: 10,
    borderRadius: 5,
    width: '100%',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  saveButton: {
    marginTop: 12,
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  infoAndButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 20,
  },
  clientInfo: {
    flex: 2,
    marginRight: 20,
  },
  rightPanel: {
    flex: 1,
    paddingLeft: 10,
    minWidth: 200,
  },
  additionalServicesPanel: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  additionalServicesPanelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#444',
  },
  additionalServiceCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  additionalServiceName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  additionalServiceDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  additionalServicePrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007bff',
    marginTop: 5,
  },
  additionalServiceNext: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  clientSelectRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clientSelectRowActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e8f1ff',
  },
  verticalButtons: {
    flexDirection: 'column',
    gap: 8,
  },
  mobileVerticalButtons: {
    gap: 12,
  },
  verticalButton: {
    width: 40,
    height: 40,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  mobileVerticalButton: {
    width: 56,
    height: 56,
    padding: 12,
  },
  verticalButtonIcon: {
    fontSize: 16,
  },
  mobileVerticalButtonIcon: {
    fontSize: 20,
  },
  negativeBalance: {
    backgroundColor: '#ffe6e6',
    borderColor: '#ffb3b3',
  },
  positiveBalance: {
    backgroundColor: '#e6ffe6',
    borderColor: '#b3ffb3',
  },
  dangerButton: {
    backgroundColor: '#ffe6e6',
    borderColor: '#ffb3b3',
  },
  disabledButton: {
    backgroundColor: '#f0f0f0',
    borderColor: '#d0d0d0',
  },
  notesSection: {
    marginTop: 24,
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 5,
  },
  notesTitle: {
    flex: 1,
  },
  notesContent: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
  },
  notesText: {
    fontSize: 14,
  },
  notesPlaceholder: {
    fontSize: 14,
    color: '#999',
  },
  notesTextInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    color: '#222',
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 5,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
    gap: 8,
  },
  sectionHeadingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    flex: 0,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
    width: '100%',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    color: '#222',
    marginBottom: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  scheduleContainer: {
    marginTop: 24,
    marginBottom: 8,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingVertical: 5,
  },
  modeToggleButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeToggleButton: {
    backgroundColor: '#e0e0e0',
    borderColor: '#ccc',
    borderWidth: 1,
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  activeToggleText: {
    color: '#333',
  },
  fieldLabel: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
  },
  gocardlessButton: {
    backgroundColor: '#FFD700',
    borderColor: '#FFC107',
  },
  // New styles for responsive layout
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 20,
    paddingBottom: 80,
  },
  desktopContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  leftColumn: {
    flex: 2,
  },
  rightColumn: {
    flex: 1,
  },
  mobileContainer: {
    // No specific styles for mobile container, it will stack
  },
  // SectionCard styles matching quotes/accounts screens
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 28,
    padding: 0,
    borderWidth: 1,
    borderColor: '#eee',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px #0001',
      },
      default: {
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
    backgroundColor: '#f8faff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  sectionCardTitle: {
    fontWeight: 'bold',
    fontSize: 20,
    marginLeft: 8,
    color: '#333',
  },
  sectionCardContent: {
    padding: 16,
  },
  // InfoRow styles
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  // Action buttons styles
  actionButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f7fa',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    width: '48%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#b2ebf2',
  },
  actionButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#1976d2',
    fontWeight: '600',
    textAlign: 'center',
  },
  negativeBalanceAction: {
    backgroundColor: '#ffebee',
    borderColor: '#ef9a9a',
  },
  positiveBalanceAction: {
    backgroundColor: '#e8f5e9',
    borderColor: '#a5d6a7',
  },
  dangerAction: {
    backgroundColor: '#ffebee',
    borderColor: '#ef9a9a',
  },
  ddButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginRight: 4,
  },
  jobNotesInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    color: '#222',
    marginVertical: 10,
    minHeight: 80,
    fontSize: 16,
  },
  jobItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  deleteJobButton: {
    padding: 8,
    marginLeft: 10,
  },
});

