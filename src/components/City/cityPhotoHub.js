// v147 — açık olan şehir motoru (varsa). Şehir açıkken Sixtagram'daki şehir
// fotoğrafları ikinci bir 3D sahne kurmadan bu motorla çizilir (telefon belleği).
// Bu dosya three.js içermez — Sixtagram akışı şehir kodunu sadece şehir
// fotoğrafı görünce yükler.
let live = null;
const subs = new Set();
export function setLiveCityEngine(e) {
  live = e || null;
  subs.forEach((f) => f(live));
}
export const getLiveCityEngine = () => live;
export function onLiveCityChange(f) {
  subs.add(f);
  return () => subs.delete(f);
}
