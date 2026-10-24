import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Fix,
  LOCATION_UNAVAILABLE_MESSAGE,
  isLocationAvailable,
  requestLocationPermission,
  watchFixes,
} from '../services/locationTracker';
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '../services/territoryService';

/** A fix at least this good is a "lock". Worse fixes can still be used, with a warning. */
const GOOD_ACCURACY_M = 30;

export type StartActivityResult = {
  type: ActivityType;
  typeLabel: string;
  firstFix: { lat: number; lng: number } | null;
};

type Props = {
  visible: boolean;
  onCancel: () => void;
  onStart: (result: StartActivityResult) => void;
};

export default function StartActivityModal({ visible, onCancel, onStart }: Props) {
  const [type, setType] = useState<ActivityType>('canvassing');
  const [otherLabel, setOtherLabel] = useState('');
  const [locking, setLocking] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const stopWatchRef = useRef<(() => void) | null>(null);

  const stopWatch = () => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
  };

  // Reset whenever the modal opens; stop the GPS watch when it closes.
  useEffect(() => {
    if (visible) {
      setLocking(false);
      setFix(null);
      setError(null);
      setStarting(false);
    } else {
      stopWatch();
    }
    return stopWatch;
  }, [visible]);

  const beginLock = async () => {
    setError(null);
    if (!isLocationAvailable()) {
      setError(LOCATION_UNAVAILABLE_MESSAGE);
      return;
    }
    setLocking(true);
    const granted = await requestLocationPermission();
    if (!granted) {
      setLocking(false);
      setError('Location permission was not granted.');
      return;
    }
    stopWatch();
    stopWatchRef.current = watchFixes(
      f => {
        setFix(prev => {
          // Keep the better of consecutive fixes so the lock only improves.
          if (!prev) return f;
          if ((f.accuracy ?? 999) <= (prev.accuracy ?? 999) || f.at - prev.at > 15000) return f;
          return prev;
        });
      },
      msg => setError(msg)
    );
  };

  const typeLabel =
    type === 'other' ? otherLabel.trim() : ACTIVITY_TYPE_LABELS[type as 'canvassing' | 'leafletting'];
  const canStart = !!fix && (type !== 'other' || otherLabel.trim().length > 0) && !starting;
  const accuracy = fix?.accuracy;
  const locked = typeof accuracy === 'number' ? accuracy <= GOOD_ACCURACY_M : !!fix;

  const handleStart = async () => {
    if (!fix) return;
    setStarting(true);
    stopWatch();
    onStart({ type, typeLabel, firstFix: { lat: fix.lat, lng: fix.lng } });
  };

  const TypeButton = ({ value, label }: { value: ActivityType; label: string }) => (
    <Pressable
      style={[styles.typeBtn, type === value && styles.typeBtnActive]}
      onPress={() => setType(value)}
    >
      <Text style={[styles.typeBtnText, type === value && styles.typeBtnTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Start activity</Text>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#666" />
            </Pressable>
          </View>

          <Text style={styles.label}>Activity type</Text>
          <View style={styles.typeRow}>
            <TypeButton value="canvassing" label="Canvassing" />
            <TypeButton value="leafletting" label="Leafletting" />
            <TypeButton value="other" label="Other" />
          </View>
          {type === 'other' && (
            <TextInput
              style={styles.input}
              value={otherLabel}
              onChangeText={setOtherLabel}
              placeholder="Describe the activity (e.g. Sign survey)"
              placeholderTextColor="#999"
              autoCapitalize="sentences"
            />
          )}

          <Text style={styles.label}>GPS</Text>
          {!locking ? (
            <Pressable style={styles.lockBtn} onPress={beginLock}>
              <Ionicons name="locate-outline" size={18} color="#fff" />
              <Text style={styles.lockBtnText}>Get GPS lock</Text>
            </Pressable>
          ) : (
            <View style={styles.lockStatus}>
              {!fix ? (
                <>
                  <ActivityIndicator color="#1976d2" />
                  <Text style={styles.lockText}>Waiting for a position… step outside if indoors.</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={locked ? 'checkmark-circle' : 'alert-circle'}
                    size={22}
                    color={locked ? '#2e7d32' : '#f57c00'}
                  />
                  <Text style={styles.lockText}>
                    {locked ? 'GPS locked' : 'Weak fix'}
                    {typeof accuracy === 'number' ? ` · ±${Math.round(accuracy)} m` : ''}
                    {!locked ? ' — you can start now or wait for it to improve.' : ''}
                  </Text>
                </>
              )}
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.hint}>
            While the activity runs, every customer address you pass within a few metres of is marked
            as visited, and the ground you cover is shaded on the map. Keep this page open
            {Platform.OS === 'web' ? ' and the screen on' : ''}.
          </Text>

          <View style={styles.footerRow}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.startBtn, !canStart && styles.disabled]}
              disabled={!canStart}
              onPress={handleStart}
            >
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.startText}>{starting ? 'Starting…' : 'Start activity'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 12, marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    backgroundColor: '#fff',
  },
  typeBtnActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  typeBtnText: { color: '#333', fontWeight: '600', fontSize: 14 },
  typeBtnTextActive: { color: '#fff' },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1976d2',
    paddingVertical: 11,
    borderRadius: 8,
  },
  lockBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  lockStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f4f7fb',
    borderRadius: 8,
    padding: 12,
  },
  lockText: { flex: 1, color: '#333', fontSize: 14 },
  error: { color: '#c62828', marginTop: 8, fontSize: 13 },
  hint: { color: '#777', fontSize: 12, marginTop: 14, lineHeight: 17 },
  footerRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eceff1' },
  cancelText: { color: '#333', fontWeight: '600' },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2e7d32',
  },
  startText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
