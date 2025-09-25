// Catálogo extendido de servicios + utilidades
export const SERVICE_CATALOG = [
  // Hogar & mantenimiento
  { id: "plomeria", name: "Plomería", icon: "water-outline", color: "#0a58ca", area: "hogar", tags:["plomero","tubería","fugas"] },
  { id: "electricidad", name: "Electricidad", icon: "flash-outline", color: "#f59e0b", area: "hogar", tags:["electricista","tomacorriente"] },
  { id: "carpinteria", name: "Carpintería", icon: "construct-outline", color: "#8a5a44", area: "hogar", tags:["madera","closet"] },
  { id: "pintura", name: "Pintura", icon: "color-palette-outline", color: "#c2410c", area: "hogar", tags:["pintor","esmaltar"] },
  { id: "cerrajeria", name: "Cerrajería", icon: "key-outline", color: "#0f766e", area: "hogar", tags:["llaves","puertas"] },
  { id: "remodelacion", name: "Remodelación", icon: "business-outline", color: "#7c3aed", area: "hogar", tags:["obra","albañil"] },
  { id: "impermeabilizacion", name: "Impermeabilización", icon: "umbrella-outline", color: "#2563eb", area: "hogar" },
  { id: "jardineria", name: "Jardinería", icon: "leaf-outline", color: "#16a34a", area: "hogar" },
  { id: "aseo", name: "Aseo / Limpieza", icon: "home-outline", color: "#0ea5e9", area: "hogar" },
  { id: "fumigacion", name: "Fumigación", icon: "bug-outline", color: "#dc2626", area: "hogar" },
  { id: "soldadura", name: "Soldadura", icon: "hammer-outline", color: "#6b7280", area: "hogar" },
  { id: "vidrieria", name: "Vidriería", icon: "cube-outline", color: "#0891b2", area: "hogar" },

  // Mascotas
  { id: "veterinaria", name: "Veterinaria", icon: "medkit-outline", color: "#16a34a", area: "mascotas" },
  { id: "cuidado_perros", name: "Cuidadores de perro", icon: "paw-outline", color: "#10b981", area: "mascotas", tags:["guardería","pet sitter"] },
  { id: "paseadores", name: "Paseadores", icon: "walk-outline", color: "#22c55e", area: "mascotas" },
  { id: "peluqueria_pet", name: "Grooming / Peluquería", icon: "cut-outline", color: "#06b6d4", area: "mascotas" },
  { id: "pet_shop", name: "Pet Shop", icon: "basket-outline", color: "#65a30d", area: "mascotas" },

  // Transporte & movilidad
  { id: "transporte", name: "Transporte", icon: "car-outline", color: "#2563eb", area: "movilidad" },
  { id: "mensajeria", name: "Mensajería", icon: "bicycle-outline", color: "#64748b", area: "movilidad" },
  { id: "trasteos", name: "Trasteos / Mudanzas", icon: "cube-outline", color: "#a855f7", area: "movilidad" },
  { id: "mecanica", name: "Mecánica", icon: "settings-outline", color: "#ef4444", area: "movilidad" },
  { id: "lavado_vehiculo", name: "Lavado de vehículo", icon: "water-outline", color: "#0284c7", area: "movilidad" },

  // Gastronomía & eventos
  { id: "restaurante", name: "Restaurante", icon: "restaurant-outline", color: "#fb7185", area: "eventos" },
  { id: "pasteleria", name: "Pastelería", icon: "ice-cream-outline", color: "#f43f5e", area: "eventos" },
  { id: "chef_casa", name: "Chef a domicilio", icon: "fast-food-outline", color: "#f97316", area: "eventos" },
  { id: "banquetes", name: "Banquetes / Eventos", icon: "people-outline", color: "#ea580c", area: "eventos" },
  { id: "fotografia", name: "Fotografía", icon: "camera-outline", color: "#22d3ee", area: "eventos" },
  { id: "video", name: "Video / Dron", icon: "videocam-outline", color: "#14b8a6", area: "eventos" },
  { id: "musica", name: "Música / Djs", icon: "musical-notes-outline", color: "#eab308", area: "eventos" },

  // Salud, belleza & educación
  { id: "barberia", name: "Barbería / Peluquería", icon: "cut-outline", color: "#ef4444", area: "bienestar" },
  { id: "estetica", name: "Estética / Spa", icon: "sparkles-outline", color: "#f472b6", area: "bienestar" },
  { id: "entrenador", name: "Entrenador personal", icon: "barbell-outline", color: "#0ea5e9", area: "bienestar" },
  { id: "tutorias", name: "Tutorías / Clases", icon: "school-outline", color: "#06b6d4", area: "bienestar" },
  { id: "cuidado_ninos", name: "Cuidado de niños", icon: "happy-outline", color: "#f59e0b", area: "bienestar" },
  { id: "enfermeria", name: "Enfermería", icon: "medkit-outline", color: "#10b981", area: "bienestar" },

  // Tecnología & profesionales
  { id: "soporte_it", name: "Soporte técnico", icon: "desktop-outline", color: "#3b82f6", area: "profesionales" },
  { id: "desarrollo_web", name: "Desarrollo Web", icon: "globe-outline", color: "#60a5fa", area: "profesionales" },
  { id: "marketing", name: "Marketing / Redes", icon: "megaphone-outline", color: "#f59e0b", area: "profesionales" },
  { id: "contabilidad", name: "Contabilidad", icon: "calculator-outline", color: "#4b5563", area: "profesionales" },
  { id: "abogacia", name: "Abogacía", icon: "briefcase-outline", color: "#374151", area: "profesionales" },

  // Comercio & varios
  { id: "sastreria", name: "Sastrería", icon: "shirt-outline", color: "#9a3412", area: "comercio" },
  { id: "papeleria", name: "Papelería", icon: "document-text-outline", color: "#334155", area: "comercio" },
  { id: "ferreteria", name: "Ferretería", icon: "construct-outline", color: "#6b7280", area: "comercio" },
  { id: "otros", name: "Otros", icon: "hammer-outline", color: "#475569", area: "otros" },
];

// Map rápido por id
const MAP = SERVICE_CATALOG.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

// === Helpers ===
export const getServiceById = (id) => MAP[id] || null;
export const getIconById = (id, fallback = "hammer-outline") => (MAP[id]?.icon || fallback);

// Dado un nombre libre (p. ej. lo que el usuario teclea), adivina icono
export function iconForServiceName(name = "", fallback = "hammer-outline") {
  const n = name.toLowerCase();
  const match =
    (n.includes("plomer")) ? "water-outline" :
    (n.includes("electric")) ? "flash-outline" :
    (n.includes("carpinter")) ? "construct-outline" :
    (n.includes("pintu")) ? "color-palette-outline" :
    (n.includes("cerraj")) ? "key-outline" :
    (n.includes("remodel") || n.includes("obra")) ? "business-outline" :
    (n.includes("imperme")) ? "umbrella-outline" :
    (n.includes("jardin")) ? "leaf-outline" :
    (n.includes("aseo") || n.includes("limp")) ? "home-outline" :
    (n.includes("fumi") || n.includes("plaga")) ? "bug-outline" :
    (n.includes("solda")) ? "hammer-outline" :
    (n.includes("vidrier")) ? "cube-outline" :
    (n.includes("vet") || n.includes("enfermer")) ? "medkit-outline" :
    (n.includes("perro") || n.includes("pet") || n.includes("mascot")) ? "paw-outline" :
    (n.includes("pasea")) ? "walk-outline" :
    (n.includes("groom") || n.includes("peluquer") && n.includes("pet")) ? "cut-outline" :
    (n.includes("transpor") || n.includes("taxi")) ? "car-outline" :
    (n.includes("mensaje") || n.includes("domic")) ? "bicycle-outline" :
    (n.includes("traste") || n.includes("mudan")) ? "cube-outline" :
    (n.includes("mecani")) ? "settings-outline" :
    (n.includes("lavado") && n.includes("veh")) ? "water-outline" :
    (n.includes("restaura") || n.includes("comida")) ? "restaurant-outline" :
    (n.includes("pastel") || n.includes("repost")) ? "ice-cream-outline" :
    (n.includes("chef")) ? "fast-food-outline" :
    (n.includes("banque") || n.includes("evento")) ? "people-outline" :
    (n.includes("foto")) ? "camera-outline" :
    (n.includes("video") || n.includes("dron")) ? "videocam-outline" :
    (n.includes("musi") || n.includes("dj")) ? "musical-notes-outline" :
    (n.includes("barber") || (n.includes("peluquer") && !n.includes("pet"))) ? "cut-outline" :
    (n.includes("spa") || n.includes("estet")) ? "sparkles-outline" :
    (n.includes("entren")) ? "barbell-outline" :
    (n.includes("tutor") || n.includes("clase") || n.includes("curso")) ? "school-outline" :
    (n.includes("niñ") || n.includes("cuidado de niños") || n.includes("babysi")) ? "happy-outline" :
    (n.includes("it") || n.includes("soporte") || n.includes("tecnic")) ? "desktop-outline" :
    (n.includes("web") || n.includes("sitio")) ? "globe-outline" :
    (n.includes("market") || n.includes("redes")) ? "megaphone-outline" :
    (n.includes("contab")) ? "calculator-outline" :
    (n.includes("abog")) ? "briefcase-outline" :
    (n.includes("sastr")) ? "shirt-outline" :
    (n.includes("papel")) ? "document-text-outline" :
    (n.includes("ferreter")) ? "construct-outline" :
    null;

  return match || fallback;
}

// Agrupar por área para renderizar secciones, filtros, etc.
export function groupByArea(list = SERVICE_CATALOG) {
  return list.reduce((acc, s) => {
    acc[s.area] = acc[s.area] || [];
    acc[s.area].push(s);
    return acc;
  }, {});
}
