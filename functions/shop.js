// =============================================================================
// shop.js — v77 İşletmeler Faz 2: Silahçı / Modifiye Garajı / Araba Galerisi
// =============================================================================
// Atölye (tamir + geliştirme) ve vitrin (dükkân ilanı = 2. el ilanı).
//
// Veri:
//   houses/{id}.bizPrices.materials[k] = { mat, labor }  — herkes görür
//   houses/{id}.bizPricesAtMs                           — son fiyat değişimi
//   houses/{id}.bizShortage = { items:{k:true}, smsDay } + bizShortagePending
//   businessInventories/{houseId}.materials[k]          — (v124 öncesi) dükkânın malzemesi
//   v124: dükkânın malzemesi = SAHİBİN ortak envanteri users/{sahip}/inventory/{k}
//   (fabrika + işletmeler ortak; functions/materials.js). Müşteri malzeme bilmez:
//   kendi malzemesi kullanılmaz, sadece "hangi ürün, kaç altın".
//   weapons|vehicles/{id}: shopHouseId, shopListingId, shopAddedDayKey
//     Vitrindeki ürün her zaman listed:true kalır (oyunun her yerinde "ilanda
//     = kullanılamaz" kontrolü zaten var). shopListingId doluysa aktif 2. el
//     ilanı vardır; ilan 7 günde düşse de ürün dükkânda kalır (shopListingId
//     null). 00:00'da dükkândaki ürünün ömrü AZALMAZ (dailyReset).
//   marketplaceListings/{id}: shopHouseId, shopName — dükkân ilanı
//
// Kurallar:
//   - Atölye: malzeme Amazor fiyatının %70–100'ü, işçilik %10–30'u (malzeme
//     başına). Oyunun dükkânı %100 + %30, sınırsız malzeme. İşçilik her adet
//     için ZORUNLU; müşteri kendi malzemesini kullanabilir (o kısım için
//     sadece işçilik). Müşterinin malzemesi harcanır (kimseye geçmez);
//     dükkânın malzemesi işletme envanterinden düşer. Fiyat onay anında
//     değiştiyse işlem reddedilir (istemci yeniden onay ister).
//   - Vitrin: silahçıda en fazla 10 silah, galeride en fazla 10 araç; fiyat
//     bandı 2. el ile AYNI (itemRules.itemListingBand). v115: vitrine konduğu
//     gün (00:00'dan önce) geri çekmek bedelsiz; 00:00 geçtiyse ömür −1 (onay
//     ister). Geri alınan ürün hemen tekrar vitrine konabilir (bedeli ömürle
//     ödendi; eski "00:00'a kadar konamaz" yasağı v115'te kalktı). Ömrü 0 ürün konamaz.
//     Vitrin ilanı 7. gün: fiyat bandın ortasının altındaysa oyun satın alır,
//     değilse ilan düşer (ürün vitrinde kalır) — 2. el ile aynı kural.
//     Satış alıcıya giden ürünün ömrünü düşürmez.
// =============================================================================

import { BIZ_TYPES, midnightDayKey } from './businessCatalogData.js';
import { bizTax, resaleTax, taxLedgerWrite } from './tax.js';
import {
  WORKSHOP_MATERIALS,
  WORKSHOP_ITEM_TYPE,
  workshopBand,
  gameWorkshopPrice,
  clampWorkshopPrice,
  workshopJob,
  vehicleLevelUpPatch,
  workshopCost,
  lifeCapOf,
  repairBonusOf,
  weaponPowerAtLevel,
  itemListingBand,
  itemListingFields,
} from './itemRules.js';
import { goldTag } from './moneyLog.js';
import { itemListingTimeFields } from './listingBatches.js';

export const SHOP_MAX_ITEMS = 10;
export const VITRIN_ITEM_TYPE = { silahci: 'weapon', galeri: 'vehicle' };
const PRESENCE_ACTIVE_MS = 2 * 60 * 1000;
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const coll = (itemType) => (itemType === 'vehicle' ? 'vehicles' : 'weapons');

export function createShop({ db, FieldValue, HttpsError, requireAuth, onCall, splitIncomeForDebt, business, advanceOnboardingStep = async () => {}, now = () => Date.now(), extraOps = {} }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const invDoc = (uid, k) => userRef(uid).collection('inventory').doc(k);
  const listingsRef = db.collection('marketplaceListings');

  async function txHouse(tx, houseId) {
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz dükkân.');
    const s = await tx.get(houseRef(houseId));
    if (!s.exists) fail('not-found', 'Dükkân bulunamadı.');
    return s.data();
  }
  function requireBiz(h, types) {
    const t = h?.biz?.type;
    if (!t || !types.includes(t)) fail('failed-precondition', 'biz-closed');
    return t;
  }
  function requireOwner(h, uid) {
    if (h.ownerUid !== uid) fail('permission-denied', 'Bu dükkân senin değil.');
  }
  async function txPresent(tx, uid, houseId) {
    const p = await tx.get(db.collection('housePresence').doc(uid));
    const d = p.exists ? p.data() : null;
    if (!d || d.houseId !== houseId) return false;
    const at = d.updatedAt?.toMillis?.() ?? Number(d.updatedAt || 0);
    return !(at && now() - at > PRESENCE_ACTIVE_MS);
  }
  const sellerNameOf = (u) => String(u?.displayName || 'Oyuncu').slice(0, 40);

  // ---- malzeme stoğu (sahibin envanteri ⇄ işletme envanteri) -------------------
  // v124: malzeme ekleme/çekme yok — fabrikanın ürettiği ve Mağaza'dan alınan malzeme
  // otomatik olarak sahibinin ORTAK envanterine girer (functions/materials.js).
  async function stock() {
    fail('failed-precondition', 'Malzemeler artık fabrika ve işletmelerinin ORTAK envanterinde — eklemeye gerek yok. Eksikse Envanter › Mağaza’dan al.');
  }

  // ---- atölye fiyatları -----------------------------------------------------------
  async function prices(uid, p) {
    const houseId = String(p.houseId || '');
    const input = p.materials && typeof p.materials === 'object' ? p.materials : {};
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId);
      requireOwner(h, uid);
      const type = requireBiz(h, Object.keys(WORKSHOP_MATERIALS));
      const out = { ...(h.bizPrices?.materials || {}) };
      for (const [k, v] of Object.entries(input)) {
        if (!WORKSHOP_MATERIALS[type].includes(k)) fail('invalid-argument', 'Geçersiz malzeme.');
        const b = workshopBand(k);
        const mat = Number(v?.mat);
        const labor = Number(v?.labor);
        if (!Number.isInteger(mat) || mat < b.matMin || mat > b.matMax) fail('invalid-argument', `price-band:${k}:mat`);
        if (!Number.isInteger(labor) || labor < b.laborMin || labor > b.laborMax) fail('invalid-argument', `price-band:${k}:labor`);
        out[k] = { mat, labor };
      }
      tx.update(houseRef(houseId), { 'bizPrices.materials': out, bizPricesAtMs: now() });
      result = { ok: true, materials: out };
    });
    return result;
  }

  // ---- ATÖLYE: tamir / geliştirme ---------------------------------------------------
  // p: { shop: houseId | 'game', shopType ('silahci'|'modifiye', oyun dükkânı için),
  //      itemId, action:'repair'|'upgrade', upgradeType?, expect }
  async function workshop(uid, p) {
    const isGame = p.shop === 'game';
    const houseId = isGame ? null : String(p.shop || '');
    const itemId = String(p.itemId || '');
    const action = p.action === 'upgrade' ? 'upgrade' : p.action === 'repair' ? 'repair' : null;
    if (!action || !isId(itemId)) fail('invalid-argument', 'Geçersiz işlem.');
    let result = null;
    await db.runTransaction(async (tx) => {
      let h = null;
      let type = isGame ? String(p.shopType || '') : null;
      if (!isGame) {
        h = await txHouse(tx, houseId);
        type = requireBiz(h, Object.keys(WORKSHOP_MATERIALS));
        if (!(await txPresent(tx, uid, houseId))) fail('failed-precondition', 'not-present');
      }
      if (!WORKSHOP_MATERIALS[type]) fail('invalid-argument', 'Geçersiz atölye.');
      const itemType = WORKSHOP_ITEM_TYPE[type];
      const itemRef = db.collection(coll(itemType)).doc(itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists || itemSnap.data().ownerId !== uid) fail('failed-precondition', 'not-owner');
      const item = itemSnap.data();
      const job = workshopJob({ itemType, item, action, upgradeType: p.upgradeType });
      if (job.block) fail('failed-precondition', `job-${job.block}`);
      const { material, qty } = job;
      const price = isGame ? gameWorkshopPrice(material) : clampWorkshopPrice(material, h.bizPrices?.materials?.[material]);
      const reads = [tx.get(userRef(uid))];
      if (!isGame) reads.push(tx.get(invDoc(h.ownerUid, material)), tx.get(userRef(h.ownerUid)));
      const [us, si, os] = await Promise.all(reads);
      const user = us.data() || {};
      // v124: dükkânın stoğu = sahibin ortak envanteri; müşterinin kendi malzemesi KULLANILMAZ
      const shopHave = isGame ? Infinity : Math.max(0, Number(si?.exists ? si.data().quantity || 0 : 0));
      const ownQty = 0;
      if (qty - ownQty > shopHave) fail('failed-precondition', 'shop-short');
      const cost = workshopCost({ mat: price.mat, labor: price.labor, qty, ownQty });
      if (Number(p.expect) !== cost.total) fail('aborted', `price-changed:${cost.total}`);
      const selfService = !isGame && h.ownerUid === uid;
      if (!selfService && Number(user.gold || 0) < cost.total) fail('failed-precondition', 'gold');

      // --- yazmalar ---
      if (!selfService && cost.total > 0) tx.update(userRef(uid), { gold: FieldValue.increment(-cost.total), goldTag: goldTag('atolye') });
      if (!isGame) {
        if (cost.shopQty > 0) tx.set(invDoc(h.ownerUid, material), { quantity: FieldValue.increment(-cost.shopQty) }, { merge: true });
        // v77 vergi: cironun %10'u (işçilik ve malzeme ayrı ayrı)
        // v127: oran türüne göre (Silahçı / Modifiye — Ticaret Bakanlığı)
        const taxLabor = selfService ? 0 : bizTax(cost.labor, type);
        const taxMat = selfService ? 0 : bizTax(cost.material, type);
        if (!selfService && cost.total > 0) {
          const { goldDelta, debtDelta } = splitIncomeForDebt(os.data()?.debtToState, cost.total - taxLabor - taxMat);
          tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('atolye'), debtToState: FieldValue.increment(debtDelta) });
        }
        business?.recordIncomeTx(tx, { houseId, h, amount: cost.labor, kind: 'labor', customerUid: uid, products: { [`${action}:${itemType}`]: 1 }, tax: taxLabor });
        if (cost.material > 0) business?.recordIncomeTx(tx, { houseId, h, amount: cost.material, kind: 'material', customerUid: uid, materialsUsed: { [material]: cost.shopQty }, tax: taxMat });
        // Aynı işi bir daha karşılayamayacak kadar stok kaldıysa sahibe (günde en
        // fazla bir kez, toplu) SMS için işaretle — bkz. business.sendShortageSms
        const left = shopHave - cost.shopQty;
        if (left < qty && !h.bizShortage?.items?.[material]) {
          tx.update(houseRef(houseId), { [`bizShortage.items.${material}`]: true, bizShortagePending: true });
        }
      }
      if (isGame && cost.total > 0) {
        // oyunun dükkânı: gelir sadece sıralama için kaydedilir
        business?.recordGameIncomeTx?.(tx, { type, amount: cost.labor, kind: 'labor', customerUid: uid, products: { [`${action}:${itemType}`]: 1 }, tax: bizTax(cost.labor, type) });
        if (cost.material > 0) business?.recordGameIncomeTx?.(tx, { type, amount: cost.material, kind: 'material', customerUid: uid, tax: bizTax(cost.material, type) });
      }
      // ürün güncellemesi (eski repairItem / upgradeWeapon / upgradeVehicle ile aynı)
      let patch;
      if (action === 'repair') {
        const cap = lifeCapOf(itemType);
        patch = { lifeDays: Math.min(cap, (item.lifeDays ?? cap) + repairBonusOf(itemType)), repairsUsed: (item.repairsUsed || 0) + 1 };
      } else if (itemType === 'weapon') {
        const level = (item.level || 1) + 1;
        patch = { level, power: weaponPowerAtLevel(item.basePower, level) };
      } else {
        // v78: araç seviyesi +1 (hız / ivme / nitro)
        patch = vehicleLevelUpPatch(item);
      }
      tx.update(itemRef, patch);
      result = { ok: true, action, itemType, qty, own: cost.own, shopQty: cost.shopQty, labor: cost.labor, material: cost.material, total: cost.total };
    });
    // Onboarding görev 19 — "silahını geliştir"
    if (result.action === 'upgrade' && result.itemType === 'weapon') await advanceOnboardingStep(uid, 19).catch(() => {});
    return result;
  }

  // ---- VİTRİN ------------------------------------------------------------------------
  async function txVitrinCount(tx, houseId, itemType) {
    const snap = await tx.get(db.collection(coll(itemType)).where('shopHouseId', '==', houseId).limit(SHOP_MAX_ITEMS + 1));
    return snap.size;
  }
  function newListing(tx, { uid, user, h, houseId, itemType, itemId, item, price }) {
    const ref = listingsRef.doc();
    tx.set(ref, {
      sellerId: uid,
      sellerName: sellerNameOf(user),
      ...itemListingFields(itemType, itemId, item),
      price,
      // v115: 7. gün otomatik sat / ilandan kaldır (index.js settleItemListing)
      ...itemListingTimeFields(now(), itemListingBand(itemType, item)),
      shopHouseId: houseId,
      shopName: String(h.name || BIZ_TYPES[h.biz.type].label).slice(0, 40),
      createdAt: FieldValue.serverTimestamp(),
      sold: false,
    });
    return ref.id;
  }
  function checkPrice(itemType, item, price) {
    const band = itemListingBand(itemType, item);
    if (!Number.isInteger(price) || price < band.min || price > band.max) fail('invalid-argument', `price-band:${band.min}:${band.max}`);
  }

  async function vitrinAdd(uid, p) {
    const houseId = String(p.houseId || '');
    const itemId = String(p.itemId || '');
    const price = Number(p.price);
    if (!isId(itemId)) fail('invalid-argument', 'Geçersiz ürün.');
    // Polis: elinde en az 1 kullanılabilir silah kalmalı (2. el kuralıyla aynı)
    const pre = await userRef(uid).get();
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId);
      requireOwner(h, uid);
      const type = requireBiz(h, Object.keys(VITRIN_ITEM_TYPE));
      const itemType = VITRIN_ITEM_TYPE[type];
      const itemRef = db.collection(coll(itemType)).doc(itemId);
      const [is, us] = await Promise.all([tx.get(itemRef), tx.get(userRef(uid))]);
      if (!is.exists || is.data().ownerId !== uid) fail('failed-precondition', 'not-owner');
      const item = is.data();
      if (item.listed) fail('failed-precondition', 'listed');
      if (itemType === 'vehicle' && (item.mortgaged || item.seizedByBank)) fail('failed-precondition', 'mortgaged');
      if ((item.lifeDays ?? lifeCapOf(itemType)) <= 0) fail('failed-precondition', 'life0');
      if (itemType === 'weapon' && pre.data()?.profession === 'polis') {
        const mine = await tx.get(db.collection('weapons').where('ownerId', '==', uid));
        const usable = mine.docs.filter((d) => !d.data().listed).length;
        if (usable <= 1) fail('failed-precondition', 'police-last');
      }
      if ((await txVitrinCount(tx, houseId, itemType)) >= SHOP_MAX_ITEMS) fail('failed-precondition', 'vitrin-full');
      checkPrice(itemType, item, price);
      const listingId = newListing(tx, { uid, user: us.data(), h, houseId, itemType, itemId, item, price });
      tx.update(itemRef, { listed: true, shopHouseId: houseId, shopListingId: listingId, shopAddedDayKey: midnightDayKey(now()) });
      result = { ok: true, listingId };
    });
    return result;
  }

  // Vitrinde duran (ilanı düşmüş/kaldırılmış) ürünü yeniden ilana koy
  async function vitrinList(uid, p) {
    const houseId = String(p.houseId || '');
    const itemId = String(p.itemId || '');
    const price = Number(p.price);
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId);
      requireOwner(h, uid);
      const type = requireBiz(h, Object.keys(VITRIN_ITEM_TYPE));
      const itemType = VITRIN_ITEM_TYPE[type];
      const itemRef = db.collection(coll(itemType)).doc(itemId);
      const [is, us] = await Promise.all([tx.get(itemRef), tx.get(userRef(uid))]);
      const item = is.exists ? is.data() : null;
      if (!item || item.ownerId !== uid || item.shopHouseId !== houseId) fail('failed-precondition', 'not-in-shop');
      if (item.shopListingId) fail('failed-precondition', 'already-listed');
      checkPrice(itemType, item, price);
      const listingId = newListing(tx, { uid, user: us.data(), h, houseId, itemType, itemId, item, price });
      tx.update(itemRef, { shopListingId: listingId });
      result = { ok: true, listingId };
    });
    return result;
  }

  // Vitrindeki ürünün okunması (ilan dahil). OKUMA yapar.
  async function txShopItem(tx, uid, houseId, itemId) {
    const h = await txHouse(tx, houseId);
    requireOwner(h, uid);
    const type = requireBiz(h, Object.keys(VITRIN_ITEM_TYPE));
    const itemType = VITRIN_ITEM_TYPE[type];
    const itemRef = db.collection(coll(itemType)).doc(String(itemId || ''));
    const is = await tx.get(itemRef);
    const item = is.exists ? is.data() : null;
    if (!item || item.ownerId !== uid || item.shopHouseId !== houseId) fail('failed-precondition', 'not-in-shop');
    let listing = null;
    if (item.shopListingId) {
      const ls = await tx.get(listingsRef.doc(item.shopListingId));
      if (ls.exists && !ls.data().sold) listing = { ref: ls.ref, data: ls.data() };
    }
    return { h, itemType, itemRef, item, listing };
  }

  // İlanı kaldır, ürün vitrinde (kilitli, ömrü donuk) kalır — cezasız
  async function vitrinUnlist(uid, p) {
    await db.runTransaction(async (tx) => {
      const { itemRef, listing } = await txShopItem(tx, uid, String(p.houseId || ''), p.itemId);
      if (listing) tx.update(listing.ref, { sold: true, cancelled: true, expireAtMs: FieldValue.delete() });
      tx.update(itemRef, { shopListingId: null });
    });
    return { ok: true };
  }

  // v115 — vitrine konduğu gün (00:00'dan önce) geri çekmek bedelsiz; 00:00
  // geçtiyse ömür −1 (istemci onay ister → p.confirmPenalty) ve ürün 00:00'a
  // kadar tekrar vitrine konamaz. Eski kayıtta (gün yok) ceza uygulanır.
  const removePenalty = (item) => !item.shopAddedDayKey || item.shopAddedDayKey !== midnightDayKey(now());
  async function vitrinRemove(uid, p) {
    let result = null;
    await db.runTransaction(async (tx) => {
      const { itemType, itemRef, item, listing } = await txShopItem(tx, uid, String(p.houseId || ''), p.itemId);
      const penalty = removePenalty(item);
      if (penalty && !p.confirmPenalty) fail('failed-precondition', 'remove-penalty');
      if (listing) tx.update(listing.ref, { sold: true, cancelled: true, expireAtMs: FieldValue.delete() });
      const cur = item.lifeDays ?? lifeCapOf(itemType);
      const life = penalty ? Math.max(0, cur - 1) : cur;
      tx.update(itemRef, {
        listed: false,
        shopHouseId: FieldValue.delete(),
        shopListingId: FieldValue.delete(),
        shopAddedDayKey: FieldValue.delete(),
        lifeDays: life,
      });
      result = { ok: true, lifeDays: life, penalized: penalty };
    });
    return result;
  }

  // Vitrindeki ürünü anında sat (2. el "anında sat" ile aynı ödeme + sistem ilanı)
  async function vitrinInstantSell(uid, p) {
    let result = null;
    await db.runTransaction(async (tx) => {
      const { itemType, itemRef, item, listing } = await txShopItem(tx, uid, String(p.houseId || ''), p.itemId);
      const us = await tx.get(userRef(uid));
      const payout = itemListingBand(itemType, item).instant;
      if (listing) tx.update(listing.ref, { sold: true, cancelled: true, expireAtMs: FieldValue.delete() });
      // v77 vergi: 2. el / vitrin satışı · v127: oran Ticaret Bakanlığı (araba / silah)
      const tax = resaleTax(payout, itemType);
      const ik = itemType === 'vehicle' ? 'araba' : 'silah';
      taxLedgerWrite(tx, db, FieldValue, { amount: tax, source: 'ikinciEl', uid, atMs: now(), ref: String(p.houseId || ''), stat: { [`ie_${ik}_n`]: 1, [`ie_${ik}_ciro`]: payout } });
      const { goldDelta, debtDelta } = splitIncomeForDebt(us.data()?.debtToState, payout - tax);
      tx.update(userRef(uid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('vitrin'), debtToState: FieldValue.increment(debtDelta) });
      const sysRef = listingsRef.doc();
      tx.set(sysRef, {
        sellerId: 'system',
        sellerName: 'Sistem',
        ...itemListingFields(itemType, itemRef.id, item),
        price: Math.ceil(payout * 1.1),
        createdAt: FieldValue.serverTimestamp(),
        sold: false,
      });
      tx.update(itemRef, { listed: true, shopHouseId: FieldValue.delete(), shopListingId: FieldValue.delete(), shopAddedDayKey: FieldValue.delete() });
      result = { ok: true, payout, tax, net: payout - tax };
    });
    return result;
  }

  // ---- İşletme kapanırken (houses.js bizHooks) -------------------------------------
  // Vitrindeki tüm ürünler sahibine döner — vitrinden çekmekle AYNI kural: ömür −1
  // ve 00:00'a kadar tekrar vitrine konamaz (yoksa "kapat-aç" cezasız geri çekme
  // yolu olurdu). Sonra normal yaşlanır. Açık ilanlar kapanır. Uyarı ekranı
  // (bizStatus.statusExtra) bunu önceden gösterir, sahip vazgeçebilir.
  async function onCloseRead(tx, { houseId }) {
    const [ws, vs, ls] = await Promise.all([
      tx.get(db.collection('weapons').where('shopHouseId', '==', houseId)),
      tx.get(db.collection('vehicles').where('shopHouseId', '==', houseId)),
      tx.get(listingsRef.where('shopHouseId', '==', houseId).where('sold', '==', false)),
    ]);
    const pack = (snap, kind) => snap.docs.map((d) => ({ ref: d.ref, life: d.data().lifeDays ?? lifeCapOf(kind), penalty: removePenalty(d.data()) }));
    return { weapons: pack(ws, 'weapon'), vehicles: pack(vs, 'vehicle'), listings: ls.docs.map((d) => d.ref) };
  }
  function onCloseWrite(tx, { state }) {
    if (!state) return {};
    // v115: bugün konan ürün bedelsiz döner (vitrinden çekmekle aynı kural)
    [...state.weapons, ...state.vehicles].forEach(({ ref, life, penalty = true }) =>
      tx.update(ref, {
        listed: false,
        shopHouseId: FieldValue.delete(),
        shopListingId: FieldValue.delete(),
        shopAddedDayKey: FieldValue.delete(),
        lifeDays: penalty ? Math.max(0, life - 1) : life,
      })
    );
    state.listings.forEach((ref) => tx.update(ref, { sold: true, cancelled: true, expireAtMs: FieldValue.delete() }));
    return { weapons: state.weapons.length, vehicles: state.vehicles.length };
  }
  async function statusExtra({ houseId }) {
    const [ws, vs] = await Promise.all([
      db.collection('weapons').where('shopHouseId', '==', houseId).get(),
      db.collection('vehicles').where('shopHouseId', '==', houseId).get(),
    ]);
    return { weapons: ws.size, vehicles: vs.size };
  }

  const shopAction = onCall(async (request) => {
    const uid = requireAuth(request);
    const p = request.data || {};
    switch (p.op) {
      case 'stock':
        return stock(uid, p);
      case 'prices':
        return prices(uid, p);
      case 'workshop':
        return workshop(uid, p);
      case 'vitrinAdd':
        return vitrinAdd(uid, p);
      case 'vitrinList':
        return vitrinList(uid, p);
      case 'vitrinUnlist':
        return vitrinUnlist(uid, p);
      case 'vitrinRemove':
        return vitrinRemove(uid, p);
      case 'vitrinInstantSell':
        return vitrinInstantSell(uid, p);
      default:
        // v77 Faz 3: cafe/bar menüsü + internet kafe (functions/venue.js)
        if (Object.prototype.hasOwnProperty.call(extraOps, p.op)) return extraOps[p.op](uid, p);
        return fail('invalid-argument', 'Bilinmeyen işlem.');
    }
  });

  return { shopAction, bizHooks: { onCloseRead, onCloseWrite, statusExtra } };
}
