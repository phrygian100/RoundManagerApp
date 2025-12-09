import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

type PaymentRow = {
  id: string;
  accountNumber: string;
  date: string;
  amount: string;
  type: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'direct_debit' | 'other' | '';
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

const INITIAL_ROWS = 10;

export default function BulkPaymentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<PaymentRow[]>(() => 
    Array.from({ length: INITIAL_ROWS }, createEmptyRow)
  );
  const [accountMap, setAccountMap] = useState<AccountMap>(new Map());
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

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
  const updateCell = useCallback((rowId: string, field: keyof PaymentRow, value: string) => {
    setRows(prev => prev.map(row => 
      row.id === rowId ? { ...row, [field]: value } : row
    ));
  }, []);

  // Add more rows
  const addRows = useCallback((count: number = 5) => {
    setRows(prev => [...prev, ...Array.from({ length: count }, createEmptyRow)]);
  }, []);

  // Handle paste event for web
  const handlePaste = useCallback((e: React.ClipboardEvent, startRowIndex: number, startField: keyof PaymentRow) => {
    if (Platform.OS !== 'web') return;
    
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const lines = pastedText.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return;

    const fieldOrder: (keyof PaymentRow)[] = ['accountNumber', 'date', 'amount', 'type', 'notes'];
    const startFieldIndex = fieldOrder.indexOf(startField);

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
            
            // Handle type field - try to map common values
            if (field === 'type') {
              const lowerValue = value.toLowerCase();
              if (lowerValue === 'cash') value = 'cash';
              else if (lowerValue === 'card') value = 'card';
              else if (lowerValue === 'bacs' || lowerValue === 'bank' || lowerValue === 'bank transfer') value = 'bank_transfer';
              else if (lowerValue === 'cheque' || lowerValue === 'check') value = 'cheque';
              else if (lowerValue === 'dd' || lowerValue === 'direct debit') value = 'direct_debit';
              else if (lowerValue === 'other') value = 'other';
              else value = 'other'; // Default to other for unrecognized types
            }
            
            newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
          }
        });
      });

      return newRows;
    });
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
    
    return { isValid: errors.length === 0, errors };
  };

  // Count rows with data
  const filledRowCount = rows.filter(rowHasData).length;

  // Render a cell with appropriate styling
  const renderCell = (
    row: PaymentRow, 
    field: keyof PaymentRow, 
    rowIndex: number,
    placeholder: string,
    width: number,
    validation?: 'valid' | 'invalid' | 'warning' | 'none'
  ) => {
    if (field === 'type') {
      return (
        <View style={[styles.cell, { width }]}>
          <select
            value={row.type}
            onChange={(e) => updateCell(row.id, 'type', e.target.value as PaymentRow['type'])}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: 'transparent',
              fontSize: 14,
              padding: '8px',
              cursor: 'pointer',
            }}
          >
            {PAYMENT_TYPES.map(pt => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </View>
      );
    }

    const getBorderColor = () => {
      if (validation === 'invalid') return '#f44336';
      if (validation === 'warning') return '#ff9800';
      if (validation === 'valid') return '#4CAF50';
      return '#e0e0e0';
    };

    return (
      <View style={[styles.cell, { width, borderColor: getBorderColor() }]}>
        <TextInput
          style={styles.cellInput}
          value={row[field] as string}
          onChangeText={(value) => updateCell(row.id, field, value)}
          placeholder={placeholder}
          placeholderTextColor="#999"
          onPaste={(e: any) => handlePaste(e, rowIndex, field)}
        />
      </View>
    );
  };

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
          <Pressable style={styles.addRowsButton} onPress={() => addRows(5)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addRowsButtonText}>Add 5 Rows</Text>
          </Pressable>
          <Pressable style={styles.submitButton} onPress={() => {
            // TODO: Implement submission
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
          Enter payment data manually or paste from Excel/Google Sheets. Use Tab to move between cells. 
          Date format: DD/MM/YYYY. Leave Account Number empty for unknown payments.
        </ThemedText>
      </View>

      {/* Spreadsheet */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.spreadsheetContainer}
        horizontal
        showsHorizontalScrollIndicator={true}
      >
        <View>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, { width: 40 }]}>
              <Text style={styles.headerCellText}>#</Text>
            </View>
            <View style={[styles.headerCell, { width: 140 }]}>
              <Text style={styles.headerCellText}>Account Number</Text>
            </View>
            <View style={[styles.headerCell, { width: 120 }]}>
              <Text style={styles.headerCellText}>Date (DD/MM/YYYY)</Text>
            </View>
            <View style={[styles.headerCell, { width: 100 }]}>
              <Text style={styles.headerCellText}>Amount (£)</Text>
            </View>
            <View style={[styles.headerCell, { width: 140 }]}>
              <Text style={styles.headerCellText}>Type</Text>
            </View>
            <View style={[styles.headerCell, { width: 200 }]}>
              <Text style={styles.headerCellText}>Notes</Text>
            </View>
            <View style={[styles.headerCell, { width: 100 }]}>
              <Text style={styles.headerCellText}>Status</Text>
            </View>
          </View>

          {/* Data Rows */}
          <ScrollView style={styles.dataContainer} showsVerticalScrollIndicator={true}>
            {rows.map((row, index) => {
              const accountStatus = getAccountStatus(row.accountNumber);
              const validation = getRowValidation(row);
              const hasData = rowHasData(row);

              return (
                <View key={row.id} style={styles.dataRow}>
                  {/* Row number */}
                  <View style={[styles.rowNumberCell, { width: 40 }]}>
                    <Text style={styles.rowNumberText}>{index + 1}</Text>
                  </View>
                  
                  {/* Account Number */}
                  {renderCell(
                    row, 
                    'accountNumber', 
                    index, 
                    'RWC001', 
                    140,
                    hasData ? (accountStatus === 'valid' ? 'valid' : accountStatus === 'unknown' ? 'warning' : 'none') : 'none'
                  )}
                  
                  {/* Date */}
                  {renderCell(
                    row, 
                    'date', 
                    index, 
                    'DD/MM/YYYY', 
                    120,
                    hasData && row.date ? (isValidDate(row.date) ? 'valid' : 'invalid') : 'none'
                  )}
                  
                  {/* Amount */}
                  {renderCell(
                    row, 
                    'amount', 
                    index, 
                    '0.00', 
                    100,
                    hasData && row.amount ? (isValidAmount(row.amount) ? 'valid' : 'invalid') : 'none'
                  )}
                  
                  {/* Type */}
                  {renderCell(row, 'type', index, '', 140, 'none')}
                  
                  {/* Notes */}
                  {renderCell(row, 'notes', index, 'Optional notes', 200, 'none')}
                  
                  {/* Status */}
                  <View style={[styles.statusCell, { width: 100 }]}>
                    {hasData && (
                      <>
                        {!validation.isValid ? (
                          <View style={styles.statusBadge}>
                            <Ionicons name="warning" size={14} color="#f44336" />
                            <Text style={[styles.statusText, { color: '#f44336' }]}>Invalid</Text>
                          </View>
                        ) : accountStatus === 'unknown' ? (
                          <View style={styles.statusBadge}>
                            <Ionicons name="help-circle" size={14} color="#ff9800" />
                            <Text style={[styles.statusText, { color: '#ff9800' }]}>Unknown</Text>
                          </View>
                        ) : accountStatus === 'empty' ? (
                          <View style={styles.statusBadge}>
                            <Ionicons name="help-circle" size={14} color="#ff9800" />
                            <Text style={[styles.statusText, { color: '#ff9800' }]}>Unknown</Text>
                          </View>
                        ) : (
                          <View style={styles.statusBadge}>
                            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                            <Text style={[styles.statusText, { color: '#4CAF50' }]}>Valid</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>

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
  spreadsheetContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 2,
    borderBottomColor: '#dee2e6',
  },
  headerCell: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#dee2e6',
    justifyContent: 'center',
  },
  headerCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#495057',
  },
  dataContainer: {
    maxHeight: 500,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  rowNumberCell: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRightWidth: 1,
    borderRightColor: '#dee2e6',
  },
  rowNumberText: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '500',
  },
  cell: {
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    margin: 1,
  },
  cellInput: {
    flex: 1,
    padding: 8,
    fontSize: 14,
    color: '#333',
  },
  statusCell: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
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

