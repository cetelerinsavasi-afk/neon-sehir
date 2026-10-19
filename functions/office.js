// =============================================================================
// office.js — v100 Ofisler (ücretli mobilyalar) · shopAction üzerinden çağrılır
// =============================================================================
//   op 'officeSet'    { houseId, keys?:{k:bool}, prices?:{ürün:n}, minute?, emoji? } (sahip)
//   op 'officeBuy'    { houseId, itemId, product, expect, cart? } — ücretli ürün al
//   op 'officeDonate' { houseId, amount } — bağış kutusu (100/250/500/1000)
//   Mikser konsolu dakika ücreti venue.js netStart/netTick içinde (officeChargeTx).
//
// Koleksiyonlar (yazma SADECE sunucudan):
//   officeSpend/{houseId}_{uid}_{gün} — oyuncunun o mekânın ücretli mobilyalarına
//     bugünkü harcaması (en fazla 10.000; işletmenin normal kasasından ayrı)
//   officeDaily/{houseId}_{gün} — sahibin gizli günlük raporu
//     { houseId, ownerUid, dayKey, revenue, tax, byKind:{urun,bagis,dakika}, products, cust }
//
// Göç (v100): eski home ofisler (mescit / sinema / stüdyo) ofis olur — fiyatları
// yeni aralıklara çekilir (migrateLegacyHomeOffices; saatlik + eve girişte).
// =============================================================================

import { midnightDayKey } from './businessCatalogData.js';
import { HOUSE_PRODUCTS, HOUSE_TAKEABLES } from './houseCatalogData.js';
import { bizTax, taxLedgerWrite } from './tax.js';
import { goldTag } from './moneyLog.js';
import {
  OFFICE_FURN,
  OFFICE_BANDS,
  OFFICE_DAILY_LIMIT,
  OFFICE_DONATE_AMOUNTS,
  officeKeyAllowed,
  ownedOfficeKeys,
  activeOfficeKeys,
  officeProductsOf,
  productBand,
  officePriceOf,
  houseKind,
  isLegacyHomeOffice,
  officeFromLegacy,
  isOfficeEmoji,
} from './officeData.js';

const PRESENCE_ACTIVE_MS = 2 * 60 * 1000;
const HELD_MS = 120_000;
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

export function createOffice({ db, FieldValue, HttpsError, splitIncomeForDebt, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const spendRef = (houseId, uid, dayKey) => db.collection('officeSpend').doc(`${houseId}_${uid}_${dayKey}`);
  const dailyRef = (houseId, dayKey) => db.collection('officeDaily').doc(`${houseId}_${dayKey}`);

  async function txPresent(tx, uid, houseId) {
    const ref = db.collection('housePresence').doc(uid);
    const p = await tx.get(ref);
    const d = p.exists ? p.data() : null;
    if (!d || d.houseId !== houseId) return null;
    const at = d.updatedAt?.toMillis?.() ?? Number(d.updatedAt || 0);
    if (at && now() - at > PRESENCE_ACTIVE_MS) return null;
    return ref;
  }

  // Ücreti al, sahibe öde (vergi %10), harcama sayacı + gizli günlük rapor. YAZMA
  // (okumalar — müşteri, sahip, sayaç — önceden yapılmış olmalı).
  //   kind: 'urun' · 'bagis' · 'dakika'
  function chargeTx(tx, { houseId, h, uid, us, os, amount, kind, product, spent, dayKey, t, tag }) {
    const tax = bizTax(amount);
    tx.update(userRef(uid), { gold: FieldValue.increment(-amount), goldTag: goldTag(tag || 'ofisAlis') });
    tx.set(spendRef(houseId, uid, dayKey), { houseId, uid, dayKey, amount: FieldValue.increment(amount), updatedAtMs: t }, { merge: true });
    if (os?.exists) {
      const { goldDelta, debtDelta } = splitIncomeForDebt(os.data()?.debtToState, amount - tax);
      tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta), goldTag: goldTag('ofis') });
    }
    taxLedgerWrite(tx, db, FieldValue, { amount: tax, source: 'ofis', uid: h.ownerUid, atMs: t, ref: houseId });
    const patch = {
      houseId,
      ownerUid: h.ownerUid,
      dayKey,
      revenue: FieldValue.increment(amount),
      tax: FieldValue.increment(tax),
      byKind: { [kind]: FieldValue.increment(amount) },
      cust: { [uid]: true },
      updatedAtMs: t,
    };
    if (product) patch.products = { [product]: FieldValue.increment(1) };
    tx.set(dailyRef(houseId, dayKey), patch, { merge: true });
    // tek "yeni satış" SMS'i (okunmamışken güncellenir, yığılmaz)
    tx.set(userRef(h.ownerUid).collection('messages').doc(`officesale_${houseId}`), {
      text: `${h.office?.emoji || '🏢'} ${h.name || 'Ofisin'} — ücretli ürünlerinden yeni kazanç var.`,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
      type: 'office_sale',
      houseId,
    });
    void us;
    return tax;
  }

  // Mikser dakika ücreti (venue.js netStart/netTick). OKUMA + YAZMA: sayaç okunur.
  // Döner: { ok:true } ya da { limit:true, spent }
  async function chargeMinuteTx(tx, { houseId, h, uid, us, os, price, t }) {
    const dayKey = midnightDayKey(t);
    const ss = await tx.get(spendRef(houseId, uid, dayKey));
    const spent = Number(ss.exists ? ss.data().amount || 0 : 0);
    if (spent + price > OFFICE_DAILY_LIMIT) return { limit: true, spent };
    chargeTx(tx, { houseId, h, uid, us, os, amount: price, kind: 'dakika', product: null, spent, dayKey, t, tag: 'studyo' });
    return { ok: true, spent: spent + price };
  }

  // ---- sahip: ücretli yap / fiyat / emoji -------------------------------------------
  async function officeSet(uid, p) {
    const houseId = String(p.houseId || '');
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz ev.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h0 = hs.data();
      if (h0.ownerUid !== uid) fail('permission-denied', 'Bu ev senin değil.');
      if (h0.venue) fail('failed-precondition', 'Bu mekânda olmaz.');
      if (isLegacyHomeOffice(h0)) fail('failed-precondition', 'Ofisin yeni sisteme taşınıyor, birazdan tekrar dene.');
      const office = {
        keys: { ...(h0.office?.keys || {}) },
        prices: { ...(h0.office?.prices || {}) },
        minute: Number(h0.office?.minute) || OFFICE_BANDS.minute.def,
        emoji: h0.office?.emoji || null,
        sinceMs: h0.office?.sinceMs || null,
      };
      const owned = ownedOfficeKeys(h0);
      if (p.keys && typeof p.keys === 'object') {
        for (const [k, on] of Object.entries(p.keys)) {
          if (!officeKeyAllowed(h0, k)) fail('invalid-argument', 'Bu mobilya burada ücretli yapılamaz.');
          if (on === true) {
            if (!owned.includes(k)) fail('failed-precondition', 'Bu mobilya odanda (satın alınmış) yok.');
            office.keys[k] = true;
            // ilk açılışta ürünlerin fiyatı varsayılan olur
            officeProductsOf(k).forEach((prod) => {
              if (!Number.isInteger(office.prices[prod])) office.prices[prod] = productBand(prod).def;
            });
          } else if (on === false) delete office.keys[k];
          else fail('invalid-argument', 'Geçersiz ayar.');
        }
      }
      if (p.prices && typeof p.prices === 'object') {
        const allowedProducts = new Set(owned.flatMap((k) => officeProductsOf(k)));
        for (const [prod, v] of Object.entries(p.prices)) {
          if (!HOUSE_PRODUCTS[prod] || !allowedProducts.has(prod)) fail('invalid-argument', 'Geçersiz ürün.');
          const n = Number(v);
          const b = productBand(prod);
          if (!Number.isInteger(n) || n < b.min || n > b.max) fail('invalid-argument', `price-band:${b.min}:${b.max}`);
          office.prices[prod] = n;
        }
      }
      if (p.minute !== undefined) {
        const n = Number(p.minute);
        const b = OFFICE_BANDS.minute;
        if (!Number.isInteger(n) || n < b.min || n > b.max) fail('invalid-argument', `price-band:${b.min}:${b.max}`);
        office.minute = n;
      }
      if (p.emoji !== undefined) {
        if (p.emoji !== null && !isOfficeEmoji(p.emoji)) fail('invalid-argument', 'Geçersiz emoji.');
        office.emoji = p.emoji;
      }
      const h1 = { ...h0, office };
      const kind = houseKind(h1);
      if (kind === 'ofis' && !office.sinceMs) office.sinceMs = now();
      const patch = { office, kind, updatedAtMs: now() };
      // ofisler (işletmeler gibi) herkese açıktır
      if (kind === 'ofis' && (h0.privacy || 'public') !== 'public') patch.privacy = 'public';
      tx.update(houseRef(houseId), patch);
      result = { ok: true, office, kind, active: activeOfficeKeys(h1) };
    });
    return result;
  }

  // ---- ziyaretçi: ücretli ürün al -------------------------------------------------------
  async function officeBuy(uid, p) {
    const houseId = String(p.houseId || '');
    const itemId = String(p.itemId || '');
    const product = String(p.product || '');
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz ev.');
    if (!HOUSE_PRODUCTS[product]) fail('invalid-argument', 'Geçersiz ürün.');
    const cart = p.cart === true;
    let result = null;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      if (h.venue) fail('failed-precondition', 'Bu mekânda eşyadan ürün alınmaz.');
      const it = (h.items || []).find((x) => x.i === itemId);
      if (!it || it.p !== 1 || !(HOUSE_TAKEABLES[it.k] || []).includes(product)) fail('invalid-argument', 'Bu eşyadan bu ürün alınamaz.');
      if (h.ownerUid === uid) fail('failed-precondition', 'office-owner');
      const price = officePriceOf(h, product);
      if (price <= 0) fail('failed-precondition', 'office-free');
      if (Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
      const presRef = await txPresent(tx, uid, houseId);
      if (!presRef) fail('failed-precondition', 'not-present');
      const t = now();
      const dayKey = midnightDayKey(t);
      const [us, os, ss] = await Promise.all([tx.get(userRef(uid)), tx.get(userRef(h.ownerUid)), tx.get(spendRef(houseId, uid, dayKey))]);
      const spent = Number(ss.exists ? ss.data().amount || 0 : 0);
      if (spent + price > OFFICE_DAILY_LIMIT) fail('failed-precondition', `office-limit:${spent}`);
      if (Number(us.data()?.gold || 0) < price) fail('failed-precondition', 'gold');
      chargeTx(tx, { houseId, h, uid, us, os, amount: price, kind: 'urun', product, spent, dayKey, t, tag: 'ofisAlis' });
      if (!cart) {
        tx.set(db.collection('heldItems').doc(uid), { itemId: product, venue: 'ev', houseId, untilMs: t + HELD_MS, boughtAtMs: t });
        tx.update(presRef, { holding: product });
      }
      result = { ok: true, product, label: HOUSE_PRODUCTS[product].label, price, spent: spent + price, limit: OFFICE_DAILY_LIMIT, ...(cart ? {} : { untilMs: t + HELD_MS }) };
    });
    return result;
  }

  // ---- ziyaretçi: bağış kutusu ------------------------------------------------------------
  async function officeDonate(uid, p) {
    const houseId = String(p.houseId || '');
    const amount = Number(p.amount);
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz ev.');
    if (!OFFICE_DONATE_AMOUNTS.includes(amount)) fail('invalid-argument', 'Geçersiz bağış miktarı.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Ev bulunamadı.');
      const h = hs.data();
      if (!activeOfficeKeys(h).includes('bagiskutusu')) fail('failed-precondition', 'office-donate-off');
      if (h.ownerUid === uid) fail('failed-precondition', 'Kendi bağış kutuna bağış yapamazsın.');
      if (!(await txPresent(tx, uid, houseId))) fail('failed-precondition', 'not-present');
      const t = now();
      const dayKey = midnightDayKey(t);
      const [us, os, ss] = await Promise.all([tx.get(userRef(uid)), tx.get(userRef(h.ownerUid)), tx.get(spendRef(houseId, uid, dayKey))]);
      const spent = Number(ss.exists ? ss.data().amount || 0 : 0);
      if (spent + amount > OFFICE_DAILY_LIMIT) fail('failed-precondition', `office-limit:${spent}`);
      if (Number(us.data()?.gold || 0) < amount) fail('failed-precondition', 'gold');
      chargeTx(tx, { houseId, h, uid, us, os, amount, kind: 'bagis', product: null, spent, dayKey, t, tag: 'ofisBagis' });
      result = { ok: true, amount, spent: spent + amount, limit: OFFICE_DAILY_LIMIT };
    });
    return result;
  }

  // ---- v100 göçü: eski home ofisler → ofis ---------------------------------------------
  // İşletme kapanışı gibi: işletme alanları silinir, ofis ayarı eski fiyatlardan kurulur.
  async function migrateOne(houseId) {
    let done = false;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) return;
      const h = hs.data();
      if (!isLegacyHomeOffice(h)) return;
      const office = officeFromLegacy(h);
      const h1 = { ...h, biz: null, bizType: null, office };
      tx.update(houseRef(houseId), {
        biz: null,
        bizType: null,
        bizRank: FieldValue.delete(),
        bizIntent: null,
        office,
        kind: houseKind(h1),
        privacy: 'public',
        updatedAtMs: now(),
      });
      tx.set(db.collection('businessInventories').doc(houseId), { ownerUid: h.ownerUid, type: null, materials: {}, updatedAtMs: now() });
      done = true;
    });
    return done;
  }
  async function migrateLegacyHomeOffices(max = 200) {
    const snap = await db.collection('houses').where('bizType', 'in', ['mescit', 'sinema', 'studyo']).limit(max).get();
    let n = 0;
    for (const d of snap.docs) {
      if (await migrateOne(d.id).catch((e) => console.error('office migrate', d.id, e))) n += 1;
    }
    return n;
  }

  // Eski sayaçlar (saatlik)
  async function cleanup() {
    const today = midnightDayKey(now());
    const old = await db.collection('officeSpend').where('dayKey', '<', today).limit(400).get();
    if (old.size) {
      const b = db.batch();
      old.docs.forEach((d) => b.delete(d.ref));
      await b.commit();
    }
    const migrated = await migrateLegacyHomeOffices().catch((e) => {
      console.error('office migrate', e);
      return 0;
    });
    return { spend: old.size, migrated };
  }

  const ops = { officeSet, officeBuy, officeDonate };
  return { ops, cleanup, chargeMinuteTx, migrateOne, migrateLegacyHomeOffices, dailyRef };
}

export { OFFICE_FURN };
