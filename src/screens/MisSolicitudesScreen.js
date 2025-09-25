// src/screens/MisSolicitudesScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { auth, db } from "../firebaseConfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  writeBatch,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  Timestamp,
  setDoc,
  getDoc,
  increment, // 馃憟 a帽adimos increment
} from "firebase/firestore";

import SegmentedTabs from "../components/SegmentedTabs";
import RequestCard from "../components/RequestCard";

const TTL_DAYS = 7;

// Bump de reputaci贸n usando increment(1). Compatible con tus reglas actuales.
// Solo toca UN campo (recommendedCount o notRecommendedCount).
async function bumpReputation(db, targetUid, value /*, requestId */) {
  const ref = doc(db, "users", targetUid);
  try {
    if (value === "up") {
      await updateDoc(ref, { recommendedCount: increment(1) });
    } else {
      await updateDoc(ref, { notRecommendedCount: increment(1) });
    }
  } catch (e) {
    if (e?.code === "not-found") {
      if (value === "up") {
        await setDoc(ref, { recommendedCount: 1 }, { merge: false });
      } else {
        await setDoc(ref, { notRecommendedCount: 1 }, { merge: false });
      }
    } else {
      throw e;
    }
  }
}

const Empty = ({ text }) => (
  <View style={{ padding: 16, alignItems: "center" }}>
    <Text style={{ color: "#666" }}>{text}</Text>
  </View>
);

const RateModal = ({ visible, onClose, onUp, onDown, title }) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={styles.modalOverlay}>
      <View style={styles.rateBox}>
        <Text style={styles.modalTitle}>{title}</Text>
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.rateBtn, { backgroundColor: "#198754" }]}
            onPress={onUp}
          >
            <Ionicons name="thumbs-up-outline" size={18} color="#fff" />
            <Text style={styles.rateText}> Recomendado</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.rateBtn,
              { backgroundColor: "#dc3545", marginLeft: 10 },
            ]}
            onPress={onDown}
          >
            <Ionicons name="thumbs-down-outline" size={18} color="#fff" />
            <Text style={styles.rateText}> No recomendado</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { marginTop: 10 }]}
          onPress={onClose}
        >
          <Text style={styles.closeText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

export default function MisSolicitudesScreen() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("abiertas");
  const [detail, setDetail] = useState(null);
  const [rateModal, setRateModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "requests"),
      where("fromUserUid", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
      );
      setItems(arr);
    });

    return () => unsub();
  }, []);

  const abiertas = useMemo(
    () => items.filter((it) => it.status === "pendiente"),
    [items]
  );
  const enCurso = useMemo(
    () => items.filter((it) => it.status === "aceptada"),
    [items]
  );
  const historial = useMemo(
    () =>
      items.filter((it) =>
        ["finalizada", "rechazada", "cancelada"].includes(it.status)
      ),
    [items]
  );

  const data =
    tab === "abiertas" ? abiertas : tab === "curso" ? enCurso : historial;
  const tabs = [
    { key: "abiertas", label: "Abiertas", count: abiertas.length },
    { key: "curso", label: "En curso", count: enCurso.length },
    { key: "historial", label: "Historial", count: historial.length },
  ];

  const finalizeWithRating = async (item, value) => {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) return;
      if (item.status !== "aceptada") {
        Alert.alert("Aviso", "Solo puedes finalizar solicitudes aceptadas.");
        return;
      }

      const expireAt = Timestamp.fromMillis(
        Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000
      );
      let targetUidOutside = null;
      let isSelfRequest = false;

      await runTransaction(db, async (tx) => {
        const reqRef = doc(db, "requests", item.id);
        const snap = await tx.get(reqRef);
        if (!snap.exists()) throw new Error("Solicitud no existe");
        const req = snap.data();

        if (req.status !== "aceptada")
          throw new Error("Estado no v谩lido para finalizar");
        if (currentUid !== req.fromUserUid && currentUid !== req.toUserUid) {
          throw new Error("No autorizado");
        }

        const targetUidTx =
          currentUid === req.fromUserUid ? req.toUserUid : req.fromUserUid;
        isSelfRequest = req.fromUserUid === req.toUserUid;
        targetUidOutside = targetUidTx;

        const updateData = {
          status: "finalizada",
          finalizedBy: currentUid,
          expireAt,
          finalizedAt: serverTimestamp(),
          terminalAt: serverTimestamp(),
        };

        if (!isSelfRequest) {
          updateData.rating = value;
          updateData.ratingBy = currentUid;
          updateData.ratingTargetUid = targetUidTx;
        }

        tx.update(reqRef, updateData);
      });

      // BUMP no bloqueante
      if (!isSelfRequest && targetUidOutside) {
        try {
          await bumpReputation(db, targetUidOutside, value, item.id); // 馃憟 pasamos requestId (no imprescindible)
        } catch (e) {
          if (e?.code === "permission-denied") {
            Alert.alert(
              "Reputaci贸n",
              "No se pudo actualizar la reputaci贸n por permisos."
            );
          } else {
            console.warn(
              "bumpReputation fall贸 (no cr铆tico):",
              e?.code || e?.message || e
            );
          }
        }
      }

      setRateModal(false);
      setDetail(null);
      Alert.alert(
        "Listo",
        isSelfRequest
          ? "Se finaliz贸 sin calificaci贸n (solicitud propia)."
          : "Se finaliz贸 y calific贸 correctamente."
      );
    } catch (e) {
      console.error("Error al finalizar:", e);
      Alert.alert(
        "Error",
        e.code === "permission-denied"
          ? "Permisos insuficientes seg煤n las reglas."
          : e.message || "No se pudo finalizar la solicitud."
      );
    }
  };

  const cancelRequest = async (item) => {
    Alert.alert(
      "Cancelar solicitud",
      "驴Seguro que deseas cancelar esta solicitud? No podr谩 ser respondida por el proveedor.",
      [
        { text: "No", style: "cancel" },
        {
          text: "S铆, cancelar",
          style: "destructive",
          onPress: async () => {
            try {
              const expireAt = Timestamp.fromMillis(
                Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000
              );
              await updateDoc(doc(db, "requests", item.id), {
                status: "cancelada",
                canceledBy: auth.currentUser?.uid || null,
                canceledAt: serverTimestamp(),
                terminalAt: serverTimestamp(),
                expireAt,
              });
              setDetail(null);
              Alert.alert("Cancelada", "Tu solicitud fue cancelada.");
            } catch (e) {
              console.error("Error al cancelar:", e);
              Alert.alert("Error", "No se pudo cancelar la solicitud.");
            }
          },
        },
      ]
    );
  };

  const deleteSingle = async (item) => {
    Alert.alert(
      "Eliminar registro",
      "驴Eliminar este registro del historial? Esta acci贸n no se puede deshacer.",
      [
        { text: "No", style: "cancel" },
        {
          text: "S铆, eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "requests", item.id));
              setDetail(null);
            } catch (e) {
              console.error("Error al eliminar:", e);
              Alert.alert("Error", "No se pudo eliminar el registro.");
            }
          },
        },
      ]
    );
  };

  const clearHistory = async () => {
    try {
      setClearing(true);
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const q = query(
        collection(db, "requests"),
        where("fromUserUid", "==", uid),
        where("status", "in", ["finalizada", "rechazada", "cancelada"])
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setClearing(false);
        Alert.alert("Listo", "No hay registros en el historial.");
        return;
      }

      let batch = writeBatch(db);
      let count = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        count++;
        if (count % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      await batch.commit();
      Alert.alert("Listo", "Se limpi贸 tu historial de solicitudes.");
    } catch (e) {
      console.error("Error limpiando historial:", e);
      Alert.alert("Error", "No se pudo limpiar el historial.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <Text style={styles.pageTitle}>Solicitudes realizadas</Text>

        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />

        {/* Banner informativo SOLO en Historial */}
        {tab === "historial" && (
          <View style={styles.infoBox} accessibilityRole="summary">
            <Ionicons name="time-outline" size={16} color="#6b7a90" />
            <Text style={styles.infoText}>
              Los registros del historial se eliminan autom谩ticamente{" "}
              <Text style={{ fontWeight: "800" }}>cada 7 d铆as</Text> desde que
              una solicitud se finaliza, rechaza o cancela.
            </Text>
          </View>
        )}

        {tab === "historial" && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: "#6c757d" }]}
              onPress={clearHistory}
              disabled={clearing}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.smallBtnText}>
                {"  "}
                {clearing ? "Limpiando..." : "Limpiar historial"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
          renderItem={({ item }) => (
            <RequestCard
              item={item}
              role="outgoing"
              onPress={() => setDetail(item)}
            />
          )}
          ListEmptyComponent={
            <Empty text="No hay elementos en esta secci贸n." />
          }
          initialNumToRender={8}
          windowSize={10}
          removeClippedSubviews
        />

        {/* Modal detalle */}
        <Modal
          visible={!!detail}
          transparent
          animationType="slide"
          onRequestClose={() => setDetail(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Detalle de la solicitud</Text>
              {detail ? (
                <>
                  <Text style={styles.line}>
                    <Text style={styles.bold}>Servicio:</Text>{" "}
                    {detail.serviceName}
                  </Text>
                  <Text style={styles.line}>
                    <Text style={styles.bold}>Proveedor:</Text>{" "}
                    {detail.toUserDisplayName}
                  </Text>
                  <Text style={styles.line}>
                    <Text style={styles.bold}>Estado:</Text> {detail.status}
                  </Text>
                                   <Text style={styles.line}>
                    <Text style={styles.bold}>Apartamento:</Text>{" "}
                    {detail.apartment || detail.fromApartment || "—"}
                  </Text>
                  <Text style={styles.line}>
                    <Text style={styles.bold}>Tel茅fono (tu):</Text>{" "}
                    {detail.fromPhone || "—"}
                  </Text>
                  <Text style={styles.line}>
                    <Text style={styles.bold}>Oferta:</Text>{" "}
                    {detail.offer != null ? `${detail.offer} COP` : "—"}
                  </Text>
                  <Text style={styles.line}>
                    <Text style={styles.bold}>Descripci贸n:</Text>
                  </Text>
                  <Text style={styles.desc}>{detail.description || "—"}</Text>

                  {detail.status === "pendiente" && (
                    <TouchableOpacity
                      style={[styles.cancelBtn, { marginTop: 10 }]}
                      onPress={() => cancelRequest(detail)}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.cancelText}> Cancelar solicitud</Text>
                    </TouchableOpacity>
                  )}

                  {detail.status === "aceptada" && (
                    <TouchableOpacity
                      style={[styles.finishBtn, { marginTop: 10 }]}
                      onPress={() => setRateModal(true)}
                    >
                      <Ionicons name="flag-outline" size={18} color="#fff" />
                      <Text style={styles.finishText}> Finalizar</Text>
                    </TouchableOpacity>
                  )}

                  {["finalizada", "rechazada", "cancelada"].includes(
                    detail.status
                  ) && (
                    <TouchableOpacity
                      style={[styles.deleteBtn, { marginTop: 10 }]}
                      onPress={() => deleteSingle(detail)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                      <Text style={styles.deleteText}> Eliminar registro</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.closeBtn, { marginTop: 8 }]}
                    onPress={() => setDetail(null)}
                  >
                    <Text style={styles.closeText}>Cerrar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <ActivityIndicator />
              )}
            </View>
          </View>
        </Modal>

        <RateModal
          visible={rateModal}
          onClose={() => setRateModal(false)}
          onUp={() => finalizeWithRating(detail, "up")}
          onDown={() => finalizeWithRating(detail, "down")}
          title="Califica tu experiencia"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, backgroundColor: "#fff" },
  pageTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0a58ca",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 4,
    letterSpacing: 0.3,
  },

  // Banner informativo (pastel)
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#eef2f7",
  },
  infoText: { color: "#6b7a90", marginLeft: 8, fontSize: 12, flex: 1 },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    marginTop: 6,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  smallBtnText: { color: "#fff", fontWeight: "800" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  rateBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  line: { fontSize: 13, color: "#333", marginBottom: 4 },
  bold: { fontWeight: "700" },
  desc: {
    fontSize: 13,
    color: "#333",
    backgroundColor: "#fafafa",
    padding: 10,
    borderRadius: 8,
  },

  finishBtn: {
    flexDirection: "row",
    backgroundColor: "#0d6efd",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  finishText: { color: "#fff", fontWeight: "800" },

  cancelBtn: {
    flexDirection: "row",
    backgroundColor: "#dc3545",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#fff", fontWeight: "800" },

  deleteBtn: {
    flexDirection: "row",
    backgroundColor: "#6c757d",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#fff", fontWeight: "800" },

  rateBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flex: 1,
    justifyContent: "center",
  },
  rateText: { color: "#fff", fontWeight: "800" },

  closeBtn: {
    backgroundColor: "#6c757d",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  closeText: { color: "#fff", fontWeight: "800" },
});
