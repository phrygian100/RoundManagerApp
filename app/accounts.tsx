import { Ionicons } from '@expo/vector-icons';
import { addMonths, addYears, differenceInMonths, endOfDay, endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subWeeks, subYears } from 'date-fns';
import { useRouter } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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
  onAddPayment: (client: ClientWithBalance) => void;
};

type ChartRange = 'daily' | 'weekly' | 'monthly' | 'ytd' | 'annual' | 'lifetime';
type ChartPoint = { label: string; jobs: number; payments: number };

const AccountDetailsModal = ({ visible, client, onClose, onChasePayment, onAddPayment }: AccountDetailsModalProps) => {
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
                onPress={() => onAddPayment(client!)}
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
  const [completedJobsList, setCompletedJobsList] = useState<Job[]>([]);
  const [paymentsList, setPaymentsList] = useState<Payment[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>('monthly');
  const [outstandingClients, setOutstandingClients] = useState<ClientWithBalance[]>([]);
  const [loadingOutstanding, setLoadingOutstanding] = useState(true);
  const [selectedClient, setSelectedClient] = useState<ClientWithBalance | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const router = useRouter();
  const { width } = useWindowDimensions();

  useEffect(() => {
    let completedJobsUnsubscribe: (() => void) | undefined;
    let paymentsUnsubscribe: (() => void) | undefined;
    let jobsReady = false;
    let paymentsReady = false;
    let isMounted = true;

    const markReady = () => {
      if (jobsReady && paymentsReady) {
        setLoading(false);
      }
    };

    const fetchTotals = async () => {
      try {
        setLoading(true);

        const ownerId = await getDataOwnerId();
        
        // Fetch completed jobs for total and charting
        const jobsRef = collection(db, 'jobs');
        const completedJobsQuery = query(jobsRef, where('ownerId', '==', ownerId), where('status', '==', 'completed'));
        completedJobsUnsubscribe = onSnapshot(completedJobsQuery, (querySnapshot) => {
          if (!isMounted) return;
          let total = 0;
          const jobs: Job[] = [];
          querySnapshot.forEach((doc) => {
            const jobData = doc.data() as Job;
            const price = typeof jobData.price === 'number' ? jobData.price : 0;
            total += price;
            jobs.push({ ...jobData, id: doc.id });
          });
          jobsReady = true;
          setCompletedJobsList(jobs);
          setCompletedJobsTotal(total);
          setCompletedJobsCount(querySnapshot.size);
          markReady();
        });

        // Fetch payments for total and charting
        const paymentsRef = collection(db, 'payments');
        const paymentsQuery = query(paymentsRef, where('ownerId', '==', ownerId));
        paymentsUnsubscribe = onSnapshot(paymentsQuery, (querySnapshot) => {
          if (!isMounted) return;
          let total = 0;
          const payments: Payment[] = [];
          querySnapshot.forEach((doc) => {
            const paymentData = doc.data() as Payment;
            const amount = typeof paymentData.amount === 'number' ? paymentData.amount : 0;
            total += amount;
            payments.push({ ...paymentData, id: doc.id });
          });
          paymentsReady = true;
          setPaymentsList(payments);
          setPaymentsTotal(total);
          setPaymentsCount(querySnapshot.size);
          markReady();
        });
      } catch (error) {
        console.error('Error fetching totals:', error);
        setLoading(false);
      }
    };
    
    fetchTotals();

    return () => {
      isMounted = false;
      completedJobsUnsubscribe?.();
      paymentsUnsubscribe?.();
    };
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
          const startingBalance = typeof client.startingBalance === 'number' ? client.startingBalance : 0;
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

  const timeframeOptions: { key: ChartRange; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'ytd', label: 'Year-to-date' },
    { key: 'annual', label: 'Annual' },
    { key: 'lifetime', label: 'Lifetime' },
  ];

  const parseDateValue = (value?: string) => {
    if (!value) return null;
    try {
      const parsed = parseISO(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  };

  const earliestActivityDate = useMemo(() => {
    let earliest: Date | null = null;

    completedJobsList.forEach(job => {
      const parsed = parseDateValue(job.scheduledTime || job.originalScheduledTime);
      if (parsed && (!earliest || parsed < earliest)) {
        earliest = parsed;
      }
    });

    paymentsList.forEach(payment => {
      const parsed = parseDateValue(payment.date || payment.createdAt);
      if (parsed && (!earliest || parsed < earliest)) {
        earliest = parsed;
      }
    });

    return earliest;
  }, [completedJobsList, paymentsList]);

  const buildChartBuckets = useCallback((range: ChartRange) => {
    const now = new Date();

    switch (range) {
      case 'daily':
        return Array.from({ length: 14 }, (_, idx) => {
          const start = startOfDay(subDays(now, 13 - idx));
          return { key: format(start, 'yyyy-MM-dd'), label: format(start, 'd MMM'), start, end: endOfDay(start) };
        });
      case 'weekly':
        return Array.from({ length: 12 }, (_, idx) => {
          const start = startOfWeek(subWeeks(now, 11 - idx), { weekStartsOn: 1 });
          const end = endOfWeek(start, { weekStartsOn: 1 });
          return { key: format(start, 'yyyy-ww'), label: `w/c ${format(start, 'd MMM')}`, start, end };
        });
      case 'monthly':
        return Array.from({ length: 12 }, (_, idx) => {
          const start = startOfMonth(subMonths(now, 11 - idx));
          const end = endOfMonth(start);
          return { key: format(start, 'yyyy-MM'), label: format(start, 'MMM yyyy'), start, end };
        });
      case 'ytd': {
        const start = startOfYear(now);
        const months = differenceInMonths(now, start) + 1;
        return Array.from({ length: months || 1 }, (_, idx) => {
          const startMonth = startOfMonth(addMonths(start, idx));
          const end = endOfMonth(startMonth);
          return { key: format(startMonth, 'yyyy-MM'), label: format(startMonth, 'MMM'), start: startMonth, end };
        });
      }
      case 'annual':
        return Array.from({ length: 5 }, (_, idx) => {
          const start = startOfYear(subYears(now, 4 - idx));
          const end = endOfYear(start);
          return { key: format(start, 'yyyy'), label: format(start, 'yyyy'), start, end };
        });
      case 'lifetime': {
        const start = earliestActivityDate ? startOfYear(earliestActivityDate) : startOfYear(now);
        const yearCount = Math.max(1, now.getFullYear() - start.getFullYear() + 1);
        return Array.from({ length: yearCount }, (_, idx) => {
          const startYear = addYears(start, idx);
          const end = endOfYear(startYear);
          return { key: format(startYear, 'yyyy'), label: format(startYear, 'yyyy'), start: startYear, end };
        });
      }
      default:
        return [];
    }
  }, [earliestActivityDate]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const buckets = buildChartBuckets(chartRange);
    if (!buckets.length) return [];

    const series = buckets.map(bucket => ({ label: bucket.label, jobs: 0, payments: 0 }));

    const assignToBucket = (date: Date, amount: number, field: 'jobs' | 'payments') => {
      const idx = buckets.findIndex(bucket => date >= bucket.start && date <= bucket.end);
      if (idx !== -1) {
        series[idx][field] += amount;
      }
    };

    completedJobsList.forEach(job => {
      const parsedDate = parseDateValue(job.scheduledTime || job.originalScheduledTime);
      if (!parsedDate) return;
      const amount = typeof job.price === 'number' ? job.price : 0;
      assignToBucket(parsedDate, amount, 'jobs');
    });

    paymentsList.forEach(payment => {
      const parsedDate = parseDateValue(payment.date || payment.createdAt);
      if (!parsedDate) return;
      const amount = typeof payment.amount === 'number' ? payment.amount : 0;
      assignToBucket(parsedDate, amount, 'payments');
    });

    return series;
  }, [buildChartBuckets, chartRange, completedJobsList, paymentsList]);

  const hasChartData = useMemo(
    () => chartData.some(point => point.jobs > 0 || point.payments > 0),
    [chartData]
  );

  const cycleRange = useCallback(() => {
    const idx = timeframeOptions.findIndex(option => option.key === chartRange);
    const next = timeframeOptions[(idx + 1) % timeframeOptions.length];
    setChartRange(next.key);
  }, [chartRange, timeframeOptions]);

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
      style={({ pressed }) => [styles.summaryCard, pressed && styles.summaryCardPressed]} 
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

  const FinancialBarChart = ({ data, loading }: { data: ChartPoint[]; loading: boolean }) => {
    const [chartWidth, setChartWidth] = useState(0);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const chartHeight = 220;
    const topPadding = 12;
    const bottomPadding = 32;
    const yAxisWidth = 64;
    const startGap = 18; // inset so first bars sit comfortably inside plot
    const endGap = 18; // symmetrical end inset to avoid right squish
    const verticalSpace = chartHeight - topPadding - bottomPadding;

    const safeMax = useMemo(() => {
      const maxValue = data.reduce((max, point) => Math.max(max, point.jobs, point.payments), 0);
      return maxValue > 0 ? maxValue : 1;
    }, [data]);

    const niceMax = useMemo(() => {
      if (safeMax <= 500) return Math.ceil(safeMax / 100) * 100 || 100;
      if (safeMax <= 2000) return Math.ceil(safeMax / 250) * 250;
      if (safeMax <= 5000) return Math.ceil(safeMax / 500) * 500;
      return Math.ceil(safeMax / 1000) * 1000;
    }, [safeMax]);

    const ticks = [1, 0.75, 0.5, 0.25, 0].map(ratio => ({
      ratio,
      value: niceMax * ratio,
      y: topPadding + (1 - ratio) * verticalSpace,
    }));

    const barAreaWidth = Math.max(chartWidth - startGap - endGap, 1);
    const slotWidth = data.length > 0 ? barAreaWidth / data.length : 0;
    const barWidth = Math.max(10, Math.min(32, slotWidth * 0.32));
    const barGap = Math.min(12, slotWidth * 0.12);

    const formatCurrency = (value: number) => {
      if (value >= 1000) return `£${Math.round(value).toLocaleString()}`;
      return `£${value.toFixed(0)}`;
    };

    const maxLabels = 7;
    const labelSpacing = data.length > maxLabels ? Math.ceil(data.length / maxLabels) : 1;

    const renderBars = () => {
      if (!data.length) return null;

      return data.map((point, idx) => {
        const centerX = startGap + slotWidth * idx + slotWidth / 2;

        const jobsHeight = Math.max(2, Math.min(verticalSpace, (point.jobs / niceMax) * verticalSpace));
        const paymentsHeight = Math.max(2, Math.min(verticalSpace, (point.payments / niceMax) * verticalSpace));

        return (
          <React.Fragment key={`bars-${idx}`}>
            <View
              style={{
                position: 'absolute',
                left: centerX - barWidth - barGap,
                width: barWidth,
                bottom: bottomPadding,
                height: jobsHeight,
                backgroundColor: '#1976d2',
                borderRadius: 6,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: centerX + barGap,
                width: barWidth,
                bottom: bottomPadding,
                height: paymentsHeight,
                backgroundColor: '#43a047',
                borderRadius: 6,
              }}
            />

            {/* Invisible touch-target area for future tooltips if needed */}
            <Pressable
              style={{
                position: 'absolute',
                left: centerX - slotWidth / 2,
                width: slotWidth,
                top: 0,
                bottom: bottomPadding,
              }}
              onPressIn={() => setActiveIndex(idx)}
              onPressOut={() => setActiveIndex(null)}
              onHoverIn={() => setActiveIndex(idx)}
              onHoverOut={() => setActiveIndex(null)}
            />
          </React.Fragment>
        );
      });
    };

    return (
      <View style={styles.chartWrapper}>
        <View style={styles.barChartRow}>
          <View style={[styles.yAxis, { width: yAxisWidth, height: chartHeight }]}>
            {ticks.map(tick => (
              <View key={`tick-${tick.ratio}`} style={[styles.yAxisLabelContainer, { top: tick.y - 8 }]}>
                <ThemedText style={styles.yAxisLabel}>{formatCurrency(tick.value)}</ThemedText>
              </View>
            ))}
          </View>

          <View style={{ flex: 1 }}>
            <View
              style={[styles.chartArea, { height: chartHeight }]}
              onLayout={({ nativeEvent }) => setChartWidth(nativeEvent.layout.width)}
            >
              {ticks.map(tick => (
                <View key={`grid-${tick.ratio}`} style={[styles.chartGridLine, { top: tick.y }]} />
              ))}

              {activeIndex !== null && data[activeIndex] && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.tooltip,
                    {
                      left: startGap + slotWidth * activeIndex + slotWidth / 2 - 80,
                      top: 8,
                    },
                  ]}
                >
                  <ThemedText style={styles.tooltipLabel}>{data[activeIndex].label}</ThemedText>
                  <ThemedText style={styles.tooltipValue}>Jobs: {formatCurrency(data[activeIndex].jobs)}</ThemedText>
                  <ThemedText style={styles.tooltipValue}>Payments: {formatCurrency(data[activeIndex].payments)}</ThemedText>
                </View>
              )}

              {loading && !hasChartData ? (
                <View style={styles.chartEmptyState}>
                  <ActivityIndicator size="small" />
                  <ThemedText style={styles.placeholderText}>Loading financial activity...</ThemedText>
                </View>
              ) : !hasChartData ? (
                <View style={styles.chartEmptyState}>
                  <Ionicons name="bar-chart-outline" size={28} color="#90a4ae" />
                  <ThemedText style={styles.placeholderText}>No activity yet for this range.</ThemedText>
                </View>
              ) : (
                renderBars()
              )}
            </View>

            {data.length > 0 && (
              <View style={styles.chartLabelRow}>
                {data.map((point, idx) => {
                  if (data.length > maxLabels && idx % labelSpacing !== 0 && idx !== data.length - 1) {
                    return <View key={`label-${idx}`} style={{ width: slotWidth }} />;
                  }

                  return (
                    <View key={`label-${idx}`} style={[styles.chartLabel, { width: slotWidth }]}>
                      <ThemedText style={styles.chartLabelText}>{point.label}</ThemedText>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

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
        <View style={[
          styles.balanceBadge, 
          client.gocardlessEnabled 
            ? { backgroundColor: '#FFD700' } // Yellow for DD
            : { backgroundColor: '#f44336' } // Red for outstanding balance
        ]}>
          <ThemedText style={[
            styles.balanceText,
            client.gocardlessEnabled && { color: '#000000' } // Black text for DD
          ]}>
            {client.gocardlessEnabled ? 'DD' : `£${Math.abs(client.balance).toFixed(2)}`}
          </ThemedText>
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
            <Pressable 
              style={styles.bulkPaymentsButton} 
              onPress={() => {
                if (isLargeScreen) {
                  router.push('/bulk-payments');
                } else {
                  Alert.alert(
                    'Desktop Only',
                    'The bulk payments feature is only available on desktop. Please visit the web app on a computer to add bulk payments.',
                    [{ text: 'OK' }]
                  );
                }
              }}
            >
              <Ionicons name="grid-outline" size={18} color="#fff" />
              <ThemedText style={styles.bulkPaymentsButtonText}>Add Bulk Payments</ThemedText>
            </Pressable>
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
              {/* Left Column: Summary Cards & Financial Chart */}
              <View style={styles.summarySection}>
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

                <SectionCard 
                  title="Financial Summary" 
                  icon={<Ionicons name="analytics-outline" size={22} color="#1976d2" />}
                >
                  <View style={styles.chartHeaderRow}>
                    <View style={styles.chartLegend}>
                      <View style={[styles.legendDot, { backgroundColor: '#1976d2' }]} />
                      <ThemedText style={styles.legendText}>Completed jobs</ThemedText>
                      <View style={[styles.legendDot, { backgroundColor: '#43a047' }]} />
                      <ThemedText style={styles.legendText}>Payments received</ThemedText>
                    </View>
                    <Pressable style={styles.timeframeCycleButton} onPress={cycleRange}>
                      <ThemedText style={styles.timeframeCycleText}>
                        {timeframeOptions.find(option => option.key === chartRange)?.label || 'Change range'}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <View style={styles.chartSummaryRow}>
                    <ThemedText style={styles.chartSummaryText}>
                      Range totals · Jobs: £{completedJobsTotal.toFixed(0)} · Payments: £{paymentsTotal.toFixed(0)}
                    </ThemedText>
                  </View>

                  <FinancialBarChart data={chartData} loading={loading} />
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

              <SectionCard 
                title="Financial Summary" 
                icon={<Ionicons name="analytics-outline" size={22} color="#1976d2" />}
              >
                <View style={styles.chartHeaderRow}>
                  <View style={styles.chartLegend}>
                    <View style={[styles.legendDot, { backgroundColor: '#1976d2' }]} />
                    <ThemedText style={styles.legendText}>Completed jobs</ThemedText>
                    <View style={[styles.legendDot, { backgroundColor: '#43a047' }]} />
                    <ThemedText style={styles.legendText}>Payments received</ThemedText>
                  </View>
                  <Pressable style={styles.timeframeCycleButton} onPress={cycleRange}>
                    <ThemedText style={styles.timeframeCycleText}>
                      {timeframeOptions.find(option => option.key === chartRange)?.label || 'Change range'}
                    </ThemedText>
                  </Pressable>
                </View>
                <View style={styles.chartSummaryRow}>
                  <ThemedText style={styles.chartSummaryText}>
                    Range totals · Jobs: £{completedJobsTotal.toFixed(0)} · Payments: £{paymentsTotal.toFixed(0)}
                  </ThemedText>
                </View>

                <FinancialBarChart data={chartData} loading={loading} />
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
          onAddPayment={handleAddPayment}
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
  bulkPaymentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1976d2',
  },
  bulkPaymentsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    maxWidth: 650,
    gap: 18,
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
    marginBottom: 8,
  },
  mobileSummaryGrid: {
    gap: 16,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d7e3ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  summaryCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
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
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#455a64',
  },
  chartSummaryRow: {
    marginBottom: 8,
  },
  chartSummaryText: {
    fontSize: 12,
    color: '#546e7a',
  },
  timeframeCycleButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d7de',
    backgroundColor: '#fff',
  },
  timeframeCycleText: {
    fontSize: 13,
    color: '#0d47a1',
    fontWeight: '600',
  },
  chartWrapper: {
    width: '100%',
  },
  barChartRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  yAxis: {
    position: 'relative',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 32,
  },
  yAxisLabelContainer: {
    position: 'absolute',
    left: 0,
  },
  yAxisLabel: {
    fontSize: 11,
    color: '#455a64',
    textAlign: 'right',
  },
  chartArea: {
    flex: 1,
    height: 200,
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eceff1',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  chartGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#eceff1',
  },
  chartEmptyState: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chartLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
  },
  chartLabel: {
    alignItems: 'center',
  },
  chartLabelText: {
    fontSize: 11,
    color: '#607d8b',
    textAlign: 'center',
  },
  tooltip: {
    position: 'absolute',
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#dce3eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 5,
  },
  tooltipLabel: {
    fontSize: 12,
    color: '#455a64',
    marginBottom: 4,
    fontWeight: '600',
  },
  tooltipValue: {
    fontSize: 12,
    color: '#263238',
    lineHeight: 16,
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