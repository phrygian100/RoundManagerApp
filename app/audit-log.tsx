import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { getAuditLogs } from '../services/auditService';
import type { AuditLog } from '../types/audit';

const ActionTypeColors: Record<string, string> = {
  client_created: '#28a745',
  client_edited: '#ffc107',
  client_archived: '#6c757d',
  client_round_order_changed: '#17a2b8',
  quote_created: '#007bff',
  quote_edited: '#ffc107',
  quote_progressed: '#28a745',
  quote_deleted: '#dc3545',
  rota_availability_changed: '#6f42c1',
  payment_created: '#28a745',
  payment_edited: '#ffc107',
  payment_deleted: '#dc3545',
  member_permissions_changed: '#fd7e14',
  member_daily_rate_changed: '#fd7e14',
};

const ActionTypeIcons: Record<string, string> = {
  client_created: 'person-add',
  client_edited: 'create',
  client_archived: 'archive',
  client_round_order_changed: 'swap-horizontal',
  quote_created: 'document-text',
  quote_edited: 'create',
  quote_progressed: 'arrow-forward',
  quote_deleted: 'trash',
  rota_availability_changed: 'calendar',
  payment_created: 'card',
  payment_edited: 'create',
  payment_deleted: 'trash',
  member_permissions_changed: 'key',
  member_daily_rate_changed: 'trending-up',
};

export default function AuditLogScreen() {
  const router = useRouter();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const logs = await getAuditLogs(200); // Get latest 200 entries
      setAuditLogs(logs);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAuditLogs();
    setRefreshing(false);
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  // Filter and search logic
  const filteredLogs = auditLogs.filter(log => {
    // Search filter
    const matchesSearch = searchQuery === '' || 
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.entityName && log.entityName.toLowerCase().includes(searchQuery.toLowerCase()));

    // Type filter
    const matchesFilter = selectedFilter === 'all' || 
      log.entityType === selectedFilter ||
      log.actionType.includes(selectedFilter);

    return matchesSearch && matchesFilter;
  });

  const renderAuditLogItem = ({ item }: { item: AuditLog }) => {
    const timestamp = parseISO(item.timestamp);
    const formattedDate = format(timestamp, 'dd/MM/yyyy HH:mm');
    const actionColor = ActionTypeColors[item.actionType] || '#6c757d';
    const actionIcon = ActionTypeIcons[item.actionType] || 'information-circle';

    return (
      <View style={styles.logItem}>
        <View style={styles.logHeader}>
          <View style={styles.iconContainer}>
            <Ionicons 
              name={actionIcon as any} 
              size={16} 
              color={actionColor} 
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.timestamp}>{formattedDate}</Text>
            <Text style={styles.actor}>{item.actorEmail}</Text>
          </View>
        </View>
        <Text style={styles.description}>{item.description}</Text>
        <View style={styles.metadata}>
          <Text style={styles.entityType}>{item.entityType}</Text>
        </View>
      </View>
    );
  };

  const filterOptions = [
    { label: 'All Activities', value: 'all' },
    { label: 'Client Actions', value: 'client' },
    { label: 'Quote Actions', value: 'quote' },
    { label: 'Rota Changes', value: 'rota' },
    { label: 'Payment Actions', value: 'payment' },
    { label: 'Team Changes', value: 'member' },
  ];

  return (
    <ThemedView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </Pressable>
          <ThemedText style={styles.title}>Activity Log</ThemedText>
        </View>

        <View style={styles.controls}>
          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search activities..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Filter Buttons */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
          >
            {filterOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.filterButton,
                  selectedFilter === option.value && styles.filterButtonActive
                ]}
                onPress={() => setSelectedFilter(option.value)}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedFilter === option.value && styles.filterButtonTextActive
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading activity log...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredLogs}
            renderItem={renderAuditLogItem}
            keyExtractor={(item) => item.id}
            style={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Ionicons name="document-text-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>
                  {searchQuery || selectedFilter !== 'all' 
                    ? 'No activities match your search' 
                    : 'No activity logged yet'
                  }
                </Text>
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
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  controls: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#495057',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  list: {
    flex: 1,
  },
  logItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#6c757d',
  },
  actor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  description: {
    fontSize: 16,
    color: '#212529',
    marginBottom: 8,
  },
  metadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entityType: {
    fontSize: 12,
    color: '#6c757d',
    textTransform: 'capitalize',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
  },
}); 