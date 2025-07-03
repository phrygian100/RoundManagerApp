import { Slot, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QuoteToClientProvider } from '../contexts/QuoteToClientContext';
import { supabase } from '../core/supabase';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      const loggedIn = !!session;
      if (!loggedIn) {
        if (pathname !== '/login' && pathname !== '/register') {
          router.replace('/login');
        }
      } else {
        if (pathname === '/login' || pathname === '/register') {
          router.replace('/');
        }
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [pathname]);

  return (
    <QuoteToClientProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Slot />
      </GestureHandlerRootView>
    </QuoteToClientProvider>
  );
}