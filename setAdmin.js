// setAdmin.js
const admin = require("firebase-admin");
const path = require("path");

// Ajusta el nombre si tu JSON se llama distinto
const serviceAccount = require(path.join(
  __dirname,
  "servicios-florida-norteamerica-firebase-adminsdk-fbsvc-93776f935e.json"
));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: node setAdmin.js <correo-del-usuario>");
    process.exit(1);
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`✅ Claim admin=true asignado a ${email} (uid: ${user.uid})`);
    console.log("Importante: ese usuario debe cerrar sesión y volver a iniciar.");
  } catch (e) {
    console.error("❌ Error asignando claim:", e.message || e);
    process.exit(1);
  }
}

main();
