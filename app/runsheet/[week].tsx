import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker as RNPicker } from '@react-native-picker/picker';
import { addDays, endOfWeek, format, isBefore, isThisWeek, parseISO, startOfToday, startOfWeek } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getApp } from 'firebase/app';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Button, Linking, Modal, Platform, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import GoCardlessPaymentModal from '../../components/GoCardlessPaymentModal';
import TimePickerModal from '../../components/TimePickerModal';
import { db } from '../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../core/session';
import { listMembers, MemberRecord } from '../../services/accountService';
import { formatAuditDescription, logAction } from '../../services/auditService';
import { getNextAccountNumber } from '../../services/clientService';
import { GoCardlessService } from '../../services/gocardlessService';
import { getJobsForWeek, updateJobStatus } from '../../services/jobService';
import { createGoCardlessPaymentsForDay } from '../../services/paymentService';
import { resetDayToRoundOrder } from '../../services/resetService';
import { AvailabilityStatus, fetchRotaRange } from '../../services/rotaService';
import { checkClientLimit } from '../../services/subscriptionService';
import { getUserProfile } from '../../services/userService';
import { listVehicles, VehicleRecord } from '../../services/vehicleService';
import type { Client } from '../../types/client';
import type { Job, Payment, User } from '../../types/models';
import { getJobAccountDisplay } from '../../utils/jobDisplay';
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
  const [collapsedVehicles, setCollapsedVehicles] = useState<string[]>([]);
  const [isCurrentWeek, setIsCurrentWeek] = useState(false);
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerJob, setTimePickerJob] = useState<(Job & { client: Client | null }) | null>(null);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteModalText, setNoteModalText] = useState<string | null>(null);
  const [deferJob, setDeferJob] = useState<Job & { client: Client | null } | null>(null);
  const [showDeferDatePicker, setShowDeferDatePicker] = useState(false);
  const [deferSelectedVehicle, setDeferSelectedVehicle] = useState<string>('auto'); // 'auto' means automatic allocation
  const [quoteCompleteModal, setQuoteCompleteModal] = useState<{ job: any, visible: boolean }>({ job: null, visible: false });
  const [quoteForm, setQuoteForm] = useState({ frequency: '', cost: '', roundOrder: '' });
  const [showQuoteDetailsModal, setShowQuoteDetailsModal] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState({ frequency: '4 weekly', value: '', notes: '', quoteId: '' });
  const [quoteLines, setQuoteLines] = useState<any[]>([]);
  const [quoteData, setQuoteData] = useState<any>(null); // Add this to store full quote data
  
  // Note job functionality
  const [addNoteModalVisible, setAddNoteModalVisible] = useState(false);
  const [addNoteText, setAddNoteText] = useState('');
  const [addNoteForJob, setAddNoteForJob] = useState<Job & { client: Client | null } | null>(null);
  
  // Delete note functionality
  const [deleteNoteModalVisible, setDeleteNoteModalVisible] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Job & { client: Client | null } | null>(null);
  
  // Price edit functionality
  const [priceEditModalVisible, setPriceEditModalVisible] = useState(false);
  const [priceEditJob, setPriceEditJob] = useState<Job & { client: Client | null } | null>(null);
  const [priceEditValue, setPriceEditValue] = useState('');

  // Day reset functionality
  const [resettingDay, setResettingDay] = useState<string | null>(null);

  // Summary modal for day completion
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryDDJobs, setSummaryDDJobs] = useState<(Job & { client: Client | null })[]>([]);
  // Track per-job completion order and out-of-order swap proposals (per day)
  const [completionMap, setCompletionMap] = useState<Record<string, number>>({});
  const [swapProposalsByDay, setSwapProposalsByDay] = useState<Record<string, Array<{ jobId: string; swapWithJobId: string }>>>({});
  const [summarySwapChoices, setSummarySwapChoices] = useState<Array<{ jobId: string; swapWithJobId: string; selected: boolean }>>([]);
  const [summaryDayTitle, setSummaryDayTitle] = useState<string | null>(null);
  const [summaryProcessing, setSummaryProcessing] = useState<boolean>(false);

  // Multi-select & bulk move
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [showBulkMovePicker, setShowBulkMovePicker] = useState(false);
  const [bulkMoveDate, setBulkMoveDate] = useState<Date>(startOfToday());
  const [bulkMoveVehicle, setBulkMoveVehicle] = useState<string>('auto');
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false);

  // Real-time swap proposals listener - TEMPORARILY DISABLED DUE TO WHITE SCREEN
  // useEffect(() => {
  //   let unsubscribe: (() => void) | null = null;
  //
  //   const setupListener = async () => {
  //     try {
  //       const ownerId = await getDataOwnerId();
  //       if (!ownerId) return;
  //
  //       const weekKey = `${ownerId}_${format(weekStart, 'yyyy-MM-dd')}`;
  //       const proposalsRef = collection(db, 'swapProposals', weekKey, 'proposals');
  //
  //       unsubscribe = onSnapshot(proposalsRef, (snapshot) => {
  //         try {
  //           const proposals: Record<string, Array<{ jobId: string; swapWithJobId: string }>> = {};
  //           snapshot.forEach((doc) => {
  //             proposals[doc.id] = doc.data().proposals || [];
  //           });
  //           setSwapProposalsByDay(proposals);
  //         } catch (error) {
  //           console.error('Error processing swap proposals snapshot:', error);
  //         }
  //       }, (error) => {
  //         console.error('Error listening to swap proposals:', error);
  //       });
  //     } catch (error) {
  //       console.error('Error setting up swap proposals listener:', error);
  //     }
  //   };
  //
  //   setupListener();
  //
  //   return () => {
  //     if (unsubscribe) {
  //       unsubscribe();
  //     }
  //   };
  // }, [weekStart]);

  // GoCardless payment modal
  const [gocardlessPaymentModal, setGocardlessPaymentModal] = useState<{
    visible: boolean;
    job: Job & { client: Client | null } | null;
  }>({ visible: false, job: null });

  const [userProfile, setUserProfile] = useState<User | null>(null);

  // Client balances for quick action buttons (clientId -> balance)
  const [clientBalances, setClientBalances] = useState<Record<string, number>>({});

  const router = useRouter();

  // Owner & user profile
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    (async () => {
      const session = await getUserSession();
      setIsOwner(session?.isOwner ?? false);

      if (session) {
        const profile = await getUserProfile(session.accountId);
        setUserProfile(profile);
      }
    })();
  }, []);

  // Helper functions
  const isQuoteJob = (job: any) => job && job.serviceId === 'quote';
  const isNoteJob = (job: any) => job && job.serviceId === 'note';
  const isSelectableJob = (job: any) => job && !isNoteJob(job) && !isQuoteJob(job) && job.status !== 'completed';

  // Parse week param
  const weekStart = week ? parseISO(week as string) : startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  useEffect(() => {
    setIsCurrentWeek(isThisWeek(weekStart, { weekStartsOn: 1 }));

    let jobsUnsubscribe: (() => void) | null = null;

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

      // Populate completion map from database for jobs already marked complete
      const initialCompletionMap: Record<string, number> = {};
      jobsWithClients.forEach(job => {
        if (job.status === 'completed' && (job as any).completionSequence) {
          initialCompletionMap[job.id] = (job as any).completionSequence;
        }
      });
      setCompletionMap(initialCompletionMap);
      
      setJobs(jobsWithClients);
      
      // 5. Fetch and verify completed days for this week
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) {
          console.log('No ownerId found, skipping completed days fetch');
          setCompletedDays([]);
        } else {
          try {
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
                    return jobDate && jobDate.toDateString() === dayDate.toDateString() && !isNoteJob(job) && !isQuoteJob(job);
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
          } catch (docError) {
            console.warn('Error fetching completed days document (permissions or does not exist):', docError);
            setCompletedDays([]);
          }
        }
      } catch (error) {
        console.error('Error in completed days fetch process:', error);
        setCompletedDays([]);
      }
      
      setLoading(false);

      // DISABLED: Real-time job updates causing blank screen
      // // Set up real-time job updates after initial load
      // const ownerId = await getDataOwnerId();
      // if (ownerId) {
      //   const jobsQuery = query(
      //     collection(db, 'jobs'),
      //     where('ownerId', '==', ownerId),
      //     where('scheduledTime', '>=', startDate),
      //     where('scheduledTime', '<=', endDate)
      //   );
      //
      //   jobsUnsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      //     console.log('Real-time job update received');
      //     const updatedJobs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Job));
      //
      //     // Update jobs state, merging with existing client data
      //     setJobs(currentJobs => {
      //       return updatedJobs.map(updatedJob => {
      //         // Find existing job to preserve client data
      //         const existingJob = currentJobs.find(j => j.id === updatedJob.id);
      //         return existingJob ? { ...updatedJob, client: existingJob.client } : updatedJob;
      //       });
      //     });
      //   }, (error) => {
      //     console.error('Error in real-time jobs listener:', error);
      //   });
      // }
    };

    fetchJobsAndClients();

    // Cleanup function
    return () => {
      if (jobsUnsubscribe) {
        jobsUnsubscribe();
      }
    };
  }, [week]);

  // Fetch client balances for the quick action buttons
  useEffect(() => {
    const fetchClientBalances = async () => {
      if (jobs.length === 0) return;
      
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) return;
        
        // Get unique client IDs from jobs (excluding quotes and notes)
        const clientIds = [...new Set(
          jobs
            .filter(job => job.client && !isQuoteJob(job) && !isNoteJob(job))
            .map(job => job.clientId)
        )];
        
        if (clientIds.length === 0) return;
        
        // Fetch all completed jobs for these clients
        const allJobs: Job[] = [];
        const allPayments: Payment[] = [];
        
        // Batch fetch jobs (in chunks of 30 due to Firestore 'in' limit)
        for (let i = 0; i < clientIds.length; i += 30) {
          const chunk = clientIds.slice(i, i + 30);
          const jobsQuery = query(
            collection(db, 'jobs'),
            where('ownerId', '==', ownerId),
            where('clientId', 'in', chunk),
            where('status', '==', 'completed')
          );
          const jobsSnapshot = await getDocs(jobsQuery);
          jobsSnapshot.docs.forEach(doc => {
            allJobs.push({ ...doc.data(), id: doc.id } as Job);
          });
          
          // Fetch payments for same chunk
          const paymentsQuery = query(
            collection(db, 'payments'),
            where('ownerId', '==', ownerId),
            where('clientId', 'in', chunk)
          );
          const paymentsSnapshot = await getDocs(paymentsQuery);
          paymentsSnapshot.docs.forEach(doc => {
            allPayments.push({ ...doc.data(), id: doc.id } as Payment);
          });
        }
        
        // Calculate balance for each client
        const balances: Record<string, number> = {};
        clientIds.forEach(clientId => {
          const clientJobs = allJobs.filter(job => job.clientId === clientId);
          const clientPayments = allPayments.filter(payment => payment.clientId === clientId);
          
          const totalBilled = clientJobs.reduce((sum, job) => sum + (job.price || 0), 0);
          const totalPaid = clientPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
          
          // Get starting balance from client data
          const clientData = jobs.find(j => j.clientId === clientId)?.client;
          const startingBalance = typeof clientData?.startingBalance === 'number' ? clientData.startingBalance : 0;
          
          // Positive = credit, Negative = outstanding
          balances[clientId] = totalPaid - totalBilled + startingBalance;
        });
        
        setClientBalances(balances);
      } catch (error) {
        console.error('Error fetching client balances:', error);
      }
    };
    
    fetchClientBalances();
  }, [jobs]);

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

  const showPickerForJob = (job: Job & { client: Client | null }, section?: any, jobIndex?: number) => {
    setTimePickerJob(job);
    
    // Find previous job's ETA if section data and index are provided
    let previousJobEta: string | undefined;
    if (section && typeof jobIndex === 'number' && jobIndex > 0) {
      // Look backwards from current index to find the previous non-vehicle, non-note job
      for (let i = jobIndex - 1; i >= 0; i--) {
        const prevItem = section.data[i];
        if (prevItem && !(prevItem as any).__type && !isNoteJob(prevItem)) {
          previousJobEta = prevItem.eta;
          break;
        }
      }
    }
    
    setTimePickerJob({ ...job, previousJobEta } as any);
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

    // ✅ NEW: Group notes with their parent jobs before allocation
    const parentJobs: (Job & { client: Client | null; attachedNotes?: any[] })[] = [];
    const standaloneNotes: (Job & { client: Client | null })[] = [];
    
    jobsForDay.forEach(job => {
      if (isNoteJob(job)) {
        // Check if this note has a parent job in the same day
        const parentJob = jobsForDay.find(parent => 
          !isNoteJob(parent) && parent.id === (job as any).originalJobId
        );
        if (parentJob) {
          // Find or create parent job entry with attached notes
          let parentEntry = parentJobs.find(p => p.id === parentJob.id);
          if (!parentEntry) {
            parentEntry = { ...parentJob, attachedNotes: [] };
            parentJobs.push(parentEntry);
          }
          parentEntry.attachedNotes!.push(job);
        } else {
          // Orphaned note - handle separately
          standaloneNotes.push(job);
        }
      } else {
        // Regular job - add if not already added with notes
        if (!parentJobs.find(p => p.id === job.id)) {
          parentJobs.push({ ...job, attachedNotes: [] });
        }
      }
    });

    // Separate manually assigned jobs from auto-allocated jobs
    const manuallyAssignedJobs: (Job & { client: Client | null; attachedNotes?: any[] })[] = [];
    const autoAllocateJobs: (Job & { client: Client | null; attachedNotes?: any[] })[] = [];
    
    parentJobs.forEach(job => {
      if (job.vehicleId) {
        // Job has manual vehicle assignment
        manuallyAssignedJobs.push(job);
      } else {
        // Job uses automatic allocation
        autoAllocateJobs.push(job);
      }
    });
    
    // First, place manually assigned jobs into their designated vehicles
    manuallyAssignedJobs.forEach(job => {
      const targetBlock = activeBlocks.find(block => block.vehicle.id === job.vehicleId);
      if (targetBlock) {
        // Add the parent job
        targetBlock.jobs.push(job);
        targetBlock.remaining -= (job.price || 0);
        
        // ✅ Add attached notes immediately after the parent job
        if (job.attachedNotes && job.attachedNotes.length > 0) {
          targetBlock.jobs.push(...job.attachedNotes);
        }
      } else {
        // Vehicle not found or not active - add to auto-allocate list
        console.warn(`Vehicle ${job.vehicleId} not found or not active for job ${job.id}, using auto-allocation`);
        autoAllocateJobs.push(job);
      }
    });

    // Then allocate remaining jobs sequentially - PRESERVE THE INPUT ORDER
    let blockIndex = 0;
    autoAllocateJobs.forEach(job => {
      if (blockIndex >= activeBlocks.length) {
        // overflow append to last block
        const lastBlock = activeBlocks[activeBlocks.length - 1];
        lastBlock.jobs.push(job);
        lastBlock.remaining -= (job.price || 0);
        
        // ✅ Add attached notes immediately after the parent job
        if (job.attachedNotes && job.attachedNotes.length > 0) {
          lastBlock.jobs.push(...job.attachedNotes);
        }
        return;
      }
      const block = activeBlocks[blockIndex];
      block.jobs.push(job);
      block.remaining -= (job.price || 0);
      
      // ✅ Add attached notes immediately after the parent job
      if (job.attachedNotes && job.attachedNotes.length > 0) {
        block.jobs.push(...job.attachedNotes);
      }
      
      if (block.remaining <= 0 && blockIndex < activeBlocks.length - 1) {
        blockIndex += 1;
      }
    });

    // ✅ Add any standalone notes to the last active block
    if (standaloneNotes.length > 0 && activeBlocks.length > 0) {
      const lastBlock = activeBlocks[activeBlocks.length - 1];
      lastBlock.jobs.push(...standaloneNotes);
    }

    // Sort jobs within each vehicle block by ETA (but preserve note positions)
    activeBlocks.forEach(block => {
      // Separate note jobs and non-note jobs
      const noteJobs: any[] = [];
      const nonNoteJobs: any[] = [];
      
      block.jobs.forEach(job => {
        if (isNoteJob(job)) {
          noteJobs.push(job);
        } else {
          nonNoteJobs.push(job);
        }
      });
      
      // Sort non-note jobs by deferred status first, then by ETA
      nonNoteJobs.sort((a: any, b: any) => {
        // Deferred jobs always come first
        if (a.isDeferred && !b.isDeferred) return -1;
        if (!a.isDeferred && b.isDeferred) return 1;
        
        // Then sort by ETA
        if (a.eta && b.eta) {
          const [aHour, aMin] = a.eta.split(':').map(Number);
          const [bHour, bMin] = b.eta.split(':').map(Number);
          if (aHour !== bHour) return aHour - bHour;
          if (aMin !== bMin) return aMin - bMin;
        }
        // If only one has ETA, that one comes first
        if (a.eta && !b.eta) return -1;
        if (!a.eta && b.eta) return 1;
        
        // If no ETA difference, maintain roundOrderNumber order
        return 0;
      });
      
      // ✅ Rebuild the jobs list with notes in correct positions
      const sortedJobs: any[] = [];
      nonNoteJobs.forEach(job => {
        sortedJobs.push(job);
        // Add any notes that belong to this job
        const jobNotes = noteJobs.filter(note => (note as any).originalJobId === job.id);
        sortedJobs.push(...jobNotes);
      });
      
      // Add any orphaned notes at the end
      const orphanedNotes = noteJobs.filter(note => 
        !nonNoteJobs.some(job => job.id === (note as any).originalJobId)
      );
      sortedJobs.push(...orphanedNotes);
      
      // Replace the block's jobs with the sorted list
      block.jobs = sortedJobs;
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
        return matches;
      });
    
    // First, sort non-note jobs by roundOrderNumber only (NOT by ETA)
    // ETA sorting will happen within each vehicle in allocateJobsForDay
    const nonNoteJobs = jobsForDay
      .filter(job => !isNoteJob(job))
      .sort((a: any, b: any) => {
        // Sort by roundOrderNumber only
        return (a.client?.roundOrderNumber ?? 999999) - (b.client?.roundOrderNumber ?? 999999);
      });
    
    // Group note jobs by their originalJobId
    const notesByJobId: Record<string, any[]> = {};
    jobsForDay
      .filter(job => isNoteJob(job))
      .forEach(note => {
        const jobId = (note as any).originalJobId || 'orphaned';
        if (!notesByJobId[jobId]) notesByJobId[jobId] = [];
        notesByJobId[jobId].push(note);
      });
    
    // Sort notes for each job by createdAt
    Object.keys(notesByJobId).forEach(jobId => {
      notesByJobId[jobId].sort((a, b) => ((a as any).createdAt || 0) - ((b as any).createdAt || 0));
    });
    
    // Build final sorted list: insert notes after their original jobs
    const sortedJobsWithNotes: any[] = [];
    nonNoteJobs.forEach(job => {
      sortedJobsWithNotes.push(job);
      const jobNotes = notesByJobId[job.id] || [];
      sortedJobsWithNotes.push(...jobNotes);
      delete notesByJobId[job.id]; // Remove to track orphaned
    });
    
    // Add any orphaned notes at the end (notes whose original job is not in this day)
    const orphanedNotes = Object.values(notesByJobId).flat();
    if (orphanedNotes.length > 0) {
      console.warn('Found orphaned notes:', orphanedNotes);
      sortedJobsWithNotes.push(...orphanedNotes);
    }
    
    if (jobsForDay.length > 0) {
      console.log(`📅 ${day}: ${jobsForDay.length} jobs`);
    }
    
    const allocated = allocateJobsForDay(dayDate, sortedJobsWithNotes);
    return {
      title: day,
      data: allocated,
      dayDate,
    };
  });

  useEffect(() => {
    // Drop selections that are no longer present or movable
    setSelectedJobIds(prev => prev.filter(id => {
      const job = jobs.find(j => j.id === id);
      return job && isSelectableJob(job);
    }));
  }, [jobs]);

  const handleComplete = async (jobId: string, isCompleted: boolean, section?: any) => {
    setLoading(true);
    
    // Calculate completion sequence if marking as complete
    let completionSeq: number | undefined;
    if (!isCompleted) {
      try {
        // Count jobs completed today WITHIN THIS VEHICLE BLOCK
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find this job's vehicle block boundaries
        const data = section?.data || [];
        const jobIndex = data.findIndex((d: any) => d && d.id === jobId);

        if (jobIndex >= 0) {
          let vehicleStartIndex = 0;
          for (let i = jobIndex - 1; i >= 0; i--) {
            const prevItem = data[i];
            if (prevItem && (prevItem as any).__type === 'vehicle') {
              vehicleStartIndex = i + 1;
              break;
            }
          }
          let vehicleEndIndex = data.length;
          for (let i = jobIndex + 1; i < data.length; i++) {
            const nextItem = data[i];
            if (nextItem && (nextItem as any).__type === 'vehicle') {
              vehicleEndIndex = i;
              break;
            }
          }

          // Get jobs within this vehicle block
          const vehicleJobs = data.slice(vehicleStartIndex, vehicleEndIndex)
            .filter((x: any) => x && !(x as any).__type && !isNoteJob(x) && !isQuoteJob(x));

          // Count completed jobs only within this vehicle for today
          const vehicleCompletedToday = vehicleJobs.filter(job => {
            if (job.status !== 'completed') return false;
            const jDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
            return jDate && jDate.toDateString() === today.toDateString();
          }).length;

          completionSeq = vehicleCompletedToday + 1;
        } else {
          // Fallback: count all jobs completed today (original logic)
          const todayCompletedCount = jobs.filter(j => {
            if (j.status !== 'completed') return false;
            const jDate = j.scheduledTime ? parseISO(j.scheduledTime) : null;
            return jDate && jDate.toDateString() === today.toDateString();
          }).length;
          completionSeq = todayCompletedCount + 1;
        }
      } catch (error) {
        console.error('Error calculating completion sequence:', error);
        // Fallback to original global counting
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCompletedCount = jobs.filter(j => {
          if (j.status !== 'completed') return false;
          const jDate = j.scheduledTime ? parseISO(j.scheduledTime) : null;
          return jDate && jDate.toDateString() === today.toDateString();
        }).length;
        completionSeq = todayCompletedCount + 1;
      }
    }
    
    await updateJobStatus(jobId, isCompleted ? 'pending' : 'completed', completionSeq);
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { 
          ...job, 
          status: isCompleted ? 'pending' : 'completed',
          completionSequence: !isCompleted ? completionSeq : undefined,
          completedAt: !isCompleted ? new Date().toISOString() : undefined
        } : job
      )
    );
    setLoading(false);

    // 🔍 Audit log for marking job complete
    if (!isCompleted) {
      // Try to include the client address in the log description for clarity
      const completedJob = jobs.find(j => j.id === jobId);
      const jobAddress = completedJob && completedJob.client
        ? `${completedJob.client.address1}, ${completedJob.client.town}, ${completedJob.client.postcode}`
        : undefined;

      await logAction(
        'job_completed',
        'job',
        jobId,
        formatAuditDescription('job_completed', jobAddress)
      );

      // Record completion sequence and detect out-of-order within the current vehicle block (for today only)
      try {
        // Resolve job and section for context
        const job = jobs.find(j => j.id === jobId);
        if (!job) return;
        const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (!jobDate || jobDate.toDateString() !== today.toDateString()) return; // only track for today
        if (!section) return; // need section data to establish per-vehicle order
        
        // Update local completion map to match database value
        if (completionSeq) {
          setCompletionMap(prev => ({ ...prev, [jobId]: completionSeq }));
        }
        
        // Find vehicle block bounds
        const data = section.data || [];
        const jobIndex = data.findIndex((d: any) => d && d.id === jobId);
        if (jobIndex < 0) return;
        let vehicleStartIndex = 0;
        for (let i = jobIndex - 1; i >= 0; i--) {
          const prevItem = data[i];
          if (prevItem && (prevItem as any).__type === 'vehicle') {
            vehicleStartIndex = i + 1;
            break;
          }
        }
        let vehicleEndIndex = data.length;
        for (let i = jobIndex + 1; i < data.length; i++) {
          const nextItem = data[i];
          if (nextItem && (nextItem as any).__type === 'vehicle') {
            vehicleEndIndex = i;
            break;
          }
        }
        // Build the current vehicle's display order: filter to real jobs (exclude vehicle headers, notes, quotes)
        const vehicleJobs = data.slice(vehicleStartIndex, vehicleEndIndex)
          .filter((x: any) => x && !(x as any).__type && !isNoteJob(x) && !isQuoteJob(x));
        
        // Sort vehicle jobs by round order to get the intended completion order
        const vehicleJobsByRoundOrder = [...vehicleJobs].sort((a: any, b: any) => {
          const aRoundOrder = a.client?.roundOrderNumber || 999999;
          const bRoundOrder = b.client?.roundOrderNumber || 999999;
          return aRoundOrder - bRoundOrder;
        });
        
        // Get this job's intended position (based on round order)
        const intendedPosition = vehicleJobsByRoundOrder.findIndex((x: any) => x.id === jobId) + 1;
        
        // If completed out of intended order, create swap proposal
        try {
          if (completionSeq && completionSeq !== intendedPosition) {
            // Find the job that should have been completed at this sequence
            const shouldHaveBeenJob = vehicleJobsByRoundOrder[completionSeq - 1];
            if (shouldHaveBeenJob && shouldHaveBeenJob.id !== jobId) {
              const dayTitle = section.title;

              // TEMPORARILY USING LOCAL STATE - Firestore causing white screen
              setSwapProposalsByDay(prev => {
                const existing = prev[dayTitle] || [];
                // Avoid duplicates
                const exists = existing.some(p =>
                  (p.jobId === jobId && p.swapWithJobId === shouldHaveBeenJob.id) ||
                  (p.jobId === shouldHaveBeenJob.id && p.swapWithJobId === jobId)
                );
                if (exists) return prev;
                return { ...prev, [dayTitle]: [...existing, { jobId, swapWithJobId: shouldHaveBeenJob.id }] };
              });
            }
          }
        } catch (error) {
          console.error('Error detecting out-of-order completion:', error);
        }
      } catch (e) {
        console.warn('Completion order tracking failed:', e);
      }
    }

    /* auto prompt removed */
  };

  const handleDeferJob = (job: Job & { client: Client | null }) => {
    setDeferJob(job);
    setDeferSelectedVehicle(job.vehicleId || 'auto'); // Initialize with current vehicle or 'auto'
    setShowDeferDatePicker(true);
  };

  const buildMoveUpdateData = async (
    job: Job & { client: Client | null },
    targetDate: Date,
    vehicleChoice?: string,
  ) => {
    const normalizedDate = new Date(targetDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const updateData: any = {
      scheduledTime: format(normalizedDate, 'yyyy-MM-dd') + 'T09:00:00',
    };

    const currentJobDate = parseISO(job.scheduledTime);
    const currentWeekStart = startOfWeek(currentJobDate, { weekStartsOn: 1 });
    const newWeekStart = startOfWeek(normalizedDate, { weekStartsOn: 1 });
    const isDifferentWeek = currentWeekStart.getTime() !== newWeekStart.getTime();

    if (isDifferentWeek) {
      let originalTimeToStore = job.originalScheduledTime;
      if (!originalTimeToStore) {
        try {
          const { getServicePlansForClient } = await import('../../services/servicePlanService');
          const plans = await getServicePlansForClient(job.clientId);
          const matchingPlan = plans.find(p => p.serviceType === job.serviceId && p.isActive);
          if (matchingPlan?.startDate) {
            originalTimeToStore = matchingPlan.startDate + 'T09:00:00';
          } else {
            // Fallback to current scheduledTime
            originalTimeToStore = job.scheduledTime;
          }
        } catch (error) {
          console.error('Error fetching service plan for original date:', error);
          originalTimeToStore = job.scheduledTime;
        }
      }

      updateData.originalScheduledTime = originalTimeToStore;
      updateData.isDeferred = true;
    }

    if (vehicleChoice !== undefined) {
      updateData.vehicleId = vehicleChoice === 'auto' ? null : vehicleChoice;
    }

    return updateData;
  };

  const handleDeferToNextWeek = async (job: Job & { client: Client | null }) => {
    try {
      // Calculate next Monday
      const currentJobDate = parseISO(job.scheduledTime);
      const nextWeekStart = startOfWeek(addDays(currentJobDate, 7), { weekStartsOn: 1 }); // Monday of next week
      const nextMondayString = format(nextWeekStart, 'yyyy-MM-dd') + 'T09:00:00';
      
      // If job doesn't have originalScheduledTime, calculate it from service plan
      let originalTimeToStore = job.originalScheduledTime;
      if (!originalTimeToStore) {
        try {
          // Fetch service plans for this client to get the canonical anchor
          const { getServicePlansForClient } = await import('../../services/servicePlanService');
          const plans = await getServicePlansForClient(job.clientId);
          const matchingPlan = plans.find(p => p.serviceType === job.serviceId && p.isActive);
          if (matchingPlan?.startDate) {
            originalTimeToStore = matchingPlan.startDate + 'T09:00:00';
          } else {
            // Fallback to current scheduledTime
            originalTimeToStore = job.scheduledTime;
          }
        } catch (error) {
          console.error('Error fetching service plan for original date:', error);
          originalTimeToStore = job.scheduledTime;
        }
      }
      
      // Update the job with deferred flag and new date
      const jobRef = doc(db, 'jobs', job.id);
      await updateDoc(jobRef, {
        scheduledTime: nextMondayString,
        originalScheduledTime: originalTimeToStore,
        isDeferred: true,
        vehicleId: null, // Reset to automatic allocation
        eta: null // Clear any existing ETA
      });
      
      // Log the action
      await logAction(
        'defer' as any,
        'job' as any,
        job.id,
        `Job deferred from ${format(currentJobDate, 'EEEE, MMMM d')} to ${format(nextWeekStart, 'EEEE, MMMM d')}`,
        job.client?.name
      );
      
      // Update local state to reflect the change immediately
      setJobs(prevJobs => prevJobs.filter(j => j.id !== job.id));
      
      // Get jobs for the target week to trigger redistribution
      const weekEndDate = endOfWeek(nextWeekStart, { weekStartsOn: 1 });
      const startDate = format(nextWeekStart, 'yyyy-MM-dd');
      const endDate = format(weekEndDate, 'yyyy-MM-dd');
      
      // Trigger capacity redistribution for the target week
      const { redistributeJobsForWeek } = await import('../../services/capacityService');
      const jobsForTargetWeek = await getJobsForWeek(startDate, endDate);
      
      // Fetch client data for redistribution
      const clientIds = [...new Set(jobsForTargetWeek.map(j => j.clientId))];
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
      
      const jobsWithClients = jobsForTargetWeek.map(j => ({
        ...j,
        client: clientsMap.get(j.clientId) || null,
      }));
      
      // Perform redistribution with deferred jobs prioritized
      const result = await redistributeJobsForWeek(
        nextWeekStart,
        jobsWithClients,
        memberMap,
        rotaMap,
        false // Don't skip current week since we're targeting next week
      );
      
      Alert.alert(
        'Job Deferred',
        `Job has been rolled over to ${format(nextWeekStart, 'EEEE, MMMM d')} and marked with priority.${
          result.redistributedJobs > 0 ? `\n\n${result.redistributedJobs} jobs were rescheduled to maintain capacity limits.` : ''
        }`
      );
      
      setActionSheetJob(null); // Close the action sheet if open
      
    } catch (error) {
      console.error('Error deferring job:', error);
      Alert.alert('Error', 'Failed to defer job. Please try again.');
    }
  };

  const handleDeferDateChange = async (event: any, selectedDate?: Date) => {
    setShowDeferDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate || !deferJob) {
      setDeferJob(null);
      setDeferSelectedVehicle('auto');
      return;
    }
    // Prevent deferring to past dates
    const today = startOfToday();
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    
    // Check if the selected date is in the past
    if (selected < today) {
      Alert.alert('Cannot Move to Past Date', 'You cannot move jobs to a date that has already passed.');
      setDeferJob(null);
      setDeferSelectedVehicle('auto');
      return;
    }
    
    // Prevent deferring to today if today is marked as complete
    const isToday = selected.toDateString() === today.toDateString();
    const todaySection = sections.find(s => s.dayDate.toDateString() === today.toDateString());
    const todayIsCompleted = todaySection && completedDays.includes(todaySection.title);
    if (isToday && todayIsCompleted) {
      Alert.alert('Cannot Move to Today', 'Today is marked as complete. You cannot move jobs to today.');
      setDeferJob(null);
      setDeferSelectedVehicle('auto');
      return;
    }
    const updateData = await buildMoveUpdateData(deferJob, selectedDate, deferSelectedVehicle);

    await updateDoc(doc(db, 'jobs', deferJob.id), updateData);
    setJobs(prevJobs => prevJobs.map(j =>
      j.id === deferJob.id ? { ...j, ...updateData } : j
    ));
    setDeferJob(null);
    setDeferSelectedVehicle('auto');
    Alert.alert('Success', 'Job moved to selected date' + (deferSelectedVehicle !== 'auto' ? ' and assigned to vehicle' : ''));
  };

  const toggleMultiSelectMode = () => {
    setMultiSelectMode(prev => {
      if (prev) {
        setSelectedJobIds([]);
        setShowBulkMovePicker(false);
      }
      return !prev;
    });
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds(prev => {
      const job = jobs.find(j => j.id === jobId);
      if (!job || !isSelectableJob(job)) return prev;
      return prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId];
    });
  };

  const openBulkMovePicker = () => {
    if (!selectedJobIds.length) {
      if (Platform.OS === 'web') {
        window.alert('Select at least one job to move.');
      } else {
        Alert.alert('No jobs selected', 'Select at least one job to move.');
      }
      return;
    }

    const firstJob = jobs.find(j => selectedJobIds.includes(j.id));
    const baseDate = firstJob?.scheduledTime ? new Date(firstJob.scheduledTime) : startOfToday();
    setBulkMoveDate(baseDate);
    setBulkMoveVehicle(firstJob?.vehicleId || 'auto');
    setShowBulkMovePicker(true);
  };

  const handleBulkMoveJobs = async () => {
    const targetDate = new Date(bulkMoveDate);
    targetDate.setHours(0, 0, 0, 0);
    const today = startOfToday();

    if (targetDate < today) {
      if (Platform.OS === 'web') {
        window.alert('You cannot move jobs to a past date.');
      } else {
        Alert.alert('Cannot Move to Past Date', 'You cannot move jobs to a date that has already passed.');
      }
      return;
    }

    const isToday = targetDate.toDateString() === today.toDateString();
    const todaySection = sections.find(s => s.dayDate.toDateString() === today.toDateString());
    const todayIsCompleted = todaySection && completedDays.includes(todaySection.title);
    if (isToday && todayIsCompleted) {
      if (Platform.OS === 'web') {
        window.alert('Today is marked as complete. You cannot move jobs to today.');
      } else {
        Alert.alert('Cannot Move to Today', 'Today is marked as complete. You cannot move jobs to today.');
      }
      return;
    }

    const jobsToMove = jobs.filter(job => selectedJobIds.includes(job.id) && isSelectableJob(job));
    if (!jobsToMove.length) {
      if (Platform.OS === 'web') {
        window.alert('No eligible jobs selected to move.');
      } else {
        Alert.alert('No eligible jobs', 'No eligible jobs selected to move.');
      }
      setShowBulkMovePicker(false);
      return;
    }

    setBulkMoveLoading(true);

    try {
      const updates: Array<{ jobId: string; updateData: any }> = [];
      for (const job of jobsToMove) {
        const updateData = await buildMoveUpdateData(job, targetDate, bulkMoveVehicle);
        updates.push({ jobId: job.id, updateData });
      }

      const batch = writeBatch(db);
      updates.forEach(({ jobId, updateData }) => {
        batch.update(doc(db, 'jobs', jobId), updateData);
      });
      await batch.commit();

      setJobs(prev => prev.map(job => {
        const match = updates.find(u => u.jobId === job.id);
        return match ? { ...job, ...match.updateData } : job;
      }));

      setShowBulkMovePicker(false);
      setBulkMoveLoading(false);
      setSelectedJobIds([]);
      setMultiSelectMode(false);

      const successMessage = `${updates.length} job${updates.length === 1 ? '' : 's'} moved to ${format(targetDate, 'EEEE, MMMM d')}.`;
      if (Platform.OS === 'web') {
        window.alert(successMessage);
      } else {
        Alert.alert('Jobs moved', successMessage);
      }
      setBulkMoveVehicle('auto');
    } catch (error) {
      console.error('Error moving selected jobs:', error);
      setBulkMoveLoading(false);
      if (Platform.OS === 'web') {
        window.alert('Failed to move selected jobs. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to move selected jobs. Please try again.');
      }
    }
  };

  const handleJobPress = (job: any) => {
    if (isQuoteJob(job)) {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Message ETA', 'Navigate', 'View Details', 'Add note below', 'Delete', 'Cancel'],
            destructiveButtonIndex: 4,
            cancelButtonIndex: 5,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) handleMessageETA(job);
            if (buttonIndex === 1) handleNavigate(job.client);
            if (buttonIndex === 2) job.quoteId ? router.push({ pathname: '/quotes/[id]', params: { id: job.quoteId } } as any) : router.replace('/');
            if (buttonIndex === 3) handleAddNoteBelow(job);
            if (buttonIndex === 4) handleDeleteQuoteJob(job);
          }
        );
      } else {
        setActionSheetJob(job);
      }
      return;
    }
    if (Platform.OS === 'ios') {
      // Build options dynamically based on job status
      const options = ['View details?', 'Edit Price'];
      let deferIndex = -1;
      let addNoteIndex = -1;
      let deleteIndex = -1;
      
      // Add Defer option if job is not completed
      if (job.status !== 'completed' && job.status !== 'accounted' && job.status !== 'paid') {
        options.push('Defer');
        deferIndex = options.length - 1;
      }
      
      options.push('Add note below');
      addNoteIndex = options.length - 1;
      
      options.push('Delete Job');
      deleteIndex = options.length - 1;
      
      options.push('Cancel');
      const cancelIndex = options.length - 1;
      
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: options,
          destructiveButtonIndex: deleteIndex,
          cancelButtonIndex: cancelIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) handleViewDetails(job.client);
          if (buttonIndex === 1) handleEditPrice(job);
          if (buttonIndex === deferIndex) handleDeferToNextWeek(job);
          if (buttonIndex === addNoteIndex) handleAddNoteBelow(job);
          if (buttonIndex === deleteIndex) handleDeleteJob(job.id);
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

  // Helper function to convert service IDs to user-friendly display text
  const getServiceTypeDisplay = (serviceId: string): string => {
    const serviceMap: Record<string, string> = {
      'window-cleaning': 'Window cleaning',
      'Gutter cleaning': 'Gutter cleaning',
      'Conservatory roof': 'Conservatory roof cleaning',
      'Soffit and fascias': 'Soffit and fascias cleaning',
      'One-off window cleaning': 'One-off window cleaning',
    };
    
    return serviceMap[serviceId] || serviceId; // Return custom service names as-is
  };

  const handleMessageETA = (job: (Job & { client: Client | null })) => {
    let mobileNumber: string | null = null;
    let name: string = '';
    let address: string = '';
    
    if (isQuoteJob(job)) {
      // For quote jobs, use the quote's number, name, and address
      mobileNumber = (job as any).number;
      name = (job as any).name;
      address = (job as any).address || '';
    } else {
      // For regular jobs, use the client's mobile number, name, and address
      mobileNumber = job.client?.mobileNumber || null;
      name = job.client?.name || '';
      address = job.client?.address1 || job.client?.address || '';
    }
    
    if (!mobileNumber) {
      Alert.alert('No mobile number', 'No mobile number available for this job.');
      return;
    }
    
    const { eta: jobEta } = job;
    const etaText = jobEta 
      ? `Roughly estimated time of arrival:\n${jobEta}` 
      : 'We will be with you as soon as possible tomorrow.';

    // Build dynamic sign-off
    const signOffParts = ['Many thanks.', userProfile?.name, userProfile?.businessName, userProfile?.businessWebsite].filter(Boolean);
    const signOff = signOffParts.join('\n');

    let template: string;
    
    if (isQuoteJob(job)) {
      // Quote job template
      template = `Hello ${name},

Courtesy message to let you know we'll be over to quote tomorrow at ${address}.
${etaText}
if you can't be home and access is available around the property, we will leave you a written quote.

${signOff}`;
    } else {
      // Service job template
      const serviceType = getServiceTypeDisplay(job.serviceId || 'Window cleaning');
      template = `Hello ${name},

Courtesy message to let you know ${serviceType} is due tomorrow at ${address}.
${etaText}

${signOff}`;
    }

    let smsUrl = '';
    if (Platform.OS === 'ios') {
      smsUrl = `sms:${mobileNumber}&body=${encodeURIComponent(template)}`;
    } else {
      smsUrl = `smsto:${mobileNumber}?body=${encodeURIComponent(template)}`;
    }
    Linking.openURL(smsUrl);
    setActionSheetJob(null);
  };

  const handleSendAccountSummary = async (job: (Job & { client: Client | null })) => {
    const client = job.client;
    
    if (!client) {
      Alert.alert('No client', 'No client information available for this job.');
      return;
    }
    
    const mobileNumber = client.mobileNumber;
    if (!mobileNumber) {
      Alert.alert('No mobile number', 'No mobile number available for this client.');
      return;
    }

    try {
      const ownerId = await getDataOwnerId();
      
      // Fetch completed jobs for this client
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', client.id),
        where('status', '==', 'completed')
      );
      const jobsSnapshot = await getDocs(jobsQuery);
      const completedJobs = jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Job[];

      // Fetch payments for this client
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', client.id)
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Payment[];

      // Calculate totals
      const totalBilled = completedJobs.reduce((sum, j) => sum + j.price, 0);
      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const startingBalance = typeof client.startingBalance === 'number' ? client.startingBalance : 0;
      const balance = totalPaid - totalBilled + startingBalance;

      // Build the message
      const name = client.name || 'Customer';
      
      // Format balance text
      const balanceText = balance < 0 
        ? `Outstanding Balance: £${Math.abs(balance).toFixed(2)}`
        : balance > 0 
          ? `Credit Balance: £${balance.toFixed(2)}`
          : 'Account Balance: £0.00';

      // Build service summary
      const serviceLines = completedJobs.length > 0
        ? `Services Provided: ${completedJobs.length} job${completedJobs.length !== 1 ? 's' : ''}\nTotal Billed: £${totalBilled.toFixed(2)}`
        : 'Services Provided: None';

      // Build payment summary
      const paymentLines = payments.length > 0
        ? `Payments Received: ${payments.length} payment${payments.length !== 1 ? 's' : ''}\nTotal Paid: £${totalPaid.toFixed(2)}`
        : 'Payments Received: None';

      // Build banking info section
      let bankingInfo = '';
      if (balance < 0 && userProfile) {
        const bankParts = [];
        if (userProfile.businessName) bankParts.push(`Account Name: ${userProfile.businessName}`);
        if (userProfile.bankSortCode) bankParts.push(`Sort Code: ${userProfile.bankSortCode}`);
        if (userProfile.bankAccountNumber) bankParts.push(`Account No: ${userProfile.bankAccountNumber}`);
        bankParts.push(`Amount Due: £${Math.abs(balance).toFixed(2)}`);
        if (client.accountNumber) bankParts.push(`Reference: ${displayAccountNumber(client.accountNumber)}`);
        
        if (bankParts.length > 0) {
          bankingInfo = `\nPayment Details:\n${bankParts.join('\n')}`;
        }
      }

      // Build sign-off
      const signOffParts = ['Many thanks.', userProfile?.name, userProfile?.businessName].filter(Boolean);
      const signOff = signOffParts.join('\n');

      const template = `Hi, ${name}

Below is an account summary.

${balanceText}

${serviceLines}

${paymentLines}${bankingInfo}

${signOff}`;

      let smsUrl = '';
      if (Platform.OS === 'ios') {
        smsUrl = `sms:${mobileNumber}&body=${encodeURIComponent(template)}`;
      } else {
        smsUrl = `smsto:${mobileNumber}?body=${encodeURIComponent(template)}`;
      }
      Linking.openURL(smsUrl);
      setActionSheetJob(null);
      
    } catch (error) {
      console.error('Error fetching account data:', error);
      Alert.alert('Error', 'Failed to fetch account information. Please try again.');
    }
  };

  const handleDeleteJob = (jobId: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to permanently delete this job?')) {
        deleteDoc(doc(db, 'jobs', jobId)).then(async () => {
          setJobs((prev) => prev.filter((job) => job.id !== jobId));
          setActionSheetJob(null);

          // 🔍 Audit log for job deletion (web)
          await logAction(
            'job_deleted',
            'job',
            jobId,
            formatAuditDescription('job_deleted')
          );
        });
      }
    } else {
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

              // 🔍 Audit log for job deletion (mobile)
              await logAction(
                'job_deleted',
                'job',
                jobId,
                formatAuditDescription('job_deleted')
              );
            },
          },
        ]
      );
    }
  };

  // Delete logic for quote jobs (removes both job and associated quote)
  const handleDeleteQuoteJob = async (job: any) => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to remove this quote job from the runsheet? The quote will remain available in the quotes screen.')) {
        // Only delete the job document, preserve the quote document
        await deleteDoc(doc(db, 'jobs', job.id));
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
        setActionSheetJob(null);
      }
    } else {
      Alert.alert(
        'Remove Quote Job',
        'Are you sure you want to remove this quote job from the runsheet? The quote will remain available in the quotes screen.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              // Only delete the job document, preserve the quote document
              await deleteDoc(doc(db, 'jobs', job.id));
              setJobs((prev) => prev.filter((j) => j.id !== job.id));
              setActionSheetJob(null);
            },
          },
        ]
      );
    }
  };

  // Add handler to open quote details modal for progressing to pending
  const handleProgressToPending = async (job: any) => {
    if (!('quoteId' in job) || !job.quoteId) return;
    // Fetch the latest quote data
    const quoteDoc = await getDoc(doc(db, 'quotes', job.quoteId));
    if (!quoteDoc.exists()) return;
    const quote = quoteDoc.data();
    const lines = Array.isArray(quote.lines) && quote.lines.length > 0
      ? quote.lines
      : [{ serviceType: '', frequency: '4 weekly', value: '', notes: '' }];
    setQuoteLines(lines);
    setQuoteData(quote); // Store full quote data
    setQuoteDetails({ frequency: '', value: '', notes: quote.notes || '', quoteId: (job as any).quoteId });
    setShowQuoteDetailsModal(true);
    setActionSheetJob(null);
  };

  const handleAddNoteBelow = (job: Job & { client: Client | null }) => {
    setAddNoteForJob(job);
    setAddNoteText('');
    setAddNoteModalVisible(true);
    setActionSheetJob(null);
  };

  const handleEditPrice = (job: Job & { client: Client | null }) => {
    setPriceEditJob(job);
    setPriceEditValue(job.price?.toString() || '0');
    setPriceEditModalVisible(true);
    setActionSheetJob(null);
  };

  const handleSavePriceEdit = async () => {
    if (!priceEditJob || !priceEditValue.trim()) {
      Alert.alert('Error', 'Please enter a valid price.');
      return;
    }

    const newPrice = parseFloat(priceEditValue);
    if (isNaN(newPrice) || newPrice < 0) {
      Alert.alert('Error', 'Please enter a valid positive number.');
      return;
    }

    try {
      // Update job in Firestore with new price and mark it as having custom price
      const jobRef = doc(db, 'jobs', priceEditJob.id);
      await updateDoc(jobRef, { 
        price: newPrice,
        hasCustomPrice: true 
      });

      // 🔍 Audit log for price change
      await logAction(
        'job_price_changed',
        'job',
        priceEditJob.id,
        formatAuditDescription('job_price_changed', `${newPrice.toFixed(2)}`)
      );

      // Update local state
      setJobs(prevJobs =>
        prevJobs.map(job =>
          job.id === priceEditJob.id 
            ? { ...job, price: newPrice, hasCustomPrice: true } as Job & { client: Client | null }
            : job
        )
      );

      setPriceEditModalVisible(false);
      setPriceEditJob(null);
      setPriceEditValue('');
      
      if (Platform.OS === 'web') {
        window.alert('Price updated successfully!');
      } else {
        Alert.alert('Success', 'Price updated successfully!');
      }
    } catch (error) {
      console.error('Error updating job price:', error);
      Alert.alert('Error', 'Failed to update price. Please try again.');
    }
  };

  const handleSaveNote = async () => {
    if (!addNoteText.trim() || !addNoteForJob) {
      Alert.alert('Error', 'Please enter a note.');
      return;
    }

    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        Alert.alert('Error', 'Authentication error.');
        return;
      }

      // Create the note job with a special structure
      const noteJobData = {
        ownerId,
        clientId: 'NOTE_JOB', // Special clientId for note jobs
        serviceId: 'note',
        propertyDetails: addNoteText.trim(),
        scheduledTime: addNoteForJob.scheduledTime, // Same date as the original job
        status: 'pending',
        price: 0,
        paymentStatus: 'paid', // Note jobs don't need payment
        noteText: addNoteText.trim(),
        originalJobId: addNoteForJob.id, // Reference to the job it was added below
        isNoteJob: true, // Flag to easily identify note jobs
        createdAt: Date.now(), // Timestamp for sorting
      };

      // Create the note in Firestore and capture the real ID
      const docRef = await addDoc(collection(db, 'jobs'), noteJobData);
      const realJobId = docRef.id; // ✅ Capture real Firestore ID

      // 🔍 Audit log for note addition
      await logAction(
        'runsheet_note_added',
        'job',
        realJobId,
        formatAuditDescription('runsheet_note_added', addNoteText.trim())
      );
      
      // Add the note job to the current jobs list immediately with real ID
      const noteJobWithClient = {
        ...noteJobData,
        id: realJobId, // ✅ Use real ID instead of temporary ID
        client: null
      };
      
      // Simply insert the note right after the job the user clicked on
      setJobs(prevJobs => {
        const originalJobIndex = prevJobs.findIndex(job => job.id === addNoteForJob.id);
        if (originalJobIndex !== -1) {
          // Insert the note right after the original job
          const newJobs = [...prevJobs];
          newJobs.splice(originalJobIndex + 1, 0, noteJobWithClient as any);
          return newJobs;
        } else {
          // Fallback: add at end if original job not found
          return [...prevJobs, noteJobWithClient as any];
        }
      });
      
      setAddNoteModalVisible(false);
      setAddNoteText('');
      setAddNoteForJob(null);
      
    } catch (error) {
      console.error('Error saving note:', error);
      Alert.alert('Error', 'Failed to save note.');
    }
  };

  const handleNotePress = (noteJob: Job & { client: Client | null }) => {
    setNoteToDelete(noteJob);
    setDeleteNoteModalVisible(true);
  };

  const handleDeleteNote = async () => {
    if (!noteToDelete) return;

    try {
      // Delete the note job from Firestore
      await deleteDoc(doc(db, 'jobs', noteToDelete.id));
      
      // Remove the note job from local state
      setJobs(prevJobs => prevJobs.filter(job => job.id !== noteToDelete.id));
      
      setDeleteNoteModalVisible(false);
      setNoteToDelete(null);
      
      Alert.alert('Success', 'Note deleted successfully.');
    } catch (error) {
      console.error('Error deleting note:', error);
      Alert.alert('Error', 'Failed to delete note.');
    }
  };

  const handleDDClick = (job: Job & { client: Client | null }) => {
    console.log('🔵 DD badge clicked for job:', job.id, job.client?.name);
    
    // Check if job is GoCardless enabled (fall back to client settings if job doesn't have them)
    const isGoCardlessEnabled = job.gocardlessEnabled ?? job.client?.gocardlessEnabled ?? false;
    const gocardlessCustomerId = job.gocardlessCustomerId ?? job.client?.gocardlessCustomerId;
    
    console.log('🔍 GoCardless check:', {
      jobGocardlessEnabled: job.gocardlessEnabled,
      clientGocardlessEnabled: job.client?.gocardlessEnabled,
      finalGocardlessEnabled: isGoCardlessEnabled,
      jobGocardlessCustomerId: job.gocardlessCustomerId,
      clientGocardlessCustomerId: job.client?.gocardlessCustomerId,
      finalGocardlessCustomerId: gocardlessCustomerId
    });
    
    if (!isGoCardlessEnabled || !gocardlessCustomerId) {
      console.log('❌ Job not GoCardless enabled:', { 
        isGoCardlessEnabled, 
        gocardlessCustomerId 
      });
      Alert.alert(
        'Direct Debit Not Available',
        'This client is not set up for direct debit payments.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    console.log('✅ Opening GoCardless payment modal for job:', job.id);
    setGocardlessPaymentModal({ visible: true, job });
  };

  const toggleDay = (title: string) => {
    setCollapsedDays((prev) =>
      prev.includes(title) ? prev.filter((d) => d !== title) : [...prev, title]
    );
  };

  const toggleVehicle = (vehicleId: string) => {
    setCollapsedVehicles((prev) =>
      prev.includes(vehicleId) ? prev.filter((v) => v !== vehicleId) : [...prev, vehicleId]
    );
  };

  const isDayComplete = (dayTitle: string) => {
    const dayIndex = daysOfWeek.indexOf(dayTitle);
    if (dayIndex === -1) return false;
    const dayDate = addDays(weekStart, dayIndex);
    const jobsForDay = jobs.filter((job) => {
      const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
      return jobDate && jobDate.toDateString() === dayDate.toDateString() && !isNoteJob(job) && !isQuoteJob(job);
    });
    
    // Debug logging
    console.log(`isDayComplete check for ${dayTitle}:`, {
      totalJobsForDay: jobs.filter((job) => {
        const jobDate = job.scheduledTime ? parseISO(job.scheduledTime) : null;
        return jobDate && jobDate.toDateString() === dayDate.toDateString();
      }).length,
      nonQuoteJobsForDay: jobsForDay.length,
      completedJobs: jobsForDay.filter(job => job.status === 'completed').length,
      allCompleted: jobsForDay.length > 0 && jobsForDay.every((job) => job.status === 'completed')
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
    if (!isOwner) {
      Alert.alert('Permission denied', 'Only the account owner can mark a day complete.');
      return;
    }
    // Only include real jobs (exclude vehicle blocks, note jobs, quote jobs, or any without an id)
    const dayJobs = (sections.find(section => section.title === dayTitle)?.data || []).filter(job => job && job.id && !(job as any).__type && !isNoteJob(job) && !isQuoteJob(job));
    
    // Debug logging
    console.log(`handleDayComplete for ${dayTitle}:`, {
      totalSectionData: (sections.find(section => section.title === dayTitle)?.data || []).length,
      filteredDayJobs: dayJobs.length,
      dayJobIds: dayJobs.map(job => ({ id: job.id, serviceId: job.serviceId, status: job.status }))
    });
    
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
        updatedAt: new Date(),
        accountId: ownerId,  // Add accountId for Firestore rules
        ownerId: ownerId     // Add ownerId for backward compatibility
      });

      // Process GoCardless payments for completed jobs (non-blocking UI)
      setSummaryProcessing(true);
      setSummaryDayTitle(dayTitle);
      
      // Populate swap choices from the proposals detected during job completion
      const proposals = swapProposalsByDay[dayTitle] || [];
      setSummarySwapChoices(proposals.map(p => ({ ...p, selected: false })));
      
      setSummaryVisible(true);
      // Defer heavy processing to next tick to avoid UI jank/modal delay
      setTimeout(async () => {
        try {
          await processGoCardlessPayments(dayJobs, dayTitle);
        } finally {
          const totalValue = dayJobs.reduce((sum, j) => sum + (j.price || 0), 0);
          const ddJobs = dayJobs.filter(j => {
            const enabled = (j as any).gocardlessEnabled ?? (j as any).client?.gocardlessEnabled ?? false;
            const customerId = (j as any).gocardlessCustomerId ?? (j as any).client?.gocardlessCustomerId;
            return !!enabled && !!customerId;
          });
          setSummaryTotal(totalValue);
          setSummaryDDJobs(ddJobs as any);
          setSummaryProcessing(false);
        }
      }, 0);
    } catch (error) {
      console.error('Error completing day:', error);
      Alert.alert('Error', 'Failed to complete day. Please try again.');
    }
  };

  /**
   * Process GoCardless payments for completed jobs
   */
  const processGoCardlessPayments = async (dayJobs: any[], dayTitle: string) => {
    try {
      // Check if GoCardless is configured
      const isConfigured = await GoCardlessService.isConfigured();
      if (!isConfigured) {
        console.log('GoCardless not configured, skipping payment processing');
        return;
      }

      // Get GoCardless API token
      const apiToken = await GoCardlessService.getUserApiToken();
      if (!apiToken) {
        console.log('No GoCardless API token found, skipping payment processing');
        // Check if any jobs are GoCardless enabled to inform user
        const hasGoCardlessJobs = dayJobs.some(job => job.gocardlessEnabled);
        if (hasGoCardlessJobs) {
          Alert.alert(
            'GoCardless Not Configured',
            'Some jobs are marked for direct debit but GoCardless is not configured. Please set up your GoCardless API token in Settings to enable automatic payment processing.',
            [{ text: 'OK' }]
          );
        }
        return;
      }

      // Group jobs by client for GoCardless API calls (use job OR client settings)
      const gocardlessJobsByClient = new Map<string, Array<{ price: number; gocardlessCustomerId: string }>>();
      
      dayJobs.forEach(job => {
        const enabled = (job as any).gocardlessEnabled ?? (job as any).client?.gocardlessEnabled ?? false;
        const customerId = (job as any).gocardlessCustomerId ?? (job as any).client?.gocardlessCustomerId;
        if (enabled && customerId) {
          if (!gocardlessJobsByClient.has(job.clientId)) {
            gocardlessJobsByClient.set(job.clientId, []);
          }
          gocardlessJobsByClient.get(job.clientId)!.push({
            price: job.price,
            gocardlessCustomerId: customerId
          });
        }
      });

      if (gocardlessJobsByClient.size > 0) {
        // Use Cloud Function to avoid CORS on web
        const functions = getFunctions(getApp());
        const createGoCardlessPayment = httpsCallable(functions, 'createGoCardlessPayment');
        const completionDate = format(new Date(), 'yyyy-MM-dd');
        const apiErrors: string[] = [];
        let apiPaymentsCreated = 0;
        const failedPayments: Array<{ clientId: string; error: string }> = [];

        for (const [clientId, jobs] of gocardlessJobsByClient) {
          try {
            const totalAmount = jobs.reduce((sum, j) => sum + (j.price || 0), 0);
            const firstJob = jobs[0];
            const serviceDate = format(new Date(), 'ddMMyyyy');
            const description = `Window cleaning ${serviceDate}`;

            const payload = {
              amount: totalAmount,
              currency: 'GBP',
              customerId: firstJob.gocardlessCustomerId,
              description,
              reference: `DD-${completionDate}-${clientId}`
            } as any;

            const result: any = await createGoCardlessPayment(payload);
            if (result?.data?.success) {
              apiPaymentsCreated++;
            } else {
              throw new Error(result?.data?.message || 'Unknown error');
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Failed to create GoCardless payment for client', clientId, msg);
            apiErrors.push(msg);
            failedPayments.push({ clientId, error: msg });
          }
        }

        // Mirror to local payments
        let localPaymentsCreated = 0;
        if (apiPaymentsCreated > 0) {
          const paymentResult = await createGoCardlessPaymentsForDay(dayJobs, completionDate);
          localPaymentsCreated = paymentResult.paymentsCreated;
          await logAction(
            'gocardless_payments_processed',
            'payment',
            'batch',
            formatAuditDescription('gocardless_payments_processed', `${apiPaymentsCreated} direct debit(s) raised for ${dayTitle}`)
          );
        }

        if (failedPayments.length > 0) {
          for (const failedPayment of failedPayments) {
            await logAction(
              'gocardless_payments_processed',
              'payment',
              'failed',
              formatAuditDescription('gocardless_payments_processed', `Failed to create direct debit for client ${failedPayment.clientId}: ${failedPayment.error}`)
            );
          }
        }

        if (apiErrors.length > 0) {
          const msg = `Some direct debit payments failed to initiate (created: ${apiPaymentsCreated}). Errors: \n- ${apiErrors.join('\n- ')}`;
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert('GoCardless Payment Issues', msg);
          }
        }
      } else {
        console.log('No GoCardless payments to process');
      }

    } catch (error) {
      console.error('Error processing GoCardless payments:', error);
      // Don't fail the day completion if GoCardless processing fails
      Alert.alert('Success', `${dayJobs.length} jobs marked as completed for ${dayTitle}\n\nNote: GoCardless payment processing failed`);
    }
  };

  const handleResetDay = async (dayTitle: string) => {
    const dayIndex = daysOfWeek.indexOf(dayTitle);
    if (dayIndex === -1) return;
    
    const dayDate = addDays(weekStart, dayIndex);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if day is in the past or completed
    const dayIsCompleted = completedDays.includes(dayTitle);
    const dayIsPast = isBefore(dayDate, startOfToday());
    
    if (dayIsCompleted || dayIsPast) {
      if (Platform.OS === 'web') {
        window.alert('Cannot reset completed or past days.');
      } else {
        Alert.alert('Cannot Reset', 'Cannot reset completed or past days.');
      }
      return;
    }
    
    // Confirmation dialog
    const confirmReset = Platform.OS === 'web' 
      ? window.confirm(`Reset ${dayTitle} to round order? This will remove all manual ETAs and vehicle assignments.`)
      : await new Promise((resolve) => {
          Alert.alert(
            'Reset Day',
            `Reset ${dayTitle} to round order? This will remove all manual ETAs and vehicle assignments.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Reset', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });
    
    if (!confirmReset) return;
    
    setResettingDay(dayTitle);
    
    try {
      const result = await resetDayToRoundOrder(dayDate);
      
      if (result.success) {
        // Refresh the jobs data to show the reset state
        const startDate = format(weekStart, 'yyyy-MM-dd');
        const endDate = format(weekEnd, 'yyyy-MM-dd');
        const jobsForWeek = await getJobsForWeek(startDate, endDate);
        
        if (jobsForWeek.length > 0) {
          // Re-fetch client data and update state
          const clientIds = [...new Set(jobsForWeek.map(job => job.clientId))];
          const clientChunks = [];
          for (let i = 0; i < clientIds.length; i += 30) {
            clientChunks.push(clientIds.slice(i, i + 30));
          }
          
          const clientsMap = new Map<string, Client>();
          for (const chunk of clientChunks) {
            const validClientIds = chunk.filter(id => id && id !== 'NOTE_JOB' && id !== 'QUOTE_JOB');
            if (validClientIds.length > 0) {
              const clientsRef = collection(db, 'clients');
              const clientsQuery = query(clientsRef, where('__name__', 'in', validClientIds));
              const clientsSnapshot = await getDocs(clientsQuery);
              clientsSnapshot.docs.forEach(doc => {
                clientsMap.set(doc.id, { id: doc.id, ...doc.data() } as Client);
              });
            }
          }
          
          const jobsWithClients = jobsForWeek.map(job => ({
            ...job,
            client: job.clientId ? clientsMap.get(job.clientId) || null : null,
          }));
          
          // Update completion map from database
          const updatedCompletionMap: Record<string, number> = {};
          jobsWithClients.forEach(job => {
            if (job.status === 'completed' && (job as any).completionSequence) {
              updatedCompletionMap[job.id] = (job as any).completionSequence;
            }
          });
          setCompletionMap(updatedCompletionMap);
          
          setJobs(jobsWithClients);
        }
        
        const message = result.jobsReset > 0 
          ? `Successfully reset ${result.jobsReset} job${result.jobsReset !== 1 ? 's' : ''} on ${dayTitle} to round order.`
          : `No jobs needed resetting on ${dayTitle}.`;
          
        if (Platform.OS === 'web') {
          window.alert(message);
        } else {
          Alert.alert('Reset Complete', message);
        }
      } else {
        if (Platform.OS === 'web') {
          window.alert(`Failed to reset day: ${result.error || 'Unknown error'}`);
        } else {
          Alert.alert('Reset Failed', result.error || 'Unknown error occurred');
        }
      }
    } catch (error) {
      console.error('Error resetting day:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to reset day. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to reset day. Please try again.');
      }
    } finally {
      setResettingDay(null);
    }
  };

  const renderItem = ({ item, index, section }: any) => {
    if (isQuoteJob(item)) {
      // Only show complete for first incomplete quote job on today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const jobDate = item.scheduledTime ? parseISO(item.scheduledTime) : null;
      const isToday = jobDate && jobDate.toDateString() === today.toDateString();
      const isFutureDay = jobDate && jobDate > today;
      const sectionIndex = sections.findIndex(s => s.title === section.title);
      const firstIncompleteIndex = section.data.findIndex((job: any) => (job as any).__type !== 'vehicle' && !isNoteJob(job) && !isQuoteJob(job) && job.status !== 'completed');
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
            <Pressable onPress={() => showPickerForJob(item, section, index)} style={styles.etaButton}>
              <Text style={styles.etaButtonText}>{item.eta || 'ETA'}</Text>
            </Pressable>
            {isCurrentWeek && isToday && index === firstIncompleteIndex && !item.status && !isDayCompleted && (
              <Pressable onPress={() => setQuoteCompleteModal({ job: item, visible: true })} style={styles.completeButton}>
                <Text style={styles.completeButtonText}>Complete?</Text>
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
    }

    if (isNoteJob(item)) {
      return (
        <View style={[styles.clientRow, { backgroundColor: '#fff8e1' }]}> {/* yellow highlight for notes */}
          <View style={{ flex: 1 }}>
            <Pressable onPress={() => handleNotePress(item)}>
              <View style={styles.addressBlock}>
                <Text style={styles.addressTitle}>📝 Note</Text>
              </View>
              <View style={{ backgroundColor: '#ffcc02', padding: 4, borderRadius: 6, marginBottom: 4 }}>
                <Text style={{ color: '#000', fontWeight: 'bold' }}>Note</Text>
              </View>
              <Text style={styles.clientName}>{(item as any).noteText || item.propertyDetails}</Text>
            </Pressable>
          </View>
          {/* Note jobs don't have any controls */}
        </View>
      );
    }

    if ((item as any).__type === 'vehicle') {
      const isCollapsed = collapsedVehicles.includes(item.id);
      
      return (
        <View style={{ paddingVertical: 4, backgroundColor: '#F0F0F0', flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => toggleVehicle(item.id)} style={{ marginRight: 8 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{isCollapsed ? '+' : '-'}</Text>
          </Pressable>
          <Text style={{ fontWeight: 'bold', flex: 1 }}>{item.name}</Text>
        </View>
      );
    }
    const sectionIndex = sections.findIndex(s => s.title === section.title);
    const isCompleted = item.status === 'completed';
    const isDayCompleted = completedDays.includes(section.title);
    const client: any = item.client;
    const selectionEnabled = multiSelectMode && isSelectableJob(item);
    const isSelected = selectedJobIds.includes(item.id);
    
    // Calculate the job's position based on round order within today's jobs
    // This number should stay with the job even if it's reordered by ETA

    // Find which vehicle this job belongs to by looking backwards for the most recent vehicle header
    let vehicleStartIndex = 0;
    for (let i = index - 1; i >= 0; i--) {
      const prevItem = section.data[i];
      if (prevItem && (prevItem as any).__type === 'vehicle') {
        vehicleStartIndex = i + 1; // Jobs start after the vehicle header
        break;
      }
    }

    // Find the next vehicle header (or end of section) to determine vehicle end
    let vehicleEndIndex = section.data.length;
    for (let i = index + 1; i < section.data.length; i++) {
      const nextItem = section.data[i];
      if (nextItem && (nextItem as any).__type === 'vehicle') {
        vehicleEndIndex = i;
        break;
      }
    }

    // Get only the jobs within this vehicle block
    const vehicleJobs = section.data.slice(vehicleStartIndex, vehicleEndIndex).filter((job: any) =>
      job && !(job as any).__type && !isNoteJob(job) && !isQuoteJob(job)
    );

    // Sort vehicle jobs by their client's round order to get the intended position within this vehicle
    const vehicleJobsByRoundOrder = [...vehicleJobs].sort((a: any, b: any) => {
      const aRoundOrder = a.client?.roundOrderNumber || 999999;
      const bRoundOrder = b.client?.roundOrderNumber || 999999;
      return aRoundOrder - bRoundOrder;
    });

    // Find this job's position in the vehicle-specific round-order-sorted list (1-based)
    const dayJobPosition = vehicleJobsByRoundOrder.findIndex((j: any) => j.id === item.id) + 1;
    
    // Find the first incomplete job within this vehicle's section only
    const firstIncompleteIndexInVehicle = section.data.slice(vehicleStartIndex, vehicleEndIndex)
      .findIndex((job: any) => (job as any).__type !== 'vehicle' && !isNoteJob(job) && !isQuoteJob(job) && job.status !== 'completed');
    const firstIncompleteIndex = firstIncompleteIndexInVehicle >= 0 ? vehicleStartIndex + firstIncompleteIndexInVehicle : -1;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = item.scheduledTime ? parseISO(item.scheduledTime) : null;
    // Determine if this job is for today
    const isToday = jobDate && jobDate.toDateString() === today.toDateString();
    const isFutureDay = jobDate && jobDate > today;
    // Allow completing any job for today within this vehicle (quotes are handled separately)
    const showCompleteButton = isCurrentWeek && isToday && !isCompleted && !isDayCompleted;
    const showUndoButton = isCurrentWeek && isCompleted && isToday && !isDayCompleted;
    // Define predefined service types
    const predefinedOneOffServices = ['Gutter cleaning', 'Conservatory roof', 'Soffit and fascias', 'One-off window cleaning', 'Other'];
    const predefinedAdditionalServices: string[] = []; // Add any predefined additional services here if needed
    
    const isOneOffJob = predefinedOneOffServices.includes(item.serviceId);
    // Treat custom job types (not in any predefined list and not window-cleaning) as one-off jobs
    const isCustomJobType = item.serviceId && 
                           item.serviceId !== 'window-cleaning' && 
                           !predefinedOneOffServices.includes(item.serviceId) &&
                           !predefinedAdditionalServices.includes(item.serviceId);
    const isAdditionalService = predefinedAdditionalServices.includes(item.serviceId);
    
    // Combine one-off jobs and custom job types for styling
    const shouldUseOneOffStyling = isOneOffJob || isCustomJobType;
    const isDeferred = item.isDeferred === true;

    const addressParts = client ? [client.address1 || client.address, client.town, client.postcode].filter(Boolean) : [];
    const address = client ? addressParts.join(', ') : 'Unknown address';

    // Get client balance for the £ button color
    const clientBalance = client ? clientBalances[client.id] : undefined;
    const hasOutstandingBalance = clientBalance !== undefined && clientBalance < 0;

    return (
      <View style={[
        styles.clientRow,
        isCompleted && styles.completedRow,
        isDeferred && !isCompleted && styles.deferredRow,
        shouldUseOneOffStyling && !isCompleted && !isDeferred && styles.oneOffJobRow,
        isAdditionalService && !isCompleted && !isDeferred && styles.additionalServiceRow,
        selectionEnabled && isSelected && styles.selectedJobRow
      ]}>
        <View style={{ flex: 1 }}>
          {/* Quick Action Buttons */}
          <View style={styles.quickActionsRow}>
            {selectionEnabled && (
              <Pressable
                style={[styles.selectionToggle, isSelected && styles.selectionToggleActive]}
                onPress={() => toggleJobSelection(item.id)}
                accessibilityLabel={isSelected ? 'Deselect job' : 'Select job'}
              >
                <Text style={[styles.selectionToggleText, isSelected && styles.selectionToggleTextActive]}>
                  {isSelected ? '✓' : '○'}
                </Text>
              </Pressable>
            )}
            <Pressable 
              style={styles.quickActionBtn}
              onPress={() => handleNavigate(client)}
            >
              <Text style={styles.quickActionText}>Nav</Text>
            </Pressable>
            <Pressable 
              style={styles.quickActionBtn}
              onPress={() => handleMessageETA(item)}
            >
              <Text style={styles.quickActionText}>ETA</Text>
            </Pressable>
            <Pressable 
              style={[
                styles.quickActionBtn,
                hasOutstandingBalance ? styles.quickActionBtnRed : styles.quickActionBtnGreen
              ]}
              onPress={() => handleSendAccountSummary(item)}
            >
              <Text style={[
                styles.quickActionText,
                hasOutstandingBalance ? styles.quickActionTextLight : styles.quickActionTextLight
              ]}>£</Text>
            </Pressable>
            <Pressable 
              style={styles.quickActionBtn}
              onPress={() => handleJobPress(item)}
            >
              <Text style={styles.quickActionText}>+</Text>
            </Pressable>
          </View>
          
          <Pressable onPress={() => selectionEnabled ? toggleJobSelection(item.id) : handleJobPress(item)}>
            <View style={[styles.addressBlock, isDeferred && !isCompleted && styles.deferredAddressBlock]}>
              <View style={styles.addressBlockContent}>
                {/* Day position badge - shows job's order in today's runsheet */}
                {dayJobPosition > 0 && (
                  <View style={styles.roundOrderBadge}>
                    <Text style={styles.roundOrderText}>{dayJobPosition}</Text>
                  </View>
                )}
                <Text style={[styles.addressTitle, { flex: 1 }]}>{address}</Text>
                {/* Completion sequence badge - only show if completed and we have the sequence */}
                {isCompleted && ((item as any).completionSequence || completionMap[item.id]) && (
                  <View style={[
                    styles.completionBadge,
                    ((item as any).completionSequence || completionMap[item.id]) !== dayJobPosition && styles.completionBadgeWarning
                  ]}>
                    <Text style={styles.completionText}>→{(item as any).completionSequence || completionMap[item.id]}</Text>
                  </View>
                )}
              </View>
            </View>
            {selectionEnabled && (
              <View style={[styles.selectionTag, isSelected && styles.selectionTagActive]}>
                <Text style={[styles.selectionTagText, isSelected && styles.selectionTagTextActive]}>
                  {isSelected ? 'Selected' : 'Tap to select'}
                </Text>
              </View>
            )}
            {isDeferred && !isCompleted && (
              <View style={styles.deferredLabel}>
                <Text style={styles.deferredLabelText}>ROLLOVER</Text>
              </View>
            )}
            {shouldUseOneOffStyling && !isDeferred && (
              <View style={styles.oneOffJobLabel}>
                <Text style={styles.oneOffJobText}>{item.serviceId}</Text>
              </View>
            )}
            {isAdditionalService && !isDeferred && (
              <View style={styles.additionalServiceLabel}>
                <Text style={styles.additionalServiceText}>{item.serviceId}</Text>
              </View>
            )}
            <Text style={styles.clientName}>
              {client?.name}
              {typeof item.price === 'number' ? ` — £${item.price.toFixed(2)}` : ''}
              {(item as any).hasCustomPrice && ' ✏️'}
            </Text>
            {/* Display job notes if they exist and are not just address information */}
            {item.propertyDetails && item.propertyDetails.trim() !== '' && (() => {
              // Check if propertyDetails is just address information (auto-generated)
              if (client) {
                const expectedAddress = `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`;
                const isAddressInfo = item.propertyDetails.trim() === expectedAddress.trim();
                
                // Only display as notes if it's NOT address information
                if (!isAddressInfo) {
                  return <Text style={styles.jobNotes}>📝 {item.propertyDetails}</Text>;
                }
              } else {
                // For jobs without clients (like quotes), show propertyDetails as notes
                return <Text style={styles.jobNotes}>📝 {item.propertyDetails}</Text>;
              }
              return null;
            })()}
            {client?.accountNumber !== undefined && (
              <View style={styles.accountNumberContainer}>
                {(() => {
                  const accountDisplay = getJobAccountDisplay(item, client);
                  if (accountDisplay.isGoCardless && accountDisplay.style) {
                    return (
                      <Text style={styles.accountNumberText}>{accountDisplay.text}</Text>
                    );
                  } else {
                    return (
                      <Text style={styles.accountNumberText}>{accountDisplay.text}</Text>
                    );
                  }
                })()}
              </View>
            )}
          </Pressable>
          {/* DD Badge - Outside the main Pressable */}
          {client?.accountNumber !== undefined && (() => {
            const accountDisplay = getJobAccountDisplay(item, client);
            if (accountDisplay.isGoCardless && accountDisplay.style) {
              return (
                <Pressable
                  style={[styles.ddBadge, { backgroundColor: accountDisplay.style.backgroundColor }]}
                  onPress={() => handleDDClick(item)}
                >
                  <Text style={[styles.ddText, { color: accountDisplay.style.color }]}>
                    {accountDisplay.text}
                  </Text>
                </Pressable>
              );
            }
            return null;
          })()}
        </View>
        {/* Notes button */}
        {(client?.runsheetNotes || client?.notes) && (client.runsheetNotes || client.notes || '').trim() !== '' && (
          <Pressable
            style={styles.notesButton}
            onPress={() => {
              setNoteModalText(client.runsheetNotes || client.notes || '');
              setNoteModalVisible(true);
            }}
            accessibilityLabel="Show client notes"
          >
            <Text style={styles.notesButtonIcon}>!</Text>
          </Pressable>
        )}
        <View style={styles.controlsContainer}>
          <Pressable onPress={() => showPickerForJob(item, section, index)} style={styles.etaButton}>
            <Text style={styles.etaButtonText}>{item.eta || 'ETA'}</Text>
          </Pressable>
            {showCompleteButton && (
            <Pressable onPress={() => handleComplete(item.id, isCompleted, section)} style={styles.completeButton}>
              <Text style={styles.completeButtonText}>Complete?</Text>
            </Pressable>
          )}
          {showUndoButton && (
            <Pressable onPress={() => handleComplete(item.id, isCompleted, section)} style={styles.completeButton}>
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
          <View style={styles.headerButtons}>
            <Pressable style={styles.homeButton} onPress={() => router.replace('/')}> 
              <Text style={styles.homeButtonText}>🏠</Text>
            </Pressable>
            <Pressable
              style={[styles.multiSelectButton, multiSelectMode && styles.multiSelectButtonActive]}
              onPress={toggleMultiSelectMode}
            >
              <Text style={styles.multiSelectButtonText}>Select multiple</Text>
              {selectedJobIds.length > 0 && (
                <View style={styles.selectionCountBadge}>
                  <Text style={styles.selectionCountText}>{selectedJobIds.length}</Text>
                </View>
              )}
            </Pressable>
            {multiSelectMode && (
              <Pressable
                style={[
                  styles.moveJobsButton,
                  (!selectedJobIds.length || bulkMoveLoading) && styles.moveJobsButtonDisabled
                ]}
                onPress={openBulkMovePicker}
                disabled={!selectedJobIds.length || bulkMoveLoading}
              >
                <Text style={styles.moveJobsButtonText}>{bulkMoveLoading ? 'Moving...' : 'Move jobs'}</Text>
              </Pressable>
            )}
          </View>
        </View>
        {multiSelectMode && (
          <View style={styles.selectionNotice}>
            <Text style={styles.selectionNoticeText}>
              {selectedJobIds.length
                ? `${selectedJobIds.length} job${selectedJobIds.length === 1 ? '' : 's'} selected`
                : 'Tap jobs to select them.'}
            </Text>
          </View>
        )}
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index, section }) => {
              // Don't render anything if the day is collapsed
              if (collapsedDays.includes(section.title)) return null;
              
              // Don't render jobs that belong to collapsed vehicles
              if (!(item as any).__type) {
                // Find the vehicle this job belongs to by looking backwards for the most recent vehicle block
                let vehicleId = null;
                for (let i = index - 1; i >= 0; i--) {
                  const prevItem = section.data[i];
                  if (prevItem && (prevItem as any).__type === 'vehicle') {
                    vehicleId = prevItem.id;
                    break;
                  }
                }
                // If this job belongs to a collapsed vehicle, don't render it
                if (vehicleId && collapsedVehicles.includes(vehicleId)) {
                  return null;
                }
              }
              
              return renderItem({ item, index, section });
            }}
            renderSectionHeader={({ section: { title, data } }) => {
              const dayIsPast = isDayInPast(title);
              const dayIsCompleted = completedDays.includes(title);
              const showDayCompleteButton = isOwner && isDayComplete(title) && !dayIsCompleted && !dayIsPast;

              // Debug logging
              console.log(`Section header for ${title}:`, {
                dayIsPast,
                dayIsCompleted,
                isDayComplete: isDayComplete(title),
                showDayCompleteButton,
                totalJobs: data.filter(item => !item.__type).length
              });

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
                  {!dayIsCompleted && !dayIsPast && (
                    Platform.OS === 'web'
                      ? (
                          <button
                            style={{
                              backgroundColor: '#FF9500',
                              borderRadius: 6,
                              padding: '4px 8px',
                              color: '#fff',
                              fontWeight: 'bold',
                              border: 'none',
                              cursor: 'pointer',
                              marginLeft: 8,
                              opacity: resettingDay === title ? 0.5 : 1,
                            }}
                            onClick={() => handleResetDay(title)}
                            disabled={resettingDay === title}
                          >
                            {resettingDay === title ? '↻...' : '↻'}
                          </button>
                        )
                      : (
                          <Pressable
                            style={[styles.resetDayButton, resettingDay === title && styles.resetDayButtonDisabled]}
                            onPress={() => handleResetDay(title)}
                            disabled={resettingDay === title}
                          >
                            <Text style={styles.resetDayButtonText}>
                              {resettingDay === title ? '↻...' : '↻'}
                            </Text>
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
        {summaryVisible && (
          <Modal
            visible={summaryVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setSummaryVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>Day Complete Summary</Text>
                <Text style={styles.summaryTotal}>Total value: £{summaryTotal.toFixed(2)}</Text>
                {summaryProcessing && (
                  <Text style={styles.summaryLine}>Processing payments…</Text>
                )}
                {summaryDayTitle && !summaryProcessing && (swapProposalsByDay[summaryDayTitle]?.length || 0) > 0 && (
                  <>
                    <Text style={styles.summarySub}>Out-of-order jobs detected</Text>
                    <ScrollView style={{ maxHeight: 200, width: '100%', marginBottom: 8 }}>
                      {summarySwapChoices.map((p, idx) => {
                        const a = jobs.find(j => j.id === p.jobId);
                        const b = jobs.find(j => j.id === p.swapWithJobId);
                        const aName = a?.client?.name || 'Client A';
                        const bName = b?.client?.name || 'Client B';
                        return (
                          <Pressable key={idx} onPress={() => setSummarySwapChoices(prev => prev.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x))}>
                            <Text style={styles.summaryLine}>
                              [{p.selected ? '✓' : ' '}] Swap {aName} with {bName}?
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                )}
                {summaryProcessing ? (
                  <Text style={styles.summaryLine}>Looking up direct-debit jobs…</Text>
                ) : summaryDDJobs.length > 0 ? (
                  <>
                    <Text style={styles.summarySub}>Direct-Debit Jobs ({summaryDDJobs.length})</Text>
                    <ScrollView style={{ maxHeight: 200, width: '100%' }}>
                      {summaryDDJobs.map((job, idx) => (
                        <Text key={idx} style={styles.summaryLine}>
                          {(job.client?.name || 'Client')} — £{(job.price || 0).toFixed(2)}
                        </Text>
                      ))}
                    </ScrollView>
                  </>
                ) : (
                  <Text style={styles.summaryLine}>No direct-debit jobs today.</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable
                    style={[styles.summaryClose, { backgroundColor: '#2e7d32' }]}
                    onPress={async () => {
                      try {
                        // Apply selected swaps by updating client roundOrderNumber pairs
                        const selected = summarySwapChoices.filter(p => p.selected);
                        for (const p of selected) {
                          const jobA = jobs.find(j => j.id === p.jobId);
                          const jobB = jobs.find(j => j.id === p.swapWithJobId);
                          if (!jobA?.client || !jobB?.client) continue;
                          const newA = jobB.client.roundOrderNumber;
                          const newB = jobA.client.roundOrderNumber;
                          await Promise.all([
                            updateDoc(doc(db, 'clients', jobA.client.id), { roundOrderNumber: newA }),
                            updateDoc(doc(db, 'clients', jobB.client.id), { roundOrderNumber: newB }),
                          ]);
                          setJobs(prev => prev.map(j => {
                            if (j.id === jobA.id && j.client) return { ...j, client: { ...j.client, roundOrderNumber: newA } };
                            if (j.id === jobB.id && j.client) return { ...j, client: { ...j.client, roundOrderNumber: newB } };
                            return j;
                          }));
                        }
                      } catch (e) {
                        console.warn('Failed to apply swaps:', e);
                      } finally {
                        setSummaryVisible(false);
                        setSummarySwapChoices([]);
                        if (summaryDayTitle) {
                          // Clear swap proposals from local state
                          setSwapProposalsByDay(prev => ({ ...prev, [summaryDayTitle]: [] }));
                        }
                        setSummaryDayTitle(null);
                        // Clear completion tracking after finishing the day
                        setCompletionMap({});
                      }
                    }}
                  >
                    <Text style={styles.summaryCloseTxt}>Confirm</Text>
                  </Pressable>
                  <Pressable
                    style={styles.summaryClose}
                    onPress={() => {
                      setSummaryVisible(false);
                      setSummarySwapChoices([]);
                      if (summaryDayTitle) {
                        setSwapProposalsByDay(prev => ({ ...prev, [summaryDayTitle]: [] }));
                      }
                      setSummaryDayTitle(null);
                      // Clear completion tracking after finishing the day
                      setCompletionMap({});
                    }}
                  >
                    <Text style={styles.summaryCloseTxt}>Close</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
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
            previousJobEta={(timePickerJob as any).previousJobEta}
          />
        )}
        {actionSheetJob && (Platform.OS === 'android' || Platform.OS === 'web') && (
          <Modal
            visible={true}
            transparent
            animationType="fade"
            onRequestClose={() => setActionSheetJob(null)}
          >
            <View style={styles.androidSheetOverlay}>
              <Pressable 
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                onPress={() => setActionSheetJob(null)}
              />
              <View style={styles.androidSheet}>
                {isQuoteJob(actionSheetJob) ? (
                  <>
                    <Button title="Message ETA" onPress={() => handleMessageETA(actionSheetJob)} />
                    <Button title="Navigate" onPress={() => handleNavigate(actionSheetJob.client)} />
                    <Button title="View Details" onPress={() => (actionSheetJob as any).quoteId ? router.push({ pathname: '/quotes/[id]', params: { id: (actionSheetJob as any).quoteId } } as any) : router.replace('/')} />
                    <Button title="Progress to Pending" onPress={() => handleProgressToPending(actionSheetJob)} />
                    <Button title="Add note below" onPress={() => handleAddNoteBelow(actionSheetJob)} />
                    <Button title="Delete" color="red" onPress={() => handleDeleteQuoteJob(actionSheetJob)} />
                  </>
                ) : (
                  <>
                    <Button title="View details?" onPress={() => handleViewDetails(actionSheetJob.client)} />
                    <Button title="Edit Price" onPress={() => handleEditPrice(actionSheetJob)} />
                    {actionSheetJob.status !== 'completed' && actionSheetJob.status !== 'accounted' && actionSheetJob.status !== 'paid' && (
                      <Button title="Defer" onPress={() => handleDeferToNextWeek(actionSheetJob)} />
                    )}
                    <Button title="Add note below" onPress={() => handleAddNoteBelow(actionSheetJob)} />
                    <Button title="Delete Job" color="red" onPress={() => handleDeleteJob(actionSheetJob.id)} />
                  </>
                )}
              </View>
            </View>
          </Modal>
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
        
        {/* Add Note Modal */}
        <Modal
          visible={addNoteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAddNoteModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.addNoteModalContent}>
              <Text style={styles.addNoteModalTitle}>Add Note Below</Text>
              <TextInput
                style={styles.addNoteInput}
                placeholder="Enter your note here..."
                value={addNoteText}
                onChangeText={setAddNoteText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />
              <View style={styles.addNoteModalButtons}>
                <Pressable 
                  style={[styles.addNoteModalButton, styles.addNoteModalCancelButton]} 
                  onPress={() => setAddNoteModalVisible(false)}
                >
                  <Text style={styles.addNoteModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[styles.addNoteModalButton, styles.addNoteModalSaveButton]} 
                  onPress={handleSaveNote}
                >
                  <Text style={styles.addNoteModalSaveText}>Save Note</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Delete Note Modal */}
        <Modal
          visible={deleteNoteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDeleteNoteModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.addNoteModalContent}>
              <Text style={styles.addNoteModalTitle}>Delete Note</Text>
              <Text style={styles.deleteNoteText}>
                Are you sure you want to delete this note?
              </Text>
              <Text style={styles.deleteNotePreview}>
                "{(noteToDelete as any)?.noteText || noteToDelete?.propertyDetails || ''}"
              </Text>
              <View style={styles.addNoteModalButtons}>
                <Pressable 
                  style={[styles.addNoteModalButton, styles.addNoteModalCancelButton]} 
                  onPress={() => setDeleteNoteModalVisible(false)}
                >
                  <Text style={styles.addNoteModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[styles.addNoteModalButton, styles.deleteNoteButton]} 
                  onPress={handleDeleteNote}
                >
                  <Text style={styles.deleteNoteButtonText}>Delete Note</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        {showDeferDatePicker && deferJob && (
          Platform.OS === 'web' ? (
            <Modal
              visible={showDeferDatePicker}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setShowDeferDatePicker(false);
                setDeferJob(null);
                setDeferSelectedVehicle('auto');
              }}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.datePickerModal}>
                  <Text style={styles.datePickerTitle}>Move Job To:</Text>
                  
                  <input
                    type="date"
                    value={deferJob.scheduledTime ? format(new Date(deferJob.scheduledTime), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={e => {
                      const selectedDate = new Date(e.target.value + 'T00:00:00');
                      if (deferJob) {
                        setDeferJob({ ...deferJob, scheduledTime: format(selectedDate, 'yyyy-MM-dd') + 'T09:00:00' });
                      }
                    }}
                    style={{ 
                      padding: 10, 
                      fontSize: 16, 
                      borderRadius: 6, 
                      border: '1px solid #ccc',
                      marginBottom: 16,
                      width: '100%',
                    }}
                  />
                  
                  <View style={styles.vehiclePickerContainer}>
                    <Text style={styles.vehiclePickerLabel}>Assign to Vehicle:</Text>
                    <select
                      value={deferSelectedVehicle}
                      onChange={(e) => setDeferSelectedVehicle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 8,
                        fontSize: 16,
                        borderRadius: 6,
                        border: '1px solid #ccc',
                        backgroundColor: '#f9f9f9',
                      }}
                    >
                      <option value="auto">Automatic (Based on capacity)</option>
                      {vehicles.map(vehicle => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.name}
                        </option>
                      ))}
                    </select>
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    <Button
                      title="Move Job"
                      onPress={() => {
                        if (deferJob) {
                          const selectedDate = new Date(deferJob.scheduledTime);
                          handleDeferDateChange({ type: 'set' }, selectedDate);
                        }
                      }}
                    />
                    <Button
                      title="Cancel"
                      onPress={() => {
                        setShowDeferDatePicker(false);
                        setDeferJob(null);
                        setDeferSelectedVehicle('auto');
                      }}
                      color="red"
                    />
                  </View>
                </View>
              </View>
            </Modal>
          ) : (
            <Modal
              visible={showDeferDatePicker}
              transparent
              animationType="slide"
              onRequestClose={() => {
                setShowDeferDatePicker(false);
                setDeferJob(null);
                setDeferSelectedVehicle('auto');
              }}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.datePickerModal}>
                  <Text style={styles.datePickerTitle}>Move Job To:</Text>
                  
                  <DateTimePicker
                    value={deferJob.scheduledTime ? new Date(deferJob.scheduledTime) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={(event, date) => {
                      if (date && deferJob) {
                        setDeferJob({ ...deferJob, scheduledTime: format(date, 'yyyy-MM-dd') + 'T09:00:00' });
                      }
                    }}
                  />
                  
                  <View style={styles.vehiclePickerContainer}>
                    <Text style={styles.vehiclePickerLabel}>Assign to Vehicle:</Text>
                    <View style={styles.vehiclePicker}>
                      <RNPicker
                        selectedValue={deferSelectedVehicle}
                        onValueChange={setDeferSelectedVehicle}
                        style={{ height: Platform.OS === 'ios' ? 200 : 50 }}
                      >
                        <RNPicker.Item label="Automatic (Based on capacity)" value="auto" />
                        {vehicles.map(vehicle => (
                          <RNPicker.Item 
                            key={vehicle.id} 
                            label={vehicle.name} 
                            value={vehicle.id} 
                          />
                        ))}
                      </RNPicker>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    <Pressable
                      style={[styles.modalButton, styles.modalButtonPrimary]}
                      onPress={() => {
                        if (deferJob) {
                          const selectedDate = new Date(deferJob.scheduledTime);
                          handleDeferDateChange({ type: 'set' }, selectedDate);
                        }
                      }}
                    >
                      <Text style={styles.modalButtonPrimaryText}>Move Job</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalButtonSecondary]}
                      onPress={() => {
                        setShowDeferDatePicker(false);
                        setDeferJob(null);
                        setDeferSelectedVehicle('auto');
                      }}
                    >
                      <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          )
        )}
        {showBulkMovePicker && (
          Platform.OS === 'web' ? (
            <Modal
              visible={showBulkMovePicker}
              transparent
              animationType="fade"
              onRequestClose={() => setShowBulkMovePicker(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.datePickerModal}>
                  <Text style={styles.datePickerTitle}>Move selected jobs to:</Text>
                  <input
                    type="date"
                    value={format(bulkMoveDate, 'yyyy-MM-dd')}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={e => {
                      const nextDate = new Date(e.target.value + 'T00:00:00');
                      setBulkMoveDate(nextDate);
                    }}
                    style={{
                      padding: 10,
                      fontSize: 16,
                      borderRadius: 6,
                      border: '1px solid #ccc',
                      marginBottom: 16,
                      width: '100%',
                    }}
                  />
                  <View style={styles.vehiclePickerContainer}>
                    <Text style={styles.vehiclePickerLabel}>Assign to Vehicle:</Text>
                    <select
                      value={bulkMoveVehicle}
                      onChange={(e) => setBulkMoveVehicle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 8,
                        fontSize: 16,
                        borderRadius: 6,
                        border: '1px solid #ccc',
                        backgroundColor: '#f9f9f9',
                      }}
                    >
                      <option value="auto">Automatic (Based on capacity)</option>
                      {vehicles.map(vehicle => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.name}
                        </option>
                      ))}
                    </select>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    <Button
                      title={bulkMoveLoading ? 'Moving...' : 'Move jobs'}
                      onPress={handleBulkMoveJobs}
                      disabled={bulkMoveLoading}
                    />
                    <Button title="Cancel" onPress={() => setShowBulkMovePicker(false)} color="red" />
                  </View>
                </View>
              </View>
            </Modal>
          ) : (
            <Modal
              visible={showBulkMovePicker}
              transparent
              animationType="slide"
              onRequestClose={() => setShowBulkMovePicker(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.datePickerModal}>
                  <Text style={styles.datePickerTitle}>Move selected jobs to:</Text>
                  <DateTimePicker
                    value={bulkMoveDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={(event, date) => {
                      if (date) {
                        setBulkMoveDate(date);
                      }
                    }}
                  />
                  <View style={styles.vehiclePickerContainer}>
                    <Text style={styles.vehiclePickerLabel}>Assign to Vehicle:</Text>
                    <View style={styles.vehiclePicker}>
                      <RNPicker
                        selectedValue={bulkMoveVehicle}
                        onValueChange={setBulkMoveVehicle}
                        style={{ height: Platform.OS === 'ios' ? 200 : 50 }}
                      >
                        <RNPicker.Item label="Automatic (Based on capacity)" value="auto" />
                        {vehicles.map(vehicle => (
                          <RNPicker.Item 
                            key={vehicle.id} 
                            label={vehicle.name} 
                            value={vehicle.id} 
                          />
                        ))}
                      </RNPicker>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    <Pressable
                      style={[styles.modalButton, styles.modalButtonPrimary, bulkMoveLoading && styles.moveJobsButtonDisabled]}
                      onPress={handleBulkMoveJobs}
                      disabled={bulkMoveLoading}
                    >
                      <Text style={styles.modalButtonPrimaryText}>{bulkMoveLoading ? 'Moving...' : 'Move jobs'}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalButtonSecondary]}
                      onPress={() => setShowBulkMovePicker(false)}
                    >
                      <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          )
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
                // Check subscription limits before creating client
                try {
                  const clientLimitCheck = await checkClientLimit();
                  if (!clientLimitCheck.canAdd) {
                    const message = clientLimitCheck.limit 
                      ? `You've reached the limit of ${clientLimitCheck.limit} clients on your current plan. You currently have ${clientLimitCheck.currentCount} clients.\n\n🚀 Upgrade to Premium for:\n• Unlimited clients\n• Team member creation\n• Priority support\n\nOnly £18/month`
                      : 'Unable to add more clients at this time.';
                    
                    Alert.alert('🚫 Client Limit Reached', message);
                    return;
                  }
                } catch (error) {
                  console.error('Error checking client limit:', error);
                  Alert.alert('Error', 'Unable to verify subscription status. Please try again.');
                  return;
                }

                // Create client
                const { job } = quoteCompleteModal;
                const ownerId = await getDataOwnerId();
                if (!ownerId) {
                  Alert.alert('Error', 'Could not determine account owner. Please log in again.');
                  return;
                }
                const nextAcc = await getNextAccountNumber();
                const clientDoc = await addDoc(collection(db, 'clients'), {
                  name: job.name,
                  address: job.address,
                  mobileNumber: job.number,
                  startDate: job.scheduledTime,
                  frequency: quoteForm.frequency,
                  quote: Number(quoteForm.cost),
                  accountNumber: `RWC${nextAcc}`,
                  roundOrderNumber: Number(quoteForm.roundOrder),
                  ownerId,
                });
                // Remove quote and job
                await deleteDoc(doc(db, 'quotes', (job as any).quoteId));
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
            <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 12, width: 340, maxHeight: 600 }}>
              <ScrollView style={{ maxHeight: 450 }} contentContainerStyle={{ paddingBottom: 16 }}>
                <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Progress Quote to Pending</Text>
                
                {/* Display and edit quote notes */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Quote Notes:</Text>
                  <TextInput
                    placeholder="Add or edit quote notes..."
                    value={quoteDetails.notes}
                    onChangeText={v => setQuoteDetails(d => ({ ...d, notes: v }))}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      padding: 8, 
                      borderRadius: 6, 
                      backgroundColor: '#f0f8ff',
                      minHeight: 80
                    }}
                    multiline
                    numberOfLines={3}
                  />
                </View>
                
                {quoteLines.map((line, idx) => (
                  <View key={idx} style={{ marginBottom: 16, borderWidth: 1, borderColor: '#b0c4de', borderRadius: 10, padding: 12, backgroundColor: '#f8faff' }}>
                    <Text style={{ fontWeight: 'bold', marginBottom: 6 }}>Line {idx + 1}</Text>
                    <Text style={{ marginBottom: 2 }}>Service Type</Text>
                    <TextInput placeholder="e.g. Window Cleaning" value={line.serviceType} onChangeText={v => setQuoteLines(lines => lines.map((l, i) => i === idx ? { ...l, serviceType: v } : l))} style={{ borderWidth: 1, borderColor: '#ccc', marginBottom: 8, padding: 6, borderRadius: 6 }} />
                    <Text style={{ marginBottom: 2 }}>Frequency</Text>
                    <RNPicker
                      selectedValue={line.frequency}
                      onValueChange={(v: string) => setQuoteLines(lines => lines.map((l, i) => i === idx ? { ...l, frequency: v } : l))}
                      style={{ marginBottom: 8 }}
                    >
                      <RNPicker.Item label="4 weekly" value="4 weekly" />
                      <RNPicker.Item label="8 weekly" value="8 weekly" />
                      <RNPicker.Item label="12 weekly" value="12 weekly" />
                      <RNPicker.Item label="16 weekly" value="16 weekly" />
                      <RNPicker.Item label="24 weekly" value="24 weekly" />
                      <RNPicker.Item label="52 weekly" value="52 weekly" />
                      <RNPicker.Item label="one-off" value="one-off" />
                      <RNPicker.Item label="Other" value="other" />
                    </RNPicker>
                    {line.frequency === 'other' && (
                      <>
                        <Text style={{ marginBottom: 2 }}>Custom Frequency (weeks)</Text>
                        <TextInput 
                          placeholder="e.g. 6" 
                          value={line.customFrequency || ''} 
                          onChangeText={v => setQuoteLines(lines => lines.map((l, i) => i === idx ? { ...l, customFrequency: v } : l))} 
                          style={{ borderWidth: 1, borderColor: '#ccc', marginBottom: 8, padding: 6, borderRadius: 6 }} 
                          keyboardType="numeric" 
                        />
                      </>
                    )}
                    <Text style={{ marginBottom: 2 }}>Value (£)</Text>
                    <TextInput placeholder="e.g. 25" value={line.value} onChangeText={v => setQuoteLines(lines => lines.map((l, i) => i === idx ? { ...l, value: v } : l))} style={{ borderWidth: 1, borderColor: '#ccc', marginBottom: 8, padding: 6, borderRadius: 6 }} keyboardType="numeric" />
                    <Text style={{ marginBottom: 2 }}>Notes</Text>
                    <TextInput placeholder="Notes" value={line.notes} onChangeText={v => setQuoteLines(lines => lines.map((l, i) => i === idx ? { ...l, notes: v } : l))} style={{ borderWidth: 1, borderColor: '#ccc', marginBottom: 8, padding: 6, borderRadius: 6 }} multiline />
                    {quoteLines.length > 1 && (
                      <Button title="Remove Line" color="red" onPress={() => setQuoteLines(lines => lines.filter((_, i) => i !== idx))} />
                    )}
                  </View>
                ))}
                <View style={{ marginBottom: 16 }}>
                  <Button title="Add Another Line" onPress={() => setQuoteLines(lines => [...lines, { serviceType: '', frequency: '4 weekly', value: '', notes: '' }])} />
                </View>
              </ScrollView>
              <Button title="Save & Progress" onPress={async () => {
                try {
                  // Update quote status to pending
                  if (quoteLines.length > 0) {
                    await updateDoc(doc(db, 'quotes', quoteDetails.quoteId), {
                      lines: quoteLines,
                      notes: quoteDetails.notes,
                      status: 'pending',
                    });
                  } else {
                    await updateDoc(doc(db, 'quotes', quoteDetails.quoteId), {
                      frequency: quoteDetails.frequency,
                      value: quoteDetails.value,
                      notes: quoteDetails.notes,
                      status: 'pending',
                    });
                  }

                  // Log the quote progression action
                  if (quoteData) {
                    await logAction(
                      'quote_progressed',
                      'quote',
                      quoteDetails.quoteId,
                      formatAuditDescription('quote_progressed', `${quoteData.name} - ${quoteData.address}`)
                    );
                  }

                  // Remove the corresponding quote job from the runsheet
                  const quoteJob = jobs.find(job => job.serviceId === 'quote' && (job as any).quoteId === quoteDetails.quoteId);
                  if (quoteJob) {
                    await deleteDoc(doc(db, 'jobs', quoteJob.id));
                    setJobs(prev => prev.filter(job => job.id !== quoteJob.id));
                  }

                  setShowQuoteDetailsModal(false);
                  
                  if (Platform.OS === 'web') {
                    window.alert('Quote progressed to pending and removed from runsheet!');
                  } else {
                    Alert.alert('Success', 'Quote progressed to pending and removed from runsheet!');
                  }
                } catch (error) {
                  console.error('Error progressing quote to pending:', error);
                  if (Platform.OS === 'web') {
                    window.alert('Error progressing quote. Please try again.');
                  } else {
                    Alert.alert('Error', 'Failed to progress quote. Please try again.');
                  }
                }
              }} />
              <Button title="Cancel" onPress={() => setShowQuoteDetailsModal(false)} color="red" />
            </View>
          </View>
        </Modal>
        
        {/* Price Edit Modal */}
        <Modal
          visible={priceEditModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPriceEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.priceEditModalContent}>
              <Text style={styles.priceEditModalTitle}>Edit Job Price</Text>
              
              {priceEditJob && (
                <>
                  <Text style={styles.priceEditClientName}>
                    {priceEditJob.client?.name || 'Unknown Client'}
                  </Text>
                  <Text style={styles.priceEditOriginalPrice}>
                    Original price: £{priceEditJob.client?.quote?.toFixed(2) || '0.00'}
                  </Text>
                </>
              )}
              
              <View style={styles.priceEditInputContainer}>
                <Text style={styles.priceEditPoundSign}>£</Text>
                <TextInput
                  style={styles.priceEditInput}
                  placeholder="0.00"
                  value={priceEditValue}
                  onChangeText={setPriceEditValue}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>
              
              <View style={styles.priceEditModalButtons}>
                <Pressable 
                  style={[styles.priceEditModalButton, styles.priceEditModalCancelButton]} 
                  onPress={() => {
                    setPriceEditModalVisible(false);
                    setPriceEditJob(null);
                    setPriceEditValue('');
                  }}
                >
                  <Text style={styles.priceEditModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[styles.priceEditModalButton, styles.priceEditModalSaveButton]} 
                  onPress={handleSavePriceEdit}
                >
                  <Text style={styles.priceEditModalSaveText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* GoCardless Payment Modal */}
        <GoCardlessPaymentModal
          visible={gocardlessPaymentModal.visible}
          onClose={() => setGocardlessPaymentModal({ visible: false, job: null })}
          job={gocardlessPaymentModal.job}
          client={gocardlessPaymentModal.job?.client || null}
        />
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  multiSelectButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  multiSelectButtonActive: {
    backgroundColor: '#e6f0ff',
    borderColor: '#007AFF',
  },
  multiSelectButtonText: {
    fontWeight: '600',
    color: '#333',
  },
  selectionCountBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCountText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  moveJobsButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    borderWidth: 1,
    borderColor: '#005bb5',
  },
  moveJobsButtonDisabled: {
    opacity: 0.6,
  },
  moveJobsButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  selectionNotice: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e6f0ff',
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  selectionNoticeText: {
    color: '#0a3d91',
    fontWeight: '600',
  },
  capacityRefreshButton: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  capacityRefreshButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  capacityRefreshButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.7,
  },
  debugCapacityButton: {
    backgroundColor: '#4CAF50', // A green color for debugging
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  debugCapacityButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  debugCapacityButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.7,
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
  selectedJobRow: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  selectionToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionToggleActive: {
    borderColor: '#007AFF',
    backgroundColor: '#e6f0ff',
  },
  selectionToggleText: {
    fontWeight: '700',
    color: '#555',
  },
  selectionToggleTextActive: {
    color: '#0a3d91',
  },
  quickActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8e8e8',
    borderRadius: 6,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionBtnRed: {
    backgroundColor: '#f44336',
  },
  quickActionBtnGreen: {
    backgroundColor: '#4CAF50',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
  quickActionTextLight: {
    color: '#fff',
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
  selectionTag: {
    alignSelf: 'flex-start',
    marginTop: 6,
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f0f0f0',
  },
  selectionTagActive: {
    backgroundColor: '#e6f0ff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  selectionTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  selectionTagTextActive: {
    color: '#0a3d91',
  },
  addressBlockContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundOrderBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  roundOrderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  completionBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 32,
    alignItems: 'center',
  },
  completionBadgeWarning: {
    backgroundColor: 'rgba(255, 193, 7, 0.5)', // Amber color for out-of-order
  },
  completionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addressTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  clientName: { fontSize: 16 },
  clientAddress: { fontSize: 16 },
  jobNotes: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
    paddingHorizontal: 12,
  },
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
  additionalServiceRow: {
    backgroundColor: '#f0f8ff', // Light blue background for additional services
    borderColor: '#b0d4f1',
  },
  additionalServiceLabel: {
    backgroundColor: '#4a90e2',
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderBottomRightRadius: 10,
    marginBottom: 4,
  },
  additionalServiceText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deferredRow: {
    backgroundColor: '#ffe6e6', // Light red background for deferred jobs
    borderColor: '#ff9999',
    borderWidth: 2,
  },
  deferredAddressBlock: {
    backgroundColor: '#d32f2f', // Red background for deferred job address
    borderBottomColor: '#b71c1c',
  },
  deferredLabel: {
    backgroundColor: '#ff5252',
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderBottomRightRadius: 10,
    marginBottom: 4,
  },
  deferredLabelText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  completeButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  completeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  androidSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
  resetDayButton: {
    backgroundColor: '#FF9500',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  resetDayButtonDisabled: {
  backgroundColor: '#ccc',
  opacity: 0.7,
  },
  summaryBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 350,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  summarySub: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  summaryLine: {
    fontSize: 14,
    marginVertical: 2,
    alignSelf: 'flex-start',
  },
  summaryClose: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  summaryCloseTxt: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  resetDayButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  deferButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
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
    color: '#007AFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  accountNumberText: {
    fontSize: 14,
    color: '#666',
  },
  datePickerModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    minWidth: 300,
    maxWidth: 400,
    alignItems: 'stretch',
  },
  datePickerTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  vehiclePickerContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  vehiclePickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  vehiclePicker: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  vehiclePickerWeb: {
    height: 40,
    padding: 8,
    fontSize: 16,
  },
  addNoteModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    minWidth: 300,
    maxWidth: 400,
    alignItems: 'stretch',
  },
  addNoteModalTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  addNoteInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    marginBottom: 16,
  },
  addNoteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  addNoteModalButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  addNoteModalCancelButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  addNoteModalSaveButton: {
    backgroundColor: '#007AFF',
  },
  addNoteModalCancelText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  addNoteModalSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  deleteNoteText: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  deleteNotePreview: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 16,
    textAlign: 'center',
    color: '#666',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 6,
  },
  deleteNoteButton: {
    backgroundColor: '#ff3b30',
  },
  deleteNoteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  priceEditModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    minWidth: 300,
    maxWidth: 400,
    alignItems: 'stretch',
  },
  priceEditModalTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  priceEditClientName: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  priceEditOriginalPrice: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  priceEditInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  priceEditPoundSign: {
    fontSize: 16,
    marginRight: 8,
  },
  priceEditInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    width: 100,
  },
  priceEditModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  priceEditModalButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  priceEditModalCancelButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  priceEditModalSaveButton: {
    backgroundColor: '#007AFF',
  },
  priceEditModalCancelText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  priceEditModalSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  androidDateButton: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  androidDateButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  modalButtonSecondary: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  modalButtonPrimaryText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalButtonSecondaryText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  accountNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ddBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  ddText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
}); 