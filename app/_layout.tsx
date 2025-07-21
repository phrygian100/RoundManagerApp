import { Slot, usePathname, useRouter } from 'expo-router';
import { Auth, onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QuoteToClientProvider, useQuoteToClient } from '../contexts/QuoteToClientContext';
import { auth } from '../core/firebase';

function AppContent() {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { clearQuoteData } = useQuoteToClient();
  
  // Set up auth listener only once
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth as Auth, (user: User | null) => {
      console.log('🔑 Firebase auth change:', { hasUser: !!user });
      
      // SECURITY FIX: Clear quote context data on any auth state change
      // This prevents data from one user account leaking into another
      console.log('🔒 Clearing quote context data for security');
      clearQuoteData();
      
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [clearQuoteData]);
  
  // Handle redirects based on auth state and pathname
  useEffect(() => {
    if (!authReady) return; // Wait for auth to be ready
    
    const isPasswordResetFlow = typeof window !== 'undefined' && 
      window.location?.href?.includes('type=recovery');
    const loggedIn = !!currentUser;
    const unauthAllowed = ['/login', '/register', '/forgot-password', '/set-password'];
    const redirectIfLoggedIn = ['/login', '/register'];
    const alwaysAllowed = ['/set-password', '/forgot-password'];
    
    if (!loggedIn) {
      console.log('🔑 Not logged in, checking if redirect needed for:', pathname);
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
  }, [authReady, currentUser, pathname]);
  
  if (!authReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <QuoteToClientProvider>
      <AppContent />
    </QuoteToClientProvider>
  );
}