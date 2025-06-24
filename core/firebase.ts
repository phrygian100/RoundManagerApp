// app/core/firebase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth/react-native";
import { getFirestore } from "firebase/firestore";
import './firebase-bootstrap';

const firebaseConfig = {
  apiKey: "AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo",
  authDomain: "roundmanagerapp.firebaseapp.com",
  projectId: "roundmanagerapp",
  storageBucket: "roundmanagerapp.appspot.com",
  messagingSenderId: "1049000869926",
  appId: "1:1049000869926:web:dbd1ff76e097cae72526e7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export { auth, db };

