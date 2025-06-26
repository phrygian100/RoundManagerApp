import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  const buttons = [
    {
      label: 'Client List',
      onPress: () => router.push('/clients'),
      disabled: false,
    },
    {
      label: 'Add New Client',
      onPress: () => router.push('/add-client'),
      disabled: false,
    },
    {
      label: 'Workload Forecast',
      onPress: () => router.push('/workload-forecast'),
      disabled: false,
    },
    {
      label: 'Runsheet',
      onPress: () => router.push('/runsheet'),
      disabled: false,
    },
    {
      label: 'Accounts',
      onPress: () => router.push('/accounts'),
      disabled: false,
    },
    {
      label: 'Settings',
      onPress: () => router.push('/settings'),
      disabled: false,
    },
  ];

  // Determine how many buttons per row: use 3 on web for wider screens
  const buttonsPerRow = Platform.OS === 'web' ? 3 : 2;

  // Split buttons into rows
  const rows: typeof buttons[] = [];
  for (let i = 0; i < buttons.length; i += buttonsPerRow) {
    rows.push(buttons.slice(i, i + buttonsPerRow));
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
});

