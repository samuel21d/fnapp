const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// ⚠️ Correo admin autorizado (el que me diste)
const ADMIN_EMAILS = ["cconjuntoresidencialfn@gmail.com"];

/**
 * Semilla: marca como admin al usuario con el correo autorizado.
 * Llamada: httpsCallable("ensureAdminSeed", ...)
 */
exports.ensureAdminSeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const callerUid = context.auth.uid;
  const caller = await admin.auth().getUser(callerUid);
  const callerEmail = (caller.email || "").toLowerCase();

  if (!ADMIN_EMAILS.includes(callerEmail)) {
    throw new functions.https.HttpsError("permission-denied", "Solo el correo administrador puede ejecutar esto.");
  }

  // Puedes pasar { email } o, si no pasas nada, se usa el propio admin
  const targetEmail = String(data?.email || callerEmail).toLowerCase();

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(targetEmail);
  } catch {
    throw new functions.https.HttpsError("not-found", `No existe un usuario con email ${targetEmail}.`);
  }

  await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
  await admin.firestore().doc(`users/${userRecord.uid}`).set(
    {
      isAdmin: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, uid: userRecord.uid };
});

/**
 * Crea un usuario en Auth y su perfil en Firestore (solo admin).
 * Llamada: httpsCallable("createUserViaAdmin", { email, password, displayName, apartment, phone?, isResident? })
 */
exports.createUserViaAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (!context.auth.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Solo administradores.");
  }

  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "").trim();
  const displayName = String(data.displayName || "").trim();
  const apartment = String(data.apartment || "").trim();
  const phone = String(data.phone || "").trim();
  const isResident = data.isResident === false ? false : true;

  if (!email || !password || !displayName || !apartment) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "email, password, displayName y apartment son obligatorios."
    );
  }
  if (password.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "La contraseña debe tener al menos 6 caracteres.");
  }

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      phoneNumber: phone || undefined,
    });
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      userRecord = await admin.auth().getUserByEmail(email);
    } else {
      throw new functions.https.HttpsError("internal", e.message || "Error creando usuario.");
    }
  }

  await admin.firestore().doc(`users/${userRecord.uid}`).set(
    {
      displayName,
      isResident,
      apartment,
      phone,
      bio: "",
      recommendedCount: 0,
      notRecommendedCount: 0,
      instagramEnabled: false,
      instagramUrl: "",
      whatsappEnabled: false,
      whatsappNumber: "",
      otherEnabled: false,
      otherUrl: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, uid: userRecord.uid };
});

/**
 * Actualiza perfil de un usuario (solo campos de admin como apartment, displayName, etc.)
 * Llamada: httpsCallable("adminUpdateUserProfile", { uid, displayName?, apartment?, phone?, isResident? })
 */
exports.adminUpdateUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (!context.auth.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Solo administradores.");
  }

  const uid = String(data.uid || "").trim();
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid es obligatorio.");
  }

  const toUpdate = {};
  if (typeof data.displayName === "string") toUpdate.displayName = data.displayName.trim();
  if (typeof data.apartment === "string") toUpdate.apartment = data.apartment.trim();
  if (typeof data.phone === "string") toUpdate.phone = data.phone.trim();
  if (typeof data.isResident === "boolean") toUpdate.isResident = data.isResident;

  if (!Object.keys(toUpdate).length) {
    throw new functions.https.HttpsError("invalid-argument", "Nada para actualizar.");
  }

  toUpdate.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await admin.firestore().doc(`users/${uid}`).set(toUpdate, { merge: true });

  if (toUpdate.displayName) {
    await admin.auth().updateUser(uid, { displayName: toUpdate.displayName }).catch(() => {});
  }

  return { ok: true };
});
