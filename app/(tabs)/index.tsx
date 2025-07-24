import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { User, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import FirstTimeSetupModal from '../../components/FirstTimeSetupModal';
import { OPENWEATHER_API_KEY } from '../../config';
import { useDualInstance } from '../../contexts/DualInstanceContext';
import { auth, db } from '../../core/firebase';
import { getDataOwnerId, getUserSession } from '../../core/session';

export default function HomeScreen() {
  const router = useRouter();
  const { isDualMode } = useDualInstance();
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

  // Fetch weather data
  const fetchWeather = async () => {
    if (!OPENWEATHER_API_KEY) {
      console.log('No weather API key provided');
      setWeatherLoading(false);
      return;
    }

    try {
      setWeatherLoading(true);
      
      // Check cache first (5 minutes)
      const now = Date.now();
      if (weather?.lastFetched && (now - weather.lastFetched) < 300000) {
        setWeatherLoading(false);
        return;
      }

      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=Billingham,UK&appid=${OPENWEATHER_API_KEY}&units=metric`
      );
      
      if (!response.ok) {
        throw new Error('Weather API request failed');
      }
      
      const data = await response.json();
      
      setWeather({
        temp: Math.round(data.main.temp),
        condition: data.weather[0].description,
        icon: data.weather[0].icon,
        lastFetched: now,
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

  // Determine how many buttons per row: use 3 on web for wider screens, adjust for dual mode
  const buttonsPerRow = isDualMode ? 2 : (Platform.OS === 'web' ? 3 : 2);

  // Render the main screen content
  const renderScreenContent = () => (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <>
          {email && (
            <Text style={styles.emailText}>Logged in as: {email}</Text>
          )}
          
          {/* Dashboard Widgets */}
          <View style={styles.widgetContainer}>
            {/* Weather Widget */}
            <View style={styles.widget}>
              <Text style={styles.widgetTitle}>Weather</Text>
              {weatherLoading ? (
                <Text style={styles.widgetContent}>Loading...</Text>
              ) : weather ? (
                <Text style={styles.widgetContent}>
                  {weather.temp}°C {weather.condition}
                </Text>
              ) : (
                <Text style={styles.widgetContent}>Unable to load weather</Text>
              )}
            </View>

            {/* Job Stats Widget */}
            <View style={styles.widget}>
              <Text style={styles.widgetTitle}>Today's Progress</Text>
              {jobStatsLoading ? (
                <Text style={styles.widgetContent}>Loading...</Text>
              ) : jobStats ? (
                <>
                  <Text style={styles.widgetContent}>
                    {jobStats.completed}/{jobStats.total} jobs completed
                  </Text>
                  {jobStats.total > 0 && (
                    <View style={styles.progressBar}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { width: `${(jobStats.completed / jobStats.total) * 100}%` }
                        ]} 
                      />
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.widgetContent}>No jobs today</Text>
              )}
            </View>
          </View>

          {/* Navigation Buttons */}
          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => {
              const rowIndex = Math.floor(index / buttonsPerRow);
              const colIndex = index % buttonsPerRow;
              const isFirstInRow = colIndex === 0;
              const isLastInRow = colIndex === buttonsPerRow - 1 || index === buttons.length - 1;

              return (
                <Pressable
                  key={index}
                  style={[
                    styles.button,
                    {
                      width: `${100 / buttonsPerRow - 2}%`,
                      marginLeft: isFirstInRow ? 0 : '2%',
                      marginTop: rowIndex > 0 ? 16 : 0,
                    },
                    button.disabled && styles.buttonDisabled,
                  ]}
                  onPress={button.onPress}
                  disabled={button.disabled || navigationInProgress}
                >
                  <Text style={[styles.buttonText, button.disabled && styles.buttonTextDisabled]}>
                    {button.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {showFirstTimeSetup && (
        <FirstTimeSetupModal 
          visible={showFirstTimeSetup} 
          onComplete={handleFirstTimeSetupComplete} 
        />
      )}
    </View>
  );

  // Return dual layout for desktop or single layout for mobile
  if (isDualMode) {
    console.log('🖥️ Rendering dual desktop dashboard');
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={[styles.dualInstanceContainer, styles.leftInstance]}>
          {renderScreenContent()}
        </View>
        <View style={[styles.dualInstanceContainer, styles.rightInstance]}>
          {renderScreenContent()}
        </View>
      </View>
    );
  }

  return renderScreenContent();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  dualInstanceContainer: {
    flex: 1,
  },
  leftInstance: {
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  rightInstance: {
    // No additional styles needed
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  emailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  widgetContainer: {
    flexDirection: 'row',
    marginBottom: 30,
    gap: 15,
  },
  widget: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  widgetTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  widgetContent: {
    fontSize: 14,
    color: '#666',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 20,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonTextDisabled: {
    color: '#999',
  },
});

