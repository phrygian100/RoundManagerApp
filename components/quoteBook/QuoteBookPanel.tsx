import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import Papa from 'papaparse';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { getDataOwnerId } from '../../core/session';
import {
  deleteQuoteBookEntries,
  fetchQuoteBookPage,
  fetchQuotesByFilters,
  formatQuoteOption,
  importQuoteRows,
  mapCsvRow,
  migrateLegacyQuotes,
  QUOTE_BOOK_STATUS_LABELS,
  QUOTE_FILTER_MAX,
  QuoteBookEntry,
  QuoteBookImportResult,
  QuoteBookOption,
  QuoteBookStatus,
  QuoteFilterField,
  QuoteFilterRule,
  quotesToCsvRows,
  updateQuoteBookEntry,
} from '../../services/quoteBookService';
import { getUserProfile } from '../../services/userService';

const notify = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const confirmAction = (message: string): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => Alert.alert('Confirm', message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'OK', onPress: () => resolve(true) },
  ]));
};

const STATUS_FILTERS: (QuoteBookStatus | 'all')[] = ['all', 'open', 'accepted', 'converted', 'declined'];
const STATUS_COLOURS: Record<QuoteBookStatus, string> = {
  open: '#1976d2',
  accepted: '#2e7d32',
  converted: '#6a1b9a',
  declined: '#9e9e9e',
};

type EditForm = {
  address: string; town: string; postcode: string; price4: string; price8: string;
  name: string; phone: string; notes: string; homeSummary: string;
};
const EMPTY_FORM: EditForm = { address: '', town: '', postcode: '', price4: '', price8: '', name: '', phone: '', notes: '', homeSummary: '' };

const FILTER_FIELDS: { key: QuoteFilterField; label: string; placeholder: string }[] = [
  { key: 'town', label: 'Town', placeholder: 'Billinghay' },
  { key: 'street', label: 'Street', placeholder: 'Green Lane' },
  { key: 'postcode', label: 'Postcode', placeholder: 'LN4 4 or LN4 4BQ' },
];
const FILTER_RENDER_STEP = 200;
const newRule = (mode: QuoteFilterRule['mode'] = 'include', field: QuoteFilterField = 'town'): QuoteFilterRule => ({ mode, field, value: '' });

const describeImport = (r: QuoteBookImportResult) => [
  `${r.created} quotes added.`,
  r.skippedExisting ? `${r.skippedExisting} existing customers skipped.` : '',
  r.skippedNoPrice ? `${r.skippedNoPrice} rows with no price skipped (flats/communal blocks).` : '',
  r.skippedDuplicate ? `${r.skippedDuplicate} already in the quote book.` : '',
  r.skippedInvalid ? `${r.skippedInvalid} rows had no address.` : '',
].filter(Boolean).join('\n');

export default function QuoteBookPanel({ addRequestKey }: { addRequestKey: number }) {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [entries, setEntries] = useState<QuoteBookEntry[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<QuoteBookStatus | 'all'>('open');
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [editing, setEditing] = useState<{ visible: boolean; entry: QuoteBookEntry | null }>({ visible: false, entry: null });
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [rules, setRules] = useState<QuoteFilterRule[]>([newRule()]);
  const [filterResult, setFilterResult] = useState<{ entries: QuoteBookEntry[]; truncated: boolean } | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [filterRenderCount, setFilterRenderCount] = useState(FILTER_RENDER_STEP);
  const requestSeq = useRef(0);

  useEffect(() => {
    getDataOwnerId().then((id) => setOwnerId(id || null));
  }, []);

  const load = useCallback(async (reset: boolean) => {
    if (!ownerId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const page = await fetchQuoteBookPage(ownerId, { status, search: appliedSearch, cursor: reset ? null : cursor });
      if (seq !== requestSeq.current) return;
      setEntries((prev) => (reset ? page.entries : [...prev, ...page.entries]));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error('Quote book load failed:', err);
      if (seq === requestSeq.current) notify('Quote book', 'Could not load quotes. Please try again.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [ownerId, status, appliedSearch, cursor]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, status, appliedSearch]);

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const openAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditing({ visible: true, entry: null });
  }, []);

  useEffect(() => {
    if (addRequestKey > 0) openAdd();
  }, [addRequestKey, openAdd]);

  const openEdit = (entry: QuoteBookEntry) => {
    const price = (w: number) => {
      const o = entry.options.find((x) => x.frequencyWeeks === w);
      return o ? String(o.price) : '';
    };
    setForm({
      address: entry.address, town: entry.town, postcode: entry.postcode,
      price4: price(4), price8: price(8),
      name: entry.name || '', phone: entry.phone || '', notes: entry.notes || '', homeSummary: entry.homeSummary || '',
    });
    setEditing({ visible: true, entry });
  };

  const runImport = async (csvText: string) => {
    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data.map(mapCsvRow).filter((r) => r.address);
    if (!rows.length) {
      notify('Import', 'No rows with an address were found. The file needs an address column (address_line or address).');
      return;
    }
    const ok = await confirmAction(`Import ${rows.length.toLocaleString()} rows into the quote book?\n\nExisting customers, rows with no price, and addresses already in the book are skipped.`);
    if (!ok) return;
    setImporting({ done: 0, total: rows.length });
    try {
      const result = await importQuoteRows(rows, (done, total) => setImporting({ done, total }));
      notify('Import complete', describeImport(result));
      load(true);
    } catch (err: any) {
      console.error('Quote import failed:', err);
      notify('Import stopped', `${err?.message || 'The import failed.'}\n\nRun the same file again: rows already added are skipped.`);
    } finally {
      setImporting(null);
    }
  };

  const handleImportPress = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,text/csv';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) await runImport(await file.text());
      };
      input.click();
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.canceled || !result.assets?.[0]) return;
    const response = await fetch(result.assets[0].uri);
    await runImport(await response.text());
  };

  const handleMigrate = async () => {
    const ok = await confirmAction('Copy quotes from the old Quotes screen into the quote book?\n\nPending quotes become Open, won become Converted, lost become Declined. Booked quote visits stay on the Visits tab until they have happened.');
    if (!ok) return;
    setMigrating(true);
    try {
      const s = await migrateLegacyQuotes();
      notify('Old quotes copied', [
        `${s.migrated || 0} copied into the quote book.`,
        s.linkedExisting ? `${s.linkedExisting} matched an address already in the book.` : '',
        s.alreadyMigrated ? `${s.alreadyMigrated} were already copied.` : '',
        s.stillScheduled ? `${s.stillScheduled} booked visits left on the Visits tab.` : '',
        s.noPrice ? `${s.noPrice} had no 4- or 8-weekly price and were left on the Visits tab.` : '',
      ].filter(Boolean).join('\n'));
      load(true);
    } catch (err: any) {
      notify('Copy failed', err?.message || 'Please try again.');
    } finally {
      setMigrating(false);
    }
  };

  const handleSave = async () => {
    if (!form.address.trim()) { notify('Quote', 'Please enter the address.'); return; }
    const p4 = Number(form.price4) || 0;
    const p8 = Number(form.price8) || 0;
    if (!p4 && !p8) { notify('Quote', 'Please enter a 4-weekly or 8-weekly price.'); return; }
    setSaving(true);
    try {
      if (editing.entry) {
        const options: QuoteBookOption[] = [];
        if (p4) options.push({ frequencyWeeks: 4, price: p4 });
        if (p8) options.push({ frequencyWeeks: 8, price: p8 });
        await updateQuoteBookEntry(editing.entry.ref, {
          address: form.address.trim(), town: form.town.trim(), postcode: form.postcode.trim().toUpperCase(),
          options, name: form.name.trim() || null, phone: form.phone.trim() || null,
          notes: form.notes.trim() || null, homeSummary: form.homeSummary.trim(),
        });
      } else {
        const result = await importQuoteRows([{
          address: form.address, town: form.town, postcode: form.postcode,
          price4: p4 || null, price8: p8 || null,
          name: form.name, phone: form.phone, notes: form.notes,
          homeSummary: form.homeSummary.trim() || undefined,
        }], undefined, 'manual');
        if (!result.created && result.existingRefs[0]) {
          notify('Already quoted', `That address is already in the quote book as ref ${result.existingRefs[0]}.`);
          setSearch(result.existingRefs[0]);
        } else if (result.refs[0]) {
          notify('Quote added', `Quote ref ${result.refs[0]}.`);
        }
      }
      setEditing({ visible: false, entry: null });
      load(true);
    } catch (err: any) {
      notify('Save failed', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const setEntryStatus = async (entry: QuoteBookEntry, next: QuoteBookStatus) => {
    await updateQuoteBookEntry(entry.ref, { status: next });
    setEntries((prev) => prev
      .map((e) => (e.ref === entry.ref ? { ...e, status: next } : e))
      .filter((e) => status === 'all' || e.status === status));
    setFilterResult((prev) => prev && { ...prev, entries: prev.entries.map((e) => (e.ref === entry.ref ? { ...e, status: next } : e)) });
  };

  const handleDelete = async (entry: QuoteBookEntry) => {
    if (!(await confirmAction(`Delete quote ${entry.ref} for ${entry.address}? This cannot be undone.`))) return;
    await deleteQuoteBookEntries([entry.ref]);
    setEntries((prev) => prev.filter((e) => e.ref !== entry.ref));
    setFilterResult((prev) => prev && { ...prev, entries: prev.entries.filter((e) => e.ref !== entry.ref) });
  };

  const updateRule = (index: number, patch: Partial<QuoteFilterRule>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const runFilters = async () => {
    if (!ownerId) return;
    setFiltering(true);
    try {
      const result = await fetchQuotesByFilters(ownerId, rules);
      setFilterResult(result);
      setFilterRenderCount(FILTER_RENDER_STEP);
    } catch (err: any) {
      console.error('Quote filter failed:', err);
      notify('Filters', err?.message || 'Could not load quotes for those filters.');
    } finally {
      setFiltering(false);
    }
  };

  const clearFilters = () => {
    setRules([newRule()]);
    setFilterResult(null);
  };

  const filteredShown = filterResult
    ? filterResult.entries.filter((e) => status === 'all' || e.status === status)
    : [];

  const downloadCsv = async () => {
    if (!filteredShown.length) return;
    let businessName = '';
    try {
      businessName = ownerId ? (await getUserProfile(ownerId) as any)?.businessName || '' : '';
    } catch {
      businessName = '';
    }
    const csv = Papa.unparse(quotesToCsvRows(filteredShown, businessName));
    const filename = `quote-book-${new Date().toISOString().slice(0, 10)}-${filteredShown.length}.csv`;
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }
    const fileUri = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    try {
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share quote CSV' });
        return;
      }
    } catch {
      // fall through to the saved-file message
    }
    notify('Exported', `CSV saved to ${fileUri}`);
  };

  const handleAddClient = (entry: QuoteBookEntry, option: QuoteBookOption) => {
    router.push({
      pathname: '/add-client',
      params: {
        name: entry.name || '',
        address1: entry.address,
        town: entry.town,
        postcode: entry.postcode,
        mobileNumber: entry.phone || '',
        email: entry.email || '',
        quote: String(option.price),
        frequency: String(option.frequencyWeeks),
        source: 'Quote sheet',
        quoteBookRef: entry.ref,
      },
    });
  };

  const renderEntry = (entry: QuoteBookEntry) => {
    const accepted = entry.acceptedOption;
    return (
      <View key={entry.ref} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardAddress}>{entry.address}</Text>
            <Text style={styles.cardTown}>{[entry.town, entry.postcode].filter(Boolean).join(', ')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOURS[entry.status] || '#999' }]}>
              <Text style={styles.statusBadgeText}>{QUOTE_BOOK_STATUS_LABELS[entry.status] || entry.status}</Text>
            </View>
            <Text style={styles.refText}>Ref {entry.ref}</Text>
          </View>
        </View>

        <View style={styles.optionRow}>
          {entry.options.map((o) => (
            <View key={o.frequencyWeeks} style={[styles.optionChip, accepted?.frequencyWeeks === o.frequencyWeeks && styles.optionChipChosen]}>
              <Text style={styles.optionChipText}>{formatQuoteOption(o)}</Text>
            </View>
          ))}
        </View>

        {entry.homeSummary ? <Text style={styles.homeSummary}>{entry.homeSummary}</Text> : null}
        {(entry.name || entry.phone) ? (
          <Text style={styles.contact}>{[entry.name, entry.phone, entry.email].filter(Boolean).join(' · ')}</Text>
        ) : null}
        {entry.notes ? <Text style={styles.notes}>{entry.notes}</Text> : null}
        {entry.sheetPrintedAt ? <Text style={styles.meta}>Sheet printed {entry.sheetPrintedAt.slice(0, 10)}</Text> : null}
        {entry.acceptedAt ? <Text style={styles.meta}>Accepted online {entry.acceptedAt.slice(0, 10)}</Text> : null}

        <View style={styles.actions}>
          {entry.status !== 'converted' && (accepted ? [accepted] : entry.options).map((o) => (
            <Pressable key={o.frequencyWeeks} style={styles.primaryBtn} onPress={() => handleAddClient(entry, o)}>
              <Ionicons name="person-add-outline" size={15} color="#fff" />
              <Text style={styles.primaryBtnText}>Add client · {o.frequencyWeeks}wk £{o.price}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.secondaryBtn} onPress={() => openEdit(entry)}>
            <Text style={styles.secondaryBtnText}>Edit</Text>
          </Pressable>
          {entry.status === 'declined' ? (
            <Pressable style={styles.secondaryBtn} onPress={() => setEntryStatus(entry, 'open')}>
              <Text style={styles.secondaryBtnText}>Reopen</Text>
            </Pressable>
          ) : entry.status !== 'converted' ? (
            <Pressable style={styles.secondaryBtn} onPress={() => setEntryStatus(entry, 'declined')}>
              <Text style={styles.secondaryBtnText}>Decline</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.deleteBtn} onPress={() => handleDelete(entry)}>
            <Ionicons name="trash-outline" size={16} color="#c62828" />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {!showFilters && (
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by ref, street, postcode or town…"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#999" />
          </Pressable>
        ) : null}
      </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map((s) => (
          <Pressable key={s} onPress={() => setStatus(s)} style={[styles.filterChip, status === s && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, status === s && styles.filterChipTextActive]}>
              {s === 'all' ? 'All' : QUOTE_BOOK_STATUS_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.toolRow}>
        <Pressable
          style={[styles.toolBtn, showFilters && styles.toolBtnActive]}
          onPress={() => {
            if (showFilters) clearFilters();
            setShowFilters((v) => !v);
          }}
        >
          <Ionicons name="funnel-outline" size={16} color={showFilters ? '#fff' : '#1976d2'} />
          <Text style={[styles.toolBtnText, showFilters && { color: '#fff' }]}>{showFilters ? 'Close filters' : 'Filters'}</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={handleImportPress} disabled={!!importing}>
          <Ionicons name="cloud-upload-outline" size={16} color="#1976d2" />
          <Text style={styles.toolBtnText}>Import CSV</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={openAdd}>
          <Ionicons name="add" size={16} color="#1976d2" />
          <Text style={styles.toolBtnText}>Add quote</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={handleMigrate} disabled={migrating}>
          {migrating ? <ActivityIndicator size="small" color="#1976d2" /> : <Ionicons name="git-merge-outline" size={16} color="#1976d2" />}
          <Text style={styles.toolBtnText}>Copy old quotes</Text>
        </Pressable>
      </View>

      {importing ? (
        <View style={styles.progressBox}>
          <Text style={styles.progressText}>
            Importing {importing.done.toLocaleString()} of {importing.total.toLocaleString()}… keep this screen open.
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((importing.done / Math.max(1, importing.total)) * 100)}%` as any }]} />
          </View>
        </View>
      ) : null}

      {showFilters ? (
        <View style={styles.filterPanel}>
          <Text style={styles.filterHelp}>
            Include terms on the same field match any of them (two towns = either town). Different fields must all match. Any exclude removes the quote. Postcode accepts a full postcode, a sector (LN4 4) or a district (LN4).
          </Text>
          {rules.map((rule, i) => (
            <View key={i} style={styles.ruleRow}>
              <Pressable
                style={[styles.modeBtn, rule.mode === 'exclude' && styles.modeBtnExclude]}
                onPress={() => updateRule(i, { mode: rule.mode === 'include' ? 'exclude' : 'include' })}
              >
                <Text style={[styles.modeBtnText, rule.mode === 'exclude' && { color: '#c62828' }]}>
                  {rule.mode === 'include' ? 'Include' : 'Exclude'}
                </Text>
              </Pressable>
              <View style={styles.fieldGroup}>
                {FILTER_FIELDS.map((f) => (
                  <Pressable key={f.key} onPress={() => updateRule(i, { field: f.key })} style={[styles.fieldChip, rule.field === f.key && styles.fieldChipActive]}>
                    <Text style={[styles.fieldChipText, rule.field === f.key && styles.fieldChipTextActive]}>{f.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.ruleInput}
                value={rule.value}
                onChangeText={(v) => updateRule(i, { value: v })}
                placeholder={FILTER_FIELDS.find((f) => f.key === rule.field)?.placeholder}
                placeholderTextColor="#aaa"
                autoCapitalize={rule.field === 'postcode' ? 'characters' : 'words'}
                onSubmitEditing={runFilters}
              />
              <Pressable onPress={() => setRules((prev) => (prev.length > 1 ? prev.filter((_, k) => k !== i) : [newRule()]))} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={20} color="#999" />
              </Pressable>
            </View>
          ))}
          <View style={styles.filterActions}>
            <Pressable style={styles.secondaryBtn} onPress={() => setRules((prev) => [...prev, newRule('include', 'town')])}>
              <Text style={styles.secondaryBtnText}>+ Include</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setRules((prev) => [...prev, newRule('exclude', 'street')])}>
              <Text style={[styles.secondaryBtnText, { color: '#c62828' }]}>+ Exclude</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={clearFilters}>
              <Text style={styles.secondaryBtnText}>Clear</Text>
            </Pressable>
            <Pressable style={[styles.applyBtn, filtering && { opacity: 0.6 }]} onPress={runFilters} disabled={filtering}>
              {filtering ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={15} color="#fff" />}
              <Text style={styles.primaryBtnText}>Apply filters</Text>
            </Pressable>
          </View>
          {filterResult ? (
            <View style={styles.filterSummary}>
              <Text style={styles.filterSummaryText}>
                {filteredShown.length.toLocaleString()} quote{filteredShown.length === 1 ? '' : 's'} match
                {status !== 'all' ? ` (${QUOTE_BOOK_STATUS_LABELS[status]} only)` : ''}
                {filterResult.truncated ? `. Stopped at ${QUOTE_FILTER_MAX.toLocaleString()} quotes read; add a narrower include.` : '.'}
              </Text>
              <Pressable style={[styles.applyBtn, !filteredShown.length && { opacity: 0.5 }]} onPress={downloadCsv} disabled={!filteredShown.length}>
                <Ionicons name="download-outline" size={15} color="#fff" />
                <Text style={styles.primaryBtnText}>Download CSV</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {filterResult ? (
        <>
          {filteredShown.slice(0, filterRenderCount).map(renderEntry)}
          {filteredShown.length > filterRenderCount ? (
            <Pressable style={styles.moreBtn} onPress={() => setFilterRenderCount((n) => n + FILTER_RENDER_STEP)}>
              <Text style={styles.moreBtnText}>Show more ({(filteredShown.length - filterRenderCount).toLocaleString()} left)</Text>
            </Pressable>
          ) : null}
        </>
      ) : showFilters ? null : entries.map(renderEntry)}

      {!filterResult && !showFilters ? (
      <>
      {loading ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
      {!loading && entries.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={32} color="#bbb" />
          <Text style={styles.emptyText}>{appliedSearch ? 'No quotes match that search.' : 'No quotes here yet. Import a CSV or add a quote.'}</Text>
        </View>
      ) : null}
      {!loading && hasMore ? (
        <Pressable style={styles.moreBtn} onPress={() => load(false)}>
          <Text style={styles.moreBtnText}>Load more</Text>
        </Pressable>
      ) : null}
      </>
      ) : null}

      <Modal visible={editing.visible} transparent animationType="slide" onRequestClose={() => setEditing({ visible: false, entry: null })}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing.entry ? `Edit quote ${editing.entry.ref}` : 'Add quote'}</Text>
            <ScrollView style={{ maxHeight: 460 }}>
              {([
                ['address', 'Address (first line) *'],
                ['town', 'Town'],
                ['postcode', 'Postcode'],
                ['price4', 'Every 4 weeks (£)'],
                ['price8', 'Every 8 weeks (£)'],
                ['name', 'Homeowner name'],
                ['phone', 'Phone'],
                ['homeSummary', 'What we know about the home'],
                ['notes', 'Notes'],
              ] as [keyof EditForm, string][]).map(([key, label]) => (
                <View key={key} style={{ marginBottom: 10 }}>
                  <Text style={styles.inputLabel}>{label}</Text>
                  <TextInput
                    style={[styles.input, (key === 'notes' || key === 'homeSummary') && { minHeight: 60 }]}
                    value={form[key]}
                    onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                    keyboardType={key === 'price4' || key === 'price8' ? 'decimal-pad' : key === 'phone' ? 'phone-pad' : 'default'}
                    autoCapitalize={key === 'postcode' ? 'characters' : 'sentences'}
                    multiline={key === 'notes' || key === 'homeSummary'}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setEditing({ visible: false, entry: null })}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 16 },
  filterRow: { gap: 8, paddingBottom: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#cfd8dc', backgroundColor: '#fff' },
  filterChipActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  filterChipText: { fontSize: 14, color: '#455a64' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#bbdefb', backgroundColor: '#f5faff' },
  toolBtnText: { color: '#1976d2', fontWeight: '600', fontSize: 14 },
  toolBtnActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  filterPanel: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', padding: 12, marginBottom: 12, gap: 10 },
  filterHelp: { fontSize: 13, color: '#666', lineHeight: 18 },
  ruleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: '#a5d6a7', backgroundColor: '#e8f5e9', minWidth: 74, alignItems: 'center' },
  modeBtnExclude: { borderColor: '#ef9a9a', backgroundColor: '#ffebee' },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: '#2e7d32' },
  fieldGroup: { flexDirection: 'row', borderWidth: 1, borderColor: '#cfd8dc', borderRadius: 6, overflow: 'hidden' },
  fieldChip: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff' },
  fieldChipActive: { backgroundColor: '#1976d2' },
  fieldChipText: { fontSize: 13, color: '#455a64' },
  fieldChipTextActive: { color: '#fff', fontWeight: '600' },
  ruleInput: { flex: 1, minWidth: 160, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, fontSize: 15, color: '#222', backgroundColor: '#fff' },
  filterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  applyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1976d2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  filterSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  filterSummaryText: { fontSize: 14, color: '#333', flex: 1, minWidth: 200 },
  progressBox: { backgroundColor: '#fffde7', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fff59d' },
  progressText: { fontSize: 14, color: '#5d4037', marginBottom: 8 },
  progressTrack: { height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#1976d2' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e6e6e6' },
  cardTop: { flexDirection: 'row', gap: 10 },
  cardAddress: { fontSize: 16, fontWeight: '700', color: '#222' },
  cardTown: { fontSize: 14, color: '#666', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  refText: { fontSize: 12, color: '#888', marginTop: 4, fontVariant: ['tabular-nums'] },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  optionChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#e3f2fd' },
  optionChipChosen: { backgroundColor: '#c8e6c9' },
  optionChipText: { fontSize: 13, color: '#0d47a1', fontWeight: '600' },
  homeSummary: { fontSize: 13, color: '#555', marginTop: 8 },
  contact: { fontSize: 13, color: '#333', marginTop: 6 },
  notes: { fontSize: 13, color: '#333', marginTop: 6, backgroundColor: '#f5f5f5', padding: 8, borderRadius: 6 },
  meta: { fontSize: 12, color: '#888', marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2e7d32', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  secondaryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  secondaryBtnText: { color: '#333', fontWeight: '600', fontSize: 13 },
  deleteBtn: { padding: 8, marginLeft: 'auto' },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  emptyText: { color: '#888', fontSize: 15, textAlign: 'center' },
  moreBtn: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, marginVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1976d2' },
  moreBtnText: { color: '#1976d2', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 460 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  inputLabel: { fontSize: 13, color: '#555', marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15, color: '#222', backgroundColor: '#fff' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
});
