import { format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { getUserSession } from '../core/session';

export default function RunsheetScreen() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkPermissionAndRedirect = async () => {
      const session = await getUserSession();
      // Owners always have access, OR check specific permission for members
      if (session?.isOwner || session?.perms?.viewRunsheet) {
        setHasPermission(true);
        // Only redirect if permissions are granted
        const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekParam = format(currentWeek, 'yyyy-MM-dd');
        router.replace(`/runsheet/${weekParam}`);
      }
    };
    
    checkPermissionAndRedirect();
  }, [router]);

  if (!hasPermission) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ThemedText>You don't have permission to view runsheets.</ThemedText>
      </ThemedView>
    );
  }

  return null; // Will redirect before showing anything
} 