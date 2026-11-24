// =============================================================================
// homeGeometry.js — v196 3 KATLI EV: kat / merdiven / çatı geometrisi (sunucu + istemci ortak, saf)
// -----------------------------------------------------------------------------
// Prototipten (3 Katlı Ev Prototipi) alınan ölçüler. Oda yerel koordinatları: x ∈ [−9, 9], z ∈ [−7, 7]
// (ön duvar z = +7, kapı orada). Katlar: zemin yükseklikleri [0,16 · 3,76 · 7,36], duvar 3,4.
//   0 Giriş · 1 Üst kat · 2 Çatı katı (dar ve eğimli: x ∈ [−5,8, 5,8], tavan beşik çatı)
// İki merdiven: 0 → 1 (sol duvar boyunca, z yönünde), 1 → 2 (arka duvar boyunca, x yönünde).
// Merdivenin çıktığı kattaki boşluk (HOLE_1, HOLE_2) zemin değildir — oraya eşya konmaz.
// =============================================================================

export const FLOOR_Y = Object.freeze([0.16, 3.76, 7.36]);
export const FLOOR_NAMES = Object.freeze(['Giriş', 'Üst kat', 'Çatı katı']);
export const WALL_H = 3.4;
export const SLAB = 0.2; // kat döşemesi kalınlığı
export const HALF_W = 9; // x
export const HALF_D = 7; // z
export const ROOF_HALF_W = 5.8; // çatı katı
export const WALL_GAP = 0.1; // v197: zemin eşyasının merkezi duvara en az bu kadar uzak
export const ROOF_RISE = 5; // beşik çatı yüksekliği (GP + KP)
export const ROOF_SPAN = 9.8;
// rampa: ax = merdivenin ilerlediği eksen; d0 → d1 tabandan tepeye; c0..c1 diğer eksende genişlik
export const RAMPS = Object.freeze([
  Object.freeze({ ax: 'z', d0: 3.2, d1: -2.4, c0: -8.95, c1: -7.65, base: 0, top: 1 }),
  Object.freeze({ ax: 'x', d0: 4.6, d1: -1, c0: -6.95, c1: -5.65, base: 1, top: 2 }),
]);
// üst kattaki merdiven boşlukları (döşeme yok)
export const HOLE_1 = Object.freeze({ x0: -9, x1: -7.5, z0: -2.4, z1: 3.2 });
export const HOLE_2 = Object.freeze({ x0: -1, x1: 4.6, z0: -7, z1: -5.6 });
export const MAX_HOME_ITEMS = 400; // belge boyutu: eşya başına ~80 bayt → 400 eşya ≈ 32 KB (sınır 1 MB)
export const HOME_LIST_MIN_ITEMS = 10; // Evler listesi: 10+ mobilya (ya da içinde biri var)
export const HOME_IDLE_DAYS = 20; // 20 gün girmeyenin evi listede görünmez
// pencere stili (v196): win: { "<kat>_<duvar>_<sıra>": { m: model, c: renk } } — ücretsiz
export const WIN_MODEL_N = 4; // Klasik, Tek cam, Kafes, Panjurlu (istemci: houseFloors.js WIN_MODELS)
export const WIN_COLOR_N = 8; // istemci: houseFloors.js WIN_COLORS
export const WIN_ID_RE = /^[01]_[0-3]_[0-9]$/;
export function cleanWin(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw).slice(0, 40)) {
    if (!WIN_ID_RE.test(id) || !v || typeof v !== 'object') continue;
    const m = Number.isInteger(v.m) && v.m >= 0 && v.m < WIN_MODEL_N ? v.m : 0;
    const c = Number.isInteger(v.c) && v.c >= 0 && v.c < WIN_COLOR_N ? v.c : 0;
    if (m || c) out[id] = { m, c };
  }
  return out;
}
export const homeIdOf = (uid) => `home_${uid}`;
export const isHomeId = (id) => typeof id === 'string' && /^home_[A-Za-z0-9_-]{1,128}$/.test(id);
export const uidOfHome = (id) => (isHomeId(id) ? id.slice(5) : null);

const inBox = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
// rampa üzerindeki nokta: { t (0..1 ilerleme), inside }
export function rampAt(r, x, z) {
  const along = r.ax === 'z' ? z : x;
  const cross = r.ax === 'z' ? x : z;
  const t = (along - r.d0) / (r.d1 - r.d0);
  return { t, inside: t >= 0 && t <= 1 && cross > r.c0 && cross < r.c1 };
}
// (x, z)'de basılabilecek zemin yükseklikleri (kat döşemeleri + rampa)
export function groundsAt(x, z) {
  const out = [];
  if (Math.abs(x) > HALF_W || Math.abs(z) > HALF_D) return out;
  out.push(FLOOR_Y[0]);
  if (!inBox(HOLE_1, x, z)) out.push(FLOOR_Y[1]);
  if (Math.abs(x) <= ROOF_HALF_W && !inBox(HOLE_2, x, z)) out.push(FLOOR_Y[2]);
  for (const r of RAMPS) {
    const a = rampAt(r, x, z);
    if (a.inside) out.push(FLOOR_Y[r.base] + (FLOOR_Y[r.top] - FLOOR_Y[r.base]) * Math.min(1, Math.max(0, a.t)));
  }
  return out;
}
// Çatı katında beşik tavan yüksekliği (oda x'ine göre)
export const roofCeilY = (x) => FLOOR_Y[2] + ROOF_RISE * (1 - Math.abs(x) / ROOF_SPAN) - 0.25;
export const floorOfY = (y) => (y > FLOOR_Y[2] - 0.5 ? 2 : y > FLOOR_Y[1] - 0.5 ? 1 : 0);

// Eşya yerleştirme doğrulaması (sunucu + istemci). it = { k, x, z, r, f }, def = { wall?, ceil? }
// Dönüş: null (geçerli) ya da hata kodu.
export function checkPlacement(it, def = {}) {
  const f = it?.f;
  if (!Number.isInteger(f) || f < 0 || f > 2) return 'floor';
  const x = Number(it.x);
  const z = Number(it.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'pos';
  const halfX = f === 2 ? ROOF_HALF_W : HALF_W;
  if (def.ceil && f === 2) return 'ceil-roof'; // eğimli çatıya tavan eşyası olmaz
  if (def.wall) {
    // duvar eşyası tam duvarda: ön / arka (z = ±7) ya da yan (x = ±9; çatı katında ±5,8)
    const onZ = Math.abs(Math.abs(z) - HALF_D) < 0.06 && Math.abs(x) <= halfX - 0.25;
    const onX = Math.abs(Math.abs(x) - halfX) < 0.06 && Math.abs(z) <= HALF_D - 0.35;
    if (!onZ && !onX) return 'wall';
    return null;
  }
  // v197: eşya duvara sıfır oturabilir (istemci kutuya göre hizalar; burada sadece en az WALL_GAP pay)
  const mx = f === 2 ? 0.3 : WALL_GAP;
  if (Math.abs(x) > halfX - mx + 1e-6 || Math.abs(z) > HALF_D - WALL_GAP + 1e-6) return 'bounds';
  if (f === 1 && inBox(HOLE_1, x, z)) return 'hole';
  if (f === 2 && inBox(HOLE_2, x, z)) return 'hole';
  for (const r of RAMPS) if (r.base === f && rampAt(r, x, z).inside) return 'stairs';
  // merdivenin tepeye vardığı kattaki çıkış (rampanın tepesi) da boş kalsın
  for (const r of RAMPS) if (r.top === f && rampAt(r, x, z).inside) return 'stairs';
  return null;
}
