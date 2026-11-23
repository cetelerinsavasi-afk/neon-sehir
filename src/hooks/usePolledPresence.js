import { useMemo } from 'react';
import { useOccCounts } from '../lib/occupancy';

// =============================================================================
// "Mekanda/evde kaç kişi var" sayıları — SADECE Realtime Database (occ, v138).
// v188: Firestore yedek yolları kaldırıldı. Eskiden RTDB sayıları gelmezse istemci önce
// stats/presence belgesini dinliyor, o da 15 dk'dan eskiyse 30 sn'de bir park/iç mekân/ev
// presence koleksiyonlarından 400'e kadar belge okuyordu. Artık RTDB yoksa (bağlantı
// kurulamadı) liste boş döner — ekranlar sayı göstermez. RTDB'ye geç bağlanılırsa sayılar
// geldiği an görünür. Firestore okuması YOK.
// Dönen liste, eski kullanımla uyumlu "kişi başına bir kayıt" dizisidir:
//   parkPresence → [{ uid }], interiorPresence → [{ uid, locationId }],
//   housePresence → [{ uid, houseId }]
// =============================================================================

// v138 — RTDB (occ) sayıları: anında ve doğru; Firestore okuması yok (bkz. lib/occupancy.js)
function synthOcc(collectionName, counts, max) {
  const out = [];
  const push = (n, extra, prefix) => {
    for (let i = 0; i < n && out.length < max; i++) out.push({ uid: `${prefix}#${i}`, ...extra });
  };
  for (const [key, n] of Object.entries(counts)) {
    if (collectionName === 'parkPresence' && key === 'park') push(n, {}, 'p');
    else if (collectionName === 'interiorPresence' && key.startsWith('i~')) push(n, { locationId: key.slice(2) }, key);
    else if (collectionName === 'housePresence' && key.startsWith('h~')) push(n, { houseId: key.slice(2) }, key);
  }
  return out;
}

export function usePolledPresence(collectionName, { enabled = true, max = 300 } = {}) {
  const occ = useOccCounts(enabled);
  const fromOcc = useMemo(() => (occ ? synthOcc(collectionName, occ, max) : null), [occ, collectionName, max]);
  if (!enabled || !fromOcc) return EMPTY; // kapalı · RTDB yükleniyor · RTDB yok
  return fromOcc;
}
const EMPTY = [];
