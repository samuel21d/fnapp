// src/screens/OfertaFormScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Switch,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { auth, db } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";

// util: suma días a una fecha (sin mutar el original)
function addDays(baseDate, days) {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export default function OfertaFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const user = auth.currentUser;

  // Modo
  const mode = route.params?.mode || "create"; // 'create' | 'edit'

  // Flags para modo “Promoción” (solo % descuento)
  const discountOnly = !!route.params?.discountOnly; // true => UI de promoción
  const discountStep = Number(route.params?.discountStep ?? 5);
  const maxDiscount = Number(route.params?.maxDiscount ?? 90);
  const forceTitle = !!route.params?.forceTitle;
  const titlePreset = route.params?.titlePreset || "Promoción";
  const uiModeTitle = route.params?.uiModeTitle || null;

  // Contexto del servicio
  const routeServiceId = route.params?.serviceId || null;
  const routeServiceName = route.params?.serviceName || null;

  // Edición
  const offerId = route.params?.offerId || null;
  const initial = route.params?.initial || null;

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

  // Lista de servicios del usuario (para seleccionar si no se pasó por params)
  const [myServices, setMyServices] = useState([]); // [{id, name}]
  const [selectedServiceId, setSelectedServiceId] = useState(routeServiceId);
  const [selectedServiceName, setSelectedServiceName] = useState(
    routeServiceName || "Servicio"
  );

  // Form state
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");

  // Campos “legado” (para compatibilidad con reglas). No se muestran en modo promoción
  const [priceText, setPriceText] = useState(
    initial?.price != null ? String(initial.price) : ""
  );
  const [currency, setCurrency] = useState(initial?.currency || "COP");

  const [active, setActive] = useState(
    initial?.active == null ? true : !!initial.active
  );
  const [visibility, setVisibility] = useState(initial?.visibility || "public");

  // Vigencia
  const [durationDaysText, setDurationDaysText] = useState("");

  // Selección de descuento (solo en promoción)
  const [discountPct, setDiscountPct] = useState(
    typeof initial?.discountPct === "number" ? initial.discountPct : null
  );

  // Cargar servicios del usuario
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "services"),
      (snap) => {
        const arr = snap.docs.map((d) => ({
          id: d.id,
          name: d.data()?.name || d.id,
        }));
        setMyServices(arr);

        // si no hay servicio preseleccionado y el usuario solo tiene uno, autoselecciona
        if (!routeServiceId && arr.length === 1) {
          setSelectedServiceId(arr[0].id);
          setSelectedServiceName(arr[0].name);
        }
      },
      () => setMyServices([])
    );
    return () => unsub();
  }, [user?.uid, routeServiceId]);

  // Edición: precargar
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (mode !== "edit" || !user?.uid || !offerId) return;
        setLoading(true);
        const ref = doc(db, "users", user.uid, "offers", offerId);
        const snap = await getDoc(ref);
        if (!mounted) return;
        if (snap.exists()) {
          const d = snap.data();

          setSelectedServiceId(d.serviceId || null);
          setSelectedServiceName(d.serviceName || "Servicio");

          setTitle(d.title || "");
          setDescription(d.description || "");

          setPriceText(d.price != null ? String(d.price) : "");
          setCurrency(d.currency || "COP");
          setActive(d.active == null ? true : !!d.active);
          setVisibility(d.visibility || "public");

          // descuento (si existía)
          if (typeof d.discountPct === "number") {
            setDiscountPct(d.discountPct);
          }

          // duración sugerida
          if (d.validFrom && d.validTo) {
            const from = d.validFrom?.toDate?.() || new Date(d.validFrom);
            const to = d.validTo?.toDate?.() || new Date(d.validTo);
            const ms = Math.max(0, to.getTime() - from.getTime());
            const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
            setDurationDaysText(String(days || ""));
          } else {
            setDurationDaysText("");
          }
        } else {
          Alert.alert("Aviso", "La promoción/oferta ya no existe.");
          navigation.goBack();
        }
      } catch (e) {
        Alert.alert("Error", "No se pudo cargar la promoción/oferta.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [mode, user?.uid, offerId, navigation]);

  // Actualiza nombre del servicio al cambiar selección
  useEffect(() => {
    if (routeServiceName && routeServiceId) return; // ya vino por params
    if (!selectedServiceId) return;
    const found = myServices.find((s) => s.id === selectedServiceId);
    if (found) setSelectedServiceName(found.name);
  }, [selectedServiceId, myServices, routeServiceId, routeServiceName]);

  // ¿Estamos en UI de promoción?
  const promoMode = useMemo(
    () => discountOnly || typeof initial?.discountPct === "number",
    [discountOnly, initial?.discountPct]
  );

  // Opciones de descuento (5, 10, 15, ..., 90 por defecto)
  const discountOptions = useMemo(() => {
    const step = Math.max(1, isNaN(discountStep) ? 5 : discountStep);
    const max = Math.max(step, isNaN(maxDiscount) ? 90 : maxDiscount);
    const arr = [];
    for (let v = step; v <= max; v += step) arr.push(v);
    if (typeof discountPct === "number" && !arr.includes(discountPct)) {
      arr.push(discountPct);
    }
    return arr.sort((a, b) => a - b);
  }, [discountStep, maxDiscount, discountPct]);

  // Título visible en header
  const headerTitle = useMemo(() => {
    const serviceLabel = selectedServiceName || routeServiceName || "Servicio";
    if (uiModeTitle) return `${uiModeTitle} · ${serviceLabel}`;
    const action =
      mode === "edit"
        ? promoMode
          ? "Editar promoción"
          : "Editar oferta"
        : promoMode
        ? "Crear promoción"
        : "Nueva oferta";
    return `${action} · ${serviceLabel}`;
  }, [mode, promoMode, selectedServiceName, routeServiceName, uiModeTitle]);

  // Guardar
  const onSave = async () => {
    if (!user?.uid) {
      Alert.alert("Error", "Sesión no válida.");
      return;
    }
    if (!selectedServiceId) {
      Alert.alert(
        "Selecciona un servicio",
        "Debes elegir a qué servicio pertenece."
      );
      return;
    }

    // Título efectivo
    const titleEffective =
      promoMode || forceTitle ? titlePreset || "Promoción" : title.trim();

    if (!titleEffective) {
      Alert.alert(
        "Completa el título",
        "Escribe un título para la promoción/oferta."
      );
      return;
    }

    // Validaciones específicas
    let price = 0;
    let currencyEffective = "COP";

    if (promoMode) {
      if (typeof discountPct !== "number" || discountPct <= 0) {
        Alert.alert("Selecciona un descuento", "Elige un porcentaje válido.");
        return;
      }
    } else {
      // modo legado (con precio)
      const p = priceText.trim() === "" ? 0 : Number(priceText);
      if (Number.isNaN(p) || p < 0) {
        Alert.alert(
          "Precio inválido",
          "Ingresa un precio numérico mayor o igual a cero."
        );
        return;
      }
      price = p;
      currencyEffective = currency;
    }

    // Días de vigencia (requerido y >=1)
    const duration = Number(durationDaysText.trim());
    if (!duration || Number.isNaN(duration) || duration < 1) {
      Alert.alert(
        "Vigencia inválida",
        "Ingresa la cantidad de días de vigencia (entero ≥ 1)."
      );
      return;
    }

    // Calcula validFrom / validTo
    const now = new Date();
    const validFrom = now;
    const validTo = addDays(now, Math.floor(duration));

    // Payload base
    const payload = {
      title: titleEffective,
      description: description.trim(),
      // Compatibilidad con reglas actuales:
      price: promoMode ? 0 : price,
      currency: promoMode ? "COP" : currencyEffective,
      validFrom,
      validTo,
      active: !!active,
      visibility, // 'public' | 'residents'
      updatedAt: new Date(),
      // contexto
      serviceId: selectedServiceId,
      serviceName: selectedServiceName || selectedServiceId,
    };

    // En modo promoción guardamos también el % de descuento
    if (promoMode) {
      payload.discountPct = discountPct;
    }

    try {
      setSaving(true);

      if (mode === "edit" && offerId) {
        const ref = doc(db, "users", user.uid, "offers", offerId);
        await updateDoc(ref, payload);
      } else {
        const col = collection(db, "users", user.uid, "offers");
        await addDoc(col, {
          ...payload,
          createdAt: new Date(),
        });
      }

      Alert.alert(
        "Listo",
        promoMode ? "La promoción fue guardada." : "La oferta fue guardada."
      );
      navigation.goBack();
    } catch (e) {
      console.error("save offer error:", e);
      Alert.alert(
        "Error",
        "No se pudo guardar. Verifica tu conexión y permisos."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>

          {/* Servicio (selector si no vino por params) */}
          {!routeServiceId ? (
            <>
              <Text style={styles.label}>Servicio *</Text>
              {myServices.length === 0 ? (
                <Text style={{ color: "#6b7a90", marginBottom: 8 }}>
                  Aún no ofreces servicios. Ve a{" "}
                  <Text style={{ fontWeight: "800" }}>
                    Servicios → Ofrecer servicios
                  </Text>
                  .
                </Text>
              ) : (
                <View style={styles.serviceChipsWrap}>
                  {myServices.map((s) => {
                    const sel = s.id === selectedServiceId;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.chip, sel && styles.chipActive]}
                        onPress={() => {
                          setSelectedServiceId(s.id);
                          setSelectedServiceName(s.name);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            sel && styles.chipTextActive,
                          ]}
                        >
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <View style={styles.readonlyRow}>
              <Ionicons name="briefcase-outline" size={16} color="#0a58ca" />
              <Text style={styles.readonlyText}>
                {"  "}
                {routeServiceName || routeServiceId}
              </Text>
            </View>
          )}

          {/* Título */}
          {promoMode || forceTitle ? (
            <>
              <Text style={styles.label}>Título</Text>
              <View style={styles.readonlyRow}>
                <Ionicons name="pricetag-outline" size={16} color="#0a58ca" />
                <Text style={styles.readonlyText}>
                  {"  "}
                  {titlePreset || "Promoción"}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.label}>Título *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ej: 10% de descuento en mano de obra"
                placeholderTextColor="#9fb0c4"
              />
            </>
          )}

          {/* Descripción */}
          <Text style={styles.label}>Descripción</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Detalles, condiciones, restricciones…"
            placeholderTextColor="#9fb0c4"
            multiline
          />

          {/* PROMOCIÓN: selector de % descuento */}
          {promoMode ? (
            <>
              <Text style={styles.label}>Descuento (%) *</Text>
              <View style={styles.discountWrap}>
                {discountOptions.map((v) => {
                  const sel = discountPct === v;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[
                        styles.discountChip,
                        sel && styles.discountChipActive,
                      ]}
                      onPress={() => setDiscountPct(v)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.discountChipText,
                          sel && styles.discountChipTextActive,
                        ]}
                      >
                        {v}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            // MODO LEGADO: Precio + Moneda
            <>
              <Text style={styles.label}>Precio</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={priceText}
                  onChangeText={setPriceText}
                  placeholder="Ej: 50000"
                  placeholderTextColor="#9fb0c4"
                  keyboardType="numeric"
                />
                <View style={{ width: 10 }} />
                <View style={[styles.segment, { flexDirection: "row" }]}>
                  {["COP", "USD"].map((c) => {
                    const selected = currency === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.segBtn, selected && styles.segBtnActive]}
                        onPress={() => setCurrency(c)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.segBtnText,
                            selected && styles.segBtnTextActive,
                          ]}
                        >
                          {c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* Días de vigencia */}
          <Text style={styles.label}>Días de vigencia *</Text>
          <TextInput
            style={styles.input}
            value={durationDaysText}
            onChangeText={setDurationDaysText}
            placeholder="Ej: 7"
            placeholderTextColor="#9fb0c4"
            keyboardType="numeric"
          />

          {/* Visibilidad */}
          <Text style={styles.label}>Visibilidad</Text>
          <View style={[styles.segment, { flexDirection: "row" }]}>
            {[
              { key: "public", label: "Pública" },
              { key: "residents", label: "Residentes" },
            ].map((opt) => {
              const selected = visibility === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.segBtn, selected && styles.segBtnActive]}
                  onPress={() => setVisibility(opt.key)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.segBtnText,
                      selected && styles.segBtnTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Activa / Inactiva */}
          <View style={[styles.row, { alignItems: "center", marginTop: 6 }]}>
            <Text style={[styles.label, { marginBottom: 0, flex: 1 }]}>
              {promoMode ? "Promoción activa" : "Oferta activa"}
            </Text>
            <Switch value={active} onValueChange={setActive} />
          </View>

          {/* Botones */}
          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { flex: 1 }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.secondaryBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { flex: 1, opacity: saving ? 0.8 : 1 },
              ]}
              onPress={onSave}
              activeOpacity={0.9}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {"  "}
                    {mode === "edit"
                      ? "Guardar"
                      : promoMode
                      ? "Crear promoción"
                      : "Crear"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: 10 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* === STYLES === */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { padding: 16, paddingBottom: 28 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0a58ca",
    letterSpacing: 0.3,
    marginBottom: 12,
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
    color: "#415164",
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    color: "#0f172a",
  },

  row: { flexDirection: "row" },

  segment: {
    backgroundColor: "#f6f8fc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  segBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segBtnActive: {
    backgroundColor: "#eaf2ff",
    borderWidth: 1,
    borderColor: "#cfe2ff",
  },
  segBtnText: { color: "#1c2b39", fontWeight: "800" },
  segBtnTextActive: { color: "#1d4fb8" },

  // chips de servicios
  serviceChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    backgroundColor: "#eef2f7",
    borderColor: "#e1e7f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: "#eaf2ff",
    borderColor: "#cfe2ff",
  },
  chipText: { color: "#344054", fontWeight: "800" },
  chipTextActive: { color: "#0a58ca" },

  // “read-only” badge
  readonlyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eaf2ff",
    borderColor: "#cfe2ff",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  readonlyText: { color: "#0a58ca", fontWeight: "800" },

  // Selector de descuentos
  discountWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  discountChip: {
    backgroundColor: "#eef2f7",
    borderColor: "#e1e7f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  discountChipActive: {
    backgroundColor: "#fff1f0",
    borderColor: "#ffd1cf",
  },
  discountChipText: { color: "#334155", fontWeight: "800" },
  discountChipTextActive: { color: "#b42318", fontWeight: "900" },

  primaryBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  secondaryBtn: {
    backgroundColor: "#f1f3f5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#222", fontWeight: "800", fontSize: 16 },
});
