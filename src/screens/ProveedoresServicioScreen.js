// src/screens/ProveedoresServicioScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth, db } from "../firebaseConfig";
import {
  collectionGroup,
  getDocs,
  doc,
  getDoc,
  collection,
  query,
  where,
} from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";

/* === Helpers === */
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
function norm(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function docServiceKeys(d) {
  const data = d.data() || {};
  return [d.id, data.id, data.serviceId, data.name].filter(Boolean).map(norm);
}
function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  const v = ts?.seconds ? ts.seconds * 1000 : ts;
  return typeof v === "number" ? v : null;
}
function isOfferActive(offer) {
  if (!offer) return false;
  if (offer.active === false) return false;
  const now = Date.now();
  const start = toMillis(offer.validFrom) ?? toMillis(offer.startAt);
  const end = toMillis(offer.validTo) ?? toMillis(offer.endAt);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}
function fmtDate(ms) {
  if (!ms) return null;
  try {
    const d = new Date(ms);
    return d.toLocaleDateString("es-CO", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

export default function ProveedoresServicioScreen({ route }) {
  const navigation = useNavigation();
  const { serviceId, serviceName } = route.params || {};
  const me = auth.currentUser;

  // Datos
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]); // [{ uid, ...perfil, isMe, activeOffer }]
  const [queryText, setQueryText] = useState("");
  const [sortKey, setSortKey] = useState("reputation"); // "reputation" | "nameAsc" | "nameDesc"

  const targetKeys = useMemo(() => {
    const arr = [norm(serviceId), norm(serviceName)].filter(Boolean);
    return Array.from(new Set(arr));
  }, [serviceId, serviceName]);

  // Cargar proveedores + su promoción activa (si existe)
  useEffect(() => {
    let mounted = true;

    async function fetchActiveOffer(uid) {
      try {
        // 1) Ofertas anidadas bajo el servicio
        const nestedCol = collection(
          db,
          "users",
          uid,
          "services",
          String(serviceId),
          "offers"
        );
        const qNested = query(nestedCol, where("active", "==", true));
        const nestedSnap = await getDocs(qNested);

        // 2) Ofertas en /users/{uid}/offers filtradas por serviceId
        const rootCol = collection(db, "users", uid, "offers");
        const qRoot = query(
          rootCol,
          where("serviceId", "==", String(serviceId)),
          where("active", "==", true)
        );
        const rootSnap = await getDocs(qRoot);

        const candidates = [];
        nestedSnap.forEach((d) => candidates.push({ id: d.id, ...d.data() }));
        rootSnap.forEach((d) => candidates.push({ id: d.id, ...d.data() }));

        let best = null;
        candidates.forEach((data) => {
          if (!isOfferActive(data)) return;
          if (!best) best = data;
          else {
            const a = toMillis(best.createdAt) || 0;
            const b = toMillis(data.createdAt) || 0;
            if (b > a) best = data;
          }
        });
        return best; // null si no hay activa
      } catch {
        return null;
      }
    }

    async function load() {
      try {
        setLoading(true);
        const uidSet = new Set();

        // 1) Encontrar todos los uids que ofrecen este servicio
        const snap = await getDocs(collectionGroup(db, "services"));
        snap.forEach((d) => {
          const keys = docServiceKeys(d);
          if (keys.some((k) => targetKeys.includes(k))) {
            const uid = d.ref.parent?.parent?.id; // users/{uid}/services/{serviceId}
            if (uid) uidSet.add(uid);
          }
        });

        // 2) Incluye al usuario actual si también ofrece
        if (me?.uid) {
          let iOfferIt = false;
          if (serviceId) {
            try {
              const direct = await getDoc(
                doc(db, "users", me.uid, "services", String(serviceId))
              );
              iOfferIt = direct.exists();
            } catch {}
          }
          if (!iOfferIt) {
            const mySnap = await getDocs(
              collection(db, "users", me.uid, "services")
            );
            mySnap.forEach((d) => {
              const keys = docServiceKeys(d);
              if (keys.some((k) => targetKeys.includes(k))) iOfferIt = true;
            });
          }
          if (iOfferIt) uidSet.add(me.uid);
        }

        // 3) Cargar perfil + su promoción activa
        const list = [];
        for (const uid of uidSet) {
          const uref = doc(db, "users", uid);
          const usnap = await getDoc(uref);
          const udata = usnap.exists() ? usnap.data() : {};
          const activeOffer = await fetchActiveOffer(uid);

          list.push({
            uid,
            displayName: udata.displayName || "Sin nombre",
            isResident: !!udata.isResident,
            apartment: udata.apartment || "",
            recommendedCount: udata.recommendedCount || 0,
            notRecommendedCount: udata.notRecommendedCount || 0,
            isMe: me?.uid === uid,
            activeOffer, // null | {id, discountPct, validFrom/To, ...}
          });
        }

        if (!mounted) return;
        setProviders(list);
      } catch (e) {
        console.error("Error cargando proveedores:", e);
        if (!mounted) return;
        setProviders([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [me?.uid, targetKeys, serviceId]);

  // Filtro + orden
  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    let base = providers;

    if (q) {
      base = base.filter((p) =>
        (p.displayName || "").toLowerCase().includes(q)
      );
    }

    if (sortKey === "reputation") {
      return [...base].sort((a, b) => {
        const ra = (a.recommendedCount || 0) - (a.notRecommendedCount || 0);
        const rb = (b.recommendedCount || 0) - (b.notRecommendedCount || 0);
        return rb - ra;
      });
    } else if (sortKey === "nameAsc") {
      return [...base].sort((a, b) =>
        (a.displayName || "").localeCompare(b.displayName || "")
      );
    } else if (sortKey === "nameDesc") {
      return [...base]
        .sort((a, b) =>
          (a.displayName || "").localeCompare(b.displayName || "")
        )
        .reverse();
    }
    return base;
  }, [providers, queryText, sortKey]);

  const serviceIcon = SERVICE_ICONS[serviceId] || "briefcase-outline";

  const Header = () => (
    <View style={styles.header}>
      <Text style={styles.title}>Proveedores de {serviceName}</Text>
      <Text style={styles.subtitle}>Elige un proveedor y toca “Contactar”</Text>

      {/* Buscador */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color="#7a8aa0" />
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Buscar proveedor por nombre"
          placeholderTextColor="#9fb0c4"
          style={styles.searchInput}
        />
        {queryText.length > 0 && (
          <TouchableOpacity onPress={() => setQueryText("")}>
            <Ionicons name="close-circle" size={18} color="#9fb0c4" />
          </TouchableOpacity>
        )}
      </View>

      {/* Orden */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Ordenar:</Text>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortKey === "reputation" && styles.sortChipActive,
          ]}
          onPress={() => setSortKey("reputation")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.sortText,
              sortKey === "reputation" && styles.sortTextActive,
            ]}
          >
            Mejor reputación
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortKey === "nameAsc" && styles.sortChipActive,
          ]}
          onPress={() => setSortKey("nameAsc")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.sortText,
              sortKey === "nameAsc" && styles.sortTextActive,
            ]}
          >
            Nombre A–Z
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortKey === "nameDesc" && styles.sortChipActive,
          ]}
          onPress={() => setSortKey("nameDesc")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.sortText,
              sortKey === "nameDesc" && styles.sortTextActive,
            ]}
          >
            Nombre Z–A
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const Empty = () => (
    <View style={styles.centerPad}>
      <Ionicons name="people-outline" size={24} color="#6b7a90" />
      <Text
        style={{
          textAlign: "center",
          color: "#445",
          marginTop: 8,
          fontWeight: "700",
        }}
      >
        No hay proveedores para este servicio.
      </Text>
    </View>
  );

  const goContact = useCallback(
    (prov) => {
      if (prov.isMe) return;
      navigation.navigate("ContactarProveedor", {
        providerUid: prov.uid,
        providerName: prov.displayName,
        serviceId,
        serviceName,
        offerId: prov.activeOffer?.id || null,
        discountPct:
          typeof prov.activeOffer?.discountPct === "number"
            ? prov.activeOffer.discountPct
            : null,
        validFrom:
          toMillis(prov.activeOffer?.validFrom) ??
          toMillis(prov.activeOffer?.startAt) ??
          null,
        validTo:
          toMillis(prov.activeOffer?.validTo) ??
          toMillis(prov.activeOffer?.endAt) ??
          null,
      });
    },
    [navigation, serviceId, serviceName]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const hasPromo = !!item.activeOffer;
      const pct =
        typeof item.activeOffer?.discountPct === "number"
          ? item.activeOffer.discountPct
          : null;
      const endText = fmtDate(
        toMillis(item.activeOffer?.validTo) ?? toMillis(item.activeOffer?.endAt)
      );

      const bg = "#eaf2ff";
      const border = "#cfe2ff";

      return (
        <View style={styles.card}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: bg, borderColor: border },
            ]}
          >
            <Ionicons name={serviceIcon} size={22} color="#1d4fb8" />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.displayName}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.isResident
                ? `Residente${item.apartment ? ` • Apt ${item.apartment}` : ""}`
                : "Externo recomendado"}
              {item.isMe ? " • Tú" : ""}
            </Text>

            <View style={styles.pillsRow}>
              {/* Reputación */}
              <View style={[styles.pill, styles.pillNeutral]}>
                <Ionicons name="thumbs-up-outline" size={14} color="#0d6efd" />
                <Text style={[styles.pillText, { color: "#0d6efd" }]}>
                  {"  "}
                  {item.recommendedCount || 0}
                </Text>
              </View>
              <View style={[styles.pill, styles.pillNeutral]}>
                <Ionicons
                  name="thumbs-down-outline"
                  size={14}
                  color="#dc3545"
                />
                <Text style={[styles.pillText, { color: "#dc3545" }]}>
                  {"  "}
                  {item.notRecommendedCount || 0}
                </Text>
              </View>

              {/* Promoción / Sin promoción */}
              {hasPromo ? (
                <>
                  <View style={[styles.pill, styles.pillDiscount]}>
                    <Ionicons
                      name="pricetag-outline"
                      size={14}
                      color="#b42318"
                    />
                    <Text style={[styles.pillText, { color: "#b42318" }]}>
                      {"  "}
                      {pct != null ? `-${pct}%` : "Promoción"}
                    </Text>
                  </View>
                  {endText && (
                    <View style={[styles.pill, styles.pillNeutral]}>
                      <Ionicons
                        name="calendar-outline"
                        size={14}
                        color="#475569"
                      />
                      <Text style={[styles.pillText, { color: "#475569" }]}>
                        {"  "}
                        Hasta {endText}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={[styles.pill, styles.pillNeutral]}>
                  <Ionicons name="pricetag-outline" size={14} color="#475569" />
                  <Text style={[styles.pillText, { color: "#475569" }]}>
                    {"  "}
                    Sin promoción
                  </Text>
                </View>
              )}
            </View>

            {/* === CTA: Contactar (reutiliza el espacio del antiguo "Ver oferta") === */}
            <View style={styles.ctaRow}>
              <TouchableOpacity
                style={[styles.ctaBtn, item.isMe && { opacity: 0.35 }]}
                onPress={() => !item.isMe && goContact(item)}
                disabled={item.isMe}
                activeOpacity={0.9}
                accessibilityLabel={`Contactar a ${item.displayName}`}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={16}
                  color="#fff"
                />
                <Text style={styles.ctaBtnText}>
                  {item.isMe ? " No disponible" : " Contactar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    },
    [goContact, serviceIcon]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <View style={styles.container}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          ListHeaderComponent={Header}
          ListEmptyComponent={Empty}
          contentContainerStyle={{ paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      </View>
    </View>
  );
}

/* === STYLES === */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { flex: 1, backgroundColor: "#f2f5fa" },

  // Header (estilo OfertasList)
  header: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0a58ca",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "#5a6a80",
    marginTop: 2,
    marginBottom: 10,
    fontWeight: "700",
  },

  searchRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f6f8fc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 42,
  },
  searchInput: { flex: 1, paddingLeft: 8, color: "#0f172a" },

  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  sortLabel: { color: "#5a6a80", fontWeight: "700" },
  sortChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  sortChipActive: { backgroundColor: "#eef6ff", borderColor: "#cfe2ff" },
  sortText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  sortTextActive: { color: "#0a58ca" },

  // Cards estilo Ofertas
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e9edf3",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cardTitle: { fontWeight: "800", color: "#1c2b39" },
  cardSub: { marginTop: 2, color: "#667085", fontSize: 12, fontWeight: "700" },

  pillsRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  pillNeutral: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  pillDiscount: { backgroundColor: "#fff1f0", borderColor: "#ffd1cf" },
  pillText: { fontSize: 12, fontWeight: "800" },

  // CTA reutilizada (antes “Ver oferta”)
  ctaRow: { marginTop: 10 },
  ctaBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ctaBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  centerPad: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
  },
});
