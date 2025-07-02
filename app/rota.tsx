import { useFocusEffect } from '@react-navigation/native';
import { addDays, format, startOfWeek } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getUserSession } from '../core/session';
import { listMembers, MemberRecord } from '../services/accountService';
import { AvailabilityStatus, fetchRotaRange, setAvailability } from '../services/rotaService';

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

  const loadData = async () => {
    // Build week dates (Mon–Sun)
    const today = new Date();
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

    setUserId(sess?.uid || null);
    setCanEditAll(!!sess?.isOwner);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Re-fetch on focus (permissions / availability may change)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
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
    <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={[styles.headerCell, { width: 140 }]}> 
            <Text style={styles.headerText}>Member</Text>
          </View>
          {weekDates.map(date => (
            <View key={date.toISOString()} style={styles.headerCell}>
              <Text style={styles.headerText}>{format(date, 'EEE d/M')}</Text>
            </View>
          ))}
        </View>

        {/* Member Rows */}
        {members.map(member => {
          const editableRow = canEditAll || member.uid === userId;
          return (
            <View key={member.uid} style={styles.row}>
              <View style={[styles.nameCell, { width: 140 }]}> 
                <Text>{member.email.split('@')[0]}</Text>
              </View>
              {weekDates.map(date => {
                const key = format(date, 'yyyy-MM-dd');
                const status: AvailabilityStatus = rota[key]?.[member.uid] || 'n/a';
                return (
                  <Pressable
                    key={key}
                    style={[styles.cell, { backgroundColor: getStatusColor(status) }, !editableRow && styles.cellDisabled]}
                    onPress={() => editableRow && handleCellPress(key, member)}
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