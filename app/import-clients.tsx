import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { generateRecurringJobs } from '../services/jobService';
import { getEffectiveSubscription } from '../services/subscriptionService';
import { normalizeAccountNumber, parseDDMMYYYYToISO, parseMoneyToNumber } from '../utils/spreadsheetImport';

type ClientImportRow = {
  id: string;
  name: string;
  address1: string;
  town: string;
  postcode: string;
  mobileNumber: string;
  email: string;
  quote: string;
  visitFrequency: string;
  startingDate: string;
  roundOrder: string;
  accountNumber: string;
  source: string;
  startingBalance: string;
  runsheetNote: string;
  accountNotes: string;
};

const createEmptyRow = (): ClientImportRow => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  address1: '',
  town: '',
  postcode: '',
  mobileNumber: '',
  email: '',
  quote: '',
  visitFrequency: '',
  startingDate: '',
  roundOrder: '',
  accountNumber: '',
  source: '',
  startingBalance: '',
  runsheetNote: '',
  accountNotes: '',
});

const INITIAL_ROWS = Platform.OS === 'web' ? 12 : 4;

// Helper function to format mobile numbers for UK (same intent as Settings CSV import)
const formatMobileNumber = (input: string): string => {
  if (!input) return '';
  const cleanNumber = input.replace(/\D/g, '');
  if (cleanNumber.length === 10 && !cleanNumber.startsWith('0')) return `0${cleanNumber}`;
  return input.trim();
};

export default function ImportClientsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<ClientImportRow[]>(() => Array.from({ length: INITIAL_ROWS }, createEmptyRow));
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; field: keyof ClientImportRow } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isWeb = Platform.OS === 'web';

  const alertMsg = useCallback((title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  }, []);

  const confirmMsg = useCallback((title: string, message: string) => {
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    });
  }, []);

  const handleBack = useCallback(() => router.replace('/(tabs)/settings'), [router]);

  const rowHasData = (row: ClientImportRow) => Object.values(row).some((v) => typeof v === 'string' && v.trim().length > 0);

  const filledRowCount = rows.filter(rowHasData).length;

  const updateCell = useCallback((rowIndex: number, field: keyof ClientImportRow, value: string) => {
    setRows((prev) => prev.map((row, idx) => (idx === rowIndex ? { ...row, [field]: value } : row)));
  }, []);

  const addRows = useCallback((count: number) => {
    setRows((prev) => [...prev, ...Array.from({ length: count }, createEmptyRow)]);
  }, []);

  useEffect(() => {
    if (!isWeb) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (!focusedCell) return;
      const activeEl = document.activeElement;
      if (!activeEl || !containerRef.current?.contains(activeEl)) return;
      const pastedText = e.clipboardData?.getData('text');
      if (!pastedText) return;
      if (!pastedText.includes('\t') && !pastedText.includes('\n')) return;
      e.preventDefault();

      const lines = pastedText.split('\n').filter(line => line.trim() || line.includes('\t'));
      if (!lines.length) return;

      const fieldOrder: (keyof ClientImportRow)[] = [
        'name',
        'address1',
        'town',
        'postcode',
        'mobileNumber',
        'email',
        'quote',
        'visitFrequency',
        'startingDate',
        'roundOrder',
        'accountNumber',
        'source',
        'startingBalance',
        'runsheetNote',
        'accountNotes',
      ];
      const startFieldIndex = fieldOrder.indexOf(focusedCell.field);
      const startRowIndex = focusedCell.rowIndex;

      setRows((prev) => {
        const newRows = [...prev];
        while (newRows.length < startRowIndex + lines.length) newRows.push(createEmptyRow());
        lines.forEach((line, lineIndex) => {
          const rowIndex = startRowIndex + lineIndex;
          const cells = line.split('\t');
          cells.forEach((cellValue, cellIndex) => {
            const fieldIndex = startFieldIndex + cellIndex;
            if (fieldIndex >= fieldOrder.length) return;
            const field = fieldOrder[fieldIndex];
            newRows[rowIndex] = { ...newRows[rowIndex], [field]: cellValue.trim() };
          });
        });
        return newRows;
      });
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [focusedCell, isWeb]);

  const getRequiredErrors = (row: ClientImportRow): string[] => {
    const errs: string[] = [];
    if (!row.name.trim()) errs.push('Name required');
    if (!row.address1.trim()) errs.push('Address Line 1 required');
    if (!row.quote.trim()) errs.push('Quote (£) required');
    if (!row.visitFrequency.trim()) errs.push('Visit Frequency required');
    if (!row.startingDate.trim()) errs.push('Starting Date required');
    // Validate date format to match settings import expectation
    if (row.startingDate.trim() && !parseDDMMYYYYToISO(row.startingDate) && !/^\d{4}-\d{2}-\d{2}$/.test(row.startingDate.trim())) {
      errs.push('Starting Date invalid (DD/MM/YYYY or YYYY-MM-DD)');
    }
    // Quote parse
    if (row.quote.trim() && parseMoneyToNumber(row.quote) === null) errs.push('Quote invalid');
    return errs;
  };

  const checkClientLimit = useCallback(async () => {
    const ownerId = await getDataOwnerId();
    if (!ownerId) return { canAdd: false, limit: null as number | null, currentCount: 0 };

    const clientsSnapshot = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
    const currentCount = clientsSnapshot.size;

    const sub = await getEffectiveSubscription();
    if (!sub) return { canAdd: false, limit: null as number | null, currentCount };

    if (sub.tier === 'premium' || sub.tier === 'exempt') return { canAdd: true, limit: null as number | null, currentCount };

    const limit = sub.clientLimit || 20;
    return { canAdd: currentCount < limit, limit, currentCount };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;

    const ownerId = await getDataOwnerId();
    if (!ownerId) {
      alertMsg('Error', 'Could not determine account owner. Please log in again.');
      return;
    }

    const activeRows = rows.map((row, idx) => ({ row, idx })).filter(({ row }) => rowHasData(row));
    if (!activeRows.length) {
      alertMsg('Nothing to import', 'Add some rows first.');
      return;
    }

    // Validate required fields
    const validRows: Array<{ row: ClientImportRow; idx: number }> = [];
    const skipped: Array<{ identifier: string; reason: string }> = [];
    for (const { row, idx } of activeRows) {
      const errs = getRequiredErrors(row);
      if (errs.length) {
        skipped.push({ identifier: row.name || row.accountNumber || `Row ${idx + 1}`, reason: errs.join(', ') });
      } else {
        validRows.push({ row, idx });
      }
    }

    // Pull existing clients for account / round order collision avoidance
    const existingSnapshot = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
    const usedAccountNumbers = new Set<string>();
    const usedRoundOrders = new Set<number>();
    let highestAccountNum = 0;
    let highestRoundOrder = 0;

    existingSnapshot.forEach((docSnap) => {
      const data: any = docSnap.data();
      if (data.accountNumber) {
        const acc = normalizeAccountNumber(String(data.accountNumber));
        usedAccountNumbers.add(acc.toUpperCase());
        const num = parseInt(acc.replace(/^RWC/i, ''), 10);
        if (!isNaN(num) && num > highestAccountNum) highestAccountNum = num;
      }
      if (typeof data.roundOrderNumber === 'number' && data.roundOrderNumber > 0) {
        usedRoundOrders.add(data.roundOrderNumber);
        if (data.roundOrderNumber > highestRoundOrder) highestRoundOrder = data.roundOrderNumber;
      }
    });

    // Reserve numbers already provided in grid
    validRows.forEach(({ row }) => {
      const raw = row.accountNumber.trim();
      if (raw) {
        const acc = normalizeAccountNumber(raw);
        usedAccountNumbers.add(acc.toUpperCase());
        const num = parseInt(acc.replace(/^RWC/i, ''), 10);
        if (!isNaN(num) && num > highestAccountNum) highestAccountNum = num;
      }
      const roRaw = row.roundOrder.trim();
      if (roRaw) {
        const num = parseInt(roRaw, 10);
        if (!isNaN(num) && num > 0) {
          usedRoundOrders.add(num);
          if (num > highestRoundOrder) highestRoundOrder = num;
        }
      }
    });

    // Assign missing account numbers + round orders
    let nextAccountNumber = highestAccountNum + 1;
    let nextRoundOrder = highestRoundOrder + 1;
    let autoAssignedAccCount = 0;
    let autoAssignedRoundCount = 0;

    const normalizedRows = validRows.map(({ row, idx }) => {
      // Account number
      let acc = row.accountNumber.trim();
      if (!acc) {
        while (usedAccountNumbers.has(`RWC${nextAccountNumber}`.toUpperCase())) nextAccountNumber++;
        acc = `RWC${nextAccountNumber}`;
        usedAccountNumbers.add(acc.toUpperCase());
        nextAccountNumber++;
        autoAssignedAccCount++;
      } else {
        acc = normalizeAccountNumber(acc);
      }

      // Round order
      let roundOrderNum: number | null = null;
      const ro = row.roundOrder.trim();
      if (!ro) {
        while (usedRoundOrders.has(nextRoundOrder)) nextRoundOrder++;
        roundOrderNum = nextRoundOrder;
        usedRoundOrders.add(nextRoundOrder);
        nextRoundOrder++;
        autoAssignedRoundCount++;
      } else {
        const num = parseInt(ro, 10);
        roundOrderNum = !isNaN(num) && num > 0 ? num : null;
      }

      return { row, idx, acc, roundOrderNum };
    });

    // Subscription limit check
    const limitCheck = await checkClientLimit();
    if (!limitCheck.canAdd) {
      const msg = limitCheck.limit
        ? `You've reached the limit of ${limitCheck.limit} clients on your current plan. You currently have ${limitCheck.currentCount} clients.`
        : 'Unable to add more clients at this time.';
      alertMsg('Client Limit Reached', msg);
      return;
    }

    const availableSlots = limitCheck.limit ? Math.max(0, limitCheck.limit - limitCheck.currentCount) : normalizedRows.length;
    const canImportCount = Math.min(normalizedRows.length, availableSlots);
    const willSkipDueToLimit = normalizedRows.length - canImportCount;

    let confirmMessage = `This will create ${canImportCount} clients (skipping ${skipped.length} invalid rows)`;
    if (willSkipDueToLimit > 0) confirmMessage += ` and ${willSkipDueToLimit} additional clients due to your subscription limit`;
    confirmMessage += '. Continue?';

    const proceed = await confirmMsg('Confirm Import', confirmMessage);
    if (!proceed) return;

    setSubmitting(true);
    setLoading(true);
    try {
      let imported = 0;
      for (let i = 0; i < canImportCount; i++) {
        const { row, acc, roundOrderNum } = normalizedRows[i];

        // Visit frequency: number or 'one-off'
        let frequency: number | string = 'one-off';
        const freqValue = row.visitFrequency.trim();
        if (freqValue) {
          if (freqValue.toLowerCase() === 'one-off' || freqValue.toLowerCase() === 'one off') frequency = 'one-off';
          else {
            const num = Number(freqValue);
            if (!isNaN(num) && num > 0) frequency = num;
          }
        }

        const quoteNum = parseMoneyToNumber(row.quote) || 0;
        const nextVisit = parseDDMMYYYYToISO(row.startingDate) || row.startingDate.trim();

        const startingBalanceNum = parseMoneyToNumber(row.startingBalance) || 0;
        const accountNotesText = row.accountNotes.trim();
        const runsheetNotes = row.runsheetNote.trim();

        const clientData: any = {
          name: row.name.trim(),
          address1: row.address1.trim(),
          town: row.town.trim(),
          postcode: row.postcode.trim(),
          address: `${row.address1.trim() || ''}, ${row.town.trim() || ''}, ${row.postcode.trim() || ''}`,
          mobileNumber: formatMobileNumber(row.mobileNumber),
          email: row.email.trim(),
          quote: quoteNum,
          frequency,
          nextVisit,
          roundOrderNumber: roundOrderNum || i + 1,
          source: row.source.trim(),
          startingBalance: startingBalanceNum,
          accountNumber: acc,
          runsheetNotes,
        };

        if (accountNotesText) {
          clientData.accountNotes = [{
            id: `${Date.now()}_${i}`,
            date: new Date().toISOString(),
            author: 'Spreadsheet Import',
            authorId: 'system',
            text: accountNotesText,
          }];
        }

        await addDoc(collection(db, 'clients'), {
          ...clientData,
          dateAdded: new Date().toISOString(),
          status: 'active',
          ownerId,
        });
        imported++;
      }

      try {
        await generateRecurringJobs();
      } catch (err) {
        console.error('[IMPORT] generateRecurringJobs failed', err);
      }

      let message = `Import Complete!\n\nSuccessfully imported: ${imported} clients.`;
      if (autoAssignedAccCount) message += `\nAuto-assigned account numbers: ${autoAssignedAccCount}.`;
      if (autoAssignedRoundCount) message += `\nAuto-assigned round order numbers: ${autoAssignedRoundCount}.`;
      if (skipped.length) {
        message += `\n\nSkipped ${skipped.length} rows:\n` + skipped.slice(0, 5).map(s => `• ${s.identifier}: ${s.reason}`).join('\n');
        if (skipped.length > 5) message += `\n• ... and ${skipped.length - 5} more`;
      }
      if (willSkipDueToLimit > 0) message += `\n\nSkipped ${willSkipDueToLimit} rows due to subscription limit.`;

      alertMsg('Import Result', message);
      setRows(Array.from({ length: INITIAL_ROWS }, createEmptyRow));
    } catch (e) {
      console.error('Import clients failed', e);
      alertMsg('Import Error', 'Failed to import clients.');
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }, [rows, submitting, rowHasData, alertMsg, confirmMsg, checkClientLimit]);

  const headerRight = useMemo(() => (
    <View style={styles.headerRight}>
      <ThemedText style={styles.rowCount}>{filledRowCount} row(s)</ThemedText>
      <Pressable style={styles.addRowsButton} onPress={() => addRows(isWeb ? 5 : 1)}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.addRowsButtonText}>{isWeb ? 'Add 5 Rows' : 'Add Row'}</Text>
      </Pressable>
      <Pressable
        style={[styles.submitButton, submitting && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={submitting || loading}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
        <Text style={styles.submitButtonText}>{submitting ? 'Importing...' : 'Import'}</Text>
      </Pressable>
    </View>
  ), [filledRowCount, addRows, isWeb, submitting, handleSubmit, loading]);

  if (!isWeb) {
    return (
      <ThemedView style={[styles.container, { padding: 16 }]}>
        <View style={[styles.header, { justifyContent: 'space-between' }]}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#1976d2" />
            <ThemedText style={styles.backButtonText}>Back</ThemedText>
          </Pressable>
          {headerRight}
        </View>

        <ThemedText style={[styles.title, { fontSize: 22 }]}>Import Clients</ThemedText>
        <ThemedText style={{ color: '#666', marginBottom: 12 }}>
          Best on desktop (paste from spreadsheets). Mobile supports manual entry.
        </ThemedText>

        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map((row, idx) => {
            const hasData = rowHasData(row);
            const errs = hasData ? getRequiredErrors(row) : [];
            return (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <ThemedText style={{ fontWeight: '700' }}>Row {idx + 1}</ThemedText>
                  <ThemedText style={{ color: '#666' }}>{!hasData ? 'Empty' : errs.length ? 'Invalid' : 'OK'}</ThemedText>
                </View>

                <ThemedText style={styles.cardLabel}>Name *</ThemedText>
                <TextInput value={row.name} onChangeText={(v) => updateCell(idx, 'name', v)} style={styles.nativeInput} />

                <ThemedText style={styles.cardLabel}>Address Line 1 *</ThemedText>
                <TextInput value={row.address1} onChangeText={(v) => updateCell(idx, 'address1', v)} style={styles.nativeInput} />

                <ThemedText style={styles.cardLabel}>Town</ThemedText>
                <TextInput value={row.town} onChangeText={(v) => updateCell(idx, 'town', v)} style={styles.nativeInput} />

                <ThemedText style={styles.cardLabel}>Postcode</ThemedText>
                <TextInput value={row.postcode} onChangeText={(v) => updateCell(idx, 'postcode', v)} style={styles.nativeInput} />

                <ThemedText style={styles.cardLabel}>Quote (£) *</ThemedText>
                <TextInput value={row.quote} onChangeText={(v) => updateCell(idx, 'quote', v)} style={styles.nativeInput} keyboardType="decimal-pad" />

                <ThemedText style={styles.cardLabel}>Visit Frequency *</ThemedText>
                <TextInput value={row.visitFrequency} onChangeText={(v) => updateCell(idx, 'visitFrequency', v)} style={styles.nativeInput} placeholder="e.g. 4 or one-off" />

                <ThemedText style={styles.cardLabel}>Starting Date *</ThemedText>
                <TextInput value={row.startingDate} onChangeText={(v) => updateCell(idx, 'startingDate', v)} style={styles.nativeInput} placeholder="DD/MM/YYYY" />

                <ThemedText style={styles.cardLabel}>Account Number (optional)</ThemedText>
                <TextInput value={row.accountNumber} onChangeText={(v) => updateCell(idx, 'accountNumber', v)} style={styles.nativeInput} placeholder="RWC001" />

                <ThemedText style={styles.cardLabel}>Round Order (optional)</ThemedText>
                <TextInput value={row.roundOrder} onChangeText={(v) => updateCell(idx, 'roundOrder', v)} style={styles.nativeInput} placeholder="1" keyboardType="number-pad" />

                <ThemedText style={styles.cardLabel}>Mobile Number</ThemedText>
                <TextInput value={row.mobileNumber} onChangeText={(v) => updateCell(idx, 'mobileNumber', v)} style={styles.nativeInput} />

                <ThemedText style={styles.cardLabel}>Email</ThemedText>
                <TextInput value={row.email} onChangeText={(v) => updateCell(idx, 'email', v)} style={styles.nativeInput} autoCapitalize="none" />

                <ThemedText style={styles.cardLabel}>Source</ThemedText>
                <TextInput value={row.source} onChangeText={(v) => updateCell(idx, 'source', v)} style={styles.nativeInput} />

                <ThemedText style={styles.cardLabel}>Starting Balance</ThemedText>
                <TextInput value={row.startingBalance} onChangeText={(v) => updateCell(idx, 'startingBalance', v)} style={styles.nativeInput} keyboardType="decimal-pad" />

                <ThemedText style={styles.cardLabel}>Runsheet Note</ThemedText>
                <TextInput value={row.runsheetNote} onChangeText={(v) => updateCell(idx, 'runsheetNote', v)} style={styles.nativeInput} />

                <ThemedText style={styles.cardLabel}>Account notes</ThemedText>
                <TextInput value={row.accountNotes} onChangeText={(v) => updateCell(idx, 'accountNotes', v)} style={styles.nativeInput} />

                {errs.length > 0 && (
                  <ThemedText style={{ color: '#c62828', marginTop: 8 }}>
                    {errs.join(' · ')}
                  </ThemedText>
                )}
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#1976d2" />
            <ThemedText style={styles.backButtonText}>Back</ThemedText>
          </Pressable>
          <ThemedText style={styles.title}>Import Clients</ThemedText>
        </View>
        {headerRight}
      </View>

      <View style={styles.instructions}>
        <Ionicons name="information-circle-outline" size={18} color="#1976d2" />
        <ThemedText style={styles.instructionsText}>
          Paste from Excel/Sheets into the grid. Required columns: Name, Address Line 1, Quote (£), Visit Frequency, Starting Date.
        </ThemedText>
      </View>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          backgroundColor: '#fff',
          borderRadius: 8,
          border: '1px solid #e0e0e0',
          overflow: 'auto',
        }}
      >
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1400 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
              <th style={{ ...thStyle, width: 40 }}>#</th>
              <th style={{ ...thStyle, width: 160 }}>Name *</th>
              <th style={{ ...thStyle, width: 200 }}>Address Line 1 *</th>
              <th style={{ ...thStyle, width: 120 }}>Town</th>
              <th style={{ ...thStyle, width: 110 }}>Postcode</th>
              <th style={{ ...thStyle, width: 140 }}>Mobile Number</th>
              <th style={{ ...thStyle, width: 200 }}>Email</th>
              <th style={{ ...thStyle, width: 110 }}>Quote (£) *</th>
              <th style={{ ...thStyle, width: 130 }}>Visit Frequency *</th>
              <th style={{ ...thStyle, width: 140 }}>Starting Date *</th>
              <th style={{ ...thStyle, width: 110 }}>Round Order</th>
              <th style={{ ...thStyle, width: 130 }}>Account Number</th>
              <th style={{ ...thStyle, width: 140 }}>Source</th>
              <th style={{ ...thStyle, width: 140 }}>Starting Balance</th>
              <th style={{ ...thStyle, width: 200 }}>Runsheet Note</th>
              <th style={{ ...thStyle, width: 240 }}>Account notes</th>
              <th style={{ ...thStyle, width: 110 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const hasData = rowHasData(row);
              const errs = hasData ? getRequiredErrors(row) : [];
              const status = !hasData ? '' : errs.length ? 'Invalid' : 'OK';
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  <td style={{ ...tdStyle, backgroundColor: '#f8f9fa', textAlign: 'center', color: '#6c757d', fontWeight: 500 }}>
                    {idx + 1}
                  </td>
                  {([
                    ['name', 'Name'],
                    ['address1', 'Address Line 1'],
                    ['town', 'Town'],
                    ['postcode', 'Postcode'],
                    ['mobileNumber', 'Mobile Number'],
                    ['email', 'Email'],
                    ['quote', 'Quote (£)'],
                    ['visitFrequency', 'Visit Frequency'],
                    ['startingDate', 'Starting Date'],
                    ['roundOrder', 'Round Order'],
                    ['accountNumber', 'Account Number'],
                    ['source', 'Source'],
                    ['startingBalance', 'Starting Balance'],
                    ['runsheetNote', 'Runsheet Note'],
                    ['accountNotes', 'Account notes'],
                  ] as Array<[keyof ClientImportRow, string]>).map(([field]) => (
                    <td key={String(field)} style={tdStyle}>
                      <input
                        type="text"
                        value={row[field]}
                        onChange={(e) => updateCell(idx, field, e.target.value)}
                        onFocus={() => setFocusedCell({ rowIndex: idx, field })}
                        style={inputStyle}
                      />
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'center' }} title={errs.join(', ')}>
                    {hasData && (
                      <span style={{ color: errs.length ? '#f44336' : '#4CAF50', fontSize: 12, fontWeight: 600 }}>
                        {status}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ThemedView>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 700,
  color: '#495057',
  borderRight: '1px solid #dee2e6',
};

const tdStyle: React.CSSProperties = {
  padding: '4px',
  borderRight: '1px solid #e9ecef',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  fontSize: 14,
  border: '1px solid #e0e0e0',
  borderRadius: 4,
  outline: 'none',
  boxSizing: 'border-box',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#eaf2ff',
  },
  backButtonText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '600',
  },
  rowCount: {
    fontSize: 14,
    color: '#666',
  },
  addRowsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#666',
  },
  addRowsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  instructionsText: {
    fontSize: 14,
    color: '#1976d2',
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardLabel: {
    marginBottom: 4,
    marginTop: 10,
    fontSize: 13,
    color: '#444',
  },
  nativeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#333',
  },
});


