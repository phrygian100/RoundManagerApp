import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId, getUserSession } from '../core/session';
import { getUserProfile } from '../services/userService';
import type { Client } from '../types/client';
import type { Job, Payment, User } from '../types/models';
import { displayAccountNumber } from '../utils/account';

type ClientWithBalance = Client & { balance: number; startingBalance?: number };

type InvoiceItem = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'job' | 'payment' | 'startingBalance';
};

export default function ChasePaymentScreen() {
  const params = useLocalSearchParams<{ clientId: string; clientName: string }>();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientWithBalance | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [runningBalance, setRunningBalance] = useState(0);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (params.clientId) {
      fetchClientData();
    }
  }, [params.clientId]);

  const fetchClientData = async () => {
    setLoading(true);
    try {
      const ownerId = await getDataOwnerId();
      const session = await getUserSession();
      
      // Fetch user profile data for business information
      if (session?.uid) {
        const profile = await getUserProfile(session.uid);
        setUserProfile(profile);
      }
      
      // Fetch client data
      const clientDoc = await getDoc(doc(db, 'clients', params.clientId));
      if (!clientDoc.exists()) {
        console.error('Client not found');
        return;
      }
      
      const clientData = { id: clientDoc.id, ...clientDoc.data() } as ClientWithBalance;
      
      // Fetch completed jobs
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', params.clientId),
        where('status', '==', 'completed')
      );
      const jobsSnapshot = await getDocs(jobsQuery);
      const jobs = jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Job[];

      // Fetch payments
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', params.clientId)
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Payment[];

      // Calculate balance
      const totalBilled = jobs.reduce((sum, job) => sum + job.price, 0);
      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const startingBalance = Number(clientData.startingBalance) || 0;
      const balance = totalPaid - totalBilled + startingBalance;
      
      const clientWithBalance = { ...clientData, balance, startingBalance };
      setClient(clientWithBalance);

      // Create invoice items
      const items: InvoiceItem[] = [];
      
      // Add starting balance if it exists
      if (startingBalance !== 0) {
        items.push({
          id: 'starting-balance',
          date: 'Account Opening',
          description: 'Starting Balance',
          amount: startingBalance,
          type: 'startingBalance'
        });
      }

      // Add jobs (as positive amounts - money owed)
      jobs.forEach(job => {
        items.push({
          id: job.id,
          date: job.scheduledTime,
          description: `Service: ${job.serviceId}`,
          amount: job.price,
          type: 'job'
        });
      });

      // Add payments (as negative amounts - money received)
      payments.forEach(payment => {
        items.push({
          id: payment.id,
          date: payment.date,
          description: `Payment: ${payment.method}${payment.reference ? ` (${payment.reference})` : ''}`,
          amount: -payment.amount,
          type: 'payment'
        });
      });

      // Sort by date
      items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setInvoiceItems(items);

      // Calculate running balance
      let running = startingBalance;
      const runningBalances = items.map(item => {
        running += item.amount;
        return running;
      });
      setRunningBalance(running);

    } catch (error) {
      console.error('Error fetching client data:', error);
    } finally {
      setLoading(false);
    }
  };



  const handleBack = () => {
    router.back();
  };

  const handleSendEmail = () => {
    // TODO: Implement email functionality
    console.log('Send email functionality to be implemented');
  };

  const handleDownload = () => {
    // TODO: Implement download functionality
    console.log('Download functionality to be implemented');
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!client) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Client not found</ThemedText>
      </ThemedView>
    );
  }

  const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
  const displayAddress = addressParts.length > 0
    ? addressParts.join(', ')
    : client.address || 'No address';

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Chase Payment</ThemedText>
        <Pressable style={styles.homeButton} onPress={() => router.push('/')}>
          <Ionicons name="home" size={24} color="#1976d2" />
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Invoice Header */}
        <View style={styles.invoiceHeader}>
          <View style={styles.companyInfo}>
            <ThemedText style={styles.companyName}>
              {userProfile?.businessName || 'Your Company Name'}
            </ThemedText>
            <ThemedText style={styles.companyAddress}>
              {userProfile?.address ? userProfile.address : 'Your Company Address'}
            </ThemedText>
            <ThemedText style={styles.companyContact}>
              Phone: {userProfile?.phone || 'Your Phone'}
            </ThemedText>
          </View>
          
          <View style={styles.invoiceDetails}>
            <ThemedText style={styles.invoiceTitle}>INVOICE</ThemedText>
            <ThemedText style={styles.invoiceDate}>Date: {format(new Date(), 'dd/MM/yyyy')}</ThemedText>
            <ThemedText style={styles.invoiceNumber}>Invoice #: {client.accountNumber || 'N/A'}</ThemedText>
          </View>
        </View>

        {/* Client Information */}
        <View style={styles.clientSection}>
          <ThemedText style={styles.sectionTitle}>Bill To:</ThemedText>
          <ThemedText style={styles.clientName}>{client.name || 'No name'}</ThemedText>
          <ThemedText style={styles.clientAddress}>{displayAddress}</ThemedText>
          {client.accountNumber && (
            <ThemedText style={styles.clientAccount}>Account: {displayAccountNumber(client.accountNumber)}</ThemedText>
          )}
        </View>

        {/* Balance Summary */}
        <View style={styles.balanceSection}>
          <View style={styles.balanceRow}>
            <ThemedText style={styles.balanceLabel}>Outstanding Balance:</ThemedText>
            <ThemedText style={[styles.balanceAmount, { color: '#f44336' }]}>
              £{Math.abs(client.balance).toFixed(2)}
            </ThemedText>
          </View>
        </View>

        {/* Invoice Items */}
        <View style={styles.invoiceItems}>
          <ThemedText style={styles.sectionTitle}>Account History</ThemedText>
          
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <ThemedText style={styles.headerDate}>Date</ThemedText>
            <ThemedText style={styles.headerDescription}>Description</ThemedText>
            <ThemedText style={styles.headerAmount}>Amount</ThemedText>
            <ThemedText style={styles.headerBalance}>Balance</ThemedText>
          </View>

          {/* Table Rows */}
          {invoiceItems.map((item, index) => (
            <View key={item.id} style={styles.tableRow}>
              <ThemedText style={styles.cellDate}>
                {item.type === 'startingBalance' ? 'Opening' : format(parseISO(item.date), 'dd/MM/yyyy')}
              </ThemedText>
              <ThemedText style={styles.cellDescription}>{item.description}</ThemedText>
              <ThemedText style={[
                styles.cellAmount,
                { color: item.amount >= 0 ? '#f44336' : '#4CAF50' }
              ]}>
                {item.amount >= 0 ? '+' : ''}£{item.amount.toFixed(2)}
              </ThemedText>
              <ThemedText style={[
                styles.cellBalance,
                { color: runningBalance >= 0 ? '#4CAF50' : '#f44336' }
              ]}>
                £{runningBalance.toFixed(2)}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Payment Instructions */}
        <View style={styles.paymentInstructions}>
          <ThemedText style={styles.sectionTitle}>Payment Instructions</ThemedText>
          <ThemedText style={styles.instructionText}>
            Please settle your balance of £{Math.abs(client.balance).toFixed(2)}
          </ThemedText>
          {userProfile?.bankSortCode && userProfile?.bankAccountNumber && (
            <>
              <ThemedText style={styles.instructionText}>
                Sort Code: {userProfile.bankSortCode}
              </ThemedText>
              <ThemedText style={styles.instructionText}>
                Account Number: {userProfile.bankAccountNumber}
              </ThemedText>
            </>
          )}
          <ThemedText style={styles.instructionText}>
            Reference: {client.accountNumber || 'Your Account Number'}
          </ThemedText>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable style={styles.primaryButton} onPress={handleSendEmail}>
            <Ionicons name="mail-outline" size={20} color="#fff" />
            <ThemedText style={styles.primaryButtonText}>Send Via Email</ThemedText>
          </Pressable>
          
          <Pressable style={styles.secondaryButton} onPress={handleDownload}>
            <Ionicons name="download-outline" size={20} color="#1976d2" />
            <ThemedText style={styles.secondaryButtonText}>Download</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingTop: Platform.OS === 'web' ? 20 : 60,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  homeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  companyAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  companyContact: {
    fontSize: 14,
    color: '#666',
  },
  invoiceDetails: {
    alignItems: 'flex-end',
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  invoiceDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  invoiceNumber: {
    fontSize: 14,
    color: '#666',
  },
  clientSection: {
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  clientAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  clientAccount: {
    fontSize: 14,
    color: '#666',
  },
  balanceSection: {
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  invoiceItems: {
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 8,
  },
  headerDate: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  headerDescription: {
    flex: 2,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  headerAmount: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'right',
  },
  headerBalance: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cellDate: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
  cellDescription: {
    flex: 2,
    fontSize: 12,
    color: '#333',
  },
  cellAmount: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  cellBalance: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  paymentInstructions: {
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  actionButtons: {
    gap: 12,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976d2',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1976d2',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

}); 