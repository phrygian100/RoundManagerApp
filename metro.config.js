const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// On native platforms (iOS/Android builds), swap the Firebase web SDK for
// React Native Firebase, whose modular API mirrors the firebase-js-sdk import
// surface. This gives the packaged apps on-device Firestore persistence
// (offline runsheets, queued writes) without touching any service code.
// Web resolves the firebase JS SDK exactly as before.
const FIREBASE_NATIVE_MODULE_MAP = {
  'firebase/app': '@react-native-firebase/app',
  'firebase/auth': '@react-native-firebase/auth',
  'firebase/firestore': '@react-native-firebase/firestore',
  'firebase/functions': '@react-native-firebase/functions',
  'firebase/storage': '@react-native-firebase/storage',
  'firebase/messaging': '@react-native-firebase/messaging',
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const mapped =
    platform !== 'web' && FIREBASE_NATIVE_MODULE_MAP[moduleName]
      ? FIREBASE_NATIVE_MODULE_MAP[moduleName]
      : moduleName;
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, mapped, platform);
  }
  return context.resolveRequest(context, mapped, platform);
};

module.exports = config;
