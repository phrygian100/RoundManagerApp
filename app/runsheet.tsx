import Ionicons from '@expo/vector-icons/Ionicons';
import { db } from 'core/firebase';
import { addDays, addWeeks, endOfWeek, format, isBefore, parseISO, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Button, Linking, Platform, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import type { Client } from '../types/client';
import { getClientById, getJobsForWeek, updateJobStatus } from './services/jobService';
import type { Job } from './types/models';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function RunsheetScreen() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<(Job & { client: Client | null })[]>([]);
  const [actionSheetJob, setActionSheetJob] = useState<Job & { client: Client | null } | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchJobsAndClients = async () => {
      setLoading(true);
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');
      const jobsForWeek = await getJobsForWeek(startDate, endDate);
      // Fetch all clients in parallel
      const jobsWithClients = await Promise.all(
        jobsForWeek.map(async (job) => {
          const client = await getClientById(job.clientId);
          return { ...job, client };
        })
      );
      setJobs(jobsWithClients);
      setLoading(false);
    };
    fetchJobsAndClients();
  }, []);

  // Group jobs by day of week
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
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
          if (buttonIndex === 2) handleMessageETA(job.client);
          if (buttonIndex === 3) handleDeleteJob(job.id);
        }
      );
    } else {
      setActionSheetJob(job);
    }
  };

  const handleNavigate = (client: Client | null) => {
    if (!client) return;
    const address = `${client.address1}, ${client.town}, ${client.postcode}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    Linking.openURL(url);
    setActionSheetJob(null);
  };

  const handleViewDetails = (client: Client | null) => {
    if (!client) return;
    router.push({ pathname: '/(tabs)/clients/[id]', params: { id: client.id } });
    setActionSheetJob(null);
  };

  const handleMessageETA = (client: Client | null) => {
    if (!client || !client.mobileNumber) return;
    let smsUrl = '';
    if (Platform.OS === 'ios') {
      smsUrl = `sms:${client.mobileNumber}`;
    } else {
      smsUrl = `sms:${client.mobileNumber}`;
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

  const renderItem = ({ item, index, section }: any) => {
    const sectionIndex = sections.findIndex(s => s.title === section.title);
    const isCompleted = item.status === 'completed';
    const client = item.client;
    // Find the first incomplete job in this section
    const firstIncompleteIndex = section.data.findIndex((job: any) => job.status !== 'completed');
    const showCompleteButton = index === firstIncompleteIndex && !isCompleted;
    const showUndoButton = isCompleted;
    return (
      <View style={[styles.clientRow, isCompleted && styles.completedRow]}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => handleJobPress(item)}>
            <View style={styles.addressBlock}>
              <Text style={styles.addressTitle}>{client ? `${client.address1}, ${client.town}, ${client.postcode}` : 'Unknown address'}</Text>
            </View>
            {client?.mobileNumber && (
              <Text style={styles.mobileNumber}>{client.mobileNumber}</Text>
            )}
            <Text style={styles.clientName}>{client?.name}{typeof client?.quote === 'number' ? ` — £${client.quote.toFixed(2)}` : ''}</Text>
          </Pressable>
        </View>
        <View style={styles.arrowContainer}>
          {!isCompleted && (
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
        </View>
      </View>
    );
  };

  // Move job up/down within a day or left/right between days
  const moveJob = async (sectionIndex: number, jobIndex: number, direction: 'up' | 'down' | 'left' | 'right') => {
    const section = sections[sectionIndex];
    const job = section.data[jobIndex];
    let newJobs = [...jobs];
    if (direction === 'up' && jobIndex > 0) {
      // Swap roundOrderNumber with previous job in the same day
      const prevJob = section.data[jobIndex - 1];
      const temp = job.client?.roundOrderNumber ?? 0;
      if (job.client && prevJob.client) {
        job.client!.roundOrderNumber = prevJob.client!.roundOrderNumber;
        prevJob.client!.roundOrderNumber = temp;
        await Promise.all([
          updateDoc(doc(db, 'clients', job.client!.id), { roundOrderNumber: job.client!.roundOrderNumber }),
          updateDoc(doc(db, 'clients', prevJob.client!.id), { roundOrderNumber: prevJob.client!.roundOrderNumber }),
        ]);
        // Update local jobs state
        newJobs = newJobs.map(j => {
          if (j.client?.id === job.client!.id) return { ...j, client: { ...j.client! } };
          if (j.client?.id === prevJob.client!.id) return { ...j, client: { ...j.client! } };
          return j;
        });
      }
    } else if (direction === 'down' && jobIndex < section.data.length - 1) {
      // Swap roundOrderNumber with next job in the same day
      const nextJob = section.data[jobIndex + 1];
      const temp = job.client?.roundOrderNumber ?? 0;
      if (job.client && nextJob.client) {
        job.client!.roundOrderNumber = nextJob.client!.roundOrderNumber;
        nextJob.client!.roundOrderNumber = temp;
        await Promise.all([
          updateDoc(doc(db, 'clients', job.client!.id), { roundOrderNumber: job.client!.roundOrderNumber }),
          updateDoc(doc(db, 'clients', nextJob.client!.id), { roundOrderNumber: nextJob.client!.roundOrderNumber }),
        ]);
        // Update local jobs state
        newJobs = newJobs.map(j => {
          if (j.client?.id === job.client!.id) return { ...j, client: { ...j.client! } };
          if (j.client?.id === nextJob.client!.id) return { ...j, client: { ...j.client! } };
          return j;
        });
      }
    } else if (direction === 'left' && sectionIndex > 0) {
      // Move to previous day
      const prevDay = sections[sectionIndex - 1].dayDate;
      const newDate = format(prevDay, 'yyyy-MM-dd') + 'T09:00:00';
      await updateDoc(doc(db, 'jobs', job.id), { scheduledTime: newDate });
      job.scheduledTime = newDate;
    } else if (direction === 'right' && sectionIndex < sections.length - 1) {
      // Move to next day
      const nextDay = sections[sectionIndex + 1].dayDate;
      const newDate = format(nextDay, 'yyyy-MM-dd') + 'T09:00:00';
      await updateDoc(doc(db, 'jobs', job.id), { scheduledTime: newDate });
      job.scheduledTime = newDate;
    } else {
      return;
    }
    setJobs([...newJobs]);
  };

  // Admin: Generate recurring jobs for all clients for the next 52 weeks
  const generateRecurringJobs = async () => {
    setLoading(true);
    const querySnapshot = await getDocs(collection(db, 'clients'));
    const today = new Date();
    const jobsRef = collection(db, 'jobs');
    const allJobsSnapshot = await getDocs(jobsRef);
    const allJobs = allJobsSnapshot.docs.map(doc => doc.data());
    const jobsToCreate: any[] = [];
    querySnapshot.forEach((docSnap) => {
      const client: any = { id: docSnap.id, ...docSnap.data() };
      if (!client.nextVisit || !client.frequency || client.frequency === 'one-off') return;
      let visitDate = parseISO(client.nextVisit);
      for (let i = 0; i < 52; i++) {
        if (isBefore(visitDate, today)) {
          visitDate = addWeeks(visitDate, Number(client.frequency));
          continue;
        }
        const weekStr = format(visitDate, 'yyyy-MM-dd');
        // Only create if this client does not already have a job for this week
        const alreadyHasJob = allJobs.some((job: any) => job.clientId === client.id && job.scheduledTime && job.scheduledTime.startsWith(weekStr));
        if (!alreadyHasJob) {
          jobsToCreate.push({
            clientId: client.id,
            providerId: 'test-provider-1',
            serviceId: 'window-cleaning',
            propertyDetails: `${client.address1 || client.address || ''}, ${client.town || ''}, ${client.postcode || ''}`,
            scheduledTime: weekStr + 'T09:00:00',
            status: 'pending',
            price: typeof client.quote === 'number' ? client.quote : 25,
            paymentStatus: 'unpaid',
          });
        }
        visitDate = addWeeks(visitDate, Number(client.frequency));
      }
    });
    await Promise.all(jobsToCreate.map(job => addDoc(jobsRef, job)));
    setLoading(false);
    window.location.reload();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Runsheet</Text>
      <Text style={styles.subtitle}>Week Commencing {format(weekStart, 'do MMMM')}</Text>
      <Button title="Home" onPress={() => router.replace('/')} />
      <Text>Debug: {jobs.length} jobs</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index, section }) =>
            collapsedDays.includes(section.title) ? null : renderItem({ item, index, section })
          }
          renderSectionHeader={({ section: { title, data } }) => (
            <Pressable onPress={() => toggleDay(title)}>
              <Text style={styles.sectionHeader}>{title} ({data.length}) {collapsedDays.includes(title) ? '+' : '-'}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No jobs due this week.</Text>}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
        />
      )}
      {actionSheetJob && Platform.OS === 'android' && (
        <Pressable style={styles.androidSheetOverlay} onPress={() => setActionSheetJob(null)}>
          <View style={styles.androidSheet} pointerEvents="box-none">
            <Button title="Navigate?" onPress={() => handleNavigate(actionSheetJob.client)} />
            <Button title="View details?" onPress={() => handleViewDetails(actionSheetJob.client)} />
            <Button title="Message ETA" onPress={() => handleMessageETA(actionSheetJob.client)} />
            <Button title="Delete Job" color="red" onPress={() => handleDeleteJob(actionSheetJob.id)} />
          </View>
        </Pressable>
      )}
      <Button title="Generate Recurring Jobs (Admin)" onPress={generateRecurringJobs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 18, marginBottom: 24 },
  sectionHeader: { fontSize: 20, fontWeight: 'bold', backgroundColor: '#f0f0f0', paddingVertical: 8, paddingHorizontal: 8, marginTop: 16 },
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
  arrowContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  arrowButton: {
    padding: 4,
  },
  completedRow: {
    backgroundColor: '#b6eab6',
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
}); 