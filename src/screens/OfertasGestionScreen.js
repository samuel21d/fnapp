import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { auth, db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

function asMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  try {
    return new Date(ts).getTime() || 0;
  } catch {
    return 0;
  }
}

function parseDate(ts) {
  if (!ts) return null;
  return typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
}

function daysLeftText(validTo) {
  const end = parseDate(validTo);
  if (!end) return null;
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days > 1) return `Quedan ${days} días`;
  if (days === 1) return "Queda 1 día";
  if (days <= 0) return "Vencida";
  return null;
}

// 🔧 Helper para forzar el modo “Promoción”
function promoParams(serviceId, serviceName, mode = "create", extra = {}) {
  return {
    mode,
    ...(serviceId ? { serviceId } : {}),
    ...(serviceName ? { serviceName } : {}),
    discountOnly: true,
    discountStep: 5,
    maxDiscount: 90,
    hidePrice: true,
    forceTitle: true,
    titlePreset: "Promoción",
    uiModeTitle: mode === "edit" ? "Editar promoción" : "Crear promoción",
    ...extra,
  };
}

export default function OfertasGestionScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const user = auth.currentUser;

  const filterServiceId =
    route.params?.serviceId ?? route.params?.filter?.serviceId ?? null;
  const filterServiceName =
    route.params?.serviceName ?? route.params?.filter?.serviceName ?? null;

  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const baseCol = collection(db, "users", user.uid, "offers");
    const qRef = filterServiceId
      ? query(baseCol, where("serviceId", "==", filterServiceId))
      : baseCol;

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort(
          (a, b) =>
            asMillis(b.updatedAt) - asMillis(a.updatedAt) ||
            asMillis(b.createdAt) - asMillis(a.createdAt)
        );
        setOffers(arr);
        setLoading(false);
      },
      (err) => {
        console.error("offers load error:", err);
        setOffers([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.uid, filterServiceId]);

  const headerTitle = useMemo(() => {
    const base = route.params?.uiTitle || "Mis promociones";
    return filterServiceId
      ? `${base} · ${filterServiceName || filterServiceId}`
      : base;
  }, [filterServiceId, filterServiceName, route.params?.uiTitle]);

  const onNew = useCallback(() => {
    navigation.navigate(
      "OfertaForm",
      promoParams(filterServiceId, filterServiceName, "create")
    );
  }, [navigation, filterServiceId, filterServiceName]);

  const toggleActive = async (offer) => {
    try {
      await updateDoc(doc(db, "users", user.uid, "offers", offer.id), {
        active: !offer.active,
        updatedAt: new Date(),
      });
    } catch (e) {
      Alert.alert("Error", "No se pudo cambiar el estado.");
    }
  };

  const remove = (offer) => {
    Alert.alert(
      "Eliminar promoción",
      "¿Seguro que deseas eliminarla? Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", user.uid, "offers", offer.id));
            } catch {
              Alert.alert("Error", "No se pudo eliminar.");
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => {
    const s = item;
    const isActive = !!s.active;
    const left = daysLeftText(s.validTo);

    return (
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{s.title || "Promoción"}</Text>
          <Text style={styles.sub}>
            {s.serviceName || s.serviceId || "Servicio"}
            {s.discountPct != null ? `  —  ${s.discountPct}% off` : ""}
          </Text>

          <View style={styles.rowChips}>
            <View
              style={[
                styles.statusChip,
                isActive ? styles.statusActive : styles.statusPaused,
              ]}
            >
              <Text
                style={[styles.statusText, !isActive && { color: "#344054" }]}
              >
                {isActive ? "Activa" : "Pausada"}
              </Text>
            </View>

            {!!left && (
              <View
                style={[
                  styles.dateChip,
                  left === "Vencida" && {
                    backgroundColor: "#fdecef",
                    borderColor: "#f8cdd3",
                  },
                ]}
              >
                <Ionicons
                  name={
                    left === "Vencida" ? "alert-circle-outline" : "time-outline"
                  }
                  size={14}
                  color={left === "Vencida" ? "#dc3545" : "#0a58ca"}
                />
                <Text
                  style={[
                    styles.dateText,
                    left === "Vencida" && { color: "#dc3545" },
                  ]}
                >
                  {"  "}
                  {left}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.actionsCol}>
          <TouchableOpacity
            style={[styles.smallBtn, { backgroundColor: "#0d6efd" }]}
            onPress={() =>
              navigation.navigate(
                "OfertaForm",
                promoParams(s.serviceId, s.serviceName, "edit", {
                  offerId: s.id,
                })
              )
            }
            activeOpacity={0.9}
          >
            <Ionicons name="create-outline" size={16} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.smallBtn,
              { backgroundColor: isActive ? "#f59f00" : "#198754" },
            ]}
            onPress={() => toggleActive(s)}
            activeOpacity={0.9}
          >
            <Ionicons
              name={isActive ? "pause-outline" : "play-outline"}
              size={16}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.smallBtn, { backgroundColor: "#dc3545" }]}
            onPress={() => remove(s)}
            activeOpacity={0.9}
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onNew}
            activeOpacity={0.9}
          >
            <Ionicons name="gift-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}> Nueva promoción</Text>
          </TouchableOpacity>
        </View>

        {filterServiceId && (
          <View style={styles.filterPill}>
            <Ionicons name="funnel-outline" size={14} color="#0a58ca" />
            <Text style={styles.filterText}>
              {"  "}Servicio: {filterServiceName || filterServiceId}
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : offers.length === 0 ? (
          <View style={styles.centerPad}>
            <Ionicons name="alert-circle-outline" size={22} color="#6b7a90" />
            <Text style={styles.emptyText}>
              {filterServiceId
                ? "No tienes promociones para este servicio."
                : "Aún no tienes promociones."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={offers}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { flex: 1, padding: 16 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    color: "#0a58ca",
    letterSpacing: 0.3,
  },

  primaryBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },

  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#eaf2ff",
    borderColor: "#cfe2ff",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  filterText: { color: "#0a58ca", fontWeight: "800" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerPad: { alignItems: "center", paddingTop: 30 },

  card: {
    flexDirection: "row",
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e6edf6",
    padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: "800", color: "#1c2b39" },
  sub: { marginTop: 4, color: "#5a6a80", fontWeight: "700" },

  rowChips: { flexDirection: "row", marginTop: 8, flexWrap: "wrap", gap: 8 },
  statusChip: {
    backgroundColor: "#eef2f7",
    borderColor: "#e1e7f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusActive: { backgroundColor: "#e7f5ff", borderColor: "#d0e7ff" },
  statusPaused: { backgroundColor: "#fff6e5", borderColor: "#ffe4bf" },
  statusText: { color: "#0a58ca", fontWeight: "800", fontSize: 12 },

  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eaf2ff",
    borderColor: "#cfe2ff",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dateText: { color: "#0a58ca", fontWeight: "800", fontSize: 12 },

  actionsCol: { marginLeft: 10, justifyContent: "space-between" },
  smallBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyText: {
    color: "#6b7a90",
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
});
