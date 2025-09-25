// src/screens/PremiumPayScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Image,
  ImageBackground,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { auth, db } from "../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  query,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";
import Constants from "expo-constants";

/** Ajusta estos datos bancarios a los reales */
const BANK_INFO = {
  bank: "BANCOLOMBIA",
  bankType: "AHORROS",
  accountType: "91291489015",
  holderName: "Samuel Martinez", // ← reemplaza
  mountCOP: "49.000 COP", // ← reemplaza
};

/** Imagen local para la pantalla intermedia */
const INTRO_BG = require("../../assets/premium/bg-1080x2340.jpg"); // ← cambia la ruta si usas otra

function buildDeviceInfo() {
  const app = Constants?.expoConfig || Constants?.manifest || {};
  return {
    os: Platform.OS,
    osVersion: String(Platform.Version ?? ""),
    appName: app.name ?? "FN App",
    appSlug: app.slug ?? "",
    appVersion: app.version ?? "",
    runtime: "expo",
  };
}

async function askGalleryPermission() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permiso requerido", "Necesitamos acceso a tus fotos para adjuntar el comprobante.");
    return false;
  }
  return true;
}

async function pickImageFromLibrary() {
  const ok = await askGalleryPermission();
  if (!ok) return null;

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeImages,
    quality: 0.9,
    allowsEditing: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  return asset?.uri || null;
}

async function uploadToCloudinary(localUri) {
  try {
    const extra = Constants?.expoConfig?.extra || {};
    const cloudName = extra?.cloudinary?.cloudName;
    const uploadPreset = extra?.cloudinary?.uploadPreset;

    if (!cloudName || !uploadPreset) {
      throw new Error("Cloudinary no está configurado en app.config.js (cloudName / uploadPreset).");
    }

    const data = new FormData();
    data.append("file", {
      uri: localUri,
      name: "receipt.jpg",
      type: "image/jpeg",
    });
    data.append("upload_preset", uploadPreset);

    const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: data,
    });
    const json = await resp.json();
    if (!resp.ok || !json?.secure_url) {
      throw new Error(String(json?.error?.message || "Error subiendo a Cloudinary"));
    }
    return json.secure_url;
  } catch (e) {
    console.log("[cloudinary] upload error:", e);
    throw e;
  }
}

export default function PremiumPayScreen() {
  const navigation = useNavigation();

  // Estado global
  const [sending, setSending] = useState(false);

  // Paso 1
  const [step1Done, setStep1Done] = useState(false);

  // Paso 2
  const [step2Done, setStep2Done] = useState(false);
  const [receiptLocalUri, setReceiptLocalUri] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Ticket pendiente
  const [pendingTicketId, setPendingTicketId] = useState(null); // doc.id
  const [pendingTicketField, setPendingTicketField] = useState(null); // ticketId en doc
  const [pendingReceiptUrl, setPendingReceiptUrl] = useState(null);

  // Intro → Pasos (slide)
  const screenW = Dimensions.get("window").width;
  const slideX = useRef(new Animated.Value(0)).current; // 0 = intro, -screenW = pasos
  const goToSteps = () => {
    Animated.timing(slideX, {
      toValue: -screenW,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const unsubRef = useRef(null);

  // Suscribirse a ticket PENDING del usuario
  useEffect(() => {
    const u = auth.currentUser;
    if (!u?.uid) return;

    const qPending = query(
      collection(db, "billingPurchases"),
      where("uid", "==", u.uid),
      where("source", "==", "manual_request"),
      where("status", "==", "pending"),
      limit(1)
    );

    unsubRef.current?.();
    unsubRef.current = onSnapshot(qPending, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data();
        setPendingTicketId(d.id);
        setPendingTicketField(data?.ticketId || d.id);
        setPendingReceiptUrl(data?.receiptUrl || null);

        if (data?.receiptUrl) {
          setStep1Done(true);
          setStep2Done(true);
          setReceiptUrl(data.receiptUrl);
          setReceiptLocalUri(null);
        }
      } else {
        setPendingTicketId(null);
        setPendingTicketField(null);
        setPendingReceiptUrl(null);

        setStep1Done(false);
        setStep2Done(false);
        setReceiptUrl(null);
        setReceiptLocalUri(null);
      }
    });

    return () => unsubRef.current?.();
  }, []);

  const handlePickReceipt = async () => {
    try {
      const uri = await pickImageFromLibrary();
      if (!uri) return;
      setUploading(true);
      const url = await uploadToCloudinary(uri);
      setReceiptLocalUri(uri);
      setReceiptUrl(url);
      setUploading(false);
      Alert.alert("Comprobante cargado", "La imagen fue subida correctamente.");
    } catch (e) {
      setUploading(false);
      Alert.alert("Error al subir", String(e?.message || e));
    }
  };

  const sendRequest = async () => {
    try {
      const u = auth.currentUser;
      if (!u?.uid) {
        Alert.alert("Sesión requerida", "Inicia sesión para solicitar Premium.");
        return;
      }
      if (pendingTicketId) {
        Alert.alert("Solicitud en curso", "Ya enviaste una solicitud. El administrador la revisará pronto.");
        return;
      }
      if (!step1Done) {
        Alert.alert("Paso 1 incompleto", "Confirma el depósito para continuar.");
        return;
      }
      if (!step2Done || !receiptUrl) {
        Alert.alert("Paso 2 incompleto", "Adjunta el comprobante para continuar.");
        return;
      }

      setSending(true);

      const uref = doc(db, "users", u.uid);
      const usnap = await getDoc(uref);
      const udata = usnap.exists() ? usnap.data() : {};

      const newRef = doc(collection(db, "billingPurchases"));
      const ticketId = newRef.id;

      const payload = {
        ticketId,
        uid: u.uid,
        productId: "premium_manual",
        orderId: null,
        purchaseToken: null,
        purchaseTime: null,

        contactEmail: udata?.email || u.email || null,
        contactPhone: udata?.phone || null,
        contactName: udata?.displayName || null,

        deviceInfo: buildDeviceInfo(),
        note: "Solicitud manual creada por el usuario desde PremiumPayScreen (pasos completados)",
        status: "pending",
        source: "manual_request",
        receiptUrl: receiptUrl,
        createdAt: serverTimestamp(),
      };

      await setDoc(newRef, payload);

      try {
        const inboxRef = doc(collection(db, "adminInbox"));
        await setDoc(inboxRef, {
          type: "premium_request",
          ticketId,
          uid: u.uid,
          contactEmail: payload.contactEmail,
          contactPhone: payload.contactPhone,
          contactName: payload.contactName,
          createdAt: serverTimestamp(),
          message: "Nuevo ticket de solicitud de Premium (manual)",
          status: "new",
        });
      } catch (_) {}

      Alert.alert(
        "Solicitud enviada",
        "El administrador recibió tu solicitud, pronto se pondrá en contacto contigo."
      );
    } catch (e) {
      console.log("sendRequest error:", e);
      Alert.alert("Error", "No pudimos enviar tu solicitud. Inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  };

  const step3Enabled = step1Done && step2Done && !!receiptUrl && !pendingTicketId;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* CONTENEDOR DESLIZABLE: INTRO (0) → PASOS (-screenW) */}
      <Animated.View
        style={{
          flex: 1,
          flexDirection: "row",
          width: screenW * 2,
          transform: [{ translateX: slideX }],
        }}
      >
        {/* 1) PANTALLA INTERMEDIA (INTRO) */}
        <View style={{ width: screenW, height: "100%" }}>
          <ImageBackground source={INTRO_BG} style={styles.introBg} resizeMode="cover">
            <View style={styles.introBottom}>
              <TouchableOpacity style={styles.nextBtn} onPress={goToSteps} activeOpacity={0.9}>
                <Text style={styles.nextBtnText}>SIGUIENTE</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </ImageBackground>
        </View>

        {/* 2) PANTALLA DE PASOS (LA ACTUAL, MEJORADA) */}
        <View style={{ width: screenW, height: "100%", backgroundColor: "#f5f7fb" }}>
          <View style={styles.wrap}>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.title}>Activa FN Premium</Text>
              <Text style={styles.subtitle}>
                Es muy fácil: sigue estos pasos y nos encargamos del resto.
              </Text>

              {/* Banda con ticket si hay solicitud en curso */}
              {pendingTicketId ? (
                <View style={styles.banner}>
                  <Ionicons name="information-circle-outline" size={18} color="#0a58ca" />
                  <Text style={styles.bannerText}>
                    El administrador recibió tu solicitud, pronto se pondrá en contacto contigo.
                    {"\n"}Ticket: <Text style={{ fontWeight: "900" }}>{pendingTicketField}</Text>
                  </Text>
                </View>
              ) : null}

              {/* Paso 1 */}
              <View style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepTitleBig}>Paso 1 · Depositar a la cuenta</Text>
                  <TouchableOpacity
                    onPress={() => setStep1Done((v) => !v)}
                    disabled={!!pendingTicketId}
                    style={[styles.checkBtn, !!pendingTicketId && { opacity: 0.6 }]}
                  >
                    <Ionicons
                      name={step1Done ? "checkbox-outline" : "square-outline"}
                      size={24}
                      color="#0a58ca"
                    />
                    <Text style={styles.checkText}> {step1Done ? "Listo" : "Marcar como listo"}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.bankBox}>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Banco</Text>
                    <Text style={styles.bankValue}>{BANK_INFO.bank}</Text>
                  </View>
				  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Tipo</Text>
                    <Text style={styles.bankValue}>{BANK_INFO.bankType}</Text>
                  </View>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Número de cuenta</Text>
                    <Text style={styles.bankValue}>{BANK_INFO.accountType}</Text>
                  </View>
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Titular</Text>
                    <Text style={styles.bankValue}>{BANK_INFO.holderName}</Text>
                  </View>
				  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>Monto (365 días de premium)</Text>
                    <Text style={styles.bankValue}>{BANK_INFO.mountCOP}</Text>
                  </View>
                </View>

                {/* Separador con "ó" */}
                <View style={styles.separatorRow}>
                  <View style={styles.separatorLine} />
                  <Text style={styles.separatorText}>ó</Text>
                  <View style={styles.separatorLine} />
                </View>

                {/* Alternativa NEQUI */}
                <View style={[styles.bankBox, { backgroundColor: "#f9fffb", borderColor: "#d1fae5" }]}>
                  <View style={[styles.bankRow, { justifyContent: "center" }]}>
                    <Ionicons name="wallet-outline" size={18} color="#059669" />
                    <Text style={[styles.bankValue, { marginLeft: 6, color: "#065f46" }]}>
                      Transferencia por NEQUI al número 3174653280
                    </Text>
                  </View>
                </View>
              </View>
			  
			  {/* 👇 fila con ícono + texto */}
				<View style={styles.stepInfoRow}>
				  <Ionicons name="information-circle-outline" size={16} color="#0a58ca" />
				  <Text style={styles.stepInfoText}>
					Realiza la transferencia desde tu banco o Nequi y guarda el comprobante para el Paso 2.
				  </Text>
				</View>

              {/* Paso 2 */}
              <View style={[styles.stepCard, !step1Done && { opacity: 0.6 }]}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepTitleBig}>Paso 2 · Adjuntar comprobante</Text>
                  <TouchableOpacity
                    onPress={() => setStep2Done((v) => (receiptUrl ? !v : v))}
                    disabled={!step1Done || !!pendingTicketId || !receiptUrl}
                    style={[
                      styles.checkBtn,
                      ((!step1Done || !!pendingTicketId || !receiptUrl) && { opacity: 0.6 }),
                    ]}
                  >
                    <Ionicons
                      name={step2Done ? "checkbox-outline" : "square-outline"}
                      size={24}
                      color="#0a58ca"
                    />
                    <Text style={styles.checkText}> {step2Done ? "Listo" : "Marcar como listo"}</Text>
                  </TouchableOpacity>
                </View>

                {receiptUrl || pendingReceiptUrl ? (
                  <View style={styles.previewBox}>
                    <Image
                      source={{ uri: receiptLocalUri || receiptUrl || pendingReceiptUrl }}
                      style={{ width: "100%", height: 180, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View style={styles.emptyBox}>
                    <Ionicons name="image-outline" size={22} color="#64748b" />
                    <Text style={{ color: "#64748b", marginTop: 6, fontWeight: "700" }}>Sin comprobante</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.outlineBtn, (!step1Done || !!pendingTicketId) && { opacity: 0.6 }]}
                  onPress={handlePickReceipt}
                  disabled={!step1Done || !!pendingTicketId || uploading}
                  activeOpacity={0.9}
                >
                  {uploading ? (
                    <ActivityIndicator color="#0a58ca" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color="#0a58ca" />
                      <Text style={styles.outlineBtnText}> Subir/ Cambiar comprobante</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Paso 3 */}
              <TouchableOpacity
                style={[styles.primaryBtn, (!step3Enabled || sending) && { opacity: 0.6 }]}
                onPress={sendRequest}
                disabled={!step3Enabled || sending}
                activeOpacity={0.9}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}> Enviar solicitud al administrador</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Botón volver */}
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 12 }]}
                onPress={() => navigation.goBack()}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryBtnText}>Volver</Text>
              </TouchableOpacity>

              {/* Hint Ticket si hay pendiente */}
              {pendingTicketId ? (
                <Text style={styles.sentHint}>Solicitud en curso · Ticket: {pendingTicketField}</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Intro */
  introBg: { flex: 1, justifyContent: "flex-end" },
  introBottom: {
    padding: 16,
    paddingBottom: 28,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  nextBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  nextBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 0.4, fontSize: 16 },

  /* Pasos */
  wrap: { flex: 1, padding: 16, backgroundColor: "#f5f7fb" },
  title: { fontSize: 22, fontWeight: "900", color: "#12263a" },
  subtitle: { marginTop: 6, color: "#475569", fontWeight: "700" },

  banner: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cfe2ff",
    backgroundColor: "#e9f2ff",
    padding: 12,
    flexDirection: "row",
    gap: 8,
  },
  bannerText: { color: "#0b2870", fontWeight: "700", flex: 1 },

  stepCard: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderColor: "#e6eef8",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  stepHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepTitleBig: { fontWeight: "900", color: "#0f172a", fontSize: 18 },

  bankBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#eaeff7",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#f8fbff",
  },
  bankRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  bankLabel: { color: "#64748b", fontWeight: "700" },
  bankValue: { color: "#0f172a", fontWeight: "900" },

  /* Separador "ó" */
  separatorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  separatorText: { marginHorizontal: 10, color: "#6b7280", fontWeight: "900" },

  previewBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    overflow: "hidden",
  },
  emptyBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  checkBtn: { flexDirection: "row", alignItems: "center" },
  checkText: { color: "#0a58ca", fontWeight: "800" },

  outlineBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#cfe2ff",
    backgroundColor: "#f4f9ff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  outlineBtnText: { color: "#0a58ca", fontWeight: "800" },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#0f172a", fontWeight: "800", fontSize: 16 },

  sentHint: { marginTop: 8, fontSize: 12, color: "#16a34a", fontWeight: "700" },
});
