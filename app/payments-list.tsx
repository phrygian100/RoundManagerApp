import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import type { Client } from '../types/client';
import { getAllPayments } from './services/paymentService';
import type { Payment } from './types/models';

export default function PaymentsListScreen() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<(Payment & { client: Client | null })[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      try {
        const paymentsData = await getAllPayments();
        const paymentClientIds = [...new Set(paymentsData.map(payment => payment.clientId))];
        
        if (paymentClientIds.length === 0) {
          setPayments([]);
          setLoading(false);
          return;
        }

        const paymentClientChunks = [];
        for (let i = 0; i < paymentClientIds.length; i += 30) {
          paymentClientChunks.push(paymentClientIds.slice(i, i + 30));
        }
        
        const paymentClientsMap = new Map<string, Client>();
        const paymentClientPromises = paymentClientChunks.map(chunk => 
          getDocs(query(collection(db, 'clients'), where('__name__', 'in', chunk)))
        );
        const paymentClientSnapshots = await Promise.all(paymentClientPromises);
        
        paymentClientSnapshots.forEach((snapshot: any) => {
          snapshot.forEach((docSnap: any) => {
            paymentClientsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Client);
          });
        });
        
        const paymentsWithClients = paymentsData.map(payment => ({
          ...payment,
          client: paymentClientsMap.get(payment.clientId) || null,
        }));
        
        paymentsWithClients.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setPayments(paymentsWithClients);
      } catch (error) {
        console.error('Error fetching payments:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPayments();
  }, []);

  const renderPayment = ({ item }: { item: Payment & { client: Client | null } }) => {
    const client = item.client;
    const displayAddress = client?.address1 && client?.town && client?.postcode 
      ? `${client.address1}, ${client.town}, ${client.postcode}`
      : client?.address || 'No address';

    return (
      <View style={styles.paymentItem}>
        <ThemedText type="defaultSemiBold">{displayAddress}</ThemedText>
        <ThemedText>{client?.name || 'Unknown client'}</ThemedText>
        <ThemedText>£{item.amount.toFixed(2)}</ThemedText>
        <ThemedText style={styles.paymentMethod}>{item.method.replace('_', ' ').toUpperCase()}</ThemedText>
        <ThemedText>
          Date: {format(parseISO(item.date), 'd MMMM yyyy')}
        </ThemedText>
        {item.reference && (
          <ThemedText style={styles.reference}>Ref: {item.reference}</ThemedText>
        )}
        {item.notes && (
          <ThemedText style={styles.notes}>{item.notes}</ThemedText>
        )}
      </View>
    );
  };

  const calculatePaymentsTotal = () => {
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Payments</ThemedText>
      <ThemedText style={styles.sectionSubtitle}>
        Total: £{calculatePaymentsTotal().toFixed(2)} ({payments.length} payments)
      </ThemedText>
      <FlatList
        data={payments}
        renderItem={renderPayment}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingTop: 10 }}
      />
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
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  paymentItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  paymentMethod: {
    marginTop: 8,
    fontWeight: 'bold',
    color: '#333',
  },
  reference: {
    marginTop: 4,
    fontStyle: 'italic',
    color: '#555',
  },
  notes: {
    marginTop: 4,
    color: '#777',
  },
}); 