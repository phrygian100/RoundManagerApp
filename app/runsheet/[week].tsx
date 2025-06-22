import { Ionicons } from '@expo/vector-icons';
import { addDays, endOfWeek, format, isBefore, isThisWeek, parseISO, startOfToday, startOfWeek } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Button, Linking, Platform, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import TimePickerModal from '../../components/TimePickerModal';
import { db } from '../../core/firebase';
import type { Client } from '../../types/client';
import { getJobsForWeek, updateJobStatus } from '../services/jobService';
import type { Job } from '../types/models';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function RunsheetWeekScreen() {
  const { week } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<(Job & { client: Client | null })[]>([]);
  const [actionSheetJob, setActionSheetJob] = useState<Job & { client: Client | null } | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<string[]>([]);
  const [isCurrentWeek, setIsCurrentWeek] = useState(false);
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerJob, setTimePickerJob] = useState<(Job & { client: Client | null }) | null>(null);
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
        serviceId: job.serviceId
      })));
      
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
      const jobsWithClients = jobsForWeek.map(job => ({
        ...job,
        client: clientsMap.get(job.clientId) || null,
      }));

      console.log('✅ Final jobs with clients:', jobsWithClients.length);
      console.log('✅ Jobs with missing clients:', jobsWithClients.filter(job => !job.client).length);

      setJobs(jobsWithClients);
      
      // 5. Fetch and verify completed days for this week
      try {
        const completedDaysDoc = await getDoc(doc(db, 'completedWeeks', startDate));
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
      .sort((a: any, b: any) => (a.client?.roundOrderNumber ?? 0) - (b.client?.roundOrderNumber ?? 0));
    
    if (jobsForDay.length > 0) {
      console.log(`📅 ${day}: ${jobsForDay.length} jobs`);
    }
    
    return {
      title: day,
      data: jobsForDay,
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
  };

  const handleDeferJob = async (job: Job & { client: Client | null }) => {
    try {
      // Get today's date in the same format as other jobs
      const today = new Date();
      const todayString = format(today, 'yyyy-MM-dd') + 'T09:00:00';
      
      // Update the job's scheduled time to today
      await updateDoc(doc(db, 'jobs', job.id), { scheduledTime: todayString });
      
      // Update local state
      setJobs(prevJobs => prevJobs.map(j => 
        j.id === job.id ? { ...j, scheduledTime: todayString } : j
      ));
      
      Alert.alert('Success', 'Job deferred to today');
    } catch (error) {
      console.error('Error deferring job:', error);
      Alert.alert('Error', 'Failed to defer job. Please try again.');
    }
  };

  const handleJobPress = (job: Job & { client: Client | null }) => {
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
    if (!client) return;
    const addressParts = [client.address1 || client.address, client.town, client.postcode].filter(Boolean);
    const address = addressParts.join(', ');
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
    const { client, eta: jobEta } = job;
    if (!client || !client.mobileNumber) return;
    
    const etaText = jobEta 
      ? `Roughly estimated time of arrival: \n${jobEta}` 
      : 'We will be with you as soon as possible tomorrow.';

    const template = `Hello ${client.name},\n\nCourtesy message to let you know window cleaning is due tomorrow.\n${etaText}\n\nMany thanks,`;

    let smsUrl = '';
    if (Platform.OS === 'ios') {
      smsUrl = `sms:${client.mobileNumber}&body=${encodeURIComponent(template)}`;
    } else {
      smsUrl = `smsto:${client.mobileNumber}?body=${encodeURIComponent(template)}`;
    }
    Linking.openURL(smsUrl);
    setActionSheetJob(null);
  };

  const handleDeleteJob = async (jobId: string) => {
    await deleteDoc(doc(db, 'jobs', jobId));
    setJobs((prev) => prev.filter((job) => job.id !== jobId));
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
    const dayJobs = sections.find(section => section.title === dayTitle)?.data || [];
    const completedJobs = dayJobs.filter(job => job.status === 'completed');
    
    if (completedJobs.length === 0) return;

    try {
      // Update job status to 'completed' to show in completed jobs
      const batch = writeBatch(db);
      completedJobs.forEach(job => {
        const jobRef = doc(db, 'jobs', job.id);
        batch.update(jobRef, { status: 'completed' });
      });
      await batch.commit();

      // Update local state
      setJobs(prev => prev.map(job => 
        completedJobs.some(completedJob => completedJob.id === job.id) 
          ? { ...job, status: 'completed' }
          : job
      ));

      // Add day to completed days and save to Firestore
      const newCompletedDays = [...completedDays, dayTitle];
      setCompletedDays(newCompletedDays);
      
      // Save completed days to Firestore
      const startDate = format(weekStart, 'yyyy-MM-dd');
      await setDoc(doc(db, 'completedWeeks', startDate), {
        completedDays: newCompletedDays,
        weekStart: startDate,
        updatedAt: new Date()
      });

      Alert.alert('Success', `${completedJobs.length} jobs moved to completed jobs for ${dayTitle}`);
    } catch (error) {
      console.error('Error completing day:', error);
      Alert.alert('Error', 'Failed to complete day. Please try again.');
    }
  };

  const renderItem = ({ item, index, section }: any) => {
    const sectionIndex = sections.findIndex(s => s.title === section.title);
    const isCompleted = item.status === 'completed';
    const isDayCompleted = completedDays.includes(section.title);
    const client: any = item.client;
    // Find the first incomplete job in this section
    const firstIncompleteIndex = section.data.findIndex((job: any) => job.status !== 'completed');
    const showCompleteButton = isCurrentWeek && index === firstIncompleteIndex && !isCompleted && !isDayCompleted;
    const showUndoButton = isCurrentWeek && isCompleted && !isDayCompleted;
    const isOneOffJob = ['Gutter cleaning', 'Conservatory roof', 'Soffit and fascias', 'One-off window cleaning', 'Other'].includes(item.serviceId);

    // Check if this job is from a past day (not completed and from a day before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = item.scheduledTime ? parseISO(item.scheduledTime) : null;
    const isPastDay = jobDate && jobDate < today && !isCompleted && isCurrentWeek;

    const addressParts = client ? [client.address1 || client.address, client.town, client.postcode].filter(Boolean) : [];
    const address = client ? addressParts.join(', ') : 'Unknown address';

    return (
      <View style={[
        styles.clientRow,
        isCompleted && styles.completedRow,
        isOneOffJob && !isCompleted && styles.oneOffJobRow,
        isPastDay && styles.pastDayRow
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
          </Pressable>
        </View>
        <View style={styles.controlsContainer}>
          <Pressable onPress={() => showPickerForJob(item)} style={styles.etaButton}>
            <Text style={styles.etaButtonText}>{item.eta || 'ETA'}</Text>
          </Pressable>
          <View style={styles.arrowContainer}>
            {!isCompleted && !isDayCompleted && (
              <>
                <Pressable onPress={() => moveJob(sectionIndex, index, 'up')} disabled={index === 0} style={styles.arrowButton}>
                  <Ionicons name="arrow-up" size={24} color={index === 0 ? '#ccc' : '#007AFF'} />
                </Pressable>
                <Pressable onPress={() => moveJob(sectionIndex, index, 'down')} disabled={index === section.data.length - 1} style={styles.arrowButton}>
                  <Ionicons name="arrow-down" size={24} color={index === section.data.length - 1 ? '#ccc' : '#007AFF'} />
                </Pressable>
                <Pressable onPress={() => moveJob(sectionIndex, index, 'left')} disabled={sectionIndex === 0} style={styles.arrowButton}>
                  <Ionicons name="arrow-back" size={24} color={sectionIndex === 0 ? '#ccc' : '#007AFF'} />
                </Pressable>
                <Pressable onPress={() => moveJob(sectionIndex, index, 'right')} disabled={sectionIndex === sections.length - 1} style={styles.arrowButton}>
                  <Ionicons name="arrow-forward" size={24} color={sectionIndex === sections.length - 1 ? '#ccc' : '#007AFF'} />
                </Pressable>
              </>
            )}
          </View>
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
          {isPastDay && (
            <Pressable onPress={() => handleDeferJob(item)} style={styles.deferButton}>
              <Text style={styles.deferButtonText}>Defer</Text>
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

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
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
                    {title} ({data.length}) {collapsedDays.includes(title) ? '+' : '-'}
                    {(dayIsCompleted || dayIsPast) && ' 🔒'}
                  </Text>
                </Pressable>
                {showDayCompleteButton && (
                  <Pressable 
                    style={styles.dayCompleteButton} 
                    onPress={() => handleDayComplete(title)}
                  >
                    <Text style={styles.dayCompleteButtonText}>Day complete?</Text>
                  </Pressable>
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
      {actionSheetJob && Platform.OS === 'android' && (
        <Pressable style={styles.androidSheetOverlay} onPress={() => setActionSheetJob(null)}>
          <View style={styles.androidSheet} pointerEvents="box-none">
            <Button title="Navigate?" onPress={() => handleNavigate(actionSheetJob.client)} />
            <Button title="View details?" onPress={() => handleViewDetails(actionSheetJob.client)} />
            <Button title="Message ETA" onPress={() => handleMessageETA(actionSheetJob)} />
            <Button title="Delete Job" color="red" onPress={() => handleDeleteJob(actionSheetJob.id)} />
          </View>
        </Pressable>
      )}
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
  arrowContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    maxWidth: 100,
  },
  arrowButton: {
    padding: 4,
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
  pastDayRow: {
    backgroundColor: '#ffd7d7', // Light red background for past day jobs
    borderColor: '#ffb3b3',
  },
}); 