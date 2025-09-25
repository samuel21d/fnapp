// src/screens/MercadoScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  Modal,
  Alert,
  Linking,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { auth, db } from "../firebaseConfig";
import { onIdTokenChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";

/* === LÍMITES === */
// Gratis (como hoy)
const SELL_LIMIT = 2; // Venta
const RENT_LIMIT = 2; // Arriendo
// Premium: total (Venta + Arriendo) activo simultáneo
const PREMIUM_TOTAL_LIMIT = 10;
/* ⏰ Expiración Mercado */
const EXPIRY_DAYS = 7;
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
/* === Constantes / Utils === */
const CATEGORIES = [
  "Electrónica",
  "Hogar",
  "Muebles",
  "Deportes",
  "Vehículos",
  "Herramientas",
  "Ropa",
  "Otros",
];

const fmtCOP = (n) => {
  if (n == null || n === "") return "";
  try {
    return Number(n).toLocaleString("es-CO");
  } catch {
    return String(n);
  }
};

const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const relTime = (ts) => {
  try {
    const ms =
      typeof ts?.toMillis === "function"
        ? ts.toMillis()
        : typeof ts === "number"
        ? ts
        : Date.parse(ts);
    if (!ms || Number.isNaN(ms)) return "";
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "ahora";
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
  } catch {
    return "";
  }
};

/* ⏱️ Premium helpers (local, sin Functions) */
const daysRemaining = (ts) => {
  try {
    const ms =
      typeof ts?.toMillis === "function"
        ? ts.toMillis()
        : typeof ts === "number"
        ? ts
        : Date.parse(ts);
    if (!ms || Number.isNaN(ms)) return 0;
    const diff = ms - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
};

/* === Hooks === */
function useUserMap(uids) {
  const [map, setMap] = useState({});
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const unique = Array.from(new Set((uids || []).filter(Boolean)));
        const pairs = await Promise.all(
          unique.map(async (uid) => {
            try {
              const s = await getDoc(doc(db, "users", uid));
              return [uid, s.exists() ? s.data() : {}];
            } catch {
              return [uid, {}];
            }
          })
        );
        if (!mounted) return;
        const m = {};
        pairs.forEach(([k, v]) => (m[k] = v));
        setMap(m);
      } catch {
        if (mounted) setMap({});
      }
    }
    if (uids?.length) load();
    else setMap({});
    return () => {
      mounted = false;
    };
  }, [JSON.stringify(uids)]);
  return map;
}

/* === UI === */
function CategoryChips({ value, onChange }) {
  return (
    <View style={styles.catRow}>
      {CATEGORIES.map((c) => {
        const active = value === c;
        return (
          <TouchableOpacity
            key={c}
            style={[
              styles.catChip,
              active && { backgroundColor: "#d1f7ee", borderColor: "#a5efe1" },
            ]}
            onPress={() => onChange(active ? "" : c)}
            activeOpacity={0.85}
          >
            <Text style={[styles.catChipText, active && { color: "#0f766e" }]}>
              {c}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ListingCard({
  item,
  seller,
  onWhatsApp,
  onContact,
  isMine,
  onEdit,
  onDelete,
  canDelete,
  
}) {
  const isSale = item.type === "sale";
  const priceLabel = isSale ? "Precio" : "Canon";
  return (
    <View style={styles.card}>
      <View style={styles.badgeType}>
        <Ionicons
          name={isSale ? "pricetag-outline" : "home-outline"}
          size={14}
          color={isSale ? "#0a58ca" : "#0f766e"}
        />
        <Text
          style={[
            styles.badgeTypeText,
            { color: isSale ? "#0a58ca" : "#0f766e" },
          ]}
        >
          {"  "}
          {isSale ? "Venta" : "Arriendo"}
        </Text>
      </View>

      {/* Miniatura si hay imágenes */}
      {Array.isArray(item.images) &&
      item.images.length > 0 &&
      item.images[0]?.url ? (
        <View style={styles.thumbWrap}>
          <Image
            source={{ uri: item.images[0].url }}
            style={styles.thumbImage}
            resizeMode="cover"
          />
          {item.images.length > 1 && (
            <View style={styles.thumbCountPill}>
              <Ionicons name="images-outline" size={12} color="#fff" />
              <Text style={styles.thumbCountText}> {item.images.length}</Text>
            </View>
          )}
        </View>
      ) : null}

      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title || "(Sin título)"}
      </Text>

      <Text style={styles.cardSub} numberOfLines={1}>
        {priceLabel}: {item.price != null ? `${fmtCOP(item.price)} COP` : "—"}
        {item.category ? `  •  ${item.category}` : ""}
      </Text>

      <View style={styles.metaRow}>
        {daysRemaining(seller?.premiumExpiresAt) > 0 && !!seller?.avatarUrl ? (
          <Image
            source={{ uri: seller.avatarUrl }}
            style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff" }}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="person-circle-outline" size={14} color="#64748b" />
        )}
        <Text style={styles.metaText}>
          {"  "}
          {seller?.displayName || "Vendedor"}
          {seller?.apartment ? ` • Apt ${seller.apartment}` : ""}
        </Text>
        <Text style={[styles.metaText, { marginLeft: "auto" }]}>
          {relTime(item.createdAt)}
        </Text>
      </View>

      <View style={styles.actionsRow}>
        {isMine ? (
          <>
            <TouchableOpacity
              style={[styles.smallBtn, styles.editChip]}
              onPress={onEdit}
              activeOpacity={0.9}
            >
              <Ionicons name="create-outline" size={14} color="#0d6efd" />
              <Text style={[styles.smallBtnText, { color: "#0d6efd" }]}>
                {"  "}Editar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.smallBtn, styles.dangerChip]}
              onPress={onDelete}
              activeOpacity={0.9}
            >
              <Ionicons name="trash-outline" size={14} color="#991b1b" />
              <Text style={[styles.smallBtnText, { color: "#991b1b" }]}>
                {"  "}Eliminar
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.smallBtn, styles.primaryChip]}
              onPress={onContact}
              activeOpacity={0.9}
            >
              <Ionicons name="chatbubbles-outline" size={14} color="#fff" />
              <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                {"  "}Contactar
              </Text>
            </TouchableOpacity>
            {canDelete && (
              <TouchableOpacity
                style={[styles.smallBtn, styles.dangerChip]}
                onPress={onDelete}
                activeOpacity={0.9}
              >
                <Ionicons name="trash-outline" size={14} color="#991b1b" />
                <Text style={[styles.smallBtnText, { color: "#991b1b" }]}>
                  {"  "}Eliminar
                </Text>
              </TouchableOpacity>
            )}
            {!!seller?.socials?.whatsapp?.enabled &&
              !!seller?.socials?.whatsapp?.value && (
                <TouchableOpacity
                  style={[
                    styles.smallBtn,
                    { backgroundColor: "#d1fae5", borderColor: "#a7f3d0" },
                  ]}
                  onPress={onWhatsApp}
                  activeOpacity={0.9}
                >
                  <Ionicons name="logo-whatsapp" size={14} color="#047857" />
                  <Text style={[styles.smallBtnText, { color: "#065f46" }]}>
                    {"  "}
                    WhatsApp
                  </Text>
                </TouchableOpacity>
              )}
          </>
        )}
      </View>
    </View>
  );
}

/* === Segment tabs (Todo / Venta / Arriendo) === */
function Segment({ value, onChange }) {
  return (
    <View style={styles.segmentWrap}>
      <TouchableOpacity
        style={[
          styles.segmentBtn,
          styles.segmentBtnFlex,
          value === "all" && styles.segmentBtnActiveGray,
        ]}
        onPress={() => onChange("all")}
      >
        <Ionicons
          name="grid-outline"
          size={18}
          color={value === "all" ? "#334155" : "#475569"}
        />
        <Text
          style={[styles.segmentText, value === "all" && { color: "#334155" }]}
        >
          {"  "}Todo
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.segmentBtn,
          styles.segmentBtnFlex,
          value === "sale" && styles.segmentBtnActiveBlue,
        ]}
        onPress={() => onChange("sale")}
      >
        <Ionicons
          name="pricetag-outline"
          size={18}
          color={value === "sale" ? "#0d6efd" : "#475569"}
        />
        <Text
          style={[styles.segmentText, value === "sale" && { color: "#0d6efd" }]}
        >
          {"  "}Venta
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.segmentBtn,
          styles.segmentBtnFlex,
          value === "rent" && styles.segmentBtnActiveGreen,
        ]}
        onPress={() => onChange("rent")}
      >
        <Ionicons
          name="home-outline"
          size={18}
          color={value === "rent" ? "#0f766e" : "#475569"}
        />
        <Text
          style={[styles.segmentText, value === "rent" && { color: "#0f766e" }]}
        >
          {"  "}Arriendo
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* === Pantalla principal === */
export default function MercadoScreen() {
  const me = auth.currentUser;
  const navigation = useNavigation();
    // 👇 Asegura que el Tab Bar esté visible cuando esta pantalla está activa
  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent?.(); // Tab navigator
      // Si alguna pantalla previa ocultó el tab bar, lo volvemos a mostrar aquí
      parent?.setOptions?.({
        tabBarStyle: [ { display: "flex" }, parent?.getState?.()?.routes ? {} : {} ],
      });
      return () => {};
    }, [navigation])
  );
  const [isAdmin, setIsAdmin] = useState(false);
  // Estado de datos
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [queryText, setQueryText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | sale | rent
  const [category, setCategory] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  // Publicar / Editar (sin "pausada")
  const [pubOpen, setPubOpen] = useState(false);
  const [pubType, setPubType] = useState("sale"); // sale | rent
  const [pubTitle, setPubTitle] = useState("");
  const [pubPrice, setPubPrice] = useState("");
  const [pubCategory, setPubCategory] = useState("");
  const [pubDesc, setPubDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { ownerUid, id } | null

  // Modal de límite
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitType, setLimitType] = useState("sale"); // "sale" | "rent" | "all" (premium total)

  // Premium (derivado del perfil del usuario)
  const [premiumActive, setPremiumActive] = useState(false);
  const [premiumDaysLeft, setPremiumDaysLeft] = useState(0);

  // Cloudinary (desde app.config.js -> extra.cloudinary)
  const cloudCfg = Constants?.expoConfig?.extra?.cloudinary || {};

  // Fotos de la publicación (solo premium)
  // Estructura: { uri: "local-uri", url?: "https://res.cloudinary.com/...jpg", id?: "public_id" }
  const [pubImages, setPubImages] = useState([]);
  const [uploadingImgs, setUploadingImgs] = useState(false);

  // Mapa de vendedores (para cards)
  const sellerUids = useMemo(
    () => all.map((x) => x.ownerUid).filter(Boolean),
    [all]
  );
  const userMap = useUserMap(sellerUids);

  const resetPublishForm = useCallback(() => {
    setPubType("sale");
    setPubTitle("");
    setPubPrice("");
    setPubCategory("");
    setPubDesc("");
    setEditing(null);
    setPubImages([]);
  }, []);

  // Si el usuario filtra por "Arriendo", limpiamos la categoría y ocultamos chips
  useEffect(() => {
    if (typeFilter === "rent" && category) setCategory("");
  }, [typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔎 Cargo publicaciones activas (de todos)
  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      const qRef = query(
        collectionGroup(db, "listings"),
        where("active", "==", true),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qRef);
      const arr = [];
      const nowMs = Date.now();
      snap.forEach((d) => {
        const data = d.data() || {};
        const ownerUid = d.ref.parent?.parent?.id || data.ownerUid || null;
        // ⏰ Ocultar del mercado si expiró (no afectamos el doc)
        const createdMs =
          typeof data?.createdAt?.toMillis === "function"
            ? data.createdAt.toMillis()
            : (data?.createdAt ? Date.parse(data.createdAt) : null);
        const expiresMs =
          typeof data?.expiresAt?.toMillis === "function"
            ? data.expiresAt.toMillis()
            : (createdMs ? createdMs + EXPIRY_MS : null);
        if (expiresMs && expiresMs <= nowMs) return; // omitido por expiración
        arr.push({ id: d.id, ownerUid, ...data });
      });
      setAll(arr);
    } catch (e) {
      console.error("Error cargando publicaciones:", e);
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Detectar claim admin
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) return setIsAdmin(false);
      try {
        const idt = await u.getIdTokenResult();
        setIsAdmin(!!idt.claims?.admin);
      } catch {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchListings();
    } finally {
      setRefreshing(false);
    }
  };

  // 🟡 Leo mi perfil para saber si soy premium (sin Functions)
  useEffect(() => {
    let mounted = true;
    async function loadMe() {
      try {
        if (!me?.uid) {
          if (mounted) {
            setPremiumActive(false);
            setPremiumDaysLeft(0);
          }
          return;
        }
        const s = await getDoc(doc(db, "users", me.uid));
        const d = s.exists() ? s.data() : {};
        const days = daysRemaining(d?.premiumExpiresAt);
        if (!mounted) return;
        setPremiumDaysLeft(days);
        setPremiumActive(days > 0);
      } catch {
        if (mounted) {
          setPremiumActive(false);
          setPremiumDaysLeft(0);
        }
      }
    }
    loadMe();
    return () => {
      mounted = false;
    };
  }, [me?.uid]);

  // Filtro
  const filtered = useMemo(() => {
    const q = norm(queryText);
    return all.filter((x) => {
      if (onlyMine && me?.uid && x.ownerUid !== me.uid) return false;
      if (typeFilter !== "all" && x.type !== typeFilter) return false;
      if (typeFilter !== "rent" && category && x.category !== category)
        return false;

      if (!q) return true;
      const haystack = [
        x.title,
        x.description,
        x.category,
        userMap[x.ownerUid]?.displayName,
      ]
        .map(norm)
        .join(" ");
      return haystack.includes(q);
    });
  }, [all, me?.uid, onlyMine, typeFilter, category, queryText, userMap]);

  // Mis publicaciones activas por tipo (para límite)
  const myActiveSale = useMemo(
    () =>
      all.filter(
        (x) =>
          me?.uid &&
          x.ownerUid === me.uid &&
          x.type === "sale" &&
          x.active !== false
      ),
    [all, me?.uid]
  );
  const myActiveRent = useMemo(
    () =>
      all.filter(
        (x) =>
          me?.uid &&
          x.ownerUid === me.uid &&
          x.type === "rent" &&
          x.active !== false
      ),
    [all, me?.uid]
  );
  const myActiveTotal = useMemo(
    () => myActiveSale.length + myActiveRent.length,
    [myActiveSale.length, myActiveRent.length]
  );

  const openWhatsApp = (rawNumber, text) => {
    if (!rawNumber) return;
    const num = String(rawNumber).replace(/[^\d]/g, "");
    const msg = encodeURIComponent(
      text || "Hola, vi tu publicación en la app 👋"
    );
    const url =
      Platform.OS === "ios"
        ? `https://wa.me/${num}?text=${msg}`
        : `whatsapp://send?phone=${num}&text=${msg}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(
        "WhatsApp no disponible",
        "No se pudo abrir WhatsApp en este dispositivo."
      )
    );
  };

  const openLimitModal = (type) => {
    setLimitType(type); // 'sale' | 'rent' | 'all'
    setLimitOpen(true);
  };

  const saveListing = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Debes iniciar sesión");
        return;
      }
      if (!pubTitle.trim()) {
        Alert.alert("Falta título", "Escribe un título para tu publicación.");
        return;
      }
      if (pubPrice.trim() === "" || isNaN(Number(pubPrice))) {
        Alert.alert("Precio inválido", "Ingresa un precio numérico.");
        return;
      }

      // ⛔ Chequeo de límite ANTES de guardar (solo creación)
      if (!editing) {
        if (premiumActive) {
          if (myActiveTotal >= PREMIUM_TOTAL_LIMIT) {
            openLimitModal("all");
            return;
          }
        } else {
          const overSale =
            pubType === "sale" && myActiveSale.length >= SELL_LIMIT;
          const overRent =
            pubType === "rent" && myActiveRent.length >= RENT_LIMIT;
          if (overSale || overRent) {
            openLimitModal(pubType);
            return;
          }
        }
      }

      setSaving(true);

      if (editing) {
        // Update existente (no tocar "active")
        const ref = doc(db, "users", editing.ownerUid, "listings", editing.id);
        const payload = {
          type: pubType,
          title: pubTitle.trim(),
          price: Number(pubPrice),
          description: pubDesc.trim(),
          updatedAt: serverTimestamp(),
        };
        if (pubType === "sale") {
          payload.category = pubCategory || "Otros";
        } else {
          payload.category = "";
        }
        // Solo premium puede escribir/actualizar 'images' (coincide con reglas)
        if (premiumActive) {
          const ready = pubImages
            .filter((x) => !!x.url || !!x.uri)
            .slice(0, 2)
            .map(({ url, uri, id }) => ({ url: url || uri, id }));
          payload.images = ready; // permite también vaciar imágenes []
        }
        await updateDoc(ref, payload);
        Alert.alert("Actualizado", "Tu publicación fue actualizada.");
      } else {
        // Crear nuevo (siempre activo)
        const payload = {
          type: pubType,
          title: pubTitle.trim(),
          price: Number(pubPrice),
          description: pubDesc.trim(),
          active: true,
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
         // ⏰ expira del mercado a los 7 días (sigue visible en perfil)
         expiresAt: new Date(Date.now() + EXPIRY_MS),
        };
        if (pubType === "sale") {
          payload.category = pubCategory || "Otros";
        }
        if (premiumActive) {
         const ready = pubImages
           .filter((x) => !!x.url || !!x.uri)
           .slice(0, 2)
           .map(({ url, uri, id }) => ({ url: url || uri, id }));
         if (ready.length) payload.images = ready;
        }
        await addDoc(collection(db, "users", user.uid, "listings"), payload);
        Alert.alert("Publicado", "Tu anuncio fue publicado correctamente.");
      }

      setPubOpen(false);
      resetPublishForm();
      fetchListings();
    } catch (e) {
      console.error("Error guardando publicación:", e);
      Alert.alert("Error", "No se pudo guardar la publicación.");
    } finally {
      setSaving(false);
    }
  };

  // Helpers de imágenes (Premium)
  const pickOneImage = async () => {
    if (!premiumActive) {
      Alert.alert(
        "Solo con Premium",
        "Subir fotos en publicaciones es un beneficio de FN Premium.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Activar Premium",
            onPress: () => navigation.navigate("PremiumPayScreen"),
          },
        ]
      );
      return;
    }
   if (pubImages.length >= 2) {
     Alert.alert("Límite de fotos", "Solo puedes añadir hasta 2 imágenes por publicación.");
     return;
   }
    // Permisos y selector
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permiso requerido",
        "Necesitamos acceso a tu galería para subir fotos."
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      selectionLimit: 1, // selecciona de a una; puedes repetir
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    setPubImages((arr) => [...arr, { uri: asset.uri }]);
  };

  const uploadOneToCloudinary = async (localUri) => {
    if (!cloudCfg?.cloudName || !cloudCfg?.uploadPreset) {
      throw new Error(
        "Cloudinary no está configurado (cloudName/uploadPreset)."
      );
    }
    const data = new FormData();
    data.append("file", {
      uri: localUri,
      type: "image/jpeg",
      name: `fn_${Date.now()}.jpg`,
    });
    data.append("upload_preset", cloudCfg.uploadPreset);
    // Opcional: carpeta
    // data.append("folder", "fnapp/listings");

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudCfg.cloudName}/upload`,
      {
        method: "POST",
        body: data,
      }
    );
    const json = await res.json();
    if (!res.ok || !json?.secure_url) {
      throw new Error(json?.error?.message || "Error subiendo imagen");
    }
    return { url: json.secure_url, id: json.public_id };
  };

  const uploadAllImages = async () => {
    if (!premiumActive) return;
    if (!pubImages.length) return;
    try {
      setUploadingImgs(true);
      const next = [];
     for (const it of pubImages.slice(0, 2)) {
        if (it.url) {
          next.push(it);
          continue;
        } // ya subida
        const up = await uploadOneToCloudinary(it.uri);
        next.push({ ...it, ...up });
      }
      setPubImages(next.slice(0, 2));
      Alert.alert("Listo", "Imágenes subidas correctamente.");
    } catch (e) {
      Alert.alert("Error subiendo imágenes", e.message || "Intenta de nuevo.");
    } finally {
      setUploadingImgs(false);
    }
  };

  const removeImageAt = (idx) => {
    setPubImages((arr) => arr.filter((_, i) => i !== idx));
  };

  const confirmDelete = async (ownerUid, id, title) => {
    Alert.alert(
      "Eliminar publicación",
      `¿Seguro que deseas eliminar "${
        title || "esta publicación"
      }"? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", ownerUid, "listings", id));
              fetchListings();
            } catch (e) {
              console.error("Error eliminando:", e);
              Alert.alert("Error", "No se pudo eliminar la publicación.");
            }
          },
        },
      ]
    );
  };

  const startEditFromItem = (it) => {
    setEditing({ ownerUid: it.ownerUid, id: it.id });
    setPubType(it.type || "sale");
    setPubTitle(it.title || "");
    setPubPrice(String(it.price ?? ""));
    setPubCategory(it.type === "sale" ? it.category || "" : "");
    setPubDesc(it.description || "");
    // Si ya tenía imágenes, prepáralas en el estado (solo lectura/al editar)
    const imgs = Array.isArray(it.images) ? it.images : [];
    setPubImages(imgs.map((x) => ({ url: x.url, id: x.id })));
    setLimitOpen(false);
    setPubOpen(true);
  };

  /* === Header compuesto (buscador, tabs, categorías, filas de acciones) === */
  const Header = () => {
    return (
      <View style={styles.header}>
        <Text style={styles.title}>Mercado</Text>
        <Text style={styles.subtitle}>
          Compra y vende artículos, o publica / busca arriendos en un solo
          lugar.
        </Text>

        {/* Buscador */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color="#7a8aa0" />
          <TextInput
            value={queryText}
            onChangeText={setQueryText}
            placeholder="Buscar por título, categoría o vendedor"
            placeholderTextColor="#9fb0c4"
            style={styles.searchInput}
          />
        </View>

        {/* Tabs prominentes */}
        <View style={styles.segmentCard}>
          <Segment value={typeFilter} onChange={setTypeFilter} />
        </View>

        {/* Categorías — ocultas si el filtro es Arriendo */}
        {typeFilter !== "rent" && (
          <CategoryChips value={category} onChange={setCategory} />
        )}

        {/* Fila crear nueva publicación */}
        <View style={styles.createRow}>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => {
              resetPublishForm();
              setPubImages([]);
              setPubOpen(true);
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.createBtnText}> Crear nueva publicación</Text>
          </TouchableOpacity>
        </View>

        {/* Fila resultados + Ver mis publicaciones */}
        <View style={styles.resultsRow}>
          <Text style={styles.resultsText}>
            {filtered.length}{" "}
            {filtered.length === 1 ? "publicación" : "publicaciones"}
          </Text>

          <TouchableOpacity
            onPress={() => setOnlyMine((v) => !v)}
            activeOpacity={0.9}
            style={[styles.onlyMineBtn, onlyMine && styles.onlyMineBtnActive]}
          >
            <Ionicons
              name="person-outline"
              size={14}
              color={onlyMine ? "#fff" : "#475569"}
            />
            <Text style={[styles.onlyMineText, onlyMine && { color: "#fff" }]}>
              {"  "}Ver mis publicaciones
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Items a mostrar dentro del modal de límite
  const itemsForLimit = useMemo(() => {
    if (limitType === "all") return [...myActiveSale, ...myActiveRent];
    return limitType === "sale" ? myActiveSale : myActiveRent;
  }, [limitType, myActiveSale, myActiveRent]);

  // Límite a mostrar en el modal (depende de premium/total o por tipo)
  const limitNumber = useMemo(() => {
    if (limitType === "all") return PREMIUM_TOTAL_LIMIT;
    return limitType === "sale" ? SELL_LIMIT : RENT_LIMIT;
  }, [limitType]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          ListHeaderComponent={Header}
          renderItem={({ item }) => {
            const seller = userMap[item.ownerUid] || {};
            const wa = seller?.socials?.whatsapp?.value || null;
            const mine = me?.uid && item.ownerUid === me.uid;
			const canDelete = !!mine || isAdmin;
            return (
              <ListingCard
                item={item}
                seller={seller}
                isMine={!!mine}
				canDelete={canDelete}
                onWhatsApp={() =>
                  openWhatsApp(
                    wa,
                    `Hola ${seller?.displayName || ""}, me interesa: "${
                      item.title
                    }"`
                  )
                }
                onContact={
                  mine
                    ? undefined
                    : () =>
                        navigation.navigate("ContactarListing", {
                          ownerUid: item.ownerUid,
                          listingId: item.id,
                          title: item.title,
                          description: item.description,
                          price: item.price,
                          type: item.type,
                          category: item.category,
                         images:
                           Array.isArray(item.images)
                             ? item.images.slice(0, 2) // garantizamos máx. 2
                             : [],
                        })
                }
               onEdit={() => startEditFromItem(item)}
                onDelete={() =>
                  confirmDelete(item.ownerUid, item.id, item.title)
                }
              />
            );
          }}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyWrap}>
                <Ionicons name="bag-handle-outline" size={22} color="#6b7a90" />
                <Text style={styles.emptyText}>
                  No hay publicaciones con esos filtros.
                </Text>
                <Text style={styles.emptyHint}>¿Quieres crear la primera?</Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />

        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" />
          </View>
        )}

        {/* Modal Publicar / Editar */}
        <Modal
          visible={pubOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setPubOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>
                {editing ? "Editar publicación" : "Nueva publicación"}
              </Text>

              {/* Tipo */}
              <Text style={styles.inputLabel}>Tipo de publicación</Text>
              <View style={styles.segmentWrap}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    pubType === "sale" && styles.segmentBtnActiveBlue,
                  ]}
                  onPress={() => setPubType("sale")}
                >
                  <Ionicons
                    name="pricetag-outline"
                    size={16}
                    color={pubType === "sale" ? "#0d6efd" : "#475569"}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      pubType === "sale" && { color: "#0d6efd" },
                    ]}
                  >
                    {"  "}Venta
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    pubType === "rent" && styles.segmentBtnActiveGreen,
                  ]}
                  onPress={() => {
                    setPubType("rent");
                    setPubCategory(""); // al cambiar a arriendo, limpiamos categoría
                  }}
                >
                  <Ionicons
                    name="home-outline"
                    size={16}
                    color={pubType === "rent" ? "#0f766e" : "#475569"}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      pubType === "rent" && { color: "#0f766e" },
                    ]}
                  >
                    {"  "}Arriendo
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Título */}
              <Text style={styles.inputLabel}>Título</Text>
              <TextInput
                style={styles.input}
                placeholder={
                  pubType === "sale"
                    ? "Ej: Bicicleta GW rin 29"
                    : "Ej: Apartaestudio amoblado"
                }
                placeholderTextColor="#94a3b8"
                value={pubTitle}
                onChangeText={setPubTitle}
              />

              {/* Precio / Canon */}
              <Text style={styles.inputLabel}>
                {pubType === "sale" ? "Precio (COP)" : "Canon mensual (COP)"}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 350000"
                placeholderTextColor="#94a3b8"
                value={pubPrice}
                onChangeText={(t) => setPubPrice(t.replace(/[^\d]/g, ""))}
                keyboardType="numeric"
                inputMode="numeric"
                maxLength={12}
              />

              {/* Categoría — solo Venta */}
              {pubType === "sale" && (
                <>
                  <Text style={styles.inputLabel}>Categoría</Text>
                  <CategoryChips
                    value={pubCategory}
                    onChange={setPubCategory}
                  />
                </>
              )}

              {/* Descripción */}
              <Text style={styles.inputLabel}>Descripción</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                placeholder="Detalles, estado, ubicación, condiciones…"
                placeholderTextColor="#94a3b8"
                multiline
                value={pubDesc}
                onChangeText={setPubDesc}
              />

              {/* Fotos (solo Premium) */}
              <Text style={styles.inputLabel}>Fotos (Premium)</Text>
              {premiumActive ? (
                <>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {pubImages.map((im, idx) => (
                      <View
                        key={idx}
                        style={{
                          width: 70,
                          height: 70,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                          overflow: "hidden",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#f8fafc",
                        }}
                      >
                        <Image
                          source={{ uri: im.url || im.uri }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                        {!!im.uri && !im.url && (
                          <View style={{ position: "absolute", left: 4, top: 4, backgroundColor: "#ffffffdd", borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: "#64748b", fontWeight: "800" }}>Pendiente</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            backgroundColor: "#fff",
                            borderRadius: 10,
                            padding: 3,
                            borderWidth: 1,
                            borderColor: "#e2e8f0",
                          }}
                          onPress={() => removeImageAt(idx)}
                        >
                          <Ionicons name="close" size={12} color="#334155" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {/* Botón agregar */}
                    <TouchableOpacity
                      style={{
                        width: 70,
                        height: 70,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#cfe2ff",
                        backgroundColor: "#eaf2ff",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      onPress={pickOneImage}
                      activeOpacity={0.9}
                    >
                      <Ionicons
                        name="image-outline"
                        size={20}
                        color="#0d6efd"
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      { marginTop: 8, opacity: uploadingImgs ? 0.7 : 1 },
                    ]}
                    onPress={uploadAllImages}
                    disabled={uploadingImgs}
                    activeOpacity={0.9}
                  >
                    <Ionicons
                      name="cloud-upload-outline"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.primaryBtnText}>
                      {" "}
                      {uploadingImgs ? "Subiendo…" : "Subir fotos"}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View
                  style={{
                    backgroundColor: "#fff7ed",
                    borderColor: "#ffedd5",
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="star" size={16} color="#b45309" />
                    <Text
                      style={{
                        marginLeft: 8,
                        color: "#92400e",
                        fontWeight: "800",
                      }}
                    >
                      Sube fotos activando FN Premium.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.outlineBtn, { marginTop: 8 }]}
                    onPress={() => navigation.navigate("PremiumPayScreen")}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="star-outline" size={18} color="#1d4fb8" />
                    <Text style={styles.outlineBtnText}> Activar Premium</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Acciones */}
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { flex: 1 }]}
                  onPress={() => setPubOpen(false)}
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
                  onPress={saveListing}
                  disabled={saving}
                >
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {"  "}
                    {saving
                      ? "Guardando…"
                      : editing
                      ? "Guardar cambios"
                      : "Publicar"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal de LÍMITE alcanzado (tipo o total premium) */}
        <Modal
          visible={limitOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setLimitOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.limitBox}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="warning-outline" size={20} color="#b45309" />
                <Text
                  style={[
                    styles.modalTitle,
                    { color: "#b45309", marginLeft: 6 },
                  ]}
                >
                  Límite alcanzado
                </Text>
              </View>

              <Text style={styles.limitText}>
                {limitType === "all" ? (
                  <>
                    Has alcanzado el máximo de{" "}
                    <Text style={{ fontWeight: "900" }}>
                      {PREMIUM_TOTAL_LIMIT}
                    </Text>{" "}
                    publicaciones activas (Venta + Arriendo) permitido con
                    Premium.
                  </>
                ) : (
                  <>
                    Has alcanzado el máximo de{" "}
                    <Text style={{ fontWeight: "900" }}>{limitNumber}</Text>{" "}
                    publicaciones de{" "}
                    <Text style={{ fontWeight: "900" }}>
                      {limitType === "sale" ? "Venta" : "Arriendo"}
                    </Text>
                    .
                  </>
                )}{" "}
                Elimina alguna publicación anterior para crear una nueva.
              </Text>

              {/* Contador */}
              <View style={styles.limitCounter}>
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color="#334155"
                />
                <Text style={styles.limitCounterText}>
                  {"  "}
                  {itemsForLimit.length} / {limitNumber}
                </Text>
              </View>

              {/* Lista compacta de mis publicaciones (del tipo o total) */}
              <View style={{ maxHeight: 260, marginTop: 8 }}>
                {itemsForLimit.length === 0 ? (
                  <Text style={{ color: "#64748b", textAlign: "center" }}>
                    No tienes publicaciones en este grupo.
                  </Text>
                ) : (
                  itemsForLimit.map((it) => (
                    <View key={it.id} style={styles.limitItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.limitItemTitle} numberOfLines={1}>
                          {it.title || "(Sin título)"}
                        </Text>
                        <Text style={styles.limitItemSub} numberOfLines={1}>
                          {it.type === "sale"
                            ? `Precio: ${fmtCOP(it.price)} COP`
                            : `Canon: ${fmtCOP(it.price)} COP`}
                          {!!it.category && it.type === "sale"
                            ? ` • ${it.category}`
                            : ""}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.smallBtn,
                          styles.editChip,
                          { marginRight: 6 },
                        ]}
                        onPress={() => startEditFromItem(it)}
                        activeOpacity={0.9}
                      >
                        <Ionicons
                          name="create-outline"
                          size={14}
                          color="#0d6efd"
                        />
                        <Text
                          style={[styles.smallBtnText, { color: "#0d6efd" }]}
                        >
                          {"  "}Editar
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.dangerChip]}
                        onPress={() =>
                          confirmDelete(it.ownerUid, it.id, it.title)
                        }
                        activeOpacity={0.9}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={14}
                          color="#991b1b"
                        />
                        <Text
                          style={[styles.smallBtnText, { color: "#991b1b" }]}
                        >
                          {"  "}Eliminar
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              <TouchableOpacity
                style={[styles.closeLimitBtn, { marginTop: 10 }]}
                onPress={() => setLimitOpen(false)}
              >
                <Text style={styles.closeLimitText}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* === Styles === */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },
  container: { flex: 1, backgroundColor: "#f2f5fa" },

  header: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f766e",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "#5a6a80",
    marginTop: 2,
    marginBottom: 10,
    fontWeight: "700",
  },

  thumbWrap: {
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e9edf3",
    backgroundColor: "#f6f8fc",
    marginBottom: 8,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbCountPill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  thumbCountText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
  },

  searchRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f6f8fc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 42,
  },
  searchInput: { flex: 1, paddingLeft: 8, color: "#0f172a" },

  segmentCard: { marginTop: 10 },
  segmentWrap: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 6,
    flexDirection: "row",
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  segmentBtnFlex: { flex: 1 },
  segmentBtnActiveGray: { backgroundColor: "#e2e8f0" },
  segmentBtnActiveBlue: {
    backgroundColor: "#eaf2ff",
    borderColor: "#cfe2ff",
    borderWidth: 1,
  },
  segmentBtnActiveGreen: {
    backgroundColor: "#d1fae5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
  },
  segmentText: { fontSize: 13, fontWeight: "900", color: "#475569" },

  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  catChipText: { fontSize: 12, fontWeight: "800", color: "#334155" },

  createRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },
  createBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  createBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  resultsRow: { marginTop: 10, flexDirection: "row", alignItems: "center" },
  resultsText: { color: "#475569", fontWeight: "800", fontSize: 12.5 },

  onlyMineBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
  },
  onlyMineBtnActive: { backgroundColor: "#10b981", borderColor: "#0ea5a4" },
  onlyMineText: { fontSize: 12.5, fontWeight: "900", color: "#475569" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e9edf3",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  badgeType: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  badgeTypeText: { fontSize: 11, fontWeight: "900" },
  cardTitle: { fontWeight: "800", color: "#1c2b39", fontSize: 15 },
  cardSub: { marginTop: 2, color: "#667085", fontSize: 12, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  metaText: { color: "#64748b", fontSize: 12, fontWeight: "700" },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 10,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  smallBtnText: { fontSize: 12, fontWeight: "900" },

  primaryChip: { backgroundColor: "#0d6efd", borderColor: "#0d6efd" },
  editChip: { backgroundColor: "#eaf2ff", borderColor: "#cfe2ff" },
  dangerChip: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },

  loader: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
  },

  emptyWrap: { alignItems: "center", paddingHorizontal: 24, paddingTop: 20 },
  emptyText: {
    color: "#6b7a90",
    textAlign: "center",
    marginTop: 8,
    fontWeight: "700",
  },
  emptyHint: {
    color: "#6b7a90",
    textAlign: "center",
    marginTop: 4,
    fontSize: 12,
  },

  // Modal publicar
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
    color: "#0f766e",
  },

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
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    backgroundColor: "#6c757d",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#fff", fontWeight: "800" },

  /* Modal Límite */
  limitBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  limitText: { color: "#334155", marginTop: 6, lineHeight: 18 },
  limitCounter: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  limitCounterText: { color: "#334155", fontWeight: "800", fontSize: 12 },
  limitItem: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  limitItemTitle: { fontWeight: "800", color: "#0f172a", fontSize: 13.5 },
  limitItemSub: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },
  closeLimitBtn: {
    backgroundColor: "#6c757d",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  closeLimitText: { color: "#fff", fontWeight: "800" },
});
