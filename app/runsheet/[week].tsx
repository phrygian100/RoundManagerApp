import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays, endOfWeek, format, isBefore, isThisWeek, parseISO, startOfToday, startOfWeek } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Button, Linking, Modal, Picker, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import TimePickerModal from '../../components/TimePickerModal';
import { db } from '../../core/firebase';
import { getDataOwnerId } from '../../core/supabase';
import { listMembers, MemberRecord } from '../../services/accountService';
import { getJobsForWeek, updateJobStatus } from '../../services/jobService';
import { AvailabilityStatus, fetchRotaRange } from '../../services/rotaService';
import { listVehicles, VehicleRecord } from '../../services/vehicleService';
import type { Client } from '../../types/client';
import type { Job } from '../../types/models';
import { displayAccountNumber } from '../../utils/account';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function RunsheetWeekScreen() {
  const { week } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<(Job & { client: Client | null })[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, MemberRecord>>({});
  const [rotaMap, setRotaMap] = useState<Record<string, Record<string, AvailabilityStatus>>>({});
  const [actionSheetJob, setActionSheetJob] = useState<Job & { client: Client | null } | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<string[]>([]);
  const [isCurrentWeek, setIsCurrentWeek] = useState(false);
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerJob, setTimePickerJob] = useState<(Job & { client: Client | null }) | null>(null);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteModalText, setNoteModalText] = useState<string | null>(null);
  const [deferJob, setDeferJob] = useState<Job & { client: Client | null } | null>(null);
  const [showDeferDatePicker, setShowDeferDatePicker] = useState(false);
  const [quoteCompleteModal, setQuoteCompleteModal] = useState<{ job: any, visible: boolean }>({ job: null, visible: false });
  const [quoteForm, setQuoteForm] = useState({ frequency: '', cost: '', roundOrder: '' });
  const [showQuoteDetailsModal, setShowQuoteDetailsModal] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState({ frequency: '4 weekly', value: '', notes: '', quoteId: '' });
  const router = useRouter();

  // Parse week param
  const weekStart = week ? parseISO(week as string) : startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  useEffect(() => {
    setIsCurrentWeek(isThisWeek(weekStart, { weekStartsOn: 1 }));
    const fetchJobsAndClients = async () => {
      setLoading(true);
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');
      
      console.log('🔍 Fetching jobs for week:', startDate, 'to', endDate);
      
      // 1. Fetch all jobs for the week
      const jobsForWeek = await getJobsForWeek(startDate, endDate);
      console.log('📋 Jobs found for week:', jobsForWeek.length);
      console.log('📋 Jobs data:', jobsForWeek.map(job => ({
        id: job.id,
        clientId: job.clientId,
        scheduledTime: job.scheduledTime,
        status: job.status,
        serviceId: job.serviceId,
        ownerId: job.ownerId
      })));
      
      // Log quote jobs specifically
      const quoteJobs = jobsForWeek.filter(job => job.serviceId === 'quote');
      console.log('📋 Quote jobs found:', quoteJobs.length);
      if (quoteJobs.length > 0) {
        console.log('📋 Quote jobs details:', quoteJobs.map(job => ({
          id: job.id,
          name: (job as any).name,
          address: (job as any).address,
          scheduledTime: job.scheduledTime,
          ownerId: job.ownerId
        })));
      }
      
      if (jobsForWeek.length === 0) {
        setJobs([]);
        setLoading(false);
        return;
      }

      // 2. Get unique client IDs from the jobs
      const clientIds = [...new Set(jobsForWeek.map(job => job.clientId))];
      console.log('👥 Unique client IDs:', clientIds);
      
      // 3. Fetch all required clients in batched queries (Firestore 'in' query limit is 30)
      const clientChunks = [];
      for (let i = 0; i < clientIds.length; i += 30) {
          clientChunks.push(clientIds.slice(i, i + 30));
      }
      
      const clientsMap = new Map<string, Client>();
      const clientPromises = clientChunks.map(chunk => 
        getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
      );
      const clientSnapshots = await Promise.all(clientPromises);
      
      clientSnapshots.forEach(snapshot => {
        snapshot.forEach(docSnap => {
          clientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
        });
      });
      
      console.log('👥 Clients found:', clientsMap.size);
      console.log('👥 Client IDs:', Array.from(clientsMap.keys()));
      
      // 4. Map clients back to their jobs
      const jobsWithClients = jobsForWeek.map(job => {
        if (job.serviceId === 'quote') {
          return { ...job, client: null };
        }
        return {
          ...job,
          client: clientsMap.get(job.clientId) || null,
        };
      });

      console.log('✅ Final jobs with clients:', jobsWithClients.length);
      console.log('✅ Jobs with missing clients:', jobsWithClients.filter(job => !job.client).length);

      // Load vehicles and member assignments
      try {
        const [vehicleList, memberList] = await Promise.all([
          listVehicles(),
          listMembers(),
        ]);
        setVehicles(vehicleList);
        const map: Record<string, MemberRecord> = {};
        memberList.forEach((m: MemberRecord) => { map[m.uid] = m; });
        setMemberMap(map);

        // Load rota for this week
        const rota = await fetchRotaRange(weekStart, weekEnd);
        setRotaMap(rota);
      } catch (err) {
        console.error('Error loading vehicles/members/rota:', err);
      }

      setJobs(jobsWithClients);
      
      // 5. Fetch and verify completed days for this week
      try {
        const ownerId = await getDataOwnerId();
        const completedDaysDoc = await getDoc(doc(db, 'completedWeeks', `${ownerId}_${startDate}`));
        if (completedDaysDoc.exists()) {
          const data = completedDaysDoc.data();
          const loadedCompletedDays = data.completedDays || [];
          console.log(`Loaded completed days from Firestore for week ${startDate}:`, loadedCompletedDays);

          const verifiedCompletedDays = loadedCompletedDays.filter((dayTitle: string) => {
            const dayIndex = daysOfWeek.indexOf(dayTitle);
            if (dayIndex === -1) return false;

            const dayDate = addDays(weekStart, dayIndex);
            const jobsForDay = jobsWithClients.filter((job: any) => {
                const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
                return jobDate && jobDate.toDateString() === dayDate.toDateString();
            });
            
            const isActuallyComplete = jobsForDay.length > 0 && jobsForDay.every(job => job.status === 'completed');

            if (jobsForDay.length > 0 && !isActuallyComplete) {
                console.warn(`Data inconsistency: Day "${dayTitle}" was marked as complete in Firestore, but has incomplete jobs. Ignoring for this session.`);
            }

            return isActuallyComplete;
          });
          
          console.log('Verified completed days:', verifiedCompletedDays);
          setCompletedDays(verifiedCompletedDays);

        } else {
          console.log(`No completed days document found for week ${startDate}.`);
          setCompletedDays([]);
        }
      } catch (error) {
        console.error('Error fetching completed days:', error);
        setCompletedDays([]);
      }
      
      setLoading(false);
    };
    fetchJobsAndClients();
  }, [week]);

  const handleSetEta = async (time: string) => {
    if (!timePickerJob) return;

    // Update job in Firestore
    const jobRef = doc(db, 'jobs', timePickerJob.id);
    await updateDoc(jobRef, { eta: time });

    // Update local state
    setJobs(prevJobs =>
      prevJobs.map(job =>
        job.id === timePickerJob.id ? { ...job, eta: time } : job
      )
    );

    setTimePickerJob(null);
    setShowTimePicker(false);
  };

  const showPickerForJob = (job: Job & { client: Client | null }) => {
    setTimePickerJob(job);
    setShowTimePicker(true);
  };

  const allocateJobsForDay = (dayDate: Date, jobsForDay: (Job & { client: Client | null })[]): any[] => {
    if (vehicles.length === 0) return jobsForDay;
    // Build active vehicles list with capacities
    const dateKey = format(dayDate, 'yyyy-MM-dd');
    const rotaForDay = rotaMap[dateKey] || {};
    type VehicleBlock = { vehicle: VehicleRecord; remaining: number; jobs: any[] };
    const activeBlocks: VehicleBlock[] = [];
    vehicles.forEach(v => {
      const assignedMembers = Object.values(memberMap).filter(m => m.vehicleId === v.id);
      if (assignedMembers.length === 0) return; // skip unassigned vehicles
      const availableMembers = assignedMembers.filter(m => (rotaForDay[m.uid] ?? 'on') === 'on');
      if (availableMembers.length === 0) return; // inactive this day
      const capacity = availableMembers.reduce((sum, m) => sum + (m.dailyRate || 0), 0);
      activeBlocks.push({ vehicle: v, remaining: capacity, jobs: [] });
    });
    if (activeBlocks.length === 0) return jobsForDay; // fallback

    // Allocate jobs sequentially in current round order
    const sortedJobs = [...jobsForDay].sort((a, b) => (a.client?.roundOrderNumber ?? 0) - (b.client?.roundOrderNumber ?? 0));
    let blockIndex = 0;
    sortedJobs.forEach(job => {
      if (blockIndex >= activeBlocks.length) {
        // overflow append to last block
        activeBlocks[activeBlocks.length - 1].jobs.push(job);
        return;
      }
      const block = activeBlocks[blockIndex];
      block.jobs.push(job);
      block.remaining -= (job.price || 0);
      if (block.remaining <= 0 && blockIndex < activeBlocks.length - 1) {
        blockIndex += 1;
      }
    });

    // Flatten result with subtitles
    const result: any[] = [];
    activeBlocks.forEach(block => {
      result.push({ __type: 'vehicle', id: `${block.vehicle.id}-${dateKey}`, name: block.vehicle.name });
      result.push(...block.jobs);
    });
    return result;
  };

  // Group jobs by day of week
  const sections = daysOfWeek.map((day, i) => {
    const dayDate = addDays(weekStart, i);
    const jobsForDay = jobs
      .filter((job: any) => {
        const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
        const matches = jobDate && jobDate.toDateString() === dayDate.toDateString();
        if (!matches && job.scheduledTime) {
          console.log(`❌ Job ${job.id} filtered out for ${day}:`, {
            jobDate: job.scheduledTime,
            dayDate: dayDate.toDateString(),
            jobDateString: jobDate?.toDateString()
          });
        }
        return matches;
      })
      .sort((a: any, b: any) => {
        // If both jobs have ETA, sort by ETA (earliest first)
        if (a.eta && b.eta) {
          // Parse as HH:mm
          const [aHour, aMin] = a.eta.split(':').map(Number);
          const [bHour, bMin] = b.eta.split(':').map(Number);
          if (aHour !== bHour) return aHour - bHour;
          return aMin - bMin;
        }
        // If only one has ETA, that one comes first
        if (a.eta && !b.eta) return -1;
        if (!a.eta && b.eta) return 1;
        // Otherwise, sort by roundOrderNumber
        return (a.client?.roundOrderNumber ?? 0) - (b.client?.roundOrderNumber ?? 0);
      });
    
    if (jobsForDay.length > 0) {
      console.log(`📅 ${day}: ${jobsForDay.length} jobs`);
    }
    
    const allocated = allocateJobsForDay(dayDate, jobsForDay);
    return {
      title: day,
      data: allocated,
      dayDate,
    };
  });

  const handleComplete = async (jobId: string, isCompleted: boolean) => {
    setLoading(true);
    await updateJobStatus(jobId, isCompleted ? 'pending' : 'completed');
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, status: isCompleted ? 'pending' : 'completed' } : job
      )
    );
    setLoading(false);

    // Check if this was the last incomplete job for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySection = sections.find(s => s.dayDate.toDateString() === today.toDateString());
    if (todaySection) {
      const allCompleted = todaySection.data.filter(j => !(j as any).__type).every(job =>
        job.id === jobId ? !isCompleted : job.status === 'completed'
      );
      if (allCompleted) {
        Alert.alert(
          'Mark Day Complete?',
          'You have completed all jobs for today. Would you like to mark your day as complete?',
          [
            { text: 'No', style: 'cancel' },
            { text: 'Yes', onPress: () => handleDayComplete(todaySection.title) },
          ]
        );
      }
    }
  };

  const handleDeferJob = (job: Job & { client: Client | null }) => {
    setDeferJob(job);
    setShowDeferDatePicker(true);
  };

  const handleDeferDateChange = async (event: any, selectedDate?: Date) => {
    setShowDeferDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate || !deferJob) {
      setDeferJob(null);
      return;
    }
    // Prevent deferring to today if today is marked as complete
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    const isToday = selected.toDateString() === today.toDateString();
    const todaySection = sections.find(s => s.dayDate.toDateString() === today.toDateString());
    const todayIsCompleted = todaySection && completedDays.includes(todaySection.title);
    if (isToday && todayIsCompleted) {
      Alert.alert('Cannot Move to Today', 'Today is marked as complete. You cannot move jobs to today.');
      setDeferJob(null);
      return;
    }
    // Move job to selected date (09:00)
    const newDateString = format(selectedDate, 'yyyy-MM-dd') + 'T09:00:00';
    await updateDoc(doc(db, 'jobs', deferJob.id), { scheduledTime: newDateString });
    setJobs(prevJobs => prevJobs.map(j =>
      j.id === deferJob.id ? { ...j, scheduledTime: newDateString } : j
    ));
    setDeferJob(null);
    Alert.alert('Success', 'Job moved to selected date');
  };

  const isQuoteJob = (job: any) => job && job.serviceId === 'quote';

  const handleJobPress = (job: any) => {
    if (isQuoteJob(job)) {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Message ETA', 'Navigate', 'View Details', 'Delete', 'Cancel'],
            destructiveButtonIndex: 3,
            cancelButtonIndex: 4,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) handleMessageETA(job);
            if (buttonIndex === 1) handleNavigate(job.client);
            if (buttonIndex === 2) job.quoteId ? router.push({ pathname: '/quotes/[id]', params: { id: job.quoteId } } as any) : router.replace('/');
            if (buttonIndex === 3) handleDeleteQuoteJob(job);
          }
        );
      } else {
        setActionSheetJob(job);
      }
      return;
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Navigate?', 'View details?', 'Message ETA', 'Delete Job', 'Cancel'],
          destructiveButtonIndex: 3,
          cancelButtonIndex: 4,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) handleNavigate(job.client);
          if (buttonIndex === 1) handleViewDetails(job.client);
          if (buttonIndex === 2) handleMessageETA(job);
          if (buttonIndex === 3) handleDeleteJob(job.id);
        }
      );
    } else {
      setActionSheetJob(job);
    }
  };

  const handleNavigate = (client: Client | null) => {
    let address: string = '';
    
    if (client) {
      // For regular jobs, use client address
      const addressParts = [client.address1 || client.address, client.town, client.postcode].filter(Boolean);
      address = addressParts.join(', ');
    } else {
      // For quote jobs, use quote address
      const job = actionSheetJob;
      if (job && isQuoteJob(job)) {
        const addressParts = [(job as any).address, (job as any).town].filter(Boolean);
        address = addressParts.join(', ');
      }
    }
    
    if (!address) {
      Alert.alert('No address', 'No address available for this job.');
      return;
    }
    
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    Linking.openURL(url);
    setActionSheetJob(null);
  };

  const handleViewDetails = (client: Client | null) => {
    if (!client) return;
    router.push({ pathname: '/(tabs)/clients/[id]', params: { id: client.id } });
    setActionSheetJob(null);
  };

  const handleMessageETA = (job: (Job & { client: Client | null })) => {
    let mobileNumber: string | null = null;
    let name: string = '';
    
    if (isQuoteJob(job)) {
      // For quote jobs, use the quote's number and name
      mobileNumber = (job as any).number;
      name = (job as any).name;
    } else {
      // For regular jobs, use the client's mobile number and name
      mobileNumber = job.client?.mobileNumber || null;
      name = job.client?.name || '';
    }
    
    if (!mobileNumber) {
      Alert.alert('No mobile number', 'No mobile number available for this job.');
      return;
    }
    
    const { eta: jobEta } = job;
    const etaText = jobEta 
      ? `Roughly estimated time of arrival: \n${jobEta}` 
      : 'We will be with you as soon as possible tomorrow.';

    const template = `Hello ${name},\n\nCourtesy message to let you know window cleaning is due tomorrow.\n${etaText}\n\nMany thanks,`;

    let smsUrl = '';
    if (Platform.OS === 'ios') {
      smsUrl = `sms:${mobileNumber}&body=${encodeURIComponent(template)}`;
    } else {
      smsUrl = `smsto:${mobileNumber}?body=${encodeURIComponent(template)}`;
    }
    Linking.openURL(smsUrl);
    setActionSheetJob(null);
  };

  const handleDeleteJob = (jobId: string) => {
    Alert.alert(
      'Delete Job',
      'Are you sure you want to permanently delete this job?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDoc(doc(db, 'jobs', jobId));
            setJobs((prev) => prev.filter((job) => job.id !== jobId));
            setActionSheetJob(null);
          },
        },
      ]
    );
  };

  // Delete logic for quote jobs (removes both job and associated quote)
  const handleDeleteQuoteJob = async (job: any) => {
    if (window.confirm('Are you sure you want to permanently delete this quote job?')) {
      if (job.quoteId) {
        try {
          await deleteDoc(doc(db, 'quotes', job.quoteId));
        } catch (e) {
          console.warn('Failed to delete quote document:', e);
        }
      }
      await deleteDoc(doc(db, 'jobs', job.id));
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setActionSheetJob(null);
    }
  };

  // Add handler to open quote details modal for progressing to pending
  const handleProgressToPending = async (job: any) => {
    if (!('quoteId' in job) || !job.quoteId) return;
    // Fetch the latest quote data
    const quoteDoc = await getDoc(doc(db, 'quotes', job.quoteId));
    if (!quoteDoc.exists()) return;
    const quote = quoteDoc.data();
    setQuoteDetails({
      frequency: quote.frequency || '4 weekly',
      value: quote.value || '',
      notes: quote.notes || '',
      quoteId: job.quoteId,
    });
    setShowQuoteDetailsModal(true);
    setActionSheetJob(null);
  };

  const toggleDay = (title: string) => {
    setCollapsedDays((prev) =>
      prev.includes(title) ? prev.filter((d) => d !== title) : [...prev, title]
    );
  };

  const isDayComplete = (dayTitle: string) => {
    const dayIndex = daysOfWeek.indexOf(dayTitle);
    if (dayIndex === -1) return false;
    const dayDate = addDays(weekStart, dayIndex);
    const jobsForDay = jobs.filter((job) => {
      const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
      return jobDate && jobDate.toDateString() === dayDate.toDateString();
    });
    return jobsForDay.length > 0 && jobsForDay.every((job) => job.status === 'completed');
  };

  const isDayInPast = (dayTitle: string) => {
    const dayIndex = daysOfWeek.indexOf(dayTitle);
    if (dayIndex === -1) return false;
    
    const dayDate = addDays(weekStart, dayIndex);
    
    // Use isBefore and startOfToday for a robust, timezone-safe comparison
    return isBefore(dayDate, startOfToday());
  };

  const handleDayComplete = async (dayTitle: string) => {
    // Only include real jobs (exclude vehicle blocks or any without an id)
    const dayJobs = (sections.find(section => section.title === dayTitle)?.data || []).filter(job => job && job.id && !(job as any).__type);
    if (dayJobs.length === 0) return;

    try {
      // Update all jobs for the day to 'completed'
      const batch = writeBatch(db);
      dayJobs.forEach(job => {
        const jobRef = doc(db, 'jobs', job.id);
        batch.update(jobRef, { status: 'completed' });
      });
      await batch.commit();

      // Update local state
      setJobs(prev => prev.map(job =>
        dayJobs.some(dayJob => dayJob.id === job.id)
          ? { ...job, status: 'completed' }
          : job
      ));

      // Add day to completed days and save to Firestore
      const newCompletedDays = [...completedDays, dayTitle];
      setCompletedDays(newCompletedDays);

      // Save completed days to Firestore
      const ownerId = await getDataOwnerId();
      const completedWeekRef = doc(db, 'completedWeeks', `${ownerId}_${format(weekStart, 'yyyy-MM-dd')}`);
      await setDoc(completedWeekRef, {
        completedDays: newCompletedDays,
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        updatedAt: new Date()
      });

      Alert.alert('Success', `${dayJobs.length} jobs marked as completed for ${dayTitle}`);
    } catch (error) {
      console.error('Error completing day:', error);
      Alert.alert('Error', 'Failed to complete day. Please try again.');
    }
  };

  const renderItem = ({ item, index, section }: any) => {
    if (isQuoteJob(item)) {
      // Only show complete for first incomplete quote job on today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const jobDate = item.scheduledTime ? parseISO(item.scheduledTime) : null;
      const isToday = jobDate && jobDate.toDateString() === today.toDateString();
      const sectionIndex = sections.findIndex(s => s.title === section.title);
      const firstIncompleteIndex = section.data.findIndex((job: any) => (job as any).__type !== 'vehicle' && job.status !== 'completed');
      const isDayCompleted = completedDays.includes(section.title);
      return (
        <View style={[styles.clientRow, { backgroundColor: '#e3f2fd' }]}> {/* blue highlight for quote */}
          <View style={{ flex: 1 }}>
            <Pressable onPress={() => handleJobPress(item)}>
              <View style={styles.addressBlock}>
                <Text style={styles.addressTitle}>{item.address}</Text>
              </View>
              <View style={{ backgroundColor: '#90caf9', padding: 4, borderRadius: 6, marginBottom: 4 }}>
                <Text style={{ color: '#1565c0', fontWeight: 'bold' }}>Quote</Text>
              </View>
              <Text style={styles.clientName}>{item.name}</Text>
              <Text>{item.address}</Text>
              <Text>{item.town}</Text>
              <Text>{item.number}</Text>
            </Pressable>
          </View>
          <View style={styles.controlsContainer}>
            <Pressable onPress={() => showPickerForJob(item)} style={styles.etaButton}>
              <Text style={styles.etaButtonText}>{item.eta || 'ETA'}</Text>
            </Pressable>
            {isCurrentWeek && isToday && index === firstIncompleteIndex && !item.status && !isDayCompleted && (
              <Pressable onPress={() => setQuoteCompleteModal({ job: item, visible: true })} style={styles.completeButton}>
                <Text style={styles.completeButtonText}>Complete?</Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    }

    if ((item as any).__type === 'vehicle') {
      return (
        <View style={{ paddingVertical: 4, backgroundColor: '#F0F0F0' }}>
          <Text style={{ fontWeight: 'bold' }}>{item.name}</Text>
        </View>
      );
    }
    const sectionIndex = sections.findIndex(s => s.title === section.title);
    const isCompleted = item.status === 'completed';
    const isDayCompleted = completedDays.includes(section.title);
    const client: any = item.client;
    // Find the first incomplete job in this section
    const firstIncompleteIndex = section.data.findIndex((job: any) => (job as any).__type !== 'vehicle' && job.status !== 'completed');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = item.scheduledTime ? parseISO(item.scheduledTime) : null;
    // Determine if this job is for today
    const isToday = jobDate && jobDate.toDateString() === today.toDateString();
    const isFutureDay = jobDate && jobDate > today;
    // Only show complete button for the first incomplete job on today, if today is not marked complete
    const showCompleteButton = isCurrentWeek && isToday && index === firstIncompleteIndex && !isCompleted && !isDayCompleted;
    const showUndoButton = isCurrentWeek && isCompleted && !isDayCompleted;
    const isOneOffJob = ['Gutter cleaning', 'Conservatory roof', 'Soffit and fascias', 'One-off window cleaning', 'Other'].includes(item.serviceId);

    const addressParts = client ? [client.address1 || client.address, client.town, client.postcode].filter(Boolean) : [];
    const address = client ? addressParts.join(', ') : 'Unknown address';

    return (
      <View style={[
        styles.clientRow,
        isCompleted && styles.completedRow,
        isOneOffJob && !isCompleted && styles.oneOffJobRow
      ]}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => handleJobPress(item)}>
            <View style={styles.addressBlock}>
              <Text style={styles.addressTitle}>{address}</Text>
            </View>
            {isOneOffJob && (
              <View style={styles.oneOffJobLabel}>
                <Text style={styles.oneOffJobText}>{item.serviceId}</Text>
              </View>
            )}
            <Text style={styles.clientName}>{client?.name}{typeof client?.quote === 'number' ? ` — £${client.quote.toFixed(2)}` : ''}</Text>
            {client?.accountNumber !== undefined && (
              <Text style={styles.accountNumberText}>{displayAccountNumber(client.accountNumber)}</Text>
            )}
          </Pressable>
        </View>
        {/* Notes button */}
        {client?.notes && client.notes.trim() !== '' && (
          <Pressable
            style={styles.notesButton}
            onPress={() => {
              setNoteModalText(client.notes);
              setNoteModalVisible(true);
            }}
            accessibilityLabel="Show client notes"
          >
            <Text style={styles.notesButtonIcon}>!</Text>
          </Pressable>
        )}
        <View style={styles.controlsContainer}>
          <Pressable onPress={() => showPickerForJob(item)} style={styles.etaButton}>
            <Text style={styles.etaButtonText}>{item.eta || 'ETA'}</Text>
          </Pressable>
          {showCompleteButton && (
            <Pressable onPress={() => handleComplete(item.id, isCompleted)} style={styles.completeButton}>
              <Text style={styles.completeButtonText}>Complete?</Text>
            </Pressable>
          )}
          {showUndoButton && (
            <Pressable onPress={() => handleComplete(item.id, isCompleted)} style={styles.completeButton}>
              <Text style={styles.completeButtonText}>Undo</Text>
            </Pressable>
          )}
          {(isToday || isFutureDay) && !isDayCompleted && (
            <Pressable onPress={() => handleDeferJob(item)} style={styles.deferButton}>
              <Text style={styles.deferButtonText}>Move</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  // Move job up/down within a day or left/right between days (same as in main runsheet)
  const moveJob = async (sectionIndex: number, jobIndex: number, direction: 'up' | 'down' | 'left' | 'right') => {
    const sections = daysOfWeek.map((day, i) => {
      const dayDate = addDays(weekStart, i);
      const jobsForDay = jobs
        .filter((job) => {
          const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
          return jobDate && jobDate.toDateString() === dayDate.toDateString();
        })
        .sort((a, b) => (a.client?.roundOrderNumber ?? 0) - (b.client?.roundOrderNumber ?? 0));
      return {
        title: day,
        data: jobsForDay,
        dayDate,
      };
    });

    const section = sections[sectionIndex];
    if (!section) return;

    const jobToMove = section.data[jobIndex];
    if (!jobToMove) return;

    if (direction === 'up' || direction === 'down') {
      const swapIndex = direction === 'up' ? jobIndex - 1 : jobIndex + 1;
      if (swapIndex < 0 || swapIndex >= section.data.length) return;

      const jobToSwapWith = section.data[swapIndex];
      if (!jobToMove.client || !jobToSwapWith.client) return;

      const newRoundOrderForJobToMove = jobToSwapWith.client.roundOrderNumber;
      const newRoundOrderForJobToSwapWith = jobToMove.client.roundOrderNumber;

      // Perform DB updates first
      await Promise.all([
        updateDoc(doc(db, 'clients', jobToMove.client.id), { roundOrderNumber: newRoundOrderForJobToMove }),
        updateDoc(doc(db, 'clients', jobToSwapWith.client.id), { roundOrderNumber: newRoundOrderForJobToSwapWith }),
      ]);

      // Then, update local state immutably
      setJobs(prevJobs => {
        return prevJobs.map(j => {
          if (j.id === jobToMove.id && j.client) {
            return { ...j, client: { ...j.client, roundOrderNumber: newRoundOrderForJobToMove } };
          }
          if (j.id === jobToSwapWith.id && j.client) {
            return { ...j, client: { ...j.client, roundOrderNumber: newRoundOrderForJobToSwapWith } };
          }
          return j;
        });
      });
    } else if (direction === 'left' || direction === 'right') {
      const newSectionIndex = direction === 'left' ? sectionIndex - 1 : sectionIndex + 1;
      if (newSectionIndex < 0 || newSectionIndex >= sections.length) return;
      
      const newDay = sections[newSectionIndex].dayDate;
      const newScheduledTime = format(newDay, 'yyyy-MM-dd') + 'T09:00:00';
      
      // Perform DB update first
      await updateDoc(doc(db, 'jobs', jobToMove.id), { scheduledTime: newScheduledTime });

      // Then, update local state immutably
      setJobs(prevJobs => prevJobs.map(j => 
        j.id === jobToMove.id ? { ...j, scheduledTime: newScheduledTime } : j
      ));
    }
  };

  // Title for the week
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const weekTitle = `Runsheet - Week Commencing ${getOrdinal(weekStart.getDate())} ${format(weekStart, 'MMMM')}`;

  // Utility to check if a day is completed
  const isDayCompleted = (dayTitle: string) => completedDays.includes(dayTitle);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <Pressable
            style={{ backgroundColor: '#f5f5f5', padding: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0', marginRight: 8 }}
            onPress={() => router.push('/workload-forecast')}
            accessibilityLabel="Go to workload forecast"
          >
            <Ionicons name="calendar-outline" size={22} color="#007AFF" />
          </Pressable>
          <Text style={styles.title}>{weekTitle}</Text>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/')}> 
            <Text style={styles.homeButtonText}>🏠</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index, section }) =>
              collapsedDays.includes(section.title) ? null : renderItem({ item, index, section })
            }
            renderSectionHeader={({ section: { title, data } }) => {
              const dayIsPast = isDayInPast(title);
              const dayIsCompleted = completedDays.includes(title);
              const showDayCompleteButton = isDayComplete(title) && !dayIsCompleted && !dayIsPast;

              return (
                <View style={styles.sectionHeaderContainer}>
                  <Pressable onPress={() => toggleDay(title)} style={styles.sectionHeaderPressable}>
                    <Text style={styles.sectionHeader}>
                      {title} ({data.filter(item => !item.__type).length}) {collapsedDays.includes(title) ? '+' : '-'}
                      {(dayIsCompleted || dayIsPast) && ' 🔒'}
                    </Text>
                  </Pressable>
                  {showDayCompleteButton && (
                    Platform.OS === 'web'
                      ? (
                          <button
                            style={{
                              backgroundColor: '#007AFF',
                              borderRadius: 6,
                              padding: '4px 8px',
                              color: '#fff',
                              fontWeight: 'bold',
                              border: 'none',
                              cursor: 'pointer',
                              marginLeft: 8,
                            }}
                            onClick={() => handleDayComplete(title)}
                          >
                            Day complete?
                          </button>
                        )
                      : (
                          <Pressable
                            style={styles.dayCompleteButton}
                            onPress={() => handleDayComplete(title)}
                          >
                            <Text style={styles.dayCompleteButtonText}>Day complete?</Text>
                          </Pressable>
                        )
                  )}
                  {(dayIsCompleted || dayIsPast) && (
                    <View style={styles.dayCompletedIndicator}>
                      <Text style={styles.dayCompletedText}>Completed</Text>
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No jobs due this week.</Text>}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
          />
        )}
        {showTimePicker && timePickerJob && (
          <TimePickerModal
            visible={showTimePicker}
            onClose={() => {
              setShowTimePicker(false);
              setTimePickerJob(null);
            }}
            onConfirm={handleSetEta}
            initialTime={timePickerJob.eta}
          />
        )}
        {actionSheetJob && (Platform.OS === 'android' || Platform.OS === 'web') && (
          <Pressable style={styles.androidSheetOverlay} onPress={() => setActionSheetJob(null)}>
            <View style={styles.androidSheet} pointerEvents="box-none">
              {isQuoteJob(actionSheetJob) ? (
                <>
                  <Button title="Message ETA" onPress={() => handleMessageETA(actionSheetJob)} />
                  <Button title="Navigate" onPress={() => handleNavigate(actionSheetJob.client)} />
                  <Button title="View Details" onPress={() => (actionSheetJob as any).quoteId ? router.push({ pathname: '/quotes/[id]', params: { id: actionSheetJob.quoteId } } as any) : router.replace('/')} />
                  <Button title="Progress to Pending" onPress={() => handleProgressToPending(actionSheetJob)} />
                  <Button title="Delete" color="red" onPress={() => handleDeleteQuoteJob(actionSheetJob)} />
                </>
              ) : (
                <>
                  <Button title="Navigate?" onPress={() => handleNavigate(actionSheetJob.client)} />
                  <Button title="View details?" onPress={() => handleViewDetails(actionSheetJob.client)} />
                  <Button title="Message ETA" onPress={() => handleMessageETA(actionSheetJob)} />
                  <Button title="Delete Job" color="red" onPress={() => handleDeleteJob(actionSheetJob.id)} />
                </>
              )}
            </View>
          </Pressable>
        )}
        {/* Notes Modal */}
        <Modal
          visible={noteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setNoteModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.notesModalContent}>
              <Text style={styles.notesModalTitle}>Client Notes</Text>
              <Text style={styles.notesModalText}>{noteModalText}</Text>
              <Pressable style={styles.notesModalClose} onPress={() => setNoteModalVisible(false)}>
                <Text style={styles.notesModalCloseText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        {showDeferDatePicker && deferJob && (
          <DateTimePicker
            value={deferJob.scheduledTime ? new Date(deferJob.scheduledTime) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={handleDeferDateChange}
          />
        )}
        {/* Quote Completion Modal */}
        <Modal visible={quoteCompleteModal.visible} transparent animationType="fade" onRequestClose={() => setQuoteCompleteModal({ job: null, visible: false })}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 12, width: 320 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Convert Quote to Client</Text>
              <TextInput placeholder="Frequency (4/8/one-off)" value={quoteForm.frequency} onChangeText={v => setQuoteForm(f => ({ ...f, frequency: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} />
              <TextInput placeholder="Cost (£)" value={quoteForm.cost} onChangeText={v => setQuoteForm(f => ({ ...f, cost: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} keyboardType="numeric" />
              <TextInput placeholder="Round Order" value={quoteForm.roundOrder} onChangeText={v => setQuoteForm(f => ({ ...f, roundOrder: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} keyboardType="numeric" />
              <Button title="Create Client" onPress={async () => {
                // Create client
                const { job } = quoteCompleteModal;
                const clientDoc = await addDoc(collection(db, 'clients'), {
                  name: job.name,
                  address: job.address,
                  mobileNumber: job.number,
                  startDate: job.scheduledTime,
                  frequency: quoteForm.frequency,
                  quote: Number(quoteForm.cost),
                  roundOrderNumber: Number(quoteForm.roundOrder),
                });
                // Remove quote and job
                await deleteDoc(doc(db, 'quotes', job.quoteId));
                await deleteDoc(doc(db, 'jobs', job.id));
                setQuoteCompleteModal({ job: null, visible: false });
                setQuoteForm({ frequency: '', cost: '', roundOrder: '' });
                if (Platform.OS === 'web') {
                  window.alert('Client created from quote!');
                } else {
                  Alert.alert('Client created from quote!');
                }
                // Optionally refresh jobs/clients here
              }} />
              <Button title="Cancel" onPress={() => setQuoteCompleteModal({ job: null, visible: false })} color="red" />
            </View>
          </View>
        </Modal>
        {/* Quote Details Modal for Progress to Pending */}
        <Modal visible={showQuoteDetailsModal} animationType="slide" transparent onRequestClose={() => setShowQuoteDetailsModal(false)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 12, width: 340 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Progress Quote to Pending</Text>
              <Text style={{ marginBottom: 8 }}>Visit Frequency</Text>
              <Picker
                selectedValue={quoteDetails.frequency}
                onValueChange={v => setQuoteDetails(q => ({ ...q, frequency: v }))}
                style={{ marginBottom: 8 }}
              >
                <Picker.Item label="4 weekly" value="4 weekly" />
                <Picker.Item label="8 weekly" value="8 weekly" />
                <Picker.Item label="one-off" value="one-off" />
              </Picker>
              <TextInput placeholder="Quote £ value" value={quoteDetails.value} onChangeText={v => setQuoteDetails(q => ({ ...q, value: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} keyboardType="numeric" />
              <TextInput placeholder="Notes" value={quoteDetails.notes} onChangeText={v => setQuoteDetails(q => ({ ...q, notes: v }))} style={{ borderWidth: 1, marginBottom: 8, padding: 8 }} multiline />
              <Button title="Save & Progress" onPress={async () => {
                // Update the quote document
                await updateDoc(doc(db, 'quotes', quoteDetails.quoteId), {
                  frequency: quoteDetails.frequency,
                  value: quoteDetails.value,
                  notes: quoteDetails.notes,
                  status: 'pending',
                });
                setShowQuoteDetailsModal(false);
                // Optionally, refresh jobs/quotes here if needed
                if (Platform.OS === 'web') window.location.reload();
              }} />
              <Button title="Cancel" onPress={() => setShowQuoteDetailsModal(false)} color="red" />
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginRight: 16,
    flexShrink: 1,
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
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  sectionHeaderPressable: {
    flex: 1,
  },
  sectionHeader: { fontSize: 20, fontWeight: 'bold' },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 0,
  },
  addressBlock: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#005bb5',
    marginBottom: 4,
    alignSelf: 'stretch',
  },
  addressTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  clientName: { fontSize: 16 },
  clientAddress: { fontSize: 16 },
  empty: { textAlign: 'center', marginTop: 50 },
  controlsContainer: {
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  etaButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  etaButtonText: {
    fontWeight: 'bold',
    color: '#333',
  },
  completedRow: {
    backgroundColor: '#b6eab6',
  },
  oneOffJobRow: {
    backgroundColor: '#fffbe6', // A light yellow to highlight
    borderColor: '#ffeaa7',
  },
  oneOffJobLabel: {
    backgroundColor: '#fdcb6e',
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderBottomRightRadius: 10,
    marginBottom: 4,
  },
  oneOffJobText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  completeButton: {
    marginTop: 8,
    backgroundColor: '#eee',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  completeButtonText: {
    color: '#007A33',
    fontWeight: 'bold',
  },
  androidSheetOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  androidSheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 250,
    elevation: 4,
    gap: 12,
  },
  mobileNumber: {
    fontSize: 14,
    color: '#555',
    marginBottom: 2,
  },
  dayCompleteButton: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayCompleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dayCompletedIndicator: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayCompletedText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  deferButton: {
    marginTop: 8,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deferButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  notesButton: {
    backgroundColor: '#ffcc00',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    marginTop: 8,
    elevation: 2,
  },
  notesButtonIcon: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notesModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    minWidth: 250,
    maxWidth: 320,
    alignItems: 'center',
  },
  notesModalTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 12,
  },
  notesModalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  notesModalClose: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notesModalCloseText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  accountNumberText: {
    fontSize: 14,
    color: '#666',
  },
}); 