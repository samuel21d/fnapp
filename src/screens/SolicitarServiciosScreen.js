// src/screens/SolicitarServiciosScreen.js
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
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { db } from "../firebaseConfig";
import { collectionGroup, onSnapshot } from "firebase/firestore";

// Catálogo base: icono y color por categoría.
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

export default function SolicitarServiciosScreen() {
  const navigation = useNavigation();
 // 👇 Asegura que el Tab Bar esté visible cuando esta pantalla está activa
  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.(); // Tab navigator
      // Si alguna pantalla previa ocultó el tab bar, lo volvemos a mostrar aquí
      parent?.setOptions?.({
        tabBarStyle: [ { display: "flex" }, parent?.getState?.()?.routes ? {} : {} ],
      });
      return () => {};
    }, [navigation])
  );
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]); // [{id, name, count}]
  const [query, setQuery] = useState("");

  // Carga dinámica desde toda la comunidad (collectionGroup sobre "services")
  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, "services"),
      (snap) => {
        const map = new Map(); // serviceId -> { id, name, count }
        snap.forEach((doc) => {
          const id = doc.id; // serviceId
          const data = doc.data() || {};
          const meta = SERVICE_CATALOG[id];
          const name =
            data.name ||
            meta?.name ||
            id?.charAt(0).toUpperCase() + id?.slice(1) ||
            "Servicio";

          if (!map.has(id)) {
            map.set(id, { id, name, count: 0 });
          }
          const entry = map.get(id);
          entry.count += 1;
          map.set(id, entry);
        });

        const arr = Array.from(map.values());
        // Orden: más ofrecidos primero, luego alfabético
        arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        setServices(arr);
        setLoading(false);
      },
      (err) => {
        console.error("Error leyendo servicios:", err);
        setServices([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, query]);

  const onPressService = useCallback(
    (item) => {
      navigation.navigate("ServicioExplorar", {
        serviceId: item.id,
        serviceName: item.name,
      });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const meta = SERVICE_CATALOG[item.id] || {
        name: item.name,
        icon: "apps-outline",
        color: "#667085",
      };
      const bg = `${meta.color}1A`; // color con transparencia para el círculo

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => onPressService(item)}
          accessibilityLabel={`Explorar proveedores y ofertas de ${item.name}`}
        >
          <View style={[styles.iconCircle, { backgroundColor: bg }]}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>

          {/* Chip de proveedores (dato informativo) */}
          <View style={styles.pill}>
            <Ionicons name="people-outline" size={14} color="#0a58ca" />
            <Text style={styles.pillText}>
              {"  "}
              {item.count} proveedor{item.count === 1 ? "" : "es"}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [onPressService]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const ListHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>
        Servicios disponibles en Florida Norteamérica
      </Text>
      <Text style={styles.subtitle}>
        Toca un servicio para ver proveedores y ofertas
      </Text>

      {/* Buscador */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color="#7a8aa0" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar (ej. Plomería)"
          placeholderTextColor="#9fb0c4"
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery("")}
            accessibilityLabel="Limpiar búsqueda"
          >
            <Ionicons name="close-circle" size={18} color="#9fb0c4" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const ListEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="alert-circle-outline" size={22} color="#6b7a90" />
      <Text style={styles.emptyText}>
        Por el momento no hay servicios ofrecidos en la comunidad.
      </Text>
      <Text style={styles.emptyHint}>
        Si quieres, empieza en{" "}
        <Text style={{ fontWeight: "800" }}>Servicios → Ofrecer servicios</Text>
        .
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
            numColumns={2}
            columnWrapperStyle={{ paddingHorizontal: 12 }}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={ListEmpty}
            contentContainerStyle={{ paddingBottom: 24 }}
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
  searchInput: { flex: 1, paddingLeft: 8, color: "#233044" },

  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#e9edf3",
    alignItems: "center",
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
    marginBottom: 10,
  },
  cardTitle: { fontWeight: "800", color: "#1c2b39", textAlign: "center" },

  pill: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#e2f0ff",
    flexDirection: "row",
    alignItems: "center",
  },
  pillText: { fontSize: 12, fontWeight: "800", color: "#0a58ca" },

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
