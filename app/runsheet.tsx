import { format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { getUserSession } from '../core/session';

export default function RunsheetScreen() {
  const router = useRouter();
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const session = await getUserSession();
      setSessionLoaded(true);
      
      if (session) {
        setIsOwner(session.isOwner);
        setHasPermission(session.isOwner || session.perms?.viewRunsheet);
        
        // If allowed, redirect to current week
        if (session.isOwner || session.perms?.viewRunsheet) {
          const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
          const weekParam = format(currentWeek, 'yyyy-MM-dd');
          router.replace(`/runsheet/${weekParam}`);
        }
      }
    };
    
    checkSession();
  }, [router]);

  if (!sessionLoaded) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  if (!hasPermission) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ThemedText>You don't have permission to view runsheets.</ThemedText>
        <ThemedText>Debug: isOwner = {isOwner.toString()}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <ThemedText>Redirecting to current week...</ThemedText>
    </ThemedView>
  );
} 