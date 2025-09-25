// src/screens/PerfilScreen.js
// Asegúrate de guardar este archivo en UTF-8
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Modal, TextInput, Switch, Alert, Linking, Pressable, Image, Platform, UIManager, LayoutAnimation } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { signOut, onIdTokenChanged } from "firebase/auth";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { iconForServiceName } from "../utils/servicesCatalog";

/* === Constantes / Utils === */
const CATEGORIES = ["Electrónica","Hogar","Muebles","Deportes","Vehículos","Herramientas","Ropa","Otros"];

const fmtCOP = (n) => {
  if (n == null || n === "") return "";
  try { return Number(n).toLocaleString("es-CO"); } catch { return String(n); }
};
const relTime = (ts) => {
  try {
    const ms = typeof ts?.toMillis === "function" ? ts.toMillis() : (typeof ts === "number" ? ts : Date.parse(ts));
    if (!ms || Number.isNaN(ms)) return "";
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "ahora";
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
  } catch { return ""; }
};
const daysRemaining = (ts) => {
  try {
    const ms = typeof ts?.toMillis === "function" ? ts.toMillis() : (typeof ts === "number" ? ts : Date.parse(ts));
    if (!ms || Number.isNaN(ms)) return 0;
    const diff = ms - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  } catch { return 0; }
};
// Expiración de listings: 7 días
const isListingExpired = (ts) => {
  try {
    const ms = typeof ts?.toMillis === "function" ? ts.toMillis() : (typeof ts === "number" ? ts : Date.parse(ts));
    if (!ms || Number.isNaN(ms)) return false;
    return (Date.now() - ms) > (7 * 24 * 60 * 60 * 1000);
  } catch { return false; }
};
/* Utils */
const iconForService = (name = "") => {
  const n = (name || "").toLowerCase();
  if (n.includes("plomer")) return "water-outline";
  if (n.includes("carpinter")) return "construct-outline";
  if (n.includes("pintur")) return "color-palette-outline";
  if (n.includes("cerrajer")) return "key-outline";
  if (n.includes("remodel")) return "home-outline";
  if (n.includes("sastr")) return "cut-outline";
  if (n.includes("transpor")) return "car-outline";
  if (n.includes("papeler")) return "document-text-outline";
  if (n.includes("veterin")) return "medkit-outline";
  return "hammer-outline";
};

/* Fila estilo ajustes */
function RowItem({ icon, color, label, value, onPress }) {
  const content = (
    <View style={[styles.rowItem, onPress ? styles.rowItemTap : null]}>
      <View style={[styles.rowIcon, { backgroundColor: `${color}15`, borderColor: `${color}33` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color="#9aa4b2" /> : null}
    </View>
  );
  return onPress ? (<TouchableOpacity onPress={onPress} activeOpacity={0.85}>{content}</TouchableOpacity>) : content;
}

/* Chips categorías */
function CategoryChips({ value, onChange }) {
  return (
    <View style={styles.catRow}>
      {CATEGORIES.map((c) => {
        const active = value === c;
        return (
          <TouchableOpacity
            key={c}
            style={[styles.catChip, active && { backgroundColor: "#d1f7ee", borderColor: "#a5efe1" }]}
            onPress={() => onChange(active ? "" : c)}
            activeOpacity={0.85}
          >
            <Text style={[styles.catChipText, active && { color: "#0f766e" }]}>{c}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* Helpers enlaces */
const ensureHttp = (url) => {
  if (!url) return "";
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
};
const normalizeInstagramUrl = (value) => {
  if (!value) return "";
  let v = String(value).trim();
  if (/^https?:\/\//i.test(v)) return v;
  v = v.replace(/^@/, "");
  if (/instagram\.com/i.test(v)) return ensureHttp(v);
  if (!v) return "";
  return `https://instagram.com/${v}`;
};
const toWaLink = (value) => {
  if (!value) return "";
  const v = String(value).trim();
  if (/^https?:\/\//i.test(v) || /wa\.me|whatsapp/i.test(v)) return v;
  const digits = v.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : "";
};

function AccordionCard({
  title,
  subtitle,         // string opcional debajo del título
  right,            // un chip/badge opcional a la derecha del header
  children,
  expanded,
  onToggle,
  testID,
}) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onToggle?.(); }}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={expanded ? "Colapsar sección" : "Desplegar sección"}
        accessibilityState={{ expanded }}
        activeOpacity={0.85}
        style={styles.accordionHeader}
        testID={testID}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.accordionTitleRow}>
            <Text style={styles.cardTitle}>{title}</Text>
            {right ? <View style={{ marginLeft: 8 }}>{right}</View> : null}
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color="#334155"
              style={{ marginLeft: 8 }}
            />
          </View>
          {!!subtitle && <Text style={styles.accordionSubtitle}>{subtitle}</Text>}
        </View>
      </TouchableOpacity>

      {expanded ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}


/* ===== Componente ===== */
export default function PerfilScreen() {
  
  const [openAd, setOpenAd] = useState(false);
  const [openServices, setOpenServices] = useState(false);
  const [openListings, setOpenListings] = useState(false);


  // 🌀 Animaciones de expansión/colapso (Android necesita habilitar)
  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [listings, setListings] = useState([]);

  // Modal editar perfil
  const [editOpen, setEditOpen] = useState(false);

  // Edición perfil (solo los campos permitidos por reglas)
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  // Mantenemos estos estados para UI, pero NO se enviarán si no eres admin
  const [isResident, setIsResident] = useState(true);
  const [apartment, setApartment] = useState("");
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [otherEnabled, setOtherEnabled] = useState(false);
  const [otherUrl, setOtherUrl] = useState("");

  // Mercado (editar)
  const [editListingOpen, setEditListingOpen] = useState(false);
  const [lType, setLType] = useState("sale");
  const [lTitle, setLTitle] = useState("");
  const [lPrice, setLPrice] = useState("");
  const [lCategory, setLCategory] = useState("");
  const [lDesc, setLDesc] = useState("");
  const [savingListing, setSavingListing] = useState(false);
  const [editingListingId, setEditingListingId] = useState(null);
  const [lImages, setLImages] = useState([]);

  // Publicidad (anuncio en carrusel de ServiciosScreen)
  const [adImageUrl, setAdImageUrl] = useState("");
  const [adTagline, setAdTagline] = useState("");
  const [adActive, setAdActive] = useState(false);
  const [adSaving, setAdSaving] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const user = auth.currentUser;

  const resetListingForm = useCallback(() => {
    setLType("sale"); setLTitle(""); setLPrice(""); setLCategory(""); setLDesc("");
    setSavingListing(false); setEditingListingId(null);
  }, []);

  // Detectar claim admin
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) return setIsAdmin(false);
      try { const idt = await u.getIdTokenResult(); setIsAdmin(!!idt.claims?.admin); }
      catch { setIsAdmin(false); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);

    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};

        // Backfill protegido por admin
        if (isAdmin && !data.email && user.email) {
          updateDoc(userRef, { email: user.email }).catch(() => {});
        }

        setProfile({ id: snap.id, ...data });
        setDisplayName(data.displayName || "");
        setPhone(data.phone || "");
        setBio(data.bio || "");

        // Estados no editables por el dueño (UI info)
        setIsResident(!!data.isResident);
        setApartment(data.apartment || "");
        setInstagramEnabled(!!data.instagramEnabled);
        setInstagramUrl(data.instagramUrl || "");
        setWhatsappEnabled(!!data.whatsappEnabled);
        setWhatsappNumber(data.whatsappNumber || "");
        setOtherEnabled(!!data.otherEnabled);
        setOtherUrl(data.otherUrl || "");
      } else {
        // Crear stub
        setDoc(
          userRef,
          {
            displayName: user.displayName || "",
            phone: "",
            bio: "",
          },
          { merge: true }
        ).catch(() => {});

        if (isAdmin && user.email) {
          updateDoc(userRef, { email: user.email }).catch(() => {});
        }
      }
      setLoading(false);
    });

    const servicesRef = collection(db, "users", user.uid, "services");
    const unsubServices = onSnapshot(servicesRef, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setServices(arr);
    });

    // 👉 Publicidad del usuario (doc /ads/{uid})
    const adRef = doc(db, "ads", user.uid);
    const unsubAd = onSnapshot(adRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        setAdImageUrl(d.imageUrl || "");
        setAdTagline(d.tagline || "");
        setAdActive(!!d.active);
      } else {
        setAdImageUrl("");
        setAdTagline("");
        setAdActive(false);
      }
    });

    const listingsRef = collection(db, "users", user.uid, "listings");
    const qRef = query(listingsRef, orderBy("createdAt", "desc"));

    const unsubListings = onSnapshot(qRef, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setListings(arr);
    });

    return () => { unsubUser(); unsubServices(); unsubListings(); unsubAd(); };
  }, [user, isAdmin]);

  const initials = useMemo(() => {
    const name = profile?.displayName || user?.email || "US";
    return name.trim().slice(0, 2).toUpperCase();
  }, [profile, user]);

  // Premium
  const premiumDaysLeft = useMemo(() => daysRemaining(profile?.premiumExpiresAt), [profile?.premiumExpiresAt]);
  const premiumActive = premiumDaysLeft > 0;

  // Cloudinary config
  const cloudCfg = useMemo(() => Constants?.expoConfig?.extra?.cloudinary || {}, []);

  const changeAvatar = useCallback(async () => {
    try {
      if (!premiumActive) {
        Alert.alert("Solo con Premium", "La foto de perfil es un beneficio Premium.");
        return;
      }
      if (!user?.uid) return;
      if (!cloudCfg?.cloudName || !cloudCfg?.uploadPreset) {
        Alert.alert("Configuración faltante","Falta cloudinary.cloudName o cloudinary.uploadPreset en app config.");
        return;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso requerido","Necesitamos acceso a tu galería para cambiar tu foto.");
        return;
      }
      const pickerParams = {
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      };
      pickerParams.mediaTypes = ImagePicker?.MediaType
        ? [ImagePicker.MediaType.Images]
        : ImagePicker.MediaTypeOptions.Images;
      const res = await ImagePicker.launchImageLibraryAsync(pickerParams);
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      const data = new FormData();
      data.append("file", { uri: asset.uri, type: "image/jpeg", name: `avatar_${user.uid}.jpg` });
      data.append("upload_preset", cloudCfg.uploadPreset);

      const up = await fetch(`https://api.cloudinary.com/v1_1/${cloudCfg.cloudName}/upload`, { method: "POST", body: data });
      const json = await up.json();
      if (!up.ok || !json?.secure_url) throw new Error(json?.error?.message || "Error subiendo avatar");

      await updateDoc(doc(db, "users", user.uid), { avatarUrl: json.secure_url });
      Alert.alert("Listo", "Tu foto de perfil fue actualizada.");
    } catch (e) {
      console.log("changeAvatar error:", e);
      Alert.alert("Error", e.message || "No se pudo actualizar la foto.");
    }
  }, [premiumActive, user?.uid, cloudCfg]);

  const openEditListing = useCallback((it) => {
    if (!it) return;
    setEditingListingId(it.id);
    setLType(it.type ?? "sale");
    setLTitle(it.title ?? "");
    setLPrice(it.price != null && it.price !== "" ? String(it.price) : "");
    setLCategory(it.category ?? "");
    setLDesc(it.description ?? "");
    // Normaliza imágenes a objetos { url } (máx 2)
    const imgs = Array.isArray(it.images) ? it.images : [];
    const norm = imgs
      .map((im) => (typeof im === "string" ? { url: im } : im))
      .filter((im) => im && im.url);
    setLImages(norm.slice(0, 2));
    setEditListingOpen(true);
  }, []);


  /* === FIX: Solo enviar campos permitidos por reglas para evitar permission-denied === */
  const saveProfile = async () => {
    try {
      if (!user) return;

      const payload = {};
      if (displayName != null) payload.displayName = displayName.trim();
      if (phone != null)       payload.phone       = phone.trim();
      if (bio != null)         payload.bio         = bio.trim();
      // Redes sociales
      payload.instagramEnabled = !!instagramEnabled;
      payload.instagramUrl     = instagramEnabled ? (instagramUrl || "").trim() : "";
      payload.whatsappEnabled  = !!whatsappEnabled;
      payload.whatsappNumber   = whatsappEnabled ? (whatsappNumber || "").trim() : "";
      payload.otherEnabled     = !!otherEnabled;
      payload.otherUrl         = otherEnabled ? (otherUrl || "").trim() : "";
      // Marca editable por el dueño
      payload.updatedAt        = new Date();
      // apartment SOLO admin
      if (isAdmin && apartment != null) payload.apartment = apartment.trim();

      await updateDoc(doc(db, "users", user.uid), payload);
      setEditOpen(false);
      Alert.alert("Guardado", "Tu perfil se actualizó correctamente.");
    } catch (e) {
      console.log("saveProfile error:", e);
      Alert.alert("Error", e?.message || "No se pudo actualizar el perfil.");
    }
  };

  const removeService = async (serviceId) => {
    Alert.alert("Eliminar servicio","¿Seguro que deseas dejar de ofrecer este servicio?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: async () => {
            try { await deleteDoc(doc(db, "users", user.uid, "services", serviceId)); }
            catch { Alert.alert("Error", "No se pudo eliminar el servicio."); }
        }},
      ]
    );
  };
  const removeListing = async (listingId, title) => {
    Alert.alert("Eliminar publicación",`¿Seguro que deseas eliminar "${title || "esta publicación"}"? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: async () => {
            try { await deleteDoc(doc(db, "users", user.uid, "listings", listingId)); }
            catch { Alert.alert("Error", "No se pudo eliminar la publicación."); }
        }},
      ]
    );
  };
  const republishListing = async (listingId) => {
    try {
      if (!user?.uid || !listingId) return;
      const ref = doc(db, "users", user.uid, "listings", listingId);
      await updateDoc(ref, {
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      Alert.alert("Republicada", "Tu publicación volvió a aparecer en el mercado por 7 días.");
    } catch (e) {
      console.log("republishListing error:", e);
      Alert.alert("Error", "No se pudo republicar la publicación.");
    }
  };
  const openCreatePromo = (service) => {
    navigation.navigate("OfertaForm", {
      serviceId: service?.id,
      serviceName: service?.name || "",
      mode: "create",
      discountOnly: true,
      discountStep: 5,
      maxDiscount: 90,
      hidePrice: true,
      forceTitle: true,
      titlePreset: "Promoción",
      uiModeTitle: "Crear promoción",
    });
  };
  const openServicePromos = (service) => {
    navigation.navigate("OfertasList", { filterServiceId: service?.id, viewMode: "promos", uiTitle: `Promociones de ${service?.name || "servicio"}` });
  };

  // ===== Publicidad: subir imagen (Cloudinary) =====
  const pickAdImage = useCallback(async () => {
    try {
      if (!premiumActive) {
        Alert.alert("Solo con Premium","La publicidad es un beneficio Premium.");
        return;
      }
      if (!cloudCfg?.cloudName || !cloudCfg?.uploadPreset) {
        Alert.alert("Configuración faltante","Falta cloudinary.cloudName o cloudinary.uploadPreset en app config.");
        return;
      }
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso requerido","Necesitamos acceso a tu galería.");
        return;
      }

      const modern = !!ImagePicker?.MediaType;
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
        ...(modern ? { mediaTypes: [ImagePicker.MediaType.Images] } : {}),
      });

      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      const data = new FormData();
      data.append("file", { uri: asset.uri, type: "image/jpeg", name: `ad_${user?.uid || "anon"}_${Date.now()}.jpg` });
      data.append("upload_preset", cloudCfg.uploadPreset);
      const up = await fetch(`https://api.cloudinary.com/v1_1/${cloudCfg.cloudName}/upload`, { method: "POST", body: data });
      const json = await up.json();
      if (!up.ok || !json?.secure_url) throw new Error(json?.error?.message || "Error subiendo imagen");
      setAdImageUrl(json.secure_url);
    } catch (e) {
      console.log("pickAdImage error:", e);
      Alert.alert("Imagen","No se pudo subir la imagen.");
    }
  }, [premiumActive, cloudCfg, user?.uid]);

  // Guardar/actualizar doc /ads/{uid}
  const saveAd = useCallback(async () => {
    try {
      if (!user?.uid) return;
      if (!premiumActive) {
        Alert.alert("Premium requerido","Activa Premium para usar publicidad.");
        return;
      }
      const tl = (adTagline || "").trim();
      if (adActive) {
        if (!adImageUrl) { Alert.alert("Falta imagen","Sube una imagen para tu publicidad."); return; }
        if (!tl) { Alert.alert("Falta frase","Escribe una frase (máx 40 caracteres)."); return; }
      }
      const ref = doc(db, "ads", user.uid);
      setAdSaving(true);
      const now = serverTimestamp();

      await setDoc(
        ref,
        {
          ownerUid: user.uid,
          ownerName: profile?.displayName || "",
          imageUrl: adImageUrl || "",
          tagline: tl.slice(0, 40),
          active: !!adActive,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      );

      Alert.alert("Publicidad", adActive ? "Tu publicidad quedó activa." : "Publicidad guardada (inactiva).");
    } catch (e) {
      console.log("saveAd error:", e);
      Alert.alert("Error","No se pudo guardar la publicidad.");
    } finally {
      setAdSaving(false);
    }
  }, [user?.uid, premiumActive, adTagline, adImageUrl, adActive, profile?.displayName, profile?.avatarUrl]);

  // 🔴 Eliminar publicidad (borra /ads/{uid} y limpia la tarjeta)
  const deleteAd = useCallback(() => {
    if (!user?.uid) return;
    Alert.alert(
      "Eliminar publicidad",
      "¿Deseas eliminar tu publicidad por completo? Podrás crearla nuevamente cuando quieras.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "ads", user.uid));
              // Limpia UI inmediatamente
              setAdImageUrl("");
              setAdTagline("");
              setAdActive(false);
              Alert.alert("Publicidad", "Tu publicidad fue eliminada.");
            } catch (e) {
              console.log("deleteAd error:", e);
              Alert.alert("Error", "No se pudo eliminar la publicidad.");
            }
          },
        },
      ]
    );
  }, [user?.uid]);

  // ===== Imágenes en edición de publicación (máx 2, solo Premium) =====
  const addListingImage = useCallback(async () => {
    try {
      if (!premiumActive) {
        Alert.alert("Solo con Premium","Subir imágenes en publicaciones es un beneficio Premium.");
        return;
      }
      if (!cloudCfg?.cloudName || !cloudCfg?.uploadPreset) {
        Alert.alert("Configuración faltante","Falta cloudinary.cloudName o cloudinary.uploadPreset en app config.");
        return;
      }
      if (lImages.length >= 2) {
        Alert.alert("Límite alcanzado","Solo puedes subir hasta 2 imágenes por publicación.");
        return;
      }
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso requerido","Necesitamos acceso a tu galería.");
        return;
      }
      const pickerParams = { allowsEditing: true, aspect: [4, 3], quality: 0.9 };
      pickerParams.mediaTypes = ImagePicker?.MediaType ? [ImagePicker.MediaType.Images] : ImagePicker.MediaTypeOptions.Images;
      const res = await ImagePicker.launchImageLibraryAsync(pickerParams);
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      const data = new FormData();
      data.append("file", { uri: asset.uri, type: "image/jpeg", name: `listing_${user?.uid || "anon"}_${Date.now()}.jpg` });
      data.append("upload_preset", cloudCfg.uploadPreset);
      const up = await fetch(`https://api.cloudinary.com/v1_1/${cloudCfg.cloudName}/upload`, { method: "POST", body: data });
      const json = await up.json();
      if (!up.ok || !json?.secure_url) throw new Error(json?.error?.message || "Error subiendo imagen");
      setLImages((prev) => [...prev, { url: json.secure_url }].slice(0, 2));
    } catch (e) {
      console.log("addListingImage error:", e);
      Alert.alert("Imagen","No se pudo subir la imagen.");
    }
  }, [premiumActive, lImages, cloudCfg, user?.uid]);

  const removeListingImage = useCallback((idx) => {
    setLImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleLogout = () => {
    Alert.alert("Cerrar sesión","¿Seguro que deseas cerrar sesión?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Cerrar sesión", style: "destructive", onPress: async () => { try { await signOut(auth); } catch { Alert.alert("Error", "No se pudo cerrar sesión."); } } },
      ]
    );
  };

  const openInstagram = async () => {
    const url = normalizeInstagramUrl(profile?.instagramUrl);
    if (!url) return Alert.alert("Instagram", "No hay enlace válido de Instagram.");
    try { await Linking.openURL(url); } catch { Alert.alert("Instagram", "No se pudo abrir el enlace."); }
  };
  const openWhatsApp = async () => {
    const url = toWaLink(profile?.whatsappNumber);
    if (!url) return Alert.alert("WhatsApp", "No hay número o enlace válido.");
    try { await Linking.openURL(url); } catch { Alert.alert("WhatsApp", "No se pudo abrir WhatsApp."); }
  };
  const openOther = async () => {
    const url = ensureHttp(profile?.otherUrl);
    if (!url) return Alert.alert("Enlace", "No hay URL válida.");
    try { await Linking.openURL(url); } catch { Alert.alert("Enlace", "No se pudo abrir el enlace."); }
  };

  const anySocial =
    (profile?.instagramEnabled && !!profile?.instagramUrl) ||
    (profile?.whatsappEnabled && !!profile?.whatsappNumber) ||
    (profile?.otherEnabled && !!profile?.otherUrl);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const hasAd = !!(adImageUrl || adTagline || adActive);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* CARD: Perfil */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ position: "relative" }}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={changeAvatar}
                disabled={!premiumActive}
                accessibilityRole="button"
                accessibilityLabel="Cambiar foto de perfil"
              >
                <View style={styles.avatar}>
                  {profile?.avatarUrl ? (
                    <Image
                      source={{ uri: `${profile.avatarUrl}?v=${Date.now()}` }}
                      style={{ width: "100%", height: "100%", borderRadius: 36 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                </View>
              </TouchableOpacity>
              {premiumActive && (
                <View pointerEvents="none" style={{ position: "absolute", right: -2, bottom: -2, backgroundColor: "#eaf2ff", borderColor: "#cfe2ff", borderWidth: 1, borderRadius: 12, padding: 4 }}>
                  <Ionicons name="camera-outline" size={14} color="#0d6efd" />
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.nameText}>{profile?.displayName || "Sin nombre"}</Text>
                {premiumActive ? (
                  <View style={styles.premiumBadge}>
                    <Ionicons name="star" size={12} color="#b45309" />
                    <Text style={styles.premiumBadgeText}> Premium</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.emailHint}>{user?.email || ""}</Text>
            </View>
            <TouchableOpacity style={styles.editPill} onPress={() => setEditOpen(true)} accessibilityLabel="Editar perfil" activeOpacity={0.85}>
              <Ionicons name="create-outline" size={16} color="#1d4fb8" />
              <Text style={styles.editPillText}> Editar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />
          <RowItem icon={profile?.isResident ? "home-outline" : "people-outline"} color="#1d4fb8" label="Tipo de usuario" value={profile?.isResident ? "Residente" : "Externo recomendado"} />
          {!!profile?.apartment && (<RowItem icon="business-outline" color="#1e7e34" label="Apartamento" value={profile?.apartment} />)}
          {!!profile?.phone && (<RowItem icon="call-outline" color="#f59f00" label="Teléfono" value={profile?.phone} />)}

          {anySocial && (
            <>
              <Text style={styles.socialTitle}>Redes sociales</Text>
              <View style={styles.socialRow}>
                {profile?.instagramEnabled && !!profile?.instagramUrl && (
                  <Pressable style={[styles.socialIconWrap, styles.instagramBg]} onPress={openInstagram} hitSlop={8} android_ripple={{ color: "#00000014", borderless: false }} accessibilityRole="link" accessibilityLabel="Abrir Instagram">
                    <Ionicons name="logo-instagram" size={18} color="#d62976" />
                  </Pressable>
                )}
                {profile?.whatsappEnabled && !!profile?.whatsappNumber && (
                  <Pressable style={[styles.socialIconWrap, styles.whatsappBg]} onPress={openWhatsApp} hitSlop={8} android_ripple={{ color: "#00000014", borderless: false }} accessibilityRole="link" accessibilityLabel="Abrir WhatsApp">
                    <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  </Pressable>
                )}
                {profile?.otherEnabled && !!profile?.otherUrl && (
                  <Pressable style={[styles.socialIconWrap, styles.otherBg]} onPress={openOther} hitSlop={8} android_ripple={{ color: "#00000014", borderless: false }} accessibilityRole="link" accessibilityLabel="Abrir enlace">
                    <Ionicons name="link-outline" size={18} color="#475569" />
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>

        {/* CARD: Membresía */}
        <View style={styles.card}>
          <View style={styles.cardHeaderLine}>
            <Text style={styles.cardTitle}>Membresía</Text>
            {premiumActive ? (
              <View style={styles.countPillGreen}>
                <Text style={[styles.countText, { color: "#065f46" }]}>{premiumDaysLeft} días restantes</Text>
              </View>
            ) : (
              <View style={styles.countPillGray}>
                <Text style={[styles.countText, { color: "#334155" }]}>Sin membresía</Text>
              </View>
            )}
          </View>

          {premiumActive ? (
            <View style={[styles.premiumBox, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#059669" />
              <Text style={[styles.premiumBoxText, { color: "#065f46" }]}>
                {"  "}FN Premium activo. Disfruta de fotos en publicaciones, foto de perfil y más.
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ color: "#475569", marginTop: 6 }}>
                Activa <Text style={{ fontWeight: "800" }}>FN Premium</Text> por 365 días y obtén:
              </Text>
              <View style={{ marginTop: 8, gap: 6 }}>
                <View style={styles.bulletRow}><Ionicons name="images-outline" size={16} color="#1d4fb8" /><Text style={styles.bulletText}>Subir fotos en publicaciones</Text></View>
                <View style={styles.bulletRow}><Ionicons name="person-circle-outline" size={16} color="#1d4fb8" /><Text style={styles.bulletText}>Foto de perfil</Text></View>
                <View style={styles.bulletRow}><Ionicons name="pricetags-outline" size={16} color="#1d4fb8" /><Text style={styles.bulletText}>Hasta 10 publicaciones activas</Text></View>
				<View style={styles.bulletRow}><Ionicons name="megaphone-outline" size={16} color="#1d4fb8" /><Text style={styles.bulletText}>Crea anuncios publicitarios</Text></View>
              </View>

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10 }]} onPress={() => navigation.navigate("PremiumPayScreen")} activeOpacity={0.9}>
                <Ionicons name="star-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}> Activar Premium</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* CARD: Descripción */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Descripción</Text>
          <Text style={[styles.bioText, !profile?.bio && { color: "#8b95a1" }]}>{profile?.bio || "Cuéntale a la comunidad qué haces…"}</Text>
        </View>

        {/* CARD: Reputación */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reputación</Text>
          <View style={styles.reputationRow}>
            <View style={[styles.repBox, { backgroundColor: "#fff7e6", borderColor: "#ffe8b0" }]}>
              <Ionicons name="star" size={18} color="#f59f00" />
              <Text style={[styles.repNumber, { color: "#b45309" }]}>{"  "}{profile?.recommendedCount || 0}</Text>
              <Text style={[styles.repLabel, { color: "#a16207" }]}> Reputación</Text>
            </View>
          </View>
        </View>

        {/* CARD: Publicidad (para franja en Servicios) */}
<AccordionCard
  title="Mi publicidad"
  right={
    premiumActive ? (
      <View style={styles.countPill}>
        <Text style={styles.countText}>{adActive ? "Activa" : "Inactiva"}</Text>
      </View>
    ) : (
      <View style={styles.countPillGray}>
        <Text style={[styles.countText, { color: "#334155" }]}>Bloqueada</Text>
      </View>
    )
  }
  subtitle={premiumActive ? "Aparece en la franja de Servicios" : "Requiere FN Premium"}
  expanded={openAd}
  onToggle={() => setOpenAd(!openAd)}
  testID="accordion-ads"
>
  {premiumActive ? (
    <>
      <Text style={styles.inputLabel}>Frase (máx 40 caracteres)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: ¡Descubre mis postres artesanales!"
        value={adTagline}
        maxLength={40}
        onChangeText={(t) => setAdTagline(t.slice(0, 40))}
        placeholderTextColor="#94a3b8"
      />
      <Text style={{ alignSelf: "flex-end", color: "#64748b", fontSize: 11, marginTop: 4 }}>
        {adTagline.length}/40
      </Text>

      <Text style={[styles.inputLabel, { marginTop: 10 }]}>Imagen</Text>
      {adImageUrl ? (
        <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          <Image source={{ uri: adImageUrl }} style={{ width: "100%", height: 140 }} resizeMode="cover" />
        </View>
      ) : (
        <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 12, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="image-outline" size={22} color="#64748b" />
          <Text style={{ color: "#64748b", marginTop: 6, fontWeight: "700" }}>Sin imagen</Text>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={pickAdImage} activeOpacity={0.9}>
          <Ionicons name="cloud-upload-outline" size={18} color="#1d4fb8" />
          <Text style={styles.outlineBtnText}> Subir/ Cambiar imagen</Text>
        </TouchableOpacity>
        <View style={[styles.outlineBtn, { flexDirection: "row", alignItems: "center" }]}>
          <Text style={[styles.inputLabel, { margin: 0, marginRight: 8 }]}>Activar</Text>
          <Switch value={adActive} onValueChange={setAdActive} />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { marginTop: 10, opacity: adSaving ? 0.7 : 1 }]}
        onPress={saveAd}
        disabled={adSaving}
        activeOpacity={0.9}
      >
        <Ionicons name="save-outline" size={18} color="#fff" />
        <Text style={styles.primaryBtnText}>{adSaving ? " Guardando…" : " Guardar publicidad"}</Text>
      </TouchableOpacity>

      {hasAd && (
        <TouchableOpacity style={styles.ghostDangerBtn} onPress={deleteAd} activeOpacity={0.9}>
          <Ionicons name="trash-outline" size={18} color="#dc3545" />
          <Text style={styles.ghostDangerText}> Eliminar publicidad</Text>
        </TouchableOpacity>
      )}
    </>
  ) : (
    <View style={styles.lockedBox}>
      <View style={styles.lockRow}>
        <View style={styles.lockIconWrap}>
          <Ionicons name="lock-closed-outline" size={18} color="#0f172a" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.lockTitle}>Función exclusiva de FN Premium</Text>
          <Text style={styles.lockSubtitle}>
            Activa tu plan para mostrar tu negocio en la franja de anuncios.
          </Text>
        </View>
      </View>

      <View style={styles.lockBenefits}>
        <View style={styles.benefitItem}>
          <Ionicons name="sparkles-outline" size={16} color="#0d6efd" />
          <Text style={styles.benefitText}>Publicidad destacada, a la vista de todos</Text>
        </View>
        <View style={styles.benefitItem}>
          <Ionicons name="images-outline" size={16} color="#0d6efd" />
          <Text style={styles.benefitText}>Incluye foto</Text>
        </View>
        <View style={styles.benefitItem}>
          <Ionicons name="document-text-outline" size={16} color="#0d6efd" />
          <Text style={styles.benefitText}>Crea tu eslogan</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { marginTop: 8 }]}
        onPress={() => navigation.navigate("PremiumPayScreen")}
        activeOpacity={0.9}
        accessibilityLabel="Activar FN Premium"
      >
        <Ionicons name="star-outline" size={18} color="#fff" />
        <Text style={styles.primaryBtnText}> Activar FN Premium</Text>
      </TouchableOpacity>
    </View>
  )}
</AccordionCard>



        {/* CARD: Servicios ofrecidos */}
       <AccordionCard
  title="Mis servicios ofrecidos"
  right={
    <View style={styles.countPill}>
      <Text style={styles.countText}>{services.length}</Text>
    </View>
  }
  subtitle="Servicios que ofreces a la comunidad"
  expanded={openServices}
  onToggle={() => setOpenServices(!openServices)}
  testID="accordion-services"
>
  {services.length === 0 ? (
    <Text style={{ color: "#6b7a90" }}>
      Aún no ofreces servicios. Ve a <Text style={{ fontWeight: "700" }}>Servicios → Ofrecer servicios</Text> para añadir.
    </Text>
  ) : (
    <View style={styles.servicesGrid}>
      {services.map((s) => (
        <View key={s.id} style={styles.serviceCard}>
          <View style={styles.serviceIconWrap}>
            <Ionicons name={iconForServiceName(s.name)} size={22} color="#1d4fb8" />
          </View>
          <Text style={styles.serviceName} numberOfLines={1}>{s.name}</Text>
          <View style={styles.serviceActionsCol}>
            <TouchableOpacity style={styles.fullPrimaryBtn} onPress={() => openCreatePromo(s)} activeOpacity={0.9}>
              <Ionicons name="gift-outline" size={16} color="#fff" />
              <Text style={styles.fullPrimaryText}> Crear promoción</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fullGhostBtn} onPress={() => openServicePromos(s)} activeOpacity={0.9}>
              <Ionicons name="eye-outline" size={16} color="#1d4fb8" />
              <Text style={styles.fullGhostText}> Ver promociones</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.deleteServiceBtn}
            onPress={() => removeService(s.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color="#dc3545" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  )}
</AccordionCard>


        {/* CARD: Mis publicaciones del mercado */}
       <AccordionCard
  title="Mis publicaciones (Mercado)"
  right={
    <View style={styles.countPill}>
      <Text style={styles.countText}>{listings.length}</Text>
    </View>
  }
  subtitle="Creadas por ti; expiran a los 7 días"
  expanded={openListings}
  onToggle={() => setOpenListings(!openListings)}
  testID="accordion-listings"
>
  <View style={[styles.premiumBox, { marginTop: 0, backgroundColor: "#f1f5f9", borderColor: "#e2e8f0" }]}>
    <Ionicons name="time-outline" size={16} color="#334155" />
    <Text style={[styles.premiumBoxText, { color: "#334155" }]}>{"  "}Las publicaciones desaparecen del mercado a los 7 días. Podrás republicarlas desde aquí.</Text>
  </View>

  {listings.length === 0 ? (
    <Text style={{ color: "#6b7a90", marginTop: 6 }}>No tienes publicaciones activas en el mercado.</Text>
  ) : (
    <View style={{ marginTop: 8 }}>
      {listings.map((it) => {
        const isSale = it.type === "sale";
        const priceLabel = isSale ? "Precio" : "Canon";
        const expired = isListingExpired(it.createdAt) || it.active === false;
        return (
          <View key={it.id} style={styles.listingItem}>
            <View style={styles.listingHeaderRow}>
              <View style={styles.badgeType}>
                <Ionicons name={isSale ? "pricetag-outline" : "home-outline"} size={14} color={isSale ? "#0a58ca" : "#0f766e"} />
                <Text style={[styles.badgeTypeText, { color: isSale ? "#0a58ca" : "#0f766e" }]}>{`  `}{isSale ? "Venta" : "Arriendo"}</Text>
              </View>
              {expired && (
                <View style={[styles.badgeType, { marginLeft: 8, backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
                  <Ionicons name="alert-circle-outline" size={14} color="#991b1b" />
                  <Text style={[styles.badgeTypeText, { color: "#991b1b" }]}>{`  `}Expirada</Text>
                </View>
              )}
              <Text style={styles.timeText}>{relTime(it.createdAt)}</Text>
            </View>

            <Text style={styles.listingTitle} numberOfLines={2}>{it.title || "(Sin título)"}</Text>
            <Text style={styles.listingSub} numberOfLines={1}>
              {priceLabel}: {it.price != null ? `${fmtCOP(it.price)} COP` : "—"}
              {isSale && it.category ? `  •  ${it.category}` : ""}
            </Text>

            <View style={styles.rowRight}>
              <TouchableOpacity style={[styles.chipBtn, styles.chipEdit]} onPress={() => openEditListing(it)} activeOpacity={0.9}>
                <Ionicons name="create-outline" size={14} color="#0d6efd" />
                <Text style={[styles.chipText, { color: "#0d6efd" }]}>{`  `}Editar</Text>
              </TouchableOpacity>
              {expired && (
                <TouchableOpacity style={[styles.chipBtn, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]} onPress={() => republishListing(it.id)} activeOpacity={0.9}>
                  <Ionicons name="refresh-outline" size={14} color="#047857" />
                  <Text style={[styles.chipText, { color: "#047857" }]}>{`  `}Republicar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.chipBtn, styles.chipDanger]} onPress={() => removeListing(it.id, it.title)} activeOpacity={0.9}>
                <Ionicons name="trash-outline" size={14} color="#991b1b" />
                <Text style={[styles.chipText, { color: "#991b1b" }]}>{`  `}Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  )}
</AccordionCard>


        {/* CARD: Acciones */}
        <View style={styles.card}>
          {isAdmin && (
            <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.navigate("AdminUsuarios")} activeOpacity={0.85}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#1d4fb8" />
              <Text style={styles.outlineBtnText}> Panel de administración</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10 }]} onPress={() => setEditOpen(true)} activeOpacity={0.85}>
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}> Editar perfil</Text>
          </TouchableOpacity>

          {!premiumActive && (
            <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.navigate("PremiumPayScreen")} activeOpacity={0.85}>
              <Ionicons name="star-outline" size={18} color="#1d4fb8" />
              <Text style={styles.outlineBtnText}> Activar Premium</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.ghostDangerBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#dc3545" />
            <Text style={styles.ghostDangerText}> Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal editar perfil */}
      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Editar perfil</Text>

            <Text style={styles.inputLabel}>Nombre completo</Text>
            <TextInput style={styles.input} placeholder="Tu nombre" value={displayName} onChangeText={setDisplayName} placeholderTextColor="#94a3b8" />

            <Text style={styles.inputLabel}>Teléfono</Text>
            <TextInput style={styles.input} placeholder="Ej: +57 3001234567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#94a3b8" />

            <Text style={styles.inputLabel}>Descripción</Text>
            <TextInput style={[styles.input, { height: 90, textAlignVertical: "top" }]} placeholder="Breve resumen de lo que haces…" value={bio} onChangeText={setBio} multiline placeholderTextColor="#94a3b8" />

            {/* ===== Redes sociales ===== */}
            <View style={styles.divider} />
            <Text style={styles.inputLabel}>Instagram</Text>
            <View style={styles.rowBetween}>
              <Text style={{ color: "#475569", fontWeight: "700" }}>Mostrar Instagram</Text>
              <Switch value={instagramEnabled} onValueChange={setInstagramEnabled} />
            </View>
            <TextInput
              style={[styles.input, { marginTop: 6 }]}
              placeholder="usuario o URL (ej: @miusuario o https://instagram.com/miusuario)"
              value={instagramUrl}
              onChangeText={setInstagramUrl}
              editable={instagramEnabled}
              selectTextOnFocus={instagramEnabled}
              placeholderTextColor="#94a3b8"
            />

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>WhatsApp</Text>
            <View style={styles.rowBetween}>
              <Text style={{ color: "#475569", fontWeight: "700" }}>Mostrar WhatsApp</Text>
              <Switch value={whatsappEnabled} onValueChange={setWhatsappEnabled} />
            </View>
            <TextInput
              style={[styles.input, { marginTop: 6 }]}
              placeholder="Número o enlace (ej: +57 3001234567 o https://wa.me/573001234567)"
              value={whatsappNumber}
              onChangeText={setWhatsappNumber}
              editable={whatsappEnabled}
              selectTextOnFocus={whatsappEnabled}
              keyboardType="phone-pad"
              placeholderTextColor="#94a3b8"
            />

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Otro enlace</Text>
            <View style={styles.rowBetween}>
              <Text style={{ color: "#475569", fontWeight: "700" }}>Mostrar otro</Text>
              <Switch value={otherEnabled} onValueChange={setOtherEnabled} />
            </View>
            <TextInput
              style={[styles.input, { marginTop: 6 }]}
              placeholder="URL (ej: https://mipagina.com)"
              value={otherUrl}
              onChangeText={setOtherUrl}
              editable={otherEnabled}
              selectTextOnFocus={otherEnabled}
              placeholderTextColor="#94a3b8"
            />
            {/* Mantengo visibles otros campos para continuidad visual, pero no se envían si no eres admin */}
            <View style={styles.divider} />
            <View style={styles.rowBetween}><Text style={styles.inputLabel}>¿Eres residente?</Text><Switch value={isResident} onValueChange={setIsResident} disabled /></View>

            <Text style={styles.inputLabel}>Apartamento</Text>
            <TextInput
              style={[styles.input, !isAdmin && styles.inputDisabled]}
              placeholder="Ej: Torre 3 - 204"
              value={apartment}
              onChangeText={setApartment}
              placeholderTextColor="#94a3b8"
              editable={isAdmin}
              selectTextOnFocus={isAdmin}
            />
            {!isAdmin && (<Text style={styles.hintLock}>Solo un administrador puede editar este campo.</Text>)}

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => setEditOpen(false)}>
                <Text style={styles.secondaryBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <View style={{ width: 10 }} />
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={saveProfile}>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}> Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal edición publicación */}
      <Modal
        visible={editListingOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setEditListingOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { color: "#0f766e" }]}>
              Editar publicación
            </Text>

            <Text style={styles.inputLabel}>Tipo de publicación</Text>
            <View style={styles.segmentWrap}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  lType === "sale" && styles.segmentBtnActiveBlue,
                ]}
                onPress={() => setLType("sale")}
              >
                <Ionicons
                  name="pricetag-outline"
                  size={16}
                  color={lType === "sale" ? "#0d6efd" : "#475569"}
                />
                <Text
                  style={[
                    styles.segmentText,
                    lType === "sale" && { color: "#0d6efd" },
                  ]}
                >
                  {"  "}Venta
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  lType === "rent" && styles.segmentBtnActiveGreen,
                ]}
                onPress={() => {
                  setLType("rent");
                  setLCategory("");
                }}
              >
                <Ionicons
                  name="home-outline"
                  size={16}
                  color={lType === "rent" ? "#0f766e" : "#475569"}
                />
                <Text
                  style={[
                    styles.segmentText,
                    lType === "rent" && { color: "#0f766e" },
                  ]}
                >
                  {"  "}Arriendo
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Título</Text>
            <TextInput
              style={styles.input}
              placeholder={
                lType === "sale"
                  ? "Ej: Bicicleta GW rin 29"
                  : "Ej: Apartaestudio amoblado"
              }
              placeholderTextColor="#94a3b8"
              value={lTitle}
              onChangeText={setLTitle}
            />

            <Text style={styles.inputLabel}>
              {lType === "sale" ? "Precio (COP)" : "Canon mensual (COP)"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 350000"
              placeholderTextColor="#94a3b8"
              value={lPrice}
              onChangeText={(t) => setLPrice(t.replace(/[^\d]/g, ""))}
              keyboardType="numeric"
              inputMode="numeric"
              maxLength={12}
            />

            {lType === "sale" && (
              <>
                <Text style={styles.inputLabel}>Categoría</Text>
                <CategoryChips value={lCategory} onChange={setLCategory} />
              </>
            )}

            <Text style={styles.inputLabel}>Descripción</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: "top" }]}
              placeholder="Detalles, estado, ubicación, condiciones…"
              placeholderTextColor="#94a3b8"
              multiline
              value={lDesc}
              onChangeText={setLDesc}
            />
            {/* Fotos (solo Premium, máx 2) */}
            <Text style={styles.inputLabel}>Fotos (Premium)</Text>
            {premiumActive ? (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 6 }}>
                  {lImages.map((im, idx) => {
                    const src = im?.url ?? im;
                    return (
                      <View key={idx} style={{ position: "relative", width: 84, height: 84, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "#e2e8f0" }}>
                        <Image source={{ uri: src }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                        <TouchableOpacity
                          onPress={() => removeListingImage(idx)}
                          style={{ position: "absolute", top: 4, right: 4, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 999, padding: 3 }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close" size={12} color="#334155" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  {/* Botón agregar (respeta límite 2) */}
                  {lImages.length < 2 && (
                    <TouchableOpacity
                      onPress={addListingImage}
                      activeOpacity={0.9}
                      style={{ width: 84, height: 84, borderRadius: 10, borderWidth: 1, borderColor: "#cfe2ff", backgroundColor: "#eaf2ff", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="image-outline" size={20} color="#0d6efd" />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <View style={{ backgroundColor: "#fff7ed", borderColor: "#ffedd5", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="star" size={16} color="#b45309" />
                  <Text style={{ marginLeft: 8, color: "#92400e", fontWeight: "800" }}>
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

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={() => {
                  setEditListingOpen(false);
                  resetListingForm();
                }}
                disabled={savingListing}
              >
                <Text style={styles.secondaryBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <View style={{ width: 10 }} />
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { flex: 1, opacity: savingListing ? 0.7 : 1 },
                ]}
                onPress={async () => {
                  try {
                    if (!user || !editingListingId) return;
                    if (!lTitle.trim()) {
                      Alert.alert(
                        "Falta título",
                        "Escribe un título para tu publicación."
                      );
                      return;
                    }
                    if (lPrice.trim() === "" || isNaN(Number(lPrice))) {
                      Alert.alert(
                        "Precio inválido",
                        "Ingresa un precio numérico."
                      );
                      return;
                    }
                    const ref = doc(
                      db,
                      "users",
                      user.uid,
                      "listings",
                      editingListingId
                    );
                    const payload = {
                      type: lType,
                      title: lTitle.trim(),
                      price: Number(lPrice),
                      description: lDesc.trim(),
                      updatedAt: serverTimestamp(),
                    };
                    if (lType === "sale")
                      payload.category = lCategory || "Otros";
                    if (premiumActive) {
                      payload.images = lImages.slice(0, 2).map((im) => ({ url: im?.url ?? im }));
                    }
                    setSavingListing(true);
                    await updateDoc(ref, payload);
                    Alert.alert(
                      "Actualizado",
                      "Tu publicación fue actualizada."
                    );
                    setEditListingOpen(false);
                    resetListingForm();
                  } catch (e) {
                    console.log("save listing error:", e);
                    Alert.alert("Error", "No se pudo guardar la publicación.");
                  } finally {
                    setSavingListing(false);
                  }
                }}
                disabled={savingListing}
              >
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {"  "}
                  {savingListing ? "Guardando…" : "Guardar cambios"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* === STYLES === */
const CARD_BG = "#fff";
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f7fb" },
  container: { padding: 16, paddingBottom: 28 },
  center: { alignItems: "center", justifyContent: "center" },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e8edf5",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  cardHeaderLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#1c2b39" },
  divider: { height: 1, backgroundColor: "#eef2f7", marginVertical: 10 },
  
  accordionHeader: {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 6,
},
accordionTitleRow: {
  flexDirection: "row",
  alignItems: "center",
},
accordionSubtitle: {
  marginTop: 2,
  color: "#64748b",
  fontSize: 12,
  fontWeight: "700",
},

lockedBox: {
  borderWidth: 1,
  borderColor: "#e2e8f0",
  backgroundColor: "#f8fafc",
  borderRadius: 12,
  padding: 12,
},
lockRow: {
  flexDirection: "row",
  alignItems: "center",
},
lockIconWrap: {
  width: 34,
  height: 34,
  borderRadius: 10,
  backgroundColor: "#e2e8f0",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 10,
},
lockTitle: { fontWeight: "800", color: "#0f172a" },
lockSubtitle: { color: "#475569", marginTop: 2, fontSize: 12, fontWeight: "700" },

lockBenefits: { marginTop: 10, gap: 6 },
benefitItem: { flexDirection: "row", alignItems: "center", gap: 8 },
benefitText: { color: "#334155", fontWeight: "700", fontSize: 12 },


  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#e9f1ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dbe7ff",
  },
  avatarText: {
    color: "#0a58ca",
    fontWeight: "800",
    fontSize: 24,
    letterSpacing: 0.5,
  },
  nameText: { fontSize: 18, fontWeight: "800", color: "#12263a" },
  emailHint: { fontSize: 12, color: "#6b7a90", marginTop: 2 },

  editPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eaf2ff",
    borderColor: "#cfe2ff",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editPillText: { color: "#1d4fb8", fontWeight: "800" },

  rowItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  rowItemTap: {},
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
  },
  rowLabel: { fontSize: 12, color: "#6b7a90" },
  rowValue: { fontSize: 14, fontWeight: "800", color: "#1c2b39", marginTop: 2 },

  /* Texto cuerpo */
  bioText: { color: "#2f3a45", lineHeight: 20, marginTop: 8 },

  /* Reputación */
  reputationRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  repBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  repNumber: { fontSize: 16, fontWeight: "900" },
  repLabel: { fontSize: 12, fontWeight: "800" },

  /* Premium */
  premiumBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fef9c3",
    flexDirection: "row",
    alignItems: "center",
  },
  premiumBadgeText: {
    color: "#b45309",
    fontSize: 10,
    fontWeight: "900",
  },
  premiumBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  /* Services */
  countPill: {
    backgroundColor: "#e9f1ff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countPillGreen: {
    backgroundColor: "#d1fae5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countPillGray: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: { color: "#0a58ca", fontWeight: "800", fontSize: 12 },

  servicesGrid: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  serviceCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e8edf5",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    position: "relative",
  },
  serviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#eaf2ff",
    borderWidth: 1,
    borderColor: "#cfe2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceName: { marginTop: 6, fontSize: 13, fontWeight: "700", color: "#223" },

  serviceActionsCol: { marginTop: 10, gap: 8 },
  fullPrimaryBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fullPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  fullGhostBtn: {
    backgroundColor: "#eaf2ff",
    borderWidth: 1,
    borderColor: "#cfe2ff",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fullGhostText: { color: "#1d4fb8", fontWeight: "800", fontSize: 12 },

  deleteServiceBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },

  /* Listing items (mercado) */
  listingItem: {
    borderWidth: 1,
    borderColor: "#e8edf5",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  listingHeaderRow: { flexDirection: "row", alignItems: "center" },
  timeText: {
    marginLeft: "auto",
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
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
    marginBottom: 6,
  },
  badgeTypeText: { fontSize: 11, fontWeight: "900" },
  listingTitle: { fontWeight: "800", color: "#1c2b39", fontSize: 15 },
  listingSub: {
    marginTop: 2,
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  chipBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "900" },
  chipEdit: { backgroundColor: "#eaf2ff", borderColor: "#cfe2ff" },
  chipDanger: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },

  /* Buttons */
  primaryBtn: {
    backgroundColor: "#0d6efd",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  outlineBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#cfe2ff",
    backgroundColor: "#eaf2ff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  outlineBtnText: { color: "#1d4fb8", fontWeight: "800", fontSize: 16 },

  ghostDangerBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#f3c1c6",
    backgroundColor: "#fff5f5",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ghostDangerText: { color: "#dc3545", fontWeight: "800", fontSize: 16 },

  /* Modal base */
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
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
  inputDisabled: { backgroundColor: "#f1f5f9", color: "#94a3b8" },
  hintLock: { color: "#94a3b8", fontSize: 11, marginTop: 4 },

  /* Redes sociales (card) */
  socialTitle: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#6b7a90",
  },
  socialRow: { flexDirection: "row", gap: 8 },
  socialIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  instagramBg: { backgroundColor: "#fff1f7", borderColor: "#ffd7e9" },
  whatsappBg: { backgroundColor: "#e9fff2", borderColor: "#c4f3d7" },
  otherBg: { backgroundColor: "#f6f8fc", borderColor: "#e2e8f0" },

  /* Segment (modal editar listing) */
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
    elevation: 1,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
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

  /* Categorías chips */
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

  /* Bullets */
  bulletRow: { flexDirection: "row", alignItems: "center" },
  bulletText: { marginLeft: 8, color: "#334155", fontWeight: "700" },
});
