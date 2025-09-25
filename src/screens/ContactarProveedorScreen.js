// src/screens/ContactarProveedorScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { auth, db } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { sendExpoPush } from "../utils/notifications";

/* Helpers para links */
const ensureHttp = (url) => {
  if (!url) return "";
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
};
const normalizeInstagramUrl = (value) => {
  if (!value) return "";
  let v = String(value).trim();
  if (/^https?:\/\//i.test(v)) return v;
  v = v.replace(/^@/, "");
  if (/instagram\.com/i.test(v)) return ensureHttp(v);
  if (!v) return "";
  return `https://instagram.com/${v}`;
};
const toWaLink = (value, text = "") => {
  if (!value) return "";
  const v = String(value).trim();
  if (/^https?:\/\//i.test(v) || /wa\.me|whatsapp/i.test(v)) {
    if (!text) return v;
    const sep = v.includes("?") ? "&" : "?";
    return `${v}${sep}text=${encodeURIComponent(text)}`;
  }
  const digits = v.replace(/[^\d]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "";
  if (!base) return "";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
};

export default function ContactarProveedorScreen() {
  const route = useRoute();
  const me = auth.currentUser;

  // 🔹 Recibimos más params para cubrir caso de anuncios
  const {
    providerUid,
    providerName,
    // flujo "servicio"
    serviceId,
    serviceName,
    // flujo "anuncio"
    adId = null,
    adImageUrl = null,
    adCaption = null,
    subject: subjectParam = null,
    source = null, // ej: "ad"
    // ofertas/promos (si aplica)
    offerId = null,
    discountPct = null,
    validTo = null,
    // prefill opcional (por si vino con mensaje)
    prefill,
  } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [prov, setProv] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [descripcion, setDescripcion] = useState(prefill?.message || "");
  const [oferta, setOferta] = useState("");
  const [sending, setSending] = useState(false);

  // ✅ Resolvemos un "subject" robusto para todos los flujos
  const subject = useMemo(() => {
    return (
      subjectParam?.toString().trim() ||
      adCaption?.toString().trim() ||
      serviceName?.toString().trim() ||
      "tu anuncio publicitario"
    );
  }, [subjectParam, adCaption, serviceName]);

  // cargar info del proveedor
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "users", String(providerUid)));
        const data = snap.exists() ? snap.data() : {};
        if (!mounted) return;
        setProv({
          uid: providerUid,
          displayName: data.displayName || providerName || "Proveedor",
          email: data.email || "",
          isResident: !!data.isResident,
          apartment: data.apartment || "",
          phone: data.phone || "",
          bio: data.bio || "",
          expoPushToken: data.expoPushToken || null,
          recommendedCount: data.recommendedCount || 0,
          instagramEnabled: !!data.instagramEnabled,
          instagramUrl: data.instagramUrl || "",
          whatsappEnabled: !!data.whatsappEnabled,
          whatsappNumber: data.whatsappNumber || "",
          otherEnabled: !!data.otherEnabled,
          otherUrl: data.otherUrl || "",
        });
      } catch (e) {
        console.error("Error cargando proveedor:", e);
        setProv(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (providerUid) load();
    return () => {
      mounted = false;
    };
  }, [providerUid, providerName]);

  const initials = useMemo(() => {
    const name = prov?.displayName || providerName || "PR";
    return name.trim().slice(0, 2).toUpperCase();
  }, [prov, providerName]);

  const anySocial =
    (prov?.instagramEnabled && !!prov?.instagramUrl) ||
    (prov?.whatsappEnabled && !!prov?.whatsappNumber) ||
    (prov?.otherEnabled && !!prov?.otherUrl);

  const openInstagram = useCallback(async () => {
    const url = normalizeInstagramUrl(prov?.instagramUrl);
    if (!url) return Alert.alert("Instagram", "No hay enlace válido.");
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Instagram", "No se pudo abrir el enlace.");
    }
  }, [prov]);

  const openWhatsApp = useCallback(async () => {
    const text = `Hola ${
      prov?.displayName || "vecino"
    }, te contacto por "${subject}".`;
    const url = toWaLink(prov?.whatsappNumber, text);
    if (!url) return Alert.alert("WhatsApp", "No hay número o enlace válido.");
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("WhatsApp", "No se pudo abrir WhatsApp.");
    }
  }, [prov, subject]);

  const openOther = useCallback(async () => {
    const url = ensureHttp(prov?.otherUrl);
    if (!url) return Alert.alert("Enlace", "No hay URL válida.");
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Enlace", "No se pudo abrir el enlace.");
    }
  }, [prov]);

  const enviarSolicitud = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Debes iniciar sesión");
        return;
      }
      if (!prov) return;
      if (!descripcion.trim()) {
        Alert.alert("Falta descripción", "Cuéntale al proveedor qué necesitas.");
        return;
      }
      setSending(true);

      const fromSnap = await getDoc(doc(db, "users", user.uid));
      const fromData = fromSnap.exists() ? fromSnap.data() : {};
      const toSnap = await getDoc(doc(db, "users", prov.uid));
      const toData = toSnap.exists() ? toSnap.data() : {};

      const offerSanitized = (oferta || "").replace(/[^\d]/g, "");
      const offerNumber = offerSanitized ? Number(offerSanitized) : null;

      // 🔹 Si vienes de un anuncio, no tendrás serviceId/name -> guardamos subject y adRef
      await addDoc(collection(db, "requests"), {
        // flujo servicio
        serviceId: serviceId || null,
        serviceName: serviceName || null,
        // flujo anuncio
        adRef: adId
          ? { adId, adImageUrl: adImageUrl || null, subject }
          : null,
        contactSource: source || (adId ? "ad" : "service"),

        fromUserUid: user.uid,
        fromUserDisplayName: fromData.displayName || "Sin nombre",
        fromApartment: fromData.apartment || "",
        fromPhone: fromData.phone || "",
        toUserUid: prov.uid,
        toUserDisplayName: toData.displayName || prov.displayName || "Proveedor",

        description: descripcion.trim(),
        subject, // 🔑 siempre guardamos el subject resuelto
        offer: offerNumber,
        apartment: fromData.apartment || "",
        status: "pendiente",
        createdAt: serverTimestamp(),
        decisionAt: null,
        finalizedAt: null,
        finalizedBy: null,
        rating: null,
        ratingBy: null,
        ratingTargetUid: null,

        // si venía de oferta/promo
        offerRef: offerId
          ? {
              providerUid: prov.uid,
              offerId,
              discountPct: discountPct ?? null,
              validTo: validTo ?? null,
            }
          : null,
      });

      const expoToken = prov.expoPushToken || toData.expoPushToken || null;
      if (expoToken) {
        const fmtCOP = (n) => {
          try {
            return Number(n).toLocaleString("es-CO");
          } catch {
            return String(n);
          }
        };
        await sendExpoPush(expoToken, {
          title: `Nueva solicitud: ${subject}`,
          body:
            `${fromData.displayName || "Un vecino"} envió una solicitud` +
            (offerNumber != null
              ? ` — Oferta: ${fmtCOP(offerNumber)} COP`
              : ""),
          data: {
            type: "request:new",
            serviceId: serviceId || null,
            serviceName: serviceName || subject,
            fromUserUid: user.uid,
            source: source || (adId ? "ad" : "service"),
          },
        });
      }

      Alert.alert("Solicitud enviada", "El proveedor recibirá tu solicitud.");
      setModalVisible(false);
      setDescripcion("");
      setOferta("");
    } catch (e) {
      console.error("Error creando solicitud:", e);
      Alert.alert("Error", "No se pudo enviar la solicitud.");
    } finally {
      setSending(false);
    }
  }, [
    descripcion,
    oferta,
    prov,
    serviceId,
    serviceName,
    adId,
    adImageUrl,
    source,
    subject,
    offerId,
    discountPct,
    validTo,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!prov) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.loader}>
          <Ionicons name="alert-circle-outline" size={22} color="#6b7a90" />
          <Text style={{ color: "#6b7a90", fontWeight: "700", marginTop: 6 }}>
            No se pudo cargar el proveedor.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Card perfil proveedor */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.nameText}>{prov.displayName}</Text>
              {!!prov.email && (
                <Text style={styles.emailHint}>{prov.email}</Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />
          <InfoRow
            icon={prov.isResident ? "home-outline" : "people-outline"}
            color="#1d4fb8"
            label="Tipo de usuario"
            value={prov.isResident ? "Residente" : "Externo recomendado"}
          />
          {!!prov.apartment && (
            <InfoRow
              icon="business-outline"
              color="#1e7e34"
              label="Apartamento"
              value={prov.apartment}
            />
          )}
          {!!prov.phone && (
            <InfoRow
              icon="call-outline"
              color="#f59f00"
              label="Teléfono"
              value={prov.phone}
            />
          )}

          {!!prov.bio && (
            <>
              <Text style={[styles.subTitle, { marginTop: 8 }]}>
                Descripción
              </Text>
              <Text style={styles.bioText}>{prov.bio}</Text>
            </>
          )}

          <Text style={[styles.subTitle, { marginTop: 10 }]}>Reputación</Text>
          <View
            style={[
              styles.repBox,
              { backgroundColor: "#fff7e6", borderColor: "#ffe8b0" },
            ]}
          >
            <Ionicons name="star" size={18} color="#f59f00" />
            <Text style={[styles.repNumber, { color: "#b45309" }]}>
              {"  "}
              {prov.recommendedCount || 0}
            </Text>
            <Text style={[styles.repLabel, { color: "#a16207" }]}>
              {" "}
              Reputación
            </Text>
          </View>
        </View>

        {/* Acciones */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Opciones de contacto</Text>

          {/* Motivo visible (evita "undefined") */}
          <Text style={[styles.subTitle, { marginTop: 6 }]}>
            Motivo: <Text style={{ color: "#0f172a" }}>{subject}</Text>
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 10 }]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.9}
          >
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {" "}
              Solicitar servicio desde la app
            </Text>
          </TouchableOpacity>

          {anySocial && (
            <>
              <Text
                style={[styles.subTitle, { marginTop: 12, marginBottom: 6 }]}
              >
                Otras opciones
              </Text>
              {prov.instagramEnabled && !!prov.instagramUrl && (
                <TouchableOpacity
                  style={styles.socialBtn}
                  onPress={openInstagram}
                  activeOpacity={0.9}
                >
                  <Ionicons name="logo-instagram" size={18} color="#d62976" />
                  <Text style={styles.socialBtnText}>
                    {" "}
                    Solicitar por Instagram
                  </Text>
                </TouchableOpacity>
              )}
              {prov.whatsappEnabled && !!prov.whatsappNumber && (
                <TouchableOpacity
                  style={styles.socialBtn}
                  onPress={openWhatsApp}
                  activeOpacity={0.9}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  <Text style={styles.socialBtnText}>
                    {" "}
                    Solicitar por WhatsApp
                  </Text>
                </TouchableOpacity>
              )}
              {prov.otherEnabled && !!prov.otherUrl && (
                <TouchableOpacity
                  style={styles.socialBtn}
                  onPress={openOther}
                  activeOpacity={0.9}
                >
                  <Ionicons name="link-outline" size={18} color="#475569" />
                  <Text style={styles.socialBtnText}>
                    {" "}
                    Solicitar por otro enlace
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Modal solicitud */}
      <Modal
        transparent
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nueva solicitud</Text>
            <Text style={styles.modalSub}>
              {subject} → {prov.displayName}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Describe lo que necesitas"
              placeholderTextColor="#94a3b8"
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
              numberOfLines={4}
              selectionColor="#0d6efd"
              cursorColor="#0d6efd"
              keyboardAppearance="light"
              textAlignVertical="top"
            />
            <TextInput
              style={styles.input}
              placeholder="Oferta (opcional)"
              placeholderTextColor="#94a3b8"
              value={oferta}
              onChangeText={(t) => setOferta(t.replace(/[^\d]/g, ""))}
              keyboardType="numeric"
              inputMode="numeric"
              selectionColor="#0d6efd"
              cursorColor="#0d6efd"
              keyboardAppearance="light"
              maxLength={10}
            />

            <View style={{ flexDirection: "row", marginTop: 8 }}>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { flex: 1, marginRight: 8, opacity: sending ? 0.7 : 1 },
                ]}
                onPress={enviarSolicitud}
                disabled={sending}
              >
                <Ionicons name="send-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {"  "}
                  {sending ? "Enviando…" : "Enviar"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={() => setModalVisible(false)}
                disabled={sending}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* Sub-componente para filas de info */
function InfoRow({ icon, color, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: `${color}15`, borderColor: `${color}33` },
        ]}
      >
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
    </View>
  );
}

/* === STYLES === */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { padding: 14, paddingBottom: 24 },

  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  /* Cards */
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e9edf3",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#1c2b39" },
  subTitle: { fontSize: 12, fontWeight: "800", color: "#6b7a90" },
  divider: { height: 1, backgroundColor: "#eef2f7", marginVertical: 10 },

  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e9f1ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dbe7ff",
  },
  avatarText: {
    color: "#0a58ca",
    fontWeight: "800",
    fontSize: 22,
    letterSpacing: 0.4,
  },
  nameText: { fontSize: 18, fontWeight: "800", color: "#12263a" },
  emailHint: { fontSize: 12, color: "#6b7a90", marginTop: 2 },

  /* Info rows */
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
  },
  rowLabel: { fontSize: 12, color: "#6b7a90" },
  rowValue: { fontSize: 14, fontWeight: "800", color: "#1c2b39", marginTop: 2 },

  /* Bio / rep */
  bioText: { color: "#2f3a45", lineHeight: 20, marginTop: 6 },
  repBox: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  repNumber: { fontSize: 16, fontWeight: "900" },
  repLabel: { fontSize: 12, fontWeight: "800" },

  /* Buttons */
  primaryBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  socialBtn: {
    marginTop: 8,
    backgroundColor: "#f6f8fc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  socialBtnText: { color: "#1c2b39", fontWeight: "800", fontSize: 14 },

  cancelBtn: {
    backgroundColor: "#6c757d",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#fff", fontWeight: "800" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
  },
  modalSub: {
    fontSize: 14,
    color: "#555",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#fafbfd",
    color: "#0f172a",
  },
});
