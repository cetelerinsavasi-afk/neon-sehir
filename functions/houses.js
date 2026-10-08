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
import { BIZ_TYPES, BIZ_DEFAULT_NAME, checkBizRequirements } from './businessCatalogData.js';
import { MENU_TYPES, isMenuProduct } from './venue.js';

// v77 — Ev → İşletme. houses/{id} üzerine eklenen alanlar:
//   biz: { type, openedAtMs } | null   — açık işletme (yoksa ev)
//   bizType: string | null             — sorgu için düz alan (biz.type ile aynı)
//   bizIntent: string | null           — "İşletme aç" ekranından alınan evin hedef türü
//   bizRank: number                    — dünkü kazanç sırası (1 = en çok); kazanç gizli
//   bizLockUntilMs: number             — ödenmiş/bitmemiş hizmet (spor/internet) varken
//                                        gerekli mobilyalar kaldırılamaz
// businessInventories/{houseId}        — { ownerUid, type, materials:{k:adet} }
//   İşletme kapanınca içindekiler sahibin envanterine döner (bizHooks.onClose
//   ile silah/araç gibi ek türler sonraki fazlarda eklenir).

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
const PHOTO_BUBBLE_MS = 9000;
const PHOTO_SHOT_MAX_AGO_MS = 10 * 60 * 1000;
const KEY_RE = /^[a-zA-Z0-9_]{1,32}$/;
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
export function createHouses({ db, FieldValue, HttpsError, requireAuth, onCall, isAdmin, assertCanSpeak, isFriend, now = () => Date.now(), bizHooks = {} }) {
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
    // v77: "İşletme aç" ekranından alınan ev — mobilyalar tamamlanana kadar EV'dir;
    // bizIntent sadece hangi işletmeye hazırlandığını hatırlatır.
    const bizIntent = p.bizIntent && BIZ_TYPES[p.bizIntent] ? p.bizIntent : null;
    // v68: ev sayısı sınırı yok — oyuncu istediği kadar ev alabilir.
    const name = p.name ? cleanHouseName(p.name) : bizIntent ? cleanHouseName(BIZ_DEFAULT_NAME(user.displayName, bizIntent)) || defaultHouseName(user.displayName) : defaultHouseName(user.displayName);
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
        biz: null,
        bizType: null,
        bizIntent,
        createdAtMs: now(),
        updatedAtMs: now(),
      });
      tx.set(userRef(uid).collection('messages').doc(), {
        from: 'Emlak',
        text: bizIntent
          ? `Hayırlı olsun! "${name}" artık senin. ${BIZ_TYPES[bizIntent].icon} Gerekli mobilyaları yerleştir, ⚙️ Ayarlar › İşletmeler'den aç.`
          : `Hayırlı olsun! "${name}" artık senin. Haritadan Ev'e tıklayıp evine girebilir, Tasarla ile döşeyebilirsin. 🏠`,
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
    // v77: işletmeler her zaman herkese açıktır
    if (h.biz) return { ok: true };
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

  // ---- işletme (v77) ------------------------------------------------------------------
  const bizInvRef = (houseId) => db.collection('businessInventories').doc(houseId);

  // Gerekli mobilyaları kaldırmayı engelleyen durumlar: içeride (sahip dışında)
  // aktif müşteri var ya da ödenmiş ama bitmemiş hizmet (bizLockUntilMs) var.
  // tx verilirse sorgu transaction içinde okunur (OKUMALAR yazmalardan önce).
  async function bizLockState(houseId, h, tx = null) {
    const t = now();
    const q = db.collection('housePresence').where('houseId', '==', houseId).limit(40);
    const snap = tx ? await tx.get(q) : await q.get();
    let people = 0;
    snap.forEach((d) => {
      if (d.id === h.ownerUid) return;
      const v = d.data();
      const at = v.updatedAt?.toMillis?.() ?? Number(v.updatedAt || 0);
      if (at && t - at > HOUSE.PRESENCE_ACTIVE_MS) return;
      people += 1;
    });
    const untilMs = Math.max(0, Number(h.bizLockUntilMs || 0));
    return { locked: people > 0 || untilMs > t, people, untilMs: untilMs > t ? untilMs : 0 };
  }

  // İşletme envanterini oku (transaction içinde, yazmalardan ÖNCE çağrılmalı)
  async function readBizInv(tx, houseId) {
    const s = await tx.get(bizInvRef(houseId));
    return s.exists ? s.data() : null;
  }
  // İşletmeyi kapat: içindekiler sahibin envanterine döner, ev yeniden "ev" olur.
  // Sadece YAZMA yapar (okumalar önceden yapılmış olmalı: bizInv + hook okumaları).
  function writeBizClose(tx, { houseId, h, bizInv, hookState }) {
    const returned = { materials: {} };
    Object.entries(bizInv?.materials || {}).forEach(([k, n]) => {
      const q = Math.max(0, Math.floor(Number(n) || 0));
      if (!q) return;
      returned.materials[k] = q;
      tx.set(userRef(h.ownerUid).collection('inventory').doc(k), { quantity: FieldValue.increment(q) }, { merge: true });
    });
    // merge YOK: eski malzeme anahtarları tamamen silinmeli (yoksa iki kez iade edilir)
    if (bizInv) tx.set(bizInvRef(houseId), { ownerUid: h.ownerUid, type: null, materials: {}, updatedAtMs: now() });
    if (bizHooks.onCloseWrite) Object.assign(returned, bizHooks.onCloseWrite(tx, { houseId, h, state: hookState }) || {});
    tx.update(houseRef(houseId), { biz: null, bizType: null, bizRank: FieldValue.delete(), updatedAtMs: now() });
    return returned;
  }
  async function readBizCloseState(tx, houseId, h) {
    const bizInv = await readBizInv(tx, houseId);
    const hookState = bizHooks.onCloseRead ? await bizHooks.onCloseRead(tx, { houseId, h }) : null;
    return { bizInv, hookState };
  }

  // Yeni tasarım açık işletmenin şartını bozuyorsa: kilit varsa reddet, sahip
  // onay vermediyse reddet (istemci uyarıyı gösterir), aksi halde işletmeyi kapat.
  // Döner: kapanış bilgisi ya da null. (Tüm okumalar burada, yazmalar çağırana kalır.)
  async function guardBizDesign(tx, { houseId, h, items, allowBizClose }) {
    if (!h.biz?.type) return null;
    if (checkBizRequirements(h.biz.type, items).ok) return null;
    const lock = await bizLockState(houseId, h, tx);
    if (lock.locked) fail('failed-precondition', `biz-locked:${lock.people}:${lock.untilMs}`);
    if (!allowBizClose) fail('failed-precondition', 'biz-required');
    return readBizCloseState(tx, houseId, h);
  }

  async function bizOpen(uid, p) {
    const houseId = String(p.houseId || '');
    const type = String(p.type || '');
    if (!BIZ_TYPES[type]) fail('invalid-argument', 'Geçersiz işletme türü.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu ev senin değil.');
      if (h.biz?.type) fail('failed-precondition', h.biz.type === type ? 'Bu işletme zaten açık.' : 'Bir ev aynı anda tek işletme olabilir.');
      if (!checkBizRequirements(type, h.items).ok) fail('failed-precondition', 'biz-required');
      const bizInv = await readBizInv(tx, houseId);
      tx.update(houseRef(houseId), {
        biz: { type, openedAtMs: now() },
        bizType: type,
        bizIntent: null,
        privacy: 'public',
        // v77: yeni açılan spor salonu bonussuz başlar (ilk 19:00 da sayılmaz)
        ...(type === 'spor' ? { gymBonusDay: null } : {}),
        updatedAtMs: now(),
      });
      tx.set(bizInvRef(houseId), { ownerUid: uid, type, materials: bizInv?.materials || {}, updatedAtMs: now() }, { merge: true });
      result = { ok: true, type };
    });
    return result;
  }

  // v77 — "Hepsini al" (işletme aç ekranı): eksik mobilyaları envantere satın al.
  // p: { items:{ key: adet }, expect:{ gold, gem } }
  async function buyItems(uid, p) {
    const want = {};
    let total = 0;
    Object.entries(p.items || {}).forEach(([k, n]) => {
      const q = Math.floor(Number(n) || 0);
      if (!KEY_RE.test(k) || !ITEM_PRICES[k] || q < 1 || q > 20) fail('invalid-argument', 'Geçersiz eşya.');
      want[k] = q;
      total += q;
    });
    if (!total || total > 40) fail('invalid-argument', 'Geçersiz sepet.');
    let gold = 0;
    let gem = 0;
    Object.entries(want).forEach(([k, q]) => {
      const pr = ITEM_PRICES[k];
      if (pr.t === 'gem') gem += pr.v * q;
      else gold += pr.v * q;
    });
    const exp = p.expect || {};
    if (Number(exp.gold) !== gold || Number(exp.gem) !== gem) fail('aborted', 'Sepet tutarı değişti, lütfen tekrar kontrol et.');
    await db.runTransaction(async (tx) => {
      const us = await tx.get(userRef(uid));
      const user = us.data() || {};
      if (Number(user.gold || 0) < gold) fail('failed-precondition', 'gold');
      if (Number(user.emerald || 0) < gem) fail('failed-precondition', 'gem');
      const patch = {};
      if (gold) patch.gold = FieldValue.increment(-gold);
      if (gem) patch.emerald = FieldValue.increment(-gem);
      tx.update(userRef(uid), patch);
      tx.set(invRef(uid), { items: Object.fromEntries(Object.entries(want).map(([k, q]) => [k, FieldValue.increment(q)])), updatedAtMs: now() }, { merge: true });
    });
    return { ok: true, gold, gem, items: want };
  }

  // v77 — mevcut evi bir işletmeye hazırla (aç ekranındaki "evini çevir" önerisi)
  async function setBizIntent(uid, p) {
    const houseId = String(p.houseId || '');
    const type = p.type === null ? null : String(p.type || '');
    if (type !== null && !BIZ_TYPES[type]) fail('invalid-argument', 'Geçersiz işletme türü.');
    const h = await loadOwnedHouse(uid, houseId);
    if (h.biz?.type) fail('failed-precondition', 'Bu ev zaten bir işletme.');
    await houseRef(houseId).update({ bizIntent: type, updatedAtMs: now() });
    return { ok: true, houseId, type };
  }

  async function bizClose(uid, p) {
    const houseId = String(p.houseId || '');
    let result = null;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu ev senin değil.');
      if (!h.biz?.type) fail('failed-precondition', 'Bu ev zaten işletme değil.');
      const lock = await bizLockState(houseId, h, tx);
      if (lock.locked) fail('failed-precondition', `biz-locked:${lock.people}:${lock.untilMs}`);
      const st = await readBizCloseState(tx, houseId, h);
      const returned = writeBizClose(tx, { houseId, h, ...st });
      result = { ok: true, closed: h.biz.type, returned };
    });
    return result;
  }

  // İstemcinin uyarı ekranı için: kilit durumu + kapanırsa sahibine dönecekler
  async function bizStatus(uid, p) {
    const houseId = String(p.houseId || '');
    const h = await loadOwnedHouse(uid, houseId);
    const lock = await bizLockState(houseId, h);
    const invSnap = await bizInvRef(houseId).get();
    const materials = invSnap.exists ? invSnap.data().materials || {} : {};
    const extra = bizHooks.statusExtra ? await bizHooks.statusExtra({ houseId, h }) : {};
    return { ok: true, type: h.biz?.type || null, lock, returns: { materials, ...extra } };
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
      const closing = await guardBizDesign(tx, { houseId, h, items: design.items, allowBizClose: p.allowBizClose === true });
      const { items, invItems } = applyDesignTx(tx, { houseId, h, inv, uid, design });
      // Kaplama: sadece sahip olunan uygulanır; değilse eskisi kalır (önizleme istemcide).
      const wall = design.wall && ownsSurface(inv, 'wall', design.wall) ? design.wall : h.wall || FREE_SURFACES.wall[0];
      const floor = design.floor && ownsSurface(inv, 'floor', design.floor) ? design.floor : h.floor || FREE_SURFACES.floor[0];
      let closed = null;
      if (closing) closed = { type: h.biz.type, returned: writeBizClose(tx, { houseId, h, ...closing }) };
      tx.update(houseRef(houseId), { items, wall, floor, updatedAtMs: now() });
      // Envanter belgesi küçük: tamamı tek yazımla (silinen anahtarlar da gider)
      tx.set(invRef(uid), { items: invItems, walls: inv.walls || [], floors: inv.floors || [], updatedAtMs: now() });
      result = { ok: true, count: items.length, wall, floor, ...(closed ? { bizClosed: closed } : {}) };
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
      const items = design.items.map((it) => ({ ...it, p: 1 }));
      // v77: satın alma sırasında gerekli bir mobilya kaldırılmışsa işletme kuralı
      const closing = await guardBizDesign(tx, { houseId, h, items, allowBizClose: p.allowBizClose === true });
      // Önce mevcut (satın alınmış) eşyaların envanter farkını uygula, sonra denemeleri satın al.
      const { invItems } = applyDesignTx(tx, { houseId, h, inv, uid, design });
      if (closing) writeBizClose(tx, { houseId, h, ...closing });
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
      // v77: işletme her zaman herkese açık
      if (h.biz && p.privacy !== 'public') fail('failed-precondition', 'İşletmeler her zaman herkese açıktır.');
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
    // v71 — çekim anının en/boy oranı (paylaşılan kare aynı açıyla çizilir) ve
    // ekran genişliği (etiket ölçeği). Eski istemciler göndermez → kare (1).
    const aspect = num(c.a) !== null ? Math.max(0.4, Math.min(2.5, c.a)) : 1;
    const cw = num(c.cw) !== null ? Math.round(Math.max(200, Math.min(2000, c.cw))) : 400;
    const pres = await db.collection('housePresence').where('houseId', '==', houseId).limit(16).get();
    const t = now();
    const people = [];
    pres.forEach((d) => {
      const v = d.data();
      const at = v.updatedAt?.toMillis?.() ?? Number(v.updatedAt || 0);
      if (at && t - at > HOUSE.PRESENCE_ACTIVE_MS) return;
      // v77 — elindeki yiyecek/içecek fotoğrafta da görünsün
      const holding = typeof v.holding === 'string' && HOUSE_PRODUCTS[v.holding] ? v.holding : null;
      people.push({ uid: d.id, displayName: v.displayName || 'Oyuncu', avatar: v.avatar || null, x: num(v.x) ?? 0, z: num(v.z) ?? 0, left: !!v.left, seat: typeof v.seat === 'string' ? v.seat.slice(0, 40) : null, ...(holding ? { holding } : {}) });
    });
    // v71 — çekim anında ekranda olan mesaj balonları (sunucudaki ev
    // sohbetinden; istemci metin gönderemez). Balon ekranda 9 sn kalır.
    const ago = num(a?.shotAgoMs);
    if (ago !== null && people.length) {
      const shotAt = t - Math.max(0, Math.min(PHOTO_SHOT_MAX_AGO_MS, ago));
      try {
        const cs = await houseRef(houseId).collection('chat').where('createdAtMs', '>=', shotAt - PHOTO_BUBBLE_MS).orderBy('createdAtMs', 'asc').limit(60).get();
        const byUid = {};
        cs.forEach((d) => {
          const m = d.data();
          if (!m || typeof m.text !== 'string' || Number(m.createdAtMs) > shotAt + 500) return;
          (byUid[m.uid] = byUid[m.uid] || []).push(m.text.slice(0, HOUSE.CHAT_MAX));
        });
        people.forEach((pp) => {
          if (byUid[pp.uid]) pp.says = byUid[pp.uid].slice(-3);
        });
      } catch {
        /* balonlar olmadan devam */
      }
    }
    return {
      type: 'housePhoto',
      houseId,
      houseName: h.name || 'Ev',
      design: { items: (h.items || []).filter((it) => it.p === 1).slice(0, 300), wall: h.wall || null, floor: h.floor || null },
      people,
      cam: { px, py, pz, dx, dy, dz, fov: Math.max(30, Math.min(80, fov)), a: aspect, cw },
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
    // v77: cafe/bar işletmesinde yiyecek-içecek müşteriye ücretsiz değil → menüden alınır
    if (h.biz?.type && MENU_TYPES.includes(h.biz.type) && isMenuProduct(product) && h.ownerUid !== uid) fail('failed-precondition', 'biz-menu');
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
      case 'bizOpen':
        return bizOpen(uid, p);
      case 'bizClose':
        return bizClose(uid, p);
      case 'bizStatus':
        return bizStatus(uid, p);
      case 'buyItems':
        return buyItems(uid, p);
      case 'bizIntent':
        return setBizIntent(uid, p);
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

  return { houseAction, expirePresence, quoteOf, buildPhotoAttachment, bizLockState };
}
