import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';

export default function AccountsScreen() {
  const [loading, setLoading] = useState(true);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [completedJobsTotal, setCompletedJobsTotal] = useState(0);
  const [jobsCount, setJobsCount] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [completedJobsCount, setCompletedJobsCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const fetchTotals = async () => {
      setLoading(true);

      // Fetch accounted jobs for total
      const jobsRef = collection(db, 'jobs');
      const accountedJobsQuery = query(jobsRef, where('status', '==', 'accounted'));
      const jobsUnsubscribe = onSnapshot(accountedJobsQuery, (querySnapshot) => {
        let total = 0;
        querySnapshot.forEach((doc) => {
          total += doc.data().price;
        });
        setJobsTotal(total);
        setJobsCount(querySnapshot.size);
      });

      // Fetch completed jobs for total
      const completedJobsQuery = query(jobsRef, where('status', '==', 'paid'));
      const completedJobsUnsubscribe = onSnapshot(completedJobsQuery, (querySnapshot) => {
        let total = 0;
        querySnapshot.forEach((doc) => {
          total += doc.data().price;
        });
        setCompletedJobsTotal(total);
        setCompletedJobsCount(querySnapshot.size);
      });

      // Fetch payments for total
      const paymentsRef = collection(db, 'payments');
      const paymentsQuery = query(paymentsRef);
      const paymentsUnsubscribe = onSnapshot(paymentsQuery, (querySnapshot) => {
        let total = 0;
        querySnapshot.forEach((doc) => {
          total += doc.data().amount;
        });
        setPaymentsTotal(total);
        setPaymentsCount(querySnapshot.size);
      });

      setLoading(false);

      return () => {
        jobsUnsubscribe();
        completedJobsUnsubscribe();
        paymentsUnsubscribe();
      };
    };
    
    fetchTotals();
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Accounts</ThemedText>
      
      <View style={styles.dashboard}>
        <Pressable style={styles.dashButton} onPress={() => router.push('/awaiting-payment')}>
          <ThemedText style={styles.dashButtonText}>Awaiting Payment</ThemedText>
          <ThemedText style={styles.dashButtonSubText}>£{jobsTotal.toFixed(2)}</ThemedText>
        </Pressable>
        <Pressable style={styles.dashButton} onPress={() => router.push('/completed-jobs')}>
          <ThemedText style={styles.dashButtonText}>Completed Jobs</ThemedText>
          <ThemedText style={styles.dashButtonSubText}>£{completedJobsTotal.toFixed(2)}</ThemedText>
        </Pressable>
        <Pressable style={styles.dashButton} onPress={() => router.push('/payments-list')}>
          <ThemedText style={styles.dashButtonText}>All Payments</ThemedText>
          <ThemedText style={styles.dashButtonSubText}>
            Total: £{paymentsTotal.toFixed(2)} ({paymentsCount} payments)
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  dashboard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dashButton: {
    width: '100%',
    aspectRatio: 1.5,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dashButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  dashButtonSubText: {
    fontSize: 16,
    color: '#666',
  },
}); 