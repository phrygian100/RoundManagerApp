import { Slot, usePathname, useRouter } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QuoteToClientProvider } from '../contexts/QuoteToClientContext';
import { auth } from '../core/firebase';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Set up auth listener only once
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      console.log('🔑 Firebase auth change:', { hasUser: !!user });
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []); // No dependencies - run only once
  
  // Handle redirects based on auth state and pathname
  useEffect(() => {
    if (!authReady) return; // Wait for auth to be ready
    
    const isPasswordResetFlow = typeof window !== 'undefined' && 
      window.location.href.includes('type=recovery');
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
    <QuoteToClientProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Slot />
      </GestureHandlerRootView>
    </QuoteToClientProvider>
  );
}