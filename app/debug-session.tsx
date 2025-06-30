import React, { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getUserSession } from '../core/session';
import { getDataOwnerId, supabase } from '../core/supabase';

export default function DebugSessionScreen() {
  const [sessionData, setSessionData] = useState<any>(null);
  const [rawAuth, setRawAuth] = useState<any>(null);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  const loadSessionData = async () => {
    try {
      // Get the processed session
      const session = await getUserSession();
      setSessionData(session);

      // Get raw auth data
      const { data } = await supabase.auth.getSession();
      setRawAuth(data.session?.user);

      // Get data owner ID
      const ownerId = await getDataOwnerId();
      setDataOwnerId(ownerId);
    } catch (err) {
      console.error('Error loading session:', err);
    }
  };

  useEffect(() => {
    loadSessionData();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Debug Session Information</Text>
      
      <Button title="🔄 Refresh Session" onPress={loadSessionData} />
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Processed Session (getUserSession)</Text>
        <Text style={styles.json}>{JSON.stringify(sessionData, null, 2)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Raw Auth User</Text>
        <Text style={styles.json}>{JSON.stringify(rawAuth, null, 2)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Owner ID (getDataOwnerId)</Text>
        <Text style={styles.json}>{dataOwnerId}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Information</Text>
        <Text>Current User ID: {sessionData?.uid}</Text>
        <Text>Account ID: {sessionData?.accountId}</Text>
        <Text>Is Owner: {sessionData?.isOwner ? 'Yes' : 'No'}</Text>
        <Text>Data Owner ID: {dataOwnerId}</Text>
        <Text>Permissions: {JSON.stringify(sessionData?.perms)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  section: { marginBottom: 20, padding: 10, backgroundColor: '#f5f5f5', borderRadius: 8 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  json: { fontSize: 12, fontFamily: 'monospace', backgroundColor: '#fff', padding: 10, borderRadius: 4 },
}); 