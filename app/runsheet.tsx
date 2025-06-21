import { format, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function RunsheetScreen() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the current week's runsheet
    const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekParam = format(currentWeek, 'yyyy-MM-dd');
    router.replace(`/runsheet/${weekParam}`);
  }, [router]);

  // This component will redirect immediately, so we don't need to render anything
  return null;
} 