// src/screens/OfrecerServiciosScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SERVICE_CATALOG, iconForServiceName } from "../utils/servicesCatalog";
import { auth, db } from "../firebaseConfig";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function OfrecerServiciosScreen() {
  const [query, setQuery] = useState("");
  const [myServiceIds, setMyServiceIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
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

  // Cargar mis servicios actuales (para marcar “Activo”)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const servicesRef = collection(db, "users", user.uid, "services");
    const unsub = onSnapshot(servicesRef, (snap) => {
      const ids = new Set();
      snap.forEach((d) => ids.add(d.id)); // doc.id = serviceId
      setMyServiceIds(ids);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = SERVICE_CATALOG.slice().sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    if (!q) return base;
    return base.filter((s) => s.name.toLowerCase().includes(q));
  }, [query]);

  const toggleSelect = useCallback(
    (id) => {
      // Si ya lo ofreces, no permitas selección (evita confusión)
      if (myServiceIds.has(id)) return;
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    },
    [selectedIds, myServiceIds]
  );

  const offerSelected = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // ids a crear = seleccionados - ya ofrecidos
      const toCreate = Array.from(selectedIds).filter(
        (id) => !myServiceIds.has(id)
      );
      if (toCreate.length === 0) {
        Alert.alert("Sin cambios", "No has seleccionado nuevos servicios.");
        return;
      }

      // escribir en subcolección users/{uid}/services/{serviceId}
      await Promise.all(
        toCreate.map(async (id) => {
          const meta = SERVICE_CATALOG.find((s) => s.id === id);
          if (!meta) return;
          await setDoc(
            doc(db, "users", user.uid, "services", id),
            {
              name: meta.name,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        })
      );

      setSelectedIds(new Set());
      Alert.alert("¡Listo!", "Tus servicios se actualizaron correctamente.");
    } catch (e) {
      console.error("Error al ofrecer servicios:", e);
      Alert.alert("Error", "No se pudieron guardar los cambios.");
    }
  };

  // -------- Render UI --------
  const ListHeader = () => (
    <View>
      {/* Header principal */}
      <View style={styles.header}>
        <Text style={styles.title}>Ofrecer servicios</Text>
        <Text style={styles.subtitle}>
          Elige del catálogo los servicios que quieres ofrecer en la comunidad.
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
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color="#9fb0c4" />
            </TouchableOpacity>
          )}
        </View>

        {/* Estado selección */}
        <View style={styles.selectionRow}>
          <View style={styles.badgeInfo}>
            <Ionicons
              name="checkmark-circle-outline"
              size={14}
              color="#0a58ca"
            />
            <Text style={styles.badgeInfoText}>
              {"  "}
              {selectedIds.size > 0
                ? `${selectedIds.size} seleccionado(s)`
                : "Sin selección"}
            </Text>
          </View>
          <View style={styles.badgeMuted}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color="#6b7a90"
            />
            <Text style={styles.badgeMutedText}>
              {" "}
              Los ya activos no se pueden volver a agregar
            </Text>
          </View>
        </View>

        {/* Etiqueta “ya ofreces” */}
        <View style={{ marginTop: 4 }}>
          <Text style={styles.sectionLabel}>Catálogo de servicios</Text>
        </View>
      </View>
    </View>
  );

  const ListFooter = () => (
    <View style={styles.footerSpace}>
      <Text style={styles.helperNote}>
        Puedes quitar servicios desde{" "}
        <Text style={{ fontWeight: "800" }}>Perfil</Text> o volver aquí para
        agregar más.
      </Text>
    </View>
  );

  const renderItem = ({ item }) => {
    const isActive = myServiceIds.has(item.id);
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isActive && styles.cardDisabled,
          isSelected && styles.cardSelected,
        ]}
        activeOpacity={isActive ? 1 : 0.8}
        onPress={() => toggleSelect(item.id)}
      >
        <View
          style={[styles.iconCircle, { backgroundColor: `${item.color}1A` }]}
        >
		  <Ionicons name={item.icon || iconForServiceName(item.name)} size={20} color={item.color || "#1d4fb8"} />
        </View>
        <Text
          style={[styles.cardTitle, isActive && { color: "#7a8aa0" }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>

        {/* Píldoras de estado */}
        {isActive ? (
          <View style={[styles.pill, { backgroundColor: "#e2f0ff" }]}>
            <Text style={[styles.pillText, { color: "#0a58ca" }]}>Activo</Text>
          </View>
        ) : isSelected ? (
          <View style={[styles.pill, { backgroundColor: "#e9f7ef" }]}>
            <Text style={[styles.pillText, { color: "#198754" }]}>
              Seleccionado
            </Text>
          </View>
        ) : (
          <View style={{ height: 20 }} />
        )}
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item) => item.id;

  return (
	<SafeAreaView style={styles.safeArea} edges={["top","bottom"]}>
      <View style={styles.container}>
        {loading ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={filteredCatalog}
            numColumns={2}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={ListFooter}
            contentContainerStyle={{ paddingBottom: 140 }}
            columnWrapperStyle={{ paddingHorizontal: 12 }}
          />
        )}
        {/* Botón fijo al fondo */}
        <View style={styles.stickyBar}>
          <TouchableOpacity
            style={[
              styles.stickyBtn,
              selectedIds.size === 0 && { backgroundColor: "#b7cdf6" },
            ]}
            onPress={offerSelected}
            disabled={selectedIds.size === 0}
            activeOpacity={0.9}
          >
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.stickyText}>
              {"  "}Ofrecer {selectedIds.size || 0} servicio(s)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { flex: 1, backgroundColor: "#f2f5fa" },

  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0a58ca",
    letterSpacing: 0.3,
  },
  subtitle: { color: "#5a6a80", marginTop: 4 },

  searchRow: {
    marginTop: 10,
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

  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    justifyContent: "space-between",
  },
  badgeInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e9f1ff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeInfoText: { color: "#0a58ca", fontWeight: "800", fontSize: 12 },
  badgeMuted: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2f7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeMutedText: { color: "#6b7a90", fontWeight: "700", fontSize: 12 },

  sectionLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "900",
    color: "#1c2b39",
  },

  // Grid
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
  cardDisabled: {
    opacity: 0.65,
  },
  cardSelected: {
    borderColor: "#0d6efd",
    shadowColor: "#0d6efd",
    shadowOpacity: 0.08,
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
  },
  pillText: { fontSize: 12, fontWeight: "800" },
  
  footerSpace: { paddingHorizontal: 14, paddingTop: 10 },
  
  helperNote: {
    fontSize: 12,
    color: "#6b7a90",
    marginTop: 8,
    textAlign: "center",
  },
  /* Barra fija con CTA */
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: "rgba(242,245,250,0.96)",
    borderTopWidth: 1,
    borderTopColor: "#e5eaf2",
  },
  stickyBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  stickyText: { color: "#fff", fontWeight: "900" },
});
