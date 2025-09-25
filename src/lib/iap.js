// src/lib/iap.js
import * as IAP from 'expo-iap';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PRODUCT_ID = Constants?.expoConfig?.extra?.productIdPremium || 'premium_365';

// Conexión IAP
export async function iapConnect() {
  if (Platform.OS !== 'android') return;
  try {
    await IAP.connectAsync();
  } catch (e) {
    // Silenciar: Play Billing puede estar no disponible en emulador
    console.log('[IAP] connect error', e?.message);
  }
}

export async function iapDisconnect() {
  try {
    await IAP.disconnectAsync();
  } catch {}
}

export async function fetchPremiumProduct() {
  // Producto de tipo "inapp" (compra única)
  const list = [PRODUCT_ID];
  const res = await IAP.getProductsAsync(list);
  // `expo-iap` devuelve un array de productos
  // Aseguramos encontrar el correcto:
  const prod = Array.isArray(res) ? res.find(p => p.productId === PRODUCT_ID) : undefined;
  return prod || (Array.isArray(res?.results) ? res.results.find(p => p.productId === PRODUCT_ID) : undefined);
}

export async function requestPremiumPurchase() {
  // Lanza la compra del producto de compra única
  return IAP.purchaseItemAsync(PRODUCT_ID);
}

// IMPORTANTE para Android: reconocer/acknowledge la compra
export async function finalizePurchase(purchase) {
  // Para compra NO consumible (one-time), NO consumas; solo reconoce/acknowledge.
  // En expo-iap esto se hace con finishTransactionAsync(purchase, consume=false)
  try {
    await IAP.finishTransactionAsync(purchase, false);
  } catch (e) {
    console.log('[IAP] finishTransaction error', e?.message);
  }
}
