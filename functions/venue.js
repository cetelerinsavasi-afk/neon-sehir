// =============================================================================
// venue.js — v77 İşletmeler Faz 3: Cafe / Bar menüsü + İnternet Kafe
// =============================================================================
// shopAction üzerinden çağrılır (ayrı fonksiyon yayını gerekmez).
//
// CAFE / BAR
//   - Menü = mekândaki (satın alınmış) dolapların verdiği yiyecek/içecekler
//     (HOUSE_TAKEABLES). Ne kadar farklı mobilya, o kadar geniş menü.
//   - Fiyat: varsayılan 100, en az 10, en fazla 1.000 (houses.bizPrices.menu).
//   - Müşteri menüden dokununca anında alır; ürün eldeki ürün olur (2 dk,
//     ısmarlanabilir) — oyundaki etkisi aynı, yeni etki yok. Normalde ücretsiz
//     olan yiyecek/içecek işletmede ÜCRETLİ (houses.take müşteriye kapalı).
//   - Bir oyuncu bir mekânda günde en fazla 10.000 altınlık alışveriş yapar
//     (bizSpend/{houseId}_{uid}_{gün}).
//
// İNTERNET KAFE
//   - Sahip tüm cihazlar için tek dakika ücreti belirler (50–500, varsayılan 100).
//   - Cihaza oturup başlatınca ilk 60 sn ödenir; ödenen süre oyuncu + mekân
//     çiftine bağlı krediye dönüşür ve gerçek zamanda akar (netSessions/
//     {houseId}_{uid}). Cihaz değiştirmek / çıkıp gelmek yeniden ödetmez.
//   - Süre bitince oyuncu bir cihazda oturuyorsa (istemci netTick) yeni 60 sn
//     çekilir; oturmuyorsa çekilmez. Fiyat değişirse ödenmiş kredi eski fiyatla
//     biter, yeni fiyat sonraki dakikada geçerli olur. Altın yetmezse oturum biter.
//   - Kapasite: İnternet Kafe İstasyonu ve Konsol & TV 2 kişi, Oyuncu
//     Bilgisayarı ve Atari Makinesi 1 kişi.
//   - Kredi sürerken mekânın gerekli mobilyaları kaldırılamaz (bizLockUntilMs).
// =============================================================================

import { HOUSE_TAKEABLES, HOUSE_PRODUCTS } from './houseCatalogData.js';
import { midnightDayKey } from './businessCatalogData.js';
import { bizTax } from './tax.js';

export const MENU_TYPES = ['cafe', 'bar'];
export const MENU_PRICE = { def: 100, min: 10, max: 1000 };
export const MENU_DAILY_LIMIT = 10_000;
export const WEAPON_PRODUCTS = ['tabanca', 'tufek', 'pompali', 'altinTabanca'];
export const isMenuProduct = (k) => Boolean(HOUSE_PRODUCTS[k]) && !WEAPON_PRODUCTS.includes(k);
// Mekândaki satın alınmış eşyalardan menü (ürün → onu veren eşya anahtarları)
export function menuOf(items) {
  const out = {};
  (items || []).forEach((it) => {
    if (it?.p !== 1) return;
    (HOUSE_TAKEABLES[it.k] || []).forEach((prod) => {
      if (!isMenuProduct(prod)) return;
      (out[prod] = out[prod] || []).push(it.k);
    });
  });
  return out;
}
export function menuPriceOf(h, product) {
  const v = Number(h?.bizPrices?.menu?.[product]);
  return Number.isInteger(v) && v >= MENU_PRICE.min && v <= MENU_PRICE.max ? v : MENU_PRICE.def;
}

export const NET_MINUTE = { def: 100, min: 50, max: 500 };
export const NET_SLOT_MS = 60_000;
export const NET_DEVICE_CAP = { pcstation: 2, console: 2, pc: 1, arcade: 1 };
export const NET_SEEN_MS = 45_000; // cihazda oturan sayılmak için son nabız
export function netPriceOf(h) {
  const v = Number(h?.bizPrices?.minute);
  return Number.isInteger(v) && v >= NET_MINUTE.min && v <= NET_MINUTE.max ? v : NET_MINUTE.def;
}

const HELD_MS = 120_000;
const PRESENCE_ACTIVE_MS = 2 * 60 * 1000;
export const NET_LOCK_PAD_MS = 5 * 60 * 1000;

export function createVenue({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

  async function txHouse(tx, houseId, types) {
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz mekân.');
    const s = await tx.get(houseRef(houseId));
    if (!s.exists) fail('not-found', 'Mekân bulunamadı.');
    const h = s.data();
    if (!h.biz?.type || !types.includes(h.biz.type)) fail('failed-precondition', 'biz-closed');
    return h;
  }
  async function txPresence(tx, uid, houseId) {
    const ref = db.collection('housePresence').doc(uid);
    const p = await tx.get(ref);
    const d = p.exists ? p.data() : null;
    if (!d || d.houseId !== houseId) return null;
    const at = d.updatedAt?.toMillis?.() ?? Number(d.updatedAt || 0);
    if (at && now() - at > PRESENCE_ACTIVE_MS) return null;
    return ref;
  }
  function payOwnerTx(tx, ownerSnap, ownerUid, amount) {
    const { goldDelta, debtDelta } = splitIncomeForDebt(ownerSnap.data()?.debtToState, amount);
    tx.update(userRef(ownerUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta) });
  }

  // ---- CAFE / BAR ------------------------------------------------------------------------
  async function menuPrices(uid, p) {
    const houseId = String(p.houseId || '');
    const input = p.prices && typeof p.prices === 'object' ? p.prices : {};
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId, MENU_TYPES);
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu mekân senin değil.');
      const out = { ...(h.bizPrices?.menu || {}) };
      for (const [k, v] of Object.entries(input)) {
        if (!isMenuProduct(k)) fail('invalid-argument', 'Geçersiz ürün.');
        const n = Number(v);
        if (!Number.isInteger(n) || n < MENU_PRICE.min || n > MENU_PRICE.max) fail('invalid-argument', `price-band:${k}`);
        out[k] = n;
      }
      tx.update(houseRef(houseId), { 'bizPrices.menu': out, bizPricesAtMs: now() });
      result = { ok: true, menu: out };
    });
    return result;
  }

  async function menuBuy(uid, p) {
    const houseId = String(p.houseId || '');
    const product = String(p.product || '');
    if (!isMenuProduct(product)) fail('invalid-argument', 'Geçersiz ürün.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId, MENU_TYPES);
      if (!menuOf(h.items)[product]) fail('failed-precondition', 'not-on-menu');
      const presRef = await txPresence(tx, uid, houseId);
      if (!presRef) fail('failed-precondition', 'not-present');
      const t = now();
      const isOwner = h.ownerUid === uid;
      const price = isOwner ? 0 : menuPriceOf(h, product);
      if (!isOwner && Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
      const dayKey = midnightDayKey(t);
      const spendRef = db.collection('bizSpend').doc(`${houseId}_${uid}_${dayKey}`);
      const [us, os, ss] = await Promise.all([tx.get(userRef(uid)), isOwner ? null : tx.get(userRef(h.ownerUid)), isOwner ? null : tx.get(spendRef)]);
      const spent = Number(ss?.exists ? ss.data().amount || 0 : 0);
      if (!isOwner) {
        if (spent + price > MENU_DAILY_LIMIT) fail('failed-precondition', `limit:${spent}`);
        if (Number(us.data()?.gold || 0) < price) fail('failed-precondition', 'gold');
        tx.update(userRef(uid), { gold: FieldValue.increment(-price) });
        payOwnerTx(tx, os, h.ownerUid, price - bizTax(price)); // v77 vergi %10
        tx.set(spendRef, { houseId, uid, dayKey, amount: FieldValue.increment(price), updatedAtMs: t }, { merge: true });
        business?.recordIncomeTx(tx, { houseId, h, amount: price, kind: 'menu', customerUid: uid, products: { [product]: 1 }, tax: bizTax(price) });
      }
      tx.set(db.collection('heldItems').doc(uid), { itemId: product, venue: 'ev', houseId, untilMs: t + HELD_MS, boughtAtMs: t });
      tx.update(presRef, { holding: product });
      result = { ok: true, product, label: HOUSE_PRODUCTS[product].label, price, spent: spent + price, limit: MENU_DAILY_LIMIT, untilMs: t + HELD_MS };
    });
    return result;
  }

  // ---- İNTERNET KAFE -------------------------------------------------------------------------
  const sessRef = (houseId, uid) => db.collection('netSessions').doc(`${houseId}_${uid}`);

  async function netPrice(uid, p) {
    const houseId = String(p.houseId || '');
    const price = Number(p.price);
    if (!Number.isInteger(price) || price < NET_MINUTE.min || price > NET_MINUTE.max) fail('invalid-argument', 'price-band:minute');
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId, ['internet']);
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu mekân senin değil.');
      tx.update(houseRef(houseId), { 'bizPrices.minute': price, bizPricesAtMs: now() });
    });
    return { ok: true, price };
  }

  // Bir dakikalık ücreti çeker (yazmalar). Sahip ücret ödemez.
  function chargeMinuteTx(tx, { houseId, h, uid, os, sess, price, t }) {
    const from = Math.max(t, Number(sess?.creditUntilMs || 0));
    const creditUntilMs = from + NET_SLOT_MS;
    if (h.ownerUid !== uid) {
      tx.update(userRef(uid), { gold: FieldValue.increment(-price) });
      payOwnerTx(tx, os, h.ownerUid, price - bizTax(price)); // v77 vergi %10
      business?.recordIncomeTx(tx, { houseId, h, amount: price, kind: 'service', customerUid: uid, products: { dakika: 1 }, tax: bizTax(price) });
    }
    // kredi sürerken gerekli mobilyalar kaldırılamaz.
    // v79 maliyet: kilit 5 dk payla uzatılır → ev belgesi her dakika değil ~5 dk'da
    // bir yazılır (her yazma içerideki herkese ve listelere okuma demekti).
    if (Number(h.bizLockUntilMs || 0) < creditUntilMs) tx.update(houseRef(houseId), { bizLockUntilMs: creditUntilMs + NET_LOCK_PAD_MS });
    return creditUntilMs;
  }

  async function netStart(uid, p) {
    const houseId = String(p.houseId || '');
    const deviceId = String(p.itemId || '');
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId, ['internet']);
      const dev = (h.items || []).find((it) => it.i === deviceId && it.p === 1);
      if (!dev || !NET_DEVICE_CAP[dev.k]) fail('invalid-argument', 'Cihaz bulunamadı.');
      if (!(await txPresence(tx, uid, houseId))) fail('failed-precondition', 'not-present');
      const t = now();
      const occ = await tx.get(db.collection('netSessions').where('houseId', '==', houseId).where('deviceId', '==', deviceId));
      const others = occ.docs.filter((d) => d.data().uid !== uid && t - Number(d.data().lastSeenMs || 0) < NET_SEEN_MS).length;
      if (others >= NET_DEVICE_CAP[dev.k]) fail('failed-precondition', 'device-full');
      const ref = sessRef(houseId, uid);
      const [ss, us, os] = await Promise.all([tx.get(ref), tx.get(userRef(uid)), tx.get(userRef(h.ownerUid))]);
      const sess = ss.exists ? ss.data() : null;
      const isOwner = h.ownerUid === uid;
      let creditUntilMs = Number(sess?.creditUntilMs || 0);
      let charged = 0;
      const price = netPriceOf(h);
      if (creditUntilMs <= t) {
        // yeni dakika: istemcinin gördüğü fiyatla onay
        if (!isOwner) {
          if (Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
          if (Number(us.data()?.gold || 0) < price) fail('failed-precondition', 'gold');
        }
        creditUntilMs = chargeMinuteTx(tx, { houseId, h, uid, us, os, sess, price, t });
        charged = isOwner ? 0 : price;
      }
      tx.set(ref, { houseId, uid, deviceId, deviceKey: dev.k, creditUntilMs, lastPrice: charged ? price : Number(sess?.lastPrice || price), lastSeenMs: t, updatedAtMs: t });
      result = { ok: true, creditUntilMs, charged, price };
    });
    return result;
  }

  // Oturan oyuncunun nabzı: kredi bitmek üzereyse yeni dakikayı (güncel fiyatla) çeker
  async function netTick(uid, p) {
    const houseId = String(p.houseId || '');
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId, ['internet']);
      const ref = sessRef(houseId, uid);
      const ss = await tx.get(ref);
      const sess = ss.exists ? ss.data() : null;
      if (!sess?.deviceId) {
        result = { ok: true, stopped: 'none' };
        return;
      }
      const t = now();
      const present = await txPresence(tx, uid, houseId);
      if (!present) {
        tx.update(ref, { deviceId: null, updatedAtMs: t });
        result = { ok: true, stopped: 'left', creditUntilMs: Number(sess.creditUntilMs || 0) };
        return;
      }
      const [us, os] = await Promise.all([tx.get(userRef(uid)), tx.get(userRef(h.ownerUid))]);
      let creditUntilMs = Number(sess.creditUntilMs || 0);
      let charged = 0;
      const price = netPriceOf(h);
      if (creditUntilMs - t <= 3000) {
        const isOwner = h.ownerUid === uid;
        if (!isOwner && Number(us.data()?.gold || 0) < price) {
          tx.update(ref, { deviceId: null, lastSeenMs: t, updatedAtMs: t });
          result = { ok: true, stopped: 'gold', creditUntilMs };
          return;
        }
        creditUntilMs = chargeMinuteTx(tx, { houseId, h, uid, us, os, sess, price, t });
        charged = isOwner ? 0 : price;
      }
      tx.update(ref, { creditUntilMs, lastSeenMs: t, updatedAtMs: t, ...(charged ? { lastPrice: price } : {}) });
      result = { ok: true, creditUntilMs, charged, price };
    });
    return result;
  }

  async function netLeave(uid, p) {
    const houseId = String(p.houseId || '');
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz mekân.');
    const ref = sessRef(houseId, uid);
    const s = await ref.get();
    if (s.exists) await ref.update({ deviceId: null, updatedAtMs: now() });
    return { ok: true };
  }

  // Eski oturum / harcama kayıtlarını temizler (saatlik — business rollover ile)
  async function cleanup() {
    const t = now();
    const old = await db.collection('netSessions').where('creditUntilMs', '<', t - 24 * 60 * 60 * 1000).limit(300).get();
    const today = midnightDayKey(t);
    const spend = await db.collection('bizSpend').where('dayKey', '<', today).limit(300).get();
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    spend.docs.forEach((d) => batch.delete(d.ref));
    if (old.size || spend.size) await batch.commit();
    return { sessions: old.size, spend: spend.size };
  }

  const ops = { menuPrices, menuBuy, netPrice, netStart, netTick, netLeave };
  return { ops, cleanup };
}
