import { addWeeks, format, parseISO, startOfWeek, subWeeks } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getJobsForWeek } from '../services/jobService';

export default function RunsheetHistoryScreen() {
  const router = useRouter();
  const [weeks, setWeeks] = useState<{ week: string; label: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      setLoading(true);
      const today = new Date();
      const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weeksArr: { week: string; label: string; count: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const weekDate = subWeeks(currentWeekStart, i + 1); // i+1 to skip current week
        const weekStr = format(weekDate, 'yyyy-MM-dd');
        const weekEnd = format(addWeeks(weekDate, 1), 'yyyy-MM-dd');
        const label = `Week Commencing ${format(weekDate, 'do MMMM yyyy')}`;
        const jobsForWeek = await getJobsForWeek(weekStr, weekEnd);
        weeksArr.push({ week: weekStr, label, count: jobsForWeek.length });
      }
      setWeeks(weeksArr);
      setLoading(false);
    };
    fetchCounts();
  }, []);

  const renderItem = ({ item }: { item: { week: string; label: string; count: number } }) => {
    // Use same label logic as workload forecast
    const date = parseISO(item.week);
    const day = date.getDate();
    const month = format(date, 'LLLL');
    const year = date.getFullYear();
    const getOrdinal = (n: number) => {
      const s = ["th", "st", "nd", "rd"], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const label = `Week Commencing ${getOrdinal(day)} ${month} ${year}`;
    return (
      <Pressable
        style={styles.weekRow}
        onPress={() => router.push({ pathname: '/runsheet/[week]', params: { week: item.week } })}
      >
        <Text style={styles.weekLabel}>{label}</Text>
        <Text style={styles.count}>{item.count} job{item.count !== 1 ? 's' : ''}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Runsheet History</Text>
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeButtonText}>🏠</Text>
        </Pressable>
      </View>
      {loading ? (
        <Text style={styles.empty}>Loading...</Text>
      ) : (
        <FlatList
          data={weeks}
          keyExtractor={(item) => item.week}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.empty}>No past runsheets found.</Text>}
        />
      )}
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
  weekLabel: { fontSize: 15, flex: 1, flexWrap: 'wrap' },
  count: { fontSize: 15, fontWeight: 'bold', marginLeft: 8, minWidth: 60, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 50 },
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
}); 