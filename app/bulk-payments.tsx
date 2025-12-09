import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { createPayment } from '../services/paymentService';
import { createUnknownPayment } from '../services/unknownPaymentService';

type PaymentRow = {
  id: string;
  accountNumber: string;
  date: string;
  amount: string;
  type: string;
  notes: string;
};

type AccountMap = Map<string, { clientId: string; clientName: string }>;
type ClientSummary = {
  id: string;
  name?: string;
  address?: string;
  address1?: string;
  town?: string;
  postcode?: string;
  accountNumber?: string;
};

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
  id: Math.random().toString(36).substr(2, 9),
  accountNumber: '',
  date: '',
  amount: '',
  type: '',
  notes: '',
});

const INITIAL_ROWS = 15;

// Check if type value is valid
const isValidType = (value: string): boolean => {
  if (!value) return false;
  const validValues = ['cash', 'card', 'bank_transfer', 'cheque', 'direct_debit', 'other'];
  return validValues.includes(value.toLowerCase().trim());
};

// Parse DD/MM/YYYY to YYYY-MM-DD (Payment expects ISO string)
const parseDateToISO = (dateStr: string): string | null => {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
};

// Sanitize amount string to number
const parseAmount = (value: string): number | null => {
  const sanitized = value.replace(/[^0-9.-]+/g, '');
  const num = parseFloat(sanitized);
  if (isNaN(num) || !isFinite(num) || num <= 0) return null;
  return num;
};

// Convert a pasted/typed value into canonical type if possible; otherwise null
const canonicalizeType = (value: string): string | null => {
  const lower = value.toLowerCase().trim();
  if (lower === 'cash') return 'cash';
  if (lower === 'card') return 'card';
  if (lower === 'bacs' || lower === 'bank' || lower === 'bank transfer') return 'bank_transfer';
  if (lower === 'cheque' || lower === 'check') return 'cheque';
  if (lower === 'dd' || lower === 'direct debit' || lower === 'direct_debit') return 'direct_debit';
  if (lower === 'other') return 'other';
  return null;
};

export default function BulkPaymentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<PaymentRow[]>(() => 
    Array.from({ length: INITIAL_ROWS }, createEmptyRow)
  );
  const [accountMap, setAccountMap] = useState<AccountMap>(new Map());
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; field: keyof PaymentRow } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lookupModal, setLookupModal] = useState<{ visible: boolean; rowIndex: number | null; search: string }>({
    visible: false,
    rowIndex: null,
    search: '',
  });

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.replace('/accounts');
    }
  }, [router]);

  // Fetch all clients to build account number mapping
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) return;

        const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
        const snapshot = await getDocs(clientsQuery);
        
        const map: AccountMap = new Map();
        const list: ClientSummary[] = [];

        snapshot.docs.forEach(doc => {
          const data = doc.data() as any;
          const accRaw = data.accountNumber;
          const name = data.name || 'Unknown';
          const address = data.address || data.address1 || '';
          const town = data.town || '';
          const postcode = data.postcode || '';
          const summary: ClientSummary = {
            id: doc.id,
            name,
            address,
            address1: data.address1,
            town,
            postcode,
            accountNumber: accRaw,
          };
          list.push(summary);

          if (accRaw) {
            let acc = String(accRaw).trim().toUpperCase();
            if (!acc.startsWith('RWC')) {
              acc = 'RWC' + acc;
            }
            map.set(acc, { clientId: doc.id, clientName: name });
          }
        });
        setAccountMap(map);
        setClients(list);
      } catch (error) {
        console.error('Error fetching clients:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

  // Handle paste at document level for web
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handlePaste = (e: ClipboardEvent) => {
      // Only handle paste if we're focused on a cell
      if (!focusedCell) return;
      
      // Check if the active element is one of our inputs
      const activeEl = document.activeElement;
      if (!activeEl || !containerRef.current?.contains(activeEl)) return;

      const pastedText = e.clipboardData?.getData('text');
      if (!pastedText) return;

      // Check if this looks like multi-cell paste (contains tabs or newlines)
      if (!pastedText.includes('\t') && !pastedText.includes('\n')) {
        // Single cell paste - let it happen naturally
        return;
      }

      // Multi-cell paste - prevent default and handle ourselves
      e.preventDefault();
      
      const lines = pastedText.split('\n').filter(line => line.trim() || line.includes('\t'));
      if (lines.length === 0) return;

      const fieldOrder: (keyof PaymentRow)[] = ['accountNumber', 'date', 'amount', 'type', 'notes'];
      const startFieldIndex = fieldOrder.indexOf(focusedCell.field);
      const startRowIndex = focusedCell.rowIndex;

      setRows(prev => {
        const newRows = [...prev];
        
        // Add more rows if needed
        while (newRows.length < startRowIndex + lines.length) {
          newRows.push(createEmptyRow());
        }

        lines.forEach((line, lineIndex) => {
          const rowIndex = startRowIndex + lineIndex;
          const cells = line.split('\t');
          
          cells.forEach((cellValue, cellIndex) => {
            const fieldIndex = startFieldIndex + cellIndex;
            if (fieldIndex < fieldOrder.length) {
              const field = fieldOrder[fieldIndex];
              let value = cellValue.trim();

              if (field === 'type') {
                const canonical = canonicalizeType(value);
                value = canonical ?? value; // keep raw if invalid, canonicalize if valid
              }

              newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
            }
          });
        });

        return newRows;
      });
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [focusedCell]);

  // Normalize account number for lookup
  const normalizeAccountNumber = (acc: string): string => {
    let normalized = acc.trim().toUpperCase();
    if (normalized && !normalized.startsWith('RWC')) {
      normalized = 'RWC' + normalized;
    }
    return normalized;
  };

  // Check if account is valid
  const getAccountStatus = (accountNumber: string): 'valid' | 'unknown' | 'empty' => {
    if (!accountNumber.trim()) return 'empty';
    const normalized = normalizeAccountNumber(accountNumber);
    return accountMap.has(normalized) ? 'valid' : 'unknown';
  };

// Extract a suggested account number (e.g., "RWC123") from noisy text
const extractAccountSuggestion = (text: string): string | null => {
  if (!text) return null;
  const match = text.toUpperCase().match(/RWC\s*(\d+)/);
  if (!match) return null;
  return `RWC${match[1]}`;
};

// Build display address snippet
const formatClientAddress = (c: ClientSummary): string => {
  const parts = [c.address1 || c.address, c.town, c.postcode].filter(Boolean);
  return parts.join(', ');
};

  // Validate date format (DD/MM/YYYY)
  const isValidDate = (dateStr: string): boolean => {
    if (!dateStr.trim()) return false;
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.match(regex);
    if (!match) return false;
    
    const [, day, month, year] = match;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    if (y < 1900 || y > 2100) return false;
    
    return true;
  };

  // Validate amount
  const isValidAmount = (amountStr: string): boolean => {
    if (!amountStr.trim()) return false;
    const sanitized = amountStr.replace(/[£,\s]/g, '');
    const num = parseFloat(sanitized);
    return !isNaN(num) && num > 0;
  };

  // Update a cell value
  const updateCell = useCallback((rowIndex: number, field: keyof PaymentRow, value: string) => {
    setRows(prev => prev.map((row, idx) => 
      idx === rowIndex ? { ...row, [field]: value } : row
    ));
  }, []);

  // Add more rows
  const addRows = useCallback((count: number = 5) => {
    setRows(prev => [...prev, ...Array.from({ length: count }, createEmptyRow)]);
  }, []);

  // Check if a row has any data
  const rowHasData = (row: PaymentRow): boolean => {
    return !!(row.accountNumber || row.date || row.amount || row.type || row.notes);
  };

  // Get row validation status
  const getRowValidation = (row: PaymentRow): { isValid: boolean; errors: string[] } => {
    if (!rowHasData(row)) return { isValid: true, errors: [] };
    
    const errors: string[] = [];
    
    if (!row.date) errors.push('Date required');
    else if (!isValidDate(row.date)) errors.push('Invalid date (use DD/MM/YYYY)');
    
    if (!row.amount) errors.push('Amount required');
    else if (!isValidAmount(row.amount)) errors.push('Invalid amount');
    
    if (!row.type) errors.push('Type required');
    else if (!isValidType(row.type)) errors.push('Invalid type - select from dropdown');
    
    return { isValid: errors.length === 0, errors };
  };

  // Count rows with data
  const filledRowCount = rows.filter(rowHasData).length;

  // Clear all data
  const clearAll = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all data?')) {
      setRows(Array.from({ length: INITIAL_ROWS }, createEmptyRow));
    }
  }, []);

  // Submission handler
  const handleSubmit = useCallback(async () => {
    if (submitting) return;

    const rowsWithData = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => rowHasData(row));

    if (rowsWithData.length === 0) {
      window.alert('Nothing to submit. Add some rows first.');
      return;
    }

    const invalidRows: string[] = [];
    const duplicateKeys: string[] = [];
    const seenKeys = new Set<string>();

    const validPayments: Array<{
      clientId: string;
      amount: number;
      date: string;
      method: string;
      notes?: string;
    }> = [];

    const unknownPayments: Array<{
      originalAccountIdentifier: string;
      amount: number;
      date: string;
      method: string;
      notes?: string;
    }> = [];

    rowsWithData.forEach(({ row, index }) => {
      const rowNumber = index + 1;
      const errors: string[] = [];

      // Date
      const isoDate = parseDateToISO(row.date);
      if (!isoDate) errors.push('invalid date');

      // Amount
      const amountNum = parseAmount(row.amount);
      if (amountNum === null) errors.push('invalid amount');

      // Type
      const canonicalType = canonicalizeType(row.type);
      if (!canonicalType || !isValidType(canonicalType)) errors.push('invalid type');

      // Account
      const normalizedAccount = row.accountNumber ? normalizeAccountNumber(row.accountNumber) : '';
      const hasAccount = !!normalizedAccount;
      const accountEntry = hasAccount ? accountMap.get(normalizedAccount) : null;
      const isKnownAccount = !!accountEntry;

      if (errors.length) {
        invalidRows.push(`Row ${rowNumber}: ${errors.join(', ')}`);
        return;
      }

      // Duplicate detection (per submission only)
      const dupKey = `${normalizedAccount || 'UNKNOWN'}|${isoDate}|${amountNum.toFixed(2)}`;
      if (seenKeys.has(dupKey)) {
        duplicateKeys.push(`Row ${rowNumber} (${normalizedAccount || 'Unknown'} / ${row.date} / ${row.amount})`);
      } else {
        seenKeys.add(dupKey);
      }

      if (isKnownAccount && accountEntry) {
        validPayments.push({
          clientId: accountEntry.clientId,
          amount: amountNum,
          date: isoDate!,
          method: canonicalType!,
          ...(row.notes ? { notes: row.notes } : {}),
        });
      } else {
        unknownPayments.push({
          originalAccountIdentifier: row.accountNumber || 'Unknown',
          amount: amountNum,
          date: isoDate!,
          method: canonicalType!,
          ...(row.notes ? { notes: row.notes } : {}),
        });
      }
    });

    if (invalidRows.length > 0) {
      const preview = invalidRows.slice(0, 10).join('\n');
      window.alert(`Fix the errors before submitting:\n${preview}${invalidRows.length > 10 ? '\n...and more' : ''}`);
      return;
    }

    if (duplicateKeys.length > 0) {
      const preview = duplicateKeys.slice(0, 10).join('\n');
      const proceed = window.confirm(
        `Possible duplicates detected (account + date + amount):\n${preview}${duplicateKeys.length > 10 ? '\n...and more' : ''}\n\nProceed anyway?`
      );
      if (!proceed) return;
    }

    setSubmitting(true);
    try {
      // Create payments
      await Promise.all(validPayments.map(p => createPayment(p)));
      // Create unknown payments
      await Promise.all(unknownPayments.map(p => createUnknownPayment({
        amount: p.amount,
        date: p.date,
        method: p.method as any,
        notes: p.notes,
        originalAccountIdentifier: p.originalAccountIdentifier,
      })));

      window.alert(
        `Submission complete!\n\nCreated payments: ${validPayments.length}\nUnknown payments: ${unknownPayments.length}`
      );
      setRows(Array.from({ length: INITIAL_ROWS }, createEmptyRow));
    } catch (err) {
      console.error('Submission error', err);
      window.alert('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [rows, accountMap, submitting, rowHasData]);

  // Filtered clients for lookup modal
  const filteredClients = useMemo(() => {
    const q = lookupModal.search.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(c => {
      const account = c.accountNumber ? normalizeAccountNumber(String(c.accountNumber)).toLowerCase() : '';
      return (
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.address1 && c.address1.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.town && c.town.toLowerCase().includes(q)) ||
        (c.postcode && c.postcode.toLowerCase().includes(q)) ||
        (account && account.includes(q))
      );
    });
  }, [clients, lookupModal.search]);

  if (Platform.OS !== 'web') {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>Bulk Payments</ThemedText>
        <ThemedText style={styles.mobileMessage}>
          This feature is only available on desktop. Please visit the web app on a computer to add bulk payments.
        </ThemedText>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  // Web-only render with native HTML elements
  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#1976d2" />
            <ThemedText style={styles.backButtonText}>Back</ThemedText>
          </Pressable>
          <ThemedText style={styles.title}>Add Bulk Payments</ThemedText>
        </View>
        <View style={styles.headerRight}>
          <ThemedText style={styles.rowCount}>{filledRowCount} row(s) with data</ThemedText>
          <Pressable style={styles.clearButton} onPress={clearAll}>
            <Ionicons name="trash-outline" size={18} color="#666" />
            <Text style={styles.clearButtonText}>Clear All</Text>
          </Pressable>
          <Pressable style={styles.addRowsButton} onPress={() => addRows(5)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addRowsButtonText}>Add 5 Rows</Text>
          </Pressable>
          <Pressable
            style={[styles.submitButton, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={styles.submitButtonText}>{submitting ? 'Submitting...' : 'Submit Payments'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Ionicons name="information-circle-outline" size={18} color="#1976d2" />
        <ThemedText style={styles.instructionsText}>
          Click a cell and paste data from Excel/Google Sheets. Data will fill across columns and down rows automatically.
          Date format: DD/MM/YYYY. Leave Account Number empty for unknown payments.
        </ThemedText>
      </View>

      {/* Spreadsheet - using native HTML for proper paste handling */}
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
        <table style={{ 
          borderCollapse: 'collapse', 
          width: '100%',
          minWidth: 840,
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
              <th style={{ ...thStyle, width: 40 }}>#</th>
              <th style={{ ...thStyle, width: 140 }}>Account Number</th>
              <th style={{ ...thStyle, width: 120 }}>Date (DD/MM/YYYY)</th>
              <th style={{ ...thStyle, width: 100 }}>Amount (£)</th>
              <th style={{ ...thStyle, width: 140 }}>Type</th>
              <th style={{ ...thStyle, width: 250 }}>Notes</th>
              <th style={{ ...thStyle, width: 90 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const accountStatus = getAccountStatus(row.accountNumber);
              const validation = getRowValidation(row);
              const hasData = rowHasData(row);

              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  {/* Row number */}
                  <td style={{ ...tdStyle, backgroundColor: '#f8f9fa', textAlign: 'center', color: '#6c757d', fontWeight: 500 }}>
                    {rowIndex + 1}
                  </td>
                  
                  {/* Account Number */}
                  <td style={tdStyle}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={row.accountNumber}
                        onChange={(e) => updateCell(rowIndex, 'accountNumber', e.target.value)}
                        onFocus={() => setFocusedCell({ rowIndex, field: 'accountNumber' })}
                        placeholder="RWC001"
                        style={{
                          ...inputStyle,
                          paddingRight: 90,
                          borderColor: hasData 
                            ? (accountStatus === 'valid' ? '#4CAF50' : accountStatus === 'unknown' ? '#ff9800' : '#e0e0e0')
                            : '#e0e0e0',
                        }}
                      />
                      {(() => {
                        const suggestion = extractAccountSuggestion(row.accountNumber);
                        const normalizedSuggestion = suggestion ? normalizeAccountNumber(suggestion) : null;
                        const normalizedCurrent = normalizeAccountNumber(row.accountNumber || '');
                        const canSuggest = accountStatus === 'unknown' && normalizedSuggestion && normalizedSuggestion !== normalizedCurrent;

                        // If we have a regex suggestion, show it
                        if (canSuggest) {
                          return (
                            <button
                              type="button"
                              onClick={() => updateCell(rowIndex, 'accountNumber', normalizedSuggestion!)}
                              style={{
                                position: 'absolute',
                                right: 6,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                backgroundColor: '#fff3e0',
                                border: '1px solid #ff9800',
                                color: '#e65100',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                              title={`Use suggested account ${normalizedSuggestion}`}
                            >
                              Use {normalizedSuggestion}
                            </button>
                          );
                        }

                        // Otherwise, offer lookup modal
                        if (accountStatus === 'unknown') {
                          return (
                            <button
                              type="button"
                              onClick={() => setLookupModal({ visible: true, rowIndex, search: '' })}
                              style={{
                                position: 'absolute',
                                right: 6,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                backgroundColor: '#e8f0fe',
                                border: '1px solid #4285f4',
                                color: '#1a73e8',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                              title="Find account by name or address"
                            >
                              Find account
                            </button>
                          );
                        }

                        return null;
                      })()}
                    </div>
                  </td>
                  
                  {/* Date */}
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.date}
                      onChange={(e) => updateCell(rowIndex, 'date', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex, field: 'date' })}
                      placeholder="DD/MM/YYYY"
                      style={{
                        ...inputStyle,
                        borderColor: hasData && row.date 
                          ? (isValidDate(row.date) ? '#4CAF50' : '#f44336')
                          : '#e0e0e0',
                      }}
                    />
                  </td>
                  
                  {/* Amount */}
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.amount}
                      onChange={(e) => updateCell(rowIndex, 'amount', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex, field: 'amount' })}
                      placeholder="0.00"
                      style={{
                        ...inputStyle,
                        borderColor: hasData && row.amount 
                          ? (isValidAmount(row.amount) ? '#4CAF50' : '#f44336')
                          : '#e0e0e0',
                      }}
                    />
                  </td>
                  
                  {/* Type - show raw value with dropdown to fix invalid entries */}
                  <td style={tdStyle}>
                    {row.type && !isValidType(row.type) ? (
                      // Invalid type - show the raw value with dropdown to fix
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={row.type}
                          readOnly
                          onFocus={() => setFocusedCell({ rowIndex, field: 'type' })}
                          style={{
                            ...inputStyle,
                            borderColor: '#f44336',
                            backgroundColor: '#fff5f5',
                            paddingRight: 30,
                          }}
                          title="Invalid type - click dropdown to select valid option"
                        />
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              updateCell(rowIndex, 'type', e.target.value);
                            }
                          }}
                          style={{
                            position: 'absolute',
                            right: 4,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 24,
                            height: 24,
                            opacity: 0.01,
                            cursor: 'pointer',
                          }}
                          title="Select valid type"
                        >
                          <option value="" disabled>Select type...</option>
                          {PAYMENT_TYPES.filter(pt => pt.value).map(pt => (
                            <option key={pt.value} value={pt.value}>{pt.label}</option>
                          ))}
                        </select>
                        <span style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          pointerEvents: 'none',
                          color: '#f44336',
                        }}>▼</span>
                      </div>
                    ) : (
                      // Valid or empty - show normal dropdown
                      <select
                        value={row.type}
                        onChange={(e) => updateCell(rowIndex, 'type', e.target.value)}
                        onFocus={() => setFocusedCell({ rowIndex, field: 'type' })}
                        style={{
                          ...inputStyle,
                          cursor: 'pointer',
                          borderColor: hasData && row.type && isValidType(row.type) ? '#4CAF50' : '#e0e0e0',
                        }}
                      >
                        {PAYMENT_TYPES.map(pt => (
                          <option key={pt.value} value={pt.value}>{pt.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  
                  {/* Notes */}
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateCell(rowIndex, 'notes', e.target.value)}
                      onFocus={() => setFocusedCell({ rowIndex, field: 'notes' })}
                      placeholder="Optional notes"
                      style={inputStyle}
                    />
                  </td>
                  
                  {/* Status */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {hasData && (
                      <>
                        {!validation.isValid ? (
                          <span style={{ color: '#f44336', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <Ionicons name="warning" size={14} color="#f44336" />
                            Invalid
                          </span>
                        ) : accountStatus === 'unknown' || accountStatus === 'empty' ? (
                          <span style={{ color: '#ff9800', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <Ionicons name="help-circle" size={14} color="#ff9800" />
                            Unknown
                          </span>
                        ) : (
                          <span style={{ color: '#4CAF50', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                            Valid
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Lookup Modal */}
      {lookupModal.visible && (
        <div style={styles.modalOverlay as any}>
          <div style={styles.modalCard as any}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Find Account</ThemedText>
              <Pressable onPress={() => setLookupModal({ visible: false, rowIndex: null, search: '' })}>
                <Ionicons name="close" size={22} color="#666" />
              </Pressable>
            </View>

            <input
              type="text"
              placeholder="Search by name, address, town, or postcode..."
              value={lookupModal.search}
              onChange={(e) => setLookupModal(prev => ({ ...prev, search: e.target.value }))}
              style={styles.modalSearch as any}
              autoFocus
            />

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {filteredClients.length === 0 && (
                <ThemedText style={{ color: '#999', marginVertical: 8 }}>No matches</ThemedText>
              )}
              {filteredClients.map(client => {
                const acc = client.accountNumber ? normalizeAccountNumber(String(client.accountNumber)) : '(no account)';
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => {
                      if (lookupModal.rowIndex !== null && client.accountNumber) {
                        const normalized = normalizeAccountNumber(String(client.accountNumber));
                        setRows(prev => prev.map((row, idx) => idx === lookupModal.rowIndex ? { ...row, accountNumber: normalized } : row));
                      }
                      setLookupModal({ visible: false, rowIndex: null, search: '' });
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      backgroundColor: 'transparent',
                      border: 'none',
                      padding: '6px 0',
                      cursor: 'pointer',
                    }}
                  >
                    <View style={styles.clientRow}>
                      <Text style={styles.clientName}>{client.name || 'No name'}</Text>
                      <Text style={styles.clientAddress}>{formatClientAddress(client) || 'No address'}</Text>
                      <Text style={styles.clientMeta}>Account: {acc}</Text>
                    </View>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Valid - Account found</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ff9800' }]} />
          <Text style={styles.legendText}>Unknown - Will be added to Unknown Payments</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f44336' }]} />
          <Text style={styles.legendText}>Invalid - Fix errors before submitting</Text>
        </View>
      </View>
    </ThemedView>
  );
}

// Inline styles for HTML elements (web only)
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
  border: '2px solid #e0e0e0',
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
    marginRight: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  clearButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
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
  legend: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#666',
  },
  mobileMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginVertical: 24,
  },
  // Lookup modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: 24,
    zIndex: 9999,
  },
  modalCard: {
    width: '32rem',
    maxWidth: '90vw',
    maxHeight: '85vh',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSearch: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  clientRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
  },
  clientAddress: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  clientMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
