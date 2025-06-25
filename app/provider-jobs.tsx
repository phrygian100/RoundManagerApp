import React, { useEffect } from 'react';
import { ActivityIndicator, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { useProviderJobs } from '../hooks/useProviderJobs';

// For testing, use a hardcoded providerId
const TEST_PROVIDER_ID = 'test-provider-1';

export default function ProviderJobsScreen() {
  const { jobs, loading, fetchJobs, setJobStatus } = useProviderJobs();

  useEffect(() => {
    fetchJobs(TEST_PROVIDER_ID);
  }, []);

  const handleSetCompleted = (jobId: string) => {
    setJobStatus(jobId, 'completed');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Jobs</Text>
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.jobItem}>
            <Text style={styles.jobTitle}>{item.serviceId}</Text>
            <Text>Client: {item.clientId}</Text>
            <Text>Scheduled: {item.scheduledTime}</Text>
            <Text>Status: {item.status}</Text>
            {item.status !== 'completed' && (
              <Button title="Mark as Completed" onPress={() => handleSetCompleted(item.id)} />
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No jobs found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  jobItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  jobTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  empty: { textAlign: 'center', marginTop: 50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
}); 