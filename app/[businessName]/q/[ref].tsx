import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { PORTAL_API_ORIGIN, useBusinessPortal } from '../../../hooks/useBusinessPortal';
import { portalStyles } from '../../../styles/portalStyles';

type PublicQuote = {
  ref: string;
  address: string;
  town: string;
  postcode: string;
  options: { frequencyWeeks: number; price: number }[];
  homeSummary: string;
  status: 'open' | 'accepted' | 'closed';
  acceptedFrequencyWeeks: number | null;
};

const money = (n: number) => `£${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

export default function QuoteAcceptScreen() {
  const { businessUser, loading, businessName, isNarrowWeb } = useBusinessPortal();
  const params = useLocalSearchParams();
  const ref = String(Array.isArray(params.ref) ? params.ref[0] : params.ref || '').replace(/\D/g, '');

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!businessUser) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/getQuoteByRef`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId: businessUser.id, ref }),
        });
        const data = await resp.json();
        if (cancelled) return;
        if (data?.ok) {
          setQuote(data.quote);
          if (data.quote.options?.length === 1) setSelected(data.quote.options[0].frequencyWeeks);
        } else {
          setLoadError(data?.error || 'We could not find that quote.');
        }
      } catch {
        if (!cancelled) setLoadError('We could not load your quote. Please check your connection and try again.');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessUser, ref]);

  const handleAccept = async () => {
    if (!businessUser || !quote) return;
    if (selected == null) { setError('Please choose how often you would like us to visit.'); return; }
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { setError('Please enter your mobile number.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/acceptQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businessUser.id,
          businessName: businessUser.businessName,
          ref: quote.ref,
          frequencyWeeks: selected,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goToQuoteForm = () => {
    if (Platform.OS === 'web') window.location.href = `/${businessName}/quote`;
  };

  if (loading || (businessUser && fetching)) {
    return (
      <View style={[portalStyles.container, styles.center]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!businessUser) {
    return (
      <View style={portalStyles.container}>
        <Text style={portalStyles.errorTextLarge}>Business not found</Text>
      </View>
    );
  }

  const chosen = quote?.options.find((o) => o.frequencyWeeks === selected);

  return (
    <ScrollView style={portalStyles.container} contentContainerStyle={portalStyles.contentContainer}>
      <View style={styles.main}>
        <Image
          source={require('../../../assets/images/logo_transparent.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.business, isNarrowWeb && { fontSize: 24 }]}>{businessUser.businessName}</Text>

        {loadError || !quote ? (
          <View style={styles.card}>
            <Text style={styles.title}>Quote not found</Text>
            <Text style={styles.body}>{loadError || 'We could not find that quote.'}</Text>
            <Pressable style={styles.secondaryButton} onPress={goToQuoteForm}>
              <Text style={styles.secondaryButtonText}>Request a quote instead</Text>
            </Pressable>
          </View>
        ) : done ? (
          <View style={styles.card}>
            <Text style={styles.tick}>✓</Text>
            <Text style={styles.title}>Thank you, {name.trim().split(' ')[0]}!</Text>
            <Text style={styles.body}>
              You have accepted {chosen ? `every ${chosen.frequencyWeeks} weeks at ${money(chosen.price)} per clean` : 'your quote'}.
              {' '}{businessUser.businessName} will be in touch to confirm your first visit.
            </Text>
          </View>
        ) : quote.status !== 'open' ? (
          <View style={styles.card}>
            <Text style={styles.title}>{quote.status === 'accepted' ? 'Already accepted' : 'Quote closed'}</Text>
            <Text style={styles.body}>
              {quote.status === 'accepted'
                ? 'This quote has already been accepted. We will be in touch to arrange your first visit.'
                : 'This quote is no longer open. Get in touch and we will happily quote again.'}
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.kicker}>Your window cleaning quote</Text>
            <Text style={styles.refLine}>Quote ref {quote.ref}</Text>

            <Text style={styles.sectionLabel}>Is this your address?</Text>
            <View style={styles.addressBox}>
              <Text style={styles.addressLine}>{quote.address}</Text>
              <Text style={styles.addressLine}>{[quote.town, quote.postcode].filter(Boolean).join(', ')}</Text>
            </View>
            {quote.homeSummary ? <Text style={styles.home}>{quote.homeSummary}</Text> : null}
            <Pressable onPress={goToQuoteForm}>
              <Text style={styles.link}>Not your address? Request a quote here.</Text>
            </Pressable>

            <Text style={styles.sectionLabel}>Choose how often</Text>
            {quote.options.map((o) => {
              const active = selected === o.frequencyWeeks;
              return (
                <Pressable
                  key={o.frequencyWeeks}
                  onPress={() => { setSelected(o.frequencyWeeks); setError(''); }}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={styles.optionLabel}>Every {o.frequencyWeeks} weeks</Text>
                  <Text style={styles.optionPrice}>{money(o.price)}<Text style={styles.per}> per clean</Text></Text>
                </Pressable>
              );
            })}

            <Text style={styles.sectionLabel}>Your details</Text>
            <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} value={name} onChangeText={(t) => { setName(t); setError(''); }} placeholder="Your full name" autoComplete="name" />
            <Text style={styles.label}>Mobile number <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} value={phone} onChangeText={(t) => { setPhone(t); setError(''); }} placeholder="07…" keyboardType="phone-pad" autoComplete="tel" />
            <Text style={styles.label}>Email (optional)</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Text style={styles.label}>Anything we should know? (optional)</Text>
            <TextInput style={[styles.input, { minHeight: 70 }]} value={notes} onChangeText={setNotes} placeholder="Gate code, dog in the garden, extra services…" multiline />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.primaryButton, submitting && { opacity: 0.7 }]} onPress={handleAccept} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Accept my quote</Text>}
            </Pressable>
            <Text style={styles.small}>No payment is taken now. We will contact you to arrange the first clean.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  main: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 28 },
  logo: { width: 120, height: 48, alignSelf: 'center', marginBottom: 8 },
  business: { fontSize: 30, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#10b981', borderTopWidth: 4,
    ...Platform.select({ web: { boxShadow: '0 10px 25px rgba(0,0,0,0.08)' } as any, default: { elevation: 4 } }),
  },
  kicker: { fontSize: 22, fontWeight: 'bold', color: '#111827', textAlign: 'center' },
  refLine: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 4, marginBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  addressBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  addressLine: { fontSize: 16, color: '#111827', fontWeight: '600' },
  home: { fontSize: 14, color: '#4b5563', marginTop: 8 },
  link: { fontSize: 14, color: '#10b981', marginTop: 8, fontWeight: '500' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb', marginBottom: 10, backgroundColor: '#fff' },
  optionActive: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#9ca3af', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#10b981' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981' },
  optionLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: '#333' },
  optionPrice: { fontSize: 20, fontWeight: '700', color: '#10b981' },
  per: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6, marginTop: 8 },
  required: { color: '#dc2626' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 14, fontSize: 16, backgroundColor: '#fff', color: '#111827' },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center', marginTop: 14 },
  primaryButton: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 18 },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryButton: { marginTop: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#10b981', alignItems: 'center' },
  secondaryButtonText: { color: '#10b981', fontWeight: '600' },
  small: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 16, color: '#4b5563', textAlign: 'center', lineHeight: 22 },
  tick: { fontSize: 48, color: '#10b981', textAlign: 'center', marginBottom: 8 },
});
