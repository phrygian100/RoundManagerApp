import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { User, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import FirstTimeSetupModal from '../../components/FirstTimeSetupModal';
import { auth, db } from '../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../core/session';

export default function HomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const aspectRatio = width > 0 && height > 0 ? width / height : 1;
  const isDesktopLike = Platform.OS === 'web' && width >= 1024 && aspectRatio >= 1.6;
  const [buttons, setButtons] = useState<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [navigationInProgress, setNavigationInProgress] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const [checkingFirstTime, setCheckingFirstTime] = useState(true);
  
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
    } finally {
      setCheckingFirstTime(false);
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
      { label: 'Add New Client', path: '/add-client', permKey: 'viewClients' },
      { label: 'Rota', path: '/rota', permKey: null },
      { label: 'Workload Forecast', path: '/workload-forecast', permKey: 'viewRunsheet' },
      { label: 'Runsheet', path: '/runsheet', permKey: 'viewRunsheet' },
      { label: 'Accounts', path: '/accounts', permKey: 'viewPayments' },
      { label: 'Activity Log', path: '/audit-log', permKey: null },
      { label: 'Quotes', path: '/quotes', permKey: null },
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
          { label: 'Add New Client', path: '/add-client', permKey: 'viewClients' },
          { label: 'Rota', path: '/rota', permKey: null },
          { label: 'Workload Forecast', path: '/workload-forecast', permKey: 'viewRunsheet' },
          { label: 'Runsheet', path: '/runsheet', permKey: 'viewRunsheet' },
          { label: 'Accounts', path: '/accounts', permKey: 'viewPayments' },
          { label: 'Activity Log', path: '/audit-log', permKey: null },
          { label: 'Quotes', path: '/quotes', permKey: null },
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

  // Determine how many buttons per row based on aspect ratio and width
  const buttonsPerRow = isDesktopLike ? 4 : (Platform.OS === 'web' ? 3 : 2);

  // Split buttons into rows
  const rows: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[][] = [];
  for (let i = 0; i < buttons.length; i += buttonsPerRow) {
    rows.push(buttons.slice(i, i + buttonsPerRow));
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with settings gear icon */}
      <View style={styles.header}>
        <Pressable style={styles.settingsButton} onPress={() => handleNavigation('/settings')}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </Pressable>
        <View style={styles.headerContent}>
          {/* Weather widget */}
          {weatherLoading ? (
            <Text style={styles.weatherPlaceholder}>Weather loading...</Text>
          ) : weather ? (
            <View style={styles.weatherWidget}>
              <Text style={styles.weatherIcon}>{weather.icon}</Text>
              <Text style={styles.weatherText}>{weather.temp}°C {weather.condition}</Text>
            </View>
          ) : (
            <Text style={styles.weatherPlaceholder}>Weather unavailable</Text>
          )}
        </View>
      </View>

      {/* Dashboard stats section */}
      <View style={styles.statsSection}>
        {jobStatsLoading ? (
          <Text style={styles.statsPlaceholder}>Job stats loading...</Text>
        ) : jobStats ? (
          <View style={styles.jobStatsWidget}>
            <Text style={styles.jobStatsText}>
              📋 Today's Progress: {jobStats.completed}/{jobStats.total} jobs completed
            </Text>
            {jobStats.total > 0 && (
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${Math.round((jobStats.completed / jobStats.total) * 100)}%` }
                  ]} 
                />
              </View>
            )}
            {jobStats.total > 0 && (
              <Text style={styles.progressPercentage}>
                {jobStats.completed === jobStats.total ? '✅ ' : '🔄 '}{Math.round((jobStats.completed / jobStats.total) * 100)}% complete
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.statsPlaceholder}>📋 No jobs scheduled for today</Text>
        )}
      </View>

      {/* Main buttons grid */}
      <View style={styles.buttonsContainer}>
        {rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            style={[
              styles.row,
              Platform.OS === 'web' && { maxWidth: buttonsPerRow * 280, alignSelf: 'center' }
            ]}
          >
            {row.map((btn, idx) => (
              <Pressable
                key={idx}
                style={[styles.button, btn.disabled && styles.buttonDisabled]}
                onPress={btn.onPress}
                disabled={btn.disabled}
              >
                <Text style={styles.buttonText}>{btn.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {email && (
        <View style={styles.emailContainer}>
          <Text style={styles.email}>Logged in as {email}</Text>
        </View>
      )}
      {showFirstTimeSetup && (
        <FirstTimeSetupModal 
          visible={showFirstTimeSetup} 
          onComplete={handleFirstTimeSetupComplete} 
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  settingsButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  settingsIcon: {
    fontSize: 20,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    marginLeft: 16,
  },
  weatherPlaceholder: {
    fontSize: 14,
    color: '#666',
  },
  weatherWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 10,
    width: '100%',
    maxWidth: 250,
  },
  weatherIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  weatherText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsSection: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statsPlaceholder: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  jobStatsWidget: {
    borderRadius: 16,
    padding: 20,
    margin: 8,
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    // Android shadow
    elevation: 8,
    // Border for definition
    borderWidth: 1,
    borderColor: '#e8e8e8',
    // Platform-specific styling
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        backgroundColor: '#ffffff',
      },
      default: {
        backgroundColor: '#ffffff',
      },
    }),
  },
  jobStatsText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
    color: '#2c3e50',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f0f2f5',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#34c759',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 16,
    color: '#34c759',
    textAlign: 'center',
    fontWeight: '600',
  },
  buttonsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  button: {
    flex: 1,
    aspectRatio: 1,
    marginHorizontal: 8,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    minWidth: 0,
    maxWidth: 250,
  },
  buttonDisabled: {
    backgroundColor: '#eee',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  email: { 
    fontSize: 12, 
    color: '#666',
    textAlign: 'center',
  },
  emailContainer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
});

