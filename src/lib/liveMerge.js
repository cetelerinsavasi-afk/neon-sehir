// v79 — canlı konum birleştirme (saf fonksiyonlar; bkz. liveNet.js)
export const LIVE_KEYS = ['x', 'y', 'z', 'facing', 'pose', 'seat', 'left', 'emote', 'emoteTs'];

// Firestore kaydının üstüne (daha yeniyse) canlı konumu bindirir.
// fsMs: Firestore updatedAt (ms). Saat farkı toleransı 1,5 sn.
export function mergeLive(doc, live, fsMs) {
  if (!live || !Number.isFinite(Number(live.t))) return doc;
  if (Number(live.t) + 1500 < fsMs) return doc;
  const out = { ...doc };
  for (const k of LIVE_KEYS) if (k in live) out[k] = live[k];
  // RTDB null alanı saklamaz: canlı kayıtta olmayan seat/emote "yok" demektir
  if (!('seat' in live) && 'seat' in doc) out.seat = null;
  return out;
}
