import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useState, useEffect } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { auth } from '../core/firebase';

// Get build ID from environment or fallback to version
const BUILD_ID = '9a50efa';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrowWeb = Platform.OS === 'web' && width < 640;

  // Close menu when clicking outside on web
  useEffect(() => {
    if (Platform.OS === 'web' && menuOpen) {
      const handleClickOutside = () => {
        setMenuOpen(false);
      };
      
      // Add a small delay to prevent immediate closing when opening
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [menuOpen]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        const msg = 'Please verify your email before logging in.';

        const shouldResend = Platform.OS === 'web'
          ? (typeof window !== 'undefined' ? window.confirm(`${msg}\n\nResend verification email?`) : false)
          : await new Promise<boolean>((resolve) => {
              Alert.alert(
                'Email not verified',
                msg,
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Resend email', onPress: () => resolve(true) },
                ]
              );
            });

        if (shouldResend) {
          try {
            const functions = getFunctions();
            const sendVerificationEmail = httpsCallable(functions, 'sendVerificationEmail');
            await sendVerificationEmail({});
            const sentMsg = 'Verification email sent. Please check your inbox (and spam) then try logging in again.';
            if (typeof window !== 'undefined') {
              window.alert(sentMsg);
            } else {
              Alert.alert('Email sent', sentMsg);
            }
          } catch (err) {
            console.warn('Resend verification email failed:', err);
            const errMsg = 'Could not resend verification email. Please try again later.';
            if (typeof window !== 'undefined') {
              window.alert(errMsg);
            } else {
              Alert.alert('Error', errMsg);
            }
          }
        }

        await auth.signOut();
        return;
      }

      // Set custom claims
      const functions = getFunctions();

      const refreshClaims = httpsCallable(functions, 'refreshClaims');
      const result = await refreshClaims();

      console.log('Claims refresh result:', result.data);

      const refreshResult = result.data as { success: boolean; message?: string };
      if (!refreshResult.success) {
        const msg = `Could not prepare your account. Please contact support. (${
          refreshResult.message || 'No details'
        })`;
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Login Error', msg);
        }
        await auth.signOut();
        return;
      }

      // Force a token refresh to get the new claims
      await user.getIdToken(true);

      // Navigate to home screen on success
      router.replace('/');

    } catch (error: any) {
      console.error('Login error', error);
      const errMsg = error?.code || error?.message || '';
      // Use window.alert for web compatibility
      const showAlert = (title: string, msg: string) => {
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert(title, msg);
        }
      };

      if (errMsg === 'auth/invalid-credential' || errMsg.includes('invalid-credential')) {
        showAlert('Error', 'Incorrect email/password');
      } else if (errMsg === 'auth/invalid-email') {
          showAlert('Error', 'Invalid email format');
      } else if (errMsg === 'auth/user-not-found') {
          showAlert('Error', 'Account not found');
      } else if (errMsg === 'auth/wrong-password') {
          showAlert('Error', 'Incorrect email/password');
      } else if (errMsg === 'auth/too-many-requests') {
          showAlert('Error', 'Too many attempts, please try again later.');
        } else {
          showAlert('Error', errMsg);
        }
    } finally {
      setLoading(false);
    }
  };

  const handleNavigation = (path: string) => {
    if (Platform.OS === 'web') {
      // For web, use window.location to navigate to the website pages
      window.location.href = path;
    } else {
      // For mobile, use router navigation
      router.push(path as any);
    }
  };

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
          
          {Platform.OS === 'web' && !isNarrowWeb && (
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
              <View style={styles.signInButton}>
                <Text style={styles.signInButtonText}>Sign In</Text>
              </View>
            </View>
          )}
          
          {Platform.OS === 'web' && isNarrowWeb && (
            <View style={styles.mobileMenu}>
              <Pressable onPress={() => setMenuOpen(!menuOpen)} style={styles.hamburgerButton}>
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
              </Pressable>
              
              {menuOpen && (
                <View style={styles.mobileDropdown}>
                  <Pressable onPress={() => { handleNavigation('/home'); setMenuOpen(false); }} style={styles.mobileDropdownLink}>
                    <Text style={styles.mobileDropdownText}>Home</Text>
                  </Pressable>
                  <Pressable onPress={() => { handleNavigation('/pricing'); setMenuOpen(false); }} style={styles.mobileDropdownLink}>
                    <Text style={styles.mobileDropdownText}>Pricing</Text>
                  </Pressable>
                  <Pressable onPress={() => { handleNavigation('/about'); setMenuOpen(false); }} style={styles.mobileDropdownLink}>
                    <Text style={styles.mobileDropdownText}>About</Text>
                  </Pressable>
                  <Pressable onPress={() => { handleNavigation('/contact'); setMenuOpen(false); }} style={styles.mobileDropdownLink}>
                    <Text style={styles.mobileDropdownText}>Contact</Text>
                  </Pressable>
                  <View style={styles.mobileDropdownDivider} />
                  <Pressable onPress={() => setMenuOpen(false)} style={styles.mobileDropdownLink}>
                    <Text style={[styles.mobileDropdownText, styles.mobileDropdownSignIn]}>Sign In</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, isNarrowWeb && styles.heroTitleMobile]}>Welcome back to Guvnor</Text>
          <Text style={[styles.heroSubtitle, isNarrowWeb && styles.heroSubtitleMobile]}>
            Sign in to manage your cleaning rounds, clients, and payments
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
            <Text style={styles.formTitle}>Sign in to your account</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
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
              style={[styles.submitButton, loading && styles.submitButtonDisabled]} 
              onPress={handleLogin} 
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Text>
            </Pressable>

            <View style={styles.formLinks}>
              <Pressable onPress={() => router.push('/forgot-password')} style={styles.linkButton}>
                <Text style={styles.linkText}>Forgot your password?</Text>
              </Pressable>
              
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable onPress={() => router.push('/register')} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Create new account</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Feature Highlights */}
        <View style={styles.features}>
          <Text style={styles.featuresTitle}>Why choose Guvnor?</Text>
          <View style={styles.featuresList}>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>📅</Text>
              <Text style={styles.featureText}>Smart scheduling & route optimization</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>👥</Text>
              <Text style={styles.featureText}>Complete client management</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>💳</Text>
              <Text style={styles.featureText}>Payment tracking & invoicing</Text>
            </View>
          </View>
          
          <Pressable onPress={() => handleNavigation('/pricing')} style={styles.pricingLink}>
            <Text style={styles.pricingLinkText}>Start free with up to 20 clients →</Text>
          </Pressable>
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
              <Text style={styles.footerColumnTitle}>Product</Text>
              <Pressable onPress={() => handleNavigation('/pricing')}>
                <Text style={styles.footerLink}>Pricing</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/home')}>
                <Text style={styles.footerLink}>Features</Text>
              </Pressable>
            </View>
            
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
    ...Platform.select({
      web: {
        overflow: 'hidden',
      },
    }),
  },
  contentContainer: {
    flexGrow: 1,
    minHeight: '100%',
  },
  
  // Navigation
  navigation: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    zIndex: 2000,
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
    paddingHorizontal: Platform.OS === 'web' ? 20 : 12,
    paddingVertical: Platform.OS === 'web' ? 16 : 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  navLogo: {
    width: 600,
    height: 150,
    maxWidth: '100%',
  },
  navLogoMobile: {
    width: 480,
    height: 120,
    maxWidth: '100%',
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
  signInButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  mobileMenu: {
    position: 'relative',
    zIndex: 3000,
    flexShrink: 0,
  },
  hamburgerButton: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3001,
  },
  hamburgerLine: {
    width: 24,
    height: 2,
    backgroundColor: '#6b7280',
    marginVertical: 2,
  },
  mobileDropdown: {
    position: 'absolute',
    top: 36,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: 220,
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      default: {
        elevation: 12,
      },
    }),
    zIndex: 3002,
    overflow: 'hidden',
  },
  mobileDropdownLink: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  mobileDropdownText: {
    fontSize: 14,
    color: '#374151',
  },
  mobileDropdownSignIn: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  mobileDropdownDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },

  // Main Content
  mainContent: {
    flex: 1,
    maxWidth: Platform.OS === 'web' ? 1280 : '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: Platform.OS === 'web' ? 24 : 16,
    width: '100%',
    overflow: 'hidden',
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
    width: 400,
    height: 160,
    marginBottom: 16,
  },
  formLogoMobile: {
    width: 320,
    height: 128,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
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
  linkButton: {
    paddingVertical: 8,
  },
  linkText: {
    color: '#4f46e5',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    color: '#6b7280',
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    color: '#4f46e5',
    fontSize: 16,
    fontWeight: '600',
  },

  // Features
  features: {
    alignItems: 'center',
    marginBottom: 48,
    paddingHorizontal: Platform.OS === 'web' ? 0 : 16,
    width: '100%',
  },
  featuresTitle: {
    fontSize: Platform.OS === 'web' ? 24 : 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
    textAlign: 'center',
  },
  featuresList: {
    gap: 16,
    marginBottom: 24,
    width: '100%',
    paddingHorizontal: Platform.OS === 'web' ? 0 : 8,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    maxWidth: '100%',
    paddingRight: 8,
  },
  featureIcon: {
    fontSize: 20,
    flexShrink: 0,
  },
  featureText: {
    fontSize: Platform.OS === 'web' ? 16 : 14,
    color: '#6b7280',
    flex: 1,
    flexWrap: 'wrap',
  },
  pricingLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pricingLinkText: {
    color: '#4f46e5',
    fontSize: Platform.OS === 'web' ? 16 : 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Footer
  footer: {
    backgroundColor: '#111827',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  footerContent: {
    maxWidth: Platform.OS === 'web' ? 1280 : '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: Platform.OS === 'web' ? 24 : 8,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: Platform.OS === 'web' ? 32 : 24,
    alignItems: 'center',
  },
  footerSection: {
    flex: Platform.OS === 'web' ? 1 : undefined,
    alignItems: 'center',
    width: Platform.OS === 'web' ? 'auto' : '100%',
  },
  footerLogo: {
    width: 340,
    height: 106,
    marginBottom: 16,
  },
  footerLogoMobile: {
    width: 280,
    height: 88,
  },
  footerDescription: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: Platform.OS === 'web' ? 48 : 32,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  footerColumn: {
    gap: 8,
    minWidth: 100,
    alignItems: Platform.OS === 'web' ? 'flex-start' : 'center',
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
}); 
 