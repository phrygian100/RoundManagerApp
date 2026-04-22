import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useBusinessPortal, BusinessUser, PORTAL_API_ORIGIN } from '../../hooks/useBusinessPortal';
import { portalStyles } from '../../styles/portalStyles';

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
  nextServiceDate?: string;
}

interface HistoryItem {
  id: string;
  type: 'job' | 'payment';
  date: string;
  description: string;
  amount: number;
}

type LoginStep = 'account' | 'phone' | 'dashboard';

export default function ClientLoginScreen() {
  const { businessUser, setBusinessUser, loading, businessName, isNarrowWeb, handleNavigation, router } = useBusinessPortal();

  const [authLoading, setAuthLoading] = useState(false);
  const [portalSessionId, setPortalSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<LoginStep>('account');
  const [accountNumberSuffix, setAccountNumberSuffix] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [foundClient, setFoundClient] = useState<ClientData | null>(null);
  const [error, setError] = useState('');

  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [nextServiceDate, setNextServiceDate] = useState<string | null>(null);
  const [nextServiceType, setNextServiceType] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const handleAccountLookup = async () => {
    if (!accountNumberSuffix.trim()) { setError('Please enter your account number'); return; }
    if (!businessUser) { setError('Business information not available'); return; }

    setError('');
    setAuthLoading(true);
    try {
      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/lookupAccount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessOwnerId: businessUser.id, accountNumberSuffix: accountNumberSuffix.trim() }),
      });
      const data = await resp.json();
      if (!data?.ok) { setError(data?.error || 'Account not found. Please check your account number and try again.'); return; }

      setFoundClient({
        id: data.client.id,
        name: data.client.name || '',
        accountNumber: data.client.accountNumber || '',
        mobileNumber: '',
      });
      setStep('phone');
    } catch (err: any) {
      console.error('Account lookup error:', err);
      setError('Unable to verify account. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePhoneVerification = async () => {
    if (!phoneLast4.trim() || phoneLast4.length !== 4) { setError('Please enter the last 4 digits of your phone number'); return; }
    if (!foundClient) { setError('Client information not available'); return; }

    setError('');
    setAuthLoading(true);
    try {
      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/verifyPhone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessOwnerId: businessUser?.id, clientId: foundClient.id, phoneLast4: phoneLast4.trim() }),
      });
      const data = await resp.json();
      if (!data?.ok || !data?.sessionId) { setError(data?.error || 'Verification failed. Please try again.'); return; }

      setPortalSessionId(data.sessionId);
      await loadDashboardData(data.sessionId);
      setStep('dashboard');
    } catch (err: any) {
      console.error('Phone verification error:', err);
      setError('Verification failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const loadDashboardData = async (sessionId: string) => {
    if (!businessUser) return;
    setDashboardLoading(true);
    try {
      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/dashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || 'Failed to load dashboard');

      setBusinessUser((prev: BusinessUser | null) => prev ? {
        ...prev,
        bankSortCode: data.owner?.bankSortCode || '',
        bankAccountNumber: data.owner?.bankAccountNumber || '',
      } : prev);

      const c = data.client || {};
      setFoundClient({
        id: c.id, name: c.name || '', accountNumber: c.accountNumber || '',
        mobileNumber: c.mobileNumber || '', email: c.email || '',
        address1: c.address1 || '', town: c.town || '', postcode: c.postcode || '',
        startingBalance: c.startingBalance || 0,
      });
      setEditName(c.name || '');
      setEditMobile(c.mobileNumber || '');
      setServicePlans((data.servicePlans || []) as ServicePlan[]);
      setNextServiceDate(data.nextServiceDate || null);
      setNextServiceType(data.nextServiceType || null);
      setHistory((data.history || []) as HistoryItem[]);
      setBalance(typeof data.balance === 'number' ? data.balance : 0);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setDashboardLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!foundClient || !portalSessionId) return;
    setSavingProfile(true);
    try {
      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/updateProfile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: portalSessionId, name: editName.trim(), mobileNumber: editMobile.trim() }),
      });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || 'Failed to save changes');

      setFoundClient({ ...foundClient, name: editName.trim(), mobileNumber: editMobile.trim() });
      setIsEditingProfile(false);
      if (Platform.OS === 'web') { window.alert('Profile updated successfully!'); }
      else { Alert.alert('Success', 'Profile updated successfully!'); }
    } catch (err) {
      console.error('Error saving profile:', err);
      if (Platform.OS === 'web') { window.alert('Failed to save changes. Please try again.'); }
      else { Alert.alert('Error', 'Failed to save changes. Please try again.'); }
    } finally {
      setSavingProfile(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return dateStr; }
  };

  const formatFrequency = (weeks?: number) => {
    if (!weeks) return 'One-off';
    if (weeks === 1) return 'Weekly';
    if (weeks === 2) return 'Fortnightly';
    if (weeks === 4) return '4 Weekly';
    if (weeks === 8) return '8 Weekly';
    if (weeks === 12) return '12 Weekly';
    return `Every ${weeks} weeks`;
  };

  const handleBackToAccount = () => {
    setStep('account');
    setPhoneLast4('');
    setFoundClient(null);
    setError('');
  };

  const handleBackToLanding = () => {
    if (Platform.OS === 'web') {
      window.location.href = `/${businessName}`;
    } else {
      router.back();
    }
  };

  if (loading) {
    return (
      <View style={portalStyles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!businessUser) {
    return (
      <View style={portalStyles.container}>
        <Text style={portalStyles.errorTextLarge}>Business not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={portalStyles.container} contentContainerStyle={portalStyles.contentContainer}>
      {/* Navigation Header */}
      <View style={portalStyles.navigation}>
        <View style={[portalStyles.navContent, isNarrowWeb && portalStyles.navContentMobile]}>
          <Pressable onPress={() => handleNavigation('/home')} style={portalStyles.logoContainer}>
            <Image
              source={require('../../assets/images/logo_transparent.png')}
              style={[portalStyles.navLogo, isNarrowWeb && portalStyles.navLogoMobile]}
              resizeMode="contain"
            />
          </Pressable>
          {Platform.OS === 'web' && !isNarrowWeb && (
            <View style={portalStyles.navLinks}>
              <Pressable onPress={() => handleNavigation('/home')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Home</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/pricing')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Pricing</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/about')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Contact</Text>
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
          <View style={styles.dashboardContainer}>
            {dashboardLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4f46e5" />
                <Text style={styles.loadingText}>Loading your account...</Text>
              </View>
            ) : (
              <>
                <View style={styles.welcomeHeader}>
                  <Text style={styles.welcomeTitle}>Welcome back, {foundClient?.name}!</Text>
                  <Text style={styles.welcomeAccount}>{foundClient?.accountNumber}</Text>
                </View>

                {/* Balance Card */}
                <View style={[styles.dashboardCard, styles.balanceCard]}>
                  <Text style={styles.cardTitle}>Account Balance</Text>
                  <Text style={[styles.balanceAmount, balance >= 0 ? styles.balancePositive : styles.balanceNegative]}>
                    {balance >= 0 ? '+' : ''}£{Math.abs(balance).toFixed(2)}
                  </Text>
                  <Text style={styles.balanceNote}>{balance >= 0 ? 'Credit on account' : 'Amount owing'}</Text>
                </View>

                {/* Payment Info Card */}
                {balance < 0 && (businessUser?.bankSortCode || businessUser?.bankAccountNumber) && (
                  <View style={[styles.dashboardCard, styles.paymentCard]}>
                    <Text style={styles.paymentCardTitle}>Payment Details</Text>
                    <Text style={styles.paymentCardSubtitle}>Please use the following details to make your payment</Text>
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
                    <Text style={styles.paymentNote}>Please include your reference number when making payment</Text>
                  </View>
                )}

                {/* Service Details Card */}
                <View style={styles.dashboardCard}>
                  <Text style={styles.cardTitle}>Your Services</Text>
                  {servicePlans.length === 0 && !nextServiceDate ? (
                    <Text style={styles.emptyText}>No active services</Text>
                  ) : servicePlans.length === 0 && nextServiceDate ? (
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
                        <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} placeholder="Your name" />
                      </View>
                      <View style={styles.editField}>
                        <Text style={styles.editLabel}>Mobile Number</Text>
                        <TextInput style={styles.editInput} value={editMobile} onChangeText={setEditMobile} placeholder="Your mobile number" keyboardType="phone-pad" />
                      </View>
                      <View style={styles.editButtons}>
                        <Pressable style={styles.cancelButton} onPress={() => { setIsEditingProfile(false); setEditName(foundClient?.name || ''); setEditMobile(foundClient?.mobileNumber || ''); }}>
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]} onPress={handleSaveProfile} disabled={savingProfile}>
                          {savingProfile ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
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
                          <Text style={[styles.historyAmount, item.type === 'payment' ? styles.historyPayment : styles.historyJob]}>
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
          <View style={styles.loginContainer}>
            <Pressable onPress={handleBackToLanding} style={styles.backToLandingButton}>
              <Text style={styles.backToLandingText}>← Back</Text>
            </Pressable>

            <View style={[styles.loginCard, isNarrowWeb && styles.loginCardMobile]}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Existing Customer?</Text>
                <Text style={styles.formSubtitle}>
                  {step === 'account' ? 'Sign in to view your account' : 'Verify your identity'}
                </Text>
              </View>

              <View style={styles.stepIndicator}>
                <View style={[styles.stepDot, styles.stepDotActive]} />
                <View style={[styles.stepLine, step === 'phone' && styles.stepLineActive]} />
                <View style={[styles.stepDot, step === 'phone' && styles.stepDotActive]} />
              </View>

              <View style={styles.form}>
                {step === 'account' ? (
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
                          onChangeText={(text) => { setAccountNumberSuffix(text.toUpperCase()); setError(''); }}
                          autoCapitalize="characters"
                          autoComplete="username"
                          keyboardType="default"
                        />
                      </View>
                    </View>
                    {error ? <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View> : null}
                    <Pressable style={[styles.submitButton, authLoading && styles.submitButtonDisabled]} onPress={handleAccountLookup} disabled={authLoading}>
                      {authLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitButtonText}>Next</Text>}
                    </Pressable>
                  </>
                ) : (
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
                        onChangeText={(text) => { setPhoneLast4(text.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                        keyboardType="number-pad"
                        maxLength={4}
                      />
                    </View>
                    {error ? <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View> : null}
                    <Pressable style={[styles.submitButton, authLoading && styles.submitButtonDisabled]} onPress={handlePhoneVerification} disabled={authLoading}>
                      {authLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitButtonText}>Verify & Sign In</Text>}
                    </Pressable>
                    <Pressable style={styles.backButton} onPress={handleBackToAccount}>
                      <Text style={styles.backButtonText}>← Back to account number</Text>
                    </Pressable>
                  </>
                )}
                <View style={styles.formLinks}>
                  <Text style={styles.helpText}>Need help? Contact {businessUser.businessName}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={portalStyles.footer}>
        <View style={portalStyles.footerContent}>
          <View style={portalStyles.footerSection}>
            <Image
              source={require('../../assets/images/logo_colourInverted.png')}
              style={[portalStyles.footerLogo, isNarrowWeb && portalStyles.footerLogoMobile]}
              resizeMode="contain"
            />
          </View>
          <View style={portalStyles.footerLinks}>
            <View style={portalStyles.footerColumn}>
              <Text style={portalStyles.footerColumnTitle}>Company</Text>
              <Pressable onPress={() => handleNavigation('/about')}>
                <Text style={portalStyles.footerLink}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')}>
                <Text style={portalStyles.footerLink}>Contact</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View style={portalStyles.footerBottom}>
          <Text style={portalStyles.copyright}>© 2025 Guvnor. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mainContent: {
    flex: 1,
    maxWidth: Platform.OS === 'web' ? 1280 : ('100%' as any),
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 24,
  },
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
  heroTitleMobile: { fontSize: 28, marginBottom: 12 },
  heroSubtitle: {
    fontSize: 20,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 600,
    lineHeight: 28,
  },
  heroSubtitleMobile: { fontSize: 16, lineHeight: 22, paddingHorizontal: 8 },

  // Login container
  loginContainer: {
    maxWidth: 440,
    width: '100%',
    marginHorizontal: 'auto' as any,
    marginBottom: 48,
  },
  backToLandingButton: {
    marginBottom: 16,
  },
  backToLandingText: {
    fontSize: 15,
    color: '#4f46e5',
    fontWeight: '500',
  },
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    ...Platform.select({
      web: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 25, borderWidth: 1, borderColor: '#e5e7eb' },
      default: { elevation: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    }),
  },
  loginCardMobile: { padding: 20 },

  formHeader: { alignItems: 'center', marginBottom: 32 },
  formTitle: { fontSize: 24, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 8 },
  formSubtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center' },

  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#e5e7eb' },
  stepDotActive: { backgroundColor: '#4f46e5' },
  stepLine: { width: 60, height: 2, backgroundColor: '#e5e7eb', marginHorizontal: 8 },
  stepLineActive: { backgroundColor: '#4f46e5' },

  form: { gap: 24 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 16, fontSize: 16, backgroundColor: '#fff', color: '#111827' },

  accountInputContainer: { flexDirection: 'row', alignItems: 'stretch' },
  accountPrefix: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db', borderRightWidth: 0, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  accountPrefixText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  accountInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderTopRightRadius: 8, borderBottomRightRadius: 8, padding: 16, fontSize: 16, backgroundColor: '#fff', color: '#111827' },

  clientInfoBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 8 },
  clientInfoLabel: { fontSize: 12, color: '#166534', marginBottom: 4 },
  clientInfoAccount: { fontSize: 14, color: '#166534', marginTop: 2 },

  errorContainer: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 12 },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center' },

  submitButton: { backgroundColor: '#4f46e5', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  backButton: { alignItems: 'center', paddingVertical: 12 },
  backButtonText: { fontSize: 14, color: '#4f46e5' },

  formLinks: { gap: 16, alignItems: 'center' },
  helpText: { color: '#6b7280', fontSize: 14, textAlign: 'center' },

  // Dashboard
  dashboardContainer: { width: '100%', maxWidth: 800, marginHorizontal: 'auto' as any, paddingBottom: 48 },
  loadingContainer: { alignItems: 'center', paddingVertical: 64 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6b7280' },
  welcomeHeader: { alignItems: 'center', marginBottom: 32 },
  welcomeTitle: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  welcomeAccount: { fontSize: 14, color: '#6b7280' },

  dashboardCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb',
    ...Platform.select({
      web: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      default: { elevation: 2 },
    }),
  },
  balanceCard: { alignItems: 'center', backgroundColor: '#f8fafc' },
  paymentCard: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  paymentCardTitle: { fontSize: 18, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  paymentCardSubtitle: { fontSize: 14, color: '#a16207', marginBottom: 16 },
  paymentDetails: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 12 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  paymentLabel: { fontSize: 14, color: '#6b7280' },
  paymentValue: { fontSize: 14, color: '#111827', fontWeight: '500', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  paymentValueBold: { fontSize: 16, color: '#111827', fontWeight: '700', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  paymentNote: { fontSize: 13, color: '#92400e', textAlign: 'center', fontStyle: 'italic' },

  cardTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  balanceAmount: { fontSize: 36, fontWeight: 'bold', marginBottom: 4 },
  balancePositive: { color: '#16a34a' },
  balanceNegative: { color: '#dc2626' },
  balanceNote: { fontSize: 14, color: '#6b7280' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },

  serviceItem: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 12, marginTop: 12 },
  serviceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  serviceType: { fontSize: 16, fontWeight: '600', color: '#111827' },
  servicePrice: { fontSize: 16, fontWeight: '600', color: '#4f46e5' },
  serviceDetails: { gap: 4 },
  serviceDetail: { fontSize: 14, color: '#6b7280' },
  serviceLabel: { fontWeight: '500', color: '#374151' },

  editButton: { fontSize: 14, color: '#4f46e5', fontWeight: '500' },
  contactInfo: { gap: 12 },
  contactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contactLabel: { fontSize: 14, color: '#6b7280' },
  contactValue: { fontSize: 14, color: '#111827', fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 16 },

  editForm: { gap: 16 },
  editField: { gap: 6 },
  editLabel: { fontSize: 14, fontWeight: '500', color: '#374151' },
  editInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff', color: '#111827' },
  editButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelButtonText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  saveButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#4f46e5' },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { fontSize: 14, fontWeight: '500', color: '#fff' },

  historyList: { gap: 0 },
  historyItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  historyLeft: { flex: 1 },
  historyDate: { fontSize: 14, fontWeight: '500', color: '#111827' },
  historyDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '600' },
  historyPayment: { color: '#16a34a' },
  historyJob: { color: '#dc2626' },

  logoutButton: { alignItems: 'center', paddingVertical: 16, marginTop: 16 },
  logoutButtonText: { fontSize: 14, color: '#6b7280', textDecorationLine: 'underline' },
});
