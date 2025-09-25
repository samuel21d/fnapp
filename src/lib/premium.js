// src/lib/premium.js
import { db } from '../firebaseConfig';
import {
  doc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Extiende N días desde la fecha mayor entre ahora y el valor actual
export async function extendPremium(uid, days = 365) {
  const ref = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const now = new Date();
    const current = snap.exists() && snap.data()?.premiumExpiresAt
      ? snap.data().premiumExpiresAt.toDate?.() ?? new Date(snap.data().premiumExpiresAt)
      : null;

    const base = current && current > now ? current : now;
    const newDate = new Date(base.getTime() + days * ONE_DAY_MS);
    tx.set(ref, { premiumExpiresAt: Timestamp.fromDate(newDate) }, { merge: true });
  });
}
