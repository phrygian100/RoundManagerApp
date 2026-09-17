import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import {
  enableNotificationsFromUserTap,
  markNotificationPromptDismissed,
} from '../services/pushNotifications';

type Props = {
  visible: boolean;
  onDone: () => void;
};

export default function NotificationOptInModal({ visible, onDone }: Props) {
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await markNotificationPromptDismissed();
    onDone();
  };

  const onEnable = async () => {
    setBusy(true);
    try {
      await enableNotificationsFromUserTap();
    } finally {
      setBusy(false);
      await finish();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications-outline" size={36} color="#e8ecf8" />
          </View>
          <Text style={styles.title}>Stay in the loop</Text>
          <Text style={styles.body}>
            Guvnor can notify you when a team member completes a job, when the day is ready to
            review, and when a new quote request comes in.
          </Text>
          <Pressable
            style={[styles.primary, busy && styles.primaryDisabled]}
            onPress={onEnable}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Enable notifications</Text>
            )}
          </Pressable>
          <Pressable onPress={finish} disabled={busy} style={styles.laterWrap}>
            <Text style={styles.later}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 13, 31, 0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0c1b3c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0c1b3c',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 22,
  },
  primary: {
    backgroundColor: '#0c1b3c',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  laterWrap: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  later: {
    color: '#6b7280',
    fontSize: 15,
  },
});
