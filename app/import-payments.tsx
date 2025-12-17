import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { createPayment } from '../services/paymentService';
import { canonicalizePaymentType, normalizeAccountNumber, parseDDMMYYYYToISO, parsePositiveMoneyToNumber } from '../utils/spreadsheetImport';

type PaymentRow = {
  id: string;
  accountNumber: string;
  date: string;
  amount: string;
  type: string;
  notes: string;
};

type AccountMap = Map<string, { clientId: string; clientName: string }>;

const PAYMENT_TYPES = [
  { value: '', label: 'Select...' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'direct_debit', label: 'Direct Debit' },
  { value: 'other', label: 'Other' },
];

const createEmptyRow = (): PaymentRow => ({
  id: Math.random().toString(36).slice(2),
  accountNumber: '',
  date: '',
  amount: '',
  type: '',
  notes: '',
});

const INITIAL_ROWS = Platform.OS === 'web' ? 15 : 5;

export default function ImportPaymentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<PaymentRow[]>(() => Array.from({ length: INITIAL_ROWS }, createEmptyRow));
  const [accountMap, setAccountMap] = useState<AccountMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; field: keyof PaymentRow } | null>(null);
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

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) return;
        const snapshot = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
        const map: AccountMap = new Map();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const name = data.name || 'Unknown';
          const accRaw = data.accountNumber;
          if (accRaw) {
            const normalized = normalizeAccountNumber(String(accRaw));
            map.set(normalized, { clientId: docSnap.id, clientName: name });
          }
        });
        setAccountMap(map);
      } catch (e) {
        console.error('Failed to load clients for import payments', e);
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

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

      const fieldOrder: (keyof PaymentRow)[] = ['accountNumber', 'date', 'amount', 'type', 'notes'];
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
            let value = cellValue.trim();
            if (field === 'type') {
              const canonical = canonicalizePaymentType(value);
              value = canonical ?? value;
            }
            newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
          });
        });
        return newRows;
      });
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [focusedCell]);

  const updateCell = useCallback((rowIndex: number, field: keyof PaymentRow, value: string) => {
    setRows((prev) => prev.map((row, idx) => (idx === rowIndex ? { ...row, [field]: value } : row)));
  }, []);

  const addRows = useCallback((count: number) => {
    setRows((prev) => [...prev, ...Array.from({ length: count }, createEmptyRow)]);
  }, []);

  const rowHasData = (row: PaymentRow) => !!(row.accountNumber || row.date || row.amount || row.type || row.notes);

  const getRowErrors = (row: PaymentRow): string[] => {
    const errs: string[] = [];
    const acc = normalizeAccountNumber(row.accountNumber);
    if (!acc) errs.push('Account Number required');
    const iso = parseDDMMYYYYToISO(row.date);
    if (!iso) errs.push('Invalid date (DD/MM/YYYY)');
    const amt = parsePositiveMoneyToNumber(row.amount);
    if (amt === null) errs.push('Invalid amount');
    const method = canonicalizePaymentType(row.type);
    if (!method) errs.push('Invalid type');
    return errs;
  };

  const filledRowCount = rows.filter(rowHasData).length;

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

    const invalid: string[] = [];
    const validPayments: Array<{ clientId: string; amount: number; date: string; method: string; notes?: string; account: string; rowNumber: number }> = [];
    const unknownPayments: Array<{ amount: number; date: string; method: string; notes?: string; account: string; rowNumber: number }> = [];

    for (const { row, idx } of activeRows) {
      const rowNumber = idx + 1;
      const errs = getRowErrors(row);
      if (errs.length) {
        invalid.push(`Row ${rowNumber}: ${errs.join(', ')}`);
        continue;
      }

      const account = normalizeAccountNumber(row.accountNumber);
      const isoDate = parseDDMMYYYYToISO(row.date)!;
      const amount = parsePositiveMoneyToNumber(row.amount)!;
      const method = canonicalizePaymentType(row.type)!;
      const notes = row.notes?.trim();

      const accountEntry = accountMap.get(account);
      if (accountEntry) {
        validPayments.push({
          clientId: accountEntry.clientId,
          amount,
          date: isoDate,
          method,
          ...(notes ? { notes } : {}),
          account,
          rowNumber,
        });
      } else {
        unknownPayments.push({
          amount,
          date: isoDate,
          method,
          ...(notes ? { notes } : {}),
          account,
          rowNumber,
        });
      }
    }

    if (invalid.length) {
      alertMsg('Fix errors', invalid.slice(0, 10).join('\n') + (invalid.length > 10 ? '\n...and more' : ''));
      return;
    }

    const proceed = await confirmMsg(
      'Confirm Import',
      `This will create ${validPayments.length} payments and ${unknownPayments.length} unknown payments. Continue?`
    );
    if (!proceed) return;

    setSubmitting(true);
    try {
      await Promise.all(validPayments.map(p => createPayment({
        clientId: p.clientId,
        amount: p.amount,
        date: p.date,
        method: p.method as any,
        ...(p.notes ? { notes: p.notes } : {}),
      })));

      const now = new Date().toISOString();
      await Promise.all(unknownPayments.map(p => addDoc(collection(db, 'unknownPayments'), {
        ownerId,
        amount: p.amount,
        date: p.date,
        method: p.method,
        ...(p.notes ? { notes: p.notes } : {}),
        importDate: now,
        importFilename: 'Spreadsheet Import',
        csvRowNumber: p.rowNumber,
        originalAccountIdentifier: p.account,
        createdAt: now,
        updatedAt: now,
      })));

      alertMsg('Import complete', `Imported ${validPayments.length} payments.\nUnknown payments: ${unknownPayments.length}.`);
      setRows(Array.from({ length: INITIAL_ROWS }, createEmptyRow));
    } catch (e) {
      console.error('Import payments failed', e);
      alertMsg('Import failed', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [rows, accountMap, submitting, alertMsg, confirmMsg]);

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
        disabled={submitting}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
        <Text style={styles.submitButtonText}>{submitting ? 'Importing...' : 'Import'}</Text>
      </Pressable>
    </View>
  ), [filledRowCount, addRows, isWeb, submitting, handleSubmit]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>Import Payments</ThemedText>
        <ThemedText style={{ color: '#666' }}>Loading...</ThemedText>
      </ThemedView>
    );
  }

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

        <ThemedText style={[styles.title, { fontSize: 22 }]}>Import Payments</ThemedText>
        <ThemedText style={{ color: '#666', marginBottom: 12 }}>
          Best on desktop (paste from spreadsheets). Mobile supports manual entry.
        </ThemedText>

        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map((row, idx) => {
            const hasData = rowHasData(row);
            const errs = hasData ? getRowErrors(row) : [];
            const account = normalizeAccountNumber(row.accountNumber);
            const accountKnown = !!account && accountMap.has(account);

            const status = !hasData ? 'Empty' : errs.length ? 'Invalid' : (accountKnown ? 'Valid' : 'Unknown');

            return (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <ThemedText style={{ fontWeight: '700' }}>Row {idx + 1}</ThemedText>
                  <ThemedText style={{ color: '#666' }}>{status}</ThemedText>
                </View>

                <ThemedText style={styles.cardLabel}>Account Number *</ThemedText>
                <TextInput value={row.accountNumber} onChangeText={(v) => updateCell(idx, 'accountNumber', v)} style={styles.nativeInput} placeholder="RWC001" />

                <ThemedText style={styles.cardLabel}>Date (DD/MM/YYYY) *</ThemedText>
                <TextInput value={row.date} onChangeText={(v) => updateCell(idx, 'date', v)} style={styles.nativeInput} placeholder="17/12/2025" />

                <ThemedText style={styles.cardLabel}>Amount (£) *</ThemedText>
                <TextInput value={row.amount} onChangeText={(v) => updateCell(idx, 'amount', v)} style={styles.nativeInput} placeholder="0.00" keyboardType="decimal-pad" />

                <ThemedText style={styles.cardLabel}>Type *</ThemedText>
                <View style={styles.nativePickerContainer}>
                  <Picker selectedValue={row.type} onValueChange={(v) => updateCell(idx, 'type', String(v))}>
                    {PAYMENT_TYPES.map(pt => <Picker.Item key={pt.value} label={pt.label} value={pt.value} />)}
                  </Picker>
                </View>

                <ThemedText style={styles.cardLabel}>Notes</ThemedText>
                <TextInput value={row.notes} onChangeText={(v) => updateCell(idx, 'notes', v)} style={styles.nativeInput} placeholder="Optional notes" />

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
          <ThemedText style={styles.title}>Import Payments</ThemedText>
        </View>
        {headerRight}
      </View>

      <View style={styles.instructions}>
        <Ionicons name="information-circle-outline" size={18} color="#1976d2" />
        <ThemedText style={styles.instructionsText}>
          Paste from Excel/Sheets into the grid. Columns: Account Number, Date, Amount (£), Type, Notes.
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
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
              <th style={{ ...thStyle, width: 40 }}>#</th>
              <th style={{ ...thStyle, width: 160 }}>Account Number</th>
              <th style={{ ...thStyle, width: 130 }}>Date (DD/MM/YYYY)</th>
              <th style={{ ...thStyle, width: 110 }}>Amount (£)</th>
              <th style={{ ...thStyle, width: 160 }}>Type</th>
              <th style={{ ...thStyle, width: 260 }}>Notes</th>
              <th style={{ ...thStyle, width: 110 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const hasData = rowHasData(row);
              const errs = hasData ? getRowErrors(row) : [];
              const account = normalizeAccountNumber(row.accountNumber);
              const accountKnown = !!account && accountMap.has(account);
              const status = !hasData ? '' : errs.length ? 'Invalid' : (accountKnown ? 'Valid' : 'Unknown');

              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  <td style={{ ...tdStyle, backgroundColor: '#f8f9fa', textAlign: 'center', color: '#6c757d', fontWeight: 500 }}>
                    {idx + 1}
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.accountNumber}
                      onChange={(e) => updateCell(idx, 'accountNumber', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex: idx, field: 'accountNumber' })}
                      placeholder="RWC001"
                      style={inputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.date}
                      onChange={(e) => updateCell(idx, 'date', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex: idx, field: 'date' })}
                      placeholder="DD/MM/YYYY"
                      style={inputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.amount}
                      onChange={(e) => updateCell(idx, 'amount', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex: idx, field: 'amount' })}
                      placeholder="0.00"
                      style={inputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={row.type}
                      onChange={(e) => updateCell(idx, 'type', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex: idx, field: 'type' })}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      {PAYMENT_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateCell(idx, 'notes', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex: idx, field: 'notes' })}
                      placeholder="Optional notes"
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }} title={errs.join(', ')}>
                    {hasData && (
                      <span style={{
                        color: errs.length ? '#f44336' : (status === 'Valid' ? '#4CAF50' : '#ff9800'),
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
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
  nativePickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
});


