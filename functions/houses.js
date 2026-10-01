// =============================================================================
// houses.js — v66 3D Ev: satın alma, envanter, sepet, ayarlar, davet, canlı oda
// =============================================================================
//
// Koleksiyonlar (yazma SADECE sunucudan; okuma kuralları firestore.rules'ta):
//   houses/{houseId}            — { ownerUid, ownerName, ownerAvatar, name, privacy,
//                                   items[], wall, floor, music, kicked{}, invites{},
//                                   createdAtMs, updatedAtMs }
//       items[i] = { i, k, x, z, r, c, o?, p? }   p:1 → satın alınmış, yoksa "deneme"
//   houses/{houseId}/chat/{id}  — { uid, name, text, createdAtMs }
//   houseInventories/{uid}      — { items:{k:adet}, walls:[...], floors:[...] }
//   housePresence/{uid}         — canlı konum (ilk kayıt burada, konum istemciden)
//   heldItems/{uid}             — eldeki ürün (venue:'ev') — bkz. index.js giftHeldItem
//
// Ekonomi kuralları:
//   - Ev 500.000 altın (v70). v68: ev sayısı sınırı yok.
//   - Eşya fiyatları functions/houseCatalogData.js (istemciyle ORTAK dosya).
//   - Odaya mağazadan konan eşya "deneme"dir (p yok): herkes görür ama kullanılamaz.
//     'checkout' tüm deneme eşyaları + seçili kaplamaları TEK transaction'da satın
//     alır; altın/zümrüt yetmezse hiçbir şey alınmaz.
//   - Satın alınmış eşya odadan kaldırılınca envantere döner, envanterden konunca
//     envanterden düşer. 'save' bunu farkla (delta) doğrular — istemci envanterde
//     olmayan eşyayı "satın alınmış" diye koyamaz.
// =============================================================================

import {
  HOUSE_PRICE,
  MAX_ITEMS_PER_HOUSE,
  ITEM_PRICES,
  FREE_SURFACES,
  SURFACE_KEYS,
  surfacePrice,
  HOUSE_TAKEABLES,
  HOUSE_PRODUCTS,
} from './houseCatalogData.js';

export const HOUSE = {
  W: 18,
  D: 14,
  CHAT_MAX: 200,
  CHAT_MIN_INTERVAL_MS: 700,
  CHAT_KEEP: 120,
  KICK_MS: 15 * 60 * 1000,
  INVITE_MS: 24 * 60 * 60 * 1000,
  PRESENCE_ACTIVE_MS: 2 * 60 * 1000,
  HELD_MS: 120_000,
  SPAWN: { x: 5, z: 14 / 2 - 3.2 },
};
export const PRIVACY = ['public', 'friends', 'private'];

const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const isHouseId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const KEY_RE = /^[a-z0-9_]{1,32}$/;
const ID_RE = /^[a-z0-9]{1,16}$/;
const nameOf = (u) => String(u?.displayName || 'Oyuncu').slice(0, 40);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const defaultHouseName = (ownerName) => `${String(ownerName || 'Oyuncu').slice(0, 20)}'in Evi`;

export function cleanHouseName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > 30) return null;
  if (!/^[\p{L}\p{N} '’.,!&_\-#]+$/u.test(s)) return null;
  return s;
}

// Tasarımı doğrula + temizle (bilinmeyen alanlar/eşyalar atılır).
export function cleanDesign(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const items = Array.isArray(d.items) ? d.items : [];
  if (items.length > MAX_ITEMS_PER_HOUSE) {
    const e = new Error(`En fazla ${MAX_ITEMS_PER_HOUSE} eşya.`);
    e.code = 'invalid-argument';
    throw e;
  }
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const i = String(it.i || '');
    const k = String(it.k || '');
    const x = num(it.x);
    const z = num(it.z);
    if (!ID_RE.test(i) || !KEY_RE.test(k) || !ITEM_PRICES[k] || x === null || z === null || seen.has(i)) continue;
    if (Math.abs(x) > HOUSE.W / 2 + 0.1 || Math.abs(z) > HOUSE.D / 2 + 0.1) continue;
    seen.add(i);
    const r = Number.isInteger(it.r) ? ((it.r % 8) + 8) % 8 : 0;
    const c = Number.isInteger(it.c) && it.c >= 0 && it.c < 32 ? it.c : 0;
    const row = { i, k, x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, r, c };
    if (typeof it.o === 'boolean') row.o = it.o;
    if (it.p === 1 || it.p === true) row.p = 1;
    out.push(row);
  }
  const wall = KEY_RE.test(String(d.wall || '')) && SURFACE_KEYS.wall.includes(d.wall) ? d.wall : null;
  const floor = KEY_RE.test(String(d.floor || '')) && SURFACE_KEYS.floor.includes(d.floor) ? d.floor : null;
  return { items: out, wall, floor };
}

const countOwned = (items) => {
  const m = {};
  (items || []).forEach((it) => {
    if (it.p === 1) m[it.k] = (m[it.k] || 0) + 1;
  });
  return m;
};
const ownsSurface = (inv, type, key) => FREE_SURFACES[type].includes(key) || (inv?.[type === 'wall' ? 'walls' : 'floors'] || []).includes(key);

// deps: { db, FieldValue, HttpsError, requireAuth, onCall, isAdmin, assertCanSpeak, isFriend, now? }
export function createHouses({ db, FieldValue, HttpsError, requireAuth, onCall, isAdmin, assertCanSpeak, isFriend, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const invRef = (uid) => db.collection('houseInventories').doc(uid);
  const presenceRef = (uid) => db.collection('housePresence').doc(uid);
  const userRef = (uid) => db.collection('users').doc(uid);
  const heldRef = (uid) => db.collection('heldItems').doc(uid);

  const clean = (raw) => {
    try {
      return cleanDesign(raw);
    } catch (e) {
      return fail('invalid-argument', e.message);
    }
  };

  async function loadHouse(houseId) {
    if (!isHouseId(houseId)) fail('invalid-argument', 'Geçersiz ev.');
    const snap = await houseRef(houseId).get();
    if (!snap.exists) fail('not-found', 'Ev bulunamadı.');
    return snap.data();
  }
  async function loadOwnedHouse(uid, houseId) {
    const h = await loadHouse(houseId);
    if (h.ownerUid !== uid) fail('permission-denied', 'Bu ev senin değil.');
    return h;
  }
  async function presentIn(uid, houseId) {
    const p = await presenceRef(uid).get();
    const d = p.exists ? p.data() : null;
    if (!d || d.houseId !== houseId) return null;
    const at = d.updatedAt?.toMillis?.() ?? Number(d.updatedAt || 0);
    if (at && now() - at > HOUSE.PRESENCE_ACTIVE_MS) return null;
    return p;
  }

  // ---- satın al ----------------------------------------------------------------
  async function buy(uid, p) {
    const uSnap = await userRef(uid).get();
    const user = uSnap.data() || {};
    // v68: ev sayısı sınırı yok — oyuncu istediği kadar ev alabilir.
    const name = p.name ? cleanHouseName(p.name) : defaultHouseName(user.displayName);
    if (!name) fail('invalid-argument', 'Ev adı 3-30 karakter olmalı.');
    if (p.name) await assertCanSpeak(uid);
    const ref = db.collection('houses').doc();
    await db.runTransaction(async (tx) => {
      const u = await tx.get(userRef(uid));
      const gold = Number(u.data()?.gold || 0);
      if (gold < HOUSE_PRICE) fail('failed-precondition', `Yetersiz altın. Ev ${HOUSE_PRICE.toLocaleString('tr-TR')} altın.`);
      tx.update(userRef(uid), { gold: FieldValue.increment(-HOUSE_PRICE), houseCount: FieldValue.increment(1) });
      tx.set(ref, {
        ownerUid: uid,
        ownerName: nameOf(user),
        ownerAvatar: user.avatar || null,
        name,
        privacy: 'public',
        items: [],
        wall: FREE_SURFACES.wall[0],
        floor: FREE_SURFACES.floor[0],
        music: null,
        kicked: {},
        invites: {},
        createdAtMs: now(),
        updatedAtMs: now(),
      });
      tx.set(userRef(uid).collection('messages').doc(), {
        from: 'Emlak',
        text: `Hayırlı olsun! "${name}" artık senin. Haritadan Ev'e tıklayıp evine girebilir, Tasarla ile döşeyebilirsin. 🏠`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, houseId: ref.id, name };
  }

  // ---- giriş -------------------------------------------------------------------
  async function canEnter(uid, h) {
    if (h.ownerUid === uid) return { ok: true };
    if (isAdmin(uid)) return { ok: true };
    const t = now();
    const kickedUntil = Number(h.kicked?.[uid] || 0);
    if (kickedUntil > t) return { ok: false, msg: `Bu evden çıkarıldın. ${Math.ceil((kickedUntil - t) / 60000)} dk sonra tekrar deneyebilirsin.` };
    if (Number(h.invites?.[uid] || 0) > t) return { ok: true };
    const privacy = h.privacy || 'public';
    if (privacy === 'public') return { ok: true };
    if (privacy === 'friends') {
      if (await isFriend(h.ownerUid, uid)) return { ok: true };
      return { ok: false, msg: 'Bu ev sadece sahibinin arkadaşlarına açık.' };
    }
    return { ok: false, msg: 'Bu ev şu an gizli, kimse giremez.' };
  }

  async function enter(uid, p) {
    const houseId = String(p.houseId || '');
    const h = await loadHouse(houseId);
    // Gizliye çekilse bile o an içeride olan atılmaz (yeniden bağlanma dahil).
    const already = await presentIn(uid, houseId);
    if (!already) {
      const c = await canEnter(uid, h);
      if (!c.ok) fail('permission-denied', c.msg);
    }
    const user = (await userRef(uid).get()).data() || {};
    await presenceRef(uid).set({
      houseId,
      displayName: nameOf(user),
      avatar: user.avatar || null,
      x: HOUSE.SPAWN.x,
      z: HOUSE.SPAWN.z,
      left: false,
      seat: null,
      holding: null,
      emote: null,
      emoteTs: 0,
      updatedAt: FieldValue.serverTimestamp(),
      enteredAt: FieldValue.serverTimestamp(),
    });
    const isOwner = h.ownerUid === uid;
    const patch = {};
    if (isOwner && (h.ownerName !== nameOf(user) || JSON.stringify(h.ownerAvatar || null) !== JSON.stringify(user.avatar || null))) {
      patch.ownerName = nameOf(user);
      patch.ownerAvatar = user.avatar || null;
    }
    if (isOwner && !h.name) patch.name = defaultHouseName(user.displayName);
    if (isOwner && !h.privacy) patch.privacy = 'public';
    if (Object.keys(patch).length) await houseRef(houseId).update(patch);
    return { status: 'ok', houseId, isOwner, name: patch.name || h.name || defaultHouseName(h.ownerName), ownerName: h.ownerName || 'Oyuncu' };
  }

  // ---- kaydet (envanter farkıyla) -------------------------------------------------
  function applyDesignTx(tx, { houseId, h, inv, uid, design, buyAll = false }) {
    const oldOwned = countOwned(h.items);
    const items = design.items.map((it) => (buyAll ? { ...it, p: 1 } : it));
    const newOwned = countOwned(items);
    const invItems = { ...(inv?.items || {}) };
    const keys = new Set([...Object.keys(oldOwned), ...Object.keys(newOwned)]);
    for (const k of keys) {
      const delta = (newOwned[k] || 0) - (oldOwned[k] || 0);
      if (buyAll) continue; // yeni satın alınanlar envanterden düşmez; aşağıda ayrıca ele alınır
      if (delta > 0 && (invItems[k] || 0) < delta) fail('failed-precondition', 'Envanterinde bu eşyadan yeterince yok.');
      invItems[k] = (invItems[k] || 0) - delta;
      if (invItems[k] <= 0) delete invItems[k];
    }
    return { items, invItems };
  }

  async function save(uid, p) {
    const houseId = String(p.houseId || '');
    const design = clean(p.design);
    let result = null;
    await db.runTransaction(async (tx) => {
      const [hs, is] = await Promise.all([tx.get(houseRef(houseId)), tx.get(invRef(uid))]);
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu ev senin değil.');
      const inv = is.exists ? is.data() : {};
      const { items, invItems } = applyDesignTx(tx, { houseId, h, inv, uid, design });
      // Kaplama: sadece sahip olunan uygulanır; değilse eskisi kalır (önizleme istemcide).
      const wall = design.wall && ownsSurface(inv, 'wall', design.wall) ? design.wall : h.wall || FREE_SURFACES.wall[0];
      const floor = design.floor && ownsSurface(inv, 'floor', design.floor) ? design.floor : h.floor || FREE_SURFACES.floor[0];
      tx.update(houseRef(houseId), { items, wall, floor, updatedAtMs: now() });
      // Envanter belgesi küçük: tamamı tek yazımla (silinen anahtarlar da gider)
      tx.set(invRef(uid), { items: invItems, walls: inv.walls || [], floors: inv.floors || [], updatedAtMs: now() });
      result = { ok: true, count: items.length, wall, floor };
    });
    return result;
  }

  // ---- sepeti tamamla ---------------------------------------------------------------
  function quoteOf(h, design, inv) {
    let gold = 0;
    let gem = 0;
    const lines = {};
    const add = (price, label) => {
      if (!price) return;
      if (price.t === 'gem') gem += price.v;
      else gold += price.v;
      lines[label] = (lines[label] || 0) + 1;
    };
    design.items.filter((it) => it.p !== 1).forEach((it) => add(ITEM_PRICES[it.k], it.k));
    const surfaces = [];
    if (design.wall && !ownsSurface(inv, 'wall', design.wall)) {
      add(surfacePrice('wall', design.wall), `wall:${design.wall}`);
      surfaces.push(['wall', design.wall]);
    }
    if (design.floor && !ownsSurface(inv, 'floor', design.floor)) {
      add(surfacePrice('floor', design.floor), `floor:${design.floor}`);
      surfaces.push(['floor', design.floor]);
    }
    return { gold, gem, lines, surfaces };
  }

  async function checkout(uid, p) {
    const houseId = String(p.houseId || '');
    const design = clean(p.design);
    let result = null;
    await db.runTransaction(async (tx) => {
      const [hs, is, us] = await Promise.all([tx.get(houseRef(houseId)), tx.get(invRef(uid)), tx.get(userRef(uid))]);
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu ev senin değil.');
      const inv = is.exists ? is.data() : {};
      const user = us.data() || {};
      const q = quoteOf(h, design, inv);
      const exp = p.expect || {};
      if (Number(exp.gold) !== q.gold || Number(exp.gem) !== q.gem) fail('aborted', 'Sepet tutarı değişti, lütfen tekrar kontrol et.');
      if (q.gold === 0 && q.gem === 0) fail('failed-precondition', 'Sepetin boş.');
      const gold = Number(user.gold || 0);
      const emerald = Number(user.emerald || 0);
      if (gold < q.gold) fail('failed-precondition', `Yetersiz altın (${gold.toLocaleString('tr-TR')} / ${q.gold.toLocaleString('tr-TR')}).`);
      if (emerald < q.gem) fail('failed-precondition', `Yetersiz zümrüt (${emerald} / ${q.gem}).`);
      // Önce mevcut (satın alınmış) eşyaların envanter farkını uygula, sonra denemeleri satın al.
      const { invItems } = applyDesignTx(tx, { houseId, h, inv, uid, design });
      const items = design.items.map((it) => ({ ...it, p: 1 }));
      const walls = [...(inv.walls || [])];
      const floors = [...(inv.floors || [])];
      q.surfaces.forEach(([type, key]) => {
        const arr = type === 'wall' ? walls : floors;
        if (!arr.includes(key)) arr.push(key);
      });
      const wall = design.wall || h.wall || FREE_SURFACES.wall[0];
      const floor = design.floor || h.floor || FREE_SURFACES.floor[0];
      const userPatch = {};
      if (q.gold) userPatch.gold = FieldValue.increment(-q.gold);
      if (q.gem) userPatch.emerald = FieldValue.increment(-q.gem);
      tx.update(userRef(uid), userPatch);
      tx.update(houseRef(houseId), { items, wall, floor, updatedAtMs: now() });
      tx.set(invRef(uid), { items: invItems, walls, floors, updatedAtMs: now() });
      const cnt = Object.values(q.lines).reduce((a, b) => a + b, 0);
      const parts = [q.gold ? `${q.gold.toLocaleString('tr-TR')} altın` : null, q.gem ? `${q.gem} zümrüt` : null].filter(Boolean).join(' + ');
      tx.set(userRef(uid).collection('messages').doc(), {
        from: 'Mobilya Mağazası',
        text: `${cnt} ürünlük alışverişin tamamlandı (${parts}). Güle güle kullan! 🛋️`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      result = { ok: true, gold: q.gold, gem: q.gem, count: cnt, wall, floor };
    });
    return result;
  }

  async function quote(uid, p) {
    const houseId = String(p.houseId || '');
    const design = clean(p.design);
    const h = await loadOwnedHouse(uid, houseId);
    const is = await invRef(uid).get();
    const q = quoteOf(h, design, is.exists ? is.data() : {});
    return { gold: q.gold, gem: q.gem, lines: q.lines };
  }

  // ---- ayarlar ---------------------------------------------------------------------
  async function settings(uid, p) {
    const houseId = String(p.houseId || '');
    const h = await loadOwnedHouse(uid, houseId);
    const patch = {};
    if (p.name !== undefined && p.name !== h.name) {
      const name = cleanHouseName(p.name);
      if (!name) fail('invalid-argument', 'Ev adı 3-30 karakter olmalı (harf, rakam ve basit işaretler).');
      await assertCanSpeak(uid);
      patch.name = name;
    }
    if (p.privacy !== undefined) {
      if (!PRIVACY.includes(p.privacy)) fail('invalid-argument', 'Geçersiz tür.');
      patch.privacy = p.privacy;
    }
    if (Object.keys(patch).length) await houseRef(houseId).update({ ...patch, updatedAtMs: now() });
    return { ok: true, name: patch.name || h.name, privacy: patch.privacy || h.privacy || 'public' };
  }

  // ---- davet / at ------------------------------------------------------------------
  async function invite(uid, p) {
    const houseId = String(p.houseId || '');
    const target = String(p.uid || '');
    if (!isUid(target) || target === uid) fail('invalid-argument', 'Geçersiz oyuncu.');
    const h = await loadHouse(houseId);
    const isOwner = h.ownerUid === uid;
    if (!isOwner && !(await presentIn(uid, houseId))) fail('permission-denied', 'Davet için evde olmalısın.');
    if (!(await isFriend(uid, target))) fail('failed-precondition', 'Sadece arkadaşlarını davet edebilirsin.');
    const [tSnap, me] = await Promise.all([userRef(target).get(), userRef(uid).get()]);
    if (!tSnap.exists) fail('not-found', 'Oyuncu bulunamadı.');
    if (isOwner) {
      const last = Number(h.invites?.[target] || 0) - HOUSE.INVITE_MS;
      if (last > now() - 60_000) fail('resource-exhausted', 'Bu oyuncuyu az önce davet ettin.');
    }
    const houseName = h.name || 'ev';
    const batch = db.batch();
    // Sadece EV SAHİBİNİN daveti gizli/arkadaşlara açık eve giriş izni verir.
    if (isOwner) batch.update(houseRef(houseId), { [`invites.${target}`]: now() + HOUSE.INVITE_MS, [`kicked.${target}`]: FieldValue.delete() });
    batch.set(userRef(target).collection('messages').doc(), {
      from: nameOf(me.data()),
      text: isOwner
        ? `🏠 Seni "${houseName}" evime davet ediyorum! Haritadan Ev'e tıkla, listede evimi görüp girebilirsin. (Davet 24 saat geçerli)`
        : `🏠 "${houseName}" evindeyim (${h.ownerName || 'bir oyuncu'}), sen de gel! Haritadan Ev'e tıklayıp listeden girebilirsin.`,
      read: false,
      kind: 'houseInvite',
      houseId,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, name: nameOf(tSnap.data()) };
  }

  // Sixtagram "ev fotoğrafı": o anki tasarım + evdekiler dondurulur (istemci
  // görüntü yükleyemez → uygunsuz görsel riski yok; kare telefonlarda yeniden çizilir).
  async function buildPhotoAttachment(uid, a) {
    const houseId = String(a?.houseId || '');
    const h = await loadHouse(houseId);
    if (!(await presentIn(uid, houseId))) fail('failed-precondition', 'Fotoğraf için evde olmalısın.');
    const c = a?.cam || {};
    const nums = ['px', 'py', 'pz', 'dx', 'dy', 'dz', 'fov'].map((k) => num(c[k]));
    if (nums.some((v) => v === null) || nums.slice(0, 3).some((v) => Math.abs(v) > 40)) fail('invalid-argument', 'Geçersiz kamera.');
    const [px, py, pz, dx, dy, dz, fov] = nums;
    const pres = await db.collection('housePresence').where('houseId', '==', houseId).limit(16).get();
    const t = now();
    const people = [];
    pres.forEach((d) => {
      const v = d.data();
      const at = v.updatedAt?.toMillis?.() ?? Number(v.updatedAt || 0);
      if (at && t - at > HOUSE.PRESENCE_ACTIVE_MS) return;
      people.push({ uid: d.id, displayName: v.displayName || 'Oyuncu', avatar: v.avatar || null, x: num(v.x) ?? 0, z: num(v.z) ?? 0, left: !!v.left, seat: typeof v.seat === 'string' ? v.seat.slice(0, 40) : null });
    });
    return {
      type: 'housePhoto',
      houseId,
      houseName: h.name || 'Ev',
      design: { items: (h.items || []).filter((it) => it.p === 1).slice(0, 300), wall: h.wall || null, floor: h.floor || null },
      people,
      cam: { px, py, pz, dx, dy, dz, fov: Math.max(30, Math.min(80, fov)) },
    };
  }

  async function kick(uid, p) {
    const houseId = String(p.houseId || '');
    const target = String(p.uid || '');
    if (!isUid(target) || target === uid) fail('invalid-argument', 'Geçersiz oyuncu.');
    const h = await loadOwnedHouse(uid, houseId);
    void h;
    const pres = await presenceRef(target).get();
    const batch = db.batch();
    batch.update(houseRef(houseId), { [`kicked.${target}`]: now() + HOUSE.KICK_MS, [`invites.${target}`]: FieldValue.delete() });
    if (pres.exists && pres.data()?.houseId === houseId) batch.delete(presenceRef(target));
    await batch.commit();
    return { ok: true };
  }

  // ---- sohbet ------------------------------------------------------------------------
  async function chat(uid, p) {
    const houseId = String(p.houseId || '');
    const text = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, HOUSE.CHAT_MAX);
    if (!text) fail('invalid-argument', 'Boş mesaj.');
    await assertCanSpeak(uid);
    const h = await loadHouse(houseId);
    const pSnap = await presentIn(uid, houseId);
    if (!pSnap && h.ownerUid !== uid) fail('permission-denied', 'Bu evde değilsin.');
    const last = Number(pSnap?.data()?.lastChatMs || 0);
    if (now() - last < HOUSE.CHAT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş 🙂');
    const uSnap = await userRef(uid).get();
    await houseRef(houseId).collection('chat').doc().set({ uid, name: nameOf(uSnap.data()), text, createdAtMs: now(), createdAt: FieldValue.serverTimestamp() });
    if (pSnap) await presenceRef(uid).update({ lastChatMs: now() }).catch(() => {});
    if (Math.random() < 0.04) {
      const all = await houseRef(houseId).collection('chat').orderBy('createdAtMs', 'desc').limit(HOUSE.CHAT_KEEP + 100).get();
      const extra = all.docs.slice(HOUSE.CHAT_KEEP);
      if (extra.length) {
        const b = db.batch();
        extra.forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }
    return { ok: true };
  }

  // ---- eşyadan ürün al (yiyecek/içecek/silah) -----------------------------------------
  async function take(uid, p) {
    const houseId = String(p.houseId || '');
    const itemId = String(p.itemId || '');
    const product = String(p.product || '');
    const h = await loadHouse(houseId);
    const it = (h.items || []).find((x) => x.i === itemId);
    if (!it) fail('not-found', 'Eşya bulunamadı.');
    if (it.p !== 1) fail('failed-precondition', 'Bu eşya henüz satın alınmamış (deneme).');
    if (!(HOUSE_TAKEABLES[it.k] || []).includes(product) || !HOUSE_PRODUCTS[product]) fail('invalid-argument', 'Bu eşyadan bu ürün alınamaz.');
    const pres = await presentIn(uid, houseId);
    if (!pres) fail('failed-precondition', 'Bu evde değilsin.');
    const t = now();
    const batch = db.batch();
    batch.set(heldRef(uid), { itemId: product, venue: 'ev', houseId, untilMs: t + HOUSE.HELD_MS, boughtAtMs: t });
    batch.update(presenceRef(uid), { holding: product });
    await batch.commit();
    return { ok: true, product, label: HOUSE_PRODUCTS[product].label, untilMs: t + HOUSE.HELD_MS };
  }

  // ---- müzik kutusu (evdeki herkes aynı şarkıyı duyar) ---------------------------------
  async function music(uid, p) {
    const houseId = String(p.houseId || '');
    const itemId = String(p.itemId || '');
    const h = await loadHouse(houseId);
    const it = (h.items || []).find((x) => x.i === itemId);
    if (!it || it.k !== 'jukebox') fail('not-found', 'Müzik kutusu bulunamadı.');
    if (it.p !== 1) fail('failed-precondition', 'Müzik kutusu henüz satın alınmamış.');
    if (!(await presentIn(uid, houseId)) && h.ownerUid !== uid) fail('failed-precondition', 'Bu evde değilsin.');
    const track = p.track === null || p.track === undefined ? null : Number(p.track);
    if (track !== null && !(Number.isInteger(track) && track >= 0 && track < 3)) fail('invalid-argument', 'Geçersiz şarkı.');
    const u = (await userRef(uid).get()).data();
    await houseRef(houseId).update({ music: track === null ? null : { itemId, track, byName: nameOf(u), atMs: now() } });
    return { ok: true };
  }

  const houseAction = onCall(async (request) => {
    const uid = requireAuth(request);
    const p = request.data || {};
    switch (p.op) {
      case 'buy':
        return buy(uid, p);
      case 'enter':
        return enter(uid, p);
      case 'save':
        return save(uid, p);
      case 'quote':
        return quote(uid, p);
      case 'checkout':
        return checkout(uid, p);
      case 'settings':
        return settings(uid, p);
      case 'invite':
        return invite(uid, p);
      case 'kick':
        return kick(uid, p);
      case 'chat':
        return chat(uid, p);
      case 'take':
        return take(uid, p);
      case 'music':
        return music(uid, p);
      default:
        return fail('invalid-argument', 'Bilinmeyen işlem.');
    }
  });

  async function expirePresence(maxAgeMs, Timestamp) {
    const cutoff = Timestamp.fromMillis(now() - maxAgeMs);
    const stale = await db.collection('housePresence').where('updatedAt', '<', cutoff).get();
    await Promise.all(stale.docs.map((d) => d.ref.delete()));
    return stale.size;
  }

  return { houseAction, expirePresence, quoteOf, buildPhotoAttachment };
}
