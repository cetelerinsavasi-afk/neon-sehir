// =============================================================================
// houseDoor.js — v101 evin giriş kapısı (yeri + tipi). Sunucu ve istemci ortak.
// =============================================================================
// door = { w, x, t }
//   w: duvar (0 = ön/kuzey, 1 = doğu, 2 = arka/güney (varsayılan), 3 = batı)
//   x: kapının o duvar boyunca yeri (duvarın yerel ekseni, metre)
//   t: kapı tipi (DOOR_TYPES)
// Giriş kapısı ücretsizdir; mobilya olarak satılan kapılarla aynı görünümlerdir.
// Eve girenler kapının 3,2 m önünde doğar.
// =============================================================================

export const ROOM_W = 18;
export const ROOM_D = 14;
const SPAWN_IN = 3.2;

// yarım genişlikler (duvar kenarından taşmasın diye)
export const DOOR_TYPES = {
  ahsap: { name: 'Ahşap Kapı', icon: '🚪', half: 0.7 },
  beyaz: { name: 'Beyaz Panel Kapı', icon: '🚪', half: 0.65 },
  cam: { name: 'Cam Kapı', icon: '🔲', half: 0.7 },
  market: { name: 'Otomatik Market Kapısı', icon: '🛒', half: 1.5 },
  cift: { name: 'Çift Kanatlı Kapı', icon: '🏨', half: 1.05 },
  metal: { name: 'Metal Servis Kapısı', icon: '🔩', half: 0.7 },
  salon: { name: 'Salon (Bar) Kapısı', icon: '🤠', half: 0.8 },
  hastane: { name: 'Hastane Kapısı', icon: '🏥', half: 1.05 },
  doner: { name: 'Döner Kapı', icon: '🌀', half: 1.3 },
};
export const DOOR_TYPE_KEYS = Object.keys(DOOR_TYPES);
export const DEFAULT_DOOR = Object.freeze({ w: 2, x: -5, t: 'ahsap' });

// duvar i: merkez + y-ekseni dönüşü (houseEngine'deki duvarlarla aynı)
const WALLS = [
  { len: ROOM_W, px: 0, pz: -ROOM_D / 2, ry: 0 },
  { len: ROOM_D, px: ROOM_W / 2, pz: 0, ry: -Math.PI / 2 },
  { len: ROOM_W, px: 0, pz: ROOM_D / 2, ry: Math.PI },
  { len: ROOM_D, px: -ROOM_W / 2, pz: 0, ry: Math.PI / 2 },
];
export const doorWallLen = (w) => WALLS[w]?.len || ROOM_W;
export const doorRange = (w, t) => Math.max(0, Math.floor((doorWallLen(w) / 2 - (DOOR_TYPES[t]?.half || 0.7) - 0.15) * 4) / 4);

export function sanitizeDoor(v) {
  if (!v || typeof v !== 'object') return null;
  const w = Number.isInteger(v.w) && v.w >= 0 && v.w <= 3 ? v.w : DEFAULT_DOOR.w;
  const t = typeof v.t === 'string' && DOOR_TYPES[v.t] ? v.t : DEFAULT_DOOR.t;
  const raw = Number(v.x);
  const lim = doorRange(w, t);
  const x = Number.isFinite(raw) ? Math.max(-lim, Math.min(lim, Math.round(raw * 4) / 4)) : 0;
  return { w, x, t };
}
export const doorOf = (h) => sanitizeDoor(h?.door) || { ...DEFAULT_DOOR };
export const sameDoor = (a, b) => (a?.w ?? 2) === (b?.w ?? 2) && (a?.x ?? -5) === (b?.x ?? -5) && (a?.t || 'ahsap') === (b?.t || 'ahsap');

// Duvarın yerel noktasını (lx: duvar boyunca, lz: odaya doğru) dünyaya çevir
export function doorLocalToWorld(w, lx, lz) {
  const d = WALLS[w] || WALLS[2];
  const c = Math.cos(d.ry);
  const s = Math.sin(d.ry);
  return { x: d.px + c * lx + s * lz, z: d.pz - s * lx + c * lz };
}
export function doorSpawn(door) {
  const d = sanitizeDoor(door) || DEFAULT_DOOR;
  const p = doorLocalToWorld(d.w, d.x, SPAWN_IN);
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}
