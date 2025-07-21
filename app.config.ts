export default ({ config }: { config: any }) => ({
  ...config,
  extra: {
    eas: {
      projectId: "fb9540c5-f865-437c-af65-3f7b33779b5a"
    },
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo',
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'roundmanagerapp.firebaseapp.com',
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'roundmanagerapp',
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'roundmanagerapp.appspot.com',
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '1049000869926',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:1049000869926:web:dbd1ff76e097cae72526e7',
    },
  },
}); 