// src/utils/cloudinary.js
import Constants from "expo-constants";

// Sube 1 imagen (uri local) -> devuelve secure_url de Cloudinary
export async function uploadToCloudinary(uri, fileName = "upload.jpg") {
  const cloudName =
    Constants?.expoConfig?.extra?.cloudinary?.cloudName ??
    Constants?.manifest?.extra?.cloudinary?.cloudName;
  const uploadPreset =
    Constants?.expoConfig?.extra?.cloudinary?.uploadPreset ??
    Constants?.manifest?.extra?.cloudinary?.uploadPreset;

  if (!cloudName || !uploadPreset) {
    throw new Error("Falta configuración de Cloudinary (cloudName / uploadPreset).");
  }

  const data = new FormData();
  data.append("file", {
    uri,
    type: "image/jpeg",
    name: fileName,
  });
  data.append("upload_preset", uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: data,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || "Falló la subida a Cloudinary");
  }
  return json.secure_url;
}
