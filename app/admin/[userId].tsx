import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { useThemeColor } from '../../hooks/useThemeColor';
import {
  AdminClientSummary,
  AdminJobSummary,
  AdminUserDetail,
  getUserDetail,
} from '../../services/adminService';

export default function AdminUserDetailScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clients' | 'runsheet'>('clients');

  const cardBg = useThemeColor({}, 'card');
  const cardBorder = useThemeColor({}, 'cardBorder');
  const secondaryText = useThemeColor({}, 'secondaryText');
  const textColor = useThemeColor({}, 'text');
  const dividerColor = useThemeColor({}, 'divider');

  useEffect(() => {
    if (userId) loadDetail();
  }, [userId]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getUserDetail(userId!);
      setData(result);
    } catch (err: any) {
      console.error('Failed to load user detail:', err);
      setError(err.message || 'Failed to load user detail');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#34C759';
      case 'completed':
        return '#34C759';
      case 'ex-client':
        return '#FF3B30';
      case 'pending':
      case 'scheduled':
        return '#FF9500';
      default:
        return '#8E8E93';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'premium':
        return '#34C759';
      case 'exempt':
        return '#AF52DE';
      default:
        return '#8E8E93';
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={{ marginTop: 12 }}>Loading user...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || !data) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <ThemedText style={styles.title}>User Detail</ThemedText>
        </View>
        <View style={styles.center}>
          <ThemedText style={styles.errorText}>
            {error || 'User not found'}
          </ThemedText>
          <TouchableOpacity onPress={loadDetail} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const { profile, clients, jobSummary, recentJobs } = data;

  const activeClients = clients.filter((c) => c.status !== 'ex-client');
  const exClients = clients.filter((c) => c.status === 'ex-client');

  const renderClientCard = (client: AdminClientSummary) => (
    <View
      key={client.id}
      style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
    >
      <View style={styles.clientRow}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.clientName}>{client.name}</ThemedText>
          {client.accountNumber ? (
            <Text style={[styles.clientMeta, { color: secondaryText }]}>
              {client.accountNumber}
            </Text>
          ) : null}
          {(client.address1 || client.town) ? (
            <Text style={[styles.clientMeta, { color: secondaryText }]}>
              {[client.address1, client.town, client.postcode]
                .filter(Boolean)
                .join(', ')}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(client.status) + '20' },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: getStatusColor(client.status) },
            ]}
          >
            {client.status}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderJobRow = (job: AdminJobSummary) => (
    <View
      key={job.id}
      style={[styles.jobRow, { borderBottomColor: dividerColor }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.jobClient, { color: textColor }]}>
          {job.clientName || 'Unknown client'}
        </Text>
        <Text style={[styles.jobMeta, { color: secondaryText }]}>
          {job.serviceId || 'Service'} &middot; {formatDate(job.scheduledTime)}
        </Text>
      </View>
      <View style={styles.jobRight}>
        {job.price > 0 && (
          <Text style={[styles.jobPrice, { color: textColor }]}>
            £{job.price.toFixed(2)}
          </Text>
        )}
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(job.status) + '20' },
          ]}
        >
          <Text
            style={[styles.statusText, { color: getStatusColor(job.status) }]}
          >
            {job.status}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <ThemedText style={styles.title} numberOfLines={1}>
          {profile.name || 'Unnamed User'}
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <View style={styles.profileRow}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitial}>
                {(profile.name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.profileName}>
                {profile.name || 'Unnamed'}
              </ThemedText>
              <Text style={[styles.profileEmail, { color: secondaryText }]}>
                {profile.email}
              </Text>
              {profile.businessName ? (
                <Text style={[styles.profileBusiness, { color: secondaryText }]}>
                  {profile.businessName}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.tierBadge,
                { backgroundColor: getTierColor(profile.subscriptionTier) },
              ]}
            >
              <Text style={styles.tierText}>{profile.subscriptionTier}</Text>
            </View>
          </View>

          <View style={[styles.profileStats, { borderTopColor: dividerColor }]}>
            <View style={styles.profileStat}>
              <Text style={[styles.profileStatValue, { color: textColor }]}>
                {profile.numberOfClients ?? clients.length}
              </Text>
              <Text style={[styles.profileStatLabel, { color: secondaryText }]}>
                Clients
              </Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={[styles.profileStatValue, { color: textColor }]}>
                {jobSummary.total}
              </Text>
              <Text style={[styles.profileStatLabel, { color: secondaryText }]}>
                Jobs
              </Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={[styles.profileStatValue, { color: textColor }]}>
                {formatDate(profile.createdAt)}
              </Text>
              <Text style={[styles.profileStatLabel, { color: secondaryText }]}>
                Joined
              </Text>
            </View>
          </View>

          {(profile.phone || profile.address1) ? (
            <View style={[styles.profileExtra, { borderTopColor: dividerColor }]}>
              {profile.phone ? (
                <Text style={[styles.profileExtraLine, { color: secondaryText }]}>
                  <Ionicons name="call-outline" size={13} color={secondaryText} />{' '}
                  {profile.phone}
                </Text>
              ) : null}
              {(profile.address1 || profile.town) ? (
                <Text style={[styles.profileExtraLine, { color: secondaryText }]}>
                  <Ionicons name="location-outline" size={13} color={secondaryText} />{' '}
                  {[profile.address1, profile.town, profile.postcode]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'clients' && styles.tabActive]}
            onPress={() => setActiveTab('clients')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'clients' && styles.tabTextActive,
              ]}
            >
              Clients ({clients.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'runsheet' && styles.tabActive]}
            onPress={() => setActiveTab('runsheet')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'runsheet' && styles.tabTextActive,
              ]}
            >
              Runsheet ({jobSummary.total})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'clients' ? (
          <View>
            {activeClients.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: secondaryText }]}>
                  Active ({activeClients.length})
                </Text>
                {activeClients.map(renderClientCard)}
              </>
            )}
            {exClients.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: secondaryText }]}>
                  Ex-Clients ({exClients.length})
                </Text>
                {exClients.map(renderClientCard)}
              </>
            )}
            {clients.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={secondaryText} />
                <ThemedText style={{ marginTop: 8 }}>No clients</ThemedText>
              </View>
            )}
          </View>
        ) : (
          <View>
            {/* Job summary stats */}
            <View style={styles.jobStatsRow}>
              <View
                style={[
                  styles.jobStatCard,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
              >
                <Text style={[styles.jobStatValue, { color: '#007AFF' }]}>
                  {jobSummary.total}
                </Text>
                <Text style={[styles.jobStatLabel, { color: secondaryText }]}>
                  Total
                </Text>
              </View>
              <View
                style={[
                  styles.jobStatCard,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
              >
                <Text style={[styles.jobStatValue, { color: '#34C759' }]}>
                  {jobSummary.completed}
                </Text>
                <Text style={[styles.jobStatLabel, { color: secondaryText }]}>
                  Completed
                </Text>
              </View>
              <View
                style={[
                  styles.jobStatCard,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
              >
                <Text style={[styles.jobStatValue, { color: '#FF9500' }]}>
                  {jobSummary.pending}
                </Text>
                <Text style={[styles.jobStatLabel, { color: secondaryText }]}>
                  Pending
                </Text>
              </View>
            </View>

            {/* Recent jobs */}
            <Text style={[styles.sectionLabel, { color: secondaryText }]}>
              Recent Jobs
            </Text>
            {recentJobs.length > 0 ? (
              <View
                style={[
                  styles.jobsCard,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
              >
                {recentJobs.map(renderJobRow)}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="document-text-outline"
                  size={40}
                  color={secondaryText}
                />
                <ThemedText style={{ marginTop: 8 }}>No jobs</ThemedText>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'web' ? 16 : 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  errorText: {
    color: '#FF3B30',
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Profile card
  profileCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 17,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  profileBusiness: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 1,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  tierText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  profileStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  profileStat: {
    flex: 1,
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  profileStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  profileExtra: {
    borderTopWidth: 1,
    padding: 14,
    gap: 4,
  },
  profileExtraLine: {
    fontSize: 13,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  tabTextActive: {
    color: '#fff',
  },

  // Clients
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
  },
  clientMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // Jobs / Runsheet
  jobStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  jobStatCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  jobStatValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  jobStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  jobsCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  jobClient: {
    fontSize: 14,
    fontWeight: '500',
  },
  jobMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  jobRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  jobPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
});
