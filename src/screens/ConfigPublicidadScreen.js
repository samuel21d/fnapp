// src/screens/ConfigPublicidadScreen.js
import React, { useCallback, useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";

export default function ConfigPublicidadScreen() {
  const navigation = useNavigation();
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [tagline, setTagline] = useState("");

  const cloudCfg = useMemo(() => Constants?.expoConfig?.extra?.cloudinary || {}, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!user?.uid) return;
        const ref = doc(db, "ads", user.uid);
        const snap = await getDoc(ref);
        if (mounted && snap.exists()) {
          const d = snap.data();
          setImageUrl(d?.imageUrl || "");
          setTagline(d?.tagline || "");
        }
      } catch {}
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [user?.uid]);

  const pickImage = useCallback(async () => {
    try {
      if (!cloudCfg?.cloudName || !cloudCfg?.uploadPreset) {
        Alert.alert("Config faltante", "Falta cloudinary.cloudName o cloudinary.uploadPreset.");
        return;
      }
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso requerido", "Se requiere acceso a galería.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType.Images,
        allowsEditing: true,
        aspect: [16, 9], // banner apaisado
        quality: 0.9,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      const data = new FormData();
      data.append("file", { uri: asset.uri, type: "image/jpeg", name: `ad_${user.uid}.jpg` });
      data.append("upload_preset", cloudCfg.uploadPreset);

      const up = await fetch(`https://api.cloudinary.com/v1_1/${cloudCfg.cloudName}/upload`, { method: "POST", body: data });
      const json = await up.json();
      if (!up.ok || !json?.secure_url) throw new Error(json?.error?.message || "Error subiendo imagen");
      setImageUrl(json.secure_url);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo subir la imagen.");
    }
  }, [cloudCfg, user?.uid]);

  const onSave = useCallback(async () => {
    try {
      if (!user?.uid) return;
      if (!imageUrl) {
        Alert.alert("Falta imagen", "Sube una imagen para tu publicidad.");
        return;
      }
      const txt = (tagline || "").trim();
      if (!txt || txt.length > 40) {
        Alert.alert("Frase inválida", "La frase es obligatoria y debe tener 40 caracteres o menos.");
        return;
      }
      setSaving(true);
      await setDoc(
        doc(db, "ads", user.uid),
        {
          ownerUid: user.uid,
          ownerName: user.displayName || "",
          imageUrl,
          tagline: txt,
          active: true,
          priority: 0,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert("Guardado", "Tu publicidad quedó actualizada.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }, [user?.uid, user?.displayName, imageUrl, tagline, navigation]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Configurar mi Publicidad</Text>
      <Text style={styles.hint}>Sube una imagen apaisada (16:9) y una frase corta (máx. 40 caracteres).</Text>

      <TouchableOpacity style={styles.pickBtn} onPress={pickImage} activeOpacity={0.9}>
        <Ionicons name="image-outline" size={18} color="#1d4fb8" />
        <Text style={styles.pickBtnText}>  Elegir imagen</Text>
      </TouchableOpacity>

      {!!imageUrl && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: imageUrl }} style={styles.preview} />
        </View>
      )}

      <Text style={styles.label}>Frase (máx. 40)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: ¡Prueba mis postres artesanales!"
        maxLength={40}
        value={tagline}
        onChangeText={setTagline}
        placeholderTextColor="#94a3b8"
      />

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={onSave} disabled={saving} activeOpacity={0.9}>
        <Ionicons name="save-outline" size={18} color="#fff" />
        <Text style={styles.saveBtnText}>{saving ? "  Guardando…" : "  Guardar"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex:1, alignItems:"center", justifyContent:"center" },
  title: { fontSize:18, fontWeight:"800", color:"#12263a" },
  hint: { color:"#6b7a90", marginTop:6 },
  pickBtn: { marginTop:12, backgroundColor:"#eaf2ff", borderColor:"#cfe2ff", borderWidth:1, borderRadius:12, paddingVertical:12, alignItems:"center", flexDirection:"row", justifyContent:"center" },
  pickBtnText: { color:"#1d4fb8", fontWeight:"800" },
  previewWrap: { marginTop:12, borderRadius:12, overflow:"hidden", borderWidth:1, borderColor:"#e2e8f0" },
  preview: { width:"100%", height:180, resizeMode:"cover" },
  label: { fontWeight:"800", color:"#223", marginTop:12, marginBottom:6 },
  input: { borderWidth:1, borderColor:"#e3e6ea", borderRadius:10, paddingHorizontal:12, paddingVertical:12, backgroundColor:"#fff", color:"#0f172a" },
  saveBtn: { marginTop:14, backgroundColor:"#0d6efd", borderRadius:12, paddingVertical:14, alignItems:"center", flexDirection:"row", justifyContent:"center" },
  saveBtnText: { color:"#fff", fontWeight:"800", fontSize:16 },
});
