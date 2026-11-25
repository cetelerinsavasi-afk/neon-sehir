// v203 — bahisli yarışta ARABA BAŞINA bahis üst sınırı.
// Kural: bir araba, galerideki (vergisiz) fiyatının 1/10'u kadar bahisli yarışa girebilir.
//   Üstün Cabrio 1.000.000 → en fazla 100.000 · Klasik Tur Arabası 3.000 → en fazla 300
// Eski sabit 100.000 sınırı kaldırıldı. Fiyat HER ZAMAN katalogdan (sunucuda doğrulanır);
// geliştirme / modifiye / özel isim sınırı değiştirmez. Ek Firestore okuması YOK.
// Hem sunucu (functions/index.js) hem arayüz (RaceLobby.jsx) bunu kullanır.
import { VEHICLE_CATALOG } from './catalogData.js';
import { isCarId } from './vehicleKinds.js';

export const RACE_BET_CAP_DIVISOR = 10;

// Yarışa girebilen (araba) olmayan / bilinmeyen katalog → 0 (bahisli yarışa giremez).
export function raceBetCap(catalogId) {
  if (!isCarId(catalogId)) return 0;
  const price = Number(VEHICLE_CATALOG[Number(catalogId)]?.price) || 0;
  return Math.max(0, Math.floor(price / RACE_BET_CAP_DIVISOR));
}

// Bu araba bu bahisle (oda kurma ya da odaya katılma) yarışabilir mi?
export const canRaceForBet = (catalogId, betAmount) => {
  const cap = raceBetCap(catalogId);
  return cap > 0 && Number(betAmount) > 0 && Number(betAmount) <= cap;
};
