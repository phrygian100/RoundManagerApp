import { format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';

export default function RunsheetScreen() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the current week's runsheet
    const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekParam = format(currentWeek, 'yyyy-MM-dd');
    router.replace(`/runsheet/${weekParam}`);
  }, [router]);

  return (
    <PermissionGate perm="viewRunsheet" fallback={<ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}><ThemedText>You don't have permission to view runsheets.</ThemedText></ThemedView>}>
      {null}
    </PermissionGate>
  );
} 