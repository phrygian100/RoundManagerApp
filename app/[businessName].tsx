import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../core/firebase';

// Get build ID from environment or fallback to version
const BUILD_ID = '30ec56e';

interface BusinessUser {
  id: string;
  businessName: string;
  email: string;
  name: string;
}

interface ClientData {
  id: string;
  name: string;
  accountNumber: string;
  mobileNumber?: string;
}

type LoginStep = 'account' | 'phone' | 'success';

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

      // Query the business owner's clients collection for matching account number
      const clientsRef = collection(db, `accounts/${businessUser.id}/clients`);
      const q = query(clientsRef, where('accountNumber', '==', fullAccountNumber));
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

      // Success! Move to success state
      setStep('success');

    } catch (err: any) {
      console.error('Phone verification error:', err);
      setError('Verification failed. Please try again.');
    } finally {
      setAuthLoading(false);
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
        <View style={styles.navContent}>
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
          <Text style={[styles.heroSubtitle, isNarrowWeb && styles.heroSubtitleMobile]}>
            Client Portal - Sign in to view your account
          </Text>
        </View>

        {/* Login Form Card */}
        <View style={[styles.loginCard, isNarrowWeb && styles.loginCardMobile]}>
          {step === 'success' ? (
            // Success State
            <View style={styles.successContainer}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Successfully Logged In</Text>
              <Text style={styles.successSubtitle}>
                Welcome back, {foundClient?.name || 'valued customer'}!
              </Text>
              <Text style={styles.successAccount}>
                Account: {foundClient?.accountNumber}
              </Text>
            </View>
          ) : (
            // Login Form
            <>
              <View style={styles.formHeader}>
                <Image
                  source={require('../assets/images/logo_transparent.png')}
                  style={[styles.formLogo, isNarrowWeb && styles.formLogoMobile]}
                  resizeMode="contain"
                />
                <Text style={styles.formTitle}>Client Account Access</Text>
                <Text style={styles.formSubtitle}>
                  {step === 'account' 
                    ? 'Enter your account number to get started'
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
                      <Text style={styles.clientInfoName}>{foundClient?.name}</Text>
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
            </>
          )}
        </View>
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

  // Login Card
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    marginHorizontal: 'auto',
    width: '100%',
    maxWidth: 480,
    marginBottom: 48,
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
    marginBottom: 32,
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

  // Success state
  successContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  successIcon: {
    fontSize: 64,
    color: '#22c55e',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 18,
    color: '#374151',
    marginBottom: 4,
  },
  successAccount: {
    fontSize: 14,
    color: '#6b7280',
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
