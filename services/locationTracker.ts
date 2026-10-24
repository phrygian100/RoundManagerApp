import { Platform } from 'react-native';

/**
 * Thin platform wrapper around device geolocation.
 *
 * Web: browser `navigator.geolocation` (needs HTTPS; works on guvnor.app).
 * Native: `expo-location`, loaded lazily. Store builds made before that module was added
 * (Android build 6 / iOS build 12) do not contain its native code, so the require is
 * guarded and `isAvailable()` tells the UI to ask for an app update instead of crashing.
 */

export type Fix = {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres (undefined if the platform did not report one). */
  accuracy?: number;
  at: number; // epoch ms
};

export type Unsubscribe = () => void;

let expoLocation: any = null;
let expoLocationChecked = false;

function loadExpoLocation(): any {
  if (expoLocationChecked) return expoLocation;
  expoLocationChecked = true;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expoLocation = require('expo-location');
  } catch (e) {
    console.warn('expo-location is not in this build', e);
    expoLocation = null;
  }
  return expoLocation;
}

export function isLocationAvailable(): boolean {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  }
  return !!loadExpoLocation();
}

export const LOCATION_UNAVAILABLE_MESSAGE =
  Platform.OS === 'web'
    ? 'This browser does not support location. Use a smartphone browser over HTTPS.'
    : 'Location tracking needs a newer version of the Guvnor app. Please update from the store.';

/** Ask for foreground permission. Resolves true if granted. */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return isLocationAvailable();
  const Location = loadExpoLocation();
  if (!Location) return false;
  const res = await Location.requestForegroundPermissionsAsync();
  return res?.status === 'granted';
}

export function getCurrentFix(timeoutMs = 20000): Promise<Fix> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      if (!isLocationAvailable()) return reject(new Error(LOCATION_UNAVAILABLE_MESSAGE));
      navigator.geolocation.getCurrentPosition(
        pos => resolve(fromWeb(pos)),
        err => reject(new Error(webErrorMessage(err))),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
      );
    });
  }
  const Location = loadExpoLocation();
  if (!Location) return Promise.reject(new Error(LOCATION_UNAVAILABLE_MESSAGE));
  return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }).then(fromExpo);
}

/**
 * Continuous position stream. `onError` is advisory (the watch keeps running where the
 * platform allows). Returns an unsubscribe function.
 */
export function watchFixes(onFix: (fix: Fix) => void, onError?: (msg: string) => void): Unsubscribe {
  if (Platform.OS === 'web') {
    if (!isLocationAvailable()) {
      onError?.(LOCATION_UNAVAILABLE_MESSAGE);
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(
      pos => onFix(fromWeb(pos)),
      err => onError?.(webErrorMessage(err)),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }
  const Location = loadExpoLocation();
  if (!Location) {
    onError?.(LOCATION_UNAVAILABLE_MESSAGE);
    return () => {};
  }
  let sub: any = null;
  let cancelled = false;
  Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,
      distanceInterval: 3,
    },
    (loc: any) => onFix(fromExpo(loc))
  )
    .then((s: any) => {
      if (cancelled) s.remove();
      else sub = s;
    })
    .catch((e: any) => onError?.(e?.message || 'Location failed'));
  return () => {
    cancelled = true;
    sub?.remove?.();
  };
}

/** Keep the screen on while tracking (best effort; silently ignored where unsupported). */
export async function acquireKeepAwake(tag: string): Promise<() => void> {
  if (Platform.OS === 'web') {
    try {
      const wl = await (navigator as any).wakeLock?.request?.('screen');
      return () => {
        try { wl?.release?.(); } catch (_) { /* ignore */ }
      };
    } catch (_) {
      return () => {};
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const KeepAwake = require('expo-keep-awake');
    await KeepAwake.activateKeepAwakeAsync?.(tag);
    return () => {
      try { KeepAwake.deactivateKeepAwake?.(tag); } catch (_) { /* ignore */ }
    };
  } catch (_) {
    return () => {};
  }
}

function fromWeb(pos: GeolocationPosition): Fix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
    at: pos.timestamp || Date.now(),
  };
}

function fromExpo(loc: any): Fix {
  const c = loc?.coords || {};
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: typeof c.accuracy === 'number' && c.accuracy >= 0 ? c.accuracy : undefined,
    at: typeof loc?.timestamp === 'number' ? loc.timestamp : Date.now(),
  };
}

function webErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case 1: return 'Location permission was denied. Allow location for this site and try again.';
    case 2: return 'Position unavailable. Move outdoors or check the device location setting.';
    case 3: return 'Timed out waiting for a GPS fix.';
    default: return err.message || 'Location failed';
  }
}
