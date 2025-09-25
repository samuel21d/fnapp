// app.config.js
module.exports = {
  expo: {
    name: "FN App",
    slug: "servicios-florida-norteamerica",
    version: "1.6.2",                // ← versión visible (versionName)
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,

    // Desactivamos OTA temporalmente para validar que el binario trae los cambios
    updates: { enabled: false },

    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.conjuntofn.serviciosfloridanorteamerica",
	  buildNumber: "1",
	  googleServicesFile: "./GoogleService-Info.plist", // 👈 importante
      infoPlist: {
        NSUserNotificationUsageDescription:
          "Usamos notificaciones para avisarte de nuevas solicitudes y mensajes.",
      },
    },

    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
        // "foregroundImage": "./assets/icon-foreground.png",
        // "backgroundImage": "./assets/icon-bg.png",
        // "monochromeImage": "./assets/icon-mono.png"
      },
      edgeToEdgeEnabled: true,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      package: "com.conjuntofn.serviciosfloridanorteamerica",
      // ❌ En remoto NO se define versionCode aquí; EAS lo maneja
      permissions: [
        "com.google.android.gms.permission.AD_ID",
        "android.permission.POST_NOTIFICATIONS",
        "com.android.vending.BILLING"
      ],
    },

    plugins: [
      "expo-asset",
      "./app.plugin.js",
      "expo-font",
      ["expo-notifications", { mode: "production" }],
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 24,
            targetSdkVersion: 35,
            compileSdkVersion: 35,
            // buildToolsVersion: "35.0.0",
            kotlinVersion: "2.0.21"
          }
        }
      ]
    ],

    web: { favicon: "./assets/favicon.png" },

    extra: {
      eas: {
        // projectId: "455d689e-2011-40dc-b5b2-6094b4d6153d", // cconjuntoresidencialfn@gmail.com
        //projectId: "c7bb40ec-7156-436d-abd9-0479d610141b",   // samuel21d@gmail.com
		projectId: "933e283d-3a80-4e2b-a2f4-2ee2dc350e69",   // robot31dc@gmail.com
      },
      cloudinary: {
        cloudName: "dhv4mtuol",
        uploadPreset: "fnappcloudinary", // debe ser unsigned
      },
   // ⬇️ Suscripción Android (Billing v5)
   androidSubSku: "premium_year",   // productId de la suscripción
   androidBasePlanId: "yearlyprepagado",     // basePlanId que creaste en Play Console
    },

    // owner: "conjuntofn",
    //owner: "samuel21d",
	owner: "robot31dc",
  },
};
