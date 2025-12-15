import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { User, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import FirstTimeSetupModal from '../../components/FirstTimeSetupModal';
import { auth, db } from '../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../core/session';

const tileIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Client List': 'people-outline',
  'Rota': 'calendar-outline',
  'Workload Forecast': 'stats-chart-outline',
  'Runsheet': 'clipboard-outline',
  'Accounts': 'wallet-outline',
  'Materials': 'construct-outline',
  'Quotes': 'chatbubble-ellipses-outline',
  'New Business': 'briefcase-outline',
};

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [buttons, setButtons] = useState<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [navigationInProgress, setNavigationInProgress] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  
  // Weather widget state
  const [weather, setWeather] = useState<{
    temp: number;
    condition: string;
    icon: string;
    lastFetched?: number;
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  
  // Job stats state
  const [jobStats, setJobStats] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [jobStatsLoading, setJobStatsLoading] = useState(true);
  
  // Quote requests badge count
  const [quoteRequestCount, setQuoteRequestCount] = useState(0);

  // Fetch user address for weather
  const fetchUserAddress = async () => {
    try {
      const session = await getUserSession();
      if (session?.uid) {
        const userDoc = await getDoc(doc(db, 'users', session.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          return {
            postcode: userData.postcode,
            town: userData.town,
            address1: userData.address1
          };
        }
      }
    } catch (error) {
      console.error('Error fetching user address:', error);
    }
    return null;
  };

  // Fetch weather data using OpenWeatherMap API
  const fetchWeather = async () => {
    try {
      setWeatherLoading(true);
      
      // Check if we have recent weather data (less than 30 minutes old)
      if (weather?.lastFetched && Date.now() - weather.lastFetched < 30 * 60 * 1000) {
        console.log('Using cached weather data');
        setWeatherLoading(false);
        return;
      }

      const address = await fetchUserAddress();
      
      if (!address || (!address.postcode && !address.town)) {
        setWeather(null);
        setWeatherLoading(false);
        return;
      }

      // Use real OpenWeatherMap API
      const API_KEY = (process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY as string | undefined) || '6b74e8db380dbcdf9778b678b1a5f9fd'; // Temporary fallback
      if (API_KEY && API_KEY !== '') {
        try {
          // Try multiple location formats for better results
          const locations = [];
          if (address.town) {
            locations.push(address.town + ',UK');
            locations.push(address.town);
          }
          if (address.postcode) {
            locations.push(address.postcode + ',UK');
            locations.push(address.postcode);
          }
          
          let weatherData = null;
          let lastError = null;
          
          // Try each location format until one works
          for (const location of locations) {
            try {
              console.log(`Trying weather for: ${location}`);
              const response = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${API_KEY}&units=metric`
              );
              
              if (response.ok) {
                weatherData = await response.json();
                console.log(`Weather data received for: ${location}`);
                break;
              } else {
                console.log(`Failed for ${location}: ${response.status}`);
                lastError = `${response.status} ${response.statusText}`;
              }
            } catch (err) {
              console.log(`Error for ${location}:`, err);
              lastError = err;
            }
          }
          
          if (weatherData) {
            setWeather({
              temp: Math.round(weatherData.main.temp),
              condition: weatherData.weather[0].main,
              icon: getWeatherEmoji(weatherData.weather[0].main),
              lastFetched: Date.now()
            });
            setWeatherLoading(false);
            return;
          } else {
            console.warn('All location formats failed. Last error:', lastError);
          }
        } catch (apiError) {
          console.error('OpenWeatherMap API request failed:', apiError);
        }
      } else {
        console.log('No OpenWeatherMap API key configured');
      }

      // Fallback to mock data for development/demo
      console.log('Using mock weather data (API key not configured or API failed)');
      const mockWeatherData = {
        temp: Math.floor(Math.random() * 15) + 10, // 10-25°C
        condition: ['Clear', 'Clouds', 'Rain'][Math.floor(Math.random() * 3)]
      };

      setWeather({
        temp: mockWeatherData.temp,
        condition: mockWeatherData.condition,
        icon: getWeatherEmoji(mockWeatherData.condition),
        lastFetched: Date.now()
      });

    } catch (error) {
      console.error('Error fetching weather:', error);
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  // Simple weather icon mapping
  const getWeatherEmoji = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'clear': return '☀️';
      case 'clouds': return '☁️';
      case 'rain': return '🌧️';
      case 'drizzle': return '🌦️';
      case 'thunderstorm': return '⛈️';
      case 'snow': return '❄️';
      case 'mist':
      case 'fog': return '🌫️';
      default: return '🌤️';
    }
  };

  // Fetch today's job statistics
  const fetchJobStats = async () => {
    try {
      setJobStatsLoading(true);
      const ownerId = await getDataOwnerId();
      if (!ownerId) {
        setJobStats(null);
        setJobStatsLoading(false);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = format(today, 'yyyy-MM-dd');

      const jobsQuery = query(
        collection(db, 'jobs'),
        where('ownerId', '==', ownerId)
      );
      
      const querySnapshot = await getDocs(jobsQuery);
      
      const todayJobs = querySnapshot.docs
        .map(doc => doc.data())
        .filter(job => {
          if (!job.scheduledTime) return false;
          const jobDate = job.scheduledTime.split('T')[0];
          return jobDate === todayStr;
        });

      const completedJobs = todayJobs.filter(job => job.status === 'completed');
      
      setJobStats({
        completed: completedJobs.length,
        total: todayJobs.length
      });
    } catch (error) {
      console.error('Error fetching job stats:', error);
      setJobStats(null);
    } finally {
      setJobStatsLoading(false);
    }
  };

  const handleNavigation = (path: string) => {
    if (navigationInProgress) return;
    setNavigationInProgress(true);
    router.push(path as any);
    // Reset navigation flag after a short delay
    setTimeout(() => setNavigationInProgress(false), 1000);
  };

  const checkFirstTimeSetup = async (firebaseUser: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (!userData.firstTimeSetupCompleted) {
          setShowFirstTimeSetup(true);
        }
      }
    } catch (error) {
      console.error('Error checking first time setup:', error);
    }
  };

  const handleFirstTimeSetupComplete = async (hasInviteCode: boolean) => {
    setShowFirstTimeSetup(false);
    if (hasInviteCode) {
      // User chose to enter invite code, navigate there
      router.push('/enter-invite-code');
    } else {
      // User completed setup, refetch user session and rebuild buttons
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        await buildButtonsForUser(firebaseUser);
      }
    }
  };

  const buildButtonsForUser = async (firebaseUser: User) => {
    console.log('🏠 HomeScreen: building buttons');
    setEmail(firebaseUser.email || null);

    // Use getUserSession to get proper permissions and accountId
    const session = await getUserSession();
    if (!session) {
      console.error('No session found for user');
      setLoading(false);
      return;
    }

    const isOwner = session.isOwner;
    const perms = session.perms;
    console.log('🏠 HomeScreen: session =', { isOwner, perms, accountId: session.accountId });

    const baseButtons = [
      { label: 'Client List', path: '/clients', permKey: 'viewClients' },
      { label: 'Rota', path: '/rota', permKey: null },
      { label: 'Workload Forecast', path: '/workload-forecast', permKey: 'viewRunsheet' },
      { label: 'Runsheet', path: '/runsheet', permKey: 'viewRunsheet' },
      { label: 'Accounts', path: '/accounts', permKey: 'viewPayments' },
      { label: 'Materials', path: '/materials', permKey: 'viewMaterials' },
      { label: 'Quotes', path: '/quotes', permKey: null },
      { label: 'New Business', path: '/new-business', permKey: 'viewNewBusiness' },
    ];

    const allowed = baseButtons.filter((btn) => {
      if (!btn.permKey) return true; // Always available
      if (btn.permKey === 'isOwner') return isOwner; // Owner-only features
      if (isOwner) return true; // Owner sees all
      return !!perms[btn.permKey];
    });

    setButtons(
      allowed.map((btn) => ({
        label: btn.label,
        onPress: () => handleNavigation(btn.path as any),
        disabled: false,
      }))
    );
    
    // Fetch dashboard data
    fetchWeather();
    fetchJobStats();
    
    setLoading(false);
  };

  // Listen for auth state to become ready
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        console.log('🏠 HomeScreen: waiting for Firebase user...');
        return;
      }
      unsub(); // Stop listening once we have the user
      buildButtonsForUser(firebaseUser);
      checkFirstTimeSetup(firebaseUser); // Check if first-time setup is needed
    });

    return () => unsub();
  }, [router]);

  // Listen for quote request count (for badge)
  useEffect(() => {
    let unsubscribe: () => void;

    const setupQuoteListener = async () => {
      const ownerId = await getDataOwnerId();
      if (!ownerId) return;

      const q = query(
        collection(db, 'quoteRequests'),
        where('businessId', '==', ownerId)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        setQuoteRequestCount(snapshot.size);
      }, (error) => {
        console.error('Error listening to quote requests:', error);
      });
    };

    setupQuoteListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Rebuild buttons whenever screen gains focus (permissions may have changed)
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      (async () => {
        await new Promise(res => setTimeout(res, 0)); // defer to next tick
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          setLoading(false);
          return;
        }

        setEmail(firebaseUser.email || null);

        // Use getUserSession for proper permissions
        const session = await getUserSession();
        if (!session) {
          console.error('No session found for user');
          setLoading(false);
          return;
        }

        const isOwner = session.isOwner;
        const perms = session.perms;

        const buttonDefs = [
          { label: 'Client List', path: '/clients', permKey: 'viewClients' },
          { label: 'Rota', path: '/rota', permKey: null },
          { label: 'Workload Forecast', path: '/workload-forecast', permKey: 'viewRunsheet' },
          { label: 'Runsheet', path: '/runsheet', permKey: 'viewRunsheet' },
          { label: 'Accounts', path: '/accounts', permKey: 'viewPayments' },
          { label: 'Materials', path: '/materials', permKey: 'viewMaterials' },
          { label: 'Quotes', path: '/quotes', permKey: null },
          { label: 'New Business', path: '/new-business', permKey: 'viewNewBusiness' },
        ];

        const allowed = buttonDefs.filter(b => {
          if (!b.permKey) return true;
          if (b.permKey === 'isOwner') return isOwner;
          return isOwner || !!perms[b.permKey];
        });
        setButtons(
          allowed.map(b => ({ label: b.label, onPress: () => handleNavigation(b.path as any) }))
        );
        
        // Fetch dashboard data when screen gains focus
        fetchWeather();
        fetchJobStats();
        
        setLoading(false);
      })();
    }, [router])
  );

  const safeWidth = Math.max(width || 360, 360);
  const gridColumns = safeWidth >= 1200 ? 4 : safeWidth >= 900 ? 3 : 2;
  const gridMaxWidth = Math.min(safeWidth - 32, 1180);
  const tileGap = 16;
  const tileSize = Math.max(
    140,
    Math.min(240, Math.floor((gridMaxWidth - tileGap * (gridColumns - 1)) / gridColumns))
  );
  const progressPercent = jobStats && jobStats.total > 0
    ? Math.min(100, Math.round((jobStats.completed / jobStats.total) * 100))
    : 0;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { justifyContent: 'center' }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#0c1b3c', '#060d1f']}
      style={styles.background}
      locations={[0, 1]}
    >
      <View style={styles.accentOne} />
      <View style={styles.accentTwo} />
      <View style={styles.accentThree} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === 'web' ? { minHeight: '100vh' } : null
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { paddingHorizontal: 24 }]}>
          <Pressable
            style={styles.settingsButton}
            onPress={() => handleNavigation('/settings')}
            android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
          >
            <Ionicons name="settings-outline" size={20} color="#e8ecf8" />
          </Pressable>
          <View style={styles.weatherWrapper}>
            {weatherLoading ? (
              <Text style={styles.weatherPlaceholder}>Loading weather...</Text>
            ) : weather ? (
              <View style={styles.weatherPill}>
                <Text style={styles.weatherEmoji}>{weather.icon}</Text>
                <Text style={styles.weatherText}>{weather.temp}°C {weather.condition}</Text>
              </View>
            ) : (
              <Text style={styles.weatherPlaceholder}>Weather unavailable</Text>
            )}
          </View>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroTitleRow}>
              <Ionicons name="document-text-outline" size={22} color="#e8ecf8" />
              <Text style={styles.heroTitle}>Today's Progress</Text>
            </View>
            <Text style={styles.heroSubText}>
              {jobStatsLoading
                ? 'Calculating...'
                : jobStats
                  ? `${jobStats.completed}/${jobStats.total} jobs completed`
                  : 'No jobs scheduled today'}
            </Text>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {jobStatsLoading
                ? 'Loading...'
                : `${progressPercent}% complete`}
            </Text>
          </View>
        </View>

        <View style={[
          styles.grid,
          { maxWidth: gridMaxWidth, gap: tileGap }
        ]}>
          {buttons.map((btn) => (
            <Pressable
              key={btn.label}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: tileSize,
                  height: tileSize,
                  opacity: pressed ? 0.92 : 1,
                },
                btn.disabled && styles.tileDisabled,
              ]}
              onPress={btn.onPress}
              disabled={btn.disabled}
              android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            >
              <View style={styles.tileIconWrap}>
                <Ionicons
                  name={tileIcons[btn.label] ?? 'grid-outline'}
                  size={32}
                  color="#e8ecf8"
                />
              </View>
              <Text style={styles.tileLabel}>{btn.label}</Text>
              {btn.label === 'New Business' && quoteRequestCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{quoteRequestCount}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {email && (
          <Text style={styles.email}>Logged in as {email}</Text>
        )}
      </ScrollView>

      {showFirstTimeSetup && (
        <FirstTimeSetupModal
          visible={showFirstTimeSetup}
          onComplete={handleFirstTimeSetupComplete}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    overflow: 'hidden',
  },
  accentOne: {
    position: 'absolute',
    top: -140,
    right: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  accentTwo: {
    position: 'absolute',
    bottom: -160,
    left: -80,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(120, 170, 255, 0.07)',
  },
  accentThree: {
    position: 'absolute',
    bottom: 80,
    right: 60,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(76, 201, 240, 0.08)',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 24,
  },
  topBar: {
    width: '100%',
    maxWidth: 1180,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  weatherWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  topBarSpacer: {
    width: 40,
    height: 40,
  },
  weatherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  weatherEmoji: {
    fontSize: 18,
  },
  weatherText: {
    color: '#e8ecf8',
    fontSize: 15,
    fontWeight: '600',
  },
  weatherPlaceholder: {
    color: '#cfd5e6',
    fontSize: 14,
  },
  heroCard: {
    width: '100%',
    maxWidth: 1180,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...Platform.select({
      web: {
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 8,
      },
    }),
  },
  heroHeader: {
    gap: 4,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTitle: {
    color: '#f6f8ff',
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubText: {
    color: '#cfd5e6',
    fontSize: 14,
  },
  progressSection: {
    gap: 10,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#4ade80',
  },
  progressLabel: {
    color: '#4ade80',
    fontWeight: '700',
    fontSize: 15,
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tile: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
      },
      default: {},
    }),
  },
  tileDisabled: {
    opacity: 0.6,
  },
  tileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  tileLabel: {
    color: '#f6f8ff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  email: {
    color: '#cfd5e6',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0c1b3c',
    alignItems: 'center',
  },
  loadingText: {
    color: '#f6f8ff',
    fontSize: 16,
  },
});

