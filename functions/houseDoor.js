// =============================================================================
// houseDoor.js — evin giriş kapısı. Sunucu ve istemci ortak.
// =============================================================================
// v101: door = { w, x, t } varsayılan (yerleşik) kapının duvarı/yeri/tipi.
// v102: + def (varsayılan kapı odada mı) + main (ana kapı olan kapı eşyasının id'si).
//   - Odaya konan (satın alınmış) kapı eşyaları da giriş kapısı olabilir.
//   - Varsayılan kapı ancak odada başka bir kapı varsa kaldırılabilir; son kapı
//     eşyası da kalkarsa varsayılan kapı kendiliğinden geri gelir.
//   - Ana kapı kaldırılırsa giriş kalan kapılardan rastgele biri olur (sunucu seçer).
//   - Eve girenler ana kapının önünde doğar.
// =============================================================================

export const ROOM_W = 18;
export const ROOM_D = 14;
const SPAWN_IN = 3.2; // varsayılan kapıdan içeri
const SPAWN_ITEM = 1.6; // kapı eşyasından içeri

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
export const DEFAULT_DOOR = Object.freeze({ w: 2, x: -5, t: 'ahsap', def: true, main: null });

// Giriş kapısı olabilen mobilyalar
export const DOOR_ITEM_KEYS = ['doordeco', 'garagedoor', 'door_beyaz', 'door_cam', 'door_market', 'door_cift', 'door_metal', 'door_salon', 'door_hastane', 'door_doner', 'celldoor', 'vaultdoor'];
export const isDoorItemKey = (k) => DOOR_ITEM_KEYS.includes(k);
export const isEntranceItem = (it) => Boolean(it && it.p === 1 && isDoorItemKey(it.k));

// duvar i: merkez + y-ekseni dönüşü (houseEngine'deki duvarlarla aynı)
const WALLS = [
  { len: ROOM_W, px: 0, pz: -ROOM_D / 2, ry: 0 },
  { len: ROOM_D, px: ROOM_W / 2, pz: 0, ry: -Math.PI / 2 },
  { len: ROOM_W, px: 0, pz: ROOM_D / 2, ry: Math.PI },
  { len: ROOM_D, px: -ROOM_W / 2, pz: 0, ry: Math.PI / 2 },
];
export const doorWallLen = (w) => WALLS[w]?.len || ROOM_W;
export const doorRange = (w, t) => Math.max(0, Math.floor((doorWallLen(w) / 2 - (DOOR_TYPES[t]?.half || 0.7) - 0.15) * 4) / 4);
const ID_RE = /^[a-z0-9]{1,16}$/;

export function sanitizeDoor(v) {
  if (!v || typeof v !== 'object') return null;
  const w = Number.isInteger(v.w) && v.w >= 0 && v.w <= 3 ? v.w : DEFAULT_DOOR.w;
  const t = typeof v.t === 'string' && DOOR_TYPES[v.t] ? v.t : DEFAULT_DOOR.t;
  const raw = Number(v.x);
  const lim = doorRange(w, t);
  const x = Number.isFinite(raw) ? Math.max(-lim, Math.min(lim, Math.round(raw * 4) / 4)) : 0;
  const def = v.def !== false;
  const main = typeof v.main === 'string' && ID_RE.test(v.main) ? v.main : null;
  return { w, x, t, def, main };
}
export const doorOf = (h) => sanitizeDoor(h?.door) || { ...DEFAULT_DOOR };
export const doorKey = (d) => {
  const x = sanitizeDoor(d) || DEFAULT_DOOR;
  return `${x.w}:${x.x}:${x.t}:${x.def ? 1 : 0}:${x.main || '-'}`;
};
export const sameDoor = (a, b) => doorKey(a) === doorKey(b);

// Kaydederken (sunucu): kurallara uydur. pick(n) → 0..n-1 (rastgele seçim)
export function settleDoor(door, items, pick = (n) => Math.floor(Math.random() * n)) {
  const d = sanitizeDoor(door) || { ...DEFAULT_DOOR };
  const doors = (items || []).filter(isEntranceItem);
  let { def, main } = d;
  if (main && !doors.some((it) => it.i === main)) main = null; // ana kapı kaldırıldı
  if (!doors.length) def = true; // odada başka kapı yok → varsayılan kapı geri gelir
  if (!def && !main) main = doors[pick(doors.length)].i;
  return { ...d, def, main };
}

// Şu anki giriş: { kind: 'item', item } ya da { kind: 'def', door }
export function resolveEntrance(door, items) {
  const d = sanitizeDoor(door) || { ...DEFAULT_DOOR };
  const doors = (items || []).filter(isEntranceItem);
  const main = doors.find((it) => it.i === d.main) || null;
  if (main) return { kind: 'item', item: main, door: d, showDef: d.def || !doors.length };
  if (d.def || !doors.length) return { kind: 'def', door: d, showDef: true };
  return { kind: 'item', item: doors[0], door: d, showDef: false };
}

// Duvarın yerel noktasını (lx: duvar boyunca, lz: odaya doğru) dünyaya çevir
export function doorLocalToWorld(w, lx, lz) {
  const d = WALLS[w] || WALLS[2];
  const c = Math.cos(d.ry);
  const s = Math.sin(d.ry);
  return { x: d.px + c * lx + s * lz, z: d.pz - s * lx + c * lz };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Girişin önü (eski imza: doorSpawn(door) varsayılan kapı)
export function doorSpawn(door, items) {
  const e = resolveEntrance(door, items);
  let p;
  if (e.kind === 'item') {
    const a = (Number(e.item.r) || 0) * (Math.PI / 4);
    p = { x: Number(e.item.x) + Math.sin(a) * SPAWN_ITEM, z: Number(e.item.z) + Math.cos(a) * SPAWN_ITEM };
    p.x = clamp(p.x, -ROOM_W / 2 + 0.6, ROOM_W / 2 - 0.6);
    p.z = clamp(p.z, -ROOM_D / 2 + 0.6, ROOM_D / 2 - 0.6);
  } else {
    p = doorLocalToWorld(e.door.w, e.door.x, SPAWN_IN);
  }
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}

// Girişte bakılan yön (kamera yaw'ı): kapıdan odanın içine doğru — ana kapı
// hangi yöne bakıyorsa oyuncu da o yöne dönük doğar. houseEngine'de kameranın
// ileri yönü (-sin(yaw), -cos(yaw)).
export function doorSpawnYaw(door, items) {
  const e = resolveEntrance(door, items);
  const a = e.kind === 'item' ? (Number(e.item.r) || 0) * (Math.PI / 4) : (WALLS[e.door.w] || WALLS[2]).ry;
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  return Math.atan2(-fx, -fz);
}
