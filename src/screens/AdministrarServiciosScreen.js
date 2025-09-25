import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from "react-native";

export default function AdministrarServiciosScreen() {
  const [servicio, setServicio] = useState("");
  const [misServicios, setMisServicios] = useState([]);

  const agregarServicio = () => {
    if (servicio && !misServicios.includes(servicio)) {
      setMisServicios([...misServicios, servicio]);
      setServicio("");
    }
  };

  const eliminarServicio = (item) => {
    setMisServicios(misServicios.filter((s) => s !== item));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Administrar mis servicios</Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un servicio"
          value={servicio}
          onChangeText={setServicio}
        />
        <TouchableOpacity style={styles.addButton} onPress={agregarServicio}>
          <Text style={styles.addButtonText}>Añadir</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={misServicios}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <View style={styles.itemContainer}>
            <Text>{item}</Text>
            <TouchableOpacity onPress={() => eliminarServicio(item)}>
              <Text style={styles.deleteText}>X</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  inputContainer: { flexDirection: "row", marginBottom: 20 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  addButton: {
    backgroundColor: "#007AFF",
    padding: 10,
    marginLeft: 10,
    borderRadius: 8,
  },
  addButtonText: { color: "#fff", fontWeight: "bold" },
  itemContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    borderBottomWidth: 1,
    borderColor: "#ddd",
  },
  deleteText: { color: "red", fontWeight: "bold" },
});
