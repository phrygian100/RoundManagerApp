import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { useThemeColor } from '../../hooks/useThemeColor';
import { AdminUserSummary, listAllUsers } from '../../services/adminService';

type SortField = 'createdAt' | 'numberOfClients';
type SortDir = 'asc' | 'desc';

export default function AdminUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const cardBg = useThemeColor({}, 'card');
  const cardBorder = useThemeColor({}, 'cardBorder');
  const secondaryText = useThemeColor({}, 'secondaryText');
  const textColor = useThemeColor({}, 'text');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listAllUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'createdAt') {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      cmp = da - db;
    } else {
      cmp = (a.numberOfClients ?? 0) - (b.numberOfClients ?? 0);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

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

  const formatDate = (dateStr: string | null) => {
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

  const renderUser = ({ item }: { item: AdminUserSummary }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
      onPress={() => router.push(`/admin/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardNameRow}>
          <ThemedText style={styles.userName}>
            {item.name || 'Unnamed'}
          </ThemedText>
          <View
            style={[
              styles.tierBadge,
              { backgroundColor: getTierColor(item.subscriptionTier) },
            ]}
          >
            <Text style={styles.tierText}>{item.subscriptionTier}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={secondaryText} />
      </View>

      <Text style={[styles.email, { color: secondaryText }]}>{item.email}</Text>
      {item.businessName ? (
        <Text style={[styles.businessName, { color: secondaryText }]}>
          {item.businessName}
        </Text>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={styles.stat}>
          <Ionicons name="people-outline" size={14} color={secondaryText} />
          <Text style={[styles.statText, { color: textColor }]}>
            {item.numberOfClients ?? 0} clients
          </Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="calendar-outline" size={14} color={secondaryText} />
          <Text style={[styles.statText, { color: textColor }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const SortButton = ({
    field,
    label,
  }: {
    field: SortField;
    label: string;
  }) => {
    const active = sortField === field;
    return (
      <TouchableOpacity
        style={[styles.sortBtn, active && styles.sortBtnActive]}
        onPress={() => toggleSort(field)}
      >
        <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>
          {label}
        </Text>
        {active && (
          <Ionicons
            name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
            size={14}
            color="#fff"
            style={{ marginLeft: 4 }}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <ThemedText style={styles.title}>All Users</ThemedText>
        <TouchableOpacity onPress={loadUsers} style={styles.refreshBtn}>
          <Ionicons
            name="refresh"
            size={22}
            color={loading ? secondaryText : textColor}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: secondaryText }]}>
          Sort by:
        </Text>
        <SortButton field="createdAt" label="Date Joined" />
        <SortButton field="numberOfClients" label="Clients" />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={{ marginTop: 12 }}>Loading users...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity onPress={loadUsers} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sortedUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={[styles.countText, { color: secondaryText }]}>
              {users.length} user{users.length !== 1 ? 's' : ''}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <ThemedText>No users found</ThemedText>
            </View>
          }
        />
      )}
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
  refreshBtn: {
    padding: 4,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  sortLabel: {
    fontSize: 13,
    marginRight: 4,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
  },
  sortBtnActive: {
    backgroundColor: '#007AFF',
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  countText: {
    fontSize: 13,
    marginBottom: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tierText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  email: {
    fontSize: 13,
    marginTop: 4,
  },
  businessName: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
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
});
