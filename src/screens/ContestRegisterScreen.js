import React from "react";
import { SafeAreaView, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function ContestRegisterScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Ionicons name="trophy-outline" size={48} color="#b45309" />
        <Text style={styles.title}>Registro de Emprendedores</Text>
        <Text style={styles.subtitle}>En construcción…</Text>
        <Text style={styles.text}>
          Aquí podrás inscribirte como participante del concurso y gestionar tu
          perfil de competencia.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "900", color: "#0f172a", marginTop: 12 },
  subtitle: { marginTop: 4, color: "#475569", fontWeight: "700" },
  text: { marginTop: 10, color: "#64748b", textAlign: "center" },
});
