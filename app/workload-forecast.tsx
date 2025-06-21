import { useFocusEffect } from '@react-navigation/native';
import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getJobsForWeek } from './services/jobService';

export default function WorkloadForecastScreen() {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<{ week: string; count: number }[]>([]);
  const router = useRouter();

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const weeksArr: { week: string; count: number }[] = [];
    for (let i = 0; i < 52; i++) {
      const weekDate = addWeeks(start, i);
      const weekStr = format(weekDate, 'yyyy-MM-dd');
      const weekStart = weekStr;
      const weekEnd = format(addWeeks(weekDate, 1), 'yyyy-MM-dd');
      // Use getJobsForWeek to fetch jobs for this week
      const jobsForWeek = await getJobsForWeek(weekStart, weekEnd);
      const count = jobsForWeek.length;
      weeksArr.push({ week: weekStr, count });
    }
    setWeeks(weeksArr);
    setLoading(false);
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  // Initial load
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

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
    return (
      <Pressable
        style={[styles.weekRow, isCurrentWeek && styles.currentWeekRow]}
        onPress={() => router.push({ pathname: '/runsheet/[week]', params: { week: item.week } })}
      >
        <Text style={styles.weekLabel}>{label}</Text>
        <Text style={styles.count}>{item.count} job{item.count !== 1 ? 's' : ''}</Text>
      </Pressable>
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
      <Text style={styles.title}>Workload Forecast</Text>
      <Button title="Home" onPress={() => router.replace('/')} />
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
  weekLabel: { fontSize: 15, flex: 1, flexWrap: 'wrap' },
  count: { fontSize: 15, fontWeight: 'bold', marginLeft: 8, minWidth: 60, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
}); 