import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { db, storage } from '../core/firebase';
import { getUserSession } from '../core/session';
import { getUserProfile } from '../services/userService';
import { BusinessType, WINDOW_QUOTE_PRESETS } from '../shared/constants/businessTypes';

// First-login quote pricing questionnaire. New owner accounts are routed here
// from the dashboard until they finish or skip (users/{uid}.quoteSetupComplete).
//
// Window cleaning: price the preset property images; priced copies are uploaded
// into the user's own storage and saved as a standard quoteWizards doc, so the
// microsite quote wizard works from day one and stays fully editable in
// /quote-wizard afterwards.
//
// Bin cleaning: no images (every wheelie bin looks the same) - just per-bin
// prices, stored as users/{uid}.binPricing for the microsite's instant quote.

type PresetPrices = { four: string; eight: string; oneOff: string };

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function QuoteSetupScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [businessType, setBusinessType] = useState<BusinessType>('window-cleaning');

  // Window variant state: prices per preset key
  const [prices, setPrices] = useState<Record<string, PresetPrices>>({});

  // Bin variant state
  const [perBin, setPerBin] = useState('');
  const [oneOffPerBin, setOneOffPerBin] = useState('');

  const isNarrow = Platform.OS !== 'web' || (typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    (async () => {
      try {
        const session = await getUserSession();
        if (!session?.uid || !session.isOwner) {
          router.replace('/');
          return;
        }
        setUid(session.uid);
        const profile = await getUserProfile(session.uid);
        if (!profile || (profile as any).quoteSetupComplete || !(profile as any).businessType) {
          router.replace('/');
          return;
        }
        setBusinessType((profile as any).businessType);
      } catch (e) {
        console.error('Failed to load quote setup:', e);
        router.replace('/');
        return;
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(msg);
    } else {
      Alert.alert(title, msg);
    }
  };

  const setPrice = (key: string, field: keyof PresetPrices, value: string) => {
    setPrices((prev) => ({
      ...prev,
      [key]: { four: '', eight: '', oneOff: '', ...prev[key], [field]: value },
    }));
  };

  const markComplete = async (extra: Record<string, any> = {}) => {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { quoteSetupComplete: true, ...extra });
  };

  const handleSkip = async () => {
    try {
      setSaving(true);
      await markComplete();
      router.replace('/');
    } catch (e) {
      console.error('Skip failed:', e);
      setSaving(false);
    }
  };

  // Read a bundled preset image as a data URL for upload into the user's storage.
  const presetToDataUrl = async (source: any): Promise<string> => {
    const asset = Asset.fromModule(source);
    await asset.downloadAsync();
    if (Platform.OS === 'web') {
      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    const b64 = await FileSystem.readAsStringAsync(asset.localUri || asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${b64}`;
  };

  const handleFinishWindow = async () => {
    if (!uid) return;
    const priced = WINDOW_QUOTE_PRESETS.filter((p) => {
      const v = prices[p.key];
      return v && (parseFloat(v.four) > 0 || parseFloat(v.eight) > 0 || parseFloat(v.oneOff) > 0);
    });
    if (priced.length === 0) {
      showAlert('No prices yet', 'Enter a price for at least one property type, or tap "I\'ll do this later".');
      return;
    }

    setSaving(true);
    try {
      const items = [];
      for (const preset of priced) {
        const v = prices[preset.key];
        const itemId = genId();
        const storagePath = `quoteWizards/${uid}/presets/${itemId}.jpg`;
        const dataUrl = await presetToDataUrl(preset.source);
        const storageRef = ref(storage, storagePath);
        await uploadString(storageRef, dataUrl, 'data_url');
        const imageUrl = await getDownloadURL(storageRef);

        const pricingLines = [];
        if (parseFloat(v.four) > 0) {
          pricingLines.push({ id: genId(), isOneOff: false, frequencyWeeks: 4, cost: parseFloat(v.four) });
        }
        if (parseFloat(v.eight) > 0) {
          pricingLines.push({ id: genId(), isOneOff: false, frequencyWeeks: 8, cost: parseFloat(v.eight) });
        }
        if (parseFloat(v.oneOff) > 0) {
          pricingLines.push({ id: genId(), isOneOff: true, frequencyWeeks: null, cost: parseFloat(v.oneOff) });
        }

        items.push({ id: itemId, storagePath, imageUrl, pricingLines });
      }

      const now = new Date().toISOString();
      await addDoc(collection(db, 'quoteWizards'), {
        ownerId: uid,
        accountId: uid,
        customerName: '',
        items,
        createdAt: now,
        updatedAt: now,
      });
      await markComplete();
      showAlert('All set', 'Your quote wizard is live on your microsite. You can fine-tune it any time from Quote Wizard.');
      router.replace('/');
    } catch (e) {
      console.error('Quote setup save failed:', e);
      showAlert('Error', 'Could not save your pricing. Please try again.');
      setSaving(false);
    }
  };

  const handleFinishBin = async () => {
    if (!uid) return;
    const per = parseFloat(perBin);
    if (!per || per <= 0) {
      showAlert('Price needed', 'Enter your regular price per bin, or tap "I\'ll do this later".');
      return;
    }
    setSaving(true);
    try {
      const binPricing: Record<string, number> = { perBin: per };
      const oneOff = parseFloat(oneOffPerBin);
      if (oneOff > 0) binPricing.oneOffPerBin = oneOff;
      await markComplete({ binPricing });
      showAlert('All set', 'Your per-bin pricing is live on your microsite quote page. You can change it any time in Settings.');
      router.replace('/');
    } catch (e) {
      console.error('Quote setup save failed:', e);
      showAlert('Error', 'Could not save your pricing. Please try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={[styles.main, isNarrow && styles.mainMobile]}>
        <Text style={styles.title}>
          {businessType === 'bin-cleaning' ? 'Set your bin cleaning prices' : 'Set your window cleaning prices'}
        </Text>
        <Text style={styles.subtitle}>
          {businessType === 'bin-cleaning'
            ? 'New customers visiting your quote page will get an instant estimate from these prices. Takes 30 seconds.'
            : 'New customers visiting your quote page pick the property that looks like theirs and see your price instantly. Price the ones you want to quote for - you can skip any.'}
        </Text>

        {businessType === 'bin-cleaning' ? (
          <View style={styles.binCard}>
            <Text style={styles.binIcon}>🗑️</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Regular clean, price per bin (£)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5"
                placeholderTextColor="#9ca3af"
                value={perBin}
                onChangeText={setPerBin}
                keyboardType="decimal-pad"
              />
              <Text style={styles.hint}>What you charge to clean one bin on a regular visit.</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>One-off clean, price per bin (£, optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 8"
                placeholderTextColor="#9ca3af"
                value={oneOffPerBin}
                onChangeText={setOneOffPerBin}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        ) : (
          WINDOW_QUOTE_PRESETS.map((preset, idx) => {
            const v = prices[preset.key] || { four: '', eight: '', oneOff: '' };
            return (
              <View key={preset.key} style={styles.presetCard}>
                <Image source={preset.source} style={styles.presetImage} resizeMode="contain" />
                <Text style={styles.presetLabel}>Property type {idx + 1}</Text>
                <View style={styles.priceRow}>
                  {([
                    { field: 'four' as const, label: '4 weekly' },
                    { field: 'eight' as const, label: '8 weekly' },
                    { field: 'oneOff' as const, label: 'One-off' },
                  ]).map(({ field, label }) => (
                    <View key={field} style={styles.priceCol}>
                      <Text style={styles.priceLabel}>{label}</Text>
                      <TextInput
                        style={styles.priceInput}
                        placeholder="£"
                        placeholderTextColor="#9ca3af"
                        value={v[field]}
                        onChangeText={(t) => setPrice(preset.key, field, t)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}

        <Pressable
          style={[styles.finishButton, saving && styles.buttonDisabled]}
          onPress={businessType === 'bin-cleaning' ? handleFinishBin : handleFinishWindow}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.finishButtonText}>Save my prices</Text>
          )}
        </Pressable>

        <Pressable onPress={handleSkip} disabled={saving} style={styles.skipButton}>
          <Text style={styles.skipButtonText}>I&apos;ll do this later</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  page: { flex: 1, backgroundColor: '#f9fafb' },
  pageContent: { flexGrow: 1, paddingVertical: 32 },

  main: {
    width: '100%',
    maxWidth: 640,
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 20,
  },
  mainMobile: { paddingHorizontal: 14 },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },

  presetCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 16,
  },
  presetImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    maxHeight: 340,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    marginBottom: 10,
  },
  presetLabel: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 10, textAlign: 'center' },
  priceRow: { flexDirection: 'row', gap: 10 },
  priceCol: { flex: 1 },
  priceLabel: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4, textAlign: 'center' },
  priceInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
    textAlign: 'center',
  },

  binCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    marginBottom: 16,
    alignItems: 'stretch',
  },
  binIcon: { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
  },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },

  finishButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  finishButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.7 },

  skipButton: { alignItems: 'center', paddingVertical: 16, marginBottom: 24 },
  skipButtonText: { fontSize: 14, color: '#6b7280', textDecorationLine: 'underline' },
});
