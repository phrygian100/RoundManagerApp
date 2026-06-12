import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { initMetaPixel } from '../utils/metaPixel';
import { captureUtmParams } from '../utils/utmTracking';

// Public landing page for the bin cleaning vertical (guvnor.app/welcome-bin-cleaning).
// First of the per-vertical landing pages: the main homepage (/welcome) stays
// window-cleaning-focused until multiple verticals show traction. Funnels
// consumers to /bin-cleaning-quote.

export default function WelcomeBinCleaningScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrow = Platform.OS === 'web' && width < 640;

  // Ads may point here directly - keep utm_* labels for the quote form and
  // load the Meta Pixel for ad-conversion measurement.
  useEffect(() => {
    captureUtmParams();
    initMetaPixel();
  }, []);

  const go = (path: string) => {
    if (Platform.OS === 'web') {
      window.location.href = path;
    } else {
      router.push(path as any);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      {Platform.OS === 'web' && (
        <Head>
          <title>Guvnor — Find a Local Bin Cleaning Service</title>
          <meta
            name="description"
            content="Get a free, no-obligation bin cleaning quote anywhere in the UK. Guvnor connects you with trusted local bin cleaning services."
          />
        </Head>
      )}

      {/* Navigation */}
      <View style={styles.nav}>
        <View style={styles.navContent}>
          <Image
            source={require('../assets/images/logo_transparent.png')}
            style={[styles.navLogo, isNarrow && styles.navLogoMobile]}
            resizeMode="contain"
          />
          <Pressable onPress={() => go('/login')} style={styles.signInButton}>
            <Text style={styles.signInButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </View>

      {/* Hero - consumer first */}
      <View style={styles.main}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, isNarrow && styles.heroTitleMobile]}>
            Stinky bins?
          </Text>
          <Text style={[styles.heroSubtitle, isNarrow && styles.heroSubtitleMobile]}>
            Get a free, no-obligation quote from a trusted local bin cleaning
            service. Your bins washed, deodorised and fresh after every collection —
            wherever you are in the UK.
          </Text>

          <Pressable onPress={() => go('/bin-cleaning-quote')} style={styles.ctaButton}>
            <Text style={styles.ctaButtonText}>Get my free quote</Text>
          </Pressable>

          <View style={styles.trustRow}>
            {['Free quote', 'Trusted local cleaners', 'Anywhere in the UK'].map((t) => (
              <View key={t} style={styles.trustPill}>
                <Text style={styles.trustPillText}>✓ {t}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* How it works */}
        <View style={styles.steps}>
          <Text style={styles.stepsTitle}>How it works</Text>
          <View style={[styles.stepsRow, isNarrow && styles.stepsRowMobile]}>
            {[
              { n: '1', title: 'Tell us about your bins', text: 'A few quick details — your address, how many bins and how often you\u2019d like them cleaned.' },
              { n: '2', title: 'We find your local pro', text: 'We match your request with a trusted bin cleaning service working in your area.' },
              { n: '3', title: 'Get your quote', text: 'Your bin cleaner gets in touch to confirm your quote and first clean — usually right after collection day.' },
            ].map((s) => (
              <View key={s.n} style={[styles.stepCard, isNarrow && styles.stepCardMobile]}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{s.n}</Text>
                </View>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={() => go('/bin-cleaning-quote')} style={styles.ctaButtonSecondary}>
            <Text style={styles.ctaButtonSecondaryText}>Request a quote →</Text>
          </Pressable>
        </View>
      </View>

      {/* Provider band */}
      <View style={styles.providerBand}>
        <View style={styles.providerContent}>
          <Text style={styles.providerTitle}>Clean bins for a living?</Text>
          <Text style={styles.providerText}>
            Guvnor is also the simple way to run your rounds — clients, runsheets,
            payments and quotes, all in one place. Built for round-based businesses
            like yours.
          </Text>
          <View style={styles.providerLinks}>
            <Pressable onPress={() => go('/home')} style={styles.providerLink}>
              <Text style={styles.providerLinkText}>Explore Guvnor for your business →</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2026 Guvnor. All rights reserved.</Text>
        <View style={styles.footerLinksRow}>
          <Pressable onPress={() => go('/about')}>
            <Text style={styles.footerLink}>About</Text>
          </Pressable>
          <Pressable onPress={() => go('/contact')}>
            <Text style={styles.footerLink}>Contact</Text>
          </Pressable>
          <Pressable onPress={() => go('/privacy-policy')}>
            <Text style={styles.footerLink}>Privacy</Text>
          </Pressable>
          <Pressable onPress={() => go('/terms')}>
            <Text style={styles.footerLink}>Terms</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  pageContent: { flexGrow: 1 },

  nav: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  navContent: {
    maxWidth: 1100,
    width: '100%',
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navLogo: { width: 260, height: 70 },
  navLogoMobile: { width: 200, height: 54 },
  signInButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  signInButtonText: { color: '#374151', fontSize: 14, fontWeight: '600' },

  main: {
    flex: 1,
    width: '100%',
    maxWidth: 980,
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 20,
  },

  hero: { alignItems: 'center', paddingTop: 56, paddingBottom: 40 },
  heroTitle: {
    fontSize: 46,
    lineHeight: 54,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 14,
  },
  heroTitleMobile: { fontSize: 32, lineHeight: 38 },
  heroSubtitle: {
    fontSize: 18,
    lineHeight: 27,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 560,
    marginBottom: 26,
  },
  heroSubtitleMobile: { fontSize: 16, lineHeight: 23 },

  ctaButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 22,
    ...Platform.select({
      web: { shadowColor: '#10b981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14 },
      default: { elevation: 4 },
    }),
  },
  ctaButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },

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

  steps: { alignItems: 'center', paddingBottom: 56 },
  stepsTitle: { fontSize: 26, fontWeight: 'bold', color: '#111827', marginBottom: 24 },
  stepsRow: { flexDirection: 'row', gap: 16, width: '100%' },
  stepsRowMobile: { flexDirection: 'column' },
  stepCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 22,
  },
  stepCardMobile: { flex: undefined as any, width: '100%' },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  stepNumberText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  stepTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 },
  stepText: { fontSize: 14, lineHeight: 21, color: '#6b7280' },

  ctaButtonSecondary: { marginTop: 28, paddingVertical: 12, paddingHorizontal: 24 },
  ctaButtonSecondaryText: { color: '#10b981', fontSize: 16, fontWeight: '700' },

  providerBand: {
    backgroundColor: '#f3f4f6',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  providerContent: {
    maxWidth: 720,
    width: '100%',
    marginHorizontal: 'auto' as any,
    alignItems: 'center',
  },
  providerTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' },
  providerText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 14,
  },
  providerLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18 },
  providerLink: { paddingVertical: 6 },
  providerLinkText: { color: '#4f46e5', fontSize: 15, fontWeight: '600' },

  footer: {
    backgroundColor: '#111827',
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  footerText: { color: '#9ca3af', fontSize: 13 },
  footerLinksRow: { flexDirection: 'row', gap: 22 },
  footerLink: { color: '#9ca3af', fontSize: 13, textDecorationLine: 'underline' },
});
