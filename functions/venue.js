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

import { cafeDevicePrice } from './stream.js';
import { HOUSE_TAKEABLES, HOUSE_PRODUCTS } from './houseCatalogData.js';
import { midnightDayKey } from './businessCatalogData.js';
import { bizTax } from './tax.js';
import { goldTag } from './moneyLog.js';

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
// v92 — garson: sipariş başına süre ve maaş oranı (100 altın → 10 vergi, 10 maaş, 80 sahibe)
export const WAITER_ORDER_MS = 20_000;
export const WAITER_GRACE_MS = 1_500; // ağ gecikmesi payı
export const WAITER_SALARY_RATE = 0.1;
export const waiterSalary = (price) => Math.max(0, Math.round((Number(price) || 0) * WAITER_SALARY_RATE));
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
  function payOwnerTx(tx, ownerSnap, ownerUid, amount, tag = 'isletme') {
    const { goldDelta, debtDelta } = splitIncomeForDebt(ownerSnap.data()?.debtToState, amount);
    tx.update(userRef(ownerUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta), goldTag: goldTag(tag) });
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
      // v92 — mekânda (içeride olan) bir garson varsa sipariş garsona gider
      const ws = isOwner ? null : await tx.get(waiterRef(houseId));
      const waiter = ws?.exists ? ws.data() : null;
      const waiterHere = waiter && waiter.uid !== uid ? await txPresence(tx, waiter.uid, houseId) : null;
      const [us, os, ss] = await Promise.all([tx.get(userRef(uid)), isOwner ? null : tx.get(userRef(h.ownerUid)), isOwner ? null : tx.get(spendRef)]);
      const spent = Number(ss?.exists ? ss.data().amount || 0 : 0);
      if (!isOwner) {
        if (spent + price > MENU_DAILY_LIMIT) fail('failed-precondition', `limit:${spent}`);
        if (Number(us.data()?.gold || 0) < price) fail('failed-precondition', 'gold');
        tx.update(userRef(uid), { gold: FieldValue.increment(-price), goldTag: goldTag('menu') });
        tx.set(spendRef, { houseId, uid, dayKey, amount: FieldValue.increment(price), updatedAtMs: t }, { merge: true });
      }
      if (waiter && !waiterHere && waiter.uid !== uid) tx.delete(waiterRef(houseId)); // garson mekândan çıkmış → görev düşer
      if (!isOwner && waiterHere) {
        // ödeme alındı (emanette); ürün ve gelir dağıtımı garson teslim edince / süre dolunca
        const orderRef = db.collection('venueOrders').doc();
        const name = String(us.data()?.displayName || 'Müşteri').slice(0, 40);
        tx.set(orderRef, {
          houseId,
          ownerUid: h.ownerUid,
          customerUid: uid,
          customerName: name,
          customerAvatar: us.data()?.avatar || null,
          product,
          price,
          status: 'pending',
          waiterUid: waiter.uid,
          waiterName: waiter.name || 'Garson',
          createdAtMs: t,
          deadlineMs: t + WAITER_ORDER_MS,
        });
        result = { ok: true, queued: true, orderId: orderRef.id, deadlineMs: t + WAITER_ORDER_MS, waiterName: waiter.name || 'Garson', product, label: HOUSE_PRODUCTS[product].label, price, spent: spent + price, limit: MENU_DAILY_LIMIT };
        return;
      }
      if (!isOwner) {
        payOwnerTx(tx, os, h.ownerUid, price - bizTax(price), 'isletme'); // v77 vergi %10
        business?.recordIncomeTx(tx, { houseId, h, amount: price, kind: 'menu', customerUid: uid, products: { [product]: 1 }, tax: bizTax(price) });
      }
      tx.set(db.collection('heldItems').doc(uid), { itemId: product, venue: 'ev', houseId, untilMs: t + HELD_MS, boughtAtMs: t });
      tx.update(presRef, { holding: product });
      result = { ok: true, product, label: HOUSE_PRODUCTS[product].label, price, spent: spent + price, limit: MENU_DAILY_LIMIT, untilMs: t + HELD_MS };
    });
    return result;
  }

  // ---- v92 GARSON ----------------------------------------------------------------------
  // venueWaiters/{houseId} = { uid, name, sinceMs } · venueOrders/{id} (sipariş)
  // Mekânda (içeride olan) tek garson olur. Garson çıkınca görev düşer (bir sonraki
  // siparişte / başvuruda sunucu da kontrol eder). Sipariş 20 sn içinde teslim
  // edilmezse müşteriye otomatik gelir, garson görevden alınır (hemen tekrar
  // başvurabilir) ve maaş ödenmez — sahip sadece vergi öder.
  const waiterRef = (houseId) => db.collection('venueWaiters').doc(houseId);
  const ordersQ = (houseId) => db.collection('venueOrders').where('houseId', '==', houseId).where('status', '==', 'pending').limit(50);

  async function waiterJoin(uid, p) {
    const houseId = String(p.houseId || '');
    let result = null;
    await db.runTransaction(async (tx) => {
      await txHouse(tx, houseId, MENU_TYPES);
      const presRef = await txPresence(tx, uid, houseId);
      if (!presRef) fail('failed-precondition', 'not-present');
      const ws = await tx.get(waiterRef(houseId));
      const cur = ws.exists ? ws.data() : null;
      if (cur?.uid === uid) {
        result = { ok: true, already: true };
        return;
      }
      if (cur && (await txPresence(tx, cur.uid, houseId))) fail('failed-precondition', `waiter-taken:${cur.name || 'Garson'}`);
      const us = await tx.get(userRef(uid));
      const name = String(us.data()?.displayName || 'Garson').slice(0, 40);
      tx.set(waiterRef(houseId), { houseId, uid, name, sinceMs: now() });
      result = { ok: true, name };
    });
    return result;
  }

  async function waiterQuit(uid, p) {
    const houseId = String(p.houseId || '');
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz mekân.');
    await db.runTransaction(async (tx) => {
      const ws = await tx.get(waiterRef(houseId));
      if (ws.exists && ws.data().uid === uid) tx.delete(waiterRef(houseId));
    });
    return { ok: true };
  }

  // Ürünü müşterinin eline verir + geliri dağıtır. YAZMA (okumalar önceden).
  // served: garson teslim etti mi (maaş) · auto: süre doldu (maaş yok)
  function fulfillTx(tx, { o, orderRef, h, os, ws2, custPres, served, t }) {
    const price = Math.max(0, Math.round(Number(o.price) || 0));
    const tax = bizTax(price);
    // v92 — mekân sahibi de garson olabilir; kendine maaş almaz (gider de yazılmaz)
    const salary = served && o.waiterUid !== o.ownerUid ? waiterSalary(price) : 0;
    if (h && os?.exists) payOwnerTx(tx, os, o.ownerUid, price - tax - salary, 'isletme');
    if (salary > 0 && ws2?.exists) {
      const { goldDelta, debtDelta } = splitIncomeForDebt(ws2.data()?.debtToState, salary);
      tx.update(userRef(o.waiterUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta), goldTag: goldTag('garson') });
    }
    if (h) business?.recordIncomeTx(tx, { houseId: o.houseId, h, amount: price, kind: 'menu', customerUid: o.customerUid, products: { [o.product]: 1 }, tax, salary });
    tx.set(db.collection('heldItems').doc(o.customerUid), {
      itemId: o.product,
      venue: 'ev',
      houseId: o.houseId,
      untilMs: t + HELD_MS,
      boughtAtMs: t,
      // istemci bildirimi: garson getirdi / süre doldu, otomatik geldi
      servedAtMs: t,
      servedBy: served ? o.waiterName || 'Garson' : null,
    });
    if (custPres) tx.update(custPres, { holding: o.product });
    tx.update(orderRef, { status: served ? 'delivered' : 'auto', resolvedAtMs: t, salary });
  }

  async function orderDeliver(uid, p) {
    const orderId = String(p.orderId || '');
    if (!isId(orderId)) fail('invalid-argument', 'Geçersiz sipariş.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const orderRef = db.collection('venueOrders').doc(orderId);
      const os0 = await tx.get(orderRef);
      if (!os0.exists) fail('not-found', 'Sipariş bulunamadı.');
      const o = os0.data();
      if (o.status !== 'pending') fail('failed-precondition', 'order-done');
      if (o.waiterUid !== uid) fail('permission-denied', 'Bu sipariş sana gelmedi.');
      const t = now();
      const late = t > Number(o.deadlineMs || 0) + WAITER_GRACE_MS;
      const ws = await tx.get(waiterRef(o.houseId));
      const stillWaiter = ws.exists && ws.data().uid === uid;
      const here = await txPresence(tx, uid, o.houseId);
      const hs = await tx.get(houseRef(o.houseId));
      const h = hs.exists && hs.data().biz?.type && MENU_TYPES.includes(hs.data().biz.type) ? hs.data() : null;
      const [own, wus, custPres] = await Promise.all([tx.get(userRef(o.ownerUid)), tx.get(userRef(uid)), txPresence(tx, o.customerUid, o.houseId)]);
      const served = !late && stillWaiter && Boolean(here) && Boolean(h);
      // geç kaldıysa (ya da artık garson değilse) sipariş otomatik teslim edilir
      fulfillTx(tx, { o, orderRef, h, os: own, ws2: wus, custPres, served, t });
      if (!served && stillWaiter) tx.delete(waiterRef(o.houseId));
      result = served ? { ok: true, served: true, salary: o.waiterUid === o.ownerUid ? 0 : waiterSalary(o.price) } : { ok: false, late: true };
    });
    return result;
  }

  // Süresi dolmuş siparişler: müşteriye otomatik, garson görevden alınır.
  // Mekândaki herkesin istemcisi süre dolunca çağırabilir (sunucu süreyi kendi kontrol eder).
  async function orderSweep(uid, p) {
    const houseId = String(p.houseId || '');
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz mekân.');
    const t = now();
    const snap = await ordersQ(houseId).get();
    const due = snap.docs.filter((d) => t > Number(d.data().deadlineMs || 0) + WAITER_GRACE_MS);
    let n = 0;
    let fired = false;
    for (const d of due.slice(0, 20)) {
      await db.runTransaction(async (tx) => {
        const s = await tx.get(d.ref);
        if (!s.exists || s.data().status !== 'pending') return;
        const o = s.data();
        const hs = await tx.get(houseRef(o.houseId));
        const h = hs.exists && hs.data().biz?.type && MENU_TYPES.includes(hs.data().biz.type) ? hs.data() : null;
        const ws = await tx.get(waiterRef(o.houseId));
        const [own, custPres] = await Promise.all([tx.get(userRef(o.ownerUid)), txPresence(tx, o.customerUid, o.houseId)]);
        fulfillTx(tx, { o, orderRef: d.ref, h, os: own, ws2: null, custPres, served: false, t });
        if (ws.exists && ws.data().uid === o.waiterUid) {
          tx.delete(waiterRef(o.houseId));
          fired = true;
        }
        n += 1;
      });
    }
    return { ok: true, resolved: n, fired };
  }

  // ---- İNTERNET KAFE -------------------------------------------------------------------------
  // v81: yayın setindeki bilgisayar (oyuncu koltuğu yanında) yayın seti ücretiyle;
  // diğer cihazlar normal dakika ücretiyle
  const devicePriceOf = (h, deviceId) => cafeDevicePrice(h, deviceId, netPriceOf(h));
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

  // v81 — Bu kafede canlı yayındaysa oyun süresi ücretsiz (yayın setinin dakika
  // ücreti zaten ödeniyor). OKUMA — yazmalardan önce çağrılmalı.
  const STREAM_FRESH_MS = 90_000;
  async function txStreamingHere(tx, us, houseId, t) {
    const sid = us?.data()?.streamId;
    if (!sid || typeof sid !== 'string') return false;
    const ss = await tx.get(db.collection('streams').doc(sid));
    const s = ss.exists ? ss.data() : null;
    return Boolean(s && s.status === 'live' && s.houseId === houseId && t - Number(s.lastBeatMs || 0) < STREAM_FRESH_MS);
  }

  // Bir dakikalık ücreti çeker (yazmalar). Sahip (ve v81: burada yayında olan) ücret ödemez.
  function chargeMinuteTx(tx, { houseId, h, uid, os, sess, price, t, free = false }) {
    const from = Math.max(t, Number(sess?.creditUntilMs || 0));
    const creditUntilMs = from + NET_SLOT_MS;
    if (h.ownerUid !== uid && !free) {
      tx.update(userRef(uid), { gold: FieldValue.increment(-price), goldTag: goldTag('internet') });
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
      const streaming = h.ownerUid !== uid && (await txStreamingHere(tx, us, houseId, t));
      const isOwner = h.ownerUid === uid || streaming;
      let creditUntilMs = Number(sess?.creditUntilMs || 0);
      let charged = 0;
      const price = devicePriceOf(h, deviceId);
      if (creditUntilMs <= t) {
        // yeni dakika: istemcinin gördüğü fiyatla onay
        if (!isOwner) {
          if (Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
          if (Number(us.data()?.gold || 0) < price) fail('failed-precondition', 'gold');
        }
        creditUntilMs = chargeMinuteTx(tx, { houseId, h, uid, us, os, sess, price, t, free: streaming });
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
      const price = devicePriceOf(h, sess.deviceId);
      if (creditUntilMs - t <= 3000) {
        const streaming = h.ownerUid !== uid && (await txStreamingHere(tx, us, houseId, t));
        const isOwner = h.ownerUid === uid || streaming;
        if (!isOwner && Number(us.data()?.gold || 0) < price) {
          tx.update(ref, { deviceId: null, lastSeenMs: t, updatedAtMs: t });
          result = { ok: true, stopped: 'gold', creditUntilMs };
          return;
        }
        creditUntilMs = chargeMinuteTx(tx, { houseId, h, uid, us, os, sess, price, t, free: streaming });
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
    // v92 — sonuçlanmış eski siparişler (1 günden eski) silinir
    const doneOrders = await db.collection('venueOrders').where('createdAtMs', '<', t - 24 * 60 * 60 * 1000).limit(300).get();
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    spend.docs.forEach((d) => batch.delete(d.ref));
    let orders = 0;
    const stuck = [];
    doneOrders.docs.forEach((d) => {
      if (d.data().status === 'pending') stuck.push(d.data().houseId);
      else {
        batch.delete(d.ref);
        orders += 1;
      }
    });
    if (old.size || spend.size || orders) await batch.commit();
    // kimsenin süpürmediği bekleyen siparişler (mekân boşaldıysa): müşteriye otomatik
    for (const hid of [...new Set(stuck)].slice(0, 20)) await orderSweep('__system__', { houseId: hid }).catch(() => {});
    return { sessions: old.size, spend: spend.size, orders };
  }

  const ops = { menuPrices, menuBuy, netPrice, netStart, netTick, netLeave, waiterJoin, waiterQuit, orderDeliver, orderSweep };
  return { ops, cleanup };
}
