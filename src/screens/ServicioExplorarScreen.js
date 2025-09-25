// src/screens/ServicioExplorarScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { auth, db } from "../firebaseConfig";
import {
  collectionGroup,
  getDocs,
  doc,
  getDoc,
  collection,
} from "firebase/firestore";

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
function isOfferActive(o) {
  if (!o) return false;
  if (o.active === false) return false;
  const now = Date.now();
  const start =
    toMillis(o.validFrom) != null ? toMillis(o.validFrom) : toMillis(o.startAt);
  const end =
    toMillis(o.validTo) != null ? toMillis(o.validTo) : toMillis(o.endAt);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}
function daysLeft(endMs) {
  if (!endMs) return null;
  const now = Date.now();
  const diff = endMs - now;
  if (diff <= 0) return 0;
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.ceil(diff / oneDay);
}
function fmtMoneyCOP(n) {
  if (n == null || isNaN(Number(n))) return null;
  try {
    return Number(n).toLocaleString("es-CO");
  } catch {
    return String(n);
  }
}
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

export default function ServicioExplorarScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const me = auth.currentUser;

  const { serviceId, serviceName } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]); // [{...perfil, offerSummary}]
  const [queryText, setQueryText] = useState("");

  const targetKeys = useMemo(() => {
    const arr = [norm(serviceId), norm(serviceName)].filter(Boolean);
    return Array.from(new Set(arr));
  }, [serviceId, serviceName]);

  useEffect(() => {
    let mounted = true;

    async function fetchBestOfferForProvider(uid) {
      try {
        const all = [];
        try {
          const snapA = await getDocs(
            collection(
              db,
              "users",
              uid,
              "services",
              String(serviceId),
              "offers"
            )
          );
          snapA.forEach((d) =>
            all.push({ id: d.id, providerUid: uid, ...d.data() })
          );
        } catch (_) {}
        try {
          const snapB = await getDocs(collection(db, "users", uid, "offers"));
          snapB.forEach((d) => {
            const data = d.data() || {};
            if (norm(data.serviceId) === norm(serviceId)) {
              all.push({ id: d.id, providerUid: uid, ...data });
            }
          });
        } catch (_) {}

        const actives = all.filter(isOfferActive);
        if (actives.length === 0) return null;

        const withEnd = actives
          .map((o) => ({
            o,
            end: toMillis(o.validTo) ?? toMillis(o.endAt) ?? Infinity,
          }))
          .sort((a, b) => a.end - b.end);
        const chosen = withEnd[0].o;

        const endMs =
          toMillis(chosen.validTo) ?? toMillis(chosen.endAt) ?? null;
        const price = chosen.price != null ? Number(chosen.price) : null;
        const discountPct =
          typeof chosen.discountPct === "number" ? chosen.discountPct : null;

        return {
          offerId: chosen.id,
          providerUid: uid,
          price,
          discountPct,
          endMs,
          title: chosen.title || null,
        };
      } catch {
        return null;
      }
    }

    async function load() {
      try {
        setLoading(true);
        const uidSet = new Set();

        const snap = await getDocs(collectionGroup(db, "services"));
        snap.forEach((d) => {
          const keys = docServiceKeys(d);
          if (keys.some((k) => targetKeys.includes(k))) {
            const uid = d.ref.parent?.parent?.id;
            if (uid) uidSet.add(uid);
          }
        });

        if (me?.uid) {
          let iOfferIt = false;
          try {
            const mySnap = await getDocs(
              collection(db, "users", me.uid, "services")
            );
            mySnap.forEach((d) => {
              const keys = docServiceKeys(d);
              if (keys.some((k) => targetKeys.includes(k))) iOfferIt = true;
            });
          } catch {}
          if (iOfferIt) uidSet.add(me.uid);
        }

        const results = [];
        for (const uid of uidSet) {
          const usnap = await getDoc(doc(db, "users", uid));
          const udata = usnap.exists() ? usnap.data() : {};

          const offerSummary = await fetchBestOfferForProvider(uid);

          results.push({
            uid,
            displayName: udata.displayName || "Sin nombre",
            isResident: !!udata.isResident,
            apartment: udata.apartment || "",
            recommendedCount: udata.recommendedCount || 0,
            expoPushToken: udata.expoPushToken || null,
            isMe: me?.uid === uid,
            offerSummary,
          });
        }

        if (!mounted) return;
        results.sort((a, b) => {
          const ao = a.offerSummary ? 1 : 0;
          const bo = b.offerSummary ? 1 : 0;
          if (bo - ao !== 0) return bo - ao;
          const ar = a.recommendedCount || 0;
          const br = b.recommendedCount || 0;
          if (br - ar !== 0) return br - ar;
          return (a.displayName || "").localeCompare(b.displayName || "");
        });

        setProviders(results);
      } catch (e) {
        console.error("Error cargando proveedores/ofertas:", e);
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
  }, [targetKeys, me?.uid, serviceId]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) =>
      (p.displayName || "").toLowerCase().includes(q)
    );
  }, [providers, queryText]);

  const goContact = useCallback(
    (prov) => {
      if (!prov || prov.isMe) return;
      const o = prov.offerSummary || {};
      navigation.navigate("ContactarProveedor", {
        providerUid: prov.uid,
        providerName: prov.displayName,
        serviceId,
        serviceName,
        offerId: o.offerId || null,
        discountPct: typeof o.discountPct === "number" ? o.discountPct : null,
        validTo: o.endMs || null,
      });
    },
    [navigation, serviceId, serviceName]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const iconName = SERVICE_ICONS[serviceId] || "pricetag-outline";

      let pills = [];
      if (item.offerSummary) {
        const { price, discountPct, endMs } = item.offerSummary;
        if (typeof discountPct === "number" && discountPct > 0) {
          pills.push({
            key: "disc",
            color: "#b42318",
            bg: "#fff1f0",
            bdc: "#ffd1cf",
            icon: "trending-down-outline",
            text: `-${discountPct}%`,
          });
        } else if (price != null) {
          pills.push({
            key: "price",
            color: "#0a58ca",
            bg: "#e2f0ff",
            bdc: "#cfe2ff",
            icon: "cash-outline",
            text: `${fmtMoneyCOP(price)} COP`,
          });
        }
        const left = daysLeft(endMs);
        if (left != null) {
          pills.push({
            key: "left",
            color: "#475569",
            bg: "#f8fafc",
            bdc: "#e2e8f0",
            icon: "hourglass-outline",
            text: `Quedan ${left} día${left === 1 ? "" : "s"}`,
          });
        }
      } else {
        pills.push({
          key: "nooffer",
          color: "#475569",
          bg: "#f8fafc",
          bdc: "#e2e8f0",
          icon: "pricetag-outline",
          text: "Sin oferta activa",
        });
      }

      return (
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: "#eaf2ff" }]}>
            <Ionicons name={iconName} size={22} color="#1d4fb8" />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.displayName}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {serviceName} •{" "}
              {item.isResident ? "Residente" : "Externo recomendado"}
              {item.apartment ? ` • Apt ${item.apartment}` : ""}
              {item.isMe ? " • Tú" : ""}
            </Text>

            <View style={styles.pillsRow}>
              {pills.map((p) => (
                <View
                  key={p.key}
                  style={[
                    styles.pill,
                    { backgroundColor: p.bg, borderColor: p.bdc },
                  ]}
                >
                  <Ionicons name={p.icon} size={14} color={p.color} />
                  <Text style={[styles.pillText, { color: p.color }]}>
                    {"  "}
                    {p.text}
                  </Text>
                </View>
              ))}
            </View>

            {/* Reputación (solo estrella) + CTA Contactar */}
            <View style={styles.reputationRow}>
              <Text style={styles.repInlineLabel}>Reputación:</Text>
              <View
                style={[
                  styles.repChip,
                  { backgroundColor: "#fff7e6", borderColor: "#ffe8b0" },
                ]}
              >
                <Ionicons name="star" size={16} color="#f59f00" />
                <Text style={[styles.repText, { color: "#b45309" }]}>
                  {"  "}
                  {item.recommendedCount || 0}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.viewOfferBtn, item.isMe && { opacity: 0.35 }]}
                onPress={() => goContact(item)}
                activeOpacity={0.85}
                disabled={item.isMe}
                accessibilityLabel={`Contactar a ${item.displayName}`}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={14}
                  color="#1d4fb8"
                />
                <Text style={styles.viewOfferText}> Contactar</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color="#9aa4b2" />
        </View>
      );
    },
    [goContact, serviceName, serviceId]
  );

  const keyExtractor = useCallback((item) => item.uid, []);

  const Header = () => (
    <View style={styles.header}>
      <Text style={styles.title}>Proveedores de {serviceName}</Text>
      <Text style={styles.subtitle}>
        Usa el botón{" "}
        <Text style={{ fontWeight: "900", color: "#0a58ca" }}>“Contactar”</Text>{" "}
        para solicitar el servicio.
      </Text>

      <View className="search" style={styles.searchRow}>
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
    </View>
  );

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="people-outline" size={22} color="#6b7a90" />
      <Text style={styles.emptyText}>
        No hay proveedores para este servicio.
      </Text>
      <Text style={styles.emptyHint}>Vuelve más tarde.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListHeaderComponent={Header}
            ListEmptyComponent={Empty}
            contentContainerStyle={{ paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/* === STYLES === */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { flex: 1, backgroundColor: "#f2f5fa" },

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

  card: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  cardTitle: { fontWeight: "800", color: "#1c2b39" },
  cardSub: { marginTop: 2, color: "#667085", fontSize: 12, fontWeight: "700" },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: "800" },

  /* Reputación + CTA Contactar */
  reputationRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  repInlineLabel: {
    color: "#334155",
    fontWeight: "800",
    marginRight: 6,
    fontSize: 12,
  },
  repChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  repText: { fontSize: 12, fontWeight: "900" },

  viewOfferBtn: {
    marginLeft: "auto",
    backgroundColor: "#eaf2ff",
    borderColor: "#cfe2ff",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
  },
  viewOfferText: { color: "#1d4fb8", fontWeight: "800", fontSize: 12 },

  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { alignItems: "center", paddingHorizontal: 24, paddingTop: 20 },
  emptyText: {
    color: "#6b7a90",
    textAlign: "center",
    marginTop: 8,
    fontWeight: "700",
  },
  emptyHint: {
    color: "#6b7a90",
    textAlign: "center",
    marginTop: 4,
    fontSize: 12,
  },
});
