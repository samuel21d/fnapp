// src/utils/premium.js
export function getPremiumInfo(profile) {
  const raw = profile?.premiumExpiresAt;
  const expiresMs = raw?.toMillis ? raw.toMillis() : raw ? Date.parse(raw) : 0;
  const now = Date.now();
  const active = !!expiresMs && expiresMs > now;
  const daysLeft = active ? Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24)) : 0;
  const limit = active ? 10 : 2; // 👈 límite por plan
  return { active, daysLeft, limit, expiresMs };
}
