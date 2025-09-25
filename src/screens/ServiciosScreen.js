// src/screens/ServiciosScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Image,
  ImageBackground,
  FlatList,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { auth, db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  collectionGroup,
  getDocs,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import Constants from "expo-constants";

const { width } = Dimensions.get("window");
const H_PADDING = 16;
const TILE_MIN_HEIGHT = 170;

const DEBUG_STATS = false;

// ====== Config concurso ======
const CONTEST_DOC_ID =
  Constants?.expoConfig?.extra?.contestId ??
  Constants?.manifest?.extra?.contestId ??
  "current";

// util para ordenar sin importar si es Timestamp, número o string
function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number") return v;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function norm(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim().toLowerCase();
}

function fmt(n) {
  try {
    return Number(n || 0).toLocaleString("es-CO");
  } catch {
    return String(n || 0);
  }
}

export default function ServiciosScreen() {
  const navigation = useNavigation();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [premiumActive, setPremiumActive] = useState(false);

  const [loadingStats, setLoadingStats] = useState(true);
  const [servicesCount, setServicesCount] = useState(0);
  const [providersCount, setProvidersCount] = useState(0);

  const [loadingMarket, setLoadingMarket] = useState(true);
  const [saleItemsCount, setSaleItemsCount] = useState(0);
  const [rentItemsCount, setRentItemsCount] = useState(0);

  // 🧩 Feature toggle: concurso
  const [contestEnabled, setContestEnabled] = useState(false);

  // 🏁 Concurso (en vivo)
  const [loadingContest, setLoadingContest] = useState(true);
  const [participants, setParticipants] = useState([]);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [totalVotes, setTotalVotes] = useState(0);

  // 📣 Publicidad (en vivo)
  const [ads, setAds] = useState([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [adIndex, setAdIndex] = useState(0);
  const adsListRef = useRef(null);
  const adsTimerRef = useRef(null);

  // 👤 Cache de autores de anuncios (uid -> {displayName, avatarUrl})
  const [adAuthors, setAdAuthors] = useState({});

  // Carga saludo (nombre, avatar, premium)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const uref = doc(db, "users", user.uid);
    getDoc(uref).then((snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        setDisplayName(d.displayName || "");
        setAvatarUrl(d.avatarUrl || "");
        const exp =
          d.premiumExpiresAt && typeof d.premiumExpiresAt.toMillis === "function"
            ? d.premiumExpiresAt.toMillis()
            : 0;
        setPremiumActive(exp > Date.now());
      }
    });

    // (Opcional) contador de solicitudes: si lo quieres de nuevo, vuelve a mostrar el chip
    try {
      const rq = query(
        collection(db, "requests"),
        where("fromUserUid", "==", user.uid)
      );
      const unsub = onSnapshot(rq, () => {}, () => {});
      return () => unsub();
    } catch {}
  }, []);

  // Carga estadísticas de comunidad (servicios/proveedores)
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingStats(true);
        const snap = await getDocs(collectionGroup(db, "services"));

        const uniqServices = new Set();
        const uniqProviders = new Set();

        snap.forEach((d) => {
          const data = d.data() || {};
          const parentUid = d.ref.parent?.parent?.id;
          if (parentUid) uniqProviders.add(parentUid);

        const keyCandidates = [data.id, data.serviceId, data.name, d.id]
            .map(norm)
            .filter(Boolean);

          const key = keyCandidates[0] || "";
          if (key) uniqServices.add(key);

          if (DEBUG_STATS) {
            console.log("[services-stats] doc:", {
              parentUid,
              d_id: d.id,
              id: data.id,
              serviceId: data.serviceId,
              name: data.name,
              chosenKey: key,
            });
          }
        });

        if (DEBUG_STATS) {
          console.log("[services-stats] totals:", {
            services: uniqServices.size,
            providers: uniqProviders.size,
            keys: Array.from(uniqServices),
          });
        }

        setServicesCount(uniqServices.size);
        setProvidersCount(uniqProviders.size);
      } catch (e) {
        console.error("Error cargando estadísticas:", e);
        setServicesCount(0);
        setProvidersCount(0);
      } finally {
        setLoadingStats(false);
      }
    };
    load();
  }, []);

  // Mercado: contadores
  useEffect(() => {
    const loadMarket = async () => {
      try {
        setLoadingMarket(true);
        const snap = await getDocs(collectionGroup(db, "listings"));
        let sale = 0,
          rent = 0;

        snap.forEach((d) => {
          const x = d.data() || {};
          const isSale =
            (x.kind === "sale" || x.type === "sale" || x.mode === "sale") &&
            (x.active === true || x.status === "active");
          const isRent =
            (x.kind === "rent" || x.type === "rent" || x.mode === "rent") &&
            (x.active === true || x.status === "active");
          if (isSale) sale += 1;
          if (isRent) rent += 1;
        });

        setSaleItemsCount(sale);
        setRentItemsCount(rent);
      } catch (e) {
        console.warn(
          "Mercado: no se pudo contar listados (mostrando 0).",
          e?.message || e
        );
        setSaleItemsCount(0);
      } finally {
        setLoadingMarket(false);
      }
    };

    loadMarket();
  }, []);

  // 🔁 Toggle remoto para el concurso
  useEffect(() => {
    const ref = doc(db, "config", "contest");
    const unsub = onSnapshot(
      ref,
      (snap) => setContestEnabled(!!snap.data()?.enabled),
      () => setContestEnabled(false)
    );
    return () => unsub();
  }, []);

  // Concurso: participantes y ranking en vivo (solo si está habilitado)
  useEffect(() => {
    if (!contestEnabled) {
      setParticipants([]);
      setParticipantsCount(0);
      setTotalVotes(0);
      setLoadingContest(false);
      return;
    }

    setLoadingContest(true);
    try {
      const base = collection(db, "contests", CONTEST_DOC_ID, "participants");
      const qTop = query(base, orderBy("votes", "desc"), limit(10));

      const unsub = onSnapshot(
        qTop,
        (snap) => {
          const arr = [];
          let count = 0;
          let votes = 0;
          snap.forEach((d) => {
            const x = d.data() || {};
            count += 1;
            votes += Number(x.votes || 0);
            arr.push({
              id: d.id,
              displayName: x.displayName || "Participante",
              avatarUrl: x.avatarUrl || "",
              business: x.business || "",
              votes: Number(x.votes || 0),
            });
          });
          setParticipants(arr);
          setParticipantsCount(count);
          setTotalVotes(votes);
          setLoadingContest(false);
        },
        (err) => {
          console.log("contest snapshot error:", err?.message || err);
          setParticipants([]);
          setParticipantsCount(0);
          setTotalVotes(0);
          setLoadingContest(false);
        }
      );
      return () => unsub();
    } catch (e) {
      setLoadingContest(false);
    }
  }, [contestEnabled]);

  // === Publicidad: snapshot + fallback si falta índice o tipos mezclados ===
  // + Carga de perfiles de autores para mostrar avatar y nombre
  useEffect(() => {
    setAdsLoading(true);

    const base = collection(db, "ads");
    const qAds = query(
      base,
      where("active", "==", true),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const ensureAuthorProfiles = async (uids = []) => {
      const missing = uids.filter((u) => u && !adAuthors[u]);
      if (!missing.length) return;
      const updates = {};
      await Promise.all(
        missing.map(async (u) => {
          try {
            const snap = await getDoc(doc(db, "users", u));
            const d = snap.exists() ? snap.data() : {};
            updates[u] = {
              displayName: d.displayName || "Anunciante",
              avatarUrl: d.avatarUrl || "",
            };
          } catch {
            updates[u] = { displayName: "Anunciante", avatarUrl: "" };
          }
        })
      );
      if (Object.keys(updates).length) {
        setAdAuthors((prev) => ({ ...prev, ...updates }));
      }
    };

    const handleSnap = (snap) => {
      const arr = [];
      const uids = new Set();
      snap.forEach((d) => {
        const x = d.data() || {};
        if (!x.imageUrl) return;
        const uid = x.ownerUid || x.uid || null;
        if (uid) uids.add(uid);
        arr.push({
          id: d.id,
          uid,
          imageUrl: x.imageUrl,
          caption: (x.tagline || x.caption || "").slice(0, 40),
          _ts: toMillis(x.createdAt),
        });
      });
      // si por cualquier cosa viene sin orden, lo ordenamos cliente
      arr.sort((a, b) => b._ts - a._ts);
      setAds(arr);
      setAdIndex(0);
      setAdsLoading(false);
      // cargar autores faltantes
      ensureAuthorProfiles(Array.from(uids));
    };

    // primer intento: consulta ordenada (rápida si hay índice)
    const unsub = onSnapshot(
      qAds,
      handleSnap,
      async (err) => {
        console.warn("[ads] snapshot error:", err?.code, err?.message);
        // Fallback: sin orderBy para no requerir índice; ordenamos en cliente
        try {
          const qs = await getDocs(
            query(base, where("active", "==", true), limit(20))
          );
          handleSnap(qs);
        } catch (e2) {
          console.warn("[ads] fallback error:", e2?.code, e2?.message);
          setAds([]);
          setAdsLoading(false);
        }
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adAuthors]);

  useEffect(() => {
    if (adsTimerRef.current) {
      clearInterval(adsTimerRef.current);
      adsTimerRef.current = null;
    }
    if (ads.length > 1) {
      adsTimerRef.current = setInterval(() => {
        setAdIndex((idx) => {
          const next = (idx + 1) % ads.length;
          if (adsListRef.current) {
            try {
              adsListRef.current.scrollToIndex({ index: next, animated: true });
            } catch {}
          }
          return next;
        });
      }, 5000);
    }
    return () => {
      if (adsTimerRef.current) clearInterval(adsTimerRef.current);
    };
  }, [ads]);

  const firstName = useMemo(() => {
    const s = (displayName || "").trim();
    if (!s) return "";
    return s.split(/\s+/)[0];
  }, [displayName]);

  // Header image (URL opcional, sino asset local)
  const headerUri = Constants?.expoConfig?.extra?.homeHeaderImage || null;
  const headerSource = headerUri
    ? { uri: headerUri }
    : require("../../assets/branding/homeHeader.jpg");

  // Imagen del bloque concurso (local recomendada)
  const contestHeaderSource = require("../../assets/branding/contestHeader.jpg");

  // Abre ContactarProveedor desde la publicidad
  const goAd = (ad) => {
    if (!ad?.uid) {
      Alert.alert("Publicidad", "No pudimos encontrar el perfil del anunciante.");
      return;
    }

    // Título/leyenda que se mostrará en el chat/WA
    const subject =
      ad.caption?.trim() ||
      ad.tagline?.trim() ||
      ad.title?.trim() ||
      "tu anuncio publicitario";

    navigation.navigate("ContactarProveedor", {
      providerUid: ad.uid,
      source: "ad",
      adId: ad.id,
      adImageUrl: ad.imageUrl,
      adCaption: ad.caption || ad.tagline || "",
      subject,
      prefill: {
        message: `Hola, vi tu anuncio en la franja de Servicios y me interesa contactarte por "${subject}".`,
      },
    });
  };

  const scrollAd = (dir) => {
    if (!ads.length) return;
    let next = adIndex + (dir === "left" ? -1 : 1);
    if (next < 0) next = ads.length - 1;
    if (next >= ads.length) next = 0;
    setAdIndex(next);
    try {
      adsListRef.current?.scrollToIndex({ index: next, animated: true });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header fijo arriba */}
      <ImageBackground
        source={headerSource}
        style={styles.headerImg}
        imageStyle={styles.headerImgBorder}
        accessibilityRole="image"
        accessible
        accessibilityLabel="Encabezado de la unidad"
      >
        <View style={styles.headerOverlay} />
        <View style={styles.headerRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(firstName || "??").slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>
              {firstName ? `Hola, ${firstName}` : "Hola"}
            </Text>
            <Text style={styles.subtitle}>Florida Norteamérica</Text>
          </View>
        </View>
      </ImageBackground>

      {/* Contenido scrolleable */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 22 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.columnWrap}>
          {/* Fila 1: dos tarjetas */}
          <View style={styles.rowWrap}>
            {/* === Solicitar servicios === */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.tile, styles.tileBlue, styles.tileHalf]}
              onPress={() => navigation.navigate("SolicitarServicios")}
              accessibilityLabel="Solicitar servicios"
              accessibilityRole="button"
            >
              {/* Fila 1: Título */}
              <Text style={[styles.tileTitle, styles.tileTitleBlue]}>
                Solicitar servicios
              </Text>

              {/* Fila 2: Icono + descripción */}
              <View style={styles.infoRow}>
                <View style={[styles.iconBadge, styles.iconBadgeBlue]}>
                  <Ionicons name="search-outline" size={26} color="#1d4fb8" />
                </View>
                <Text
                  style={[styles.tileCaption, styles.tileCaptionBlue]}
                  numberOfLines={3}
                >
                  Explora y crea tu solicitud
                </Text>
              </View>

              {/* Fila 3: Chip métrica */}
              <View style={[styles.chip, styles.chipBlue]}>
                <Ionicons name="layers-outline" size={14} color="#1d4fb8" />
                <Text style={[styles.chipText, { color: "#1d4fb8" }]}>
                  {"  "}Servicios activos:{" "}
                  {loadingStats ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    servicesCount
                  )}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#1d4fb8"
                style={styles.chevIcon}
              />
            </TouchableOpacity>

            {/* === Ofrecer servicios === */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.tile, styles.tileOrange, styles.tileHalf]}
              onPress={() => navigation.navigate("OfrecerServicios")}
              accessibilityLabel="Ofrecer servicios"
              accessibilityRole="button"
            >
              {/* Fila 1: Título */}
              <Text style={[styles.tileTitle, styles.tileTitleOrange]}>
                Ofrecer servicios
              </Text>

              {/* Fila 2: Icono + descripción */}
              <View style={styles.infoRow}>
                <View style={[styles.iconBadge, styles.iconBadgeOrange]}>
                  <Ionicons name="briefcase-outline" size={26} color="#9a5a00" />
                </View>
                <Text
                  style={[styles.tileCaption, styles.tileCaptionOrange]}
                  numberOfLines={3}
                >
                  Recibe solicitudes de la comunidad
                </Text>
              </View>

              {/* Fila 3: Chip métrica */}
              <View style={[styles.chip, styles.chipOrange]}>
                <Ionicons name="people-outline" size={14} color="#9a5a00" />
                <Text style={[styles.chipText, { color: "#9a5a00" }]}>
                  {"  "}Proveedores activos:{" "}
                  {loadingStats ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    providersCount
                  )}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#9a5a00"
                style={styles.chevIcon}
              />
            </TouchableOpacity>
          </View>

          {/* Fila 2: Mercado */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.tile, styles.tileGreen]}
            onPress={() => navigation.navigate("Mercado")}
            accessibilityLabel="Ventas de artículos y arriendos"
            accessibilityRole="button"
          >
            {/* Fila 1: Título */}
            <Text style={[styles.tileTitle, styles.tileTitleGreen]}>
              Ventas de artículos y arriendos
            </Text>

            {/* Fila 2: Icono + descripción */}
            <View style={styles.infoRow}>
              <View style={[styles.iconBadge, styles.iconBadgeGreen]}>
                <Ionicons name="bag-handle-outline" size={26} color="#0f766e" />
              </View>
              <Text
                style={[styles.tileCaption, styles.tileCaptionGreen]}
                numberOfLines={3}
              >
                Acá podrás vender/comprar artículos y publicar tus
                arrendamientos
              </Text>
            </View>

            {/* Fila 3: Chips contadores */}
            <View style={styles.chipsRow}>
              <View style={[styles.chip, styles.chipGreen]}>
                <Ionicons name="pricetags-outline" size={14} color="#0f766e" />
                <Text style={[styles.chipText, { color: "#0f766e" }]}>
                  {"  "}Artículos en venta:{" "}
                  {loadingMarket ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    saleItemsCount
                  )}
                </Text>
              </View>
              <View style={[styles.chip, styles.chipGreen]}>
                <Ionicons name="home-outline" size={14} color="#0f766e" />
                <Text style={[styles.chipText, { color: "#0f766e" }]}>
                  {"  "}Arriendos activos:{" "}
                  {loadingMarket ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    rentItemsCount
                  )}
                </Text>
              </View>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color="#0f766e"
              style={styles.chevIcon}
            />
          </TouchableOpacity>

          {/* ===== Separador y Concurso (solo si está habilitado) ===== */}
          {contestEnabled && (
            <>
              <View style={styles.sectionSpacer}>
                <View style={styles.separator} />
              </View>

              {/* ====== Concurso de emprendedores ====== */}
              <View style={[styles.contestCard]}>
                <ImageBackground
                  source={contestHeaderSource}
                  style={styles.contestHeader}
                  imageStyle={{
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                  }}
                  accessibilityRole="image"
                  accessibilityLabel="Banner del concurso"
                >
                  {/* Oscurecedor (sin textos) */}
                  <View style={styles.contestOverlay} />
                </ImageBackground>

                {/* Encabezado (texto fuera de la imagen) */}
                <View style={styles.contestHeadTexts}>
                  <Text style={styles.contestTitle}>Concurso de emprendedores</Text>
                  <Text style={styles.contestSubtitle}>
                    ¡Inscríbete si eres Premium o entra a votar por tus favoritos!
                  </Text>
                </View>

                {/* Resumen / acciones */}
                <View style={styles.contestBody}>
                  <View style={styles.contestRow}>
                    <View style={[styles.chip, styles.chipContest]}>
                      <Ionicons name="trophy-outline" size={14} color="#7c3aed" />
                      <Text style={[styles.chipText, { color: "#6d28d9" }]}>
                        {"  "}En vivo: {fmt(participantsCount)} participantes · {fmt(totalVotes)} votos
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.ctaContestPrimary,
                        !premiumActive && { opacity: 0.6 },
                      ]}
                      onPress={() => {
                        if (!premiumActive) {
                          Alert.alert(
                            "Solo Premium",
                            "La inscripción al concurso es un beneficio de FN Premium."
                          );
                          return;
                        }
                        navigation.navigate("ContestRegister", {
                          contestId: CONTEST_DOC_ID,
                        });
                      }}
                      activeOpacity={0.9}
                    >
                      <Ionicons name="sparkles-outline" size={18} color="#fff" />
                      <Text style={styles.ctaContestPrimaryText}>
                        {"  "}Inscribirme (emprendedor)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.ctaContestGhost}
                      onPress={() =>
                        navigation.navigate("ContestVotar", {
                          contestId: CONTEST_DOC_ID,
                        })
                      }
                      activeOpacity={0.9}
                    >
                      <Ionicons name="heart-outline" size={18} color="#6d28d9" />
                      <Text style={styles.ctaContestGhostText}>{"  "}Quiero votar</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Ranking (top 10) */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.rankTitle}>Ranking en tiempo real</Text>

                    {loadingContest ? (
                      <View style={{ paddingVertical: 10 }}>
                        <ActivityIndicator />
                      </View>
                    ) : participants.length === 0 ? (
                      <Text style={styles.rankEmpty}>
                        Aún no hay participantes. ¡Sé el primero en inscribirte!
                      </Text>
                    ) : (
                      <FlatList
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        data={participants}
                        keyExtractor={(it) => it.id}
                        contentContainerStyle={{ paddingVertical: 6 }}
                        renderItem={({ item, index }) => (
                          <View style={styles.participantCard}>
                            <View style={styles.participantBadge}>
                              <Text style={styles.participantBadgeText}>#{index + 1}</Text>
                            </View>
                            {item.avatarUrl ? (
                              <Image
                                source={{ uri: item.avatarUrl }}
                                style={styles.participantAvatar}
                              />
                            ) : (
                              <View style={[styles.participantAvatar, styles.ph]} />
                            )}
                            <Text style={styles.participantName} numberOfLines={1}>
                              {item.displayName}
                            </Text>
                            {!!item.business && (
                              <Text style={styles.participantBiz} numberOfLines={1}>
                                {item.business}
                              </Text>
                            )}
                            <View className="votes-pill" style={styles.votesPill}>
                              <Ionicons name="flame-outline" size={14} color="#fff" />
                              <Text style={styles.votesPillText}>
                                {"  "}
                                {fmt(item.votes)} votos
                              </Text>
                            </View>
                          </View>
                        )}
                      />
                    )}
                  </View>
                </View>
              </View>
            </>
          )}

          {/* ===== Separador y Publicidad (siempre visible) ===== */}
          <View style={styles.sectionSpacer}>
            <View style={styles.separator} />
          </View>

          <View style={styles.adsCard}>
            <View style={styles.adsHead}>
              <Ionicons name="megaphone-outline" size={16} color="#334155" />
              <Text style={styles.adsHeadText}>Publicidad de emprendedores</Text>
            </View>

            <View style={styles.adsCarouselWrap}>
              <FlatList
                ref={adsListRef}
                horizontal
                data={ads.length ? ads : [{ id: "__placeholder__", placeholder: true }]}
                keyExtractor={(it) => it.id}
                showsHorizontalScrollIndicator={false}
                pagingEnabled
                onScrollToIndexFailed={() => {}}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => !item.placeholder && goAd(item)}
                    style={{ width: width - H_PADDING * 2 }}
                  >
                    {item.placeholder ? (
                      <View
                        style={[
                          styles.adSlide,
                          { backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
                        ]}
                      >
                        <Text style={{ color: "#334155", fontWeight: "900" }}>
                          Aquí podría estar tu publicidad
                        </Text>
                        <Text style={{ color: "#475569", marginTop: 4 }}>
                          ¡Haz que te conozcan!
                        </Text>
                      </View>
                    ) : (
                      <ImageBackground
                        source={{ uri: item.imageUrl }}
                        style={styles.adSlide}
                        imageStyle={styles.adSlideImg}
                      >
                        <View style={styles.adOverlay} />

                        {/* 👤 Autor del anuncio (avatar + nombre) */}
                        {!!item.uid && (
                          <View style={styles.adAuthorWrap}>
                            {adAuthors[item.uid]?.avatarUrl ? (
                              <Image
                                source={{ uri: adAuthors[item.uid].avatarUrl }}
                                style={styles.adAuthorAvatar}
                              />
                            ) : (
                              <View
                                style={[styles.adAuthorAvatar, { backgroundColor: "#e5e7eb" }]}
                              />
                            )}
                            <Text style={styles.adAuthorName} numberOfLines={1}>
                              {adAuthors[item.uid]?.displayName || "Anunciante"}
                            </Text>
                          </View>
                        )}

                        {!!item.caption && (
                          <View style={styles.adCaptionWrap}>
                            <Text style={styles.adCaption} numberOfLines={2}>
                              {item.caption}
                            </Text>
                          </View>
                        )}
                      </ImageBackground>
                    )}
                  </TouchableOpacity>
                )}
              />

              {/* Flechas (solo si hay más de 1 anuncio real) */}
              {ads.length > 1 && (
                <>
                  <TouchableOpacity
                    style={[styles.navBtn, { left: 6 }]}
                    onPress={() => scrollAd("left")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-back" size={18} color="#111827" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navBtn, { right: 6 }]}
                    onPress={() => scrollAd("right")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-forward" size={18} color="#111827" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {adsLoading && (
              <View style={{ paddingVertical: 10 }}>
                <ActivityIndicator />
              </View>
            )}
          </View>

          {/* Nota / ayuda */}
          <View style={styles.helper}>
            <Ionicons name="information-circle-outline" size={16} color="#6b7a90" />
            <Text style={styles.helperText}>
              Administra tus datos y servicios en <Text style={{ fontWeight: "800" }}>Perfil</Text>.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f2f5fa" },

  headerImg: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  headerImgBorder: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2b6ad6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#ffffff33",
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#ffffff66",
    backgroundColor: "#2b6ad6",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1,
  },
  greet: { color: "#fff", fontWeight: "800", fontSize: 18 },
  subtitle: { color: "#E6EEF8", fontSize: 12, marginTop: 2 },

  /* Columna de CTAs grandes */
  columnWrap: {
    paddingHorizontal: H_PADDING,
    marginTop: 14,
  },
  rowWrap: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  tile: {
    width: "100%",
    minHeight: TILE_MIN_HEIGHT,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    marginBottom: 0,
    position: "relative",
    gap: 10,
  },
  tileHalf: { flex: 1 },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // Azul
  tileBlue: { backgroundColor: "#eaf2ff", borderColor: "#cfe2ff" },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadgeBlue: {
    backgroundColor: "#dbe9ff",
    borderWidth: 1,
    borderColor: "#c7dcff",
  },
  tileTitleBlue: { color: "#1d4fb8" },
  tileCaptionBlue: { color: "#3b5fb1", flex: 1 },

  // Naranja
  tileOrange: { backgroundColor: "#fff6e9", borderColor: "#ffe3bf" },
  iconBadgeOrange: {
    backgroundColor: "#ffeccc",
    borderWidth: 1,
    borderColor: "#ffe1b8",
  },
  tileTitleOrange: { color: "#9a5a00" },
  tileCaptionOrange: { color: "#8a6b3f", flex: 1 },

  // Verde (Mercado)
  tileGreen: { backgroundColor: "#e8faf6", borderColor: "#b7eee3" },
  iconBadgeGreen: {
    backgroundColor: "#d1faf3",
    borderWidth: 1,
    borderColor: "#b7eee3",
  },
  tileTitleGreen: { color: "#0f766e" },
  tileCaptionGreen: { color: "#15756d", flex: 1 },

  tileTitle: { fontSize: 18, fontWeight: "900" },
  tileCaption: { fontSize: 13, opacity: 0.95 },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
    borderWidth: 1,
    marginTop: 2,
  },
  chevIcon: {
    position: "absolute",
    right: 12,
    top: 12,
    opacity: 0.85,
  },
  chipBlue: { backgroundColor: "#e9f1ff", borderColor: "#c7dcff" },
  chipOrange: { backgroundColor: "#fff0da", borderColor: "#ffe1b8" },
  chipGreen: { backgroundColor: "#d7fff7", borderColor: "#b7eee3" },
  chipText: { fontSize: 12.5, fontWeight: "800" },
  chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },

  helper: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#eef2f7",
  },
  helperText: { color: "#6b7a90", marginLeft: 8, fontSize: 12 },

  /* ===== Separador entre bloques ===== */
  sectionSpacer: {
    marginTop: 16,
    marginBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 2,
    opacity: 0.9,
  },

  /* ====== Concurso ====== */
  contestCard: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e6d9ff",
    backgroundColor: "#faf7ff",
    overflow: "hidden",
  },
  contestHeader: {
    padding: 16,
    minHeight: 120,
    justifyContent: "flex-end",
  },
  contestOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.40)",
  },

  // Títulos fuera de la imagen
  contestHeadTexts: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  contestTitle: {
    color: "#4c1d95",
    fontWeight: "900",
    fontSize: 18,
  },
  contestSubtitle: {
    color: "#5b21b6",
    marginTop: 3,
    fontSize: 12,
    opacity: 0.9,
  },

  contestBody: { padding: 12 },
  contestRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chipContest: { backgroundColor: "#F1E9FF", borderColor: "#e6d9ff" },

  actionsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  ctaContestPrimary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7c3aed",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  ctaContestPrimaryText: { color: "#fff", fontWeight: "900" },
  ctaContestGhost: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ede9fe",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd6fe",
  },
  ctaContestGhostText: { color: "#6d28d9", fontWeight: "900" },

  rankTitle: {
    fontWeight: "900",
    color: "#4c1d95",
    marginBottom: 6,
    marginTop: 6,
  },
  rankEmpty: { color: "#6b7280", fontStyle: "italic" },

  participantCard: {
    width: 140,
    marginRight: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  participantBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  participantBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  participantAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: 6,
    marginBottom: 6,
    backgroundColor: "#ede9fe",
  },
  participantName: { fontWeight: "900", color: "#111827" },
  participantBiz: { color: "#6b7280", fontSize: 12 },
  votesPill: {
    marginTop: 6,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
  },
  votesPillText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  ph: { backgroundColor: "#f3f4f6" },

  /* ====== Publicidad ====== */
  adsCard: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  adsHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 6,
  },
  adsHeadText: { color: "#334155", fontWeight: "900" },

  adsCarouselWrap: {
    position: "relative",
    marginTop: 8,
    paddingBottom: 8,
  },
  adSlide: {
    height: 210, // franja más grande
    justifyContent: "flex-end",
    borderRadius: 14,
    overflow: "hidden",
    marginHorizontal: 12,
  },
  adSlideImg: {
    borderRadius: 14,
  },
  adOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  // 👤 Badge del autor arriba-izquierda
  adAuthorWrap: {
    position: "absolute",
    left: 12,
    top: 10,
    backgroundColor: "rgba(17,24,39,0.55)",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adAuthorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#ffffff66",
  },
  adAuthorName: {
    color: "#fff",
    fontWeight: "800",
    maxWidth: 180,
    fontSize: 12.5,
  },
  adCaptionWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(17,24,39,0.55)",
    borderRadius: 10,
  },
  adCaption: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  navBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    backgroundColor: "#ffffffdd",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
});
