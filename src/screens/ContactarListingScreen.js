// src/screens/ContactarListingScreen.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
  Image,
  Modal,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
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
    const sep = v.includes("?") ? "&" : "?";
    return `${v}${sep}text=${encodeURIComponent(text)}`;
  }
  const digits = v.replace(/[^\d]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
};

const fmtCOP = (n) => {
  try {
    return Number(n).toLocaleString("es-CO");
  } catch {
    return String(n);
  }
};

// Helper: días restantes para premium
const daysRemaining = (ts) => {
  try {
    const ms =
      typeof ts?.toMillis === "function" ? ts.toMillis() : Date.parse(ts);
    if (!ms || Number.isNaN(ms)) return 0;
    const diff = ms - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  } catch {
    return 0;
  }
};

export default function ContactarListingScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const me = auth.currentUser;

  const {
    ownerUid,
    listingId,
    title: titleParam = "",
    description: descParam = "",
    price: priceParam = null,
    type: typeParam = "sale", // 'sale' | 'rent'
    category: categoryParam = "",
  } = route.params || {};

  const { images: imagesParam = [] } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [prov, setProv] = useState(null); // datos del vendedor
  const [listing, setListing] = useState(null); // datos de la publicación
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const W = Dimensions.get("window").width;

  // Carga vendedor + publicación (si existen)
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);

        // vendedor
        const snapProv = await getDoc(doc(db, "users", String(ownerUid)));
        const p = snapProv.exists() ? snapProv.data() : {};
        const seller = {
          uid: ownerUid,
          displayName: p.displayName || "Vendedor",
          email: p.email || "",
          isResident: !!p.isResident,
          apartment: p.apartment || "",
          phone: p.phone || "",
          bio: p.bio || "",
          expoPushToken: p.expoPushToken || null,
          // Compatibilidad con dos modelos de redes:
          instagramEnabled: !!(
            p.instagramEnabled ?? p?.socials?.instagram?.enabled
          ),
          instagramUrl: p.instagramUrl ?? p?.socials?.instagram?.value ?? "",
          whatsappEnabled: !!(
            p.whatsappEnabled ?? p?.socials?.whatsapp?.enabled
          ),
          whatsappNumber: p.whatsappNumber ?? p?.socials?.whatsapp?.value ?? "",
          otherEnabled: !!(p.otherEnabled ?? p?.socials?.other?.enabled),
          otherUrl: p.otherUrl ?? p?.socials?.other?.value ?? "",
          recommendedCount: p.recommendedCount || 0,
          premiumExpiresAt: p.premiumExpiresAt ?? null,
          avatarUrl: p.avatarUrl ?? "",
        };

        // publicación (si existe el doc), si no, usa params
        let pub = {
          id: listingId,
          title: titleParam,
          description: descParam,
          price: priceParam,
          type: typeParam,
          category: categoryParam,
		  images: Array.isArray(imagesParam) ? imagesParam.slice(0, 2) : [],
        };
        if (ownerUid && listingId) {
          try {
            const snapList = await getDoc(
              doc(db, "users", String(ownerUid), "listings", String(listingId))
            );
            if (snapList.exists()) {
              const d = snapList.data() || {};
              pub = {
                id: listingId,
                title: d.title ?? titleParam,
                description: d.description ?? descParam,
                price: d.price ?? priceParam,
                type: d.type ?? typeParam,
                category: d.category ?? categoryParam,
				images: Array.isArray(d.images) ? d.images.slice(0, 2) : [],
              };
            }
          } catch {
            /* usa params */
          }
        }

        if (!mounted) return;
        setProv(seller);
        setListing(pub);
      } catch (e) {
        console.error("Error cargando vendedor/publicación:", e);
        if (mounted) {
          setProv(null);
          setListing(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (ownerUid) load();
    return () => {
      mounted = false;
    };
  }, [ownerUid, listingId]);

  const initials = useMemo(() => {
    const name = prov?.displayName || "VD";
    return name.trim().slice(0, 2).toUpperCase();
  }, [prov?.displayName]);

  const isSale = listing?.type === "sale";
  const typeLabel = isSale ? "Venta" : "Arriendo";

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
      prov?.displayName || ""
    }, te contacto por tu publicación: "${listing?.title || ""}".`;
    const url = toWaLink(prov?.whatsappNumber, text);
    if (!url) return Alert.alert("WhatsApp", "No hay número o enlace válido.");
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("WhatsApp", "No se pudo abrir WhatsApp.");
    }
  }, [prov, listing]);

  const openOther = useCallback(async () => {
    const url = ensureHttp(prov?.otherUrl);
    if (!url) return Alert.alert("Enlace", "No hay URL válida.");
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Enlace", "No se pudo abrir el enlace.");
    }
  }, [prov]);

  const solicitarDesdeLaApp = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Debes iniciar sesión");
        return;
      }
      if (!prov || !listing) return;
      if (user.uid === prov.uid) {
        Alert.alert("Ups", "No puedes enviarte una solicitud a ti mismo.");
        return;
      }

      // Cargar datos breves de ambos
      const fromSnap = await getDoc(doc(db, "users", user.uid));
      const fromData = fromSnap.exists() ? fromSnap.data() : {};
      const toSnap = await getDoc(doc(db, "users", prov.uid));
      const toData = toSnap.exists() ? toSnap.data() : {};

      // Mensaje auto-generado usando la info del listing
      const autoDesc =
        `Solicitud automática desde Mercado\n\n` +
        `Publicación: "${listing.title}"\n` +
        `Tipo: ${typeLabel}\n` +
        (listing.category ? `Categoría: ${listing.category}\n` : "") +
        (listing.price != null
          ? `Precio/Canon: ${fmtCOP(listing.price)} COP\n`
          : "") +
        (listing.description
          ? `\nDescripción del producto:\n${listing.description}\n`
          : "");

      await addDoc(collection(db, "requests"), {
        serviceId: "listing", // etiqueta genérica para Mercado
        serviceName: listing.title || "Publicación del mercado",
        fromUserUid: user.uid,
        fromUserDisplayName: fromData.displayName || "Sin nombre",
        fromApartment: fromData.apartment || "",
        fromPhone: fromData.phone || "",
        toUserUid: prov.uid,
        toUserDisplayName: toData.displayName || prov.displayName || "Vendedor",
        description: autoDesc,
        offer: null,
        apartment: fromData.apartment || "",
        status: "pendiente",
        createdAt: serverTimestamp(),
        decisionAt: null,
        finalizedAt: null,
        finalizedBy: null,
        rating: null,
        ratingBy: null,
        ratingTargetUid: null,
        // referencia opcional para trazabilidad
        listingRef: {
          ownerUid,
          listingId,
          title: listing.title || "",
          type: listing.type || "",
          category: listing.category || "",
          price: listing.price ?? null,
        },
      });

      const expoToken = prov.expoPushToken || toData.expoPushToken || null;
      if (expoToken) {
        await sendExpoPush(expoToken, {
          title: `Interés en tu publicación`,
          body: `${fromData.displayName || "Un vecino"} pidió "${
            listing.title || "tu artículo"
          }"`,
          data: {
            type: "request:new",
            serviceId: "listing",
            serviceName: listing.title || "Publicación del mercado",
            fromUserUid: user.uid,
          },
        });
      }

      Alert.alert("Solicitud enviada", "El vendedor recibirá tu solicitud.");
      navigation.goBack();
    } catch (e) {
      console.error("Error creando solicitud:", e);
      Alert.alert("Error", "No se pudo enviar la solicitud.");
    }
  }, [prov, listing, ownerUid, listingId, navigation, typeLabel]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!prov || !listing) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.loader}>
          <Ionicons name="alert-circle-outline" size={22} color="#6b7a90" />
          <Text style={{ color: "#6b7a90", fontWeight: "700", marginTop: 6 }}>
            No se pudo cargar la información.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Card perfil vendedor */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            {daysRemaining(prov?.premiumExpiresAt) > 0 && !!prov?.avatarUrl ? (
              <Image source={{ uri: prov.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
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

        {/* Card publicación */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Publicación</Text>
          <View style={styles.pubRow}>
            <View
              style={[
                styles.pubPill,
                isSale ? styles.pillBlue : styles.pillGreen,
              ]}
            >
              <Ionicons
                name={isSale ? "pricetag-outline" : "home-outline"}
                size={14}
                color={isSale ? "#0a58ca" : "#0f766e"}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: isSale ? "#0a58ca" : "#0f766e" },
                ]}
              >
                {"  "}
                {isSale ? "Venta" : "Arriendo"}
              </Text>
            </View>
            {!!listing.category && (
              <View style={[styles.pubPill, styles.pillGray]}>
                <Ionicons name="pricetags-outline" size={14} color="#475569" />
                <Text style={[styles.pillText, { color: "#475569" }]}>
                  {"  "}
                  {listing.category}
                </Text>
              </View>
            )}
            {listing.price != null && (
              <View style={[styles.pubPill, styles.pillGray]}>
                <Ionicons name="cash-outline" size={14} color="#475569" />
                <Text style={[styles.pillText, { color: "#475569" }]}>
                  {"  "}
                  {fmtCOP(listing.price)} COP
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.nameText, { fontSize: 16, marginTop: 6 }]}>
            {listing.title}
          </Text>
          {!!listing.description && (
            <>
              <Text style={[styles.subTitle, { marginTop: 8 }]}>
                Descripción del producto
              </Text>
              <Text style={styles.bioText}>{listing.description}</Text>
            </>
          )}
          {Array.isArray(listing?.images) && listing.images.length > 0 ? (
            <>
              <Text style={[styles.subTitle, { marginTop: 10 }]}>Fotos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
                contentContainerStyle={{ gap: 10 }}
              >
                {listing.images.map((ph, idx) =>
                  ph?.url ? (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.9}
                      onPress={() => {
                        setZoomIndex(idx);
                        setZoomOpen(true);
                      }}
                    >
                      <Image
                        source={{ uri: ph.url }}
                        style={{
                          width: W * 0.8,
                          height: 220,
                          borderRadius: 12,
                          backgroundColor: "#f1f5f9",
                        }}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ) : null
                )}
              </ScrollView>
            </>
          ) : null}
        </View>

        {/* Acciones */}
        <View className="card" style={styles.card}>
          <Text style={styles.cardTitle}>Opciones de contacto</Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 10 }]}
            onPress={solicitarDesdeLaApp}
            activeOpacity={0.9}
          >
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}> Solicitar desde la app</Text>
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
      <Modal
        visible={zoomOpen}
        transparent
        onRequestClose={() => setZoomOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)" }}>
          <TouchableOpacity
            onPress={() => setZoomOpen(false)}
            style={{ position: "absolute", top: 40, right: 20, zIndex: 2 }}
            activeOpacity={0.9}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
              Cerrar
            </Text>
          </TouchableOpacity>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: zoomIndex * W, y: 0 }}
            style={{ flex: 1 }}
          >
            {(listing?.images || []).map((ph, idx) =>
              ph?.url ? (
                <View
                  key={idx}
                  style={{ width: W, alignItems: "center", justifyContent: "center" }}
                >
                  <Image
                    source={{ uri: ph.url }}
                    style={{ width: W * 0.95, height: "70%", borderRadius: 12 }}
                    resizeMode="contain"
                  />
                </View>
              ) : null
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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

  pubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  pubPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillBlue: { backgroundColor: "#eaf2ff", borderColor: "#cfe2ff" },
  pillGreen: { backgroundColor: "#d1fae5", borderColor: "#a7f3d0" },
  pillGray: { backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" },
  pillText: { fontSize: 12, fontWeight: "900" },

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
});
