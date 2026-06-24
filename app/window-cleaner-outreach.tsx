import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getUserSession } from '../core/session';
import {
  clearOutreachTouch,
  markOutreachSent,
  subscribeOutreachTouches,
  type OutreachTouch,
} from '../services/windowCleanerOutreachService';
import { DEVELOPER_UID } from '../shared/constants/developer';
import {
  buildOutreachMessage,
  buildWhatsAppUrl,
  OUTREACH_CSV_PATH,
  parseWindowCleanerCsv,
  type WindowCleanerLead,
} from '../utils/windowCleanerOutreach';

type FilterMode = 'pending' | 'contacted' | 'all';

export default function WindowCleanerOutreachScreen() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leads, setLeads] = useState<WindowCleanerLead[]>([]);
  const [touches, setTouches] = useState<Record<string, OutreachTouch>>({});
  const [filter, setFilter] = useState<FilterMode>('pending');
  const [search, setSearch] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeTouches: (() => void) | undefined;

    const init = async () => {
      const session = await getUserSession();
      if (!session || session.uid !== DEVELOPER_UID) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);

      try {
        const csvUrl =
          Platform.OS === 'web'
            ? OUTREACH_CSV_PATH
            : `https://guvnor.app${OUTREACH_CSV_PATH}`;
        const response = await fetch(csvUrl);
        if (!response.ok) {
          throw new Error(`Could not load lead list (${response.status})`);
        }
        const csvText = await response.text();
        setLeads(parseWindowCleanerCsv(csvText));
      } catch (error: any) {
        console.error('Failed to load outreach CSV:', error);
        setLoadError(error?.message || 'Failed to load lead list');
      }

      unsubscribeTouches = subscribeOutreachTouches(setTouches, () => {
        setLoadError('Could not load outreach tracking. Deploy Firestore rules if this is new.');
      });

      setLoading(false);
    };

    init();
    return () => {
      if (unsubscribeTouches) unsubscribeTouches();
    };
  }, []);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const touched = Boolean(touches[lead.id]);
      if (filter === 'pending' && touched) return false;
      if (filter === 'contacted' && !touched) return false;
      if (!query) return true;
      return [lead.business_name, lead.town, lead.phone, lead.address]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [leads, touches, filter, search]);

  const stats = useMemo(() => {
    const contacted = Object.keys(touches).length;
    return {
      total: leads.length,
      contacted,
      pending: Math.max(0, leads.length - contacted),
    };
  }, [leads.length, touches]);

  const formatSentAt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleWhatsApp = async (lead: WindowCleanerLead) => {
    setMarkingId(lead.id);
    try {
      const message = buildOutreachMessage();
      const url = buildWhatsAppUrl(lead.phone, message);
      await markOutreachSent(lead);
      await Linking.openURL(url);
    } catch (error) {
      console.error('WhatsApp outreach failed:', error);
      const msg = 'Could not open WhatsApp or save progress. Please try again.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setMarkingId(null);
    }
  };

  const handleClearTouch = (lead: WindowCleanerLead) => {
    const run = async () => {
      try {
        await clearOutreachTouch(lead.id);
      } catch (error) {
        console.error('Failed to clear outreach touch:', error);
        const msg = 'Could not reset this lead.';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Mark ${lead.business_name} as not contacted?`)) {
        run();
      }
      return;
    }

    Alert.alert('Reset contact', `Mark ${lead.business_name} as not contacted?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: run },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.deniedText}>Developer access required.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Window Cleaner Outreach</Text>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
            <Text style={styles.homeButtonText}>🏠</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Tap WhatsApp, send from your phone, then come back for the next lead.
        </Text>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{stats.pending} to go</Text>
          <Text style={styles.statDivider}>·</Text>
          <Text style={styles.statText}>{stats.contacted} contacted</Text>
          <Text style={styles.statDivider}>·</Text>
          <Text style={styles.statText}>{stats.total} total</Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, town, phone…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.filterRow}>
          {(['pending', 'contacted', 'all'] as FilterMode[]).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.filterChip, filter === mode && styles.filterChipActive]}
              onPress={() => setFilter(mode)}
            >
              <Text style={[styles.filterChipText, filter === mode && styles.filterChipTextActive]}>
                {mode === 'pending' ? 'To contact' : mode === 'contacted' ? 'Contacted' : 'All'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {filteredLeads.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>
              {filter === 'pending' ? 'Nothing left in this queue' : 'No matches'}
            </Text>
            <Text style={styles.emptyMeta}>
              {filter === 'pending'
                ? 'Switch to Contacted or All to review previous messages.'
                : 'Try a different search or filter.'}
            </Text>
          </View>
        ) : (
          filteredLeads.map((lead) => {
            const touch = touches[lead.id];
            const contacted = Boolean(touch);
            return (
              <View
                key={lead.id}
                style={[styles.card, contacted && styles.cardContacted]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.businessName}>{lead.business_name}</Text>
                  {contacted ? (
                    <View style={styles.contactedBadge}>
                      <Text style={styles.contactedBadgeText}>Sent</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.metaLine}>{lead.town}</Text>
                <Text style={styles.metaLine}>{lead.phone}</Text>
                {lead.address ? <Text style={styles.addressLine}>{lead.address}</Text> : null}
                {contacted && touch?.sentAt ? (
                  <Text style={styles.sentAt}>Contacted {formatSentAt(touch.sentAt)}</Text>
                ) : null}

                <View style={styles.cardActions}>
                  <Pressable
                    style={[styles.whatsappButton, markingId === lead.id && styles.buttonDisabled]}
                    disabled={markingId === lead.id}
                    onPress={() => handleWhatsApp(lead)}
                  >
                    {markingId === lead.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                        <Text style={styles.whatsappButtonText}>WhatsApp</Text>
                      </>
                    )}
                  </Pressable>
                  {contacted ? (
                    <Pressable style={styles.resetButton} onPress={() => handleClearTouch(lead)}>
                      <Text style={styles.resetButtonText}>Reset</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  deniedText: {
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'web' ? 24 : 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  homeButton: {
    padding: 8,
  },
  homeButtonText: {
    fontSize: 22,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  statText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  statDivider: {
    marginHorizontal: 8,
    color: '#9ca3af',
  },
  toolbar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
    color: '#111827',
    marginTop: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterChipActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  filterChipText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#047857',
  },
  errorBanner: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  emptyMeta: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardContacted: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  businessName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  contactedBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  contactedBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  metaLine: {
    marginTop: 4,
    fontSize: 14,
    color: '#4b5563',
  },
  addressLine: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  sentAt: {
    marginTop: 8,
    fontSize: 12,
    color: '#047857',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  whatsappButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: 10,
    paddingVertical: 14,
  },
  whatsappButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  resetButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  resetButtonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
});
