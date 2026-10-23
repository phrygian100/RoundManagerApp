import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDataOwnerId } from '../../core/session';
import {
  fetchQuotesForArea,
  getQuoteBookEntry,
  markSheetsPrinted,
  QuoteBookEntry,
} from '../../services/quoteBookService';
import { buildQrSvgs, buildQuoteSheetsHtml, QuoteSheetBrand, QuoteSheetContent } from '../../utils/quoteSheetHtml';
import QuoteOrderModal from './QuoteOrderModal';

const PRESET_PHOTO = require('../../assets/presets/flyer-back/ConservatoryroofBeforeandAfter.jpg');
const MAX_SHEETS_PER_PRINT = 500;

const SAMPLE: QuoteBookEntry = {
  id: '00000000',
  ref: '00000000',
  ownerId: '',
  address: '12 Example Road',
  town: 'Boston',
  postcode: 'PE21 0AA',
  options: [{ frequencyWeeks: 4, price: 12 }, { frequencyWeeks: 8, price: 18 }],
  homeSummary: 'A cosy semi-detached house of about 75 m² with 4 habitable rooms and double glazing throughout.',
  status: 'open',
};

type Props = {
  brand: QuoteSheetBrand;
  servicesText: string;
  additionalServicesText: string;
  promoPhotoUrl: string;
  showBeforeAfter: boolean;
};

const alertWeb = (msg: string) => { if (Platform.OS === 'web') window.alert(msg); };

function absoluteUrl(uri: string) {
  if (!uri || /^(data:|https?:)/.test(uri)) return uri;
  return new URL(uri, window.location.origin).href;
}

export default function QuoteSheetSection({ brand, servicesText, additionalServicesText, promoPhotoUrl, showBeforeAfter }: Props) {
  const [refInput, setRefInput] = useState('');
  const [entry, setEntry] = useState<QuoteBookEntry | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [onlyUnprinted, setOnlyUnprinted] = useState(true);
  const [batch, setBatch] = useState<QuoteBookEntry[] | null>(null);
  const [busy, setBusy] = useState<'' | 'ref' | 'area' | 'print'>('');
  const [showOrder, setShowOrder] = useState(false);

  const content: QuoteSheetContent = useMemo(() => ({
    servicesText,
    additionalServicesText,
    showBeforeAfter,
    photoUrl: Platform.OS === 'web'
      ? absoluteUrl(promoPhotoUrl || Asset.fromModule(PRESET_PHOTO).uri)
      : '',
  }), [servicesText, additionalServicesText, showBeforeAfter, promoPhotoUrl]);

  const shown = entry || SAMPLE;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    buildQrSvgs(brand.businessName, [shown.ref]).then((qr) => {
      if (!cancelled) setPreviewHtml(buildQuoteSheetsHtml([shown], { ...brand, logoUrl: absoluteUrl(brand.logoUrl) }, content, qr, { screen: true }));
    });
    return () => { cancelled = true; };
  }, [shown, brand, content]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>Quote informed sheet</Text>
        <Text style={styles.subtitle}>Open Materials on the web to preview and print quote sheets.</Text>
      </View>
    );
  }

  const loadRef = async () => {
    const ref = refInput.replace(/\D/g, '');
    if (ref.length !== 8) { alertWeb('Enter the 8-digit quote reference.'); return; }
    setBusy('ref');
    try {
      const ownerId = await getDataOwnerId();
      const found = await getQuoteBookEntry(ref);
      if (!found || found.ownerId !== ownerId) { alertWeb('No quote with that reference.'); return; }
      setEntry(found);
    } finally {
      setBusy('');
    }
  };

  const findArea = async () => {
    const text = areaInput.trim();
    if (!text) return;
    setBusy('area');
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) return;
      const isSector = /^[a-z]{1,2}\d[a-z\d]?\s*\d$/i.test(text);
      const sector = isSector ? text.toUpperCase().replace(/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d)$/, '$1 $2') : undefined;
      const found = await fetchQuotesForArea(ownerId, isSector ? { sector } : { town: text }, 2000);
      setBatch(found.filter((q) => q.status === 'open' && (!onlyUnprinted || !q.sheetPrintedAt)));
    } catch (err) {
      console.error('Quote sheet area search failed:', err);
      alertWeb('Could not load quotes for that area.');
    } finally {
      setBusy('');
    }
  };

  const printSheets = async (entries: QuoteBookEntry[], offerMarkPrinted: boolean) => {
    if (!entries.length) return;
    const win = window.open('', '_blank');
    if (!win) { alertWeb('Allow pop-ups for this site to print quote sheets.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:24px">Preparing quote sheets…</p>');
    setBusy('print');
    try {
      const qr = await buildQrSvgs(brand.businessName, entries.map((e) => e.ref));
      const html = buildQuoteSheetsHtml(entries, { ...brand, logoUrl: absoluteUrl(brand.logoUrl) }, content, qr, {
        title: entries.length === 1 ? `Quote ${entries[0].ref}` : `Quote sheets (${entries.length})`,
      });
      win.document.open();
      win.document.write(html);
      win.document.close();
      const images = Array.from(win.document.images);
      await Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
      await new Promise((r) => setTimeout(r, 600));
      win.focus();
      win.print();
      if (offerMarkPrinted && window.confirm(`Mark these ${entries.length} quotes as printed? They will be left out of the next "never printed" run.`)) {
        await markSheetsPrinted(entries.map((e) => e.ref));
        setBatch((prev) => (prev && onlyUnprinted ? prev.filter((q) => !entries.some((e) => e.ref === q.ref)) : prev));
      }
    } catch (err) {
      console.error('Quote sheet print failed:', err);
      win.close();
      alertWeb('Could not build the quote sheets.');
    } finally {
      setBusy('');
    }
  };

  const batchToPrint = batch ? batch.slice(0, MAX_SHEETS_PER_PRINT) : [];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quote informed sheet <Text style={styles.devTag}>DEVELOPER</Text></Text>
          <Text style={styles.subtitle}>
            A personalised quote for one home, with the 4- and 8-weekly prices from the quote book and a QR code that opens their accept page. Print double-sided on A5. The back uses the Canvassing Flyer photo and additional services.
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlGroup}>
          <Text style={styles.label}>Single sheet</Text>
          <View style={styles.row}>
            <TextInput style={styles.input} placeholder="Quote ref (8 digits)" value={refInput} onChangeText={setRefInput} keyboardType="number-pad" onSubmitEditing={loadRef} />
            <Pressable style={styles.btn} onPress={loadRef} disabled={!!busy}>
              {busy === 'ref' ? <ActivityIndicator size="small" color="#007AFF" /> : <Text style={styles.btnText}>Load</Text>}
            </Pressable>
            <Pressable style={[styles.btnPrimary, !entry && styles.disabled]} onPress={() => entry && printSheets([entry], false)} disabled={!entry || !!busy}>
              <Ionicons name="print-outline" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Print this sheet</Text>
            </Pressable>
          </View>
          {!entry ? <Text style={styles.hint}>The preview shows sample prices until a quote is loaded.</Text> : null}
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.label}>Batch for a delivery round</Text>
          <View style={styles.row}>
            <TextInput style={styles.input} placeholder="Postcode sector (PE21 7) or town" value={areaInput} onChangeText={setAreaInput} onSubmitEditing={findArea} autoCapitalize="characters" />
            <Pressable style={styles.btn} onPress={findArea} disabled={!!busy}>
              {busy === 'area' ? <ActivityIndicator size="small" color="#007AFF" /> : <Text style={styles.btnText}>Find</Text>}
            </Pressable>
          </View>
          <Pressable style={styles.checkRow} onPress={() => setOnlyUnprinted((v) => !v)}>
            <Ionicons name={onlyUnprinted ? 'checkbox' : 'square-outline'} size={18} color="#007AFF" />
            <Text style={styles.checkText}>Only open quotes that have never been printed</Text>
          </Pressable>
          {batch ? (
            <View style={styles.row}>
              <Text style={styles.hint}>
                {batch.length} quote{batch.length === 1 ? '' : 's'} found
                {batch.length > MAX_SHEETS_PER_PRINT ? `. The first ${MAX_SHEETS_PER_PRINT} will print; run it again for the rest.` : '.'}
              </Text>
              <Pressable style={[styles.btnPrimary, !batch.length && styles.disabled]} onPress={() => printSheets(batchToPrint, true)} disabled={!batch.length || !!busy}>
                {busy === 'print' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-outline" size={16} color="#fff" />}
                <Text style={styles.btnPrimaryText}>Print {batchToPrint.length} sheets (save as PDF)</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.label}>Your own order</Text>
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={() => setShowOrder(true)} disabled={!!busy}>
              <Text style={styles.btnText}>Specify order</Text>
            </Pressable>
            <Text style={styles.hint}>Paste quote references from a spreadsheet and print them in that order.</Text>
          </View>
        </View>
      </View>

      <QuoteOrderModal
        visible={showOrder}
        maxSheets={MAX_SHEETS_PER_PRINT}
        busy={busy === 'print'}
        onClose={() => setShowOrder(false)}
        onPrint={(entries) => {
          setShowOrder(false);
          printSheets(entries, true);
        }}
      />

      {previewHtml ? (
        React.createElement('iframe', {
          title: 'Quote informed sheet preview',
          srcDoc: previewHtml,
          style: { width: '100%', height: 860, border: 'none', borderRadius: 8, background: '#eef2f5' },
        })
      ) : (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#e0e0e0' },
  header: { flexDirection: 'row', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#222' },
  devTag: { fontSize: 11, color: '#fff', backgroundColor: '#6a1b9a', paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4, lineHeight: 20 },
  controls: { gap: 16, marginBottom: 16 },
  controlGroup: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#444', textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, minWidth: 240, backgroundColor: '#fff' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#007AFF' },
  btnText: { color: '#007AFF', fontWeight: '600' },
  btnPrimary: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#007AFF' },
  btnPrimaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  hint: { fontSize: 13, color: '#666' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkText: { fontSize: 14, color: '#333' },
});
