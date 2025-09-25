// src/screens/SolicitarServiciosListaScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../firebaseConfig";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";

export default function SolicitarServiciosListaScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [availableServices, setAvailableServices] = useState([]); // servicios que al menos 1 usuario ofrece
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubUsers = null;
    let isMounted = true;

    const init = async () => {
      try {
        // 1) Escuchar cambios en la colección 'users' para construir el set de serviceIds ofrecidos
        unsubUsers = onSnapshot(collection(db, "users"), async (usersSnap) => {
          if (!isMounted) return;
          const offeredSet = new Set();

          usersSnap.forEach((uDoc) => {
            const data = uDoc.data();
            const arr = data?.servicesOffered;
            if (Array.isArray(arr)) {
              arr.forEach((s) => offeredSet.add(s));
            }
          });

          // 2) Cargar todos los servicios (colección 'services') y filtrar por offeredSet
          const servicesSnap = await getDocs(collection(db, "services"));
          const services = servicesSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

          const filtered = services.filter((s) => offeredSet.has(s.id));
          setAvailableServices(filtered);
          setLoading(false);
        });
      } catch (e) {
        console.error("Error cargando servicios disponibles:", e);
        setError("Error cargando servicios. Intenta más tarde.");
        setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (unsubUsers) unsubUsers();
    };
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate("SolicitarServicios", {
          serviceId: item.id,
          serviceName: item.nombre || item.name || item.id,
        })
      }
    >
      <View style={styles.iconWrap}>
        {/* Usa item.icon si existe, si no, fallback a un icono genérico */}
        <Ionicons
          name={item.icon || "construct-outline"}
          size={36}
          color="#fff"
        />
      </View>

      <Text style={styles.name}>{item.nombre || item.name || item.id}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red" }}>{error}</Text>
      </View>
    );
  }

  if (!availableServices.length) {
    return (
      <View style={styles.center}>
        <Text style={{ textAlign: "center", color: "#666" }}>
          Por el momento no hay servicios ofrecidos en la comunidad.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Servicios disponibles</Text>

      <FlatList
        data={availableServices}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: "#fff" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#007bff",
    textAlign: "center",
    marginBottom: 16,
    marginTop: 6,
  },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: "#f6f7fb",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    elevation: 2,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#007bff",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { marginTop: 12, fontWeight: "600", fontSize: 15, textAlign: "center" },
});
