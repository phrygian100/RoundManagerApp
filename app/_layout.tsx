import { Slot, usePathname, useRouter } from 'expo-router';
import { Auth, onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QuoteToClientProvider, useQuoteToClient } from '../contexts/QuoteToClientContext';
import { auth } from '../core/firebase';

function AppContent() {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { clearQuoteData } = useQuoteToClient();
  const previousUserRef = useRef<User | null>(null);
  
  // Set up auth listener only once
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth as Auth, (user: User | null) => {
      console.log('🔑 Firebase auth change:', { 
        hasUser: !!user, 
        previousUser: !!previousUserRef.current,
        userId: user?.uid 
      });
      
      // Only clear quote context data when user actually changes (login/logout)
      // Not on every auth state change to prevent instability
      if (previousUserRef.current?.uid !== user?.uid) {
        console.log('🔒 Clearing quote context data for security (user change)');
        clearQuoteData();
      }
      
      previousUserRef.current = user;
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
      <DualInstanceWrapper>
        <Slot />
      </DualInstanceWrapper>
    </GestureHandlerRootView>
  );
}

function DualInstanceWrapper({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false);
  
  // Detect desktop screen size (1200px+ width)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const checkScreenSize = () => {
        const newIsDesktop = window.innerWidth >= 1200;
        setIsDesktop(newIsDesktop);
        console.log('🖥️ Screen size check:', { width: window.innerWidth, isDesktop: newIsDesktop });
      };
      
      checkScreenSize();
      window.addEventListener('resize', checkScreenSize);
      return () => window.removeEventListener('resize', checkScreenSize);
    }
  }, []);

  if (isDesktop) {
    console.log('🖥️ Rendering dual desktop instances');
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: '#e0e0e0' }}>
          {children}
        </View>
        <View style={{ flex: 1 }}>
          {children}
        </View>
      </View>
    );
  }

  // Mobile/tablet: single instance (existing behavior)
  console.log('📱 Rendering single mobile/tablet instance');
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QuoteToClientProvider>
      <AppContent />
    </QuoteToClientProvider>
  );
}