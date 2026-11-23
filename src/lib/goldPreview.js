// v193 — CANLI ALTIN: borsada düğmeye bastıkça (istek sunucuya ~0,8 sn sonra toplu gider) telefonun üstündeki
// altın da hemen azalsın / artsın. Bekleyen tutar burada tutulur; üst çubuk (PhoneScreen) ekler.
// Sunucu cevabı gelip oyuncu belgesi güncellenince borsa ekranı farkı sıfırlar. Ağ / Firestore yok.
import { useSyncExternalStore } from 'react';

let delta = 0;
const subs = new Set();
export function setGoldPreview(d) {
  const v = Number.isFinite(d) ? Math.round(d) : 0;
  if (v === delta) return;
  delta = v;
  subs.forEach((f) => f());
}
const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useGoldPreview = () => useSyncExternalStore(subscribe, () => delta, () => 0);
