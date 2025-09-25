// src/utils/notifications.js

/**
 * Envía una notificación push usando el servicio de Expo.
 * @param {string} to Expo push token (p.ej. "ExponentPushToken[...]")
 * @param {{title?: string, body?: string, data?: object, sound?: "default"|null}} payload
 * @returns {Promise<boolean>} true si la petición HTTP fue aceptada por el servicio
 */
export async function sendExpoPush(
  to,
  { title, body, data = {}, sound = "default" } = {}
) {
  try {
    if (!to || !(to.startsWith("ExponentPushToken") || to.startsWith("ExpoPushToken"))) {
      return false;
    }

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, title, body, data, sound })
    });

    return res.ok;
  } catch (e) {
    console.warn("sendExpoPush error:", e?.message || e);
    return false;
  }
}
