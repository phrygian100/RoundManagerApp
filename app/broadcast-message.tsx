import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import PermissionGate from '../components/PermissionGate';
import { getUserSession } from '../core/session';
import { logAction } from '../services/auditService';
import {
  BROADCAST_TOKENS,
  BroadcastClient,
  BroadcastSendSummary,
  estimateSmsSegments,
  loadBroadcastClients,
  renderBroadcastTemplate,
  sendBroadcastSms,
} from '../services/broadcastService';
import { getUserProfile, updateUserProfile } from '../services/userService';

type SortKey = 'name' | 'roundOrder' | 'nextService' | 'price';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'roundOrder', label: 'Round order' },
  { key: 'name', label: 'Name' },
  { key: 'nextService', label: 'Next service' },
  { key: 'price', label: 'Price' },
];

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'EEE d MMM');
  } catch {
    return '—';
  }
}

function confirmDialog(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', style: 'default', onPress: onConfirm },
    ]);
  }
}

export default function BroadcastMessageScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<BroadcastClient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'select' | 'compose'>('select');

  // Select-step controls
  const [search, setSearch] = useState('');
  const [freqFilter, setFreqFilter] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('roundOrder');
  const [sortAsc, setSortAsc] = useState(true);

  // Compose step
  const [message, setMessage] = useState('');
  const cursorRef = useRef({ start: 0, end: 0 });
  const [previewIndex, setPreviewIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendResult, setSendResult] = useState<BroadcastSendSummary | null>(null);

  // Twilio sender configuration (stored on the owner's user doc)
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const [editingSender, setEditingSender] = useState(false);
  const [savingSender, setSavingSender] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, session] = await Promise.all([loadBroadcastClients(), getUserSession()]);
        setClients(list);
        if (session?.uid) {
          setOwnerUid(session.uid);
          const profile = await getUserProfile(session.uid);
          const configured = !!(profile?.twilioAccountSid && profile?.twilioAuthToken && profile?.twilioFromNumber);
          setTwilioConfigured(configured);
          setTwilioSid(profile?.twilioAccountSid || '');
          setTwilioToken(profile?.twilioAuthToken || '');
          setTwilioFrom(profile?.twilioFromNumber || '');
          if (!configured) setEditingSender(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const freqOptions = useMemo(() => {
    const labels = new Map<string, string>();
    clients.forEach(c => {
      labels.set(String(c.frequency ?? 'none'), c.frequencyLabel);
    });
    return Array.from(labels.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => {
        const na = Number(a.key);
        const nb = Number(b.key);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        if (Number.isFinite(na)) return -1;
        if (Number.isFinite(nb)) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [clients]);

  const visibleClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = clients;
    if (q) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.addressLabel.toLowerCase().includes(q) ||
        c.accountNumber.toLowerCase().includes(q) ||
        String(c.roundOrderNumber ?? '').includes(q)
      );
    }
    if (freqFilter.size > 0) {
      list = list.filter(c => freqFilter.has(String(c.frequency ?? 'none')));
    }
    const dir = sortAsc ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'roundOrder':
          return dir * ((a.roundOrderNumber ?? Number.MAX_SAFE_INTEGER) - (b.roundOrderNumber ?? Number.MAX_SAFE_INTEGER));
        case 'nextService': {
          const av = a.nextServiceDate ?? '9999';
          const bv = b.nextServiceDate ?? '9999';
          return dir * av.localeCompare(bv);
        }
        case 'price':
          return dir * ((a.price ?? -1) - (b.price ?? -1));
      }
    });
    return sorted;
  }, [clients, search, freqFilter, sortKey, sortAsc]);

  const recipients = useMemo(
    () => clients.filter(c => selectedIds.has(c.id) && c.phoneE164),
    [clients, selectedIds],
  );
  const selectedWithoutPhone = useMemo(
    () => clients.filter(c => selectedIds.has(c.id) && !c.phoneE164).length,
    [clients, selectedIds],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      visibleClients.forEach(c => next.add(c.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleFreq = (key: string) => {
    setFreqFilter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const onSortPress = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const insertToken = (token: string) => {
    const { start, end } = cursorRef.current;
    setMessage(prev => {
      const s = Math.min(start, prev.length);
      const e = Math.min(end, prev.length);
      const next = prev.slice(0, s) + token + prev.slice(e);
      cursorRef.current = { start: s + token.length, end: s + token.length };
      return next;
    });
  };

  const preview = useMemo(() => {
    if (recipients.length === 0) return null;
    const idx = Math.min(previewIndex, recipients.length - 1);
    return { client: recipients[idx], ...renderBroadcastTemplate(message, recipients[idx]) };
  }, [recipients, previewIndex, message]);

  const missingDataWarning = useMemo(() => {
    if (!message.trim() || recipients.length === 0) return null;
    const counts = new Map<string, number>();
    recipients.forEach(c => {
      renderBroadcastTemplate(message, c).missing.forEach(label => {
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    if (counts.size === 0) return null;
    return Array.from(counts.entries())
      .map(([label, n]) => `${n} recipient${n === 1 ? '' : 's'} missing ${label.toLowerCase()} (will read "TBC")`)
      .join('\n');
  }, [message, recipients]);

  const maxSegments = useMemo(() => {
    if (!message.trim() || recipients.length === 0) return estimateSmsSegments(message);
    let max = 0;
    recipients.forEach(c => {
      max = Math.max(max, estimateSmsSegments(renderBroadcastTemplate(message, c).text));
    });
    return max;
  }, [message, recipients]);

  const alertMsg = (title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const saveSender = async () => {
    if (!ownerUid) return;
    const sid = twilioSid.trim();
    const token = twilioToken.trim();
    const from = twilioFrom.trim();
    // Browser password managers often dump an email into the SID field — catch that clearly.
    if (!sid.startsWith('AC') || sid.length < 30) {
      alertMsg(
        'Invalid Account SID',
        'Paste the Account SID from Twilio Console (it starts with "AC…"). If this field shows your email, clear it — the browser autofilled the wrong value.',
      );
      return;
    }
    if (!token || token.length < 20) {
      alertMsg('Invalid Auth Token', 'Paste the full Primary auth token from Twilio Console → API keys & auth tokens.');
      return;
    }
    if (!from) {
      alertMsg('Missing sender', 'Enter a Twilio phone number (+44…) or an alphanumeric name up to 11 characters (e.g. "TGM Windows").');
      return;
    }
    const isPhone = /^\+\d{8,15}$/.test(from);
    if (!isPhone && (from.length > 11 || !/^[A-Za-z0-9 ]+$/.test(from))) {
      alertMsg(
        'Invalid sender',
        'Alphanumeric senders must be letters/numbers/spaces only and at most 11 characters (e.g. "TGM Windows"). Or use a Twilio number like +447…',
      );
      return;
    }
    setSavingSender(true);
    try {
      await updateUserProfile(ownerUid, {
        twilioAccountSid: sid,
        twilioAuthToken: token,
        twilioFromNumber: from,
      });
      setTwilioConfigured(true);
      setEditingSender(false);
    } catch (err: any) {
      alertMsg('Could not save', err?.message || 'Failed to save Twilio settings.');
    } finally {
      setSavingSender(false);
    }
  };

  const handleSend = () => {
    if (!message.trim() || recipients.length === 0) return;
    confirmDialog(
      'Send broadcast?',
      `This will send an SMS to ${recipients.length} customer${recipients.length === 1 ? '' : 's'} from "${twilioFrom}". This cannot be undone.`,
      async () => {
        setSending(true);
        setSendResult(null);
        setProgress({ done: 0, total: recipients.length });
        try {
          const messages = recipients.map(c => ({
            to: c.phoneE164 as string,
            body: renderBroadcastTemplate(message, c).text,
            clientId: c.id,
          }));
          const summary = await sendBroadcastSms(messages, (done, total) => setProgress({ done, total }));
          setSendResult(summary);
          await logAction(
            'broadcast_sms_sent',
            'client',
            'broadcast',
            `Sent broadcast SMS to ${summary.sent} client${summary.sent === 1 ? '' : 's'}${summary.failed ? ` (${summary.failed} failed)` : ''}`,
          );
        } catch (err: any) {
          const msg = err?.message || 'Broadcast failed';
          Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Broadcast failed', msg);
        } finally {
          setSending(false);
          setProgress(null);
        }
      },
    );
  };

  const failedResults = (sendResult?.results || []).filter(r => !r.ok);
  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach(c => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const renderSelectStep = () => (
    <>
      <View style={styles.controls}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, address, account or round order…"
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.chipRow}>
          {freqOptions.map(opt => (
            <Pressable
              key={opt.key}
              onPress={() => toggleFreq(opt.key)}
              style={[styles.chip, freqFilter.has(opt.key) && styles.chipActive]}
            >
              <Text style={[styles.chipText, freqFilter.has(opt.key) && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chipRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {SORT_OPTIONS.map(opt => (
            <Pressable key={opt.key} onPress={() => onSortPress(opt.key)} style={[styles.chip, sortKey === opt.key && styles.chipActive]}>
              <Text style={[styles.chipText, sortKey === opt.key && styles.chipTextActive]}>
                {opt.label}{sortKey === opt.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chipRow}>
          <Pressable onPress={selectAllVisible} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Select all ({visibleClients.length})</Text>
          </Pressable>
          <Pressable onPress={clearSelection} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Clear selection</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={visibleClients}
        keyExtractor={item => item.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => {
          const selected = selectedIds.has(item.id);
          return (
            <Pressable onPress={() => toggleSelect(item.id)} style={[styles.row, selected && styles.rowSelected]}>
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? '#007AFF' : '#8e8e93'}
                style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name || item.addressLabel || 'Unnamed client'}</Text>
                {!!item.addressLabel && <Text style={styles.rowAddress}>{item.addressLabel}</Text>}
                <Text style={styles.rowMeta}>
                  RO {item.roundOrderNumber ?? '—'} · {item.frequencyLabel} · Next {shortDate(item.nextServiceDate)}
                  {typeof item.price === 'number' ? ` · £${item.price.toFixed(2)}` : ''}
                </Text>
              </View>
              {!item.phoneE164 && (
                <View style={styles.noPhoneBadge}>
                  <Ionicons name="alert-circle-outline" size={14} color="#b45309" />
                  <Text style={styles.noPhoneText}>No mobile</Text>
                </View>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No clients match the current filters.</Text>}
      />

      <View style={styles.footerBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footerCount}>
            {recipients.length} recipient{recipients.length === 1 ? '' : 's'} selected
          </Text>
          {selectedWithoutPhone > 0 && (
            <Text style={styles.footerWarning}>
              {selectedWithoutPhone} selected client{selectedWithoutPhone === 1 ? ' has' : 's have'} no usable mobile number and will be skipped
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => { setPreviewIndex(0); setSendResult(null); setStep('compose'); }}
          disabled={recipients.length === 0}
          style={[styles.primaryButton, recipients.length === 0 && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>Write message →</Text>
        </Pressable>
      </View>
    </>
  );

  const renderComposeStep = () => (
    <FlatList
      data={[0]}
      keyExtractor={() => 'compose'}
      renderItem={() => (
        <View style={styles.composeContainer}>
          <Pressable onPress={() => setStep('select')} style={styles.backLink}>
            <Ionicons name="arrow-back" size={16} color="#007AFF" />
            <Text style={styles.backLinkText}>
              Back to selection ({recipients.length} recipient{recipients.length === 1 ? '' : 's'})
            </Text>
          </Pressable>

          {/* Twilio sender config */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sender</Text>
            {twilioConfigured && !editingSender ? (
              <View style={styles.senderSummaryRow}>
                <Text style={styles.senderSummaryText}>
                  Sending as <Text style={{ fontWeight: '700' }}>{twilioFrom}</Text> via Twilio
                </Text>
                <Pressable onPress={() => setEditingSender(true)}>
                  <Text style={styles.linkButtonText}>Edit</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.helperText}>
                  Enter your Twilio credentials (from twilio.com → Console). The sender can be a Twilio phone number
                  (+44…) or an alphanumeric name up to 11 characters, e.g. "TGM Windows". Recipients can't reply to an
                  alphanumeric sender, so include your mobile number in the message.
                </Text>
                <TextInput
                  style={styles.configInput}
                  placeholder="Account SID (AC…)"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                  value={twilioSid}
                  onChangeText={setTwilioSid}
                />
                <TextInput
                  style={styles.configInput}
                  placeholder="Auth Token"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                  secureTextEntry={Platform.OS !== 'web'}
                  value={twilioToken}
                  onChangeText={setTwilioToken}
                />
                <TextInput
                  style={styles.configInput}
                  placeholder="Sender: +44 number or name (max 11 chars)"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  value={twilioFrom}
                  onChangeText={setTwilioFrom}
                />
                <Pressable onPress={saveSender} disabled={savingSender} style={[styles.secondaryButton, savingSender && styles.primaryButtonDisabled]}>
                  <Text style={styles.secondaryButtonText}>{savingSender ? 'Saving…' : 'Save sender settings'}</Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Composer */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Message</Text>
            <Text style={styles.helperText}>Tap a field to insert it at the cursor. It will be replaced with each customer's own details when sent.</Text>
            <View style={styles.chipRow}>
              {BROADCAST_TOKENS.map(t => (
                <Pressable key={t.token} onPress={() => insertToken(t.token)} style={styles.tokenChip}>
                  <Ionicons name="add" size={14} color="#0369a1" />
                  <Text style={styles.tokenChipText}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.messageInput}
              multiline
              placeholder={'Dear {firstName},\n\nThis is a message from TGM Window Cleaning…'}
              placeholderTextColor="#999"
              value={message}
              onChangeText={setMessage}
              onSelectionChange={e => { cursorRef.current = e.nativeEvent.selection; }}
            />
            <Text style={styles.segmentText}>
              {message.length} characters · up to {maxSegments} SMS segment{maxSegments === 1 ? '' : 's'} per customer
            </Text>
            {!!missingDataWarning && <Text style={styles.warningText}>{missingDataWarning}</Text>}
          </View>

          {/* Preview */}
          {preview && (
            <View style={styles.card}>
              <View style={styles.previewHeader}>
                <Text style={styles.cardTitle}>Preview</Text>
                <View style={styles.previewNav}>
                  <Pressable onPress={() => setPreviewIndex(i => Math.max(0, i - 1))} hitSlop={8} disabled={previewIndex === 0}>
                    <Ionicons name="chevron-back" size={20} color={previewIndex === 0 ? '#ccc' : '#007AFF'} />
                  </Pressable>
                  <Text style={styles.previewCounter}>{Math.min(previewIndex + 1, recipients.length)} / {recipients.length}</Text>
                  <Pressable onPress={() => setPreviewIndex(i => Math.min(recipients.length - 1, i + 1))} hitSlop={8} disabled={previewIndex >= recipients.length - 1}>
                    <Ionicons name="chevron-forward" size={20} color={previewIndex >= recipients.length - 1 ? '#ccc' : '#007AFF'} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.previewRecipient}>
                To: {preview.client.name} ({preview.client.phoneE164})
              </Text>
              <View style={styles.previewBubble}>
                <Text style={styles.previewText}>{preview.text || 'Your message will appear here…'}</Text>
              </View>
            </View>
          )}

          {/* Send / results */}
          {sendResult ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Result</Text>
              <Text style={styles.resultText}>
                ✅ Sent {sendResult.sent} · {sendResult.failed > 0 ? `❌ Failed ${sendResult.failed}` : 'no failures'}
              </Text>
              {failedResults.map(r => (
                <Text key={r.to} style={styles.failedText}>
                  {(r.clientId && clientNameById.get(r.clientId)) || r.to}: {r.error}
                </Text>
              ))}
              <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleSend}
              disabled={sending || !message.trim() || recipients.length === 0 || !twilioConfigured}
              style={[styles.primaryButton, styles.sendButton, (sending || !message.trim() || recipients.length === 0 || !twilioConfigured) && styles.primaryButtonDisabled]}
            >
              {sending ? (
                <Text style={styles.primaryButtonText}>
                  Sending… {progress ? `${progress.done}/${progress.total}` : ''}
                </Text>
              ) : (
                <Text style={styles.primaryButtonText}>
                  Send to {recipients.length} customer{recipients.length === 1 ? '' : 's'}
                </Text>
              )}
            </Pressable>
          )}
          {!twilioConfigured && !sendResult && (
            <Text style={styles.warningText}>Save your Twilio sender settings above to enable sending.</Text>
          )}
        </View>
      )}
    />
  );

  return (
    <PermissionGate perm="isOwner" fallback={<View style={styles.container}><Text style={styles.emptyText}>Only the account owner can send broadcasts.</Text></View>}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </Pressable>
          <Text style={styles.title}>Broadcast Message</Text>
        </View>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading customers and service dates…</Text>
          </View>
        ) : step === 'select' ? renderSelectStep() : renderComposeStep()}
      </View>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    ...(Platform.OS === 'web' ? { maxWidth: 900, width: '100%', alignSelf: 'center' } : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingBottom: 12,
  },
  backButton: { marginRight: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#6b7280' },

  controls: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  sortLabel: { fontSize: 13, color: '#6b7280', marginRight: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  linkButton: { paddingVertical: 4, paddingHorizontal: 4 },
  linkButtonText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  rowSelected: { borderColor: '#007AFF', backgroundColor: '#f0f7ff' },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowAddress: { fontSize: 13, color: '#4b5563', marginTop: 1 },
  rowMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  noPhoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  noPhoneText: { fontSize: 11, color: '#b45309', fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40, paddingHorizontal: 24 },

  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  footerCount: { fontSize: 14, fontWeight: '600', color: '#111827' },
  footerWarning: { fontSize: 12, color: '#b45309', marginTop: 2 },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#b0c4de' },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sendButton: { marginTop: 4 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },

  composeContainer: { padding: 16, gap: 12 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  backLinkText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  helperText: { fontSize: 13, color: '#6b7280', marginBottom: 8, lineHeight: 18 },
  configInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
  },
  senderSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  senderSummaryText: { fontSize: 14, color: '#374151' },

  tokenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#e0f2fe',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 2,
  },
  tokenChipText: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
  messageInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 150,
    textAlignVertical: 'top',
    marginTop: 8,
  },
  segmentText: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  warningText: { fontSize: 13, color: '#b45309', marginTop: 8, lineHeight: 18 },

  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewNav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewCounter: { fontSize: 13, color: '#6b7280', minWidth: 50, textAlign: 'center' },
  previewRecipient: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  previewBubble: {
    backgroundColor: '#e5f0ff',
    borderRadius: 12,
    padding: 12,
  },
  previewText: { fontSize: 14, color: '#111827', lineHeight: 20 },

  resultText: { fontSize: 14, color: '#111827', marginBottom: 6 },
  failedText: { fontSize: 13, color: '#dc2626', marginTop: 2 },
});
