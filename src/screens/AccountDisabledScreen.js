// src/screens/AccountDisabledScreen.js
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth } from "../firebaseConfig";

export default function AccountDisabledScreen() {
  const logout = async () => {
    try {
      await auth.signOut();
    } catch {}
  };

  return (
    <View style={styles.wrap}>
      <Ionicons name="ban" size={64} color="#991b1b" />
      <Text style={styles.title}>Cuenta inhabilitada</Text>
      <Text style={styles.desc}>
        Tu cuenta ha sido inhabilitada por un administrador. Si crees que es un
        error, contáctanos.
      </Text>

      <TouchableOpacity style={styles.btn} onPress={logout} activeOpacity={0.9}>
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.btnText}> Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: { fontSize: 20, fontWeight: "900", color: "#111827", marginTop: 12 },
  desc: { color: "#6b7280", textAlign: "center", marginTop: 8 },
  btn: {
    marginTop: 16,
    backgroundColor: "#991b1b",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
