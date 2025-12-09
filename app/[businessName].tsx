import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { doc, getDoc, getDocs, query, where, collection } from 'firebase/firestore';
import { db } from '../core/firebase';

// Get build ID from environment or fallback to version
const BUILD_ID = '30ec56e';

interface BusinessUser {
  id: string;
  businessName: string;
  email: string;
  name: string;
  // Add other business fields as needed
}

export default function ClientPortalScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [businessName, setBusinessName] = useState('');
  const [businessUser, setBusinessUser] = useState<BusinessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const isNarrowWeb = Platform.OS === 'web' && width < 640;

  useEffect(() => {
    // Extract business name from URL
    const pathname = window?.location?.pathname;
    if (pathname) {
      // Remove leading slash and decode
      const extractedName = decodeURIComponent(pathname.substring(1));
      setBusinessName(extractedName);
      lookupBusinessUser(extractedName);
    }
  }, []);

  const lookupBusinessUser = async (name: string) => {
    try {
      setLoading(true);
      console.log('🔍 Looking up business:', name);

      // Normalize the business name from URL (remove spaces, handle case)
      const normalizedName = name.replace(/\s+/g, '').toLowerCase();
      console.log('🔍 Normalized name:', normalizedName);

      // Query for all users and filter client-side for business name matching
      // This allows for flexible matching (with/without spaces, case insensitive)
      const usersQuery = query(collection(db, 'users'));
      console.log('🔍 Querying users collection...');
      const usersSnapshot = await getDocs(usersQuery);
      console.log('🔍 Found', usersSnapshot.size, 'users');

      let matchedUser: BusinessUser | null = null;
      let matchedUserId = '';

      usersSnapshot.forEach((doc) => {
        const userData = doc.data() as BusinessUser;
        if (userData.businessName) {
          // Normalize the stored business name for comparison
          const storedNormalized = userData.businessName.replace(/\s+/g, '').toLowerCase();
          console.log('🔍 Comparing:', storedNormalized, 'vs', normalizedName);

          if (storedNormalized === normalizedName) {
            console.log('🟢 Found match!', userData.businessName);
            matchedUser = { ...userData, id: doc.id };
            matchedUserId = doc.id;
          }
        }
      });

      if (matchedUser) {
        console.log('🟢 Setting business user:', matchedUser.businessName);
        // Skip owner check for now - just show the page
        setBusinessUser(matchedUser);
      } else {
        console.log('❌ No matching business found');
        if (typeof window !== 'undefined') {
          window.alert('Business not found. Please check the URL and try again.');
        }
        router.replace('/login');
      }
    } catch (error) {
      console.error('❌ Error looking up business:', error);
      if (typeof window !== 'undefined') {
        window.alert('Unable to load business information. Please try again.');
      }
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  const checkIfOwner = async (userId: string): Promise<boolean> => {
    try {
      // Get user document to check accountId
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return false;

      const userData = userDoc.data();

      // Primary check: If accountId exists and differs from userId, this is a member
      if (userData.accountId && userData.accountId !== userId) {
        return false;
      }

      // Secondary check: Look for member records in accounts/{accountId}/members/{userId}
      // This handles the case where accountId might not be set on the user doc
      const memberDoc = await getDoc(doc(db, `accounts/${userId}/members/${userId}`));
      if (memberDoc.exists()) {
        const memberData = memberDoc.data();
        // If there's a member record with role !== 'owner', this is a member
        return memberData.role === 'owner';
      }

      // If no member record exists and accountId equals userId (or is not set),
      // this is an owner
      return true;

    } catch (error) {
      console.error('Error checking owner status:', error);
      return false;
    }
  };

  const handleClientLogin = async () => {
    if (!accountNumber || !password) {
      Alert.alert('Error', 'Please enter both account number and password.');
      return;
    }

    if (!businessUser) {
      Alert.alert('Error', 'Business information not available.');
      return;
    }

    try {
      setAuthLoading(true);

      // TODO: Implement client authentication logic
      // This would typically involve:
      // 1. Looking up client by account number within the business owner's data
      // 2. Verifying password (could be stored hashed in Firestore)
      // 3. Setting up client session/auth
      // 4. Redirecting to client dashboard

      Alert.alert('Coming Soon', 'Client authentication will be implemented next.');

    } catch (error: any) {
      console.error('Client login error:', error);
      const errMsg = error?.message || 'Login failed. Please try again.';
      Alert.alert('Login Error', errMsg);
    } finally {
      setAuthLoading(false);
    }
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
          <View style={styles.formHeader}>
            <Image
              source={require('../assets/images/logo_transparent.png')}
              style={[styles.formLogo, isNarrowWeb && styles.formLogoMobile]}
              resizeMode="contain"
            />
            <Text style={styles.formTitle}>Client Account Access</Text>
            <Text style={styles.formSubtitle}>Enter your account details below</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={styles.input}
                placeholder="RWC123456"
                value={accountNumber}
                onChangeText={setAccountNumber}
                autoCapitalize="characters"
                autoComplete="username"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>

            <Pressable
              style={[styles.submitButton, authLoading && styles.submitButtonDisabled]}
              onPress={handleClientLogin}
              disabled={authLoading}
            >
              <Text style={styles.submitButtonText}>
                {authLoading ? 'Signing in...' : 'Sign in to Account'}
              </Text>
            </Pressable>

            <View style={styles.formLinks}>
              <Text style={styles.helpText}>
                Need help accessing your account? Contact {businessUser.businessName}
              </Text>
            </View>
          </View>
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
