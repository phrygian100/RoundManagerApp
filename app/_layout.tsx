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
      console.log('🔑 Auth state change:', { event: _e, hasSession: !!session, pathname });
      
      // Check if we're in a password reset flow
      const isPasswordResetFlow = typeof window !== 'undefined' && 
        window.location.href.includes('type=recovery');
      
      const loggedIn = !!session;
      const unauthAllowed = ['/login', '/register', '/forgot-password', '/set-password'];
      const redirectIfLoggedIn = ['/login', '/register'];
      const alwaysAllowed = ['/set-password', '/forgot-password'];

      if (!loggedIn) {
        console.log('🔑 Not logged in, checking if redirect needed');
        if (!unauthAllowed.some(p => pathname.startsWith(p))) {
          console.log('🔑 Redirecting to login from:', pathname);
          router.replace('/login');
        }
      } else {
        console.log('🔑 Logged in, checking redirect rules for:', pathname);
        // Don't redirect if we're in a password reset flow
        if (redirectIfLoggedIn.some(p => pathname.startsWith(p)) && 
            !alwaysAllowed.some(p => pathname.startsWith(p)) && 
            !isPasswordResetFlow) {
          console.log('🔑 Redirecting to home from:', pathname);
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