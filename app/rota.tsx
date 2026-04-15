import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { addDays, format, isToday, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { Colors } from '../constants/Colors';
import { getUserSession } from '../core/session';
import { useColorScheme } from '../hooks/useColorScheme';
import { listMembers, MemberRecord } from '../services/accountService';
import {
  AvailabilityStatus,
  cleanupOldRota,
  fetchRotaRange,
  setAvailability,
} from '../services/rotaService';
import {
  DAY_KEYS,
  DEFAULT_PATTERN,
  getRotaRule,
  setRotaRule,
  WeeklyPattern,
} from '../services/rotaRulesService';

const STATUS_ORDER: AvailabilityStatus[] = ['on', 'off', 'n/a'];

function nextStatus(current: AvailabilityStatus): AvailabilityStatus {
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

const STATUS_COLORS = {
  light: { on: '#34C759', off: '#FF3B30', na: '#E5E5EA' },
  dark: { on: '#30D158', off: '#FF453A', na: '#3A3A3C' },
};

const TODAY_HIGHLIGHT = {
  light: 'rgba(0, 122, 255, 0.06)',
  dark: 'rgba(100, 170, 255, 0.08)',
};

function getMemberDisplayName(member: MemberRecord): string {
  const prefix = member.email.split('@')[0];
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export default function RotaScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const colors = STATUS_COLORS[colorScheme];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [rota, setRota] = useState<Record<string, Record<string, AvailabilityStatus>>>({});
  const [canEditAll, setCanEditAll] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  // Default schedule modal state
  const [patternModalVisible, setPatternModalVisible] = useState(false);
  const [patternMember, setPatternMember] = useState<MemberRecord | null>(null);
  const [patternData, setPatternData] = useState<WeeklyPattern>({ ...DEFAULT_PATTERN });
  const [patternSaving, setPatternSaving] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const today = addDays(new Date(), weekOffset * 7);
      const start = startOfWeek(today, { weekStartsOn: 1 });
      const dates: Date[] = [];
      for (let i = 0; i < 7; i++) {
        dates.push(addDays(start, i));
      }
      setWeekDates(dates);

      const m = await listMembers();
      const sess = await getUserSession();

      // Set session state early so permissions are correct even if data loading fails
      setUserId(sess?.uid || null);
      setCanEditAll(!!sess?.isOwner);

      let finalMembers = m;
      if (sess && !m.find(mm => mm.uid === sess.uid)) {
        const ownerEmail = (sess as any).email ?? 'owner';
        finalMembers = [
          {
            uid: sess.uid,
            email: ownerEmail,
            role: 'owner',
            perms: {},
            status: 'active',
            createdAt: new Date().toISOString(),
          } as any,
          ...m,
        ];
      }
      setMembers(finalMembers);

      const rotaData = await fetchRotaRange(dates[0], dates[6]);
      setRota(rotaData);

      if (weekOffset === 0) {
        const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        await cleanupOldRota(currentWeekStart);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [weekOffset]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [weekOffset]),
  );

  const handleCellPress = async (dateKey: string, member: MemberRecord) => {
    const current = rota[dateKey]?.[member.uid] || 'n/a';
    const newStatus = nextStatus(current);

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

  const getAvailableCount = (dateKey: string): number => {
    return members.filter(m => (rota[dateKey]?.[m.uid] ?? 'n/a') === 'on').length;
  };

  // --- Default Schedule Modal ---
  const openPatternModal = async (member: MemberRecord) => {
    setPatternMember(member);
    try {
      const existing = await getRotaRule(member.uid);
      setPatternData(existing ? { ...existing.pattern } : { ...DEFAULT_PATTERN });
    } catch {
      setPatternData({ ...DEFAULT_PATTERN });
    }
    setPatternModalVisible(true);
  };

  const handlePatternDayToggle = (dayKey: keyof WeeklyPattern) => {
    setPatternData(prev => ({
      ...prev,
      [dayKey]: nextStatus(prev[dayKey]),
    }));
  };

  const handleSavePattern = async () => {
    if (!patternMember) return;
    setPatternSaving(true);
    try {
      await setRotaRule(patternMember.uid, patternData);
      setPatternModalVisible(false);
      await loadData();
    } catch (err) {
      console.error('Error saving default schedule:', err);
    } finally {
      setPatternSaving(false);
    }
  };

  // --- Week header info ---
  const headerStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.divider }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.replace('/')} style={styles.headerBtn} accessibilityLabel="Home">
            <Ionicons name="home" size={22} color={theme.tint} />
          </Pressable>
          <ThemedText type="subtitle" style={styles.headerTitle}>Team Rota</ThemedText>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => router.push('/rota-history' as any)} style={styles.headerBtn}>
            <Ionicons name="time-outline" size={22} color={theme.tint} />
          </Pressable>
          <Pressable onPress={() => router.push('/audit-log' as any)} style={styles.headerBtn}>
            <Ionicons name="document-text-outline" size={22} color={theme.tint} />
          </Pressable>
        </View>
      </View>

      {/* Week Navigator */}
      <View style={[styles.weekNav, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Pressable
          disabled={weekOffset <= -51}
          onPress={() => setWeekOffset(weekOffset - 1)}
          style={styles.navBtn}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={weekOffset <= -51 ? theme.tertiaryText : theme.tint}
          />
        </Pressable>

        {weekOffset !== 0 && (
          <Pressable onPress={() => setWeekOffset(0)} style={styles.navBtn} accessibilityLabel="Jump to current week">
            <Ionicons name="today-outline" size={20} color={theme.tint} />
          </Pressable>
        )}

        <View style={styles.weekLabel}>
          <ThemedText type="defaultSemiBold" style={styles.weekText}>
            {format(headerStart, 'd MMM yyyy')} – {format(addDays(headerStart, 6), 'd MMM')}
          </ThemedText>
          {weekOffset === 0 && (
            <Text style={[styles.currentBadge, { backgroundColor: theme.tint }]}>This Week</Text>
          )}
        </View>

        <Pressable
          disabled={weekOffset >= 51}
          onPress={() => setWeekOffset(weekOffset + 1)}
          style={styles.navBtn}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={weekOffset >= 51 ? theme.tertiaryText : theme.tint}
          />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      ) : (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {/* Grid Card */}
          <View style={[styles.gridCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'}>
              <View>
                {/* Grid Header */}
                <View style={[styles.gridHeaderRow, { backgroundColor: theme.sectionCardHeader, borderBottomColor: theme.cardBorder }]}>
                  <View style={styles.dayColumn}>
                    <Text style={[styles.gridHeaderText, { color: theme.secondaryText }]}>Day</Text>
                  </View>
                  {members.map(m => (
                    <View key={m.uid} style={styles.memberColumn}>
                      <Text
                        style={[styles.gridHeaderText, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {getMemberDisplayName(m)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Day Rows */}
                {weekDates.map((date, rowIdx) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const isTodayRow = isToday(date);
                  const available = getAvailableCount(dateKey);
                  const isWeekend = rowIdx >= 5;

                  return (
                    <View
                      key={dateKey}
                      style={[
                        styles.gridRow,
                        isTodayRow && { backgroundColor: TODAY_HIGHLIGHT[colorScheme] },
                        rowIdx < 6 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder },
                      ]}
                    >
                      <View style={styles.dayColumn}>
                        <Text
                          style={[
                            styles.dayLabel,
                            { color: theme.text },
                            isTodayRow && styles.dayLabelToday,
                            isWeekend && { color: theme.secondaryText },
                          ]}
                        >
                          {format(date, 'EEE d/M')}
                        </Text>
                        <Text style={[styles.availCount, { color: theme.tertiaryText }]}>
                          {available}/{members.length}
                        </Text>
                      </View>

                      {members.map(member => {
                        const status: AvailabilityStatus = rota[dateKey]?.[member.uid] || 'n/a';
                        const editable = canEditAll || member.uid === userId;
                        const pillBg =
                          status === 'on' ? colors.on : status === 'off' ? colors.off : colors.na;
                        const pillTextColor = status === 'n/a' ? theme.secondaryText : '#fff';
                        const pillLabel = status === 'on' ? 'ON' : status === 'off' ? 'OFF' : '—';

                        return (
                          <Pressable
                            key={member.uid}
                            style={[
                              styles.memberColumn,
                              styles.cellContainer,
                            ]}
                            onPress={() => editable && handleCellPress(dateKey, member)}
                          >
                            <View
                              style={[
                                styles.statusPill,
                                { backgroundColor: pillBg },
                                !editable && styles.pillDisabled,
                              ]}
                            >
                              <Text style={[styles.pillText, { color: pillTextColor }]}>
                                {pillLabel}
                              </Text>
                              {!editable && (
                                <Ionicons
                                  name="lock-closed"
                                  size={9}
                                  color={status === 'n/a' ? theme.tertiaryText : 'rgba(255,255,255,0.6)'}
                                  style={styles.lockIcon}
                                />
                              )}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Default Schedule Section */}
          {canEditAll ? (
            <View style={styles.defaultSection}>
              <Text style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                Set Default Schedule
              </Text>
              <View style={styles.actionRow}>
              {members.map(m => (
                <Pressable
                  key={m.uid}
                  style={[styles.actionChip, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  onPress={() => openPatternModal(m)}
                >
                  <Ionicons name="calendar-outline" size={16} color={theme.tint} />
                  <Text style={[styles.actionChipText, { color: theme.text }]} numberOfLines={1}>
                    {getMemberDisplayName(m)}
                  </Text>
                </Pressable>
              ))}
              </View>
            </View>
          ) : userId ? (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: theme.tint }]}
              onPress={() => {
                const me = members.find(m => m.uid === userId);
                if (me) openPatternModal(me);
              }}
            >
              <Ionicons name="calendar-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Set My Default Schedule</Text>
            </Pressable>
          ) : null}

          {/* Legend */}
          <View style={[styles.legend, { borderColor: theme.cardBorder }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.on }]} />
              <Text style={[styles.legendText, { color: theme.secondaryText }]}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.off }]} />
              <Text style={[styles.legendText, { color: theme.secondaryText }]}>Off</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.na }]} />
              <Text style={[styles.legendText, { color: theme.secondaryText }]}>Not Set</Text>
            </View>
            {!canEditAll && (
              <View style={styles.legendItem}>
                <Ionicons name="lock-closed" size={12} color={theme.tertiaryText} />
                <Text style={[styles.legendText, { color: theme.secondaryText }]}>Read-only</Text>
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Pattern Modal */}
      <Modal
        visible={patternModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPatternModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.modalBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.divider }]}>
              <ThemedText type="subtitle">Default Schedule</ThemedText>
              <Pressable onPress={() => setPatternModalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>

            {/* Member selector (owners) or label (members) */}
            {canEditAll ? (
              <View style={styles.memberSelector}>
                <Text style={[styles.fieldLabel, { color: theme.secondaryText }]}>Setting default for</Text>
                <Pressable
                  style={[styles.pickerBtn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}
                  onPress={() => setMemberPickerOpen(!memberPickerOpen)}
                >
                  <Text style={[styles.pickerBtnText, { color: theme.text }]}>
                    {patternMember ? getMemberDisplayName(patternMember) : 'Select member'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={theme.secondaryText} />
                </Pressable>
                {memberPickerOpen && (
                  <View style={[styles.pickerDropdown, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {members.map(m => (
                        <Pressable
                          key={m.uid}
                          style={[
                            styles.pickerOption,
                            patternMember?.uid === m.uid && { backgroundColor: theme.sectionCardHeader },
                          ]}
                          onPress={() => {
                            setPatternMember(m);
                            setMemberPickerOpen(false);
                            getRotaRule(m.uid).then(rule => {
                              setPatternData(rule ? { ...rule.pattern } : { ...DEFAULT_PATTERN });
                            }).catch(() => setPatternData({ ...DEFAULT_PATTERN }));
                          }}
                        >
                          <Text style={[styles.pickerOptionText, { color: theme.text }]}>
                            {getMemberDisplayName(m)}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.memberSelector}>
                <Text style={[styles.fieldLabel, { color: theme.secondaryText }]}>Your default schedule</Text>
              </View>
            )}

            {/* Day toggles */}
            <View style={styles.patternDays}>
              {DAY_KEYS.map((dayKey, idx) => {
                const status = patternData[dayKey];
                const pillBg =
                  status === 'on' ? colors.on : status === 'off' ? colors.off : colors.na;
                const pillTextColor = status === 'n/a' ? theme.secondaryText : '#fff';
                const pillLabel = status === 'on' ? 'ON' : status === 'off' ? 'OFF' : '—';

                return (
                  <Pressable
                    key={dayKey}
                    style={[styles.patternRow, { borderBottomColor: theme.divider }]}
                    onPress={() => handlePatternDayToggle(dayKey)}
                  >
                    <Text style={[styles.patternDayLabel, { color: theme.text }]}>
                      {DAY_LABELS[idx]}
                    </Text>
                    <View style={[styles.patternPill, { backgroundColor: pillBg }]}>
                      <Text style={[styles.patternPillText, { color: pillTextColor }]}>
                        {pillLabel}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Explanation */}
            <Text style={[styles.explanationText, { color: theme.tertiaryText }]}>
              This schedule applies automatically to all weeks without a manual override. Tap any cell on the grid to override a specific day.
            </Text>

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn, { borderColor: theme.cardBorder }]}
                onPress={() => setPatternModalVisible(false)}
              >
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.saveBtn, { backgroundColor: theme.tint }]}
                onPress={handleSavePattern}
                disabled={patternSaving}
              >
                {patternSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save Default</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 22,
  },

  // Week Navigator
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    padding: 8,
  },
  weekLabel: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  weekText: {
    fontSize: 15,
    textAlign: 'center',
  },
  currentBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Scroll
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Grid Card
  gridCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 48,
  },

  // Columns
  dayColumn: {
    width: 90,
    paddingLeft: 8,
  },
  memberColumn: {
    minWidth: 100,
    alignItems: 'center',
    paddingHorizontal: 4,
  },

  // Day labels
  dayLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  dayLabelToday: {
    fontWeight: '700',
  },
  availCount: {
    fontSize: 11,
    marginTop: 1,
  },

  // Status pills
  cellContainer: {
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    minWidth: 60,
    gap: 4,
  },
  pillDisabled: {
    opacity: 0.55,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  lockIcon: {
    marginLeft: 1,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
  },

  // Default schedule section
  defaultSection: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionChipText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Action button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }
      : { elevation: 8 }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Member selector
  memberSelector: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickerBtnText: {
    fontSize: 15,
  },
  pickerDropdown: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pickerOptionText: {
    fontSize: 15,
  },

  // Pattern days
  patternDays: {
    marginBottom: 16,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  patternDayLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  patternPill: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 12,
    minWidth: 56,
    alignItems: 'center',
  },
  patternPillText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Explanation
  explanationText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },

  // Modal actions
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  saveBtn: {},
  modalBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
