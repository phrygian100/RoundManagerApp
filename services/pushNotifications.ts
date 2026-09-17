import { Linking, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../core/firebase';

export type PushOpenPayload = {
  type?: string;
  week?: string;
  requestId?: string;
  jobId?: string;
  day?: string;
};

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';
export type NotificationPermissionRequestResult = 'granted' | 'denied' | 'blocked';

type OpenHandler = (data: PushOpenPayload) => void;

const PROMPT_DISMISSED_KEY = 'guvnor.pushOptInDismissed';

function messagingOrNull(): any | null {
  if (Platform.OS === 'web') return null;
  try {
    // Native-only module; 1.0.2 binaries without it must not crash.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-firebase/messaging').default;
  } catch (e) {
    console.warn('push: messaging native module unavailable', e);
    return null;
  }
}

async function persistToken(token: string) {
  const uid = auth.currentUser?.uid;
  if (!uid || !token) return;
  await setDoc(
    doc(db, 'users', uid),
    { fcmTokens: arrayUnion(token) },
    { merge: true }
  );
}

function isGrantedStatus(authStatus: unknown): boolean {
  return authStatus === 1 || authStatus === 2 || authStatus === true;
}

/**
 * Current OS notification permission. Does not show a dialog.
 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'web') return 'denied';

  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    try {
      const ok = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (ok) return 'granted';
      return 'undetermined';
    } catch (e) {
      console.warn('push: permission check failed', e);
    }
  }

  const messaging = messagingOrNull();
  if (!messaging) return 'denied';
  try {
    const status = await messaging().hasPermission();
    if (isGrantedStatus(status)) return 'granted';
    if (status === 0) return 'denied';
    return 'undetermined';
  } catch (e) {
    return 'undetermined';
  }
}

export async function hasDismissedNotificationPrompt(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPT_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markNotificationPromptDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_DISMISSED_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * Show the OS permission dialog (must be called from a user tap, not at
 * splash). On Android 13+ this is POST_NOTIFICATIONS.
 * `blocked` means the OS will not show a dialog again — open Settings.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionRequestResult> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Allow notifications',
        message:
          'Guvnor notifies you when a team member completes a job, when the day is ready to review, and when a new quote request arrives.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      }
    );
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      return 'blocked';
    }
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      return 'denied';
    }
  }

  const messaging = messagingOrNull();
  if (!messaging) {
    return Platform.OS === 'android' && Number(Platform.Version) < 33 ? 'granted' : 'denied';
  }

  const before = await messaging().hasPermission();
  const authStatus = await messaging().requestPermission();
  if (isGrantedStatus(authStatus)) return 'granted';
  if (before === 1) return 'blocked';
  return 'denied';
}

let pushListenersAttached = false;

/**
 * Save an FCM token if permission is already granted. Does not prompt.
 */
export async function registerPushNotifications(): Promise<void> {
  const messaging = messagingOrNull();
  if (!messaging || !auth.currentUser) return;

  const status = await getNotificationPermissionStatus();
  if (status !== 'granted') return;

  await messaging().registerDeviceForRemoteMessages();
  const token = await messaging().getToken();
  if (token) await persistToken(token);

  if (!pushListenersAttached) {
    pushListenersAttached = true;
    messaging().onTokenRefresh((t: string) => {
      persistToken(t).catch((e) => console.warn('push: token refresh save failed', e));
    });
  }
}

export async function enableNotificationsFromUserTap(): Promise<boolean> {
  const result = await requestNotificationPermission();
  if (result === 'granted') {
    await registerPushNotifications();
    return true;
  }
  if (result === 'blocked') {
    openSystemNotificationSettings();
  }
  return false;
}

export function openSystemNotificationSettings(): void {
  Linking.openSettings().catch(() => {});
}

/**
 * Handle notification taps (cold start + background). Returns an unsubscribe.
 */
export function listenNotificationOpens(handler: OpenHandler): () => void {
  const messaging = messagingOrNull();
  if (!messaging) return () => {};

  messaging()
    .getInitialNotification()
    .then((remote: any) => {
      if (remote?.data) handler(remote.data as PushOpenPayload);
    })
    .catch(() => {});

  const unsubOpened = messaging().onNotificationOpenedApp((remote: any) => {
    if (remote?.data) handler(remote.data as PushOpenPayload);
  });

  const unsubForeground = messaging().onMessage(async (remote: any) => {
    // Background/killed deliveries already show in the system tray. In the
    // foreground, surface quote requests so they are not silently dropped;
    // job ticks are visible on the runsheet after the cache refresh.
    const data = (remote?.data || {}) as PushOpenPayload;
    if (data.type === 'quote_request') {
      const { Alert } = require('react-native');
      Alert.alert(
        remote?.notification?.title || 'New quote request',
        remote?.notification?.body || 'A new quote request has arrived.',
        [{ text: 'View', onPress: () => handler(data) }, { text: 'Later', style: 'cancel' }]
      );
    }
  });

  return () => {
    unsubOpened();
    unsubForeground();
  };
}
