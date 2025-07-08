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
      const unauthAllowed = ['/login', '/register', '/forgot-password', '/set-password'];

      if (!loggedIn) {
        if (!unauthAllowed.includes(pathname)) {
          router.replace('/login');
        }
      } else {
        if (unauthAllowed.includes(pathname)) {
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