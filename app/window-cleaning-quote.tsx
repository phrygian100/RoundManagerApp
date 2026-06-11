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

// Public, unauthenticated lead-capture page. Prospective customers anywhere in
// the UK request a window cleaning quote; submissions land in the developer's
// Guvnor Leads bucket (see /guvnor-leads) for manual matching to a local cleaner.

const FREQUENCY_OPTIONS = [
  { key: '4', label: 'Every 4 weeks' },
  { key: '8', label: 'Every 8 weeks' },
  { key: 'one-off', label: 'One-off clean' },
  { key: '', label: 'Not sure yet' },
];

const PROPERTY_OPTIONS = [
  { key: 'Flat / apartment', icon: '🏢' },
  { key: 'Bungalow', icon: '🏠' },
  { key: '2 bed house', icon: '🏡' },
  { key: '3 bed house', icon: '🏡' },
  { key: '4 bed house', icon: '🏡' },
  { key: '5+ bed house', icon: '🏘️' },
];

export default function WindowCleaningQuoteScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [town, setTown] = useState('');
  const [postcode, setPostcode] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [frequency, setFrequency] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [hasConservatory, setHasConservatory] = useState<boolean | null>(null);
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

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!phone.trim()) { setError('Please enter your contact number'); return; }
    if (!address.trim()) { setError('Please enter your address'); return; }
    if (!town.trim()) { setError('Please enter your town'); return; }
    if (!postcode.trim()) { setError('Please enter your postcode'); return; }

    setError('');
    setSubmitting(true);
    try {
      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/submitQuoteRequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: DEVELOPER_UID,
          businessName: GUVNOR_LEADS_BUSINESS_NAME,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          town: town.trim(),
          postcode: postcode.trim(),
          email: email.trim() || null,
          notes: notes.trim() || null,
          propertyType: propertyType || null,
          hasConservatory,
          selectedImageUrl: null,
          selectedFrequency: frequency || null,
          selectedCost: null,
          additionalServices: null,
          utm: getStoredUtmParams(),
        }),
      });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || 'Failed to submit request');
      // Tell Meta a genuine lead completed - this is the conversion signal
      // Leads-objective campaigns optimise against.
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
          <title>Get a Window Cleaning Quote | Guvnor</title>
          <meta
            name="description"
            content="Request a free, no-obligation window cleaning quote anywhere in the UK. Guvnor matches you with a trusted local window cleaner."
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
              Thanks {name.trim().split(' ')[0]} — we&apos;re on it. A trusted local window
              cleaner will be in touch shortly to arrange your quote.
            </Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            <View style={styles.hero}>
              <Text style={[styles.heroTitle, isNarrow && styles.heroTitleMobile]}>
                Sparkling windows,{'\n'}without the hassle
              </Text>
              <Text style={styles.heroSubtitle}>
                Tell us where you are and we&apos;ll match you with a trusted local
                window cleaner. Free, no-obligation quotes — anywhere in the UK.
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
                <Text style={styles.label}>What type of property is it?</Text>
                <View style={styles.propertyGrid}>
                  {PROPERTY_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.key}
                      onPress={() => setPropertyType(propertyType === opt.key ? '' : opt.key)}
                      style={[styles.propertyCard, propertyType === opt.key && styles.propertyCardActive]}
                    >
                      <Text style={styles.propertyIcon}>{opt.icon}</Text>
                      <Text style={[styles.propertyLabel, propertyType === opt.key && styles.propertyLabelActive]}>
                        {opt.key}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Do you have a conservatory?</Text>
                <View style={styles.chipRow}>
                  {[{ v: true, label: 'Yes' }, { v: false, label: 'No' }].map((opt) => (
                    <Pressable
                      key={opt.label}
                      onPress={() => setHasConservatory(hasConservatory === opt.v ? null : opt.v)}
                      style={[styles.chip, hasConservatory === opt.v && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, hasConservatory === opt.v && styles.chipTextActive]}>
                        {opt.label}
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
                  placeholder="e.g. conservatory, gutters, access notes (optional)"
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
                local window cleaning professional so they can contact you about your quote.
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
    flexBasis: '30%',
    minWidth: 96,
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
