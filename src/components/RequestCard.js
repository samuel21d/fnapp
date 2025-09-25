// src/components/RequestCard.js
import React, { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const StatusBadge = ({ status }) => {
  const map = {
    pendiente: { bg: "#fff3cd", color: "#856404", label: "Pendiente" },
    aceptada: { bg: "#cff4fc", color: "#055160", label: "En curso" },
    finalizada: { bg: "#e2e3e5", color: "#383d41", label: "Finalizada" },
    rechazada: { bg: "#f8d7da", color: "#721c24", label: "Rechazada" },
    cancelada: { bg: "#fdecec", color: "#7c1d25", label: "Cancelada" },
  };
  const s = map[status] || map.pendiente;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={{ color: s.color, fontWeight: "700", fontSize: 12 }}>
        {s.label}
      </Text>
    </View>
  );
};

function RequestCard({ item, role, onPress }) {
  const counterpartName =
    role === "outgoing" ? item.toUserDisplayName : item.fromUserDisplayName;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(counterpartName || "??").slice(0, 2).toUpperCase()}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.serviceName}</Text>
        <View style={styles.row}>
          <Ionicons name="person-outline" size={14} color="#667" />
          <Text style={styles.meta}> {counterpartName || "—"}</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="home-outline" size={14} color="#667" />
          <Text style={styles.meta}>
            {" "}
            {item.apartment || item.fromApartment || "—"}
          </Text>
        </View>
        {item.offer != null && (
          <View style={[styles.chip, { marginTop: 4 }]}>
            <Ionicons name="cash-outline" size={14} color="#0a6847" />
            <Text style={styles.chipText}> {item.offer} COP</Text>
          </View>
        )}
      </View>

      <View style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
        <StatusBadge status={item.status} />
        <Ionicons name="chevron-forward" size={20} color="#777" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eee",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e9f1ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#0a58ca", fontWeight: "800" },
  title: { fontSize: 16, fontWeight: "800", color: "#1c2b39", marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  meta: { fontSize: 13, color: "#445" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 18,
  },
  chip: {
    flexDirection: "row",
    backgroundColor: "#e9f7ef",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  chipText: { fontSize: 12, color: "#0a6847", fontWeight: "700" },
});

export default memo(RequestCard);
