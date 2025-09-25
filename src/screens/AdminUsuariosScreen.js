// src/screens/AdminUsuariosScreen.js
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Modal,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  startAt,
  endAt,
  limit,
  updateDoc,
  serverTimestamp,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import {
  auth,
  db,
  firebaseApiKey,
  IDENTITY_TOOLKIT_BASE_URL,
} from "../firebaseConfig";
import { onIdTokenChanged } from "firebase/auth";
import { useNavigation } from '@react-navigation/native';

/* Utils */
const byEmailAsc = (a, b) =>
  (a.email || "").localeCompare(b.email || "", undefined, {
    sensitivity: "base",
  });
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const randPassword = (len = 14) => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};
const getDaysLeft = (ts) => {
  if (!ts) return 0;
  const ms = (ts?.toMillis?.() ?? new Date(ts).getTime()) - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};
const computeNewExpiry = (currentTs, grantDays = 365) => {
  const nowMs = Date.now();
  const curMs = currentTs?.toMillis?.() ? currentTs.toMillis() : null;
  const base = curMs && curMs > nowMs ? curMs : nowMs;
  return Timestamp.fromDate(new Date(base + grantDays * 24 * 60 * 60 * 1000));
};
const slotsFor = (isPremium) =>
  isPremium
    ? ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"]
    : ["s1", "s2"];

const API_KEY = firebaseApiKey || auth?.app?.options?.apiKey;
const BASE_URL =
  IDENTITY_TOOLKIT_BASE_URL || "https://identitytoolkit.googleapis.com/v1";

export default function AdminUsuariosScreen() {
  const navigation = useNavigation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Editar
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [isResident, setIsResident] = useState(true);
  const [apartment, setApartment] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [otherEnabled, setOtherEnabled] = useState(false);
  const [otherUrl, setOtherUrl] = useState("");

  // Crear
  const [createOpen, setCreateOpen] = useState(false);
  const [cEmail, setCEmail] = useState("");
  const [cDisplayName, setCDisplayName] = useState("");
  const [cIsResident, setCIsResident] = useState(true);
  const [cApartment, setCApartment] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cBio, setCBio] = useState("");
  const [creating, setCreating] = useState(false);

  // Compras (panel dentro del admin)
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const purchasesUnsubRef = useRef(null);

  // Ajustes (Concurso)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contestEnabled, setContestEnabled] = useState(false);
  const [contestLoading, setContestLoading] = useState(false);
  const contestUnsubRef = useRef(null);

  const unsubRef = useRef(null);

  // Detectar admin
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      try {
        const tk = await u.getIdTokenResult();
        setIsAdmin(!!tk.claims?.admin);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Suscripción lista de usuarios
  useEffect(() => {
    if (!isAdmin) return;
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    const colRef = collection(db, "users");
    let qRef;
    if (searchDebounced) {
      qRef = query(
        colRef,
        orderBy("email"),
        startAt(searchDebounced),
        endAt(searchDebounced + "\uf8ff"),
        limit(50)
      );
    } else {
      qRef = query(colRef, limit(100));
    }

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr = snap.docs.map((d) => ({
          id: d.id,
          uid: d.id,
          ...d.data(),
        }));
        const norm = searchDebounced.toLowerCase();
        const filtered = norm
          ? arr.filter((u) => (u.email || "").toLowerCase().includes(norm))
          : arr;
        setUsers(filtered.sort(byEmailAsc));
      },
      (err) => {
        console.log("onSnapshot error:", err);
        setUsers([]);
      }
    );
    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [isAdmin, searchDebounced]);

  // Abrir/cerrar panel de compras pendientes
  const openPurchases = useCallback(() => {
    if (!isAdmin) return;
    setPurchasesOpen(true);
    if (purchasesUnsubRef.current) {
      purchasesUnsubRef.current();
      purchasesUnsubRef.current = null;
    }
    setPurchasesLoading(true);
    const qRef = query(
      collection(db, "billingPurchases"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setPurchases(arr);
        setPurchasesLoading(false);
      },
      (err) => {
        console.log("billingPurchases snapshot err:", err);
        setPurchases([]);
        setPurchasesLoading(false);
      }
    );
    purchasesUnsubRef.current = unsub;
  }, [isAdmin]);

  const closePurchases = useCallback(() => {
    setPurchasesOpen(false);
    if (purchasesUnsubRef.current) {
      purchasesUnsubRef.current();
      purchasesUnsubRef.current = null;
    }
  }, []);

  const approvePurchase = useCallback(
    async (purchase) => {
      if (!isAdmin) return;
      try {
        const { uid, productId, orderId } = purchase;
        if (!uid) {
          Alert.alert("Aprobar", "La compra no trae uid.");
          return;
        }
        const userRef = doc(db, "users", uid);
        const pRef = doc(db, "billingPurchases", purchase.id);

        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(
            userRef,
            { createdAt: serverTimestamp() },
            { merge: true }
          );
        }
        const current = userSnap.exists()
          ? userSnap.data()?.premiumExpiresAt
          : null;
        const grantDays = productId === "premium_annual" ? 365 : 365;
        const newExpiry = computeNewExpiry(current, grantDays);

        const batch = writeBatch(db);

        batch.set(
          userRef,
          {
            premiumExpiresAt: newExpiry,
            lastPremiumSku: productId || "premium_annual",
            lastPremiumPurchaseAt: serverTimestamp(),
            premiumLastSku: productId || "premium_annual",
            premiumLastGrantedDays: grantDays,
            premiumLastOrderId: orderId || null,
            updatedAt: serverTimestamp(),
            features: { profilePhoto: true, marketplaceImages: true },
            limits: { allowedSlots: slotsFor(true) },
            entitlements: { premium: true },
          },
          { merge: true }
        );

        batch.update(pRef, {
          status: "approved",
          approvedBy: auth.currentUser?.uid || null,
          approvedAt: serverTimestamp(),
          appliedDays: grantDays,
          appliedExpiry: newExpiry,
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        Alert.alert("Aprobado", "Premium activado para el usuario.");
      } catch (e) {
        console.log("approve error", e);
        Alert.alert("Error", "No se pudo aprobar la compra.");
      }
    },
    [isAdmin]
  );

  const rejectPurchase = useCallback(
    async (purchase) => {
      if (!isAdmin) return;
      try {
        const pRef = doc(db, "billingPurchases", purchase.id);
        await updateDoc(pRef, {
          status: "rejected",
          rejectedBy: auth.currentUser?.uid || null,
          rejectedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        Alert.alert("Rechazado", "Compra marcada como rechazada.");
      } catch (e) {
        console.log("reject error", e);
        Alert.alert("Error", "No se pudo rechazar la compra.");
      }
    },
    [isAdmin]
  );

  const openEdit = useCallback((u) => {
    setSelected(u);
    setDisplayName(u.displayName || "");
    setEmail(u.email || "");
    setIsResident(!!u.isResident);
    setApartment(u.apartment || "");
    setPhone(u.phone || "");
    setBio(u.bio || "");
    setInstagramEnabled(!!u.instagramEnabled);
    setInstagramUrl(u.instagramUrl || "");
    setWhatsappEnabled(!!u.whatsappEnabled);
    setWhatsappNumber(u.whatsappNumber || "");
    setOtherEnabled(!!u.otherEnabled);
    setOtherUrl(u.otherUrl || "");
    setEditOpen(true);
  }, []);

  const save = async () => {
    if (!selected?.uid) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "users", selected.uid), {
        displayName: displayName.trim(),
        isResident,
        apartment: apartment.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
        instagramEnabled,
        instagramUrl: instagramUrl.trim(),
        whatsappEnabled,
        whatsappNumber: whatsappNumber.trim(),
        otherEnabled,
        otherUrl: otherUrl.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditOpen(false);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  // 🔒 Inhabilitar / Habilitar (soft delete)
  const toggleDisabled = (u) => {
    if (!u?.uid) return;
    const wantDisable = !u.disabled;
    const actionWord = wantDisable ? "Inhabilitar" : "Habilitar";
    Alert.alert(
      `${actionWord} usuario`,
      `¿Seguro que deseas ${actionWord.toLowerCase()} a ${
        u.displayName || u.email || u.uid
      }?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: actionWord,
          style: wantDisable ? "destructive" : "default",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "users", u.uid), {
                disabled: wantDisable,
                disabledAt: wantDisable ? serverTimestamp() : null,
                disabledBy: wantDisable ? auth.currentUser?.uid || null : null,
                updatedAt: serverTimestamp(),
              });
            } catch (e) {
              Alert.alert("Error", "No se pudo actualizar el estado.");
            }
          },
        },
      ]
    );
  };

  // 🗑️ Eliminar documento de perfil (NO borra Auth)
  const removeUserDoc = (u) => {
    if (!u?.uid) return;
    Alert.alert(
      "Eliminar perfil",
      "Esto elimina el documento en Firestore, pero NO elimina la cuenta de autenticación del usuario.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", u.uid));
            } catch (e) {
              Alert.alert("Error", "No se pudo eliminar el perfil.");
            }
          },
        },
      ]
    );
  };

  const createUser = async () => {
    const email = cEmail.trim().toLowerCase();
    if (!emailRegex.test(email)) {
      Alert.alert("Correo inválido", "Escribe un correo válido.");
      return;
    }
    try {
      setCreating(true);
      const password = randPassword(14);
      const res = await fetch(`${BASE_URL}/accounts:signUp?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.error?.message || "UNKNOWN";
        if (code === "EMAIL_EXISTS") {
          Alert.alert(
            "El correo ya existe",
            "La cuenta ya está en Auth. Pídele al usuario que abra su Perfil para crear/actualizar su doc en Firestore, o créalo manualmente con el UID."
          );
        } else {
          Alert.alert("No se pudo crear el usuario", code);
        }
        return;
      }
      const uid = data.localId;

      await setDoc(
        doc(db, "users", uid),
        {
          email,
          displayName: cDisplayName.trim(),
          isResident: cIsResident,
          apartment: cApartment.trim(),
          phone: cPhone.trim(),
          bio: cBio.trim(),
          recommendedCount: 0,
          notRecommendedCount: 0,
          instagramEnabled: false,
          instagramUrl: "",
          whatsappEnabled: false,
          whatsappNumber: "",
          otherEnabled: false,
          otherUrl: "",
          disabled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await fetch(`${BASE_URL}/accounts:sendOobCode?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
      });

      setCreateOpen(false);
      setCEmail("");
      setCDisplayName("");
      setCIsResident(true);
      setCApartment("");
      setCPhone("");
      setCBio("");
      Alert.alert(
        "Usuario creado",
        "Se envió un correo para establecer la contraseña."
      );
    } catch (e) {
      Alert.alert("Error", "No se pudo crear el usuario.");
    } finally {
      setCreating(false);
    }
  };

  // === Ajustes (Concurso) ===
  const openSettings = useCallback(() => {
    if (!isAdmin) return;
    setSettingsOpen(true);
    setContestLoading(true);
    if (contestUnsubRef.current) {
      contestUnsubRef.current();
      contestUnsubRef.current = null;
    }
    const cref = doc(db, "config", "contest");
    const unsub = onSnapshot(
      cref,
      (snap) => {
        const enabled = !!(snap.exists() ? snap.data()?.enabled : false);
        setContestEnabled(enabled);
        setContestLoading(false);
      },
      () => setContestLoading(false)
    );
    contestUnsubRef.current = unsub;
  }, [isAdmin]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (contestUnsubRef.current) {
      contestUnsubRef.current();
      contestUnsubRef.current = null;
    }
  }, []);

  const saveSettings = useCallback(async () => {
    try {
      setContestLoading(true);
      await setDoc(
        doc(db, "config", "contest"),
        { enabled: !!contestEnabled, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setContestLoading(false);
      Alert.alert("Guardado", "Ajustes actualizados.");
      setSettingsOpen(false);
    } catch (e) {
      setContestLoading(false);
      Alert.alert("Error", "No se pudo guardar los ajustes.");
    }
  }, [contestEnabled]);

  const renderItem = ({ item }) => {
    const days = getDaysLeft(item?.premiumExpiresAt);
    const isPremium = days > 0;
    return (
      <View style={[styles.userCard, item.disabled && { opacity: 0.7 }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.userHeader}>
            <View style={styles.avatarSm}>
              <Text style={styles.avatarSmText}>
                {(item.displayName || item.email || "US")
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Text style={styles.userName} numberOfLines={1}>
                  {item.displayName || "Sin nombre"}
                </Text>
                {item.disabled ? (
                  <View style={styles.badgeDisabled}>
                    <Ionicons name="ban-outline" size={12} color="#991b1b" />
                    <Text style={styles.badgeDisabledText}> INHABILITADO</Text>
                  </View>
                ) : null}
                {isPremium && (
                  <View style={styles.badgePremium}>
                    <Ionicons name="star" size={12} color="#b45309" />
                    <Text style={styles.badgePremiumText}>
                      {" "}
                      Premium · {days} d
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.userEmail} numberOfLines={1}>
                {item.email || "—"}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.badge}>
              <Ionicons name="business-outline" size={14} color="#0f766e" />
              <Text style={[styles.badgeText, { color: "#0f766e" }]}>
                {" "}
                {item.apartment || "—"}
              </Text>
            </View>
            <View style={[styles.badge, { marginLeft: 8 }]}>
              <Ionicons
                name={item.isResident ? "home-outline" : "people-outline"}
                size={14}
                color={item.isResident ? "#0a58ca" : "#b45309"}
              />
              <Text
                style={[
                  styles.badgeText,
                  { color: item.isResident ? "#0a58ca" : "#b45309" },
                ]}
              >
                {" "}
                {item.isResident ? "Residente" : "Externo"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsCol}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.btnEdit]}
            onPress={() => openEdit(item)}
          >
            <Ionicons name="create-outline" size={16} />
            <Text style={styles.btnEditText}> Editar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              item.disabled ? styles.btnEnable : styles.btnDisable,
            ]}
            onPress={() => toggleDisabled(item)}
          >
            <Ionicons
              name={item.disabled ? "checkmark-circle-outline" : "ban-outline"}
              size={16}
              color={item.disabled ? "#0f766e" : "#991b1b"}
            />
            <Text
              style={[
                styles.toggleText,
                { color: item.disabled ? "#0f766e" : "#991b1b" },
              ]}
            >
              {item.disabled ? " Habilitar" : " Inhabilitar"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.btnDelete]}
            onPress={() => removeUserDoc(item)}
          >
            <Ionicons name="trash-outline" size={16} color="#991b1b" />
            <Text style={styles.btnDeleteText}> Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
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

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={[styles.centerFill, { padding: 18 }]}>
          <Ionicons name="lock-closed-outline" size={42} color="#64748b" />
          <Text style={styles.lockTitle}>Acceso restringido</Text>
          <Text style={styles.lockText}>
            Necesitas permisos de administrador para ver este panel.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        {/* Header + buscador + crear + compras + ajustes */}
        <View style={styles.header}>
          <Text style={styles.title}>Administrar usuarios</Text>

          <View style={styles.rowTop}>
            <View style={[styles.searchWrap, { flex: 1 }]}>
              <Ionicons name="search-outline" size={18} color="#637282" />
              <TextInput
                style={styles.searchInput}
                placeholder="Filtrar por correo…"
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => setCreateOpen(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.createBtnText}> Crear usuario</Text>
            </TouchableOpacity>

            <TouchableOpacity
			  style={styles.purchasesBtn}
			  onPress={() => navigation.navigate('AdminCompras')}
			  activeOpacity={0.9}
			>
			  <Ionicons name="card-outline" size={18} color="#fff" />
			  <Text style={styles.purchasesBtnText}> Compras</Text>
			</TouchableOpacity>


            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={openSettings}
              activeOpacity={0.9}
            >
              <Ionicons name="options-outline" size={18} color="#fff" />
              <Text style={styles.settingsBtnText}> Ajustes</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Consejo: la búsqueda usa prefijo del campo{" "}
            <Text style={{ fontWeight: "800" }}>email</Text>.
          </Text>
        </View>

        {/* Lista */}
        {users == null ? (
          <View className="centerFill" style={styles.centerFill}>
            <ActivityIndicator />
          </View>
        ) : users.length === 0 ? (
          <View style={[styles.centerFill, { padding: 24 }]}>
            <Ionicons name="people-circle-outline" size={46} color="#94a3b8" />
            <Text
              style={{
                color: "#64748b",
                marginTop: 8,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              No hay usuarios para mostrar.{"\n"}
              Crea uno nuevo o pide a un usuario que abra su Perfil para generar
              el perfil base.
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(it) => it.uid}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>

      {/* Modal Editar */}
      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Editar usuario</Text>

            <Text style={styles.inputLabel}>Correo (solo lectura)</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              editable={false}
              value={email}
            />

            <Text style={styles.inputLabel}>Nombre completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre y apellido"
              value={displayName}
              onChangeText={setDisplayName}
              placeholderTextColor="#94a3b8"
            />

            <View style={styles.rowBetween}>
              <Text style={styles.inputLabel}>¿Es residente?</Text>
              <Switch value={isResident} onValueChange={setIsResident} />
            </View>

            <Text style={styles.inputLabel}>Apartamento</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Torre 3 - 204"
              value={apartment}
              onChangeText={setApartment}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Teléfono</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: +57 3001234567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Descripción</Text>
            <TextInput
              style={[styles.input, { height: 84, textAlignVertical: "top" }]}
              placeholder="Bio del usuario…"
              value={bio}
              onChangeText={setBio}
              multiline
              placeholderTextColor="#94a3b8"
            />

            {/* Redes */}
            <View style={styles.divider} />
            <Text style={[styles.inputLabel, { marginBottom: 6 }]}>
              Redes sociales
            </Text>

            <View style={styles.rowBetween}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="logo-instagram" size={16} color="#d62976" />
                <Text
                  style={[styles.inputLabel, { marginLeft: 6, marginTop: 0 }]}
                >
                  Instagram
                </Text>
              </View>
              <Switch
                value={instagramEnabled}
                onValueChange={setInstagramEnabled}
              />
            </View>
            {instagramEnabled && (
              <TextInput
                style={styles.input}
                placeholder="https://instagram.com/usuario"
                value={instagramUrl}
                onChangeText={setInstagramUrl}
                autoCapitalize="none"
                placeholderTextColor="#94a3b8"
              />
            )}

            <View style={[styles.rowBetween, { marginTop: 8 }]}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                <Text
                  style={[styles.inputLabel, { marginLeft: 6, marginTop: 0 }]}
                >
                  WhatsApp
                </Text>
              </View>
              <Switch
                value={whatsappEnabled}
                onValueChange={setWhatsappEnabled}
              />
            </View>
            {whatsappEnabled && (
              <TextInput
                style={styles.input}
                placeholder="+57 3001234567"
                value={whatsappNumber}
                onChangeText={setWhatsappNumber}
                keyboardType="phone-pad"
                autoCapitalize="none"
                placeholderTextColor="#94a3b8"
              />
            )}

            <View style={[styles.rowBetween, { marginTop: 8 }]}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="link-outline" size={16} color="#475569" />
                <Text
                  style={[styles.inputLabel, { marginLeft: 6, marginTop: 0 }]}
                >
                  Otra
                </Text>
              </View>
              <Switch value={otherEnabled} onValueChange={setOtherEnabled} />
            </View>
            {otherEnabled && (
              <TextInput
                style={styles.input}
                placeholder="https://tu-sitio.com"
                value={otherUrl}
                onChangeText={setOtherUrl}
                autoCapitalize="none"
                placeholderTextColor="#94a3b8"
              />
            )}

            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={() => setEditOpen(false)}
                disabled={saving}
              >
                <Text style={styles.secondaryBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <View style={{ width: 10 }} />
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { flex: 1, opacity: saving ? 0.7 : 1 },
                ]}
                onPress={save}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}> Guardar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Crear */}
      <Modal
        visible={createOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Crear usuario</Text>

            <Text style={styles.inputLabel}>Correo</Text>
            <TextInput
              style={styles.input}
              placeholder="correo@ejemplo.com"
              value={cEmail}
              onChangeText={setCEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Nombre completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre y apellido"
              value={cDisplayName}
              onChangeText={setCDisplayName}
              placeholderTextColor="#94a3b8"
            />

            <View style={styles.rowBetween}>
              <Text style={styles.inputLabel}>¿Es residente?</Text>
              <Switch value={cIsResident} onValueChange={setCIsResident} />
            </View>

            <Text style={styles.inputLabel}>Apartamento</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Torre 3 - 204"
              value={cApartment}
              onChangeText={setCApartment}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Teléfono</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: +57 3001234567"
              value={cPhone}
              onChangeText={setCPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Bio</Text>
            <TextInput
              style={[styles.input, { height: 84, textAlignVertical: "top" }]}
              placeholder="Descripción breve…"
              value={cBio}
              onChangeText={setCBio}
              multiline
              placeholderTextColor="#94a3b8"
            />

            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={() => setCreateOpen(false)}
                disabled={creating}
              >
                <Text style={styles.secondaryBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <View style={{ width: 10 }} />
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { flex: 1, opacity: creating ? 0.7 : 1 },
                ]}
                onPress={createUser}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Ionicons
                      name="person-add-outline"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.primaryBtnText}> Crear</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Compras pendientes */}
      <Modal
        visible={purchasesOpen}
        transparent
        animationType="slide"
        onRequestClose={closePurchases}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: "85%" }]}>
            <Text style={styles.modalTitle}>Compras pendientes</Text>

            {purchasesLoading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="large" />
              </View>
            ) : purchases.length === 0 ? (
              <Text
                style={{
                  color: "#64748b",
                  fontWeight: "700",
                  textAlign: "center",
                  marginVertical: 12,
                }}
              >
                No hay compras pendientes.
              </Text>
            ) : (
              <FlatList
                data={purchases}
                keyExtractor={(it) => it.id}
                renderItem={({ item }) => {
  const created = item.createdAt?.toDate?.() ? item.createdAt.toDate() : null;
  const when = created ? created.toLocaleString() : "—";
  const pDate = item.purchaseTime ? new Date(item.purchaseTime) : null;
  const manual = (item?.source || "") === "manual_request";

  return (
    <View style={styles.purchaseCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.purchaseTitle}>
          {manual ? "Solicitud Premium (manual)" : "Compra"}
        </Text>

        {/* Identificación del solicitante */}
        <Text style={styles.purchaseLine}>
          Usuario: {item.uid}
        </Text>
        {!!item.contactName && (
          <Text style={styles.purchaseLine}>Nombre: {item.contactName}</Text>
        )}
        {!!item.contactEmail && (
          <Text style={styles.purchaseLine}>Correo: {item.contactEmail}</Text>
        )}
        {!!item.contactPhone && (
          <Text style={styles.purchaseLine}>Teléfono: {item.contactPhone}</Text>
        )}

        {/* Datos del ticket */}
        <Text style={styles.purchaseLine}>
          Producto: {item.productId || "premium_annual"}
        </Text>
        <Text style={styles.purchaseLine}>
          Order ID: {item.orderId || "—"}
        </Text>
		<Text style={styles.purchaseLine}>
          Ticket ID: {item.id} || "—"}
        </Text>
		
        {!!item.purchaseToken && (
          <Text style={styles.purchaseLine}>
            Token: {(item.purchaseToken || "").slice(0, 8)}…
          </Text>
        )}
        <Text style={styles.purchaseLine}>
          Compra: {pDate ? pDate.toLocaleString() : "—"}
        </Text>
        <Text style={styles.purchaseLine}>
          Dispositivo: {(item?.deviceInfo?.os || "?")} {(item?.deviceInfo?.osVersion || "")}
        </Text>
        <Text style={styles.purchaseLine}>
          App: {(item?.deviceInfo?.appName || "App")} {(item?.deviceInfo?.appVersion || "")}
        </Text>
        <Text style={styles.purchaseLine}>Ticket: {when}</Text>
      </View>

      <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
        <TouchableOpacity
          style={[styles.btn, styles.btnApprove]}
          onPress={() => approvePurchase(item)}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.btnTxtWhite}> Aprobar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnReject]}
          onPress={() => rejectPurchase(item)}
        >
          <Ionicons name="close" size={18} color="#fff" />
          <Text style={styles.btnTxtWhite}> Rechazar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}}
                contentContainerStyle={{ paddingVertical: 6 }}
              />
            )}

            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: 10 }]}
              onPress={closePurchases}
            >
              <Text style={styles.secondaryBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Ajustes (Concurso) */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSettings}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Ajustes de la app</Text>

            <View style={[styles.rowBetween, { marginTop: 4 }]}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="trophy-outline" size={18} color="#92400e" />
                <Text style={[styles.inputLabel, { marginLeft: 8, marginTop: 0 }]}>
                  Concurso visible en inicio
                </Text>
              </View>
              <Switch
                value={contestEnabled}
                onValueChange={setContestEnabled}
              />
            </View>

            <Text style={{ color: "#64748b", marginTop: 8, fontWeight: "600" }}>
              Controla si el bloque “Concurso de emprendedores” aparece en la pantalla principal.
            </Text>

            <View style={{ flexDirection: "row", marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={closeSettings}
                disabled={contestLoading}
              >
                <Text style={styles.secondaryBtnText}>Cerrar</Text>
              </TouchableOpacity>
              <View style={{ width: 10 }} />
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1, opacity: contestLoading ? 0.7 : 1 }]}
                onPress={saveSettings}
                disabled={contestLoading}
              >
                {contestLoading ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}> Guardar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* Styles */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f7fb" },
  container: { flex: 1, padding: 16 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "900", color: "#12263a" },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e6ea",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { marginLeft: 6, flex: 1, color: "#0f172a", paddingVertical: 6 },
  createBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  createBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  purchasesBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  purchasesBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  settingsBtn: {
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  settingsBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  hint: { marginTop: 6, fontSize: 11, color: "#6b7a90" },

  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e8edf5",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  userHeader: { flexDirection: "row", alignItems: "center" },
  avatarSm: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#e9f1ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dbe7ff",
  },
  avatarSmText: { color: "#0a58ca", fontWeight: "900" },
  userName: { fontSize: 14, fontWeight: "900", color: "#12263a" },
  userEmail: { fontSize: 12, color: "#637282", marginTop: 2 },

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "900" },

  badgeDisabled: {
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeDisabledText: { fontSize: 10, fontWeight: "900", color: "#991b1b" },

  badgePremium: {
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef9c3",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgePremiumText: { fontSize: 10, fontWeight: "900", color: "#92400e" },

  actionsCol: {
    marginLeft: 12,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },

  btnEdit: { backgroundColor: "#eaf2ff", borderColor: "#cfe2ff" },
  btnEditText: { color: "#0d6efd", fontWeight: "800" },

  btnDisable: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },
  btnEnable: { backgroundColor: "#d1fae5", borderColor: "#a7f3d0" },
  toggleText: { fontWeight: "800" },

  btnDelete: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },
  btnDeleteText: { color: "#991b1b", fontWeight: "800" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  divider: { height: 1, backgroundColor: "#eef2f7", marginVertical: 10 },

  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#555",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e3e6ea",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    color: "#0f172a",
  },
  inputDisabled: { backgroundColor: "#f1f5f9", color: "#94a3b8" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  primaryBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#0f172a", fontWeight: "800", fontSize: 16 },

  lockTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: "#1f2937",
  },
  lockText: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },

  // Purchases
  purchaseCard: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
  },
  purchaseTitle: { color: "#0f172a", fontWeight: "900", marginBottom: 6 },
  purchaseLine: { color: "#334155", fontWeight: "600" },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  btnApprove: { backgroundColor: "#16a34a" },
  btnReject: { backgroundColor: "#ef4444" },
  btnTxtWhite: { color: "#fff", fontWeight: "800" },
});
