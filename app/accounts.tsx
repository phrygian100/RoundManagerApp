import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import PermissionGate from '../components/PermissionGate';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client } from '../types/client';
import type { Job, Payment } from '../types/models';
import { displayAccountNumber } from '../utils/account';

type ClientWithBalance = Client & { balance: number; startingBalance?: number };

type AccountDetailsModalProps = {
  visible: boolean;
  client: ClientWithBalance | null;
  onClose: () => void;
  onChasePayment: (client: ClientWithBalance) => void;
};

const AccountDetailsModal = ({ visible, client, onClose, onChasePayment }: AccountDetailsModalProps) => {
  const [accountHistory, setAccountHistory] = useState<{ jobs: Job[]; payments: Payment[] }>({ jobs: [], payments: [] });
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (visible && client) {
      fetchAccountHistory();
    }
  }, [visible, client]);

  const fetchAccountHistory = async () => {
    if (!client) return;
    
    setLoadingHistory(true);
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
      const jobs = jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Job[];

      // Fetch payments for this client
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('ownerId', '==', ownerId),
        where('clientId', '==', client.id)
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Payment[];

      setAccountHistory({ jobs, payments });
    } catch (error) {
      console.error('Error fetching account history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!client) return null;

  const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
  const displayAddress = addressParts.length > 0
    ? addressParts.join(', ')
    : client.address || 'No address';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Account Details</ThemedText>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Client Information */}
            <View style={styles.clientInfoSection}>
              <ThemedText style={styles.modalClientName}>{client.name || 'No name'}</ThemedText>
              <ThemedText style={styles.modalClientAddress}>{displayAddress}</ThemedText>
              {client.accountNumber && (
                <ThemedText style={styles.accountNumber}>Account: {displayAccountNumber(client.accountNumber)}</ThemedText>
              )}
            </View>

            {/* Balance Summary */}
            <View style={styles.balanceSection}>
              <View style={styles.balanceRow}>
                <ThemedText style={styles.balanceLabel}>Current Balance:</ThemedText>
                <ThemedText style={[styles.balanceAmount, { color: client.balance < 0 ? '#f44336' : '#4CAF50' }]}>
                  £{Math.abs(client.balance).toFixed(2)} {client.balance < 0 ? 'Outstanding' : 'Credit'}
                </ThemedText>
              </View>
              {client.startingBalance && client.startingBalance !== 0 && (
                <View style={styles.balanceRow}>
                  <ThemedText style={styles.balanceLabel}>Starting Balance:</ThemedText>
                  <ThemedText style={styles.balanceDetail}>£{client.startingBalance.toFixed(2)}</ThemedText>
                </View>
              )}
            </View>

            {/* Account Summary */}
            <View style={styles.summarySection}>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Total Billed:</ThemedText>
                <ThemedText style={styles.summaryValue}>£{accountHistory.jobs.reduce((sum, job) => sum + job.price, 0).toFixed(2)}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Total Paid:</ThemedText>
                <ThemedText style={styles.summaryValue}>£{accountHistory.payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Jobs Completed:</ThemedText>
                <ThemedText style={styles.summaryValue}>{accountHistory.jobs.length}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Payments Received:</ThemedText>
                <ThemedText style={styles.summaryValue}>{accountHistory.payments.length}</ThemedText>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Pressable 
                style={[styles.actionButton, styles.chaseButton]}
                onPress={() => onChasePayment(client)}
              >
                <Ionicons name="mail-outline" size={20} color="#fff" />
                <ThemedText style={styles.chaseButtonText}>Chase Payment</ThemedText>
              </Pressable>
              
              <Pressable 
                style={[styles.actionButton, styles.addPaymentButton]}
                onPress={() => {
                  onClose();
                  // Navigate to add payment screen with client pre-filled
                  // This will be handled by the parent component
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#1976d2" />
                <ThemedText style={styles.addPaymentButtonText}>Add Payment</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default function AccountsScreen() {
  const [loading, setLoading] = useState(true);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [completedJobsTotal, setCompletedJobsTotal] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [completedJobsCount, setCompletedJobsCount] = useState(0);
  const [outstandingClients, setOutstandingClients] = useState<ClientWithBalance[]>([]);
  const [loadingOutstanding, setLoadingOutstanding] = useState(true);
  const [selectedClient, setSelectedClient] = useState<ClientWithBalance | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const router = useRouter();
  const { width } = useWindowDimensions();

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

  // Fetch outstanding clients
  useEffect(() => {
    const fetchOutstandingClients = async () => {
      setLoadingOutstanding(true);
      try {
        const ownerId = await getDataOwnerId();
        
        // Fetch all active clients
        const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
        const clientsSnapshot = await getDocs(clientsQuery);
        const clients = clientsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[];
        
        // Filter out ex-clients
        const activeClients = clients.filter(client => client.status !== 'ex-client');
        
        // Fetch completed jobs
        const jobsQuery = query(collection(db, 'jobs'), where('ownerId', '==', ownerId), where('status', '==', 'completed'));
        const jobsSnapshot = await getDocs(jobsQuery);
        const allJobs = jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Job[];

        // Fetch payments
        const paymentsQuery = query(collection(db, 'payments'), where('ownerId', '==', ownerId));
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const allPayments = paymentsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Payment[];
        
        // Calculate balances for each client
        const clientsWithBalances: ClientWithBalance[] = activeClients.map(client => {
          const clientJobs = allJobs.filter(job => job.clientId === client.id);
          const clientPayments = allPayments.filter(payment => payment.clientId === client.id);
          
          const totalBilled = clientJobs.reduce((sum, job) => sum + job.price, 0);
          const totalPaid = clientPayments.reduce((sum, payment) => sum + payment.amount, 0);
          const startingBalance = Number(client.startingBalance) || 0;
          const balance = totalPaid - totalBilled + startingBalance;
          
          return { ...client, balance };
        });

        // Filter for outstanding accounts (negative balance)
        const outstanding = clientsWithBalances
          .filter(client => client.balance < 0)
          .sort((a, b) => a.balance - b.balance); // Sort by most negative first

        setOutstandingClients(outstanding);
      } catch (error) {
        console.error("Error fetching outstanding clients:", error);
      } finally {
        setLoadingOutstanding(false);
      }
    };

    fetchOutstandingClients();
  }, []);

  const handleOpenAccountDetails = (client: ClientWithBalance) => {
    setSelectedClient(client);
    setShowAccountModal(true);
  };

  const handleChasePayment = (client: ClientWithBalance) => {
    setShowAccountModal(false);
    router.push({
      pathname: '/chase-payment',
      params: {
        clientId: client.id,
        clientName: client.name,
      },
    } as any);
  };

  const handleAddPayment = (client: ClientWithBalance) => {
    setShowAccountModal(false);
    // Navigate to add payment screen with client pre-filled
    const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
    const displayAddress = addressParts.length > 0
      ? addressParts.join(', ')
      : client.address || '';
    
    router.push({
      pathname: '/add-payment',
      params: {
        clientId: client.id,
        clientName: client.name,
        address: displayAddress,
        accountNumber: client.accountNumber,
      },
    });
  };

  // --- UI helpers ---
  const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, marginBottom: 28, boxShadow: '0 2px 8px #0001', padding: 0, borderWidth: 1, borderColor: '#eee' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#f0f0f0', backgroundColor: '#f8faff', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
        {icon}
        <ThemedText style={{ fontWeight: 'bold', fontSize: 20, marginLeft: 8 }}>{title}</ThemedText>
      </View>
      <View style={{ padding: 16 }}>{children}</View>
    </View>
  );

  const SummaryCard = ({ title, value, subtitle, onPress, icon }: { 
    title: string; 
    value: string; 
    subtitle?: string; 
    onPress: () => void; 
    icon: React.ReactNode;
  }) => (
    <Pressable 
      style={styles.summaryCard} 
      onPress={onPress}
    >
      <View style={styles.summaryCardHeader}>
        {icon}
        <ThemedText style={styles.summaryCardTitle}>{title}</ThemedText>
      </View>
      <ThemedText style={styles.summaryCardValue}>{value}</ThemedText>
      {subtitle && (
        <ThemedText style={styles.summaryCardSubtitle}>{subtitle}</ThemedText>
      )}
    </Pressable>
  );

  const OutstandingClientCard = ({ client }: { client: ClientWithBalance }) => {
    const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
    const displayAddress = addressParts.length > 0
      ? addressParts.join(', ')
      : client.address || 'No address';

    return (
      <Pressable 
        style={styles.outstandingClientCard}
        onPress={() => handleOpenAccountDetails(client)}
      >
        <View style={[styles.balanceBadge, { backgroundColor: '#f44336' }]}>
          <ThemedText style={styles.balanceText}>£{Math.abs(client.balance).toFixed(2)}</ThemedText>
        </View>
        <View style={styles.clientInfo}>
          <ThemedText style={styles.modalClientName}>{client.name || 'No name'}</ThemedText>
                      <ThemedText style={styles.modalClientAddress}>{displayAddress}</ThemedText>
          {client.accountNumber && (
            <ThemedText style={styles.accountNumberText}>Account: {displayAccountNumber(client.accountNumber)}</ThemedText>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </Pressable>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  const isWeb = Platform.OS === 'web';
  const isLargeScreen = isWeb && width > 768;

  return (
    <PermissionGate perm="viewPayments" fallback={<ThemedView style={styles.container}><ThemedText>You don't have permission to view accounts.</ThemedText></ThemedView>}>
      <ThemedView style={styles.container}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <ThemedText style={styles.headerTitle}>Accounts</ThemedText>
          <View style={styles.headerButtons}>
            <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
              <Ionicons name="home-outline" size={22} color="#1976d2" />
            </Pressable>
          </View>
        </View>
        
        {/* Main Content Container */}
        <ScrollView 
          style={styles.scrollContainer} 
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {isLargeScreen ? (
            <View style={styles.desktopContainer}>
              {/* Left Column: Summary Cards */}
              <View style={styles.summarySection}>
                <SectionCard 
                  title="Financial Summary" 
                  icon={<Ionicons name="analytics-outline" size={22} color="#1976d2" />}
                >
                  <View style={styles.summaryGrid}>
                    <SummaryCard
                      title="Completed Jobs"
                      value={`£${completedJobsTotal.toFixed(2)}`}
                      subtitle={`${completedJobsCount} jobs completed`}
                      onPress={() => router.push('/completed-jobs')}
                      icon={<Ionicons name="checkmark-circle-outline" size={20} color="#43a047" />}
                    />
                    <SummaryCard
                      title="All Payments"
                      value={`£${paymentsTotal.toFixed(2)}`}
                      subtitle={`${paymentsCount} payments received`}
                      onPress={() => router.push('/payments-list')}
                      icon={<Ionicons name="card-outline" size={20} color="#1976d2" />}
                    />
                    <SummaryCard
                      title="Unknown Payments"
                      value="View Details"
                      subtitle="Payments with unmatched accounts"
                      onPress={() => router.push('/unknown-payments')}
                      icon={<Ionicons name="help-circle-outline" size={20} color="#ff9800" />}
                    />
                  </View>
                </SectionCard>
              </View>
              
              {/* Right Column: Outstanding Accounts */}
              <View style={styles.outstandingSection}>
                <SectionCard 
                  title="Outstanding Accounts" 
                  icon={<Ionicons name="alert-circle-outline" size={22} color="#f44336" />}
                >
                  {loadingOutstanding ? (
                    <View style={styles.placeholderContent}>
                      <ActivityIndicator size="small" />
                      <ThemedText style={styles.placeholderText}>Loading outstanding accounts...</ThemedText>
                    </View>
                  ) : outstandingClients.length === 0 ? (
                    <View style={styles.placeholderContent}>
                      <Ionicons name="checkmark-circle-outline" size={32} color="#4CAF50" style={{ marginBottom: 8 }} />
                      <ThemedText style={styles.placeholderText}>No outstanding accounts!</ThemedText>
                      <ThemedText style={styles.placeholderSubtext}>All clients are up to date with payments.</ThemedText>
                    </View>
                  ) : (
                    <View style={styles.outstandingList}>
                      {outstandingClients.map(client => (
                        <OutstandingClientCard key={client.id} client={client} />
                      ))}
                    </View>
                  )}
                </SectionCard>
              </View>
            </View>
          ) : (
            // Mobile/stacked layout
            <View style={styles.mobileContainer}>
              <SectionCard 
                title="Financial Summary" 
                icon={<Ionicons name="analytics-outline" size={22} color="#1976d2" />}
              >
                <View style={styles.mobileSummaryGrid}>
                  <SummaryCard
                    title="Completed Jobs"
                    value={`£${completedJobsTotal.toFixed(2)}`}
                    subtitle={`${completedJobsCount} jobs completed`}
                    onPress={() => router.push('/completed-jobs')}
                    icon={<Ionicons name="checkmark-circle-outline" size={20} color="#43a047" />}
                  />
                  <SummaryCard
                    title="All Payments"
                    value={`£${paymentsTotal.toFixed(2)}`}
                    subtitle={`${paymentsCount} payments received`}
                    onPress={() => router.push('/payments-list')}
                    icon={<Ionicons name="card-outline" size={20} color="#1976d2" />}
                  />
                  <SummaryCard
                    title="Unknown Payments"
                    value="View Details"
                    subtitle="Payments with unmatched accounts"
                    onPress={() => router.push('/unknown-payments')}
                    icon={<Ionicons name="help-circle-outline" size={20} color="#ff9800" />}
                  />
                </View>
              </SectionCard>
              
              <SectionCard 
                title="Outstanding Accounts" 
                icon={<Ionicons name="alert-circle-outline" size={22} color="#f44336" />}
              >
                {loadingOutstanding ? (
                  <View style={styles.placeholderContent}>
                    <ActivityIndicator size="small" />
                    <ThemedText style={styles.placeholderText}>Loading outstanding accounts...</ThemedText>
                  </View>
                ) : outstandingClients.length === 0 ? (
                  <View style={styles.placeholderContent}>
                    <Ionicons name="checkmark-circle-outline" size={32} color="#4CAF50" style={{ marginBottom: 8 }} />
                    <ThemedText style={styles.placeholderText}>No outstanding accounts!</ThemedText>
                    <ThemedText style={styles.placeholderSubtext}>All clients are up to date with payments.</ThemedText>
                  </View>
                ) : (
                  <View style={styles.outstandingList}>
                    {outstandingClients.map(client => (
                      <OutstandingClientCard key={client.id} client={client} />
                    ))}
                  </View>
                )}
              </SectionCard>
            </View>
          )}
        </ScrollView>

        {/* Account Details Modal */}
        <AccountDetailsModal
          visible={showAccountModal}
          client={selectedClient}
          onClose={() => {
            setShowAccountModal(false);
            setSelectedClient(null);
          }}
          onChasePayment={handleChasePayment}
        />
      </ThemedView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerBar: {
    width: '100%',
    maxWidth: 1200,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 16,
    boxShadow: '0 2px 8px #0001',
    alignSelf: 'center',
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 28,
    letterSpacing: 0.5,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  homeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#eaf2ff',
  },
  desktopContainer: {
    width: '100%',
    maxWidth: 1200,
    flexDirection: 'row',
    gap: 32,
    alignItems: 'flex-start',
    padding: 16,
    marginHorizontal: 'auto',
  },
  mobileContainer: {
    width: '100%',
    maxWidth: 700,
    padding: 16,
    marginHorizontal: 'auto',
  },
  summarySection: {
    flex: 1,
    minWidth: 340,
    maxWidth: 500,
  },
  outstandingSection: {
    flex: 1,
    minWidth: 340,
    maxWidth: 500,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  mobileSummaryGrid: {
    gap: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    color: '#495057',
  },
  summaryCardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  summaryCardSubtitle: {
    fontSize: 14,
    color: '#6c757d',
  },
  outstandingList: {
    gap: 12,
  },
  outstandingClientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  balanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 12,
  },
  balanceText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clientInfo: {
    flex: 1,
  },


  accountNumberText: {
    fontSize: 12,
    color: '#999',
  },
  placeholderContent: {
    alignItems: 'center',
    padding: 24,
  },
  placeholderText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  placeholderSubtext: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  clientInfoSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalClientName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  modalClientAddress: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  accountNumber: {
    fontSize: 14,
    color: '#999',
  },
  balanceSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  balanceDetail: {
    fontSize: 16,
    color: '#666',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  actionButtons: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  chaseButton: {
    backgroundColor: '#f44336',
    borderColor: '#f44336',
  },
  chaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  addPaymentButton: {
    backgroundColor: '#fff',
    borderColor: '#1976d2',
  },
  addPaymentButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 20,
  },
}); 