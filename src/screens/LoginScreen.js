// src/screens/LoginScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../firebaseConfig";

const INPUT_BG = "#f8fafc";
const INPUT_TEXT = "#0f172a";
const INPUT_PLACEHOLDER = "#94a3b8";
const BRAND = "#0d6efd";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!email || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const msg = mapAuthError(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    const normalized = email.trim();
    if (!normalized) {
      setError(
        "Escribe tu correo arriba para enviarte el enlace de recuperación."
      );
      return;
    }
    try {
      setSendingReset(true);
      await sendPasswordResetEmail(auth, normalized);
      Alert.alert(
        "Revisa tu correo",
        "Te enviamos un enlace para restablecer tu contraseña. Si no lo ves, revisa la carpeta de spam."
      );
    } catch (err) {
      const msg = mapAuthError(err);
      setError(msg);
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Inicia sesión</Text>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor={INPUT_PLACEHOLDER}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          selectionColor={BRAND}
          cursorColor={BRAND}
          keyboardAppearance="light"
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={INPUT_PLACEHOLDER}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          selectionColor={BRAND}
          cursorColor={BRAND}
          keyboardAppearance="light"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.8 }]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Ingresar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePasswordReset}
          style={styles.linkBtn}
          disabled={sendingReset}
          activeOpacity={0.7}
        >
          {sendingReset ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function mapAuthError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "El correo no es válido.";
    case "auth/user-not-found":
      return "No existe una cuenta con ese correo.";
    case "auth/wrong-password":
      return "Contraseña incorrecta.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Intenta más tarde.";
    default:
      return "No se pudo completar la acción. Intenta de nuevo.";
  }
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: "bold",
    color: "#0a58ca",
  },
  input: {
    width: "100%",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: INPUT_BG,
    color: INPUT_TEXT, // 👈 texto SIEMPRE visible
  },
  button: {
    backgroundColor: BRAND,
    padding: 14,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  error: { color: "#dc3545", marginBottom: 10, alignSelf: "flex-start" },
  linkBtn: { marginTop: 14 },
  linkText: {
    color: "#0a58ca",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
