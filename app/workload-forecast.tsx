import { useFocusEffect } from '@react-navigation/native';
import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';
import { resetWeekToRoundOrder } from '../services/resetService';
import type { Job } from '../types/models';

export default function WorkloadForecastScreen() {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<{ week: string; count: number }[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [resettingWeek, setResettingWeek] = useState<string | null>(null);
  const router = useRouter();

  // Check permissions on load
  useEffect(() => {
    const checkPermission = async () => {
      const session = await getUserSession();
      if (session) {
        setIsOwner(session.isOwner);
        setHasPermission(session.isOwner || session.perms?.viewRunsheet);
      }
      setLoading(false);
    };
    checkPermission();
  }, []);

  const fetchJobs = useCallback(async () => {
    if (!hasPermission) return;
    
    setLoading(true);
    try {
      const ownerId = await getUserSession().then(session => session?.accountId);
      const jobsRef = collection(db, 'jobs');
      const jobsQuery = query(jobsRef, where('ownerId', '==', ownerId));
      const jobsSnapshot = await getDocs(jobsQuery);
      const allJobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

      // Calculate the date range for the next 52 weeks
      const today = new Date();
      const start = startOfWeek(today, { weekStartsOn: 1 });
      const weeksArr: { week: string; count: number }[] = [];

      // Group jobs by week
      for (let i = 0; i < 52; i++) {
        const weekDate = addWeeks(start, i);
        const weekStr = format(weekDate, 'yyyy-MM-dd');
        const weekEnd = format(addWeeks(weekDate, 1), 'yyyy-MM-dd');

        // Count jobs that fall within this week
        const count = allJobs.filter(job => {
          if (!job.scheduledTime) return false;
          const jobDate = job.scheduledTime.split('T')[0]; // Get just the date part
          return jobDate >= weekStr && jobDate < weekEnd;
        }).length;

        weeksArr.push({ week: weekStr, count });
      }

      setWeeks(weeksArr);
    } catch (error) {
      console.error('Error fetching workload forecast:', error);
    } finally {
      setLoading(false);
    }
  }, [hasPermission]);

  const handleResetWeek = async (weekStartDate: string) => {
    const weekDate = parseISO(weekStartDate);
    const today = new Date();
    const currentWeekStr = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    
    // Don't allow reset of current week in workload forecast
    if (weekStartDate === currentWeekStr) {
      if (Platform.OS === 'web') {
        window.alert('Cannot reset current week from workload forecast. Use individual day reset buttons on the runsheet instead.');
      } else {
        Alert.alert('Cannot Reset', 'Cannot reset current week from workload forecast. Use individual day reset buttons on the runsheet instead.');
      }
      return;
    }
    
    // Confirmation dialog
    const weekLabel = `Week Commencing ${weekDate.getDate()}${getOrdinalSuffix(weekDate.getDate())} ${format(weekDate, 'LLLL yyyy')}`;
    const confirmReset = Platform.OS === 'web' 
      ? window.confirm(`Reset ${weekLabel} to round order? This will remove all manual ETAs and vehicle assignments for future days in this week.`)
      : await new Promise((resolve) => {
          Alert.alert(
            'Reset Week',
            `Reset ${weekLabel} to round order? This will remove all manual ETAs and vehicle assignments for future days in this week.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Reset', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });
    
    if (!confirmReset) return;
    
    setResettingWeek(weekStartDate);
    
    try {
      const result = await resetWeekToRoundOrder(weekDate);
      
      if (result.success) {
        // Refresh the forecast data
        await fetchJobs();
        
        const message = result.jobsReset > 0 
          ? `Successfully reset ${result.jobsReset} job${result.jobsReset !== 1 ? 's' : ''} across ${result.daysReset} day${result.daysReset !== 1 ? 's' : ''} in ${weekLabel} to round order.`
          : `No jobs needed resetting in ${weekLabel}.`;
          
        if (Platform.OS === 'web') {
          window.alert(message);
        } else {
          Alert.alert('Reset Complete', message);
        }
      } else {
        if (Platform.OS === 'web') {
          window.alert(`Failed to reset week: ${result.error || 'Unknown error'}`);
        } else {
          Alert.alert('Reset Failed', result.error || 'Unknown error occurred');
        }
      }
    } catch (error) {
      console.error('Error resetting week:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to reset week. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to reset week. Please try again.');
      }
    } finally {
      setResettingWeek(null);
    }
  };

  // Helper function for ordinal suffixes
  const getOrdinalSuffix = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (hasPermission) {
        fetchJobs();
      }
    }, [fetchJobs, hasPermission])
  );

  // Initial load
  useEffect(() => {
    if (hasPermission) {
      fetchJobs();
    }
  }, [fetchJobs, hasPermission]);

  if (!hasPermission) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>You don't have permission to view workload forecast.</ThemedText>
        <ThemedText>Debug: isOwner = {isOwner.toString()}</ThemedText>
      </ThemedView>
    );
  }

  const renderItem = ({ item }: { item: { week: string; count: number } }) => {
    const date = parseISO(item.week);
    const day = date.getDate();
    const month = format(date, 'LLLL');
    const year = date.getFullYear();
    // Ordinal helper
    const getOrdinal = (n: number) => {
      const s = ["th", "st", "nd", "rd"], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const label = `Week Commencing ${getOrdinal(day)} ${month} ${year}`;
    // Highlight current week
    const today = new Date();
    const currentWeekStr = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const isCurrentWeek = item.week === currentWeekStr;
    const showResetButton = !isCurrentWeek; // Only show for future weeks
    
    return (
      <View style={[styles.weekRow, isCurrentWeek && styles.currentWeekRow]}>
        <Pressable
          style={styles.weekRowContent}
          onPress={() => router.push({ pathname: '/runsheet/[week]', params: { week: item.week } })}
        >
          <Text style={styles.weekLabel}>{label}</Text>
          <Text style={styles.count}>{item.count} job{item.count !== 1 ? 's' : ''}</Text>
        </Pressable>
        {showResetButton && (
          Platform.OS === 'web'
            ? (
                <button
                  style={{
                    backgroundColor: '#FF9500',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: '#fff',
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                    marginLeft: 8,
                    opacity: resettingWeek === item.week ? 0.5 : 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent navigation to runsheet
                    handleResetWeek(item.week);
                  }}
                  disabled={resettingWeek === item.week}
                >
                  {resettingWeek === item.week ? '↻...' : '↻'}
                </button>
              )
            : (
                <Pressable
                  style={[styles.resetWeekButton, resettingWeek === item.week && styles.resetWeekButtonDisabled]}
                  onPress={() => handleResetWeek(item.week)}
                  disabled={resettingWeek === item.week}
                >
                  <Text style={styles.resetWeekButtonText}>
                    {resettingWeek === item.week ? '↻...' : '↻'}
                  </Text>
                </Pressable>
              )
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Workload Forecast</Text>
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeButtonText}>🏠</Text>
        </Pressable>
      </View>
      <Button title="Runsheet History" onPress={() => router.push('/runsheet-history')} />
      <FlatList
        data={weeks}
        keyExtractor={(item) => item.week}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>No scheduled clients found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  currentWeekRow: {
    backgroundColor: '#e0f7fa', // Light blue highlight
    borderRadius: 6,
  },
  weekRowContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  weekLabel: { fontSize: 15, flex: 1, flexWrap: 'wrap' },
  count: { fontSize: 15, fontWeight: 'bold', marginLeft: 8, minWidth: 60, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  resetWeekButton: {
    backgroundColor: '#FF9500',
    borderRadius: 6,
    padding: 8,
    paddingHorizontal: 12,
  },
  resetWeekButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  resetWeekButtonDisabled: {
    opacity: 0.5,
  },
}); 