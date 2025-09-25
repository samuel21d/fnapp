// src/lib/billingSupport.js
import { Platform } from "react-native";
import * as IAP from "react-native-iap";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import Constants from "expo-constants";

export async function fetchLocalPurchaseEvidence(PRODUCT_ID) {
  try {
    const avail = await IAP.getAvailablePurchases();           // iOS/Android
    const hist  = Platform.OS === "android" ? (await IAP.getPurchaseHistory()) : [];
    const all   = [...(avail || []), ...(hist || [])];

    // Normaliza y filtra por PRODUCT_ID
    const items = all
      .filter(p => p?.productId === PRODUCT_ID)
      .map(p => normalizePurchaseRecord(p))
      // Elimina duplicados por purchaseToken/orderId si vienen de ambos arrays
      .reduce((acc, it) => {
        const key = `${it.purchaseToken || ""}|${it.orderId || ""}`;
        if (!acc._seen.has(key)) { acc._seen.add(key); acc.list.push(it); }
        return acc;
      }, { _seen: new Set(), list: [] }).list;

    // Ordenamos por fecha desc
    items.sort((a, b) => (b.purchaseTime || 0) - (a.purchaseTime || 0));
    return items;
  } catch (e) {
    console.warn("fetchLocalPurchaseEvidence error:", e);
    return [];
  }
}

function normalizePurchaseRecord(p) {
  // RN-IAP v13: Android: transactionReceipt JSON con orderId, purchaseToken, purchaseTime, etc.
  let receiptJson = null;
  try { receiptJson = p?.transactionReceipt ? JSON.parse(p.transactionReceipt) : null; } catch {}
  const orderId       = p?.transactionId || receiptJson?.orderId || null;
  const purchaseToken = p?.purchaseToken || receiptJson?.purchaseToken || null;
  const purchaseTime  = Number(p?.transactionDate || receiptJson?.purchaseTime || 0);
  return {
    productId: p?.productId || null,
    orderId,
    purchaseToken,
    purchaseTime, // ms epoch
  };
}

export function buildDeviceInfo() {
  const app = (Constants?.expoConfig || Constants?.manifest || {});
  return {
    os: Platform.OS,
    osVersion: String(Platform.Version ?? ""),
    appName: app.name ?? "FN App",
    appSlug: app.slug ?? "",
    appVersion: app.version ?? "",
    runtime: "expo",
  };
}

export async function sendPurchaseReviewTicket(db, {
  uid, productId, orderId, purchaseToken, purchaseTime, deviceInfo, note = null
}) {
  const payload = {
    uid,
    productId,
    orderId: orderId || null,
    purchaseToken: purchaseToken || null,
    purchaseTime: purchaseTime || null,
    deviceInfo: deviceInfo || buildDeviceInfo(),
    note: note || null,
    status: "pending",
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "billingPurchases"), payload);
  return { id: ref.id, ...payload };
}
