import { useRouter } from 'expo-router';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PermissionGate from '../components/PermissionGate';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

interface QuoteRequest {
  id: string;
  name: string;
  phone: string;
  address: string;
  town: string;
  postcode: string;
  email?: string;
  notes?: string;
  status: 'pending' | 'contacted' | 'converted' | 'declined';
  createdAt: string;
  source: string;
}

export default function NewBusinessScreen() {
  const router = useRouter();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: () => void;

    const loadRequests = async () => {
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'quoteRequests'),
        where('businessId', '==', ownerId),
        orderBy('createdAt', 'desc')
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as QuoteRequest[];
        setRequests(data);
        setLoading(false);
      }, (error) => {
        console.error('Error loading quote requests:', error);
        setLoading(false);
      });
    };

    loadRequests();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const handleUpdateStatus = async (requestId: string, newStatus: QuoteRequest['status']) => {
    try {
      await updateDoc(doc(db, 'quoteRequests', requestId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating status:', error);
      const message = 'Failed to update status. Please try again.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Error', message);
      }
    }
  };

  const handleDelete = async (requestId: string) => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm('Are you sure you want to delete this request?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Request',
            'Are you sure you want to delete this request?',
            [
              { text: 'Cancel', onPress: () => resolve(false) },
              { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
            ]
          );
        });

    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'quoteRequests', requestId));
      } catch (error) {
        console.error('Error deleting request:', error);
        const message = 'Failed to delete request. Please try again.';
        if (Platform.OS === 'web') {
          window.alert(message);
        } else {
          Alert.alert('Error', message);
        }
      }
    }
  };

  const getStatusColor = (status: QuoteRequest['status']) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'contacted': return '#3b82f6';
      case 'converted': return '#10b981';
      case 'declined': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: QuoteRequest['status']) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'contacted': return 'Contacted';
      case 'converted': return 'Converted';
      case 'declined': return 'Declined';
      default: return status;
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <PermissionGate perm="viewNewBusiness" fallback={<View style={styles.container}><Text>You don't have permission to view this page.</Text></View>}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>New Business</Text>
            <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
              <Text style={styles.homeButtonText}>🏠</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Quote requests from your client portal
          </Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount} pending</Text>
            </View>
          )}
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No Quote Requests Yet</Text>
              <Text style={styles.emptyText}>
                When prospective customers submit quote requests through your client portal, they'll appear here.
              </Text>
            </View>
          ) : (
            requests.map((request) => (
              <Pressable 
                key={request.id} 
                style={styles.card}
                onPress={() => setExpandedId(expandedId === request.id ? null : request.id)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.cardName}>{request.name}</Text>
                    <Text style={styles.cardDate}>{formatDate(request.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) }]}>
                    <Text style={styles.statusText}>{getStatusLabel(request.status)}</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📞</Text>
                    <Text style={styles.infoValue}>{request.phone}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📍</Text>
                    <Text style={styles.infoValue}>
                      {[request.address, request.town, request.postcode].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  {request.email && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>✉️</Text>
                      <Text style={styles.infoValue}>{request.email}</Text>
                    </View>
                  )}
                </View>

                {expandedId === request.id && (
                  <View style={styles.expandedSection}>
                    {request.notes && (
                      <View style={styles.notesSection}>
                        <Text style={styles.notesLabel}>Notes:</Text>
                        <Text style={styles.notesText}>{request.notes}</Text>
                      </View>
                    )}

                    <View style={styles.actionsSection}>
                      <Text style={styles.actionsLabel}>Update Status:</Text>
                      <View style={styles.statusButtons}>
                        {(['pending', 'contacted', 'converted', 'declined'] as const).map((status) => (
                          <Pressable
                            key={status}
                            style={[
                              styles.statusButton,
                              request.status === status && styles.statusButtonActive,
                              { borderColor: getStatusColor(status) }
                            ]}
                            onPress={() => handleUpdateStatus(request.id, status)}
                          >
                            <Text style={[
                              styles.statusButtonText,
                              request.status === status && { color: '#fff' },
                              { color: request.status === status ? '#fff' : getStatusColor(status) }
                            ]}>
                              {getStatusLabel(status)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    <View style={styles.actionButtons}>
                      <Pressable 
                        style={styles.convertButton}
                        onPress={() => {
                          // Navigate to add client with pre-filled data
                          router.push({
                            pathname: '/add-client',
                            params: {
                              prefillName: request.name,
                              prefillPhone: request.phone,
                              prefillAddress: request.address,
                              prefillTown: request.town,
                              prefillPostcode: request.postcode,
                              prefillEmail: request.email || '',
                              prefillSource: 'Quote Request'
                            }
                          });
                        }}
                      >
                        <Text style={styles.convertButtonText}>Convert to Client</Text>
                      </Pressable>
                      <Pressable 
                        style={styles.deleteButton}
                        onPress={() => handleDelete(request.id)}
                      >
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                <Text style={styles.expandHint}>
                  {expandedId === request.id ? 'Tap to collapse' : 'Tap for actions'}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  homeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  homeButtonText: {
    fontSize: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  pendingBadgeText: {
    color: '#92400e',
    fontWeight: '600',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  cardDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 14,
    marginRight: 8,
    width: 24,
  },
  infoValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  expandedSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  notesSection: {
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#374151',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
  },
  actionsSection: {
    marginBottom: 16,
  },
  actionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  statusButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  convertButton: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  convertButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  deleteButtonText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 14,
  },
  expandHint: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 12,
  },
});

