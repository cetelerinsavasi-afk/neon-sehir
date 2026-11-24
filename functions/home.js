// =============================================================================
// home.js — v196 KİŞİSEL 3 KATLI EV (houseAction op: home*)
// -----------------------------------------------------------------------------
// Belge: houses/home_{uid} (kimliği belli → "evim hangisi" sorgusu yok). TEMBEL kurulum: oyuncu evine
// ilk girdiğinde yazılır (toplu yazma yok). Yeni oyuncular da aynı yoldan ev sahibi olur.
//   { kind:'home', ownerUid, ownerName, name, locked, door:{ t }, items:[{ i,k,x,z,r,c,f,p? }],
//     inv:{ items:{k:adet}, walls:[...], floors:[...] }, surf:{ 0:{wall,floor}, 1:{…}, 2:{…} },
//     itemCount (satın alınmış konan eşya), listable (itemCount ≥ 10 && !locked),
//     popDay, popN (günlük ziyaret sayacı — sahibi sayılmaz), ownerSeenAtMs, createdAtMs, updatedAtMs }
// Envanter ev belgesinde (eski houseInventories geçişte iade edilip silinir; karışmasın).
// Eşya kuralları eski evle aynı: mağazadan konan eşya "deneme" (p yok, kullanılamaz), checkout tek
// işlemde hepsini satın alır; satın alınmış eşya kaldırılınca envantere döner. Kat / sınır / merdiven /
// duvar kuralları: functions/homeGeometry.js (istemciyle ortak).
// Kendi evindeki setler (mikser, yayıncı seti…) sadece sahibine açık; evden para kazanılmaz.
// =============================================================================
import { V196_GONE_TEXT, isRemovedKey, WALL_ITEM_KEYS, CEIL_ITEM_KEYS, CATALOG_KEYS, REMOVED_DOOR_TYPES } from './v196Shared.js';
import { ITEM_PRICES, surfacePrice, FREE_SURFACES, SURFACE_KEYS } from './houseCatalogData.js';
import { DOOR_TYPES } from './houseDoor.js';
import { checkPlacement, homeIdOf, isHomeId, uidOfHome, MAX_HOME_ITEMS, HOME_LIST_MIN_ITEMS, HOME_IDLE_DAYS, cleanWin } from './homeGeometry.js';
import { goldTag } from './moneyLog.js';
import { VEHICLE_CATALOG } from './catalogData.js';

const KEY_RE = /^[a-zA-Z0-9_]{1,32}$/;
const ID_RE = /^[a-z0-9]{1,16}$/;
const DAY = 86_400_000;
const SEEN_EVERY_MS = 12 * 3600_000;
export const HOME_DOOR_TYPES = Object.keys(DOOR_TYPES).filter((t) => !REMOVED_DOOR_TYPES.includes(t)); // garaj kapısı ana kapı olamaz (tür listesinde yok)
const dayKeyOf = (ms) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const priceOf = (k) => ITEM_PRICES[k] || null;
const cleanName = (s, fb) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 30) || fb;

export function cleanHomeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const i = String(raw.i || '');
  const k = String(raw.k || '');
  if (!ID_RE.test(i) || !KEY_RE.test(k) || !CATALOG_KEYS.has(k) || isRemovedKey(k)) return null;
  const x = num(raw.x);
  const z = num(raw.z);
  const f = raw.f;
  if (x == null || z == null || !Number.isInteger(f)) return null;
  const r = Number.isInteger(raw.r) ? ((raw.r % 8) + 8) % 8 : 0;
  const c = Number.isInteger(raw.c) && raw.c >= 0 && raw.c < 32 ? raw.c : 0;
  const it = { i, k, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r, c, f };
  if (raw.p === 1) it.p = 1;
  return it;
}
export const placementOf = (it) => checkPlacement(it, { wall: WALL_ITEM_KEYS.has(it.k), ceil: CEIL_ITEM_KEYS.has(it.k) });
const countBy = (items, pred) => {
  const m = {};
  for (const it of items) if (pred(it)) m[it.k] = (m[it.k] || 0) + 1;
  return m;
};
export function homeListable(h) {
  return Boolean(h && !h.locked && Number(h.itemCount || 0) >= HOME_LIST_MIN_ITEMS);
}

export function createHome({ db, FieldValue, HttpsError, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const ref = (id) => db.collection('houses').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const fresh = (uid, user) => ({
    kind: 'home',
    ownerUid: uid,
    ownerName: String(user?.displayName || 'Oyuncu').slice(0, 40),
    ownerAvatar: user?.avatar || null,
    name: `${String(user?.displayName || 'Oyuncu').slice(0, 20)}'in Evi`,
    locked: false,
    door: { t: 'ahsap' },
    items: [],
    inv: { items: {}, walls: [], floors: [] },
    surf: {},
    itemCount: 0,
    listable: false,
    popDay: null,
    popN: 0,
    ownerSeenAtMs: now(),
    createdAtMs: now(),
    updatedAtMs: now(),
  });

  // Garajdaki araç (sadece sahibine çizilir): favori (users.favVehicleId) kullanılabilirse o; değilse
  // (satılmış, ilanda, haczedilmiş, ömrü bitmiş) en pahalı kullanılabilir araç. Ev belgesine kimlik + katalog +
  // modifiye yazılır; sonraki girişlerde yalnızca o aracın belgesi okunur (1 okuma), geçerliyse sorgu yok.
  const usable = (uid, v) => Boolean(v && v.ownerId === uid && !v.listed && !v.seizedByBank && !v.mortgaged && !(Number(v.lifeDays) <= 0 && v.lifeDays != null));
  const carOf = (id, v) => ({ id, cid: Number(v.catalogId) || 0, mods: v.mods && typeof v.mods === 'object' ? v.mods : null });
  async function resolveCar(uid, h, favId) {
    const want = favId || h?.garage?.id || null;
    if (want) {
      const s = await db.collection('vehicles').doc(String(want)).get();
      if (s.exists && usable(uid, s.data())) return carOf(s.id, s.data());
    }
    const snap = await db.collection('vehicles').where('ownerId', '==', uid).limit(40).get();
    let best = null;
    let bp = -1;
    for (const d of snap.docs) {
      const v = d.data();
      if (!usable(uid, v)) continue;
      const pr = Number(VEHICLE_CATALOG[v.catalogId]?.price || 0);
      if (pr > bp) {
        bp = pr;
        best = carOf(d.id, v);
      }
    }
    return best;
  }

  // Eve gir: kendi evi yoksa kurulur (tek yazma). Başkasının evi: kilitliyse girilmez; günlük sayaç +1.
  async function enter(uid, p) {
    const id = p.homeId ? String(p.homeId) : homeIdOf(uid);
    if (!isHomeId(id)) fail('invalid-argument', 'Geçersiz ev.');
    const own = uidOfHome(id) === uid;
    const t = now();
    let out = null;
    let car;
    let favG; // v197: users.favGarage (herkes garajda kendi aracını görür — istemci bunu okur)
    if (own) {
      const [cur, us] = await Promise.all([ref(id).get(), userRef(uid).get()]);
      car = await resolveCar(uid, cur.exists ? cur.data() : null, us.data()?.favVehicleId || null);
      favG = us.data()?.favGarage;
    }
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref(id));
      if (!s.exists) {
        if (!own) fail('not-found', 'Ev bulunamadı.');
        const us = await tx.get(userRef(uid));
        const h = { ...fresh(uid, us.data()), garage: car || null, garageCar: car?.cid || 0 };
        tx.set(ref(id), h);
        if (JSON.stringify(favG ?? null) !== JSON.stringify(car || null) || favG === undefined) tx.update(userRef(uid), { favGarage: car || null });
        out = { id, ...h, created: true };
        return;
      }
      const h = s.data();
      if (!own && h.locked) fail('permission-denied', '🔒 Bu ev ziyaretçilere kapalı.');
      if (own) {
        const patch = {};
        if (t - Number(h.ownerSeenAtMs || 0) > SEEN_EVERY_MS) patch.ownerSeenAtMs = t;
        const same = (h.garage?.id || null) === (car?.id || null) && JSON.stringify(h.garage?.mods || null) === JSON.stringify(car?.mods || null);
        if (!same) {
          h.garage = patch.garage = car || null;
          h.garageCar = patch.garageCar = car?.cid || 0;
        }
        if (Object.keys(patch).length) tx.update(ref(id), patch);
        if (favG === undefined || JSON.stringify(favG ?? null) !== JSON.stringify(car || null)) tx.update(userRef(uid), { favGarage: car || null });
      } else {
        const d = dayKeyOf(t);
        tx.update(ref(id), h.popDay === d ? { popN: FieldValue.increment(1) } : { popDay: d, popN: 1 });
      }
      out = { id, ...h, inv: own ? h.inv : undefined, ...(own ? {} : { garage: null, garageCar: 0 }) }; // garajdaki araç sadece sahibine
    });
    return { ok: true, home: out };
  }

  // Tasarımı kaydet (sadece sahibi). Delta kuralı: satın alınmış (p:1) eşya sayısı = önceki konulan + envanter.
  async function save(uid, p) {
    const id = homeIdOf(uid);
    const list = Array.isArray(p.items) ? p.items : null;
    if (!list) fail('invalid-argument', 'Geçersiz tasarım.');
    if (list.length > MAX_HOME_ITEMS) fail('failed-precondition', `Bir evde en fazla ${MAX_HOME_ITEMS} eşya olabilir.`);
    const items = [];
    const seen = new Set();
    for (const raw of list) {
      const it = cleanHomeItem(raw);
      if (!it) fail('invalid-argument', 'Geçersiz eşya.');
      if (seen.has(it.i)) fail('invalid-argument', 'Aynı eşya iki kez.');
      seen.add(it.i);
      const bad = placementOf(it);
      if (bad) fail('failed-precondition', `place-${bad}`);
      items.push(it);
    }
    const surf = cleanSurf(p.surf);
    const win = p.win != null ? cleanWin(p.win) : null; // pencere modeli / rengi (ücretsiz)
    let out = null;
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref(id));
      if (!s.exists) fail('not-found', 'Önce evine gir.');
      const h = s.data();
      const inv = { items: { ...(h.inv?.items || {}) }, walls: [...(h.inv?.walls || [])], floors: [...(h.inv?.floors || [])] };
      const before = countBy(h.items || [], (x) => x.p === 1);
      const after = countBy(items, (x) => x.p === 1);
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const have = Number(inv.items[k] || 0) + Number(before[k] || 0);
        const want = Number(after[k] || 0);
        if (want > have) fail('failed-precondition', 'Envanterinde olmayan eşya satın alınmış gibi konamaz.');
        const left = have - want;
        if (left > 0) inv.items[k] = left;
        else delete inv.items[k];
      }
      // kaplama: sahip olunmayan (ücretsiz de değilse) deneme kalır, checkout'a kadar seçilemez
      for (const [f, v] of Object.entries(surf)) {
        for (const [type, field] of [['wall', 'walls'], ['floor', 'floors']]) {
          const key = v[type];
          if (key && !FREE_SURFACES[type].includes(key) && !inv[field].includes(key)) v[`${type}Try`] = true;
        }
        surf[f] = v;
      }
      const itemCount = items.filter((x) => x.p === 1).length;
      tx.update(ref(id), { items, inv, surf, ...(win ? { win } : {}), itemCount, listable: homeListable({ locked: h.locked, itemCount }), updatedAtMs: now() });
      out = { ok: true, count: items.length, itemCount, inv, surf };
    });
    return out;
  }
  function cleanSurf(raw) {
    const out = {};
    for (const f of ['0', '1', '2']) {
      const v = raw?.[f];
      if (!v || typeof v !== 'object') continue;
      const o = {};
      if (typeof v.wall === 'string' && SURFACE_KEYS.wall.includes(v.wall)) o.wall = v.wall;
      if (typeof v.floor === 'string' && SURFACE_KEYS.floor.includes(v.floor)) o.floor = v.floor;
      if (Object.keys(o).length) out[f] = o;
    }
    return out;
  }

  // Satın al: evdeki bütün deneme eşyaları + deneme kaplamaları TEK işlemde (altın / zümrüt yetmezse hiçbiri)
  async function checkout(uid, p) {
    const id = homeIdOf(uid);
    let out = null;
    await db.runTransaction(async (tx) => {
      const [s, us] = await Promise.all([tx.get(ref(id)), tx.get(userRef(uid))]);
      if (!s.exists) fail('not-found', 'Önce evine gir.');
      const h = s.data();
      const user = us.data() || {};
      let gold = 0;
      let gem = 0;
      const items = (h.items || []).map((x) => ({ ...x }));
      const inv = { items: { ...(h.inv?.items || {}) }, walls: [...(h.inv?.walls || [])], floors: [...(h.inv?.floors || [])] };
      let n = 0;
      for (const it of items) {
        if (it.p === 1) continue;
        // v197: envanterde aynı eşyadan varsa önce o kullanılır — aynı eşya iki kez satın alınmaz
        if (Number(inv.items[it.k] || 0) > 0) {
          inv.items[it.k] -= 1;
          if (!inv.items[it.k]) delete inv.items[it.k];
          it.p = 1;
          continue;
        }
        if (isRemovedKey(it.k)) fail('failed-precondition', 'Bu eşya artık satılmıyor.');
        const pr = priceOf(it.k);
        if (pr?.t === 'gem') gem += pr.v;
        else if (pr) gold += pr.v;
        it.p = 1;
        n += 1;
      }
      const surf = JSON.parse(JSON.stringify(h.surf || {}));
      for (const v of Object.values(surf)) {
        for (const [type, field] of [['wall', 'walls'], ['floor', 'floors']]) {
          if (!v[`${type}Try`]) continue;
          const key = v[type];
          if (!inv[field].includes(key)) {
            const pr = surfacePrice(type, key);
            if (pr?.t === 'gem') gem += pr.v;
            else if (pr) gold += pr.v;
            inv[field].push(key);
          }
          delete v[`${type}Try`];
        }
      }
      if (p.expect && (Number(p.expect.gold) !== gold || Number(p.expect.gem) !== gem)) fail('aborted', `price-changed:${gold}:${gem}`);
      if (Number(user.gold || 0) < gold || Number(user.emerald || 0) < gem) fail('failed-precondition', 'Yetersiz altın / zümrüt.');
      if (gold || gem) tx.update(userRef(uid), { ...(gold ? { gold: FieldValue.increment(-gold), goldTag: goldTag('mobilya') } : {}), ...(gem ? { emerald: FieldValue.increment(-gem) } : {}) });
      const itemCount = items.filter((x) => x.p === 1).length;
      tx.update(ref(id), { items, inv, surf, itemCount, listable: homeListable({ locked: h.locked, itemCount }), updatedAtMs: now() });
      out = { ok: true, gold, gem, count: n, inv }; // v197: istemci sahip olunan kaplamaları hemen bilsin (tekrar sepete girmesin)
    });
    return out;
  }

  // Ayarlar: ad, ziyaretçi kilidi, ana kapı türü (konum değişmez, garaj kapısı seçilemez)
  async function settings(uid, p) {
    const id = homeIdOf(uid);
    const patch = {};
    if (p.name != null) patch.name = cleanName(p.name, 'Evim');
    if (p.locked != null) patch.locked = Boolean(p.locked);
    if (p.doorType != null) {
      if (!HOME_DOOR_TYPES.includes(String(p.doorType))) fail('invalid-argument', 'Bu kapı ana kapı olamaz.');
      patch['door.t'] = String(p.doorType);
    }
    // garajdaki araç = favori araç (users.favVehicleId — profildeki kalp ile aynı alan)
    let fav;
    if (p.vehicleId != null) {
      const vs = await db.collection('vehicles').doc(String(p.vehicleId)).get();
      if (!vs.exists || vs.data().ownerId !== uid) fail('permission-denied', 'Bu araç senin değil.');
      fav = vs.id;
      patch.garage = carOf(vs.id, vs.data());
      patch.garageCar = patch.garage.cid;
    }
    if (!Object.keys(patch).length) fail('invalid-argument', 'Değişiklik yok.');
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref(id));
      if (!s.exists) fail('not-found', 'Önce evine gir.');
      const h = s.data();
      const locked = patch.locked ?? h.locked;
      tx.update(ref(id), { ...patch, listable: homeListable({ locked, itemCount: h.itemCount }), updatedAtMs: now() });
      if (fav) tx.update(userRef(uid), { favVehicleId: fav });
    });
    return { ok: true, ...patch };
  }

  // Evler listesi: tek sorgu + sınır (indeks: listable + popN). 20 gün girmeyenin evi elenir; bugünün
  // sayacı (popDay) eskiyse 0 sayılır. İçinde biri olan (RTDB) 10'dan az eşyalı evler istemcide eklenir
  // (homeIds ile en fazla 10 belge okunur).
  async function list(uid, p) {
    const t = now();
    const today = dayKeyOf(t);
    const snap = await db.collection('houses').where('listable', '==', true).orderBy('popN', 'desc').limit(60).get();
    const extraIds = (Array.isArray(p.homeIds) ? p.homeIds : []).filter(isHomeId).slice(0, 10);
    const extra = await Promise.all(extraIds.map((hid) => ref(hid).get()));
    const rows = new Map();
    for (const d of [...snap.docs, ...extra]) {
      if (!d.exists) continue;
      const h = d.data();
      if (h.kind !== 'home' || h.locked) continue;
      if (t - Number(h.ownerSeenAtMs || 0) > HOME_IDLE_DAYS * DAY) continue;
      rows.set(d.id, { id: d.id, name: h.name, ownerUid: h.ownerUid, ownerName: h.ownerName, ownerAvatar: h.ownerAvatar || null, itemCount: Number(h.itemCount || 0), pop: h.popDay === today ? Number(h.popN || 0) : 0 });
    }
    return { ok: true, homes: [...rows.values()] };
  }

  // v196: favori araç PROFİLDEN (aracın kartındaki ❤️) — users.favVehicleId; evi varsa garaj hemen güncellenir.
  // vehicleId null → favori kaldırılır (garajda en pahalı kullanılabilir araç).
  async function fav(uid, p) {
    const vid = p.vehicleId == null || p.vehicleId === '' ? null : String(p.vehicleId);
    let car = null;
    if (vid) {
      const vs = await db.collection('vehicles').doc(vid).get();
      if (!vs.exists || vs.data().ownerId !== uid) fail('permission-denied', 'Bu araç senin değil.');
      car = usable(uid, vs.data()) ? carOf(vs.id, vs.data()) : null;
    }
    const hs = await ref(homeIdOf(uid)).get();
    if (!car) car = await resolveCar(uid, { garage: null }, null); // v197: favori yoksa en pahalı araç (garajda)
    const batch = db.batch();
    batch.update(userRef(uid), { favVehicleId: vid || FieldValue.delete(), favGarage: car || null });
    if (hs.exists) batch.update(ref(homeIdOf(uid)), { garage: car || null, garageCar: car?.cid || 0 });
    await batch.commit();
    return { ok: true, favVehicleId: vid, garage: car || null };
  }

  const ops = {
    homeFav: fav,
    homeEnter: enter,
    homeSave: save,
    homeCheckout: checkout,
    homeSettings: settings,
    homeList: list,
  };
  return { ops, enter, save, checkout, settings, list, V196_GONE_TEXT };
}
