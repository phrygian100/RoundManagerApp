import { Platform } from 'react-native';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../core/firebase';

export type PushOpenPayload = {
  type?: string;
  week?: string;
  requestId?: string;
  jobId?: string;
  day?: string;
};

type OpenHandler = (data: PushOpenPayload) => void;

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

let pushListenersAttached = false;

/**
 * Ask for notification permission (Android 13+) and save this device's FCM
 * token on the signed-in user so Cloud Functions can reach them.
 */
export async function registerPushNotifications(): Promise<void> {
  const messaging = messagingOrNull();
  if (!messaging || !auth.currentUser) return;

  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === 1 /* AUTHORIZED */ ||
    authStatus === 2 /* PROVISIONAL */ ||
    authStatus === true;
  if (!enabled) {
    console.log('push: permission not granted', authStatus);
    return;
  }

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
