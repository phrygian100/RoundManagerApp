import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import PermissionGate from '../components/PermissionGate';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/supabase';

export default function AccountsScreen() {
  const [loading, setLoading] = useState(true);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [completedJobsTotal, setCompletedJobsTotal] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [completedJobsCount, setCompletedJobsCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const fetchTotals = async () => {
      setLoading(true);

      const ownerId = await getDataOwnerId();

      // Fetch completed jobs for total
      const jobsRef = collection(db, 'jobs');
      const completedJobsQuery = query(jobsRef, where('ownerId', '==', ownerId), where('status', '==', 'completed'));
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
      const paymentsQuery = query(paymentsRef, where('ownerId', '==', ownerId));
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
    <PermissionGate perm="viewPayments" fallback={<ThemedView style={styles.container}><ThemedText>You don't have permission to view accounts.</ThemedText></ThemedView>}>
      <ThemedView style={styles.container}>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>Accounts</ThemedText>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
            <ThemedText style={styles.homeButtonText}>🏠</ThemedText>
          </Pressable>
        </View>
        
        <View style={styles.dashboard}>
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
    </PermissionGate>
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