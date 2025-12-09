import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

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

export default function BulkPaymentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<PaymentRow[]>(() => 
    Array.from({ length: INITIAL_ROWS }, createEmptyRow)
  );
  const [accountMap, setAccountMap] = useState<AccountMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; field: keyof PaymentRow } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch all clients to build account number mapping
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) return;

        const clientsQuery = query(collection(db, 'clients'), where('ownerId', '==', ownerId));
        const snapshot = await getDocs(clientsQuery);
        
        const map: AccountMap = new Map();
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.accountNumber) {
            let acc = String(data.accountNumber).trim().toUpperCase();
            if (!acc.startsWith('RWC')) {
              acc = 'RWC' + acc;
            }
            map.set(acc, { clientId: doc.id, clientName: data.name || 'Unknown' });
          }
        });
        setAccountMap(map);
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
              const value = cellValue.trim();
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

  if (Platform.OS !== 'web') {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>Bulk Payments</ThemedText>
        <ThemedText style={styles.mobileMessage}>
          This feature is only available on desktop. Please visit the web app on a computer to add bulk payments.
        </ThemedText>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
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
          <Pressable style={styles.backButton} onPress={() => router.back()}>
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
          <Pressable style={styles.submitButton} onPress={() => {
            alert('Submission not yet implemented');
          }}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={styles.submitButtonText}>Submit Payments</Text>
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
                        if (!canSuggest) return null;
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
});
