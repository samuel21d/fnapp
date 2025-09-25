// src/utils/historySweeper.js
import {
  collection, query, where, getDocs, writeBatch, Timestamp,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const TERMINAL = ["finalizada", "rechazada", "cancelada"];

/** Marca terminal más confiable disponible en el doc */
function pickTerminalTime(d) {
  const t =
    d.terminalAt ||
    d.finalizedAt ||
    d.rejectedAt ||
    d.canceledAt ||
    d.acceptedAt ||   // última opción “segura” si no hay otras
    d.createdAt;      // ultimísimo fallback
  return t || null;
}

/**
 * Barrido por días (azúcar).
 */
export async function sweepOldHistoryForCurrentUser(days = 7) {
  const minutes = days * 24 * 60;
  return sweepOldHistoryForCurrentUserMinutes(minutes);
}

/**
 * Barrido por minutos:
 * - Intenta query con terminalAt (rápida, requiere índice compuesto).
 * - Si falla por índice, fallback: trae por usuario y filtra en cliente por marca terminal.
 */
export async function sweepOldHistoryForCurrentUserMinutes(minutes = 10) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const cutoff = Timestamp.fromMillis(Date.now() - minutes * 60 * 1000);
  const roles = [
    { field: "fromUserUid", uid }, // mis salientes
    { field: "toUserUid", uid },   // mis entrantes
  ];

  for (const role of roles) {
    // 1) Intento rápido: requiere índice compuesto (role.field + terminalAt)
    try {
      const qFast = query(
        collection(db, "requests"),
        where(role.field, "==", uid),
        where("terminalAt", "<=", cutoff)
      );
      const fastSnap = await getDocs(qFast);

      let countFast = 0;
      if (!fastSnap.empty) {
        let batch = writeBatch(db);
        for (const docSnap of fastSnap.docs) {
          const data = docSnap.data() || {};
          if (!TERMINAL.includes(data.status)) continue; // red de seguridad
          batch.delete(docSnap.ref);
          countFast++;
          if (countFast % 450 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }
        if (countFast) await batch.commit();
      }
      // Si llegamos aquí sin error, pasamos al siguiente rol
      continue;
    } catch (e) {
      // Si no es error de índice, loguea y sigue con fallback igual
      if (e?.code !== "failed-precondition") {
        // console.warn("sweep fast query error:", e?.message || e);
      }
    }

    // 2) Fallback sin índice: trae por usuario y filtra en cliente
    try {
      const qAllByUser = query(
        collection(db, "requests"),
        where(role.field, "==", uid)
      );
      const allSnap = await getDocs(qAllByUser);
      if (allSnap.empty) continue;

      let toDelete = [];
      for (const docSnap of allSnap.docs) {
        const data = docSnap.data() || {};
        if (!TERMINAL.includes(data.status)) continue;
        const t = pickTerminalTime(data);
        if (!t) continue; // no hay marca temporal confiable; no borres
        // compara con cutoff
        const ms = typeof t.toMillis === "function" ? t.toMillis() : null;
        if (ms && ms <= cutoff.toMillis()) {
          toDelete.push(docSnap.ref);
        }
      }

      if (toDelete.length) {
        let batch = writeBatch(db);
        for (let i = 0; i < toDelete.length; i++) {
          batch.delete(toDelete[i]);
          if ((i + 1) % 450 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }
        await batch.commit();
      }
      // console.log(`sweep fallback: ${toDelete.length} eliminados para ${role.field}`);
    } catch (e) {
      // console.warn("sweep fallback error:", e?.message || e);
    }
  }
}
