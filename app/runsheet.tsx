import { format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getUserSession } from '../core/session';

export default function RunsheetScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    const checkPermissionsAndRedirect = async () => {
      try {
        console.log('🚀 RUNSHEET: Starting permission check...');
        
        const session = await getUserSession();
        console.log('🚀 RUNSHEET: Session loaded:', session);
        
        if (!session) {
          setError('Not logged in');
          setLoading(false);
          return;
        }

        // OWNER FIRST: Owners should ALWAYS have access
        const isOwner = session.isOwner;
        const hasRunsheetPerm = session.perms?.viewRunsheet;
        const canAccess = isOwner || hasRunsheetPerm;
        
        setDebugInfo(`isOwner: ${isOwner}, hasRunsheetPerm: ${hasRunsheetPerm}, canAccess: ${canAccess}`);
        console.log('🚀 RUNSHEET: Permission check result:', { isOwner, hasRunsheetPerm, canAccess });

        if (canAccess) {
          // Generate current week and redirect
          const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
          const weekParam = format(currentWeek, 'yyyy-MM-dd');
          console.log('🚀 RUNSHEET: Redirecting to week (param):', weekParam);
          
          // Use replace with explicit pathname + params to avoid issues with special characters in the slug
          router.replace({ pathname: '/runsheet/[week]', params: { week: weekParam } });
        } else {
          setError('No permission to view runsheets');
          setLoading(false);
        }
      } catch (err) {
        console.error('🚀 RUNSHEET: Error:', err);
        setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    checkPermissionsAndRedirect();
  }, [router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>🔄 Loading Runsheet...</Text>
        <Text>Checking permissions and redirecting...</Text>
        {debugInfo ? <Text style={styles.debug}>Debug: {debugInfo}</Text> : null}
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>❌ Access Denied</Text>
        <Text>{error}</Text>
        {debugInfo ? <Text style={styles.debug}>Debug: {debugInfo}</Text> : null}
        <TouchableOpacity onPress={() => router.replace('/')} style={styles.button}>
          <Text style={styles.buttonText}>🏠 Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // This should not be reached due to redirect, but just in case
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>🔄 Redirecting to current week...</Text>
      <Text>If you see this message, the redirect may have failed.</Text>
      <TouchableOpacity onPress={() => router.replace('/')} style={styles.button}>
        <Text style={styles.buttonText}>🏠 Go Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  debug: { color: '#666', marginTop: 4 },
  button: { padding: 10, marginTop: 10, backgroundColor: '#007AFF', borderRadius: 4, alignSelf: 'flex-start' },
  buttonText: { color: '#fff', fontSize: 16 },
}); 