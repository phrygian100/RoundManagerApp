import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { auth, db } from '../core/firebase';

export default function RegisterScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrowWeb = Platform.OS === 'web' && width < 640;
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address1, setAddress1] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [loading, setLoading] = useState(false);

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(msg);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleRegister = async () => {
    const trimmedName = name.trim();
    const trimmedContactNumber = contactNumber.trim();
    const trimmedEmail = email.trim();
    const trimmedAddress1 = address1.trim();
    const trimmedTown = town.trim();
    const normalizedPostcode = postcode.trim().toUpperCase().replace(/\s+/g, ' ');

    if (
      !trimmedName ||
      !trimmedContactNumber ||
      !trimmedEmail ||
      !password ||
      !confirmPassword ||
      !trimmedAddress1 ||
      !trimmedTown ||
      !normalizedPostcode
    ) {
      showAlert('Error', 'Please fill out all fields.');
      return;
    }

    if (password !== confirmPassword) {
      showAlert('Error', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

      const user = userCredential.user;

      // Send verification email
      await sendEmailVerification(user);

      // Create a user document in Firestore
      const DEVELOPER_UID = 'X4TtaVGKUtQSCtPLF8wsHsVZ0oW2';
      const userData: any = {
        id: user.uid,
        email: user.email,
        name: trimmedName,
        contactNumber: trimmedContactNumber,
        createdAt: new Date().toISOString(),
        address1: trimmedAddress1,
        town: trimmedTown,
        postcode: normalizedPostcode,
        // Create combined address for backward compatibility
        address: [trimmedAddress1, trimmedTown, normalizedPostcode].filter(Boolean).join(', '),
        // Default subscription fields (also set by backend, but ensures immediate availability)
        subscriptionTier: user.uid === DEVELOPER_UID ? 'exempt' : 'free',
        subscriptionStatus: user.uid === DEVELOPER_UID ? 'exempt' : 'active',
        clientLimit: user.uid === DEVELOPER_UID ? null : 20,
        isExempt: user.uid === DEVELOPER_UID,
      };

      await setDoc(doc(db, 'users', user.uid), userData);

      // Immediately sign the user out so they cannot access the app until
      // their email is verified. This prevents unverified accounts from
      // bypassing verification due to auth-state race conditions.
      await auth.signOut();

      showAlert(
        'Verify Your Email',
        'Your account has been created. We have sent a verification link to your email address. Please verify your email and then log in.'
      );

      router.replace('/login');
    } catch (error: any) {
      const code = String(error?.code || '');
      // Avoid noisy stack traces for expected auth failures
      console.warn('Registration error:', code);

      let msg = 'Registration failed. Please try again.';
      if (code === 'auth/email-already-in-use') {
        msg = 'An account already exists for this email. Please log in instead.';
      } else if (code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 6 characters.';
      } else if (code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your connection and try again.';
      } else if (typeof error?.message === 'string' && error.message.trim()) {
        // Fallback: show a short message (avoid dumping objects)
        msg = error.message;
      }

      showAlert('Registration Error', msg);

      if (code === 'auth/email-already-in-use') {
        // Helpful fast path: send them to login
        router.replace('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNavigation = (path: string) => {
    if (Platform.OS === 'web') {
      window.location.href = path;
    } else {
      router.push(path as any);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Navigation Header (web only) */}
      {Platform.OS === 'web' && (
        <View style={styles.navigation}>
          <View style={styles.navContent}>
            <Pressable onPress={() => handleNavigation('/home')} style={styles.logoContainer}>
              <Image
                source={require('../assets/images/logo_transparent.png')}
                style={[styles.navLogo, isNarrowWeb && styles.navLogoMobile]}
                resizeMode="contain"
              />
            </Pressable>
          </View>
        </View>
      )}

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, isNarrowWeb && styles.heroTitleMobile]}>Create your Guvnor account</Text>
          <Text style={[styles.heroSubtitle, isNarrowWeb && styles.heroSubtitleMobile]}>
            One account to manage rounds, clients, and payments.
          </Text>
        </View>

        {/* Register Form Card */}
        <View style={[styles.registerCard, isNarrowWeb && styles.registerCardMobile]}>
          <View style={styles.formHeader}>
            <Image
              source={require('../assets/images/logo_transparent.png')}
              style={[styles.formLogo, isNarrowWeb && styles.formLogoMobile]}
              resizeMode="contain"
            />
            <Text style={styles.formTitle}>Register</Text>
            <Text style={styles.formSubtitle}>Please fill in all fields below.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Smith"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholderTextColor="#9ca3af"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contact number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 07123 456789"
                value={contactNumber}
                onChangeText={setContactNumber}
                keyboardType="phone-pad"
                placeholderTextColor="#9ca3af"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="#9ca3af"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address line 1</Text>
              <TextInput
                style={styles.input}
                placeholder="House number and street"
                value={address1}
                onChangeText={setAddress1}
                autoCapitalize="words"
                placeholderTextColor="#9ca3af"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Town / City</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter town or city"
                value={town}
                onChangeText={setTown}
                autoCapitalize="words"
                placeholderTextColor="#9ca3af"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Postcode</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. SW1A 1AA"
                value={postcode}
                onChangeText={setPostcode}
                autoCapitalize="characters"
                placeholderTextColor="#9ca3af"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Create a password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor="#9ca3af"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholderTextColor="#9ca3af"
                editable={!loading}
                // Disable paste on web to encourage manual entry
                {...(Platform.OS === 'web' ? { onPaste: (e: any) => e.preventDefault() } : {})}
              />
            </View>

            <Pressable
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>{loading ? 'Registering...' : 'Create account'}</Text>
            </Pressable>

            <View style={styles.formLinks}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable onPress={() => router.replace('/login')} style={styles.secondaryButton} disabled={loading}>
                <Text style={styles.secondaryButtonText}>Back to login</Text>
              </Pressable>
            </View>
          </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // Register Card
  registerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    marginHorizontal: 'auto',
    width: '100%',
    maxWidth: 520,
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
  registerCardMobile: {
    padding: 20,
    marginBottom: 32,
  },

  // Form header
  formHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  formLogo: {
    width: 360,
    height: 140,
    marginBottom: 12,
  },
  formLogoMobile: {
    width: 300,
    height: 120,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
  },

  // Form
  form: {
    gap: 20,
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
}); 