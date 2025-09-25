// src/utils/push.js
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { auth, db } from "../firebaseConfig";
import { doc, setDoc, updateDoc } from "firebase/firestore";

// Muestra notificaciones cuando la app está en primer plano (iOS/Android)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) throw new Error("Solo funciona en dispositivo físico");

  // Pedir permisos
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") throw new Error("Permiso de notificaciones denegado");

  // Canal (Android) — no afecta iOS
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });
  }

  // EAS projectId (UUID) desde app.json/app.config.js (requerido en iOS)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    null;

  if (!projectId) {
    throw new Error("Falta EAS projectId (extra.eas.projectId) en app.json/app.config.js");
  }

  // Obtener token de Expo (iOS requiere projectId; en Android no rompe)
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

  console.log("USING projectId:", projectId);
  console.log("EXPO TOKEN (obtenido):", expoPushToken);

  // Guardar en Firestore (users/{uid}.expoPushToken)
  const uid = auth.currentUser?.uid;
  if (uid && expoPushToken) {
    try {
      await updateDoc(doc(db, "users", uid), { expoPushToken, updatedAt: new Date() });
    } catch {
      await setDoc(
        doc(db, "users", uid),
        { expoPushToken, updatedAt: new Date() },
        { merge: true }
      );
    }
  }

  return expoPushToken;
}
