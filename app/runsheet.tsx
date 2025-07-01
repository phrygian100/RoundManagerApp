import { format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { getUserSession } from '../core/session';

// DEPLOYMENT FORCE: 2025-01-07 14:45 - Testing without PermissionGate
// This is a temporary debug version to isolate import issues
export default function RunsheetScreen() {
  const router = useRouter();
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      console.log('🚀 RUNSHEET DEBUG: Starting session check...');
      const session = await getUserSession();
      console.log('🚀 RUNSHEET DEBUG: Session loaded:', session);
      setSessionLoaded(true);
      
      if (session) {
        setIsOwner(session.isOwner);
        setHasPermission(session.isOwner || session.perms?.viewRunsheet);
        console.log('🚀 RUNSHEET DEBUG: isOwner =', session.isOwner);
        console.log('🚀 RUNSHEET DEBUG: hasPermission =', session.isOwner || session.perms?.viewRunsheet);
        
        // If allowed, redirect to current week
        if (session.isOwner || session.perms?.viewRunsheet) {
          const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
          const weekParam = format(currentWeek, 'yyyy-MM-dd');
          console.log('🚀 RUNSHEET DEBUG: Redirecting to week:', weekParam);
          router.replace(`/runsheet/${weekParam}`);
        }
      }
    };
    
    checkSession();
  }, [router]);

  if (!sessionLoaded) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ThemedText>Loading session...</ThemedText>
      </ThemedView>
    );
  }

  if (!hasPermission) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ThemedText>You don't have permission to view runsheets.</ThemedText>
        <ThemedText>Debug: isOwner = {isOwner.toString()}</ThemedText>
        <ThemedText>Timestamp: 2025-01-07 14:45</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <ThemedText>Permission granted! Redirecting to current week...</ThemedText>
      <ThemedText>Debug: isOwner = {isOwner.toString()}</ThemedText>
    </ThemedView>
  );
} 