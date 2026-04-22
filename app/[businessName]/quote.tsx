import React, { useState } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useBusinessPortal, PORTAL_API_ORIGIN } from '../../hooks/useBusinessPortal';
import { portalStyles } from '../../styles/portalStyles';

type QuoteStep = 'form' | 'pickImage' | 'pickService' | 'extras' | 'review' | 'done';

export default function QuoteScreen() {
  const { businessUser, loading, businessName, isNarrowWeb, handleNavigation, router } = useBusinessPortal();

  const [quoteName, setQuoteName] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteAddress, setQuoteAddress] = useState('');
  const [quoteTown, setQuoteTown] = useState('');
  const [quotePostcode, setQuotePostcode] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteStep, setQuoteStep] = useState<QuoteStep>('form');
  const [quoteError, setQuoteError] = useState('');

  const [quoteOptions, setQuoteOptions] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [selectedLine, setSelectedLine] = useState<any | null>(null);
  const [extraGutters, setExtraGutters] = useState(false);
  const [extraConservatory, setExtraConservatory] = useState(false);
  const [extraSolarPanels, setExtraSolarPanels] = useState(false);
  const [extraOther, setExtraOther] = useState('');

  const handleBackToLanding = () => {
    if (Platform.OS === 'web') {
      window.location.href = `/${businessName}`;
    } else {
      router.back();
    }
  };

  const handleQuoteSubmit = async () => {
    if (!quoteName.trim()) { setQuoteError('Please enter your name'); return; }
    if (!quotePhone.trim()) { setQuoteError('Please enter your contact number'); return; }
    if (!quoteAddress.trim()) { setQuoteError('Please enter your address'); return; }
    if (!quoteTown.trim()) { setQuoteError('Please enter your town'); return; }
    if (!quotePostcode.trim()) { setQuoteError('Please enter your postcode'); return; }
    if (!businessUser) { setQuoteError('Business information not available'); return; }

    setQuoteError('');
    setQuoteSubmitting(true);
    try {
      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/getQuoteOptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: businessUser.id }),
      });
      const data = await resp.json();
      if (data?.ok && data.items?.length > 0) {
        setQuoteOptions(data.items);
        setQuoteStep('pickImage');
      } else {
        await submitQuoteToBackend();
      }
    } catch (err) {
      console.error('Error fetching quote options:', err);
      await submitQuoteToBackend();
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const submitQuoteToBackend = async (imageUrl?: string, frequency?: string, cost?: number) => {
    if (!businessUser) return;
    try {
      const extras: string[] = [];
      if (extraGutters) extras.push('Gutter cleaning/clearing');
      if (extraConservatory) extras.push('Conservatory roof');
      if (extraSolarPanels) extras.push('Solar panel cleaning');
      if (extraOther.trim()) extras.push(extraOther.trim());

      const resp = await fetch(`${PORTAL_API_ORIGIN}/api/portal/submitQuoteRequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businessUser.id,
          businessName: businessUser.businessName,
          name: quoteName.trim(),
          phone: quotePhone.trim(),
          address: quoteAddress.trim(),
          town: quoteTown.trim(),
          postcode: quotePostcode.trim(),
          email: quoteEmail.trim() || null,
          notes: quoteNotes.trim() || null,
          selectedImageUrl: imageUrl || null,
          selectedFrequency: frequency || null,
          selectedCost: cost ?? null,
          additionalServices: extras.length > 0 ? extras : null,
        }),
      });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || 'Failed to submit request');
      setQuoteStep('done');
    } catch (err) {
      console.error('Error submitting quote request:', err);
      setQuoteError('Failed to submit request. Please try again.');
      setQuoteStep('form');
    }
  };

  const handleConfirmQuote = async () => {
    setQuoteSubmitting(true);
    try {
      await submitQuoteToBackend(
        selectedImage?.imageUrl,
        selectedLine?.isOneOff ? 'one-off' : selectedLine?.frequencyWeeks,
        selectedLine?.cost,
      );
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const resetQuoteFlow = () => {
    setQuoteStep('form');
    setQuoteOptions([]);
    setSelectedImage(null);
    setSelectedLine(null);
    setExtraGutters(false);
    setExtraConservatory(false);
    setExtraSolarPanels(false);
    setExtraOther('');
    setQuoteError('');
    setQuoteName('');
    setQuotePhone('');
    setQuoteAddress('');
    setQuoteTown('');
    setQuotePostcode('');
    setQuoteEmail('');
    setQuoteNotes('');
  };

  if (loading) {
    return (
      <View style={portalStyles.container}>
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

  return (
    <ScrollView style={portalStyles.container} contentContainerStyle={portalStyles.contentContainer}>
      {/* Navigation Header */}
      <View style={portalStyles.navigation}>
        <View style={[portalStyles.navContent, isNarrowWeb && portalStyles.navContentMobile]}>
          <Pressable onPress={() => handleNavigation('/home')} style={portalStyles.logoContainer}>
            <Image
              source={require('../../assets/images/logo_transparent.png')}
              style={[portalStyles.navLogo, isNarrowWeb && portalStyles.navLogoMobile]}
              resizeMode="contain"
            />
          </Pressable>
          {Platform.OS === 'web' && !isNarrowWeb && (
            <View style={portalStyles.navLinks}>
              <Pressable onPress={() => handleNavigation('/home')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Home</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/pricing')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Pricing</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/about')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Contact</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, isNarrowWeb && styles.heroTitleMobile]}>
            {businessUser.businessName}
          </Text>
        </View>

        {/* STEP: done */}
        {quoteStep === 'done' ? (
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Quote Request Received!</Text>
            <Text style={styles.successText}>
              Your request has been received and {businessUser.businessName} will be in touch shortly.
            </Text>
            <Pressable style={styles.anotherButton} onPress={resetQuoteFlow}>
              <Text style={styles.anotherButtonText}>Submit Another Request</Text>
            </Pressable>
          </View>

        /* STEP: pickImage - full-width images, no clipping */
        ) : quoteStep === 'pickImage' ? (
          <View style={styles.stepContainer}>
            <Pressable onPress={() => setQuoteStep('form')} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>
            <Text style={styles.stepTitle}>Which looks most like your property?</Text>
            <Text style={styles.stepSubtitle}>Select the option that best matches your home</Text>
            <View style={styles.imageGrid}>
              {quoteOptions.map((opt: any) => (
                <Pressable
                  key={opt.id}
                  onPress={() => { setSelectedImage(opt); setQuoteStep('pickService'); }}
                  style={({ pressed }) => [
                    styles.imageCard,
                    isNarrowWeb && styles.imageCardMobile,
                    pressed && styles.imageCardPressed,
                  ]}
                >
                  <Image
                    source={{ uri: opt.imageUrl }}
                    style={styles.propertyImage}
                    resizeMode="contain"
                  />
                </Pressable>
              ))}
            </View>
          </View>

        /* STEP: pickService */
        ) : quoteStep === 'pickService' && selectedImage ? (
          <View style={styles.stepContainer}>
            <Pressable onPress={() => setQuoteStep('pickImage')} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>
            <Image
              source={{ uri: selectedImage.imageUrl }}
              style={styles.selectedPropertyImage}
              resizeMode="contain"
            />
            <Text style={styles.stepTitle}>Choose your service</Text>
            <Text style={styles.stepSubtitle}>Select the option that suits you best</Text>
            {(selectedImage.pricingLines || []).map((ln: any) => {
              const v = ln.cost != null ? Number(ln.cost) : 0;
              if (!v) return null;
              const label = ln.isOneOff ? 'One-off' : `${ln.frequencyWeeks} Weekly`;
              return (
                <Pressable
                  key={ln.id}
                  onPress={() => { setSelectedLine(ln); setQuoteStep('extras'); }}
                  style={({ pressed }) => [styles.serviceOption, pressed && styles.serviceOptionPressed]}
                >
                  <Text style={styles.serviceOptionLabel}>{label}</Text>
                  <Text style={styles.serviceOptionPrice}>£{v.toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>

        /* STEP: extras */
        ) : quoteStep === 'extras' && selectedLine ? (
          <View style={styles.stepContainer}>
            <Pressable onPress={() => setQuoteStep('pickService')} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>
            <Text style={styles.stepTitle}>Any additional services?</Text>
            <Text style={styles.stepSubtitle}>Tick any extras you'd like a quote for</Text>

            {[
              { key: 'gutters', label: 'Gutter cleaning / clearing', value: extraGutters, toggle: () => setExtraGutters(!extraGutters) },
              { key: 'conservatory', label: 'Conservatory roof', value: extraConservatory, toggle: () => setExtraConservatory(!extraConservatory) },
              { key: 'solar', label: 'Solar panel cleaning', value: extraSolarPanels, toggle: () => setExtraSolarPanels(!extraSolarPanels) },
            ].map((item) => (
              <Pressable
                key={item.key}
                onPress={item.toggle}
                style={[styles.checkboxRow, item.value && styles.checkboxRowActive]}
              >
                <View style={[styles.checkbox, item.value && styles.checkboxActive]}>
                  {item.value && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>{item.label}</Text>
              </Pressable>
            ))}

            <View style={{ marginBottom: 10 }}>
              <Text style={styles.checkboxLabel}>Anything else?</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Describe any other services you'd like quoted"
                placeholderTextColor="#999"
                value={extraOther}
                onChangeText={setExtraOther}
                multiline
                numberOfLines={3}
              />
            </View>

            <Pressable onPress={() => setQuoteStep('review')} style={styles.continueButton}>
              <Text style={styles.continueButtonText}>Continue</Text>
            </Pressable>
          </View>

        /* STEP: review */
        ) : quoteStep === 'review' && selectedImage && selectedLine ? (
          <View style={styles.stepContainer}>
            <Pressable onPress={() => setQuoteStep('extras')} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>
            <Text style={styles.stepTitle}>Confirm your quote</Text>
            <Text style={styles.stepSubtitle}>Please review your selection</Text>

            <View style={styles.reviewCard}>
              <Image
                source={{ uri: selectedImage.imageUrl }}
                style={styles.reviewImage}
                resizeMode="contain"
              />
              {selectedImage.label && (
                <Text style={styles.reviewLabel}>{selectedImage.label}</Text>
              )}
              <View style={styles.reviewPriceRow}>
                <Text style={styles.reviewFrequency}>
                  {selectedLine.isOneOff ? 'One-off' : `${selectedLine.frequencyWeeks} Weekly`}
                </Text>
                <Text style={styles.reviewPrice}>£{Number(selectedLine.cost).toFixed(2)}</Text>
              </View>
            </View>

            {(extraGutters || extraConservatory || extraSolarPanels || extraOther.trim()) && (
              <View style={styles.reviewExtras}>
                <Text style={styles.reviewExtrasTitle}>Additional services requested</Text>
                {extraGutters && <Text style={styles.reviewExtrasItem}>• Gutter cleaning / clearing</Text>}
                {extraConservatory && <Text style={styles.reviewExtrasItem}>• Conservatory roof</Text>}
                {extraSolarPanels && <Text style={styles.reviewExtrasItem}>• Solar panel cleaning</Text>}
                {extraOther.trim() ? <Text style={styles.reviewExtrasItem}>• {extraOther.trim()}</Text> : null}
              </View>
            )}

            <Text style={styles.disclaimerText}>
              This is a provisional quote. Final pricing may vary after an on-site assessment.
            </Text>

            {quoteError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{quoteError}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.continueButton, quoteSubmitting && styles.buttonDisabled]}
              onPress={handleConfirmQuote}
              disabled={quoteSubmitting}
            >
              {quoteSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.continueButtonText}>Confirm & Submit</Text>
              )}
            </Pressable>
          </View>

        /* STEP: form (default) */
        ) : (
          <View style={styles.stepContainer}>
            <Pressable onPress={handleBackToLanding} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back</Text>
            </Pressable>

            <View style={[styles.formCard, isNarrowWeb && styles.formCardMobile]}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Get a Quote</Text>
                <Text style={styles.formSubtitle}>New customer? Request a free quote</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="Your full name" value={quoteName} onChangeText={(t) => { setQuoteName(t); setQuoteError(''); }} autoComplete="name" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Contact Number <Text style={styles.required}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="Your phone number" value={quotePhone} onChangeText={(t) => { setQuotePhone(t); setQuoteError(''); }} keyboardType="phone-pad" autoComplete="tel" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Address <Text style={styles.required}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="First line of address" value={quoteAddress} onChangeText={(t) => { setQuoteAddress(t); setQuoteError(''); }} autoComplete="street-address" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Town <Text style={styles.required}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="Town or city" value={quoteTown} onChangeText={(t) => { setQuoteTown(t); setQuoteError(''); }} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Postcode <Text style={styles.required}>*</Text></Text>
                  <TextInput style={styles.input} placeholder="Postcode" value={quotePostcode} onChangeText={(t) => { setQuotePostcode(t.toUpperCase()); setQuoteError(''); }} autoCapitalize="characters" autoComplete="postal-code" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput style={styles.input} placeholder="Your email (optional)" value={quoteEmail} onChangeText={setQuoteEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Notes</Text>
                  <TextInput style={[styles.input, styles.textArea]} placeholder="Any additional information (optional)" value={quoteNotes} onChangeText={setQuoteNotes} multiline numberOfLines={3} />
                </View>

                {quoteError ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{quoteError}</Text>
                  </View>
                ) : null}

                <Pressable
                  style={[styles.continueButton, quoteSubmitting && styles.buttonDisabled]}
                  onPress={handleQuoteSubmit}
                  disabled={quoteSubmitting}
                >
                  {quoteSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.continueButtonText}>Request Quote</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={portalStyles.footer}>
        <View style={portalStyles.footerContent}>
          <View style={portalStyles.footerSection}>
            <Image
              source={require('../../assets/images/logo_colourInverted.png')}
              style={[portalStyles.footerLogo, isNarrowWeb && portalStyles.footerLogoMobile]}
              resizeMode="contain"
            />
          </View>
          <View style={portalStyles.footerLinks}>
            <View style={portalStyles.footerColumn}>
              <Text style={portalStyles.footerColumnTitle}>Company</Text>
              <Pressable onPress={() => handleNavigation('/about')}>
                <Text style={portalStyles.footerLink}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')}>
                <Text style={portalStyles.footerLink}>Contact</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View style={portalStyles.footerBottom}>
          <Text style={portalStyles.copyright}>© 2025 Guvnor. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mainContent: {
    flex: 1,
    maxWidth: Platform.OS === 'web' ? 800 : ('100%' as any),
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 16,
  },
  heroSection: {
    paddingTop: 32,
    paddingBottom: 16,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: Platform.OS === 'web' ? 36 : 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  heroTitleMobile: { fontSize: 24 },

  // Step container (all steps share this)
  stepContainer: {
    maxWidth: 560,
    width: '100%',
    marginHorizontal: 'auto' as any,
    paddingBottom: 48,
  },

  backLink: { marginBottom: 16 },
  backLinkText: { fontSize: 15, color: '#10b981', fontWeight: '500' },

  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },

  // Image grid - full width images that don't clip
  imageGrid: {
    gap: 16,
  },
  imageCard: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  imageCardMobile: {
    borderRadius: 10,
  },
  imageCardPressed: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  propertyImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: '#f3f4f6',
  },

  // Selected property image on pickService step
  selectedPropertyImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#f3f4f6',
  },

  // Service options
  serviceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  serviceOptionPressed: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  serviceOptionLabel: { fontSize: 16, fontWeight: '600', color: '#333' },
  serviceOptionPrice: { fontSize: 18, fontWeight: '700', color: '#10b981' },

  // Checkboxes
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  checkboxRowActive: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxActive: {
    borderColor: '#10b981',
    backgroundColor: '#10b981',
  },
  checkboxTick: { color: '#fff', fontWeight: '700', fontSize: 14 },
  checkboxLabel: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 6 },

  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#333',
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Review
  reviewCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reviewImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f3f4f6',
  },
  reviewLabel: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
  reviewPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  reviewFrequency: { fontSize: 16, fontWeight: '600', color: '#333' },
  reviewPrice: { fontSize: 20, fontWeight: '700', color: '#10b981' },

  reviewExtras: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reviewExtrasTitle: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', marginBottom: 8 },
  reviewExtrasItem: { fontSize: 14, color: '#333', marginBottom: 4 },

  disclaimerText: { fontSize: 13, color: '#666', marginBottom: 16, textAlign: 'center' },

  // Success
  successContainer: { alignItems: 'center', paddingVertical: 48 },
  successIcon: { fontSize: 48, color: '#10b981', marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: 'bold', color: '#065f46', marginBottom: 8 },
  successText: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 24, maxWidth: 400 },
  anotherButton: { paddingVertical: 12, paddingHorizontal: 24 },
  anotherButtonText: { fontSize: 14, color: '#10b981', textDecorationLine: 'underline' },

  // Form card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    ...Platform.select({
      web: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 25, borderWidth: 1, borderColor: '#10b981', borderTopWidth: 4 },
      default: { elevation: 8, borderWidth: 1, borderColor: '#10b981', borderTopWidth: 4 },
    }),
  },
  formCardMobile: { padding: 20 },

  formHeader: { alignItems: 'center', marginBottom: 32 },
  formTitle: { fontSize: 24, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 8 },
  formSubtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center' },

  form: { gap: 24 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  required: { color: '#dc2626' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 16, fontSize: 16, backgroundColor: '#fff', color: '#111827' },

  errorContainer: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 12 },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center' },

  continueButton: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.7 },
});
