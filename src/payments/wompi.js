// src/payments/wompi.js
import { Linking } from "react-native";
import { doc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const WOMPI_BASE = "https://production.wompi.co/v1";
const PREMIUM_AMOUNT_CENTS = 990000; // <-- tu precio en centavos
const WOMPI_MERCHANT_ID = "xxx_merchant_id_de_tu_cuenta"; // opcional para validar

function daysFromNow(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d;
}

export async function verifyWompiTxAndActivatePremium(txId) {
  // 1) Consultar transacción en Wompi
  const res = await fetch(`${WOMPI_BASE}/transactions/${encodeURIComponent(txId)}`);
  if (!res.ok) throw new Error("No se pudo consultar la transacción");
  const { data } = await res.json();

  // 2) Validaciones mínimas (ajusta a tu gusto)
  const ok =
    data &&
    data.status === "APPROVED" &&
    data.amount_in_cents === PREMIUM_AMOUNT_CENTS &&
    data.currency === "COP" &&
    (!WOMPI_MERCHANT_ID || data.merchant && data.merchant.id === WOMPI_MERCHANT_ID);

  if (!ok) throw new Error("Transacción inválida o no aprobada");

  // 3) Activar Premium por 365 días
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");

  const expiresAt = daysFromNow(365);
  await updateDoc(doc(db, "users", user.uid), {
    premiumActivatedAt: serverTimestamp(),
    premiumExpiresAt: expiresAt,
    premiumLastTxId: txId,
    updatedAt: new Date(),
  });

  // 4) (opcional) Guarda un registro del pago
  await setDoc(doc(db, "users", user.uid, "payments", txId), {
    provider: "wompi",
    status: "APPROVED",
    amount_in_cents: data.amount_in_cents,
    reference: data.reference,
    payment_method_type: data.payment_method_type,
    createdAt: serverTimestamp(),
  });
}

// Llama esto una vez (App.js o pantalla de gracias)
export function attachWompiDeepLinkListener() {
  const handle = ({ url }) => {
    // esperado: fnapp://premium/thanks?id=<TX_ID>
    const q = new URL(url).searchParams;
    const txId = q.get("id");
    if (txId) verifyWompiTxAndActivatePremium(txId).catch(() => {});
  };
  Linking.addEventListener("url", handle);
  // por si la app ya viene abierta por el deep link:
  Linking.getInitialURL().then((u) => u && handle({ url: u }));
  return () => Linking.removeAllListeners("url");
}
