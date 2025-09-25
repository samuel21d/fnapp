// src/screens/AdminComprasScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  getDoc,
  setDoc,
  limit,
} from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { Timestamp } from "firebase/firestore";

/* ===== Helpers reutilizados (idénticos a los que tenías) ===== */
const getDaysLeft = (ts) => {
  if (!ts) return 0;
  const ms = (ts?.toMillis?.() ?? new Date(ts).getTime()) - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};
const computeNewExpiry = (currentTs, grantDays = 365) => {
  const nowMs = Date.now();
  const curMs = currentTs?.toMillis?.() ? currentTs.toMillis() : null;
  const base = curMs && curMs > nowMs ? curMs : nowMs;
  return Timestamp.fromDate(new Date(base + grantDays * 24 * 60 * 60 * 1000));
};
const slotsFor = (isPremium) =>
  isPremium
    ? ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"]
    : ["s1", "s2"];

/* ===== Pantalla ===== */
export default function AdminComprasScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [statusTab, setStatusTab] = useState("pending"); // 'pending' | 'approved' | 'rejected' | 'all'
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  const [items, setItems] = useState([]);
  const unsubRef = useRef(null);

  // Verificar admin por claims
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = auth.currentUser;
        if (!u) { setIsAdmin(false); setLoading(false); return; }
        const tk = await u.getIdTokenResult();
        if (!mounted) return;
        setIsAdmin(!!tk.claims?.admin);
      } catch {
        setIsAdmin(false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Suscripción a billingPurchases por estado
  useEffect(() => {
    if (!isAdmin) return;
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }

    const col = collection(db, "billingPurchases");
    let qRef;
    if (statusTab === "all") {
      qRef = query(col, orderBy("createdAt", "desc"), limit(200));
    } else {
      qRef = query(col, where("status", "==", statusTab), orderBy("createdAt", "desc"), limit(200));
    }
    setLoading(true);
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setItems(arr);
        setLoading(false);
      },
      (err) => {
        console.log("[AdminCompras] snapshot err:", err);
        setItems([]);
        setLoading(false);
      }
    );
    unsubRef.current = unsub;
    return () => {
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    };
  }, [isAdmin, statusTab]);

  // Filtrado por búsqueda: ticketId (id), uid, orderId, contactEmail, contactPhone
  const filtered = useMemo(() => {
    const term = searchDebounced.toLowerCase();
    if (!term) return items;
    return items.filter((it) => {
      const fields = [
        it.id || "",
        it.ticketId || "",
        it.uid || "",
        it.orderId || "",
        it.contactEmail || "",
        it.contactPhone || "",
      ].map((s) => String(s).toLowerCase());
      return fields.some((v) => v.includes(term));
    });
  }, [items, searchDebounced]);

  const openReceipt = useCallback(async (url) => {
    if (!url) return;
    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
    else Alert.alert("No se pudo abrir el comprobante", String(url));
  }, []);

  const approvePurchase = useCallback(async (purchase) => {
    try {
      const { uid, productId, orderId } = purchase;
      if (!uid) { Alert.alert("Aprobar", "La compra no trae uid."); return; }

      const userRef = doc(db, "users", uid);
      const pRef = doc(db, "billingPurchases", purchase.id);

      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, { createdAt: serverTimestamp() }, { merge: true });
      }
      const current = userSnap.exists() ? userSnap.data()?.premiumExpiresAt : null;
      const grantDays = productId === "premium_annual" ? 365 : 365;
      const newExpiry = computeNewExpiry(current, grantDays);

      const batch = writeBatch(db);
      batch.set(
        userRef,
        {
          premiumExpiresAt: newExpiry,
          lastPremiumSku: productId || "premium_manual",
          lastPremiumPurchaseAt: serverTimestamp(),
          premiumLastSku: productId || "premium_manual",
          premiumLastGrantedDays: grantDays,
          premiumLastOrderId: orderId || purchase.ticketId || purchase.id || null,
          updatedAt: serverTimestamp(),
          features: { profilePhoto: true, marketplaceImages: true },
          limits: { allowedSlots: slotsFor(true) },
          entitlements: { premium: true },
        },
        { merge: true }
      );
      batch.update(pRef, {
        status: "approved",
        approvedBy: auth.currentUser?.uid || null,
        approvedAt: serverTimestamp(),
        appliedDays: grantDays,
        appliedExpiry: newExpiry,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      Alert.alert("Aprobado", "Premium activado para el usuario.");
    } catch (e) {
      console.log("[AdminCompras] approve error", e);
      Alert.alert("Error", "No se pudo aprobar la compra.");
    }
  }, []);

  const rejectPurchase = useCallback(async (purchase) => {
    try {
      const pRef = doc(db, "billingPurchases", purchase.id);
      await updateDoc(pRef, {
        status: "rejected",
        rejectedBy: auth.currentUser?.uid || null,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      Alert.alert("Rechazado", "Compra marcada como rechazada.");
    } catch (e) {
      console.log("[AdminCompras] reject error", e);
      Alert.alert("Error", "No se pudo rechazar la compra.");
    }
  }, []);

  const renderStatusTabs = () => {
    const tabs = [
      { key: "pending", label: "Pendientes", icon: "time-outline" },
      { key: "approved", label: "Aprobadas", icon: "checkmark-circle-outline" },
      { key: "rejected", label: "Rechazadas", icon: "close-circle-outline" },
      { key: "all", label: "Todas", icon: "layers-outline" },
    ];
    return (
      <View style={styles.tabsWrap}>
        {tabs.map((t) => {
          const active = statusTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabChip, active && styles.tabChipActive]}
              onPress={() => setStatusTab(t.key)}
            >
              <Ionicons
                name={t.icon}
                size={16}
                color={active ? "#0a58ca" : "#475569"}
              />
              <Text style={[styles.tabChipText, active && { color: "#0a58ca" }]}>
                {" "}{t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const manual = (item?.source || "") === "manual_request";
    const created = item.createdAt?.toDate?.() ? item.createdAt.toDate() : null;
    const when = created ? created.toLocaleString() : "—";
    const pDate = item.purchaseTime ? new Date(item.purchaseTime) : null;

    const badge =
      item.status === "pending" ? styles.badgePending :
      item.status === "approved" ? styles.badgeApproved :
      styles.badgeRejected;

    return (
      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="card-outline" size={16} color="#0f172a" />
            <Text style={styles.cardTitle}>
              {" "}{manual ? "Solicitud Premium (manual)" : "Compra de suscripción"}
            </Text>
          </View>
          <View style={[styles.badge, badge]}>
            <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.line}><Text style={styles.k}>Ticket ID:</Text><Text style={styles.v}>{item.ticketId || item.id}</Text></View>
        <View style={styles.line}><Text style={styles.k}>Usuario UID:</Text><Text style={styles.v}>{item.uid || "—"}</Text></View>
        {!!item.contactName && <View style={styles.line}><Text style={styles.k}>Nombre:</Text><Text style={styles.v}>{item.contactName}</Text></View>}
        {!!item.contactEmail && <View style={styles.line}><Text style={styles.k}>Correo:</Text><Text style={styles.v}>{item.contactEmail}</Text></View>}
        {!!item.contactPhone && <View style={styles.line}><Text style={styles.k}>Teléfono:</Text><Text style={styles.v}>{item.contactPhone}</Text></View>}
        <View style={styles.line}><Text style={styles.k}>Producto:</Text><Text style={styles.v}>{item.productId || "premium_manual"}</Text></View>
        <View style={styles.line}><Text style={styles.k}>Order ID:</Text><Text style={styles.v}>{item.orderId || "—"}</Text></View>
        <View style={styles.line}><Text style={styles.k}>Compra:</Text><Text style={styles.v}>{pDate ? pDate.toLocaleString() : "—"}</Text></View>
        <View style={styles.line}><Text style={styles.k}>Ticket creado:</Text><Text style={styles.v}>{when}</Text></View>

        {/* Comprobante */}
        {item.receiptUrl ? (
          <TouchableOpacity style={styles.receiptBox} onPress={() => openReceipt(item.receiptUrl)}>
            <Image source={{ uri: item.receiptUrl }} style={styles.receiptImg} resizeMode="cover" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.receiptTitle}>Comprobante adjunto</Text>
              <Text style={styles.receiptHint} numberOfLines={2}>
                Toca para abrir el comprobante en el navegador.
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color="#0a58ca" />
          </TouchableOpacity>
        ) : (
          <View style={[styles.receiptBox, { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }]}>
            <Ionicons name="image-outline" size={18} color="#94a3b8" />
            <Text style={[styles.receiptHint, { marginLeft: 8 }]}>Sin comprobante</Text>
          </View>
        )}

        {/* Acciones */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnReject, item.status !== "pending" && { opacity: 0.6 }]}
            onPress={() => rejectPurchase(item)}
            disabled={item.status !== "pending"}
          >
            <Ionicons name="close" size={18} color="#fff" />
            <Text style={styles.btnTxtWhite}> Rechazar</Text>
          </TouchableOpacity>
          <View style={{ width: 10 }} />
          <TouchableOpacity
            style={[styles.btn, styles.btnApprove, item.status !== "pending" && { opacity: 0.6 }]}
            onPress={() => approvePurchase(item)}
            disabled={item.status !== "pending"}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.btnTxtWhite}> Aprobar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.centerFill}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }
  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.centerFill}>
          <Ionicons name="lock-closed-outline" size={42} color="#64748b" />
          <Text style={styles.lockTitle}>Acceso restringido</Text>
          <Text style={styles.lockText}>Necesitas permisos de administrador para ver las compras.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.title}>Compras / Solicitudes</Text>
          </View>

          {/* Búsqueda */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color="#637282" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por Ticket ID, UID, Order ID, email o teléfono…"
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Tabs de estado */}
          {renderStatusTabs()}
        </View>

        {/* Lista */}
        {filtered.length === 0 ? (
          <View style={[styles.centerFill, { padding: 24 }]}>
            <Ionicons name="receipt-outline" size={46} color="#94a3b8" />
            <Text style={{ color: "#64748b", marginTop: 8, fontWeight: "700", textAlign: "center" }}>
              No hay resultados para mostrar.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fb" },
  container: { flex: 1, padding: 16 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { marginBottom: 12 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e6ea", marginRight: 10
  },
  title: { fontSize: 18, fontWeight: "900", color: "#12263a" },

  searchWrap: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e6ea",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { marginLeft: 6, flex: 1, color: "#0f172a", paddingVertical: 6 },

  tabsWrap: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2f7",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tabChipActive: { backgroundColor: "#e9f2ff", borderColor: "#cfe2ff" },
  tabChipText: { fontSize: 12, fontWeight: "900", color: "#475569" },

  card: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTitle: { color: "#0f172a", fontWeight: "900", marginLeft: 4 },

  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 10, fontWeight: "900", color: "#0f172a" },
  badgePending: { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#ffedd5" },
  badgeApproved: { backgroundColor: "#dcfce7", borderWidth: 1, borderColor: "#bbf7d0" },
  badgeRejected: { backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fecaca" },

  line: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  k: { color: "#64748b", fontWeight: "700" },
  v: { color: "#0f172a", fontWeight: "900", marginLeft: 8, flexShrink: 1, textAlign: "right" },

  receiptBox: {
    marginTop: 10,
    borderWidth: 1, borderColor: "#cfe2ff", backgroundColor: "#f4f9ff",
    borderRadius: 12, padding: 8, flexDirection: "row", alignItems: "center"
  },
  receiptImg: { width: 60, height: 60, borderRadius: 8, backgroundColor: "#e2e8f0" },
  receiptTitle: { color: "#0f172a", fontWeight: "900" },
  receiptHint: { color: "#64748b", fontWeight: "700", marginTop: 2 },

  actionsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  btnApprove: { backgroundColor: "#16a34a" },
  btnReject: { backgroundColor: "#ef4444" },
  btnTxtWhite: { color: "#fff", fontWeight: "800" },

  lockTitle: { marginTop: 10, fontSize: 16, fontWeight: "900", color: "#1f2937" },
  lockText: { marginTop: 6, fontSize: 12, color: "#64748b", textAlign: "center" },
});
