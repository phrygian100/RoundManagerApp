export const GOOGLE_MAPS_API_KEY = 'AIzaSyCGS7NmaEIBqfmNwzHB0YkfLguSDL4NZy0'; 

// OpenWeatherMap API configuration
export const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY ?? '';

// Centralised Firebase configuration – values come from `EXPO_PUBLIC_` env-vars that are injected at build time by Expo/Vercel.
// Keeping the config alongside other top-level constants avoids importing `expo-constants` (smaller bundle).
// NOTE: All keys intentionally default to an empty string so Firebase throws a clear error if a var is missing.
export const FIREBASE_CONFIG = {
  apiKey:             process.env.EXPO_PUBLIC_FIREBASE_API_KEY          ?? '',
  authDomain:         process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN      ?? '',
  projectId:          process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID       ?? '',
  storageBucket:      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET   ?? '',
  messagingSenderId:  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:              process.env.EXPO_PUBLIC_FIREBASE_APP_ID           ?? '',
} as const; 