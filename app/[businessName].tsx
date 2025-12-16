import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../core/firebase';

// Get build ID from environment or fallback to version
const BUILD_ID = '30ec56e';

interface BusinessUser {
  id: string;
  businessName: string;
  email: string;
  name: string;
  bankSortCode?: string;
  bankAccountNumber?: string;
}

interface ClientData {
  id: string;
  name: string;
  accountNumber: string;
  mobileNumber?: string;
  email?: string;
  address1?: string;
  town?: string;
  postcode?: string;
  startingBalance?: number;
}

interface ServicePlan {
  id: string;
  serviceType: string;
  scheduleType: 'recurring' | 'one_off';
  frequencyWeeks?: number;
  startDate?: string;
  price: number;
  isActive: boolean;
  nextServiceDate?: string; // Calculated from pending jobs
}

interface HistoryItem {
  id: string;
  type: 'job' | 'payment';
  date: string;
  description: string;
  amount: number;
}

type LoginStep = 'account' | 'phone' | 'dashboard';

export default function ClientPortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const [businessName, setBusinessName] = useState('');
  const [businessUser, setBusinessUser] = useState<BusinessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  
  // Multi-step login state
  const [step, setStep] = useState<LoginStep>('account');
  const [accountNumberSuffix, setAccountNumberSuffix] = useState(''); // The part after "RWC"
  const [phoneLast4, setPhoneLast4] = useState('');
  const [foundClient, setFoundClient] = useState<ClientData | null>(null);
  const [error, setError] = useState('');
  
  // Dashboard state
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [nextServiceDate, setNextServiceDate] = useState<string | null>(null);
  const [nextServiceType, setNextServiceType] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  
  // Edit mode state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Quote request form state
  const [quoteName, setQuoteName] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteAddress, setQuoteAddress] = useState('');
  const [quoteTown, setQuoteTown] = useState('');
  const [quotePostcode, setQuotePostcode] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteSubmitted, setQuoteSubmitted] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  
  const isNarrowWeb = Platform.OS === 'web' && width < 640;

  useEffect(() => {
    // Extract business name from route params
    const extractedName = typeof params.businessName === 'string' 
      ? decodeURIComponent(params.businessName)
      : (typeof window !== 'undefined' ? decodeURIComponent(window.location.pathname.substring(1)) : '');
    
    if (extractedName) {
      console.log('🏢 Business portal loading for:', extractedName);
      setBusinessName(extractedName);
      lookupBusinessUser(extractedName);
    }
  }, [params.businessName]);

  const lookupBusinessUser = async (name: string) => {
    try {
      setLoading(true);

      // Normalize the business name from URL (remove spaces, handle case)
      const normalizedName = name.replace(/\s+/g, '').toLowerCase();

      // Query the businessPortals collection (publicly readable)
      // Document ID is the normalized business name
      const portalDoc = await getDoc(doc(db, 'businessPortals', normalizedName));

      if (portalDoc.exists()) {
        const portalData = portalDoc.data();
        setBusinessUser({
          id: portalData.ownerId,
          businessName: portalData.businessName,
          email: portalData.email || '',
          name: portalData.ownerName || ''
        });
      } else {
        if (typeof window !== 'undefined') {
          window.alert('Business not found. Please check the URL and try again.');
        }
        router.replace('/login');
      }
    } catch (error) {
      console.error('Error looking up business:', error);
      if (typeof window !== 'undefined') {
        window.alert('Unable to load business information. Please try again.');
      }
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Check if account number exists
  const handleAccountLookup = async () => {
    if (!accountNumberSuffix.trim()) {
      setError('Please enter your account number');
      return;
    }

    if (!businessUser) {
      setError('Business information not available');
      return;
    }

    setError('');
    setAuthLoading(true);

    try {
      // Build the full account number with RWC prefix
      const fullAccountNumber = `RWC${accountNumberSuffix.trim().toUpperCase()}`;
      
      console.log('🔍 Looking up client with account:', fullAccountNumber, 'for business:', businessUser.id);

      // Query the root clients collection for matching account number AND ownerId
      // Clients are stored in /clients with an ownerId field, not in a subcollection
      const clientsRef = collection(db, 'clients');
      const q = query(
        clientsRef, 
        where('ownerId', '==', businessUser.id),
        where('accountNumber', '==', fullAccountNumber)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('Account not found. Please check your account number and try again.');
        setAuthLoading(false);
        return;
      }

      // Found the client
      const clientDoc = querySnapshot.docs[0];
      const clientData = clientDoc.data();
      
      setFoundClient({
        id: clientDoc.id,
        name: clientData.name || '',
        accountNumber: clientData.accountNumber || '',
        mobileNumber: clientData.mobileNumber || ''
      });

      // Move to phone verification step
      setStep('phone');

    } catch (err: any) {
      console.error('Account lookup error:', err);
      setError('Unable to verify account. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2: Verify phone number
  const handlePhoneVerification = async () => {
    if (!phoneLast4.trim() || phoneLast4.length !== 4) {
      setError('Please enter the last 4 digits of your phone number');
      return;
    }

    if (!foundClient) {
      setError('Client information not available');
      return;
    }

    setError('');
    setAuthLoading(true);

    try {
      // Get the last 4 digits of the stored phone number
      const storedPhone = foundClient.mobileNumber || '';
      // Remove any non-digit characters and get last 4
      const storedLast4 = storedPhone.replace(/\D/g, '').slice(-4);

      if (storedLast4.length < 4) {
        // No valid phone number on file
        setError('Phone verification unavailable. Please contact the business directly.');
        setAuthLoading(false);
        return;
      }

      if (phoneLast4 !== storedLast4) {
        setError('Phone number does not match. Please try again.');
        setAuthLoading(false);
        return;
      }

      // Success! Load dashboard data
      await loadDashboardData(foundClient.id);
      setStep('dashboard');

    } catch (err: any) {
      console.error('Phone verification error:', err);
      setError('Verification failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Load dashboard data after successful login
  const loadDashboardData = async (clientId: string) => {
    if (!businessUser) return;
    
    setDashboardLoading(true);
    try {
      // Fetch business owner's banking info
      const ownerDoc = await getDoc(doc(db, 'users', businessUser.id));
      if (ownerDoc.exists()) {
        const ownerData = ownerDoc.data();
        setBusinessUser(prev => prev ? {
          ...prev,
          bankSortCode: ownerData.bankSortCode || '',
          bankAccountNumber: ownerData.bankAccountNumber || ''
        } : prev);
      }

      // Fetch full client data
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (clientDoc.exists()) {
        const data = clientDoc.data();
        setFoundClient({
          id: clientId,
          name: data.name || '',
          accountNumber: data.accountNumber || '',
          mobileNumber: data.mobileNumber || '',
          email: data.email || '',
          address1: data.address1 || '',
          town: data.town || '',
          postcode: data.postcode || '',
          startingBalance: data.startingBalance || 0
        });
        setEditName(data.name || '');
        setEditMobile(data.mobileNumber || '');
      }

      // Fetch service plans
      const plansQuery = query(
        collection(db, 'servicePlans'),
        where('clientId', '==', clientId),
        where('isActive', '==', true)
      );
      const plansSnapshot = await getDocs(plansQuery);
      const plans = plansSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ServicePlan[];

      // Fetch pending jobs to get actual next service dates
      const pendingJobsQuery = query(
        collection(db, 'jobs'),
        where('clientId', '==', clientId),
        where('status', 'in', ['pending', 'scheduled', 'in_progress'])
      );
      const pendingJobsSnapshot = await getDocs(pendingJobsQuery);
      const now = new Date();
      
      // Find next job date for each service type AND overall next service
      const nextServiceDates: Record<string, string> = {};
      let overallNextDate: Date | null = null;
      let overallNextType: string | null = null;
      
      pendingJobsSnapshot.forEach(doc => {
        const job = doc.data();
        if (job.scheduledTime) {
          const jobDate = new Date(job.scheduledTime);
          if (jobDate >= now) {
            const serviceId = job.serviceId || 'Service';
            
            // Track per-service-type dates
            const existingDate = nextServiceDates[serviceId];
            if (!existingDate || jobDate < new Date(existingDate)) {
              nextServiceDates[serviceId] = job.scheduledTime;
            }
            
            // Track overall next service
            if (!overallNextDate || jobDate < overallNextDate) {
              overallNextDate = jobDate;
              overallNextType = serviceId;
            }
          }
        }
      });

      // Set overall next service (shown if no service plans or as backup)
      setNextServiceDate(overallNextDate ? overallNextDate.toISOString() : null);
      setNextServiceType(overallNextType);

      // Attach next service dates to plans
      const plansWithDates = plans.map(plan => ({
        ...plan,
        nextServiceDate: nextServiceDates[plan.serviceType] || undefined
      }));
      setServicePlans(plansWithDates);

      // Fetch completed jobs
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('clientId', '==', clientId),
        where('status', '==', 'completed')
      );
      const jobsSnapshot = await getDocs(jobsQuery);
      const jobs = jobsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'job' as const,
          date: data.scheduledTime || '',
          description: data.serviceId || 'Service',
          amount: data.price || 0
        };
      });

      // Fetch payments
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('clientId', '==', clientId)
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'payment' as const,
          date: data.date || '',
          description: `Payment (${data.method || 'unknown'})`,
          amount: data.amount || 0
        };
      });

      // Combine and sort history by date (newest first)
      const combinedHistory = [...jobs, ...payments];
      combinedHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(combinedHistory);

      // Calculate balance
      const totalBilled = jobs.reduce((sum, job) => sum + job.amount, 0);
      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const startingBal = foundClient?.startingBalance || 0;
      setBalance(totalPaid - totalBilled + startingBal);

    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setDashboardLoading(false);
    }
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!foundClient) return;
    
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'clients', foundClient.id), {
        name: editName.trim(),
        mobileNumber: editMobile.trim()
      });
      
      setFoundClient({
        ...foundClient,
        name: editName.trim(),
        mobileNumber: editMobile.trim()
      });
      setIsEditingProfile(false);
      
      if (Platform.OS === 'web') {
        window.alert('Profile updated successfully!');
      } else {
        Alert.alert('Success', 'Profile updated successfully!');
      }
    } catch (err) {
      console.error('Error saving profile:', err);
      if (Platform.OS === 'web') {
        window.alert('Failed to save changes. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to save changes. Please try again.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Format frequency for display
  const formatFrequency = (weeks?: number) => {
    if (!weeks) return 'One-off';
    if (weeks === 1) return 'Weekly';
    if (weeks === 2) return 'Fortnightly';
    if (weeks === 4) return '4 Weekly';
    if (weeks === 8) return '8 Weekly';
    if (weeks === 12) return '12 Weekly';
    return `Every ${weeks} weeks`;
  };

  // Handle quote request submission
  const handleQuoteSubmit = async () => {
    // Validate required fields
    if (!quoteName.trim()) {
      setQuoteError('Please enter your name');
      return;
    }
    if (!quotePhone.trim()) {
      setQuoteError('Please enter your contact number');
      return;
    }
    if (!quoteAddress.trim()) {
      setQuoteError('Please enter your address');
      return;
    }
    if (!quoteTown.trim()) {
      setQuoteError('Please enter your town');
      return;
    }
    if (!quotePostcode.trim()) {
      setQuoteError('Please enter your postcode');
      return;
    }
    if (!businessUser) {
      setQuoteError('Business information not available');
      return;
    }

    setQuoteError('');
    setQuoteSubmitting(true);

    try {
      // Save quote request to Firestore
      await addDoc(collection(db, 'quoteRequests'), {
        businessId: businessUser.id,
        businessName: businessUser.businessName,
        name: quoteName.trim(),
        phone: quotePhone.trim(),
        address: quoteAddress.trim(),
        town: quoteTown.trim(),
        postcode: quotePostcode.trim(),
        email: quoteEmail.trim() || null,
        notes: quoteNotes.trim() || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        source: 'client_portal'
      });

      setQuoteSubmitted(true);
      // Clear form
      setQuoteName('');
      setQuotePhone('');
      setQuoteAddress('');
      setQuoteTown('');
      setQuotePostcode('');
      setQuoteEmail('');
      setQuoteNotes('');

    } catch (err) {
      console.error('Error submitting quote request:', err);
      setQuoteError('Failed to submit request. Please try again.');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  // Go back to account step
  const handleBackToAccount = () => {
    setStep('account');
    setPhoneLast4('');
    setFoundClient(null);
    setError('');
  };

  const handleNavigation = (path: string) => {
    if (Platform.OS === 'web') {
      window.location.href = path;
    } else {
      router.push(path as any);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!businessUser) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Business not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Navigation Header */}
      <View style={styles.navigation}>
        <View style={[styles.navContent, isNarrowWeb && styles.navContentMobile]}>
          <Pressable onPress={() => handleNavigation('/home')} style={styles.logoContainer}>
            <Image
              source={require('../assets/images/logo_transparent.png')}
              style={[styles.navLogo, isNarrowWeb && styles.navLogoMobile]}
              resizeMode="contain"
            />
          </Pressable>

          {Platform.OS === 'web' && (
            <View style={styles.navLinks}>
              <Pressable onPress={() => handleNavigation('/home')} style={styles.navLink}>
                <Text style={styles.navLinkText}>Home</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/pricing')} style={styles.navLink}>
                <Text style={styles.navLinkText}>Pricing</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/about')} style={styles.navLink}>
                <Text style={styles.navLinkText}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')} style={styles.navLink}>
                <Text style={styles.navLinkText}>Contact</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, isNarrowWeb && styles.heroTitleMobile]}>
            {businessUser.businessName}
          </Text>
          {step !== 'dashboard' && (
            <Text style={[styles.heroSubtitle, isNarrowWeb && styles.heroSubtitleMobile]}>
              Client Portal - Sign in to view your account
            </Text>
          )}
        </View>

        {step === 'dashboard' ? (
          // Dashboard View
          <View style={styles.dashboardContainer}>
            {dashboardLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4f46e5" />
                <Text style={styles.loadingText}>Loading your account...</Text>
              </View>
            ) : (
              <>
                {/* Welcome Header */}
                <View style={styles.welcomeHeader}>
                  <Text style={styles.welcomeTitle}>Welcome back, {foundClient?.name}!</Text>
                  <Text style={styles.welcomeAccount}>{foundClient?.accountNumber}</Text>
                </View>

                {/* Balance Card */}
                <View style={[styles.dashboardCard, styles.balanceCard]}>
                  <Text style={styles.cardTitle}>Account Balance</Text>
                  <Text style={[
                    styles.balanceAmount,
                    balance >= 0 ? styles.balancePositive : styles.balanceNegative
                  ]}>
                    {balance >= 0 ? '+' : ''}£{Math.abs(balance).toFixed(2)}
                  </Text>
                  <Text style={styles.balanceNote}>
                    {balance >= 0 ? 'Credit on account' : 'Amount owing'}
                  </Text>
                </View>

                {/* Payment Info Card - shown when balance is negative */}
                {balance < 0 && (businessUser?.bankSortCode || businessUser?.bankAccountNumber) && (
                  <View style={[styles.dashboardCard, styles.paymentCard]}>
                    <Text style={styles.paymentCardTitle}>Payment Details</Text>
                    <Text style={styles.paymentCardSubtitle}>
                      Please use the following details to make your payment
                    </Text>
                    
                    <View style={styles.paymentDetails}>
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Account Name</Text>
                        <Text style={styles.paymentValue}>{businessUser.businessName}</Text>
                      </View>
                      {businessUser.bankSortCode && (
                        <View style={styles.paymentRow}>
                          <Text style={styles.paymentLabel}>Sort Code</Text>
                          <Text style={styles.paymentValue}>{businessUser.bankSortCode}</Text>
                        </View>
                      )}
                      {businessUser.bankAccountNumber && (
                        <View style={styles.paymentRow}>
                          <Text style={styles.paymentLabel}>Account Number</Text>
                          <Text style={styles.paymentValue}>{businessUser.bankAccountNumber}</Text>
                        </View>
                      )}
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Your Reference</Text>
                        <Text style={styles.paymentValueBold}>{foundClient?.accountNumber}</Text>
                      </View>
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Amount Due</Text>
                        <Text style={styles.paymentValueBold}>£{Math.abs(balance).toFixed(2)}</Text>
                      </View>
                    </View>
                    
                    <Text style={styles.paymentNote}>
                      Please include your reference number when making payment
                    </Text>
                  </View>
                )}

                {/* Service Details Card */}
                <View style={styles.dashboardCard}>
                  <Text style={styles.cardTitle}>Your Services</Text>
                  {servicePlans.length === 0 && !nextServiceDate ? (
                    <Text style={styles.emptyText}>No active services</Text>
                  ) : servicePlans.length === 0 && nextServiceDate ? (
                    // Show next service from jobs even if no service plans exist
                    <View style={styles.serviceItem}>
                      <View style={styles.serviceHeader}>
                        <Text style={styles.serviceType}>{nextServiceType || 'Service'}</Text>
                      </View>
                      <View style={styles.serviceDetails}>
                        <Text style={styles.serviceDetail}>
                          <Text style={styles.serviceLabel}>Next Service: </Text>
                          {formatDate(nextServiceDate)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    servicePlans.map((plan) => (
                      <View key={plan.id} style={styles.serviceItem}>
                        <View style={styles.serviceHeader}>
                          <Text style={styles.serviceType}>{plan.serviceType}</Text>
                          <Text style={styles.servicePrice}>£{plan.price.toFixed(2)}</Text>
                        </View>
                        <View style={styles.serviceDetails}>
                          <Text style={styles.serviceDetail}>
                            <Text style={styles.serviceLabel}>Frequency: </Text>
                            {formatFrequency(plan.frequencyWeeks)}
                          </Text>
                          {plan.nextServiceDate && (
                            <Text style={styles.serviceDetail}>
                              <Text style={styles.serviceLabel}>Next Service: </Text>
                              {formatDate(plan.nextServiceDate)}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* Contact Details Card */}
                <View style={styles.dashboardCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Your Details</Text>
                    {!isEditingProfile && (
                      <Pressable onPress={() => setIsEditingProfile(true)}>
                        <Text style={styles.editButton}>Edit</Text>
                      </Pressable>
                    )}
                  </View>
                  
                  {isEditingProfile ? (
                    <View style={styles.editForm}>
                      <View style={styles.editField}>
                        <Text style={styles.editLabel}>Name</Text>
                        <TextInput
                          style={styles.editInput}
                          value={editName}
                          onChangeText={setEditName}
                          placeholder="Your name"
                        />
                      </View>
                      <View style={styles.editField}>
                        <Text style={styles.editLabel}>Mobile Number</Text>
                        <TextInput
                          style={styles.editInput}
                          value={editMobile}
                          onChangeText={setEditMobile}
                          placeholder="Your mobile number"
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.editButtons}>
                        <Pressable 
                          style={styles.cancelButton} 
                          onPress={() => {
                            setIsEditingProfile(false);
                            setEditName(foundClient?.name || '');
                            setEditMobile(foundClient?.mobileNumber || '');
                          }}
                        >
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </Pressable>
                        <Pressable 
                          style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]}
                          onPress={handleSaveProfile}
                          disabled={savingProfile}
                        >
                          {savingProfile ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.saveButtonText}>Save Changes</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.contactInfo}>
                      <View style={styles.contactRow}>
                        <Text style={styles.contactLabel}>Name</Text>
                        <Text style={styles.contactValue}>{foundClient?.name || 'Not set'}</Text>
                      </View>
                      <View style={styles.contactRow}>
                        <Text style={styles.contactLabel}>Mobile</Text>
                        <Text style={styles.contactValue}>{foundClient?.mobileNumber || 'Not set'}</Text>
                      </View>
                      {foundClient?.email && (
                        <View style={styles.contactRow}>
                          <Text style={styles.contactLabel}>Email</Text>
                          <Text style={styles.contactValue}>{foundClient.email}</Text>
                        </View>
                      )}
                      {foundClient?.address1 && (
                        <View style={styles.contactRow}>
                          <Text style={styles.contactLabel}>Address</Text>
                          <Text style={styles.contactValue}>
                            {[foundClient.address1, foundClient.town, foundClient.postcode].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Service History Card */}
                <View style={styles.dashboardCard}>
                  <Text style={styles.cardTitle}>Service History</Text>
                  {history.length === 0 ? (
                    <Text style={styles.emptyText}>No service history yet</Text>
                  ) : (
                    <View style={styles.historyList}>
                      {history.map((item) => (
                        <View key={item.id} style={styles.historyItem}>
                          <View style={styles.historyLeft}>
                            <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
                            <Text style={styles.historyDesc}>{item.description}</Text>
                          </View>
                          <Text style={[
                            styles.historyAmount,
                            item.type === 'payment' ? styles.historyPayment : styles.historyJob
                          ]}>
                            {item.type === 'payment' ? '+' : '-'}£{item.amount.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Logout Button */}
                <Pressable 
                  style={styles.logoutButton}
                  onPress={() => {
                    setStep('account');
                    setFoundClient(null);
                    setAccountNumberSuffix('');
                    setPhoneLast4('');
                    setServicePlans([]);
                    setHistory([]);
                    setBalance(0);
                  }}
                >
                  <Text style={styles.logoutButtonText}>Sign Out</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          /* Login and Quote Forms Container */
          <View style={[styles.formsContainer, isNarrowWeb && styles.formsContainerMobile]}>
            {/* Login Form Card */}
            <View style={[styles.loginCard, styles.formCard, isNarrowWeb && styles.loginCardMobile, isNarrowWeb && styles.formCardMobile]}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Existing Customer?</Text>
                <Text style={styles.formSubtitle}>
                  {step === 'account' 
                    ? 'Sign in to view your account'
                    : 'Verify your identity'}
                </Text>
              </View>

              {/* Step indicator */}
              <View style={styles.stepIndicator}>
                <View style={[styles.stepDot, styles.stepDotActive]} />
                <View style={[styles.stepLine, step === 'phone' && styles.stepLineActive]} />
                <View style={[styles.stepDot, step === 'phone' && styles.stepDotActive]} />
              </View>

              <View style={styles.form}>
                {step === 'account' ? (
                  // Step 1: Account Number
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Account Number</Text>
                      <View style={styles.accountInputContainer}>
                        <View style={styles.accountPrefix}>
                          <Text style={styles.accountPrefixText}>RWC</Text>
                        </View>
                        <TextInput
                          style={styles.accountInput}
                          placeholder="123456"
                          value={accountNumberSuffix}
                          onChangeText={(text) => {
                            setAccountNumberSuffix(text.toUpperCase());
                            setError('');
                          }}
                          autoCapitalize="characters"
                          autoComplete="username"
                          keyboardType="default"
                        />
                      </View>
                    </View>

                    {error ? (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      style={[styles.submitButton, authLoading && styles.submitButtonDisabled]}
                      onPress={handleAccountLookup}
                      disabled={authLoading}
                    >
                      {authLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Next</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  // Step 2: Phone Verification
                  <>
                    <View style={styles.clientInfoBox}>
                      <Text style={styles.clientInfoLabel}>Account found:</Text>
                      <Text style={styles.clientInfoAccount}>{foundClient?.accountNumber}</Text>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Last 4 digits of your phone number</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="1234"
                        value={phoneLast4}
                        onChangeText={(text) => {
                          // Only allow digits, max 4
                          const digits = text.replace(/\D/g, '').slice(0, 4);
                          setPhoneLast4(digits);
                          setError('');
                        }}
                        keyboardType="number-pad"
                        maxLength={4}
                      />
                    </View>

                    {error ? (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      style={[styles.submitButton, authLoading && styles.submitButtonDisabled]}
                      onPress={handlePhoneVerification}
                      disabled={authLoading}
                    >
                      {authLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Verify & Sign In</Text>
                      )}
                    </Pressable>

                    <Pressable style={styles.backButton} onPress={handleBackToAccount}>
                      <Text style={styles.backButtonText}>← Back to account number</Text>
                    </Pressable>
                  </>
                )}

                <View style={styles.formLinks}>
                  <Text style={styles.helpText}>
                    Need help? Contact {businessUser.businessName}
                  </Text>
                </View>
              </View>
            </View>

            {/* Get a Quote Card */}
            <View style={[styles.quoteCard, styles.formCard, isNarrowWeb && styles.quoteCardMobile, isNarrowWeb && styles.formCardMobile]}>
              {quoteSubmitted ? (
                <View style={styles.quoteSuccessContainer}>
                  <Text style={styles.quoteSuccessIcon}>✓</Text>
                  <Text style={styles.quoteSuccessTitle}>Request Sent!</Text>
                  <Text style={styles.quoteSuccessText}>
                    Thank you for your enquiry. {businessUser.businessName} will be in touch soon.
                  </Text>
                  <Pressable 
                    style={styles.quoteAnotherButton}
                    onPress={() => setQuoteSubmitted(false)}
                  >
                    <Text style={styles.quoteAnotherButtonText}>Submit Another Request</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.formHeader}>
                    <Text style={styles.formTitle}>Get a Quote</Text>
                    <Text style={styles.formSubtitle}>
                      New customer? Request a free quote
                    </Text>
                  </View>

                  <View style={styles.form}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Your full name"
                        value={quoteName}
                        onChangeText={(text) => {
                          setQuoteName(text);
                          setQuoteError('');
                        }}
                        autoComplete="name"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Contact Number <Text style={styles.required}>*</Text></Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Your phone number"
                        value={quotePhone}
                        onChangeText={(text) => {
                          setQuotePhone(text);
                          setQuoteError('');
                        }}
                        keyboardType="phone-pad"
                        autoComplete="tel"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Address <Text style={styles.required}>*</Text></Text>
                      <TextInput
                        style={styles.input}
                        placeholder="First line of address"
                        value={quoteAddress}
                        onChangeText={(text) => {
                          setQuoteAddress(text);
                          setQuoteError('');
                        }}
                        autoComplete="street-address"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Town <Text style={styles.required}>*</Text></Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Town or city"
                        value={quoteTown}
                        onChangeText={(text) => {
                          setQuoteTown(text);
                          setQuoteError('');
                        }}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Postcode <Text style={styles.required}>*</Text></Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Postcode"
                        value={quotePostcode}
                        onChangeText={(text) => {
                          setQuotePostcode(text.toUpperCase());
                          setQuoteError('');
                        }}
                        autoCapitalize="characters"
                        autoComplete="postal-code"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Email</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Your email (optional)"
                        value={quoteEmail}
                        onChangeText={setQuoteEmail}
                        keyboardType="email-address"
                        autoComplete="email"
                        autoCapitalize="none"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Notes</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Any additional information (optional)"
                        value={quoteNotes}
                        onChangeText={setQuoteNotes}
                        multiline
                        numberOfLines={3}
                      />
                    </View>

                    {quoteError ? (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{quoteError}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      style={[styles.quoteSubmitButton, quoteSubmitting && styles.submitButtonDisabled]}
                      onPress={handleQuoteSubmit}
                      disabled={quoteSubmitting}
                    >
                      {quoteSubmitting ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitButtonText}>Request Quote</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <View style={styles.footerSection}>
            <Image
              source={require('../assets/images/logo_colourInverted.png')}
              style={[styles.footerLogo, isNarrowWeb && styles.footerLogoMobile]}
              resizeMode="contain"
            />
          </View>

          <View style={styles.footerLinks}>
            <View style={styles.footerColumn}>
              <Text style={styles.footerColumnTitle}>Company</Text>
              <Pressable onPress={() => handleNavigation('/about')}>
                <Text style={styles.footerLink}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')}>
                <Text style={styles.footerLink}>Contact</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.footerBottom}>
          <Text style={styles.copyright}>© 2025 Guvnor. All rights reserved.</Text>
          <Text style={styles.build}>Build: {BUILD_ID}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    flexGrow: 1,
  },

  // Navigation
  navigation: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      default: {
        elevation: 2,
      },
    }),
  },
  navContent: {
    maxWidth: Platform.OS === 'web' ? 1280 : '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navContentMobile: {
    justifyContent: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navLogo: {
    width: 520,
    height: 140,
  },
  navLogoMobile: {
    width: 440,
    height: 120,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  navLink: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },

  // Main Content
  mainContent: {
    flex: 1,
    maxWidth: Platform.OS === 'web' ? 1280 : '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
  },

  // Hero Section
  heroSection: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: Platform.OS === 'web' ? 48 : 32,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  heroTitleMobile: {
    fontSize: 28,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 20,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 600,
    lineHeight: 28,
  },
  heroSubtitleMobile: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 8,
  },

  // Forms Container (side by side layout)
  formsContainer: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 24,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 48,
  },
  formsContainerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  formCard: {
    flex: Platform.OS === 'web' ? 1 : undefined,
    maxWidth: Platform.OS === 'web' ? 420 : '100%',
  },
  formCardMobile: {
    flex: undefined,
  },

  // Login Card
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 25,
        borderWidth: 1,
        borderColor: '#e5e7eb',
      },
      default: {
        elevation: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
      },
    }),
  },
  loginCardMobile: {
    padding: 20,
  },

  // Quote Card
  quoteCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 25,
        borderWidth: 1,
        borderColor: '#10b981',
        borderTopWidth: 4,
      },
      default: {
        elevation: 8,
        borderWidth: 1,
        borderColor: '#10b981',
        borderTopWidth: 4,
      },
    }),
  },
  quoteCardMobile: {
    padding: 20,
  },
  quoteSubmitButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  quoteSuccessContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  quoteSuccessIcon: {
    fontSize: 48,
    color: '#10b981',
    marginBottom: 16,
  },
  quoteSuccessTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#065f46',
    marginBottom: 8,
  },
  quoteSuccessText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  quoteAnotherButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  quoteAnotherButtonText: {
    fontSize: 14,
    color: '#10b981',
    textDecorationLine: 'underline',
  },
  required: {
    color: '#dc2626',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  formLogo: {
    width: 480,
    height: 192,
    marginBottom: 16,
  },
  formLogoMobile: {
    width: 360,
    height: 144,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },

  // Form
  form: {
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
  },

  // Account number input with prefix
  accountInputContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  accountPrefix: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRightWidth: 0,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  accountPrefixText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  accountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
  },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  stepDotActive: {
    backgroundColor: '#4f46e5',
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#4f46e5',
  },

  // Client info box (shown in step 2)
  clientInfoBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  clientInfoLabel: {
    fontSize: 12,
    color: '#166534',
    marginBottom: 4,
  },
  clientInfoName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#166534',
  },
  clientInfoAccount: {
    fontSize: 14,
    color: '#166534',
    marginTop: 2,
  },

  // Error container
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },

  submitButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Back button
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 14,
    color: '#4f46e5',
  },

  // Dashboard styles
  dashboardContainer: {
    width: '100%',
    maxWidth: 800,
    marginHorizontal: 'auto',
    paddingBottom: 48,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  welcomeHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  welcomeAccount: {
    fontSize: 14,
    color: '#6b7280',
  },
  dashboardCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      default: {
        elevation: 2,
      },
    }),
  },
  balanceCard: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  paymentCard: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  paymentCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
  },
  paymentCardSubtitle: {
    fontSize: 14,
    color: '#a16207',
    marginBottom: 16,
  },
  paymentDetails: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  paymentRowHighlight: {
    backgroundColor: '#fef9c3',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderBottomColor: '#fde047',
  },
  paymentLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  paymentValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  paymentValueBold: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  paymentNote: {
    fontSize: 13,
    color: '#92400e',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  balancePositive: {
    color: '#16a34a',
  },
  balanceNegative: {
    color: '#dc2626',
  },
  balanceNote: {
    fontSize: 14,
    color: '#6b7280',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 16,
  },
  serviceItem: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    marginTop: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  servicePrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4f46e5',
  },
  serviceDetails: {
    gap: 4,
  },
  serviceDetail: {
    fontSize: 14,
    color: '#6b7280',
  },
  serviceLabel: {
    fontWeight: '500',
    color: '#374151',
  },
  editButton: {
    fontSize: 14,
    color: '#4f46e5',
    fontWeight: '500',
  },
  contactInfo: {
    gap: 12,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  contactValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  editForm: {
    gap: 16,
  },
  editField: {
    gap: 6,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#4f46e5',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  historyList: {
    gap: 0,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  historyLeft: {
    flex: 1,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  historyDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyPayment: {
    color: '#16a34a',
  },
  historyJob: {
    color: '#dc2626',
  },
  historyMore: {
    textAlign: 'center',
    fontSize: 13,
    color: '#6b7280',
    paddingTop: 12,
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 16,
  },
  logoutButtonText: {
    fontSize: 14,
    color: '#6b7280',
    textDecorationLine: 'underline',
  },

  // Form Links
  formLinks: {
    gap: 16,
    alignItems: 'center',
  },
  helpText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },

  // Footer
  footer: {
    backgroundColor: '#111827',
    paddingVertical: 48,
  },
  footerContent: {
    maxWidth: Platform.OS === 'web' ? 1280 : '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 32,
  },
  footerSection: {
    flex: 1,
    alignItems: 'center',
  },
  footerLogo: {
    width: 360,
    height: 112,
    marginBottom: 16,
  },
  footerLogoMobile: {
    width: 288,
    height: 96,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 48,
  },
  footerColumn: {
    gap: 8,
  },
  footerColumnTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  footerLink: {
    color: '#9ca3af',
    fontSize: 14,
    paddingVertical: 4,
  },
  footerBottom: {
    maxWidth: Platform.OS === 'web' ? 1280 : '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    marginTop: 32,
    paddingTop: 32,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copyright: {
    color: '#9ca3af',
    fontSize: 14,
  },
  build: {
    color: '#6b7280',
    fontSize: 12,
  },
  errorText: {
    fontSize: 18,
    color: '#f44336',
    textAlign: 'center',
    marginTop: 48,
  },
});
