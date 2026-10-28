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

import { sanitizeOverlay, overlayText } from './photoOverlay.js';
import {
  HOUSE_PRICE,
  MAX_ITEMS_PER_HOUSE,
  ITEM_PRICES,
  FREE_SURFACES,
  SURFACE_KEYS,
  surfacePrice,
  HOUSE_TAKEABLES,
  HOUSE_PRODUCTS,
  VENUE_FREE_TAKE_KEYS,
} from './houseCatalogData.js';
import { BIZ_TYPES, BIZ_DEFAULT_NAME, checkBizRequirements } from './businessCatalogData.js';
import { MENU_TYPES, isMenuProduct } from './venue.js';
import { goldTag } from './moneyLog.js';
import { houseKind, officePriceOf, isLegacyHomeOffice } from './officeData.js';
import { VENUES, VENUE_OWNER, camiiDynamicNpcs } from './venueLayouts.js';
import { doorOf, doorSpawn, settleDoor } from './houseDoor.js';
import { MATERIAL_HOLDER_BIZ, readHoldings, readMaterialInv, closeBlockMaterials } from './materials.js';
import { createFurnMarket } from './furnMarket.js';
import { cleanBotConfig, BOT_ITEM_KEY, botAvatar, botDefaults, botLabel, botAllowedLines } from './botData.js';

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
// v92 — ev/işletme tasarımına yetkili arkadaş sayısı sınırı
export const MAX_EDITORS = 20;
export const isEditorOf = (h, uid) => Boolean(uid && h?.editors?.[uid] === true && h.ownerUid !== uid);

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
    // v132 — pazardan konan deneme eşyası: ilan kimliği (satın alınınca kalkar)
    else if (typeof it.m === 'string' && /^[A-Za-z0-9]{1,40}$/.test(it.m)) row.m = it.m;
    out.push(row);
  }
  const wall = KEY_RE.test(String(d.wall || '')) && SURFACE_KEYS.wall.includes(d.wall) ? d.wall : null;
  const floor = KEY_RE.test(String(d.floor || '')) && SURFACE_KEYS.floor.includes(d.floor) ? d.floor : null;
  // v101 — giriş kapısı (ücretsiz; null = değişmedi)
  const door = d.door && typeof d.door === 'object' && !Array.isArray(d.door) ? pickDoor(d.door) : null;
  return { items: out, wall, floor, door };
}

// v102 — istemcinin gönderdiği kapı alanları (eksik alanlar evdeki kapıdan gelir)
function pickDoor(v) {
  const out = {};
  ['w', 'x', 't', 'def', 'main'].forEach((k) => {
    if (v[k] !== undefined) out[k] = v[k];
  });
  return out;
}
const mergeDoor = (h, d) => ({ ...doorOf(h), ...(d || {}) });

const countOwned = (items) => {
  const m = {};
  (items || []).forEach((it) => {
    if (it.p === 1) m[it.k] = (m[it.k] || 0) + 1;
  });
  return m;
};
const ownsSurface = (inv, type, key) => FREE_SURFACES[type].includes(key) || (inv?.[type === 'wall' ? 'walls' : 'floors'] || []).includes(key);

// deps: { db, FieldValue, HttpsError, requireAuth, onCall, isAdmin, assertCanSpeak, isFriend, now? }
export function createHouses({ db, FieldValue, HttpsError, requireAuth, onCall, isAdmin, assertCanSpeak, isFriend, now = () => Date.now(), bizHooks = {}, visits = null, officeMigrate = null }) {
  const furn = createFurnMarket({ db, FieldValue, HttpsError, now }); // v132 mobilya pazarı
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const invRef = (uid) => db.collection('houseInventories').doc(uid);
  const fundRef = (houseId) => db.collection('houseFunds').doc(houseId); // v127 mobilya kasası
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
    if (p.name) await assertCanSpeak(uid, p.name);
    const ref = db.collection('houses').doc();
    await db.runTransaction(async (tx) => {
      const u = await tx.get(userRef(uid));
      const gold = Number(u.data()?.gold || 0);
      if (gold < HOUSE_PRICE) fail('failed-precondition', `Yetersiz altın. Ev ${HOUSE_PRICE.toLocaleString('tr-TR')} altın.`);
      tx.update(userRef(uid), { gold: FieldValue.increment(-HOUSE_PRICE), goldTag: goldTag('ev'), houseCount: FieldValue.increment(1) });
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
        kind: 'depo', // v100: 10 mobilyaya kadar depo
        createdAtMs: now(),
        updatedAtMs: now(),
      });
      tx.set(userRef(uid).collection('messages').doc(), {
        from: 'Emlak',
        text: bizIntent
          ? `Hayırlı olsun! "${name}" artık senin. ${BIZ_TYPES[bizIntent].icon} Gerekli mobilyaları yerleştir, ⚙️ Ayarlar › ${BIZ_TYPES[bizIntent].ho ? 'Home Ofisler' : 'İşletmeler'}'den aç.`
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
    // v92 Faz 8: oyunun 3D mekânları (camii, banka, gazino…) herkese açık
    if (h.venue) return { ok: true };
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
    let h = await loadHouse(houseId);
    // v100 — eski home ofis (mescit/sinema/stüdyo) ilk girişte ofise taşınır
    if (officeMigrate && isLegacyHomeOffice(h)) {
      await officeMigrate(houseId).catch((e) => console.error('office migrate (enter)', houseId, e));
      h = await loadHouse(houseId);
    }
    // Gizliye çekilse bile o an içeride olan atılmaz (yeniden bağlanma dahil).
    const already = await presentIn(uid, houseId);
    if (!already) {
      const c = await canEnter(uid, h);
      if (!c.ok) fail('permission-denied', c.msg);
    }
    const user = (await userRef(uid).get()).data() || {};
    const spawn = doorSpawn(h.door, h.items); // v102: ana kapının önünde doğ
    await presenceRef(uid).set({
      houseId,
      displayName: nameOf(user),
      avatar: user.avatar || null,
      x: spawn.x,
      z: spawn.z,
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
    // v77: ziyaret sayacı (hesap başına günde 1)
    if (!already && visits) await visits.recordHouseVisit(uid, houseId, { ...h, ...patch });
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
    tx.update(houseRef(houseId), { biz: null, bizType: null, bizRank: FieldValue.delete(), kind: houseKind({ ...h, biz: null, bizType: null }), updatedAtMs: now() });
    return returned;
  }
  async function readBizCloseState(tx, houseId, h) {
    const bizInv = await readBizInv(tx, houseId);
    const hookState = bizHooks.onCloseRead ? await bizHooks.onCloseRead(tx, { houseId, h }) : null;
    // v124: silahçı / modifiyeci kapanınca KALAN fabrika/işletmelerin kullanamayacağı
    // malzeme ortak envanterde varsa kapanmaz (önce Mağaza'da anında satılmalı)
    const materialBlock = await materialCloseBlock(houseId, h, tx);
    if (materialBlock.length) fail('failed-precondition', `biz-close-materials:${materialBlock.join(',')}`);
    return { bizInv, hookState };
  }
  async function materialCloseBlock(houseId, h, tx = null) {
    if (!MATERIAL_HOLDER_BIZ.includes(h?.biz?.type) || !h.ownerUid) return [];
    const listedQ = db.collection('marketplaceListings').where('sellerId', '==', h.ownerUid).where('itemType', '==', 'material').where('sold', '==', false).limit(20);
    const [holdings, inv, listed] = await Promise.all([
      readHoldings(db, h.ownerUid, { tx, excludeHouseId: houseId }),
      readMaterialInv(db, h.ownerUid, { tx }),
      tx ? tx.get(listedQ) : listedQ.get(),
    ]);
    // Mağaza'daki açık ilanlar da sayılır (iptal edilince envantere döner)
    listed.docs.forEach((d) => {
      const l = d.data();
      if (l.cancelled) return;
      if (inv[l.materialType] != null) inv[l.materialType] += Math.max(0, Math.floor(Number(l.quantity) || 0));
    });
    return closeBlockMaterials(holdings, inv);
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
    // v100: home ofisler kalktı — mescit/sinema/stüdyo yerine ücretli mobilyalar (ofis)
    if (BIZ_TYPES[type].ho) fail('failed-precondition', 'Home ofisler artık ofis: ücretli mobilyalarını Ayarlar › Ücretli Ürünler\'den aç.');
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
        kind: 'isletme',
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
      if (gold) {
        patch.gold = FieldValue.increment(-gold);
        patch.goldTag = goldTag('mobilya');
      }
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
    const materialBlock = await materialCloseBlock(houseId, h); // v124
    return { ok: true, type: h.biz?.type || null, lock, materialBlock, returns: { materials, ...extra } };
  }

  async function save(uid, p) {
    const houseId = String(p.houseId || '');
    const design = clean(p.design);
    let result = null;
    // v92 — yetkili arkadaş da kaydedebilir: sahibinin envanterini kullanır, satın
    // alamaz (deneme eşyalar deneme kalır), işletmeyi kapatamaz. Evde olmalı.
    const pre = await loadHouse(houseId);
    const asEditor = pre.ownerUid !== uid && isEditorOf(pre, uid);
    if (asEditor && !(await presentIn(uid, houseId))) fail('failed-precondition', 'Tasarlamak için evde olmalısın.');
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      const editor = h.ownerUid !== uid && isEditorOf(h, uid);
      if (h.ownerUid !== uid && !editor) fail('permission-denied', 'Bu ev senin değil.');
      const invUid = h.ownerUid;
      const is = await tx.get(invRef(invUid));
      const inv = is.exists ? is.data() : {};
      const closing = await guardBizDesign(tx, { houseId, h, items: design.items, allowBizClose: !editor && p.allowBizClose === true });
      const { items, invItems } = applyDesignTx(tx, { houseId, h, inv, uid: invUid, design });
      // Kaplama: sadece sahip olunan uygulanır; değilse eskisi kalır (önizleme istemcide).
      const wall = design.wall && ownsSurface(inv, 'wall', design.wall) ? design.wall : h.wall || FREE_SURFACES.wall[0];
      const floor = design.floor && ownsSurface(inv, 'floor', design.floor) ? design.floor : h.floor || FREE_SURFACES.floor[0];
      let closed = null;
      if (closing) closed = { type: h.biz.type, returned: writeBizClose(tx, { houseId, h, ...closing }) };
      const kind = houseKind({ ...h, items, ...(closed ? { biz: null, bizType: null } : {}) });
      const door = settleDoor(mergeDoor(h, design.door), items); // v102: ana kapı kuralları
      tx.update(houseRef(houseId), { items, wall, floor, kind, door, updatedAtMs: now(), ...(editor ? { lastEditBy: uid } : {}) });
      // Envanter belgesi küçük: tamamı tek yazımla (silinen anahtarlar da gider)
      tx.set(invRef(invUid), { items: invItems, walls: inv.walls || [], floors: inv.floors || [], updatedAtMs: now() });
      result = { ok: true, count: items.length, wall, floor, ...(closed ? { bizClosed: closed } : {}), ...(editor ? { inv: { items: invItems, walls: inv.walls || [], floors: inv.floors || [] } } : {}) };
    });
    return result;
  }

  // ---- sepeti tamamla ---------------------------------------------------------------
  // v132: pre = furn.readForCheckout (pazar ilanları) — pazardan konan eşya ilan fiyatıyla;
  // ilanı kapanmışsa (satıldı / iptal) sepete girmez ve satın alınmaz.
  function quoteOf(h, design, inv, pre = null) {
    let gold = 0;
    let gem = 0;
    const lines = {};
    const add = (price, label) => {
      if (!price) return;
      if (price.t === 'gem') gem += price.v;
      else gold += price.v;
      lines[label] = (lines[label] || 0) + 1;
    };
    const market = [];
    const drop = new Set();
    design.items
      .filter((it) => it.p !== 1)
      .forEach((it) => {
        if (it.m) {
          const l = pre ? furn.marketOf(pre, it) : null;
          if (!l || market.includes(l.id)) {
            drop.add(it.i);
            return;
          }
          market.push(l.id);
          add({ t: l.t, v: l.v }, `m:${l.id}`);
          return;
        }
        add(ITEM_PRICES[it.k], it.k);
      });
    const surfaces = [];
    if (design.wall && !ownsSurface(inv, 'wall', design.wall)) {
      add(surfacePrice('wall', design.wall), `wall:${design.wall}`);
      surfaces.push(['wall', design.wall]);
    }
    if (design.floor && !ownsSurface(inv, 'floor', design.floor)) {
      add(surfacePrice('floor', design.floor), `floor:${design.floor}`);
      surfaces.push(['floor', design.floor]);
    }
    return { gold, gem, lines, surfaces, market, drop };
  }

  // v127: yetkili (tasarımcı) da satın alabilir — SADECE sahibin bu mekân için
  // koyduğu mobilya kasasından (houseFunds/{houseId}). Eşyalar sahibine aittir.
  async function checkout(uid, p) {
    const houseId = String(p.houseId || '');
    const design = clean(p.design);
    let result = null;
    const pre = await loadHouse(houseId);
    const asEditor = pre.ownerUid !== uid && isEditorOf(pre, uid);
    if (asEditor && !(await presentIn(uid, houseId))) fail('failed-precondition', 'Satın almak için mekânda olmalısın.');
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      const editor = h.ownerUid !== uid && isEditorOf(h, uid);
      if (h.ownerUid !== uid && !editor) fail('permission-denied', 'Bu ev senin değil.');
      const owner = h.ownerUid;
      const [is, us, fs] = await Promise.all([tx.get(invRef(owner)), editor ? Promise.resolve(null) : tx.get(userRef(uid)), editor ? tx.get(fundRef(houseId)) : Promise.resolve(null)]);
      const inv = is.exists ? is.data() : {};
      const pre = await furn.readForCheckout(tx, design.items, editor ? owner : uid);
      const q = quoteOf(h, design, inv, pre);
      const exp = p.expect || {};
      if (Number(exp.gold) !== q.gold || Number(exp.gem) !== q.gem) fail('aborted', 'Sepet tutarı değişti, lütfen tekrar kontrol et.');
      if (q.gold === 0 && q.gem === 0) fail('failed-precondition', 'Sepetin boş.');
      const src = editor ? fs.data() || {} : us.data() || {};
      const gold = Number(editor ? src.gold || 0 : src.gold || 0);
      const emerald = Number(editor ? src.gem || 0 : src.emerald || 0);
      const where = editor ? 'Mobilya kasasında yeterli' : 'Yetersiz';
      if (gold < q.gold) fail('failed-precondition', editor ? `${where} altın yok (${gold.toLocaleString('tr-TR')} / ${q.gold.toLocaleString('tr-TR')}).` : `Yetersiz altın (${gold.toLocaleString('tr-TR')} / ${q.gold.toLocaleString('tr-TR')}).`);
      if (emerald < q.gem) fail('failed-precondition', editor ? `${where} zümrüt yok (${emerald} / ${q.gem}).` : `Yetersiz zümrüt (${emerald} / ${q.gem}).`);
      // v132: ilanı kapanmış pazar eşyaları odadan kalkar; alınanların ilan işareti silinir
      const items = design.items.filter((it) => !q.drop.has(it.i)).map(({ m: _m, ...it }) => ({ ...it, p: 1 }));
      // v77: satın alma sırasında gerekli bir mobilya kaldırılmışsa işletme kuralı (yetkili kapatamaz)
      const closing = await guardBizDesign(tx, { houseId, h, items, allowBizClose: !editor && p.allowBizClose === true });
      // Önce mevcut (satın alınmış) eşyaların envanter farkını uygula, sonra denemeleri satın al.
      const { invItems } = applyDesignTx(tx, { houseId, h, inv, uid: owner, design });
      if (closing) writeBizClose(tx, { houseId, h, ...closing });
      furn.writeCheckout(tx, pre, q.market, { buyerUid: editor ? owner : uid, houseId });
      const walls = [...(inv.walls || [])];
      const floors = [...(inv.floors || [])];
      q.surfaces.forEach(([type, key]) => {
        const arr = type === 'wall' ? walls : floors;
        if (!arr.includes(key)) arr.push(key);
      });
      const wall = design.wall || h.wall || FREE_SURFACES.wall[0];
      const floor = design.floor || h.floor || FREE_SURFACES.floor[0];
      if (editor) {
        tx.set(fundRef(houseId), { ownerUid: owner, gold: FieldValue.increment(-q.gold), gem: FieldValue.increment(-q.gem), updatedAtMs: now(), lastBuyBy: uid }, { merge: true });
      } else {
        const userPatch = {};
        if (q.gold) {
          userPatch.gold = FieldValue.increment(-q.gold);
          userPatch.goldTag = goldTag('mobilya');
        }
        if (q.gem) userPatch.emerald = FieldValue.increment(-q.gem);
        tx.update(userRef(uid), userPatch);
      }
      tx.update(houseRef(houseId), { items, wall, floor, kind: houseKind({ ...h, items, ...(closing ? { biz: null, bizType: null } : {}) }), door: settleDoor(mergeDoor(h, design.door), items), updatedAtMs: now(), ...(editor ? { lastEditBy: uid } : {}) });
      tx.set(invRef(owner), { items: invItems, walls, floors, updatedAtMs: now() });
      const cnt = Object.values(q.lines).reduce((a, b) => a + b, 0);
      result = { ok: true, gold: q.gold, gem: q.gem, count: cnt, wall, floor, ...(editor ? { fromFund: true, inv: { items: invItems, walls, floors } } : {}) };
    });
    return result;
  }

  async function quote(uid, p) {
    const houseId = String(p.houseId || '');
    const design = clean(p.design);
    const h = await loadOwnedHouse(uid, houseId);
    const is = await invRef(uid).get();
    const pre = await db.runTransaction((tx) => furn.readForCheckout(tx, design.items, uid)); // v132 (salt okuma)
    const q = quoteOf(h, design, is.exists ? is.data() : {}, pre);
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
      await assertCanSpeak(uid, p);
      patch.name = name;
    }
    if (p.privacy !== undefined) {
      if (!PRIVACY.includes(p.privacy)) fail('invalid-argument', 'Geçersiz tür.');
      // v77: işletme her zaman herkese açık
      if (h.biz && p.privacy !== 'public') fail('failed-precondition', 'İşletmeler her zaman herkese açıktır.');
      if (houseKind(h) === 'ofis' && p.privacy !== 'public') fail('failed-precondition', 'Ofisler her zaman herkese açıktır.');
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

  // v95.3 — camideki imam + bugünkü dilenciler (venueParts ile aynı liste)
  async function camiiNpcsNow() {
    try {
      const dk = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      const today = dk(new Date());
      const [imSnap, bgSnap] = await Promise.all([
        db.collection('imamState').doc('current').get(),
        db.collection('beggars').doc(today).collection('entries').orderBy('createdAt', 'desc').limit(3).get(),
      ]);
      const imam = imSnap.exists ? imSnap.data() : null;
      const at = imam?.lastNasihatAt?.toDate?.() || null;
      const sermon = Boolean(at && dk(at) === today);
      const beggars = bgSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return camiiDynamicNpcs({ imam, sermon, beggars });
    } catch {
      return [];
    }
  }

  // Sixtagram "ev fotoğrafı": o anki tasarım + evdekiler dondurulur (istemci
  // görüntü yükleyemez → uygunsuz görsel riski yok; kare telefonlarda yeniden çizilir).
  function camOf(a) {
    const c = a?.cam || {};
    const nums = ['px', 'py', 'pz', 'dx', 'dy', 'dz', 'fov'].map((k) => num(c[k]));
    if (nums.some((v) => v === null) || nums.slice(0, 3).some((v) => Math.abs(v) > 40)) fail('invalid-argument', 'Geçersiz kamera.');
    const [px, py, pz, dx, dy, dz, fov] = nums;
    // v71 — çekim anının en/boy oranı (paylaşılan kare aynı açıyla çizilir) ve
    // ekran genişliği (etiket ölçeği). Eski istemciler göndermez → kare (1).
    const aspect = num(c.a) !== null ? Math.max(0.4, Math.min(2.5, c.a)) : 1;
    const cw = num(c.cw) !== null ? Math.round(Math.max(200, Math.min(2000, c.cw))) : 400;
    return { px, py, pz, dx, dy, dz, fov, aspect, cw };
  }
  async function buildPhotoAttachment(uid, a) {
    const houseId = String(a?.houseId || '');
    const t = now();
    // v135 — imzalı çekim TAM eki taşıyorsa (photoShot: tasarım + kişiler + kamera)
    // paylaşılan fotoğraf çekimde önizlenenle BİREBİR aynıdır; üstüne yazı/çizim eklenir.
    const signed = await verifyShot(houseId, a, t);
    if (signed?.att && signed.att.type === 'housePhoto' && signed.att.houseId === houseId) {
      const ov = sanitizeOverlay(a?.overlay);
      if (ov.error) fail('invalid-argument', ov.error);
      const text = overlayText(ov.overlay);
      if (text) await assertCanSpeak(uid, text);
      return { ...signed.att, ...(ov.overlay ? { overlay: ov.overlay } : {}) };
    }
    const h = await loadHouse(houseId);
    if (!(await presentIn(uid, houseId))) fail('failed-precondition', 'Fotoğraf için evde olmalısın.');
    const cam = camOf(a);
    // v127 — çekimde imzalı kare varsa (photoShot) kişiler O ANDAN gelir:
    // paylaşana kadar odadan çıkan da fotoğrafta kalır, sonradan giren girmez.
    const people = signed?.people || (await shotPeople(uid, houseId, a, num(a?.shotAgoMs), t));
    return finishPhoto(houseId, h, a, people, cam);
  }

  // Çekim anındaki oyuncular (presence + istemcinin gönderdiği konumlar + balonlar)
  async function shotPeople(uid, houseId, a, ago, t) {
    const pres = await db.collection('housePresence').where('houseId', '==', houseId).limit(16).get();
    const people = [];
    // v85 — çekim ANINDAKİ durum (istemci gönderir): konum, yön, koltuk, yürüme
    // ve o an oynayan hareket (dans...). Eskiden kişiler paylaşım anındaki
    // presence'tan okunuyordu → paylaşılan fotoğraf çekilen kareden farklıydı.
    // Güvenlik: sadece şu an bu evde TAZE presence kaydı olan kişiler; isim/
    // avatar/eldeki ürün yine presence'tan; değerler kelepçelenir.
    const EMOTE_KEYS = ['dans', 'selam', 'alkis', 'zipla', 'kalp'];
    const shot = new Map();
    if (Array.isArray(a?.people)) {
      a.people.slice(0, 16).forEach((q) => {
        if (!q || typeof q.uid !== 'string' || !isUid(q.uid)) return;
        const x = num(q.x);
        const z = num(q.z);
        if (x === null || z === null || Math.abs(x) > 40 || Math.abs(z) > 40) return;
        const em = q.emote && EMOTE_KEYS.includes(q.emote.kind) && num(q.emote.at) !== null ? { kind: q.emote.kind, at: Math.round(Math.max(0, Math.min(3200, q.emote.at))) } : null;
        shot.set(q.uid, {
          x,
          z,
          left: !!q.left,
          seat: typeof q.seat === 'string' && /^[A-Za-z0-9_-]{1,40}:\d{1,2}$/.test(q.seat) ? q.seat : null,
          moving: !!q.moving,
          wp: q.wp ? 1 : 0,
          ...(em ? { emote: em } : {}),
        });
      });
    }
    const useShot = shot.size > 0 && shot.has(uid);
    pres.forEach((d) => {
      const v = d.data();
      const at = v.updatedAt?.toMillis?.() ?? Number(v.updatedAt || 0);
      if (at && t - at > HOUSE.PRESENCE_ACTIVE_MS) return;
      // v77 — elindeki yiyecek/içecek fotoğrafta da görünsün
      const holding = typeof v.holding === 'string' && HOUSE_PRODUCTS[v.holding] ? v.holding : null;
      const base = { uid: d.id, displayName: v.displayName || 'Oyuncu', avatar: v.avatar || null, x: num(v.x) ?? 0, z: num(v.z) ?? 0, left: !!v.left, seat: typeof v.seat === 'string' ? v.seat.slice(0, 40) : null, ...(holding ? { holding } : {}) };
      if (useShot) {
        // çekim anında karede olmayan (sonradan gelen) kişi fotoğrafa girmez
        const s0 = shot.get(d.id);
        if (!s0) return;
        people.push({ ...base, ...s0 });
        return;
      }
      people.push(base);
    });
    // v71 — çekim anında ekranda olan mesaj balonları (sunucudaki ev
    // sohbetinden; istemci metin gönderemez). Balon ekranda 9 sn kalır.
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
    return people;
  }

  // ---- v127: imzalı çekim (photoShot) -------------------------------------------------
  // Deklanşöre basınca sunucu o anki kişileri doğrulayıp HMAC ile imzalar ve
  // istemciye geri verir (Firestore'a yazılmaz). Paylaşımda imza doğrulanırsa
  // kişiler bu kareden alınır — presence/sohbet tekrar okunmaz.
  // node:crypto tembel yüklenir (önizleme bu modülü tarayıcıda da çalıştırır)
  const cryptoP = () => import('node:crypto');
  let shotKeyP = null;
  const shotKey = () =>
    (shotKeyP ||= db
      .collection('serverKeys')
      .doc('housePhoto')
      .get()
      .then(async (d) => {
        const k = d.exists && typeof d.data()?.k === 'string' ? d.data().k : null;
        if (k) return k;
        const nk = (await cryptoP()).randomBytes(32).toString('hex');
        await db.collection('serverKeys').doc('housePhoto').set({ k: nk });
        return nk;
      })
      .catch((e) => {
        shotKeyP = null;
        throw e;
      }));
  const signShot = async (key, body) => (await cryptoP()).createHmac('sha256', key).update(body).digest('hex');

  async function photoShot(uid, p) {
    const houseId = String(p.houseId || '');
    if (!(await presentIn(uid, houseId))) fail('failed-precondition', 'Fotoğraf için evde olmalısın.');
    const t = now();
    const people = await shotPeople(uid, houseId, p, 0, t);
    // v135 — kamera da gelirse (yeni istemci) eki BURADA kurup imzalar: önizleme
    // bu ekle çizilir, paylaşımda aynısı kullanılır (çekilen = paylaşılan).
    if (p.cam) {
      const h = await loadHouse(houseId);
      const att = await finishPhoto(houseId, h, p, people, camOf(p));
      if (p.vert) att.vert = true;
      // v135 — çekimde kameranın önünde saydamlaşan eşyalar fotoğrafta da saydam
      if (Array.isArray(p.fade)) {
        const ids = new Set((att.design?.items || []).map((it) => it.i));
        const fade = p.fade.filter((x) => typeof x === 'string' && ids.has(x)).slice(0, 30);
        if (fade.length) att.fade = fade;
      }
      const body = JSON.stringify({ houseId, at: t, att });
      if (body.length > 190_000) fail('resource-exhausted', 'Fotoğraf çok kalabalık.');
      return { shot: body, sig: await signShot(await shotKey(), body), att };
    }
    const body = JSON.stringify({ houseId, at: t, people });
    return { shot: body, sig: await signShot(await shotKey(), body) };
  }

  async function verifyShot(houseId, a, t) {
    if (typeof a?.shot !== 'string' || typeof a?.sig !== 'string' || a.shot.length > 200_000 || !/^[0-9a-f]{64}$/.test(a.sig)) return null;
    try {
      const { timingSafeEqual } = await cryptoP();
      const want = Buffer.from(await signShot(await shotKey(), a.shot), 'hex');
      const got = Buffer.from(a.sig, 'hex');
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      const s = JSON.parse(a.shot);
      if (s?.houseId !== houseId || !(Array.isArray(s.people) || s.att) || !(t - Number(s.at) <= PHOTO_SHOT_MAX_AGO_MS)) return null;
      return s;
    } catch {
      return null;
    }
  }

  async function finishPhoto(houseId, h, a, people, { px, py, pz, dx, dy, dz, fov, aspect, cw }) {
    // v92 Faz 8: oyunun mekânında NPC'ler de fotoğrafta (veznedar, barmen…)
    // v95.3: camide imam + dilenciler (sunucu verisinden, istemciyle aynı liste)
    // ve çekim anında NPC'lerin ekrandaki balonları — sadece o NPC'nin gerçekten
    // söyleyebileceği cümleler kabul edilir (istemci serbest metin yazamaz).
    const vn = h.venue ? VENUES[h.venue] : null;
    const npcSays = new Map();
    const npcShot = new Map(); // v132.1: botların çekim anındaki konumu (istemci)
    if (Array.isArray(a?.people)) {
      a.people.slice(0, 60).forEach((q) => {
        if (!q || typeof q.uid !== 'string' || !/^npc_[A-Za-z0-9_-]{1,60}$/.test(q.uid)) return;
        if (Array.isArray(q.says)) npcSays.set(q.uid, q.says);
        npcShot.set(q.uid, q);
      });
    }
    // v132.1 — BOTLAR fotoğrafta: ad / avatar / sözler sunucudaki bot ayarından; istemciden
    // sadece konum (kelepçeli), yön, koltuk ve o botun gerçekten söyleyebileceği balonlar.
    const botSrc = vn ? (vn.bots || []).map((b) => ({ i: b.i, x: b.x, z: b.z, cfg: b.cfg })) : (h.items || []).filter((it) => it.k === BOT_ITEM_KEY && it.p === 1).slice(0, 12).map((it) => ({ i: it.i, x: it.x, z: it.z, cfg: h.bots?.[it.i] || null }));
    botSrc.forEach((bt) => {
      const uidB = `npc_bot_${bt.i}`;
      const q = npcShot.get(uidB) || {};
      const qx = num(q.x);
      const qz = num(q.z);
      const okPos = qx !== null && qz !== null && Math.abs(qx) <= 40 && Math.abs(qz) <= 40;
      const allowed = new Set(botAllowedLines(bt.cfg).map((l) => String(l).slice(0, 200)));
      const says = (npcSays.get(uidB) || []).map((x) => String(x)).filter((x) => allowed.has(x)).slice(-3);
      people.push({
        uid: uidB,
        displayName: botLabel(botDefaults(bt.cfg).name),
        avatar: botAvatar(bt.cfg),
        x: okPos ? qx : Number(bt.x) || 0,
        z: okPos ? qz : Number(bt.z) || 0,
        left: !!q.left,
        seat: typeof q.seat === 'string' && /^[A-Za-z0-9_-]{1,40}:\d{1,2}$/.test(q.seat) ? q.seat : null,
        ...(says.length ? { says } : {}),
      });
    });
    if (vn) {
      const npcs = [...(vn.npcs || [])];
      if (h.venue === 'camii') npcs.push(...(await camiiNpcsNow()));
      npcs.forEach((n) => {
        const allowed = new Set((n.lines || []).map((l) => String(l).slice(0, 200)));
        const says = (npcSays.get(n.id) || []).map((x) => String(x)).filter((x) => allowed.has(x)).slice(-3);
        people.push({ uid: n.id, displayName: n.name, avatar: n.av, x: n.x, z: n.z, left: !!n.left, seat: n.seat || null, ...(says.length ? { says } : {}) });
      });
    }
    return {
      type: 'housePhoto',
      houseId,
      houseName: h.name || 'Ev',
      design: { items: (h.items || []).filter((it) => it.p === 1).slice(0, MAX_ITEMS_PER_HOUSE), wall: h.wall || null, floor: h.floor || null },
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
    await assertCanSpeak(uid, text);
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

  // ---- v132 BOT ayarı (Lüks › Bot): görünüm, ad, 3 söz, hareket, garsonluk ---------------
  // houses/{id}.bots = { eşyaKimliği: ayar } — satın alınmış bot eşyası olmalı. Sahip ve
  // tasarım yetkilisi düzenler. Odada olmayan botların eski ayarları temizlenir.
  async function botSet(uid, p) {
    const houseId = String(p.houseId || '');
    const i = String(p.i || '');
    if (!ID_RE.test(i)) fail('invalid-argument', 'Geçersiz bot.');
    const cfg = cleanBotConfig(p.cfg);
    const text = [cfg.n, ...cfg.l].filter(Boolean).join(' · ');
    if (text) await assertCanSpeak(uid, text);
    let result = null;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      if (h.venue) fail('permission-denied', 'Bu mekân düzenlenemez.');
      if (h.ownerUid !== uid && !isEditorOf(h, uid)) fail('permission-denied', 'Bu ev senin değil.');
      const items = h.items || [];
      const it = items.find((x) => x.i === i && x.k === BOT_ITEM_KEY);
      if (!it) fail('failed-precondition', 'bot-unsaved');
      if (it.p !== 1) fail('failed-precondition', 'bot-trial');
      const live = new Set(items.filter((x) => x.k === BOT_ITEM_KEY).map((x) => x.i));
      const bots = {};
      Object.entries(h.bots || {}).forEach(([k, v]) => {
        if (live.has(k)) bots[k] = v;
      });
      bots[i] = cfg;
      tx.update(houseRef(houseId), { bots, updatedAtMs: now() });
      result = { ok: true, cfg };
    });
    return result;
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
    // v92 Faz 8: oyunun mekânlarında eşyadan ücretsiz ürün alınmaz (bar/büfe ücretli)
    // v127: sebil ve çaycı mekânlarda da çalışır
    if (h.venue && !VENUE_FREE_TAKE_KEYS.includes(it.k)) fail('failed-precondition', 'Bu mekânda eşyadan ürün alınmaz.');
    // v77: cafe/bar işletmesinde yiyecek-içecek müşteriye ücretsiz değil → menüden alınır
    if (h.biz?.type && MENU_TYPES.includes(h.biz.type) && isMenuProduct(product) && h.ownerUid !== uid) fail('failed-precondition', 'biz-menu');
    // v100: ofiste ücretli ürün → shopAction officeBuy ile alınır
    const paid = h.ownerUid !== uid ? officePriceOf(h, product) : 0;
    if (paid > 0) fail('failed-precondition', `office-paid:${paid}`);
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

  // ---- v92: tasarım yetkisi -------------------------------------------------------
  // Sahip, arkadaşlarına evini/işletmesini düzenleme yetkisi verir / geri alır.
  async function setEditor(uid, p) {
    const houseId = String(p.houseId || '');
    const target = String(p.uid || '');
    const on = p.on === true;
    if (!isUid(target) || target === uid) fail('invalid-argument', 'Geçersiz oyuncu.');
    const h = await loadOwnedHouse(uid, houseId);
    const cur = Object.keys(h.editors || {}).filter((k) => h.editors[k] === true);
    if (on) {
      if (h.editors?.[target] === true) return { ok: true, on: true };
      if (cur.length >= MAX_EDITORS) fail('resource-exhausted', `En fazla ${MAX_EDITORS} kişiye yetki verebilirsin.`);
      if (!(await isFriend(uid, target))) fail('failed-precondition', 'Sadece arkadaşlarına yetki verebilirsin.');
      const [tSnap, me] = await Promise.all([userRef(target).get(), userRef(uid).get()]);
      if (!tSnap.exists) fail('not-found', 'Oyuncu bulunamadı.');
      const batch = db.batch();
      batch.update(houseRef(houseId), { [`editors.${target}`]: true });
      batch.set(userRef(target).collection('messages').doc(), {
        from: nameOf(me.data()),
        text: `🛠️ "${h.name || 'ev'}" için sana tasarım yetkisi verdim! İçeri girip Tasarla ile mağazadan ve envanterimden eşya koyup kaldırabilirsin. Mobilya kasasına koyduğum altın ve zümrütle benim adıma mobilya da alabilirsin.`,
        read: false,
        kind: 'houseEditor',
        houseId,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, on: true };
    }
    if (h.editors?.[target] !== undefined) await houseRef(houseId).update({ [`editors.${target}`]: FieldValue.delete() });
    return { ok: true, on: false };
  }
  // v127 — MOBİLYA KASASI: sahip bu mekân için altın / zümrüt koyar; yetkili
  // tasarımcılar mobilya alırken buradan harcar (eşyalar sahibine aittir).
  // Sahip istediği zaman bedelsiz geri alır. dir: 'in' (kasaya) · 'out' (geri al)
  async function fundMove(uid, p) {
    const houseId = String(p.houseId || '');
    const dir = p.dir === 'out' ? 'out' : 'in';
    const gold = Math.floor(Number(p.gold) || 0);
    const gem = Math.floor(Number(p.gem) || 0);
    if (gold < 0 || gem < 0 || gold + gem <= 0 || gold > 1e12 || gem > 1e9) fail('invalid-argument', 'Geçersiz tutar.');
    let out = null;
    await db.runTransaction(async (tx) => {
      const [hs, us, fs] = await Promise.all([tx.get(houseRef(houseId)), tx.get(userRef(uid)), tx.get(fundRef(houseId))]);
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      if (hs.data().ownerUid !== uid) fail('permission-denied', 'Mobilya kasasını sadece mekânın sahibi yönetir.');
      if (hs.data().venue) fail('failed-precondition', 'Bu mekânda kasa yok.');
      const u = us.data() || {};
      const f = fs.data() || {};
      const fg = Number(f.gold || 0);
      const fe = Number(f.gem || 0);
      if (dir === 'in') {
        if (Number(u.gold || 0) < gold) fail('failed-precondition', 'Yeterli altının yok.');
        if (Number(u.emerald || 0) < gem) fail('failed-precondition', 'Yeterli zümrüdün yok.');
      } else if (fg < gold || fe < gem) fail('failed-precondition', 'Kasada o kadar yok.');
      const s = dir === 'in' ? 1 : -1;
      const up = {};
      if (gold) {
        up.gold = FieldValue.increment(-s * gold);
        up.goldTag = goldTag('mobilyaKasa');
      }
      if (gem) up.emerald = FieldValue.increment(-s * gem);
      tx.update(userRef(uid), up);
      tx.set(fundRef(houseId), { ownerUid: uid, gold: fg + s * gold, gem: fe + s * gem, updatedAtMs: now() }, { merge: true });
      out = { ok: true, gold: fg + s * gold, gem: fe + s * gem };
    });
    return out;
  }

  // Yetkili, sahibinin envanterini görür (envanter belgesi sadece sahibine açık)
  async function editorInventory(uid, p) {
    const houseId = String(p.houseId || '');
    const h = await loadHouse(houseId);
    if (!isEditorOf(h, uid)) fail('permission-denied', 'Bu evde tasarım yetkin yok.');
    const s = await invRef(h.ownerUid).get();
    const d = s.exists ? s.data() : {};
    const f = (await fundRef(houseId).get()).data() || {};
    return { ok: true, items: d.items || {}, walls: d.walls || [], floors: d.floors || [], fund: { gold: Number(f.gold || 0), gem: Number(f.gem || 0) } };
  }

  // ---- v92 Faz 8: oyunun 3D mekânları --------------------------------------------------
  // houses/game_{…} belgesini kurar; yerleşim sürümü (v) değiştiyse günceller.
  // Herkes çağırabilir (idempotent); belge kodu (venueLayouts.js) izler.
  async function venueEnsure(p) {
    const key = String(p.venue || '');
    const vn = Object.prototype.hasOwnProperty.call(VENUES, key) ? VENUES[key] : null;
    if (!vn) fail('invalid-argument', 'Geçersiz mekân.');
    const ref = houseRef(vn.houseId);
    const snap = await ref.get();
    if (snap.exists && snap.data().venueV === vn.v && snap.data().venue === key) return { ok: true, houseId: vn.houseId };
    const t = now();
    const data = {
      ownerUid: VENUE_OWNER,
      ownerName: 'Neon Şehir',
      ownerAvatar: null,
      name: vn.name,
      privacy: 'venue',
      items: vn.items,
      wall: vn.wall,
      floor: vn.floor,
      music: null,
      venue: key,
      venueV: vn.v,
      updatedAtMs: t,
    };
    if (!snap.exists) Object.assign(data, { kicked: {}, invites: {}, createdAtMs: t });
    await ref.set(data, { merge: true });
    return { ok: true, houseId: vn.houseId };
  }

  // ===========================================================================
  // v134 — MİSAFİR (giriş yapmamış) GEZİNTİ: oyuncuların açtığı işletme / ofis
  // listesi ve tasarımı (salt okuma). Giriş gerekmez; sonuçlar sunucu belleğinde
  // önbelleklenir (Firestore okuması düşük kalsın). Ev (özel konut) gösterilmez.
  // ===========================================================================
  const guestCache = new Map();
  async function guestCached(key, ttlMs, fn) {
    const hit = guestCache.get(key);
    const t = now();
    if (hit && t - hit.at < ttlMs) return hit.data;
    if (guestCache.size > 400) guestCache.clear();
    const data = await fn();
    guestCache.set(key, { at: t, data });
    return data;
  }
  const guestPublic = (h) => Boolean(h) && !h.venue && (h.privacy || 'public') === 'public' && (Boolean(h.biz?.type || h.bizType) || houseKind(h) === 'ofis');
  async function guestPlaces(p) {
    const type = String(p.type || '');
    const isOffice = type === 'ofis';
    if (!isOffice && !(BIZ_TYPES[type] && !BIZ_TYPES[type].ho)) fail('invalid-argument', 'Geçersiz tür.');
    return guestCached(`list:${type}`, 5 * 60 * 1000, async () => {
      const q = isOffice ? db.collection('houses').where('kind', '==', 'ofis') : db.collection('houses').where('bizType', '==', type);
      const snap = await q.limit(100).get();
      const list = snap.docs
        .map((d) => ({ id: d.id, h: d.data() }))
        .filter(({ h }) => !h.bizGame && guestPublic(h))
        .map(({ id, h }) => ({
          id,
          name: String(h.name || (isOffice ? 'Ofis' : BIZ_TYPES[type]?.label) || '').slice(0, 40),
          ownerName: String(h.ownerName || 'Oyuncu').slice(0, 40),
          ownerAvatar: h.ownerAvatar || null,
          bizType: h.biz?.type || h.bizType || null,
          emoji: h.office?.emoji || null,
          bizRank: Number.isFinite(Number(h.bizRank)) ? Number(h.bizRank) : null,
        }));
      return { ok: true, list };
    });
  }
  async function guestHouse(p) {
    const houseId = String(p.houseId || '');
    if (!isHouseId(houseId)) fail('invalid-argument', 'Geçersiz mekân.');
    return guestCached(`house:${houseId}`, 2 * 60 * 1000, async () => {
      const s = await db.collection('houses').doc(houseId).get();
      const h = s.exists ? s.data() : null;
      if (!guestPublic(h)) return { ok: false };
      return {
        ok: true,
        house: {
          id: houseId,
          name: String(h.name || '').slice(0, 40),
          ownerName: String(h.ownerName || 'Oyuncu').slice(0, 40),
          bizType: h.biz?.type || h.bizType || null,
          emoji: h.office?.emoji || null,
          items: Array.isArray(h.items) ? h.items : [],
          wall: h.wall || null,
          floor: h.floor || null,
          door: h.door || null,
        },
      };
    });
  }

  // Stadyum: lig puan durumları (misafir)
  const STAT_KEYS = ['played', 'won', 'drawn', 'lost', 'gf', 'ga', 'points'];
  async function guestLeagues() {
    return guestCached('leagues', 5 * 60 * 1000, async () => {
      const ls = await db.collection('futbolLeagues').orderBy('tier', 'asc').get();
      const leagues = ls.docs.map((d) => ({ id: d.id, name: String(d.data().name || ''), tier: Number(d.data().tier || 0) }));
      const snaps = await Promise.all(leagues.map((l) => db.collection('futbolTeams').where('leagueId', '==', l.id).get()));
      const teams = {};
      leagues.forEach((l, i) => {
        teams[l.id] = snaps[i].docs.map((d) => {
          const t = d.data();
          return { id: d.id, name: String(t.name || ''), logo: t.logo || null, stats: Object.fromEntries(STAT_KEYS.map((k) => [k, Number(t.stats?.[k] || 0)])) };
        });
      });
      return { ok: true, leagues, teams };
    });
  }

  const houseAction = onCall(async (request) => {
    const p = request.data || {};
    if (p.op === 'guestPlaces') return guestPlaces(p);
    if (p.op === 'guestHouse') return guestHouse(p);
    if (p.op === 'guestLeagues') return guestLeagues();
    const uid = requireAuth(request);
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
      case 'photoShot':
        return photoShot(uid, p);
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
      case 'editor':
        return setEditor(uid, p);
      case 'editInv':
        return editorInventory(uid, p);
      case 'fund':
        return fundMove(uid, p);
      case 'venueEnsure':
        return venueEnsure(p);
      // v132 — mobilya pazarı
      case 'furnList':
        return furn.list(uid, p);
      case 'furnCancel':
        return furn.cancel(uid, p);
      case 'botSet':
        return botSet(uid, p);
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
