import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { db } from '../core/firebase';
import { getUserSession } from '../core/session';
import { DEVELOPER_UID, GUVNOR_LEADS_BUSINESS_NAME } from '../shared/constants/developer';

// Developer-only inbox for leads captured by the public /window-cleaning-quote
// page. These are consumer enquiries not yet associated with any app user;
// the workflow is: call around local window cleaners (Google Maps link),
// onboard one, then hand them the customer.

interface GuvnorLead {
  id: string;
  name: string;
  phone: string;
  address: string;
  town: string;
  postcode: string;
  email?: string | null;
  notes?: string | null;
  selectedFrequency?: string | null;
  status: 'pending' | 'contacted' | 'converted' | 'declined';
  createdAt: string;
  businessName?: string | null;
}

const STATUS_META: Record<GuvnorLead['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'New', color: '#92400e', bg: '#fef3c7' },
  contacted: { label: 'Calling around', color: '#1d4ed8', bg: '#dbeafe' },
  converted: { label: 'Onboarded', color: '#065f46', bg: '#d1fae5' },
  declined: { label: 'Dead', color: '#991b1b', bg: '#fee2e2' },
};

export default function GuvnorLeadsScreen() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [leads, setLeads] = useState<GuvnorLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      const session = await getUserSession();
      if (!session || session.uid !== DEVELOPER_UID) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);

      const q = query(
        collection(db, 'quoteRequests'),
        where('businessId', '==', DEVELOPER_UID),
        orderBy('createdAt', 'desc')
      );
      unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() })) as GuvnorLead[];
        setLeads(data.filter((l) => l.businessName === GUVNOR_LEADS_BUSINESS_NAME));
        setLoading(false);
      }, (error) => {
        console.error('Error loading Guvnor leads:', error);
        setLoading(false);
      });
    };

    init();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const frequencyLabel = (f?: string | null) => {
    if (!f) return null;
    if (f === 'one-off') return 'One-off clean';
    return `Every ${f} weeks`;
  };

  const openMaps = (lead: GuvnorLead) => {
    const q = encodeURIComponent(`window cleaners near ${lead.postcode}, UK`);
    Linking.openURL(`https://www.google.com/maps/search/${q}`);
  };

  const callLead = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  };

  const setStatus = async (lead: GuvnorLead, status: GuvnorLead['status']) => {
    try {
      await updateDoc(doc(db, 'quoteRequests', lead.id), {
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to update lead status:', e);
      const msg = 'Failed to update status. Please try again.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  const handleDelete = async (lead: GuvnorLead) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete the lead for ${lead.name}?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Delete Lead', `Delete the lead for ${lead.name}?`, [
            { text: 'Cancel', onPress: () => resolve(false) },
            { text: 'Delete', onPress: () => resolve(true), style: 'destructive' },
          ]);
        });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'quoteRequests', lead.id));
    } catch (e) {
      console.error('Failed to delete lead:', e);
      const msg = 'Failed to delete lead. Please try again.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.deniedText}>Developer access required.</Text>
      </View>
    );
  }

  const newCount = leads.filter((l) => l.status === 'pending').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Guvnor Leads</Text>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
            <Text style={styles.homeButtonText}>🏠</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Consumer enquiries from guvnor.app/window-cleaning-quote — not yet matched to a user
        </Text>
        {newCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{newCount} new {newCount === 1 ? 'lead' : 'leads'}</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {leads.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyTitle}>No leads yet</Text>
            <Text style={styles.emptyText}>
              When consumers request a quote on the public Guvnor page, they&apos;ll appear here.
            </Text>
          </View>
        ) : (
          leads.map((lead) => {
            const meta = STATUS_META[lead.status] || STATUS_META.pending;
            return (
              <View key={lead.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{lead.name}</Text>
                    <Text style={styles.cardDate}>{formatDate(lead.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Pressable style={styles.infoRow} onPress={() => callLead(lead.phone)}>
                    <Text style={styles.infoIcon}>📞</Text>
                    <Text style={[styles.infoValue, styles.linkText]}>{lead.phone}</Text>
                  </Pressable>
                  {lead.email ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>✉️</Text>
                      <Text style={styles.infoValue}>{lead.email}</Text>
                    </View>
                  ) : null}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>📍</Text>
                    <Text style={styles.infoValue}>
                      {lead.address}, {lead.town}, {lead.postcode}
                    </Text>
                  </View>
                  {frequencyLabel(lead.selectedFrequency) ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>🔁</Text>
                      <Text style={styles.infoValue}>{frequencyLabel(lead.selectedFrequency)}</Text>
                    </View>
                  ) : null}
                  {lead.notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesLabel}>Notes:</Text>
                      <Text style={styles.notesText}>{lead.notes}</Text>
                    </View>
                  ) : null}
                </View>

                <Pressable style={styles.mapsButton} onPress={() => openMaps(lead)}>
                  <Ionicons name="map-outline" size={18} color="#fff" />
                  <Text style={styles.mapsButtonText}>Find window cleaners near {lead.postcode}</Text>
                </Pressable>

                <View style={styles.statusRow}>
                  {(Object.keys(STATUS_META) as GuvnorLead['status'][]).map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setStatus(lead, s)}
                      style={[
                        styles.statusOption,
                        lead.status === s && { backgroundColor: STATUS_META[s].bg, borderColor: STATUS_META[s].color },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusOptionText,
                          lead.status === s && { color: STATUS_META[s].color, fontWeight: '700' },
                        ]}
                      >
                        {STATUS_META[s].label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable style={styles.deleteButton} onPress={() => handleDelete(lead)}>
                  <Text style={styles.deleteButtonText}>Delete Lead</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  deniedText: { fontSize: 16, color: '#6b7280' },

  header: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827' },
  homeButton: { padding: 8, borderRadius: 8, backgroundColor: '#f3f4f6' },
  homeButtonText: { fontSize: 20 },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  pendingBadgeText: { color: '#92400e', fontWeight: '600', fontSize: 14 },

  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32, maxWidth: 720, width: '100%', marginHorizontal: 'auto' as any },

  emptyState: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#374151', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cardName: { fontSize: 18, fontWeight: '600', color: '#111827' },
  cardDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },

  cardBody: { marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  infoIcon: { fontSize: 14, marginRight: 8, width: 20 },
  infoValue: { fontSize: 14, color: '#374151', flex: 1 },
  linkText: { color: '#1d4ed8', textDecorationLine: 'underline' },
  notesBox: { marginTop: 8, padding: 12, backgroundColor: '#f9fafb', borderRadius: 8 },
  notesLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  notesText: { fontSize: 14, color: '#374151' },

  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a73e8',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  mapsButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  statusOption: {
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  statusOptionText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },

  deleteButton: { alignItems: 'center', paddingVertical: 6 },
  deleteButtonText: { color: '#dc2626', fontSize: 13 },
});
