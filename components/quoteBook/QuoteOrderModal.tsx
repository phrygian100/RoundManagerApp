import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDataOwnerId } from '../../core/session';
import { getQuoteBookEntry, QuoteBookEntry } from '../../services/quoteBookService';

const INITIAL_ROWS = 15;
const LOOKUP_CONCURRENCY = 20;

type Lookup = QuoteBookEntry | 'missing' | 'loading';

type Props = {
  visible: boolean;
  maxSheets: number;
  busy: boolean;
  onClose: () => void;
  onPrint: (entries: QuoteBookEntry[]) => void;
};

const refFrom = (text: string) => {
  const match = String(text || '').match(/\d{8}/);
  return match ? match[0] : '';
};

export default function QuoteOrderModal({ visible, maxSheets, busy, onClose, onPrint }: Props) {
  const [rows, setRows] = useState<string[]>(() => Array(INITIAL_ROWS).fill(''));
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});
  const requested = useRef(new Set<string>());

  const refs = useMemo(() => rows.map(refFrom), [rows]);

  useEffect(() => {
    const pending = Array.from(new Set(refs.filter((r) => r && !requested.current.has(r))));
    if (!pending.length) return;
    pending.forEach((r) => requested.current.add(r));
    setLookups((prev) => ({ ...prev, ...Object.fromEntries(pending.map((r) => [r, 'loading' as Lookup])) }));
    (async () => {
      const ownerId = await getDataOwnerId();
      for (let i = 0; i < pending.length; i += LOOKUP_CONCURRENCY) {
        const chunk = pending.slice(i, i + LOOKUP_CONCURRENCY);
        const results = await Promise.all(chunk.map(async (r) => {
          try {
            const entry = await getQuoteBookEntry(r);
            return [r, entry && entry.ownerId === ownerId ? entry : 'missing'] as const;
          } catch {
            return [r, 'missing'] as const;
          }
        }));
        setLookups((prev) => ({ ...prev, ...Object.fromEntries(results) }));
      }
    })();
  }, [refs]);

  if (Platform.OS !== 'web') return null;

  const firstRowFor: Record<string, number> = {};
  refs.forEach((r, i) => { if (r && firstRowFor[r] === undefined) firstRowFor[r] = i; });

  const ordered: QuoteBookEntry[] = [];
  let missing = 0;
  let checking = 0;
  let invalid = 0;
  rows.forEach((text, i) => {
    const r = refs[i];
    if (!text.trim()) return;
    if (!r) { invalid++; return; }
    const found = lookups[r];
    if (!found || found === 'loading') checking++;
    else if (found === 'missing') missing++;
    else ordered.push(found);
  });
  const toPrint = ordered.slice(0, maxSheets);

  const setCell = (index: number, value: string) => {
    setRows((prev) => prev.map((v, i) => (i === index ? value : v)));
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n') && !text.includes('\t')) return;
    e.preventDefault();
    const lines = text.split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter(Boolean);
    setRows((prev) => {
      const next = [...prev];
      while (next.length < index + lines.length + 1) next.push('');
      lines.forEach((l, k) => { next[index + k] = l; });
      return next;
    });
  };

  const clearAll = () => {
    setRows(Array(INITIAL_ROWS).fill(''));
  };

  const statusFor = (i: number) => {
    const text = rows[i];
    const r = refs[i];
    if (!text.trim()) return null;
    if (!r) return <span style={{ color: '#c62828' }}>Not an 8-digit ref</span>;
    const found = lookups[r];
    if (!found || found === 'loading') return <span style={{ color: '#6c757d' }}>Checking…</span>;
    if (found === 'missing') return <span style={{ color: '#c62828' }}>Not in your quote book</span>;
    if (firstRowFor[r] !== i) return <span style={{ color: '#e65100' }}>Repeat of row {firstRowFor[r] + 1}</span>;
    if (found.status !== 'open') return <span style={{ color: '#e65100' }}>{found.status}</span>;
    return <span style={{ color: '#2e7d32' }}>✓ Ready</span>;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Specify order</Text>
              <Text style={styles.subtitle}>
                Paste a column of quote references from a spreadsheet. The PDF prints one sheet per row, in this order. Rows that are not in your quote book are left out.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6', position: 'sticky', top: 0 }}>
                  <th style={{ ...thStyle, width: 40 }}>#</th>
                  <th style={{ ...thStyle, width: 150 }}>Quote ref</th>
                  <th style={thStyle}>Address</th>
                  <th style={{ ...thStyle, width: 170 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((text, i) => {
                  const found = lookups[refs[i]];
                  const entry = found && found !== 'loading' && found !== 'missing' ? found : null;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #e9ecef' }}>
                      <td style={{ ...tdStyle, backgroundColor: '#f8f9fa', textAlign: 'center', color: '#6c757d', fontWeight: 500 }}>{i + 1}</td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          value={text}
                          placeholder={i === 0 ? '12345678' : ''}
                          onChange={(e) => setCell(i, e.target.value)}
                          onPaste={(e) => handlePaste(i, e)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ ...tdStyle, padding: '4px 8px', fontSize: 14, color: '#333' }}>
                        {entry ? `${entry.address}${entry.postcode ? `, ${entry.postcode}` : ''}` : ''}
                      </td>
                      <td style={{ ...tdStyle, padding: '4px 8px', fontSize: 13, fontWeight: 600 }}>{statusFor(i)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Pressable style={styles.btn} onPress={() => setRows((prev) => [...prev, ...Array(10).fill('')])}>
                <Text style={styles.btnText}>Add 10 rows</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={clearAll}>
                <Text style={styles.btnText}>Clear</Text>
              </Pressable>
              <Text style={styles.summary}>
                {ordered.length} ready
                {checking ? ` · ${checking} checking` : ''}
                {missing ? ` · ${missing} not found` : ''}
                {invalid ? ` · ${invalid} invalid` : ''}
                {ordered.length > maxSheets ? ` · only the first ${maxSheets} will print` : ''}
              </Text>
            </View>
            <Pressable
              style={[styles.btnPrimary, (!toPrint.length || checking > 0 || busy) && styles.disabled]}
              disabled={!toPrint.length || checking > 0 || busy}
              onPress={() => onPrint(toPrint)}
            >
              <Ionicons name="document-outline" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Create PDF ({toPrint.length} sheet{toPrint.length === 1 ? '' : 's'})</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  border: '2px solid #e0e0e0',
  borderRadius: 4,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'Consolas, "Courier New", monospace',
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 900, height: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 20, gap: 12 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4, lineHeight: 20 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  footerLeft: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', flex: 1 },
  summary: { fontSize: 14, color: '#444' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#007AFF' },
  btnText: { color: '#007AFF', fontWeight: '600' },
  btnPrimary: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#007AFF' },
  btnPrimaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
