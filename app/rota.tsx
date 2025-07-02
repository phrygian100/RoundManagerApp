import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { addDays, format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getUserSession } from '../core/session';
import { listMembers, MemberRecord } from '../services/accountService';
import { AvailabilityStatus, cleanupOldRota, fetchRotaRange, setAvailability } from '../services/rotaService';

const STATUS_ORDER: AvailabilityStatus[] = ['on', 'off', 'n/a'];

function nextStatus(current: AvailabilityStatus): AvailabilityStatus {
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

export default function RotaScreen() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [rota, setRota] = useState<Record<string, Record<string, AvailabilityStatus>>>({});
  const [canEditAll, setCanEditAll] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const router = useRouter();

  const loadData = async () => {
    // Build week dates (Mon–Sun)
    const today = addDays(new Date(), weekOffset * 7);
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      dates.push(addDays(start, i));
    }
    setWeekDates(dates);

    const m = await listMembers();

    const sess = await getUserSession();
    let finalMembers = m;
    if (sess && !m.find(mm => mm.uid === sess.uid)) {
      const ownerEmail = (sess as any).email ?? 'owner';
      finalMembers = [
        { uid: sess.uid, email: ownerEmail, role: 'owner', perms: {}, status: 'active', createdAt: new Date().toISOString() } as any,
        ...m,
      ];
    }
    setMembers(finalMembers);

    const rotaData = await fetchRotaRange(dates[0], dates[6]);
    setRota(rotaData);

    // Archive past dates (everything before **current** week) – run only when viewing weekOffset 0
    if (weekOffset === 0) {
      const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      await cleanupOldRota(currentWeekStart);
    }

    setUserId(sess?.uid || null);
    setCanEditAll(!!sess?.isOwner);
  };

  useEffect(() => {
    loadData();
  }, [weekOffset]);

  // Re-fetch on focus (permissions / availability may change)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [weekOffset])
  );

  const handleCellPress = async (dateKey: string, member: MemberRecord) => {
    const current = rota[dateKey]?.[member.uid] || 'n/a';
    const newStatus = nextStatus(current);

    // Update local state optimistically
    setRota(prev => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] || {}),
        [member.uid]: newStatus,
      },
    }));

    try {
      await setAvailability(dateKey, member.uid, newStatus);
    } catch (err) {
      console.error('Error updating availability:', err);
    }
  };

  const getStatusColor = (status: AvailabilityStatus): string => {
    switch (status) {
      case 'on':
        return '#32CD32';
      case 'off':
        return '#FF3B30';
      default:
        return '#CCCCCC';
    }
  };

  return (
    <ScrollView horizontal style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }}>
        {/* Week selector */}
        {(() => {
          const headerStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
              <Pressable disabled={weekOffset <= -51} onPress={() => setWeekOffset(weekOffset - 1)} style={{ padding: 8 }}>
                <Ionicons name="chevron-back" size={24} color={weekOffset <= -51 ? '#ccc' : '#007AFF'} />
              </Pressable>
              {weekOffset !== 0 && (
                <Pressable onPress={() => setWeekOffset(0)} style={{ padding: 8 }} accessibilityLabel="Jump to current week">
                  <Ionicons name="return-down-back" size={22} color="#007AFF" />
                </Pressable>
              )}
              <Text style={{ fontWeight: 'bold' }}>{format(headerStart, 'd MMM yyyy')} - {format(addDays(headerStart,6),'d MMM')}</Text>
              <Pressable disabled={weekOffset >= 51} onPress={() => setWeekOffset(weekOffset + 1)} style={{ padding: 8 }}>
                <Ionicons name="chevron-forward" size={24} color={weekOffset >= 51 ? '#ccc' : '#007AFF'} />
              </Pressable>
              <Pressable onPress={() => router.push('/rota-history' as any)} style={{ marginLeft: 16 }}>
                <Text style={{ color: '#007AFF', textDecorationLine: 'underline' }}>Rota History</Text>
              </Pressable>
            </View>
          );
        })()}

        {/* Header Row: members */}
        <View style={styles.headerRow}>
          <View style={[styles.headerCell, { width: 100 }]}> 
            <Text style={styles.headerText}>Day</Text>
          </View>
          {members.map(m => (
            <View key={m.uid} style={[styles.headerCell, { minWidth: 120 }]}> 
              <Text style={styles.headerText}>{m.email.split('@')[0]}</Text>
            </View>
          ))}
        </View>

        {/* Day rows */}
        {weekDates.map(date => {
          const dateKey = format(date, 'yyyy-MM-dd');
          return (
            <View key={dateKey} style={styles.row}>
              {/* Day label */}
              <View style={[styles.nameCell, { width: 100 }]}> 
                <Text>{format(date, 'EEE d/M')}</Text>
              </View>
              {members.map(member => {
                const status: AvailabilityStatus = rota[dateKey]?.[member.uid] || 'n/a';
                const editable = canEditAll || member.uid === userId;
                return (
                  <Pressable
                    key={member.uid}
                    style={[styles.cell, { backgroundColor: getStatusColor(status) }, !editable && styles.cellDisabled]}
                    onPress={() => editable && handleCellPress(dateKey, member)}
                  >
                    <Text style={styles.cellText}>{status === 'n/a' ? '' : status}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 8 },
  headerCell: { flex: 1, alignItems: 'center' },
  headerText: { fontWeight: 'bold' },
  row: { flexDirection: 'row', marginBottom: 4 },
  nameCell: { justifyContent: 'center' },
  cell: {
    flex: 1,
    height: 40,
    marginHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  cellDisabled: {
    opacity: 0.5,
  },
  cellText: {
    color: '#fff',
    fontWeight: 'bold',
  },
}); 