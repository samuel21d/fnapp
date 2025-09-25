// src/screens/OfertasListScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { db } from "../firebaseConfig";
import { collectionGroup, onSnapshot, query, where } from "firebase/firestore";

// Catálogo base: icono y color por categoría
const SERVICE_CATALOG = {
  plomeria: { name: "Plomería", icon: "water-outline", color: "#0a58ca" },
  carpinteria: {
    name: "Carpintería",
    icon: "construct-outline",
    color: "#8a5a44",
  },
  pintura: { name: "Pintura", icon: "color-palette-outline", color: "#c2410c" },
  cerrajeria: { name: "Cerrajería", icon: "key-outline", color: "#0f766e" },
  remodelacion: {
    name: "Remodelación",
    icon: "business-outline",
    color: "#7c3aed",
  },
  sastreria: { name: "Sastrería", icon: "shirt-outline", color: "#9a3412" },
  transporte: { name: "Transporte", icon: "car-outline", color: "#2563eb" },
  papeleria: {
    name: "Papelería",
    icon: "document-text-outline",
    color: "#334155",
  },
  veterinaria: { name: "Veterinaria", icon: "paw-outline", color: "#16a34a" },
};

function fmtMoneyCOP(n) {
  if (n == null || isNaN(Number(n))) return "—";
  try {
    return Number(n).toLocaleString("es-CO");
  } catch {
    return String(n);
  }
}
function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  const v = ts?.seconds ? ts.seconds * 1000 : ts;
  return typeof v === "number" ? v : null;
}
// Soporta ofertas con validFrom/validTo o startAt/endAt
function isActive(offer) {
  if (offer?.active === false) return false;
  const now = Date.now();
  const start =
    toMillis(offer?.validFrom) != null
      ? toMillis(offer?.validFrom)
      : toMillis(offer?.startAt);
  const end =
    toMillis(offer?.validTo) != null
      ? toMillis(offer?.validTo)
      : toMillis(offer?.endAt);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}
function daysLeft(offer) {
  const end =
    toMillis(offer?.validTo) != null
      ? toMillis(offer?.validTo)
      : toMillis(offer?.endAt);
  if (!end) return null;
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function OfertasListScreen() {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]); // ofertas visibles por reglas
  const [queryText, setQueryText] = useState("");
  const [selectedService, setSelectedService] = useState("all");
  const [sortKey, setSortKey] = useState("recent"); // "recent" | "priceAsc" | "priceDesc"

  // Suscripción: SOLO ofertas activas (evita errores de permisos); filtramos vigencia en cliente
  useEffect(() => {
    const qref = query(
      collectionGroup(db, "offers"),
      where("active", "==", true)
    );
    const unsub = onSnapshot(
      qref,
      (snap) => {
        const arr = [];
        snap.forEach((d) => {
          const data = d.data() || {};
          // users/{uid}/services/{serviceId}/offers/{offerId}  o  users/{uid}/offers/{offerId}
          const parts = d.ref.path.split("/");
          let providerUid = null;
          let serviceId = null;
          if (parts.length >= 6 && parts[2] === "services") {
            providerUid = parts[1];
            serviceId = parts[3];
          } else if (parts.length >= 4) {
            providerUid = parts[1];
            serviceId = data.serviceId || null;
          }
          arr.push({ id: d.id, providerUid, serviceId, ...data });
        });
        setOffers(arr);
        setLoading(false);
      },
      (err) => {
        console.error("Error leyendo ofertas:", err);
        setOffers([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Solo activas por vigencia (defensivo)
  const activeOffers = useMemo(() => offers.filter(isActive), [offers]);

  // Chips de servicio presentes
  const serviceChips = useMemo(() => {
    const map = new Map();
    activeOffers.forEach((o) => {
      const id = o.serviceId;
      if (!id) return;
      const label =
        o.serviceName ||
        SERVICE_CATALOG[id]?.name ||
        id[0]?.toUpperCase() + id.slice(1);
      if (id && label) map.set(id, label);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [activeOffers]);

  // Filtro por texto + servicio + orden en memoria
  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    let base = activeOffers;

    if (selectedService !== "all") {
      base = base.filter((o) => o.serviceId === selectedService);
    }
    if (q) {
      base = base.filter((o) => {
        const hay =
          (o.title || "").toLowerCase() +
          " " +
          (o.description || "").toLowerCase() +
          " " +
          (o.serviceName || "").toLowerCase() +
          " " +
          (o.providerName || "").toLowerCase();
        return hay.includes(q);
      });
    }

    if (sortKey === "recent") {
      return [...base].sort(
        (a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0)
      );
    } else if (sortKey === "priceAsc") {
      return [...base].sort(
        (a, b) =>
          (a.price ?? Number.MAX_SAFE_INTEGER) -
          (b.price ?? Number.MAX_SAFE_INTEGER)
      );
    } else if (sortKey === "priceDesc") {
      return [...base].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    }
    return base;
  }, [activeOffers, queryText, selectedService, sortKey]);

  const goDetail = useCallback(
    (offer) => {
      navigation.navigate("OfertaDetalle", {
        offerId: offer.id,
        providerUid: offer.providerUid,
        serviceId: offer.serviceId,
      });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const meta = SERVICE_CATALOG[item.serviceId] || {
        name: item.serviceName || "Servicio",
        icon: "pricetag-outline",
        color: "#667085",
      };
      const bg = `${meta.color}1A`;

      const hasDiscount =
        typeof item.discountPct === "number" && item.discountPct > 0;
      const pricePill = hasDiscount
        ? { text: `-${item.discountPct}%`, type: "discount" }
        : item.price != null
        ? { text: `${fmtMoneyCOP(item.price)} COP`, type: "price" }
        : null;

      const left = daysLeft(item);

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => goDetail(item)}
        >
          <View style={[styles.iconCircle, { backgroundColor: bg }]}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title || "Oferta"}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.serviceName || meta.name} •{" "}
              {item.providerName || "Proveedor"}
            </Text>

            <View style={styles.pillsRow}>
              {pricePill && (
                <View
                  style={[
                    styles.pill,
                    pricePill.type === "discount"
                      ? styles.pillDiscount
                      : styles.pillPrice,
                  ]}
                >
                  <Ionicons
                    name={
                      pricePill.type === "discount"
                        ? "trending-down-outline"
                        : "cash-outline"
                    }
                    size={14}
                    color={
                      pricePill.type === "discount" ? "#b42318" : "#0a58ca"
                    }
                  />
                  <Text
                    style={[
                      styles.pillText,
                      pricePill.type === "discount"
                        ? { color: "#b42318" }
                        : { color: "#0a58ca" },
                    ]}
                  >
                    {"  "}
                    {pricePill.text}
                  </Text>
                </View>
              )}

              {/* Quedan n días */}
              {left != null && (
                <View style={[styles.pill, styles.pillNeutral]}>
                  <Ionicons name="calendar-outline" size={14} color="#475569" />
                  <Text style={[styles.pillText, { color: "#475569" }]}>
                    {"  "}Quedan {left} {left === 1 ? "día" : "días"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color="#9aa4b2" />
        </TouchableOpacity>
      );
    },
    [goDetail]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const Header = () => (
    <View style={styles.header}>
      <Text style={styles.title}>Ofertas de la comunidad</Text>
      <Text style={styles.subtitle}>
        Descubre descuentos y promociones vigentes
      </Text>

      {/* Buscador */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color="#7a8aa0" />
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Buscar (título, servicio, proveedor)"
          placeholderTextColor="#9fb0c4"
          style={styles.searchInput}
        />
        {queryText.length > 0 && (
          <TouchableOpacity onPress={() => setQueryText("")}>
            <Ionicons name="close-circle" size={18} color="#9fb0c4" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtros: servicio */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          onPress={() => setSelectedService("all")}
          style={[
            styles.filterChip,
            selectedService === "all" && styles.filterChipActive,
          ]}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.filterText,
              selectedService === "all" && styles.filterTextActive,
            ]}
          >
            Todas
          </Text>
        </TouchableOpacity>

        {serviceChips.map(([id, label]) => (
          <TouchableOpacity
            key={id}
            onPress={() => setSelectedService(id)}
            style={[
              styles.filterChip,
              selectedService === id && styles.filterChipActive,
            ]}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterText,
                selectedService === id && styles.filterTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Orden */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Ordenar:</Text>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortKey === "recent" && styles.sortChipActive,
          ]}
          onPress={() => setSortKey("recent")}
        >
          <Text
            style={[
              styles.sortText,
              sortKey === "recent" && styles.sortTextActive,
            ]}
          >
            Más recientes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortKey === "priceAsc" && styles.sortChipActive,
          ]}
          onPress={() => setSortKey("priceAsc")}
        >
          <Text
            style={[
              styles.sortText,
              sortKey === "priceAsc" && styles.sortTextActive,
            ]}
          >
            Precio ↑
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sortChip,
            sortKey === "priceDesc" && styles.sortChipActive,
          ]}
          onPress={() => setSortKey("priceDesc")}
        >
          <Text
            style={[
              styles.sortText,
              sortKey === "priceDesc" && styles.sortTextActive,
            ]}
          >
            Precio ↓
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="pricetags-outline" size={22} color="#6b7a90" />
      <Text style={styles.emptyText}>No hay ofertas activas por ahora.</Text>
      <Text style={styles.emptyHint}>
        Vuelve más tarde o busca por otro servicio.
      </Text>
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

  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  filterChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  filterChipActive: { backgroundColor: "#e9f1ff", borderColor: "#cfe2ff" },
  filterText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: "#0a58ca" },

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

  pillsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  pillPrice: { backgroundColor: "#e2f0ff", borderColor: "#cfe2ff" },
  pillDiscount: { backgroundColor: "#fff1f0", borderColor: "#ffd1cf" },
  pillNeutral: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  pillText: { fontSize: 12, fontWeight: "800" },

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
