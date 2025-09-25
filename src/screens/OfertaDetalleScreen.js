// src/screens/OfertaDetalleScreen.js
import React, { useEffect, useMemo, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { auth, db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
  documentId,
} from "firebase/firestore";
import { sendExpoPush } from "../utils/notifications";

const SERVICE_ICONS = {
  plomeria: "water-outline",
  carpinteria: "construct-outline",
  pintura: "color-palette-outline",
  cerrajeria: "key-outline",
  remodelacion: "business-outline",
  sastreria: "shirt-outline",
  transporte: "car-outline",
  papeleria: "document-text-outline",
  veterinaria: "paw-outline",
};

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  const v = ts?.seconds ? ts.seconds * 1000 : ts;
  return typeof v === "number" ? v : null;
}

function isActiveOffer(offer) {
  if (!offer) return false;
  if (offer.status && offer.status !== "active") return false;
  const now = Date.now();
  const start = toMillis(offer.startAt);
  const end = toMillis(offer.endAt);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function fmtMoneyCOP(n) {
  if (n == null || isNaN(Number(n))) return null;
  try {
    return Number(n).toLocaleString("es-CO");
  } catch {
    return String(n);
  }
}

export default function OfertaDetalleScreen() {
  const route = useRoute();
  const {
    offerId,
    providerUid: providerUidParam,
    serviceId: serviceIdParam,
  } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState(null);
  const [provider, setProvider] = useState(null);

  // Modal solicitud
  const [modalVisible, setModalVisible] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [oferta, setOferta] = useState("");

  // Carga oferta + proveedor con múltiples rutas de fallback
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!offerId) {
          setOffer(null);
          setProvider(null);
          return;
        }
        setLoading(true);

        let offerSnap = null;
        let providerUid = providerUidParam || null;
        let serviceId = serviceIdParam || null;

        // 1) Ruta directa si tenemos ambos: providerUid + serviceId
        if (providerUid && serviceId) {
          offerSnap = await getDoc(
            doc(
              db,
              "users",
              providerUid,
              "services",
              serviceId,
              "offers",
              offerId
            )
          );
        }

        // 2) Compatibilidad: users/{uid}/offers/{offerId}
        if (!offerSnap || !offerSnap.exists()) {
          if (providerUid) {
            const snapCompat = await getDoc(
              doc(db, "users", providerUid, "offers", offerId)
            );
            if (snapCompat.exists()) offerSnap = snapCompat;
          }
        }

        // 3) Fallback universal: buscar por ID en el collectionGroup("offers")
        if (!offerSnap || !offerSnap.exists()) {
          const qcg = query(
            collectionGroup(db, "offers"),
            where(documentId(), "==", offerId),
            limit(1)
          );
          const cgSnap = await getDocs(qcg);
          if (!cgSnap.empty) {
            offerSnap = cgSnap.docs[0];
            // Extraer providerUid y serviceId desde la ruta encontrada:
            // users/{uid}/services/{serviceId}/offers/{offerId}
            const parts = offerSnap.ref.path.split("/");
            // ["users", uid, "services", serviceId, "offers", offerId]  (o también ["users", uid, "offers", offerId])
            if (parts.length >= 6 && parts[2] === "services") {
              providerUid = parts[1];
              serviceId = parts[3];
            } else if (parts.length >= 4) {
              providerUid = parts[1];
              serviceId = serviceId || (offerSnap.data()?.serviceId ?? null);
            }
          }
        }

        let offerData = null;
        let providerSnap = null;

        if (offerSnap && offerSnap.exists()) {
          offerData = { id: offerSnap.id, ...offerSnap.data() };
          if (!offerData.providerUid)
            offerData.providerUid = providerUid || undefined;
          if (!offerData.serviceId)
            offerData.serviceId = serviceId || undefined;

          if (offerData.providerUid) {
            providerSnap = await getDoc(
              doc(db, "users", offerData.providerUid)
            );
          }
        }

        if (cancelled) return;

        setOffer(offerData);
        setProvider(
          providerSnap && providerSnap.exists()
            ? { id: providerSnap.id, ...providerSnap.data() }
            : null
        );
      } catch (e) {
        console.error("Error cargando oferta:", e);
        if (!cancelled) setOffer(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [offerId, providerUidParam, serviceIdParam]);

  const active = useMemo(() => isActiveOffer(offer), [offer]);

  const priceInfo = useMemo(() => {
    const base = offer?.price;
    const pct =
      typeof offer?.discountPct === "number" ? offer.discountPct : null;
    if (base == null) return null;
    if (pct && pct > 0) {
      const final = Math.max(0, Math.round(Number(base) * (1 - pct / 100)));
      return {
        hasDiscount: true,
        baseText: `${fmtMoneyCOP(base)} COP`,
        finalText: `${fmtMoneyCOP(final)} COP`,
        pct,
      };
    }
    return {
      hasDiscount: false,
      baseText: `${fmtMoneyCOP(base)} COP`,
      finalText: `${fmtMoneyCOP(base)} COP`,
      pct: null,
    };
  }, [offer]);

  const dateInfo = useMemo(() => {
    const start = toMillis(offer?.startAt);
    const end = toMillis(offer?.endAt);
    const fmt = (ms) => {
      if (!ms) return null;
      const d = new Date(ms);
      return d.toLocaleDateString("es-CO", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    };
    return { start: fmt(start), end: fmt(end) };
  }, [offer]);

  const handleCall = () => {
    const phone = provider?.phone || provider?.telefono || null;
    if (!phone) {
      Alert.alert(
        "Sin teléfono",
        "Este proveedor no tiene número de contacto registrado."
      );
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert("Error", "No se pudo abrir el marcador telefónico.");
    });
  };

  const enviarSolicitud = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert(
          "Acceso requerido",
          "Debes iniciar sesión para enviar una solicitud."
        );
        return;
      }
      if (!offer || !provider) return;

      const fromSnap = await getDoc(doc(db, "users", user.uid));
      const fromData = fromSnap.exists() ? fromSnap.data() : {};

      await addDoc(collection(db, "requests"), {
        serviceId: offer.serviceId || null,
        serviceName: offer.serviceName || offer.title || "Servicio",
        fromUserUid: user.uid,
        fromUserDisplayName: fromData.displayName || "Sin nombre",
        fromApartment: fromData.apartment || fromData.apartamento || "",
        fromPhone: fromData.phone || "",
        toUserUid: offer.providerUid,
        toUserDisplayName: provider.displayName || "Proveedor",
        description: descripcion || "",
        offer: oferta ? Number(oferta) : null,
        apartment: fromData.apartment || fromData.apartamento || "",
        status: "pendiente",
        createdAt: serverTimestamp(),
        decisionAt: null,
        finalizedAt: null,
        finalizedBy: null,
        rating: null,
        ratingBy: null,
        ratingTargetUid: null,
        offerRef: { providerUid: offer.providerUid, offerId: offer.id },
      });

      // Push al proveedor
      const expoToken = provider?.expoPushToken || null;
      if (expoToken) {
        const fmtCOP = (n) => {
          try {
            return Number(n).toLocaleString("es-CO");
          } catch {
            return String(n);
          }
        };
        await sendExpoPush(expoToken, {
          title: `Nueva solicitud: ${
            offer.serviceName || offer.title || "Servicio"
          }`,
          body:
            `${fromData.displayName || "Un vecino"} envió una solicitud` +
            (oferta ? ` — Oferta: ${fmtCOP(oferta)} COP` : ""),
          data: {
            type: "request:new",
            serviceId: offer.serviceId || null,
            serviceName: offer.serviceName || offer.title || "Servicio",
            fromUserUid: user.uid,
            offerId: offer.id,
            providerUid: offer.providerUid,
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
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!offer) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={22} color="#6b7a90" />
          <Text style={{ marginTop: 8, color: "#6b7a90", fontWeight: "700" }}>
            No se encontró la oferta.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const serviceIcon = SERVICE_ICONS[offer.serviceId] || "pricetag-outline";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        {/* CABECERA */}
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: "#eaf2ff", borderColor: "#cfe2ff" },
            ]}
          >
            <Ionicons name={serviceIcon} size={22} color="#1d4fb8" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.title} numberOfLines={2}>
              {offer.title || "Oferta"}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {offer.serviceName || "Servicio"} •{" "}
              {offer.providerName || "Proveedor"}
            </Text>
          </View>
        </View>

        {/* PRECIO / DESCUENTO */}
        {priceInfo && (
          <View style={styles.priceBox}>
            {priceInfo.hasDiscount ? (
              <>
                <Text style={styles.finalPrice}>{priceInfo.finalText}</Text>
                <Text style={styles.basePrice}>{priceInfo.baseText}</Text>
                <View style={[styles.tag, styles.tagDiscount]}>
                  <Ionicons
                    name="trending-down-outline"
                    size={14}
                    color="#b42318"
                  />
                  <Text style={[styles.tagText, { color: "#b42318" }]}>
                    {"  "}- {priceInfo.pct}%
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.finalPrice}>{priceInfo.finalText}</Text>
            )}
          </View>
        )}

        {/* METADATOS */}
        <View style={styles.metaRow}>
          {offer.minUnits != null && (
            <View style={[styles.pill, styles.pillNeutral]}>
              <Ionicons name="layers-outline" size={14} color="#475569" />
              <Text style={[styles.pillText, { color: "#475569" }]}>
                {"  "}Mín. {offer.minUnits}
              </Text>
            </View>
          )}
          {offer.maxUnits != null && (
            <View style={[styles.pill, styles.pillNeutral]}>
              <Ionicons name="layers-outline" size={14} color="#475569" />
              <Text style={[styles.pillText, { color: "#475569" }]}>
                {"  "}Máx. {offer.maxUnits}
              </Text>
            </View>
          )}
          {dateInfo.start && (
            <View style={[styles.pill, styles.pillNeutral]}>
              <Ionicons name="calendar-outline" size={14} color="#475569" />
              <Text style={[styles.pillText, { color: "#475569" }]}>
                {"  "}Desde {dateInfo.start}
              </Text>
            </View>
          )}
          {dateInfo.end && (
            <View style={[styles.pill, styles.pillNeutral]}>
              <Ionicons name="calendar-outline" size={14} color="#475569" />
              <Text style={[styles.pillText, { color: "#475569" }]}>
                {"  "}Hasta {dateInfo.end}
              </Text>
            </View>
          )}
          {!active && (
            <View style={[styles.pill, styles.pillInactive]}>
              <Ionicons name="pause-circle-outline" size={14} color="#a16207" />
              <Text style={[styles.pillText, { color: "#a16207" }]}>
                {"  "}Oferta inactiva o expirada
              </Text>
            </View>
          )}
        </View>

        {/* DESCRIPCIÓN */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Descripción</Text>
          <Text style={styles.descText}>
            {offer.description || "Sin descripción"}
          </Text>
        </View>

        {/* PROVEEDOR */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Proveedor</Text>
          <View style={styles.providerRow}>
            <View style={styles.providerAvatar}>
              <Text style={styles.providerAvatarText}>
                {(offer.providerName || "P").slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.providerName}>
                {offer.providerName || "Proveedor"}
              </Text>
              <Text style={styles.providerSub}>
                {provider?.isResident ? "Residente" : "Externo recomendado"}
                {!!provider?.apartment && ` • Apt ${provider.apartment}`}
              </Text>

              <View style={styles.reputationRow}>
                <View
                  style={[
                    styles.repChip,
                    { backgroundColor: "#e7f1ff", borderColor: "#d6e6ff" },
                  ]}
                >
                  <Ionicons
                    name="thumbs-up-outline"
                    size={16}
                    color="#0d6efd"
                  />
                  <Text style={[styles.repText, { color: "#0d6efd" }]}>
                    {"  "}
                    {provider?.recommendedCount || 0}
                  </Text>
                </View>
                <View
                  style={[
                    styles.repChip,
                    {
                      marginLeft: 8,
                      backgroundColor: "#fdecef",
                      borderColor: "#f9d6db",
                    },
                  ]}
                >
                  <Ionicons
                    name="thumbs-down-outline"
                    size={16}
                    color="#dc3545"
                  />
                  <Text style={[styles.repText, { color: "#dc3545" }]}>
                    {"  "}
                    {provider?.notRecommendedCount || 0}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.callBtn}
              onPress={handleCall}
              activeOpacity={0.85}
            >
              <Ionicons name="call-outline" size={18} color="#0a58ca" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ACCIONES */}
        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={[styles.primaryBtn, !active && { opacity: 0.6 }]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.9}
            disabled={!active}
          >
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}> Solicitar al proveedor</Text>
          </TouchableOpacity>
          {!active && (
            <Text style={styles.helperInactive}>
              Esta oferta no está activa en este momento.
            </Text>
          )}
        </View>

        {/* MODAL SOLICITUD */}
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
                {offer.serviceName || "Servicio"} →{" "}
                {offer.providerName || "Proveedor"}
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
              />
              <TextInput
                style={styles.input}
                placeholder="Oferta (opcional)"
                placeholderTextColor="#94a3b8"
                value={oferta}
                onChangeText={setOferta}
                keyboardType="numeric"
                inputMode="numeric"
                selectionColor="#0d6efd"
                cursorColor="#0d6efd"
                keyboardAppearance="light"
              />

              <View style={{ flexDirection: "row", marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1, marginRight: 8 }]}
                  onPress={enviarSolicitud}
                >
                  <Ionicons name="send-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}> Enviar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1 }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* === STYLES === */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { flex: 1, backgroundColor: "#f2f5fa", padding: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: "900", color: "#1c2b39" },
  sub: { color: "#667085", marginTop: 2, fontWeight: "700", fontSize: 12 },

  priceBox: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  finalPrice: { fontSize: 20, fontWeight: "900", color: "#0a58ca" },
  basePrice: {
    marginLeft: 8,
    color: "#64748b",
    textDecorationLine: "line-through",
    fontWeight: "800",
  },
  tag: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  tagDiscount: { backgroundColor: "#fff1f0", borderColor: "#ffd1cf" },
  tagText: { fontSize: 12, fontWeight: "800" },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  pillNeutral: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  pillInactive: { backgroundColor: "#fff7ed", borderColor: "#ffedd5" },
  pillText: { fontSize: 12, fontWeight: "800" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e9edf3",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1c2b39",
    marginBottom: 6,
  },
  descText: { color: "#2f3a45", lineHeight: 20 },

  providerRow: { flexDirection: "row", alignItems: "center" },
  providerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f1ff",
    borderWidth: 1,
    borderColor: "#dbe7ff",
  },
  providerAvatarText: { color: "#0a58ca", fontWeight: "900" },
  providerName: { fontWeight: "900", color: "#1c2b39" },
  providerSub: {
    color: "#6b7a90",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  reputationRow: { flexDirection: "row", marginTop: 6 },
  repChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  repText: { fontSize: 12, fontWeight: "900" },

  callBtn: {
    borderWidth: 1,
    borderColor: "#cfe2ff",
    backgroundColor: "#eaf2ff",
    padding: 10,
    borderRadius: 10,
    marginLeft: 8,
  },

  actionsCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#e9edf3",
  },
  primaryBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  helperInactive: {
    color: "#a16207",
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },

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
  cancelBtn: {
    backgroundColor: "#6c757d",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#fff", fontWeight: "800" },
});
