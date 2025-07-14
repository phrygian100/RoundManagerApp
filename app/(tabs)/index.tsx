import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { auth, db } from '../../core/firebase';

export default function HomeScreen() {
  const router = useRouter();
  const [buttons, setButtons] = useState<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const buildButtons = async () => {
      console.log('🏠 HomeScreen: building buttons');
      const user = auth.currentUser;
      if (!user) {
        console.log('🏠 HomeScreen: no Firebase user, aborting');
        return;
      }

      setEmail(user.email || null);

      // Fetch additional user data from Firestore (perms, isOwner, etc.)
      let isOwner: boolean = true; // default owner until roles implemented
      let perms: Record<string, boolean> = {};

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data: any = userDoc.data();
          isOwner = data.isOwner ?? true;
          perms = data.perms ?? {};
        }
      } catch (err) {
        console.error('Error fetching user doc:', err);
      }
      console.log('🏠 HomeScreen: perms =', perms);

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
          onPress: () => router.push(btn.path as any),
          disabled: false,
        }))
      );
      setLoading(false);
    };

    buildButtons();
  }, [router]);

  // Rebuild buttons whenever screen gains focus (permissions may have changed)
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      (async () => {
        await new Promise(res => setTimeout(res, 0)); // defer to next tick
        const user = auth.currentUser;
        if (!user) {
          setLoading(false);
          return;
        }

        setEmail(user.email || null);

        let isOwner: boolean = true;
        let perms: Record<string, boolean> = {};
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data: any = userDoc.data();
            isOwner = data.isOwner ?? true;
            perms = data.perms ?? {};
          }
        } catch (err) {
          console.error('Error fetching user doc:', err);
        }

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
          allowed.map(b => ({ label: b.label, onPress: () => router.push(b.path as any) }))
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

