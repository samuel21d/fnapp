// src/firebaseConfig.js

// Importa lo que necesitas de Firebase SDK
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

// ⚠️ Reemplaza con tus datos reales de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBx_PDimE85xBthaZGKC8vJg64Kl_8lAx4",
  authDomain: "servicios-florida-norteamerica.firebaseapp.com",
  projectId: "servicios-florida-norteamerica",
  storageBucket: "servicios-florida-norteamerica.appspot.com", // ✅ corregido
  messagingSenderId: "602998483006",
  appId: "1:602998483006:web:201d52abeb44c346f3896f",
};

// Inicializa (o reutiliza) la app para evitar duplicados en HMR
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Inicializa Auth con persistencia en React Native.
// Si ya existe instancia (por hot-reload), usa getAuth(app)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

// Exporta Firestore
const db = getFirestore(app);

// 👉 Exportaciones para usar en el resto de la app
export { app, auth, db };

// 👉 Exponer apiKey para llamadas REST (Identity Toolkit) desde el cliente admin
export const firebaseApiKey = firebaseConfig.apiKey;

// 👉 Base URL de Identity Toolkit (REST)
export const IDENTITY_TOOLKIT_BASE_URL = "https://identitytoolkit.googleapis.com/v1";

// Si alguna vez necesitas forzar long-polling en RN (problemas de red),
// descomenta esta guía y cambia la obtención de db arriba:
// import { initializeFirestore } from "firebase/firestore";
// const db = initializeFirestore(app, { experimentalForceLongPolling: true });
