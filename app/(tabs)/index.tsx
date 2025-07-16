import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import FirstTimeSetupModal from '../../components/FirstTimeSetupModal';
import { auth, db } from '../../core/firebase';
import { getUserSession } from '../../core/session';

export default function HomeScreen() {
  const router = useRouter();
  const [buttons, setButtons] = useState<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [navigationInProgress, setNavigationInProgress] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const [checkingFirstTime, setCheckingFirstTime] = useState(true);

  const handleNavigation = (path: string) => {
    if (navigationInProgress) return;
    setNavigationInProgress(true);
    router.push(path as any);
    // Reset navigation flag after a short delay
    setTimeout(() => setNavigationInProgress(false), 1000);
  };

  const checkFirstTimeSetup = async (firebaseUser: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (!userData.firstTimeSetupCompleted) {
          setShowFirstTimeSetup(true);
        }
      }
    } catch (error) {
      console.error('Error checking first time setup:', error);
    } finally {
      setCheckingFirstTime(false);
    }
  };

  const handleFirstTimeSetupComplete = async (hasInviteCode: boolean) => {
    setShowFirstTimeSetup(false);
    if (hasInviteCode) {
      // User chose to enter invite code, navigate there
      router.push('/enter-invite-code');
    } else {
      // User completed setup, refetch user session and rebuild buttons
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        await buildButtonsForUser(firebaseUser);
      }
    }
  };

  const buildButtonsForUser = async (firebaseUser: User) => {
    console.log('🏠 HomeScreen: building buttons');
    setEmail(firebaseUser.email || null);

    // Use getUserSession to get proper permissions and accountId
    const session = await getUserSession();
    if (!session) {
      console.error('No session found for user');
      setLoading(false);
      return;
    }

    const isOwner = session.isOwner;
    const perms = session.perms;
    console.log('🏠 HomeScreen: session =', { isOwner, perms, accountId: session.accountId });

    const baseButtons = [
      { label: 'Client List', path: '/clients', permKey: 'viewClients' },
      { label: 'Add New Client', path: '/add-client', permKey: 'viewClients' },
      { label: 'Rota', path: '/rota', permKey: null },
      { label: 'Workload Forecast', path: '/workload-forecast', permKey: 'viewRunsheet' },
      { label: 'Runsheet', path: '/runsheet', permKey: 'viewRunsheet' },
      { label: 'Accounts', path: '/accounts', permKey: 'viewPayments' },
      { label: 'Settings', path: '/settings', permKey: null },
      { label: 'Quotes', path: '/quotes', permKey: null },
    ];

    const allowed = baseButtons.filter((btn) => {
      if (!btn.permKey) return true; // Settings always available
      if (isOwner) return true; // Owner sees all
      return !!perms[btn.permKey];
    });

    setButtons(
      allowed.map((btn) => ({
        label: btn.label,
        onPress: () => handleNavigation(btn.path as any),
        disabled: false,
      }))
    );
    setLoading(false);
  };

  // Listen for auth state to become ready
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        console.log('🏠 HomeScreen: waiting for Firebase user...');
        return;
      }
      unsub(); // Stop listening once we have the user
      buildButtonsForUser(firebaseUser);
      checkFirstTimeSetup(firebaseUser); // Check if first-time setup is needed
    });

    return () => unsub();
  }, [router]);

  // Rebuild buttons whenever screen gains focus (permissions may have changed)
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      (async () => {
        await new Promise(res => setTimeout(res, 0)); // defer to next tick
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          setLoading(false);
          return;
        }

        setEmail(firebaseUser.email || null);

        // Use getUserSession for proper permissions
        const session = await getUserSession();
        if (!session) {
          console.error('No session found for user');
          setLoading(false);
          return;
        }

        const isOwner = session.isOwner;
        const perms = session.perms;

        const buttonDefs = [
          { label: 'Client List', path: '/clients', permKey: 'viewClients' },
          { label: 'Add New Client', path: '/add-client', permKey: 'viewClients' },
          { label: 'Rota', path: '/rota', permKey: null },
          { label: 'Workload Forecast', path: '/workload-forecast', permKey: 'viewRunsheet' },
          { label: 'Runsheet', path: '/runsheet', permKey: 'viewRunsheet' },
          { label: 'Accounts', path: '/accounts', permKey: 'viewPayments' },
          { label: 'Settings', path: '/settings', permKey: null },
          { label: 'Quotes', path: '/quotes', permKey: null },
        ];

        const allowed = buttonDefs.filter(b => !b.permKey || isOwner || !!perms[b.permKey]);
        setButtons(
          allowed.map(b => ({ label: b.label, onPress: () => handleNavigation(b.path as any) }))
        );
        setLoading(false);
      })();
    }, [router])
  );

  // Determine how many buttons per row: use 3 on web for wider screens
  const buttonsPerRow = Platform.OS === 'web' ? 3 : 2;

  // Split buttons into rows
  const rows: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[][] = [];
  for (let i = 0; i < buttons.length; i += buttonsPerRow) {
    rows.push(buttons.slice(i, i + buttonsPerRow));
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((btn, idx) => (
            <Pressable
              key={idx}
              style={[styles.button, btn.disabled && styles.buttonDisabled]}
              onPress={btn.onPress}
              disabled={btn.disabled}
            >
              <Text style={styles.buttonText}>{btn.label}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      {email && (
        <Text style={styles.email}>Logged in as {email}</Text>
      )}
      {showFirstTimeSetup && (
        <FirstTimeSetupModal 
          visible={showFirstTimeSetup} 
          onComplete={handleFirstTimeSetupComplete} 
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  button: {
    flex: 1,
    aspectRatio: 1,
    marginHorizontal: 8,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    minWidth: 0,
    maxWidth: 250,
  },
  buttonDisabled: {
    backgroundColor: '#eee',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  email: { marginTop: 16, fontSize: 12, color: '#666' },
});

