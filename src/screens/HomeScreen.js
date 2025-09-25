import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";

export default function HomeScreen() {
  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:24 }}>
      <Text style={{ fontSize:20, fontWeight:"800", marginBottom:12 }}>
        Sesión iniciada ✅
      </Text>
      <Text>Pronto aquí pondremos: Ofrecer / Solicitar / Mis solicitudes</Text>

      <TouchableOpacity
        style={{ backgroundColor:"#e74c3c", padding:14, borderRadius:12, marginTop:20 }}
        onPress={() => signOut(auth)}
      >
        <Text style={{ color:"#fff", fontWeight:"700" }}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}
