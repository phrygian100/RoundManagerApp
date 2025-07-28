import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth } from '../core/firebase';

// Get build ID from environment or fallback to version
const BUILD_ID = '30ec56e';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Email not verified', msg);
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
              source={require('../assets/images/Logo - Service Platform.png')} 
              style={styles.navLogo}
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
              <View style={styles.signInButton}>
                <Text style={styles.signInButtonText}>Sign In</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Welcome back to Guvnor</Text>
          <Text style={styles.heroSubtitle}>
            Sign in to manage your cleaning rounds, clients, and payments
          </Text>
        </View>

        {/* Login Form Card */}
        <View style={styles.loginCard}>
          <View style={styles.formHeader}>
            <Image 
              source={require('../assets/images/Logo - Service Platform.png')} 
              style={styles.formLogo}
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
              source={require('../assets/images/Logo - Service Platform.png')} 
              style={styles.footerLogo}
              resizeMode="contain"
            />
            <Text style={styles.footerDescription}>
              Streamline your cleaning business with intelligent management tools.
            </Text>
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
          <Text style={styles.copyright}>© 2024 Guvnor. All rights reserved.</Text>
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
    width: 225,
    height: 60,
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
  heroSubtitle: {
    fontSize: 20,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 600,
    lineHeight: 28,
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
  formHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  formLogo: {
    width: 380,
    height: 152,
    marginBottom: 16,
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
  },
  featuresTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
    textAlign: 'center',
  },
  featuresList: {
    gap: 16,
    marginBottom: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    fontSize: 20,
  },
  featureText: {
    fontSize: 16,
    color: '#6b7280',
  },
  pricingLink: {
    paddingVertical: 8,
  },
  pricingLinkText: {
    color: '#4f46e5',
    fontSize: 16,
    fontWeight: '500',
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
  },
  footerLogo: {
    width: 200,
    height: 53,
    marginBottom: 16,
    ...Platform.select({
      web: {
        filter: 'brightness(0) invert(1)',
      },
      default: {
        tintColor: '#fff',
      },
    }),
  },
  footerDescription: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
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
}); 
 