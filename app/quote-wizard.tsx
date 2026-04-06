import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadString,
} from 'firebase/storage';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db, storage } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

// ─── Types ──────────────────────────────────────────────

interface PricingLine {
  id: string;
  isOneOff: boolean;
  frequencyWeeks: string;
  cost: string;
}

interface QuoteWizardItem {
  id: string;
  storagePath: string;
  imageUrl: string;
  pricingLines: PricingLine[];
}

interface QuoteWizard {
  id: string;
  ownerId: string;
  accountId: string;
  customerName: string;
  items: QuoteWizardItem[];
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'list' | 'edit';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Component ──────────────────────────────────────────

export default function QuoteWizardScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quotes, setQuotes] = useState<QuoteWizard[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<QuoteWizardItem[]>([]);

  // ─── Load quotes ────────────────────────────────────

  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const id = await getDataOwnerId();
      if (!id) return;
      setOwnerId(id);
      const q = query(
        collection(db, 'quoteWizards'),
        where('ownerId', '==', id)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as QuoteWizard)
      );
      data.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setQuotes(data);
    } catch (err) {
      console.error('Failed to load quote wizards', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  // ─── New / Open ─────────────────────────────────────

  const openNew = () => {
    setEditId(null);
    setCustomerName('');
    setItems([]);
    setMode('edit');
  };

  const openExisting = (q: QuoteWizard) => {
    setEditId(q.id);
    setCustomerName(q.customerName);
    setItems(
      (q.items || []).map((it: any) => ({
        ...it,
        pricingLines: it.pricingLines || migrateOldItem(it),
      }))
    );
    setMode('edit');
  };

  function migrateOldItem(it: any): PricingLine[] {
    const lines: PricingLine[] = [];
    if (it.recurringCost && it.frequencyWeeks) {
      lines.push({
        id: genId(),
        isOneOff: false,
        frequencyWeeks: String(it.frequencyWeeks),
        cost: String(it.recurringCost),
      });
    }
    if (it.isOneOff && it.oneOffCost) {
      lines.push({
        id: genId(),
        isOneOff: true,
        frequencyWeeks: '',
        cost: String(it.oneOffCost),
      });
    }
    if (lines.length === 0) {
      lines.push({ id: genId(), isOneOff: false, frequencyWeeks: '', cost: '' });
    }
    return lines;
  }

  // ─── Image picking ──────────────────────────────────

  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Camera roll permission is required to upload images.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploading(true);
      const newItems: QuoteWizardItem[] = [];

      for (const asset of result.assets) {
        const itemId = genId();
        const mimeType = asset.mimeType || 'image/jpeg';
        const ext = mimeType.split('/')[1] || 'jpg';
        const storagePath = `quoteWizards/${ownerId}/${editId || 'draft'}/${itemId}.${ext}`;
        const storageRef = ref(storage, storagePath);

        const dataUrl = `data:${mimeType};base64,${asset.base64}`;
        await uploadString(storageRef, dataUrl, 'data_url');
        const imageUrl = await getDownloadURL(storageRef);

        newItems.push({
          id: itemId,
          storagePath,
          imageUrl,
          pricingLines: [{ id: genId(), isOneOff: false, frequencyWeeks: '', cost: '' }],
        });
      }

      setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error('Image pick/upload failed', err);
      Alert.alert('Upload failed', 'Could not upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Camera permission is required to take photos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploading(true);
      const asset = result.assets[0];
      const itemId = genId();
      const mimeType = asset.mimeType || 'image/jpeg';
      const ext = mimeType.split('/')[1] || 'jpg';
      const storagePath = `quoteWizards/${ownerId}/${editId || 'draft'}/${itemId}.${ext}`;
      const storageRef = ref(storage, storagePath);

      const dataUrl = `data:${mimeType};base64,${asset.base64}`;
      await uploadString(storageRef, dataUrl, 'data_url');
      const imageUrl = await getDownloadURL(storageRef);

      setItems((prev) => [
        ...prev,
        {
          id: itemId,
          storagePath,
          imageUrl,
          pricingLines: [{ id: genId(), isOneOff: false, frequencyWeeks: '', cost: '' }],
        },
      ]);
    } catch (err) {
      console.error('Camera capture/upload failed', err);
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ─── Item updates ───────────────────────────────────

  const updateItem = (id: string, updates: Partial<QuoteWizardItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const removeItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item?.storagePath) {
      try {
        await deleteObject(ref(storage, item.storagePath));
      } catch (_) {
        // Storage deletion is best-effort
      }
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // ─── Save ───────────────────────────────────────────

  const handleSave = async () => {
    if (!customerName.trim()) {
      Alert.alert('Missing info', 'Please enter a type/description.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('No items', 'Please add at least one image to the quote.');
      return;
    }

    try {
      setSaving(true);
      const id = ownerId || (await getDataOwnerId());
      if (!id) {
        Alert.alert('Error', 'Could not determine account. Please try again.');
        return;
      }

      const now = new Date().toISOString();
      const payload = {
        ownerId: id,
        accountId: id,
        customerName: customerName.trim(),
        items: items.map((it) => ({
          id: it.id,
          storagePath: it.storagePath,
          imageUrl: it.imageUrl,
          pricingLines: it.pricingLines.map((ln) => ({
            id: ln.id,
            isOneOff: ln.isOneOff,
            frequencyWeeks: !ln.isOneOff && ln.frequencyWeeks ? parseInt(ln.frequencyWeeks, 10) : null,
            cost: ln.cost ? parseFloat(ln.cost) || 0 : null,
          })),
        })),
        updatedAt: now,
      };

      if (editId) {
        await updateDoc(doc(db, 'quoteWizards', editId), payload);
      } else {
        await addDoc(collection(db, 'quoteWizards'), {
          ...payload,
          createdAt: now,
        });
      }

      await loadQuotes();
      setMode('list');
    } catch (err) {
      console.error('Save failed', err);
      Alert.alert('Save failed', 'Could not save quote. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete entire quote ────────────────────────────

  const handleDelete = async () => {
    if (!editId) {
      setMode('list');
      return;
    }

    const doDelete = async () => {
      try {
        setSaving(true);
        for (const item of items) {
          if (item.storagePath) {
            try {
              await deleteObject(ref(storage, item.storagePath));
            } catch (_) {}
          }
        }
        await deleteDoc(doc(db, 'quoteWizards', editId));
        await loadQuotes();
        setMode('list');
      } catch (err) {
        console.error('Delete failed', err);
        Alert.alert('Delete failed', 'Could not delete quote.');
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Delete this quote and all its images? This cannot be undone.')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Delete Quote',
        'Delete this quote and all its images? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // ─── Summary helpers ────────────────────────────────

  const addPricingLine = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              pricingLines: [
                ...it.pricingLines,
                { id: genId(), isOneOff: false, frequencyWeeks: '', cost: '' },
              ],
            }
          : it
      )
    );
  };

  const updatePricingLine = (
    itemId: string,
    lineId: string,
    updates: Partial<PricingLine>
  ) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              pricingLines: it.pricingLines.map((ln) =>
                ln.id === lineId ? { ...ln, ...updates } : ln
              ),
            }
          : it
      )
    );
  };

  const removePricingLine = (itemId: string, lineId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, pricingLines: it.pricingLines.filter((ln) => ln.id !== lineId) }
          : it
      )
    );
  };

  const getLineTotals = (lines: PricingLine[]) => {
    let recurring = 0;
    let oneOff = 0;
    for (const ln of lines) {
      const v = parseFloat(ln.cost as any) || 0;
      if (!v) continue;
      if (ln.isOneOff) oneOff += v;
      else if (ln.frequencyWeeks) recurring += v;
    }
    return { recurring, oneOff };
  };

  const allLines = items.flatMap((it) => it.pricingLines || []);
  const totalRecurring = allLines.reduce((sum, ln) => {
    if (ln.isOneOff) return sum;
    const v = parseFloat(ln.cost as any) || 0;
    return ln.frequencyWeeks && v ? sum + v : sum;
  }, 0);
  const totalOneOff = allLines.reduce((sum, ln) => {
    if (!ln.isOneOff) return sum;
    return sum + (parseFloat(ln.cost as any) || 0);
  }, 0);

  const getQuoteTotal = (q: QuoteWizard) => {
    let recurring = 0;
    let oneOff = 0;
    for (const it of q.items || []) {
      const lines: any[] = (it as any).pricingLines || [];
      for (const ln of lines) {
        const v = parseFloat(ln.cost) || 0;
        if (!v) continue;
        if (ln.isOneOff) oneOff += v;
        else recurring += v;
      }
      if (lines.length === 0) {
        recurring += parseFloat((it as any).recurringCost) || 0;
        if ((it as any).isOneOff) oneOff += parseFloat((it as any).oneOffCost) || 0;
      }
    }
    return { recurring, oneOff };
  };

  // ─── Frequency picker values ────────────────────────

  const frequencyOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} ${i === 0 ? 'week' : 'weeks'}`,
  }));

  // ─── Render ─────────────────────────────────────────

  if (mode === 'list') {
    return (
      <ThemedView style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Quote Wizard</ThemedText>
          <TouchableOpacity onPress={openNew} style={s.addBtn}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={s.addBtnText}>New</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : quotes.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="images-outline" size={64} color="#ccc" />
            <ThemedText style={s.emptyText}>No quotes yet</ThemedText>
            <ThemedText style={s.emptySubtext}>
              Tap "New" to create an image-based quote for a customer
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            style={s.scrollView}
            contentContainerStyle={s.listContent}
          >
            {quotes.map((q) => {
              const allQuoteLines: any[] = (q.items || []).flatMap(
                (it: any) => it.pricingLines || []
              );
              return (
                <Pressable
                  key={q.id}
                  onPress={() => openExisting(q)}
                  style={({ pressed }) => [
                    s.quoteCard,
                    pressed && s.quoteCardPressed,
                  ]}
                >
                  {/* Thumbnail strip */}
                  {q.items?.length > 0 && (
                    <View style={s.thumbnailStrip}>
                      {q.items.slice(0, 4).map((it) => (
                        <Image
                          key={it.id}
                          source={{ uri: it.imageUrl }}
                          style={s.thumbnail}
                        />
                      ))}
                      {q.items.length > 4 && (
                        <View style={s.thumbnailMore}>
                          <Text style={s.thumbnailMoreText}>
                            +{q.items.length - 4}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                  <View style={s.quoteCardBody}>
                    <ThemedText style={s.quoteCardName}>
                      {q.customerName}
                    </ThemedText>
                    <View style={s.quoteCardMeta}>
                      {allQuoteLines.map((ln: any) => {
                        const v = parseFloat(ln.cost) || 0;
                        if (!v) return null;
                        if (ln.isOneOff) {
                          return (
                            <Text key={ln.id} style={[s.metaBadge, s.metaBadgeAmber]}>
                              One-off – £{v.toFixed(2)}
                            </Text>
                          );
                        }
                        if (ln.frequencyWeeks) {
                          return (
                            <Text key={ln.id} style={[s.metaBadge, s.metaBadgeBlue]}>
                              {ln.frequencyWeeks} Weekly – £{v.toFixed(2)}
                            </Text>
                          );
                        }
                        return null;
                      })}
                    </View>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#999"
                    style={s.quoteCardChev}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </ThemedView>
    );
  }

  // ─── Edit / Create view ─────────────────────────────

  return (
    <ThemedView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => setMode('list')}
          style={s.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>
          {editId ? 'Edit Quote' : 'New Quote'}
        </ThemedText>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.editContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Quote info */}
        <View style={s.section}>
          <ThemedText style={s.sectionTitle}>Quote Example</ThemedText>
          <View style={s.fieldRow}>
            <ThemedText style={s.fieldLabel}>Type</ThemedText>
            <TextInput
              style={s.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Eg. 2 bed semi"
              placeholderTextColor="#999"
            />
          </View>
        </View>

        {/* Add image buttons */}
        <View style={s.section}>
          <ThemedText style={s.sectionTitle}>Images</ThemedText>
          <View style={s.imageActions}>
            <TouchableOpacity onPress={pickImage} style={s.imageActionBtn}>
              <Ionicons name="images-outline" size={20} color="#fff" />
              <Text style={s.imageActionBtnText}>Gallery</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity onPress={takePhoto} style={s.imageActionBtn}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={s.imageActionBtnText}>Camera</Text>
              </TouchableOpacity>
            )}
          </View>
          {uploading && (
            <View style={s.uploadingBar}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={s.uploadingText}>Uploading...</Text>
            </View>
          )}
        </View>

        {/* Items */}
        {items.map((item, index) => (
          <View key={item.id} style={s.itemCard}>
            {/* Image */}
            <View style={s.itemImageRow}>
              <Image
                source={{ uri: item.imageUrl }}
                style={s.itemImage}
                resizeMode="cover"
              />
              <View style={s.itemBadgeRow}>
                <View style={s.itemIndexBadge}>
                  <Text style={s.itemIndexText}>#{index + 1}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeItem(item.id)}
                  style={s.removeBtn}
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Pricing lines */}
            <View style={s.pricingSection}>
              <ThemedText style={s.pricingSectionLabel}>Pricing</ThemedText>
              {item.pricingLines.map((ln, lnIdx) => (
                <View key={ln.id} style={s.pricingLineCard}>
                  <View style={s.pricingLineHeader}>
                    <Text style={s.pricingLineType}>
                      {ln.isOneOff ? 'One-Off' : ln.frequencyWeeks ? `Every ${ln.frequencyWeeks} ${ln.frequencyWeeks === '1' ? 'week' : 'weeks'}` : 'Select frequency'}
                    </Text>
                    {item.pricingLines.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removePricingLine(item.id, ln.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={22} color="#ccc" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={s.pricingRow}>
                    <View style={s.pricingField}>
                      <ThemedText style={s.pricingFieldLabel}>Cost</ThemedText>
                      <View style={s.currencyInputWrap}>
                        <Text style={s.currencySign}>£</Text>
                        <TextInput
                          style={s.currencyInput}
                          value={ln.cost}
                          onChangeText={(v) =>
                            updatePricingLine(item.id, ln.id, { cost: v })
                          }
                          placeholder="0.00"
                          placeholderTextColor="#999"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    <View style={s.pricingField}>
                      <ThemedText style={s.pricingFieldLabel}>
                        Frequency
                      </ThemedText>
                      {Platform.OS === 'web' ? (
                        <select
                          value={ln.isOneOff ? 'one-off' : ln.frequencyWeeks}
                          onChange={(e: any) => {
                            const val = e.target.value;
                            if (val === 'one-off') {
                              updatePricingLine(item.id, ln.id, {
                                isOneOff: true,
                                frequencyWeeks: '',
                              });
                            } else {
                              updatePricingLine(item.id, ln.id, {
                                isOneOff: false,
                                frequencyWeeks: val,
                              });
                            }
                          }}
                          style={{
                            height: 42,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#ddd',
                            paddingLeft: 10,
                            paddingRight: 10,
                            fontSize: 15,
                            backgroundColor: '#fff',
                            color: '#333',
                            width: '100%',
                          } as any}
                        >
                          <option value="">Select</option>
                          {frequencyOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                          <option value="one-off">One-Off</option>
                        </select>
                      ) : (
                        <View style={s.freqPickerNative}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                          >
                            {frequencyOptions.map((opt) => (
                              <TouchableOpacity
                                key={opt.value}
                                onPress={() =>
                                  updatePricingLine(item.id, ln.id, {
                                    isOneOff: false,
                                    frequencyWeeks: opt.value,
                                  })
                                }
                                style={[
                                  s.freqChip,
                                  !ln.isOneOff &&
                                    ln.frequencyWeeks === opt.value &&
                                    s.freqChipSelected,
                                ]}
                              >
                                <Text
                                  style={[
                                    s.freqChipText,
                                    !ln.isOneOff &&
                                      ln.frequencyWeeks === opt.value &&
                                      s.freqChipTextSelected,
                                  ]}
                                >
                                  {opt.value}w
                                </Text>
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                              onPress={() =>
                                updatePricingLine(item.id, ln.id, {
                                  isOneOff: true,
                                  frequencyWeeks: '',
                                })
                              }
                              style={[
                                s.freqChip,
                                ln.isOneOff && s.freqChipSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  s.freqChipText,
                                  ln.isOneOff && s.freqChipTextSelected,
                                ]}
                              >
                                1-Off
                              </Text>
                            </TouchableOpacity>
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => addPricingLine(item.id)}
                style={s.addLineBtn}
              >
                <Ionicons name="add-circle-outline" size={18} color="#007AFF" />
                <Text style={s.addLineBtnText}>Add pricing line</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Summary */}
        {allLines.some((ln) => (parseFloat(ln.cost as any) || 0) > 0) && (
          <View style={s.summaryCard}>
            <ThemedText style={s.summaryTitle}>Quote Summary</ThemedText>
            {allLines.map((ln) => {
              const v = parseFloat(ln.cost as any) || 0;
              if (!v) return null;
              if (ln.isOneOff) {
                return (
                  <View key={ln.id} style={s.summaryRow}>
                    <Text style={s.summaryItemLabel}>One-off</Text>
                    <Text style={s.summaryTotalValue}>£{v.toFixed(2)}</Text>
                  </View>
                );
              }
              if (ln.frequencyWeeks) {
                return (
                  <View key={ln.id} style={s.summaryRow}>
                    <Text style={s.summaryItemLabel}>
                      {ln.frequencyWeeks} Weekly
                    </Text>
                    <Text style={s.summaryTotalValue}>£{v.toFixed(2)}</Text>
                  </View>
                );
              }
              return null;
            })}
          </View>
        )}

        {/* Delete button (only for existing quotes) */}
        {editId && (
          <TouchableOpacity
            onPress={handleDelete}
            style={s.deleteBtn}
            disabled={saving}
          >
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            <Text style={s.deleteBtnText}>Delete Quote</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ──────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#007AFF',
    paddingTop: Platform.OS === 'ios' ? 54 : 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    padding: 6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
  },
  saveBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Shared
  scrollView: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#999', marginTop: 6, textAlign: 'center' },

  // List view
  listContent: { padding: 16 },
  quoteCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    overflow: 'hidden',
    alignItems: 'center',
  },
  quoteCardPressed: { backgroundColor: '#f3f4f6' },
  thumbnailStrip: {
    width: 80,
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  thumbnail: {
    width: 40,
    height: 40,
  },
  thumbnailMore: {
    width: 40,
    height: 40,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailMoreText: { fontSize: 11, fontWeight: '600', color: '#666' },
  quoteCardBody: { flex: 1, padding: 12 },
  quoteCardName: { fontSize: 16, fontWeight: '700' },
  quoteCardAddr: { fontSize: 13, color: '#666', marginTop: 2 },
  quoteCardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metaBadge: {
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#f3f4f6',
    color: '#555',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  metaBadgeBlue: { backgroundColor: '#eff6ff', color: '#3b82f6' },
  metaBadgeAmber: { backgroundColor: '#fffbeb', color: '#d97706' },
  quoteCardChev: { marginRight: 12 },

  // Edit view
  editContent: { padding: 16 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', color: '#555', marginBottom: 12 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    fontSize: 15,
    color: '#333',
  },

  // Image actions
  imageActions: { flexDirection: 'row', gap: 10 },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  imageActionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  uploadingText: { fontSize: 13, color: '#007AFF' },

  // Item card
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    overflow: 'hidden',
  },
  itemImageRow: { position: 'relative' },
  itemImage: { width: '100%', height: 200 },
  itemBadgeRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemIndexBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  itemIndexText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  removeBtn: {
    backgroundColor: '#FF3B30',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pricing sections
  pricingSection: { paddingHorizontal: 16, paddingVertical: 12 },
  pricingSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#555',
    marginBottom: 8,
  },
  pricingRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pricingField: { flex: 1 },
  pricingFieldLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  currencyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  currencySign: { fontSize: 16, color: '#555', fontWeight: '600', marginRight: 4 },
  currencyInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    fontSize: 15,
    color: '#333',
  },

  // Frequency chips (native)
  freqPickerNative: { marginTop: 2 },
  freqChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    marginRight: 6,
  },
  freqChipSelected: { backgroundColor: '#007AFF' },
  freqChipText: { fontSize: 14, fontWeight: '600', color: '#555' },
  freqChipTextSelected: { color: '#fff' },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', textTransform: 'uppercase' },

  // (toggle styles removed — one-off is now in the frequency picker)

  // Summary
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  summaryItemLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  summaryBadges: { flexDirection: 'row', gap: 6 },
  summaryBadgeBlue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  summaryBadgeAmber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d97706',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  summaryTotals: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryTotalLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  summaryTotalValue: { fontSize: 14, fontWeight: '700', color: '#111' },

  // Pricing line card
  pricingLineCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
    marginBottom: 8,
  },
  pricingLineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pricingLineType: { fontSize: 13, fontWeight: '600', color: '#555' },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  addLineBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 10,
    marginTop: 4,
  },
  deleteBtnText: { color: '#FF3B30', fontWeight: '600', fontSize: 15 },
});
