export const GOOGLE_MAPS_API_KEY = 'AIzaSyCGS7NmaEIBqfmNwzHB0YkfLguSDL4NZy0'; 

// OpenWeatherMap API configuration
export const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY ?? '';

// Centralised Firebase configuration – values come from `EXPO_PUBLIC_` env-vars that are injected at build time by Expo/Vercel.
// Keeping the config alongside other top-level constants avoids importing `expo-constants` (smaller bundle).
// NOTE: Environment variables take precedence in production, these are fallbacks for local development.
export const FIREBASE_CONFIG = {
  apiKey:             process.env.EXPO_PUBLIC_FIREBASE_API_KEY          ?? 'AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo',
  authDomain:         process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN      ?? 'roundmanagerapp.firebaseapp.com',
  projectId:          process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID       ?? 'roundmanagerapp',
  storageBucket:      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET   ?? 'roundmanagerapp.appspot.com',
  messagingSenderId:  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '1049000869926',
  appId:              process.env.EXPO_PUBLIC_FIREBASE_APP_ID           ?? '1:1049000869926:web:dbd1ff76e097cae72526e7',
} as const; 