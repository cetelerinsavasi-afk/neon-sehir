// =============================================================================
// v155 — batı kıyısının şekli (three.js yok; şehir motoru, harita ve önizleme paylaşır)
// =============================================================================
import { KORDON_X } from './cityLayout.js';

export const SEA_Y = -0.6;
export const ss = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- KIYI ÇİZGİSİ + ZEMİN YÜKSEKLİĞİ ---------------------------------------------------
// Burun (kayalık) ve koylar; limana yakın kordon doğrudan denize iner (rıhtım duvarı).
export const HEADLAND = { z: -62, len: 24, w: 13 };
export function shoreX(z) {
  let sx = -152 + 4 * Math.sin(z / 17) + 3 * Math.sin(z / 41 + 2);
  sx -= HEADLAND.len * Math.exp(-(((z - HEADLAND.z) / HEADLAND.w) ** 2));
  if (z < -184) sx -= (-184 - z) * 0.22 + 6 * Math.sin(z / 53); // şehrin kuzeyinde kıyı batıya kıvrılır
  return sx + (KORDON_X - 0.2 - sx) * ss(58, 76, z); // limana doğru rıhtım duvarı
}
// kaya kütlesi (burun): 0..1
function rockiness(x, z) {
  const k = Math.exp(-(((z - HEADLAND.z) / (HEADLAND.w * 0.9)) ** 2));
  const sx = shoreX(z);
  return k * ss(-140, -150, x) * ss(sx - 7, sx + 1, x);
}
// batı kıyısı zemin yüksekliği (x < COAST_X). Kumsal kordondan denize iner, denizde derinleşir.
export function coastH(x, z) {
  const sx = shoreX(z);
  let h;
  if (x >= sx) {
    const t = Math.max(0, Math.min(1, (KORDON_X - x) / Math.max(1, KORDON_X - sx)));
    h = -0.12 - 0.48 * Math.pow(t, 1.25);
  } else {
    h = SEA_Y - Math.min(7, (sx - x) * 0.075);
  }
  const r = rockiness(x, z);
  if (r > 0.02) {
    const n = Math.sin(x * 0.7 + z * 0.3) * 0.5 + Math.sin(x * 0.23 - z * 0.9) * 0.6 + Math.sin(z * 1.7) * 0.3;
    h = Math.max(h, -1.2 + r * (3.4 + n));
  }
  return h;
}
export const isRock = (x, z) => rockiness(x, z) > 0.35 && coastH(x, z) > -0.3;
export const SEA = { y: SEA_Y };
