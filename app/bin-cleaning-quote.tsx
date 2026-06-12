import Head from 'expo-router/head';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { PORTAL_API_ORIGIN } from '../hooks/useBusinessPortal';
import { DEVELOPER_UID, GUVNOR_LEADS_BUSINESS_NAME } from '../shared/constants/developer';
import { initMetaPixel, trackMetaPixelEvent } from '../utils/metaPixel';
import { captureUtmParams, getStoredUtmParams } from '../utils/utmTracking';

// Public, unauthenticated lead-capture page for the bin cleaning vertical.
// Mirrors /window-cleaning-quote; submissions land in the developer's Guvnor
// Leads bucket (see /guvnor-leads) tagged serviceCategory: 'bin-cleaning'.

const FREQUENCY_OPTIONS = [
  { key: '4', label: 'Every 4 weeks' },
  { key: '8', label: 'Every 8 weeks' },
  { key: 'one-off', label: 'One-off clean' },
  { key: '', label: 'Not sure yet' },
];

const BIN_COUNT_OPTIONS = [
  { key: '1 bin', icon: '🗑️' },
  { key: '2 bins', icon: '🗑️' },
  { key: '3 bins', icon: '🗑️' },
  { key: '4+ bins', icon: '🗑️' },
];

const BIN_TYPE_OPTIONS = ['General waste', 'Recycling', 'Garden waste', 'Food caddy'];

export default function BinCleaningQuoteScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [frequency, setFrequency] = useState('');
  const [binCount, setBinCount] = useState('');
  const [binTypes, setBinTypes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const isNarrow = Platform.OS !== 'web' || (typeof window !== 'undefined' && window.innerWidth < 768);

  // Remember ad-campaign labels (utm_* URL params) for lead attribution,
  // and load the Meta Pixel so ad clicks can be tied to real submissions.
  useEffect(() => {
    captureUtmParams();
    initMetaPixel();
  }, []);

  const toggleBinType = (t: string) => {
    setBinTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!phone.trim()) { setError('Please enter your contact number'); return; }
    if (!address.trim()) { setError('Please enter your address'); return; }
    if (!town.trim()) { setError('Please enter your town'); return; }
    if (!postcode.trim()) { setError('Please enter your postcode'); return; }

    setError('');
    setSubmitting(true);
    try {
      // Reuses the generic propertyType field for the bin summary so the
      // existing leads pipeline displays it without changes.
      const binSummary = [binCount, binTypes.join(', ')].filter(Boolean).join(' — ') || null;

      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/submitQuoteRequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: DEVELOPER_UID,
          businessName: GUVNOR_LEADS_BUSINESS_NAME,
          serviceCategory: 'bin-cleaning',
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          town: town.trim(),
          postcode: postcode.trim(),
          email: email.trim() || null,
          notes: notes.trim() || null,
          propertyType: binSummary,
          hasConservatory: null,
          selectedImageUrl: null,
          selectedFrequency: frequency || null,
          selectedCost: null,
          additionalServices: null,
          utm: getStoredUtmParams(),
        }),
      });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || 'Failed to submit request');
      trackMetaPixelEvent('Lead');
      setDone(true);
    } catch (err) {
      console.error('Error submitting quote request:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      {Platform.OS === 'web' && (
        <Head>
          <title>Get a Wheelie Bin Cleaning Quote | Guvnor</title>
          <meta
            name="description"
            content="Request a free, no-obligation wheelie bin cleaning quote anywhere in the UK. Guvnor matches you with a trusted local bin cleaning service."
          />
        </Head>
      )}

      {/* Header */}
      <View style={styles.nav}>
        <Image
          source={require('../assets/images/logo_transparent.png')}
          style={styles.navLogo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.main}>
        {done ? (
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Request received!</Text>
            <Text style={styles.successText}>
              Thanks {name.trim().split(' ')[0]} — we&apos;re on it. A trusted local bin
              cleaning service will be in touch shortly to arrange your quote.
            </Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            <View style={styles.hero}>
              <Text style={[styles.heroTitle, isNarrow && styles.heroTitleMobile]}>
                Fresh, clean bins,{'\n'}without lifting a finger
              </Text>
              <Text style={styles.heroSubtitle}>
                Tell us where you are and we&apos;ll match you with a trusted local
                wheelie bin cleaning service. Free, no-obligation quotes — anywhere in the UK.
              </Text>
              <View style={styles.trustRow}>
                {['Free quote', 'Local professionals', 'UK-wide'].map((t) => (
                  <View key={t} style={styles.trustPill}>
                    <Text style={styles.trustPillText}>✓ {t}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Form */}
            <View style={[styles.formCard, isNarrow && styles.formCardMobile]}>
              <Text style={styles.formTitle}>Get your free quote</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="Your full name" placeholderTextColor="#9ca3af" value={name} onChangeText={(t) => { setName(t); setError(''); }} autoComplete="name" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contact Number <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="Your phone number" placeholderTextColor="#9ca3af" value={phone} onChangeText={(t) => { setPhone(t); setError(''); }} keyboardType="phone-pad" autoComplete="tel" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Address <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="First line of address" placeholderTextColor="#9ca3af" value={address} onChangeText={(t) => { setAddress(t); setError(''); }} autoComplete="street-address" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Town <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="Town or city" placeholderTextColor="#9ca3af" value={town} onChangeText={(t) => { setTown(t); setError(''); }} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Postcode <Text style={styles.required}>*</Text></Text>
                <TextInput style={styles.input} placeholder="Postcode" placeholderTextColor="#9ca3af" value={postcode} onChangeText={(t) => { setPostcode(t.toUpperCase()); setError(''); }} autoCapitalize="characters" autoComplete="postal-code" />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>How many bins need cleaning?</Text>
                <View style={styles.propertyGrid}>
                  {BIN_COUNT_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.key}
                      onPress={() => setBinCount(binCount === opt.key ? '' : opt.key)}
                      style={[styles.propertyCard, binCount === opt.key && styles.propertyCardActive]}
                    >
                      <Text style={styles.propertyIcon}>{opt.icon}</Text>
                      <Text style={[styles.propertyLabel, binCount === opt.key && styles.propertyLabelActive]}>
                        {opt.key}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Which bins? (tap all that apply)</Text>
                <View style={styles.chipRow}>
                  {BIN_TYPE_OPTIONS.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => toggleBinType(t)}
                      style={[styles.chip, binTypes.includes(t) && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, binTypes.includes(t) && styles.chipTextActive]}>
                        {t}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>How often?</Text>
                <View style={styles.chipRow}>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.label}
                      onPress={() => setFrequency(opt.key)}
                      style={[styles.chip, frequency === opt.key && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, frequency === opt.key && styles.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput style={styles.input} placeholder="Your email (optional)" placeholderTextColor="#9ca3af" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Anything we should know?</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g. collection day, where the bins are kept (optional)"
                  placeholderTextColor="#9ca3af"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                style={[styles.submitButton, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Request My Free Quote</Text>
                )}
              </Pressable>

              <Text style={styles.consentText}>
                By submitting this form you agree to Guvnor sharing your details with a
                local bin cleaning professional so they can contact you about your quote.
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2026 Guvnor. All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f9fafb' },
  pageContent: { flexGrow: 1 },

  nav: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'flex-start',
  },
  navLogo: { width: 260, height: 70 },

  main: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 16,
    paddingBottom: 48,
  },

  hero: { alignItems: 'center', paddingTop: 36, paddingBottom: 24 },
  heroTitle: {
    fontSize: 38,
    lineHeight: 46,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  heroTitleMobile: { fontSize: 28, lineHeight: 34 },
  heroSubtitle: {
    fontSize: 17,
    lineHeight: 25,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 480,
    marginBottom: 18,
  },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  trustPill: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  trustPillText: { color: '#065f46', fontSize: 13, fontWeight: '600' },

  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: '#10b981',
    borderTopWidth: 4,
    ...Platform.select({
      web: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 25 },
      default: { elevation: 6 },
    }),
  },
  formCardMobile: { padding: 18 },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 20,
  },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  required: { color: '#dc2626' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },

  propertyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  propertyCard: {
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 80,
  },
  propertyCardActive: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  propertyIcon: { fontSize: 22, marginBottom: 4 },
  propertyLabel: { fontSize: 13, color: '#374151', fontWeight: '500', textAlign: 'center' },
  propertyLabelActive: { color: '#065f46', fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  chipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#065f46', fontWeight: '700' },

  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center' },

  submitButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.7 },

  consentText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 14,
  },

  successContainer: { alignItems: 'center', paddingVertical: 72 },
  successIcon: { fontSize: 48, color: '#10b981', marginBottom: 16 },
  successTitle: { fontSize: 26, fontWeight: 'bold', color: '#065f46', marginBottom: 10 },
  successText: { fontSize: 16, lineHeight: 24, color: '#6b7280', textAlign: 'center', maxWidth: 420 },

  footer: {
    paddingVertical: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerText: { fontSize: 13, color: '#9ca3af' },
});
