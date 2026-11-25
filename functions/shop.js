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

import { BIZ_TYPES, midnightDayKey, bizDayKey } from './businessCatalogData.js';
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
import { V196_GONE_TEXT, v196WorkshopPrice } from './v196Shared.js';
import { sanitizeMods, compactMods, modCost } from './vehicleMods.js';
import { isVehicleId } from './vehicleKinds.js';
import { vehicleShopOf, canModify } from './fleet.js'; // v177: galeri → araba, motor galerisi → motor, ticari / bisiklet / at dükkânda yok
import { itemListingTimeFields, batchesOf, consumeBatches, nextExpireAtMs, materialTtl } from './listingBatches.js';
import { planAutoSupply, planGameSupply, ownListingStock, AUTO_SUPPLY_MAT_NAMES } from './autoSupply.js';
import { VEHICLE_CATALOG, WEAPON_CATALOG } from './catalogData.js';
import { WEAPON_INITIAL_LIFE_DAYS, vehicleLifeCap } from './itemRules.js';
import { newSaleTax } from './tax.js';
import { isBizPassive } from './bizPassive.js'; // v195 pasif mekân
import { STOCK_KIND, STOCK_ADD_MAX, stockUnitCost, stockPriceBand, validStockPrice, clampStockPrice, stockUnitPaid, stockQty, isPristineItem, isPristineListing, sourceOrder, bestStockPrice } from './shopStockRules.js';

// v130 — oyunun mağazasındakiyle AYNI yeni ürün belgesi (index.js buyWeapon / buyVehicle de kullanır)
export function newWeaponDoc(uid, catalogId, FieldValue) {
  const e = WEAPON_CATALOG[catalogId];
  return {
    ownerId: uid,
    catalogId: Number(catalogId),
    name: e.name,
    basePrice: e.price,
    basePower: e.power,
    power: e.power,
    level: 1,
    lifeDays: WEAPON_INITIAL_LIFE_DAYS,
    repairsUsed: 0,
    purchasedAt: FieldValue.serverTimestamp(),
  };
}
export function newVehicleDoc(uid, catalogId, FieldValue) {
  const e = VEHICLE_CATALOG[catalogId];
  return {
    ownerId: uid,
    catalogId: Number(catalogId),
    model: e.name,
    baseGalleryValue: e.price,
    gearLevel: e.gearLevel,
    baseTank: e.baseTank,
    tankBonus: 0,
    gearUpgraded: false,
    tankUpgraded: false,
    storage: e.storage,
    turboCount: e.turboCount,
    mortgaged: false,
    seizedByBank: false,
    lifeDays: vehicleLifeCap(catalogId), // v195: araba / ticari 10, motor 20
    repairsUsed: 0,
    purchasedAt: FieldValue.serverTimestamp(),
  };
}
export const catalogOf = (kind) => (kind === 'vehicle' ? VEHICLE_CATALOG : WEAPON_CATALOG);
// v130: sıfır satış analizi sayaçları (oyuncu dükkânı 'sf_', oyunun dükkânı 'sfg_')
export const newSaleStat = (kind, { price, profit, tax, game = false }) => {
  const k = `${game ? 'sfg' : 'sf'}_${kind === 'vehicle' ? 'araba' : 'silah'}`;
  return { [`${k}_n`]: 1, [`${k}_ciro`]: price, [`${k}_kar`]: profit, [`${k}_vergi`]: tax };
};

export const SHOP_MAX_ITEMS = 10;
export const VITRIN_ITEM_TYPE = { silahci: 'weapon', galeri: 'vehicle' };
const PRESENCE_ACTIVE_MS = 2 * 60 * 1000;
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const coll = (itemType) => (itemType === 'vehicle' ? 'vehicles' : 'weapons');

export function createShop({ db, FieldValue, HttpsError, requireAuth, onCall, splitIncomeForDebt, business, advanceOnboardingStep = async () => {}, now = () => Date.now(), extraOps = {}, gangSource = { current: null } }) {
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

  // v128/v129 — tedarikte kullanılan ilanları düş, satıcılara öde (malzeme satışında
  // vergi yok — buyListing ile aynı). Kendi ilanından alınan kısım (own) parasız.
  function applySupplyListingsTx(tx, { supply, buyerId }) {
    const credit = {};
    for (const t of supply.takes) {
      const l = t.listing;
      const lref = listingsRef.doc(l.id);
      const remaining = Number(l.quantity || 0) - t.qty;
      const hasBatches = Array.isArray(l.batches);
      if (remaining <= 0) {
        tx.update(lref, {
          quantity: 0,
          price: 0,
          sold: true,
          buyerId,
          soldAt: FieldValue.serverTimestamp(),
          ...(hasBatches ? { batches: [], expireAtMs: FieldValue.delete() } : {}),
        });
      } else if (hasBatches) {
        const batches = consumeBatches(batchesOf(l), t.qty);
        tx.update(lref, { quantity: remaining, price: t.unit * remaining, batches, expireAtMs: nextExpireAtMs(batches, materialTtl(l.materialType, t.unit)) ?? FieldValue.delete() });
      } else {
        tx.update(lref, { quantity: remaining, price: t.unit * remaining });
      }
      if (!t.own && l.sellerId && l.sellerId !== 'system') {
        const c = (credit[l.sellerId] = credit[l.sellerId] || { amount: 0, qty: 0 });
        c.amount += t.unit * t.qty;
        c.qty += t.qty;
      }
    }
    for (const [sid, c] of Object.entries(credit)) {
      const ss = supply.sellerSnaps?.[sid];
      if (!ss?.exists) continue;
      const { goldDelta, debtDelta } = splitIncomeForDebt(ss.data()?.debtToState, c.amount);
      tx.update(userRef(sid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('ikinciEl'), debtToState: FieldValue.increment(debtDelta) });
      tx.set(userRef(sid).collection('messages').doc(), {
        text: `2. El: "${c.qty} adet malzeme" ilanın ${c.amount.toLocaleString('tr-TR')} altına satıldı, hesabına yattı.`, // v157.2: 2. el satışta vergi yok — vergi satırı kalktı
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'marketplace_sale',
      });
    }
  }
  // dükkân sahibine bilgi (oyuncu dükkânı)
  function ownerSupplySms(tx, { supply, h, houseId, material, type }) {
    const matName = AUTO_SUPPLY_MAT_NAMES[material] || 'malzeme';
    const fmtN = (n) => Number(n || 0).toLocaleString('tr-TR');
    const shopName = String(h.name || BIZ_TYPES[type]?.label || 'Dükkân').slice(0, 40);
    const parts = [];
    if (supply.ownQty > 0) parts.push(`kendi Mağaza ilanından ${fmtN(supply.ownQty)} adet kullanıldı`);
    if (supply.extQty > 0) parts.push(`Mağaza'dan ${fmtN(supply.extQty)} adet otomatik alındı (${fmtN(supply.cost)} altın, vergi sonrası kârın ${fmtN(supply.profit)} altın)`);
    tx.set(userRef(h.ownerUid).collection('messages').doc(), {
      text: `${BIZ_TYPES[type]?.icon || '🏪'} ${shopName} dükkânında ${matName} olmadığı için ${parts.join(', ')}. Müşterinin işi yapıldı.`,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
      type: 'biz_auto_supply',
      houseId,
    });
  }

  // ---- ATÖLYE: tamir / geliştirme ---------------------------------------------------
  // p: { shop: houseId | 'game', shopType ('silahci'|'modifiye', oyun dükkânı için),
  //      itemId, action:'repair'|'upgrade', upgradeType?, expect }
  // v196 — ATÖLYE (sadece oyunun silahçısı / modifiyecisi). İşçilik YOK; malzeme oyundan, sınırsız:
  // ücret = gereken malzeme adedi × malzeme fiyatı (tamir 10 · silah gel. 100 · araba gel. 500) =
  // tamirde ürün fiyatının %10'u, geliştirmede ürün fiyatının tamamı (kullanıcı kuralı). Mağaza
  // ilanlarından otomatik alım yok. Gelir mekânın paylaşımına (business.recordGameIncomeTx).
  async function workshop(uid, p) {
    const itemId = String(p.itemId || '');
    const action = p.action === 'upgrade' ? 'upgrade' : p.action === 'repair' ? 'repair' : null;
    if (!action || !isId(itemId)) fail('invalid-argument', 'Geçersiz işlem.');
    const want = String(p.shopType || '');
    let result = null;
    await db.runTransaction(async (tx) => {
      // v198: oto tamirci (hastanenin / belediyenin yanındaki binanın zemin katı) — sadece araç TAMİRİ;
      // geliri kendi Borsa hissesine (mk_tamirci). Modifiye garajında tamir ESKİ istemciler için hâlâ kabul.
      const itemType = want === 'modifiye' || want === 'tamirci' ? 'vehicle' : want === 'silahci' ? 'weapon' : p.itemType === 'vehicle' ? 'vehicle' : 'weapon';
      if (want === 'tamirci' && action !== 'repair') fail('failed-precondition', 'Tamircide sadece tamir yapılır.');
      const type = want === 'tamirci' ? 'tamirci' : itemType === 'vehicle' ? 'modifiye' : 'silahci';
      const itemRef = db.collection(coll(itemType)).doc(itemId);
      const [itemSnap, us] = await Promise.all([tx.get(itemRef), tx.get(userRef(uid))]);
      if (!itemSnap.exists || itemSnap.data().ownerId !== uid) fail('failed-precondition', 'not-owner');
      const item = itemSnap.data();
      const job = workshopJob({ itemType, item, action, upgradeType: p.upgradeType });
      if (job.block) fail('failed-precondition', `job-${job.block}`);
      const base = v196WorkshopPrice(job);
      // v202: vergi fiyatın üstüne eklenir (Silah / Modifiye / Tamirci vergisi) — müşteri toplamı öder
      const vat = business?.saleTaxOf?.(type, base) || 0;
      const total = base + vat;
      if (Number(p.expect) !== total) fail('aborted', `price-changed:${total}`);
      if (Number(us.data()?.gold || 0) < total) fail('failed-precondition', 'gold');
      if (total > 0) tx.update(userRef(uid), { gold: FieldValue.increment(-total), goldTag: goldTag('atolye') });
      const sp = business?.recordGameIncomeTx?.(tx, { type, amount: base, kind: 'service', customerUid: uid, products: { [`${action}:${itemType}`]: 1 } });
      let patch;
      if (action === 'repair') {
        const cap = lifeCapOf(itemType, item);
        patch = { lifeDays: Math.min(cap, (item.lifeDays ?? cap) + repairBonusOf(itemType)), repairsUsed: (item.repairsUsed || 0) + 1 };
      } else if (itemType === 'weapon') {
        const level = (item.level || 1) + 1;
        patch = { level, power: weaponPowerAtLevel(item.basePower, level) };
      } else {
        patch = vehicleLevelUpPatch(item); // araç seviyesi +1 (hız / ivme / nitro)
      }
      tx.update(itemRef, patch);
      result = { ok: true, action, itemType, qty: job.qty, labor: 0, material: base, price: base, total, tax: sp?.tax ?? vat };
    });
    // Onboarding görev 19 — "silahını geliştir"
    if (result.action === 'upgrade' && result.itemType === 'weapon') await advanceOnboardingStep(uid, 19).catch(() => {});
    return result;
  }

  // v151 — dünün EN AZ kazanan oyuncu dükkânı (bizRank en büyük; dün sırası olmayan yeni
  // dükkânlar sıralılardan sonra). Liste günde bir kez sorgulanıp gameVenues/{tür}.least'e
  // yazılır (her işlemde tüm dükkânlar okunmasın). Alıcının kendi dükkânı atlanır.
  async function leastEarnerTx(tx, type, excludeUid) {
    const day = bizDayKey(type, now());
    const gs = await tx.get(db.collection('gameVenues').doc(type));
    const cached = gs.exists ? gs.data()?.least : null;
    let ids = cached?.day === day && Array.isArray(cached.ids) ? cached.ids.filter(isId) : null;
    let cacheWrite = null;
    if (!ids) {
      const qs = await tx.get(db.collection('houses').where('bizType', '==', type).limit(300));
      const rk = (d) => {
        const r = Number(d.data().bizRank);
        return Number.isFinite(r) && r > 0 ? r : 0;
      };
      ids = qs.docs
        .filter((d) => !d.data().bizGame && d.data().biz?.type === type && d.data().ownerUid && !isBizPassive(d.data())) // v195: pasif atlanır
        .sort((a, b) => Number(rk(a) === 0) - Number(rk(b) === 0) || rk(b) - rk(a) || a.id.localeCompare(b.id))
        .slice(0, 8)
        .map((d) => d.id);
      cacheWrite = { least: { day, ids } };
    }
    for (const id of ids) {
      const hs = await tx.get(houseRef(id));
      const h = hs.exists ? hs.data() : null;
      if (h && !h.bizGame && h.biz?.type === type && h.ownerUid && h.ownerUid !== excludeUid && !isBizPassive(h)) return { houseId: id, h, cacheWrite };
    }
    return { houseId: null, h: null, cacheWrite };
  }

  // ---- v150 MODİFİYE (sadece modifiye garajları) -------------------------------------
  // p: { shop: houseId | 'game', vehicleId, mods (istenen tam görünüm), expect }
  // Ücret = aracın ŞU ANKİ halinden farklı her alanın fiyatı (aracın fiyatının yüzdesi —
  // functions/vehicleMods.js). Satın alınan tasarım saklanmaz: değiştirince gider.
  // Para: oyuncu dükkânında vergi kesilip sahibine; oyunun garajında vergi belediyeye.
  // Dükkân sahibi kendi garajında modifiye yaptıramaz. Sadece görünüm (yarış değeri yok).
  async function modify(uid, p) {
    const isGame = true; // v196: sadece oyunun modifiyecisi (oyuncu dükkânı yok)
    const houseId = null;
    const vehicleId = String(p.vehicleId || '');
    if (!isId(vehicleId)) fail('invalid-argument', 'Geçersiz araç.');
    let result = null;
    await db.runTransaction(async (tx) => {
      let h = null;
      const type = 'modifiye';
      if (!isGame) {
        h = await txHouse(tx, houseId);
        requireBiz(h, ['modifiye']);
        if (h.ownerUid === uid) fail('failed-precondition', 'own-shop');
        if (!(await txPresent(tx, uid, houseId))) fail('failed-precondition', 'not-present');
      }
      // v151: oyunun garajında yapılan modifiyenin parası DÜNÜN EN AZ KAZANAN modifiyecisine
      // (vergisi kesilerek) gider; hiç oyuncu modifiyecisi yoksa oyuna (eski davranış).
      const least = null; // v196: en az kazanan oyuncu dükkânı yönlendirmesi kalktı
      const payHouseId = null;
      const vRef = db.collection('vehicles').doc(vehicleId);
      const reads = [tx.get(vRef), tx.get(userRef(uid))];
      if (h) reads.push(tx.get(userRef(h.ownerUid)));
      const [vs, us, os] = await Promise.all(reads);
      if (!vs.exists || vs.data().ownerId !== uid) fail('failed-precondition', 'not-owner');
      const v = vs.data();
      if (v.listed) fail('failed-precondition', 'listed');
      if (v.seizedByBank) fail('failed-precondition', 'mortgaged');
      if (!canModify(v.catalogId)) fail('failed-precondition', 'Bisiklet, at ve deveye modifiye yapılmaz.'); // v177
      const cid = Number(v.catalogId);
      if (!isVehicleId(cid)) fail('invalid-argument', 'Bu araç modifiye edilemez.');
      const want = sanitizeMods(cid, p.mods);
      const cost = modCost(cid, v.mods || null, want);
      if (cost.total <= 0) fail('failed-precondition', 'no-change');
      // v202: Modifiye Vergisi fiyatın üstüne eklenir — müşteri toplamı öder
      const vat = business?.saleTaxOf?.(type, cost.total) || 0;
      const pay = cost.total + vat;
      if (Number(p.expect) !== pay) fail('aborted', `price-changed:${pay}`);
      if (Number(us.data()?.gold || 0) < pay) fail('failed-precondition', 'gold');
      // --- yazmalar ---
      tx.update(userRef(uid), { gold: FieldValue.increment(-pay), goldTag: goldTag('modifiye') });
      tx.update(vRef, { mods: compactMods(cid, want), modsAtMs: now() });
      const products = Object.fromEntries(cost.items.map((x) => [`modifiye:${x.label}`, 1]));
      if (least?.cacheWrite) tx.set(db.collection('gameVenues').doc(type), least.cacheWrite, { merge: true });
      if (payHouseId && h) {
        const tax = bizTax(cost.total, type);
        const { goldDelta, debtDelta } = splitIncomeForDebt(os.data()?.debtToState, cost.total - tax);
        tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('modifiye'), debtToState: FieldValue.increment(debtDelta) });
        business?.recordIncomeTx(tx, { houseId: payHouseId, h, amount: cost.total, kind: 'labor', customerUid: uid, products, tax });
      } else {
        business?.recordGameIncomeTx?.(tx, { type, amount: cost.total, kind: 'service', customerUid: uid, products });
      }
      result = { ok: true, total: pay, price: cost.total, tax: vat, items: cost.items, mods: compactMods(cid, want) };
    });
    return result;
  }

  // ---- v130 STOK (silahçı / galeri) -------------------------------------------------
  const stockRef = (houseId) => db.collection('shopStocks').doc(houseId);
  // v177: type verilirse (dükkân türü) araç o dükkânın sattıklarından olmalı
  const cleanCid = (kind, v, type = null) => {
    const cid = String(Math.floor(Number(v) || 0));
    if (!catalogOf(kind)[cid]) fail('invalid-argument', 'Geçersiz ürün.');
    if (kind === 'vehicle') {
      const shop = vehicleShopOf(cid);
      if (!shop) fail('failed-precondition', 'Bu araç dükkânlarda satılmıyor.');
      if (type && shop !== type) fail('failed-precondition', shop === 'motogaleri' ? 'Motorlar motor galerisinde satılır.' : 'Arabalar araba galerisinde satılır.');
    }
    return cid;
  };
  const sellsHere = (kind, type, cid) => kind !== 'vehicle' || vehicleShopOf(cid) === type;
  // Stok belgesi (başka türden kalmışsa boş sayılır)
  const stockOf = (snap, type) => {
    const d = snap?.exists ? snap.data() : null;
    return d && d.type === type ? d : { items: {}, paid: {}, prices: {} };
  };
  const TYPES_OF_KIND = { weapon: ['silahci'], vehicle: ['galeri', 'motogaleri'] }; // v177: dizin ortak (katalog no'ları çakışmaz)

  // ---- v132 TEKLİF DİZİNİ: shopOffers/{weapon|vehicle} -------------------------------
  // Oyunun mağazası artık stoğu olan oyuncu dükkânlarının EN UCUZUNU satar (para o
  // dükkâna gider). Her müşterinin tüm stokları okumaması için tek belgelik dizin:
  //   { v: 1, offers: { katalogId: { houseId: satışFiyatı } }, updatedAtMs }
  // Sadece stoğu (≥1) olan dükkânlar yer alır. Stok / fiyat değiştikçe aynı işlemde
  // güncellenir (okumadan, birleştirerek yazılır). Bozuk kayıt satın alma anında
  // doğrulanır ve düzeltilir (kapanmış dükkân, biten stok, değişmiş fiyat).
  const offersRef = (kind) => db.collection('shopOffers').doc(kind);
  function offerWrite(tx, kind, houseId, cid, price) {
    tx.set(offersRef(kind), { offers: { [cid]: { [houseId]: price > 0 ? price : FieldValue.delete() } }, updatedAtMs: now() }, { merge: true });
  }
  // İlk kullanımda (v132 geçişi) mevcut stoklardan bir kez kurulur
  async function ensureOffers(kind) {
    const ref = offersRef(kind);
    const s0 = await ref.get();
    if (s0.exists && s0.data()?.v === 1) return;
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists && s.data()?.v === 1) return;
      const ss = await tx.get(db.collection('shopStocks').where('type', 'in', TYPES_OF_KIND[kind]));
      const offers = {};
      for (const d of ss.docs) {
        const st = d.data();
        for (const cid of Object.keys(st.items || {})) {
          if (!catalogOf(kind)[cid] || stockQty(st, cid) < 1 || !sellsHere(kind, st.type, cid)) continue;
          (offers[cid] ||= {})[d.id] = clampStockPrice(catalogOf(kind)[cid].price, st.prices?.[cid]);
        }
      }
      tx.set(ref, { v: 1, offers, updatedAtMs: now() });
    });
  }

  // ---- v132 KAYNAK: 2. el (oyuncu) + çete deposu ilanları ------------------------------
  // gangSource: functions/gang/system.js stockSource (index.js sonradan bağlar)
  const listingAt = (l) => l.createdAt?.toMillis?.() ?? Number(l.createdAtMs || 0);
  async function playerCandidates(get, kind, catalogId = null) {
    let q = listingsRef.where('sold', '==', false).where('itemType', '==', kind);
    if (catalogId != null) q = q.where(kind === 'vehicle' ? 'vehicleCatalogId' : 'weaponCatalogId', '==', Number(catalogId));
    const snap = await get(q);
    return snap.docs
      .map((d) => ({ id: d.id, ref: d.ref, l: d.data() }))
      .filter(({ l }) => isPristineListing(l) && Number(l.price) > 0)
      .map(({ id, ref, l }) => ({ src: 'p', id, ref, l, catalogId: Number(kind === 'vehicle' ? l.vehicleCatalogId : l.weaponCatalogId), price: Math.floor(Number(l.price)), qty: 1, at: listingAt(l) }));
  }
  async function gangCandidates(get, gctx, kind, catalogId = null) {
    const g = gangSource.current;
    if (!g || !gctx) return [];
    try {
      return await g.candidates(get, gctx, kind, catalogId);
    } catch (err) {
      console.error('stok: çete ilanları okunamadı', err?.message || err);
      return [];
    }
  }

  // Sahip: "Vitrine ekle" fiyatları — her ürün için 1 adedin alış fiyatı (2. el / çete
  // ilanı varsa onun fiyatı, yoksa oyunun alış fiyatı). İşlem değil, düz okuma.
  async function stockQuote(uid, p) {
    const houseId = String(p.houseId || '');
    const hs = await houseRef(houseId).get();
    const h = hs.exists ? hs.data() : null;
    if (!h || h.ownerUid !== uid) fail('permission-denied', 'Bu dükkân senin değil.');
    const type = requireBiz(h, Object.keys(STOCK_KIND));
    const kind = STOCK_KIND[type];
    const gctx = gangSource.current ? await gangSource.current.ctx(uid).catch(() => null) : null;
    const get = (q) => q.get();
    const cands = [...(await playerCandidates(get, kind)), ...(await gangCandidates(get, gctx, kind))];
    const prices = {};
    for (const cid of Object.keys(catalogOf(kind))) {
      if (!sellsHere(kind, type, cid)) continue; // v177: galeri → arabalar, motor galerisi → motorlar
      prices[cid] = bestStockPrice(catalogOf(kind)[cid].price, cands.filter((c) => c.catalogId === Number(cid)));
    }
    return { ok: true, kind, prices };
  }

  // Sahip: stoğa ekle. v132: önce alış fiyatına eşit / daha ucuz en ucuz sıfır ilanlar
  // (2. el + çete deposu), kalanı oyunun mağazasından (%75; para oyundan çıkar).
  async function stockAdd(uid, p) {
    const houseId = String(p.houseId || '');
    const qty = Math.floor(Number(p.qty ?? 1));
    if (!Number.isInteger(qty) || qty < 1 || qty > STOCK_ADD_MAX) fail('invalid-argument', 'Geçersiz adet.');
    // dizin + çete bağlamı işlemden önce (işlem içinde yeniden okunur / doğrulanır)
    const pre = (await houseRef(houseId).get()).data();
    const preKind = STOCK_KIND[pre?.biz?.type];
    if (preKind) await ensureOffers(preKind);
    const gctx = gangSource.current ? await gangSource.current.ctx(uid).catch(() => null) : null;
    let result = null;
    const smsList = [];
    await db.runTransaction(async (tx) => {
      smsList.length = 0;
      const h = await txHouse(tx, houseId);
      requireOwner(h, uid);
      const type = requireBiz(h, Object.keys(STOCK_KIND));
      const kind = STOCK_KIND[type];
      const cid = cleanCid(kind, p.catalogId, kind === 'vehicle' ? type : null);
      const e = catalogOf(kind)[cid];
      const unit = stockUnitCost(e.price);
      const [us, ss] = await Promise.all([tx.get(userRef(uid)), tx.get(stockRef(houseId))]);
      // kaynaklar: fiyatı alış fiyatını geçmeyenler, ucuzdan pahalıya
      const get = (q) => tx.get(q);
      const cands = [...(await playerCandidates(get, kind, cid)), ...(await gangCandidates(get, gctx, kind, cid))].filter((c) => c.price <= unit).sort(sourceOrder);
      const picks = [];
      let need = qty;
      for (const c of cands) {
        if (need <= 0) break;
        if (c.src === 'p') {
          const itemRef = db.collection(coll(kind)).doc(String(kind === 'vehicle' ? c.l.vehicleId : c.l.weaponId || ''));
          const sys = c.l.sellerId === 'system';
          const [is, sl] = await Promise.all([tx.get(itemRef), sys ? null : tx.get(userRef(c.l.sellerId))]);
          const it = is.exists ? is.data() : null;
          if (!it || !it.listed || it.shopHouseId || (!sys && it.ownerId !== c.l.sellerId) || Number(it.catalogId) !== Number(cid) || !isPristineItem(kind, it)) continue;
          picks.push({ c, take: 1, itemRef, sys, seller: sl });
          need -= 1;
        } else {
          if (picks.some((x) => x.c.src === 'g' && x.c.l.gangId === c.l.gangId)) continue; // çete başına tek ilan (tek yazım)
          const have = await gangSource.current.validate(tx, gctx, c);
          const take = Math.min(have, need);
          if (take < 1) continue;
          picks.push({ c, take });
          need -= take;
        }
      }
      const fromListings = picks.reduce((a, x) => a + x.c.price * x.take, 0);
      const cost = fromListings + unit * need;
      if (Number(p.expect) && Number(p.expect) !== cost) fail('aborted', `price-changed:${cost}`);
      if (Number(us.data()?.gold || 0) < cost) fail('failed-precondition', 'gold');
      // --- yazmalar --- (aynı belgeye tek yazım: satıcı ödemeleri toplanır)
      const shopName = String(h.name || BIZ_TYPES[type]?.label || 'Dükkân').slice(0, 40);
      const ik = kind === 'vehicle' ? 'araba' : 'silah';
      const pay = new Map(); // satıcı uid → { gold, debt }
      let ieN = 0;
      let ieCiro = 0;
      for (const x of picks) {
        if (x.c.src === 'p') {
          const l = x.c.l;
          tx.update(x.c.ref, { sold: true, buyerId: uid, stockHouseId: houseId, soldAt: FieldValue.serverTimestamp(), ...(l.expireAtMs != null ? { expireAtMs: FieldValue.delete() } : {}) });
          tx.delete(x.itemRef);
          ieN += 1;
          ieCiro += x.c.price;
          if (!x.sys && x.seller?.exists) {
            // 2. el satışı vergisiz (v132); satıcının devlete borcu varsa kuralı aynı
            const { goldDelta, debtDelta } = splitIncomeForDebt(x.seller.data()?.debtToState, x.c.price);
            const cur = pay.get(l.sellerId) || { gold: 0, debt: 0 };
            pay.set(l.sellerId, { gold: cur.gold + goldDelta, debt: cur.debt + debtDelta });
            smsList.push({ uid: l.sellerId, text: `2. El: "${(kind === 'vehicle' ? l.vehicleModel : l.weaponName) || e.name}" ilanın ${x.c.price.toLocaleString('tr-TR')} altına ${shopName} dükkânına satıldı, hesabına yattı.` });
          }
        } else {
          gangSource.current.write(tx, gctx, x.c, x.take, { shopName });
        }
      }
      if (ieN) taxLedgerWrite(tx, db, FieldValue, { amount: 0, source: 'ikinciEl', uid, atMs: now(), stat: { [`ie_${ik}_n`]: ieN, [`ie_${ik}_ciro`]: ieCiro } });
      const mine = pay.get(uid) || { gold: 0, debt: 0 }; // kendi ilanını aldıysa
      pay.delete(uid);
      for (const [sid, v] of pay) tx.update(userRef(sid), { gold: FieldValue.increment(v.gold), goldTag: goldTag('ikinciEl'), ...(v.debt ? { debtToState: FieldValue.increment(v.debt) } : {}) });
      tx.update(userRef(uid), { gold: FieldValue.increment(mine.gold - cost), goldTag: goldTag('stok'), ...(mine.debt ? { debtToState: FieldValue.increment(mine.debt) } : {}) });
      const st = stockOf(ss, type);
      const items = { ...(st.items || {}) };
      const paid = { ...(st.paid || {}) };
      items[cid] = stockQty(st, cid) + qty;
      paid[cid] = Math.max(0, Math.round(Number(paid[cid]) || 0)) + cost;
      tx.set(stockRef(houseId), { ownerUid: h.ownerUid, type, items, paid, prices: st.prices || {}, updatedAtMs: now() });
      offerWrite(tx, kind, houseId, cid, clampStockPrice(e.price, st.prices?.[cid]));
      result = { ok: true, catalogId: cid, qty: items[cid], cost, fromListings: picks.reduce((a, x) => a + x.take, 0) };
    });
    if (gctx) gangSource.current?.flush?.(gctx);
    for (const m of smsList) {
      await userRef(m.uid)
        .collection('messages')
        .add({ text: m.text, createdAt: FieldValue.serverTimestamp(), read: false, type: 'marketplace_sale' })
        .catch(() => {});
    }
    return result;
  }

  // Sahip: satış fiyatları (mağaza fiyatının %80–100'ü). prices: { katalogId: fiyat }
  async function stockPrices(uid, p) {
    const houseId = String(p.houseId || '');
    const input = p.prices && typeof p.prices === 'object' ? p.prices : {};
    const pre = (await houseRef(houseId).get()).data();
    if (STOCK_KIND[pre?.biz?.type]) await ensureOffers(STOCK_KIND[pre.biz.type]);
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId);
      requireOwner(h, uid);
      const type = requireBiz(h, Object.keys(STOCK_KIND));
      const kind = STOCK_KIND[type];
      const ss = await tx.get(stockRef(houseId));
      const st = stockOf(ss, type);
      const prices = { ...(st.prices || {}) };
      for (const [k, v] of Object.entries(input)) {
        if (!catalogOf(kind)[String(Math.floor(Number(k) || 0))] || !sellsHere(kind, type, k)) continue; // v177: bu dükkânın satmadığı ürün — yok say
        const cid = cleanCid(kind, k);
        const b = stockPriceBand(catalogOf(kind)[cid].price);
        const price = Number(v);
        if (!validStockPrice(catalogOf(kind)[cid].price, price)) fail('invalid-argument', `price-band:${b.min}:${b.max}`); // v132: fiyata göre adım
        prices[cid] = price;
      }
      tx.set(stockRef(houseId), { ownerUid: h.ownerUid, type, items: st.items || {}, paid: st.paid || {}, prices, updatedAtMs: now() });
      for (const cid of Object.keys(input)) {
        if (!catalogOf(kind)[String(Math.floor(Number(cid) || 0))] || !sellsHere(kind, type, cid)) continue;
        const c = cleanCid(kind, cid);
        if (stockQty(st, c) > 0) offerWrite(tx, kind, houseId, c, prices[c]);
      }
      result = { ok: true, prices };
    });
    return result;
  }

  // Bir stoktan 1 adet satışın YAZMALARI (dükkânın içinden ya da oyunun mağazasından).
  // ownerSnap okunmuş olmalı. Müşteri dükkân sahibinin kendisiyse (v132: kendi
  // dükkânından alabilir) tek yazım + vergi doğrudan deftere (ciro sayılmaz).
  function stockSaleTx(tx, { houseId, h, type, kind, cid, st, price, buyerUid, ownerSnap }) {
    const e = catalogOf(kind)[cid];
    const qty = stockQty(st, cid);
    const unitPaid = stockUnitPaid(st, cid, e.price);
    const profit = Math.max(0, price - unitPaid);
    const tax = newSaleTax(profit, kind);
    const own = buyerUid === h.ownerUid;
    const itemTag = goldTag(kind === 'vehicle' ? 'arac' : 'silah');
    if (own) {
      const { goldDelta, debtDelta } = ownerSnap?.exists ? splitIncomeForDebt(ownerSnap.data()?.debtToState, price - tax) : { goldDelta: 0, debtDelta: 0 };
      tx.update(userRef(buyerUid), { gold: FieldValue.increment(goldDelta - price), goldTag: itemTag, ...(debtDelta ? { debtToState: FieldValue.increment(debtDelta) } : {}) });
      taxLedgerWrite(tx, db, FieldValue, { amount: tax, source: 'sifir', uid: h.ownerUid, atMs: now(), ref: houseId, bizType: type, stat: newSaleStat(kind, { price, profit, tax }) });
    } else {
      tx.update(userRef(buyerUid), { gold: FieldValue.increment(-price), goldTag: itemTag });
      if (ownerSnap?.exists) {
        const { goldDelta, debtDelta } = splitIncomeForDebt(ownerSnap.data()?.debtToState, price - tax);
        tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('isletme'), debtToState: FieldValue.increment(debtDelta) });
      }
      business?.recordIncomeTx(tx, { houseId, h, amount: price, kind: 'sale', customerUid: buyerUid, products: { [e.name]: 1 }, tax, taxSource: 'sifir', stat: newSaleStat(kind, { price, profit, tax }) });
    }
    const itemRef = db.collection(coll(kind)).doc();
    tx.set(itemRef, kind === 'vehicle' ? newVehicleDoc(buyerUid, cid, FieldValue) : newWeaponDoc(buyerUid, cid, FieldValue));
    const items = { ...(st.items || {}), [cid]: qty - 1 };
    const paid = { ...(st.paid || {}), [cid]: qty - 1 > 0 ? Math.max(0, Math.round(Number(st.paid?.[cid]) || 0) - unitPaid) : 0 };
    tx.set(stockRef(houseId), { ownerUid: h.ownerUid, type, items, paid, prices: st.prices || {}, updatedAtMs: now() });
    offerWrite(tx, kind, houseId, cid, qty - 1 > 0 ? price : 0);
    return { itemRef, tax, own };
  }

  // Satın alma sonrası (oyunun mağazasından alınca olanlar: onboarding)
  // v152: araç alınca gelen eski "Banka: aracını ipotek et" SMS'i kaldırıldı
  async function afterItemBuy(uid, kind, name) {
    void name;
    if (kind === 'vehicle') await advanceOnboardingStep(uid, 11).catch(() => {});
    else await advanceOnboardingStep(uid, 5).catch(() => {});
  }

  // Müşteri: stoktan satın al. p: { houseId, catalogId, expect (fiyat) }
  // v149: dükkân sahibi kendi dükkânından ALAMAZ (depo / gazino gibi).
  async function stockBuy(uid, p) {
    const houseId = String(p.houseId || '');
    const pre = (await houseRef(houseId).get()).data();
    if (STOCK_KIND[pre?.biz?.type]) await ensureOffers(STOCK_KIND[pre.biz.type]);
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txHouse(tx, houseId);
      const type = requireBiz(h, Object.keys(STOCK_KIND));
      const kind = STOCK_KIND[type];
      const cid = cleanCid(kind, p.catalogId, kind === 'vehicle' ? type : null);
      if (h.ownerUid === uid) fail('failed-precondition', 'own-shop');
      if (!(await txPresent(tx, uid, houseId))) fail('failed-precondition', 'not-present');
      const [ss, us, os] = await Promise.all([tx.get(stockRef(houseId)), tx.get(userRef(uid)), tx.get(userRef(h.ownerUid))]);
      const st = stockOf(ss, type);
      if (stockQty(st, cid) < 1) fail('failed-precondition', 'stock-out');
      const e = catalogOf(kind)[cid];
      const price = clampStockPrice(e.price, st.prices?.[cid]);
      if (Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
      if (Number(us.data()?.gold || 0) < price) fail('failed-precondition', 'gold');
      const { itemRef } = stockSaleTx(tx, { houseId, h, type, kind, cid, st, price, buyerUid: uid, ownerSnap: os });
      result = { ok: true, kind, catalogId: cid, name: e.name, price, itemId: itemRef.id };
    });
    await afterItemBuy(uid, result.kind, result.name);
    return result;
  }

  // ---- v132 OYUNUN MAĞAZASI (Silah Mağazası / Araba Galerisi) -------------------------
  // Stoğu olan oyuncu dükkânlarının en ucuzu satılır. v195 eşitlik sırası:
  //   1) fiyat eşitse BUGÜN en az kazanan (bizDayKey(tür) — gizli businessDaily/{ev}_{gün}.revenue;
  //      sadece en ucuz fiyatta 2+ geçerli aday varsa ve sadece o adaylar için okunur, en fazla 12)
  //   2) o da eşitse dünkü kazanç sırasında en altta olan (bizRank; sırası yoksa en alt sayılır)
  // Pasif (20 gün girmeyen sahibin) dükkânı aday olmaz (teklifi dizinden silinir).
  // Hiçbir dükkânda yoksa oyunun kendisi satar (eski davranış). Ekranda sadece fiyat
  // farklı görünür; satıcı belli olmaz. Kazanç tutarı herkese açık belgeye YAZILMAZ.
  //   expect: istemcinin gösterdiği fiyat (eski istemci göndermez → en ucuz fiyattan)
  const RANK_LAST = Number.MAX_SAFE_INTEGER;
  const rankOf = (h) => (Number.isFinite(Number(h?.bizRank)) && Number(h.bizRank) > 0 ? Number(h.bizRank) : RANK_LAST);
  // v196 — oyunun mağazası: silahçı / galeri / motor galerisi ürünü TAM FİYATA satar (oyuncu dükkânı
  // teklifi yok). Satış fiyatının tamamı mekânın geliri: %50 masraf + mekân vergisi + hissedar payı.
  async function gameStoreBuy(uid, kind, catalogId, expect = null) {
    const cid = cleanCid(kind, catalogId);
    const e = catalogOf(kind)[cid];
    const type = kind === 'vehicle' ? vehicleShopOf(cid) : 'silahci'; // v177: motorlar motor galerisinden
    const price = Math.max(0, Math.round(Number(e.price) || 0));
    // v202: Araba / Motor / Silah Vergisi fiyatın üstüne eklenir (müşteri fiyat + vergi öder)
    const vat = business?.saleTaxOf?.(type, price) || 0;
    const total = price + vat;
    let result = null;
    await db.runTransaction(async (tx) => {
      const us = await tx.get(userRef(uid));
      // expect: istemcinin gösterdiği TOPLAM (vergi dahil)
      if (expect != null && Number(expect) !== total) fail('aborted', `price-changed:${total}`);
      if (Number(us.data()?.gold || 0) < total) fail('failed-precondition', 'Yetersiz altın.');
      tx.update(userRef(uid), { gold: FieldValue.increment(-total), goldTag: goldTag(kind === 'vehicle' ? 'arac' : 'silah') });
      const sp = business?.recordGameIncomeTx(tx, { type, amount: price, kind: 'sale', customerUid: uid, products: { [e.name]: 1 } });
      tx.set(db.collection(coll(kind)).doc(), kind === 'vehicle' ? newVehicleDoc(uid, cid, FieldValue) : newWeaponDoc(uid, cid, FieldValue));
      result = { ok: true, price, total, fromShop: false, tax: sp?.tax ?? vat };
    });
    return { ...result, name: e.name };
  }

  // v130 — GEÇİŞ (bir kez): eski vitrin ürünleri sahibine döner. İlanı açık olan
  // normal 2. el ilanı olarak satışta kalır (ürün 2. elde kilitli, ömrü donuk);
  // ilanı olmayan envantere serbest döner. Ceza yok, ömür değişmez. Tekrar çalışması zararsız.
  const MIGRATION_DOC = () => db.collection('migrations').doc('v130ShopStock');
  async function migrateVitrin({ force = false } = {}) {
    if (!force) {
      const m = await MIGRATION_DOC().get();
      if (m.exists && m.data().doneAtMs) return { skipped: true };
    }
    const perOwner = {};
    let items = 0;
    for (const kind of ['weapon', 'vehicle']) {
      const snap = await db.collection(coll(kind)).where('shopHouseId', '>', '').get();
      for (const d of snap.docs) {
        const r = await db.runTransaction(async (tx) => {
          const is = await tx.get(d.ref);
          const it = is.exists ? is.data() : null;
          if (!it || !it.shopHouseId) return null;
          let listing = null;
          if (it.shopListingId) {
            const ls = await tx.get(listingsRef.doc(it.shopListingId));
            if (ls.exists && !ls.data().sold) listing = ls;
          }
          const clear = { shopHouseId: FieldValue.delete(), shopListingId: FieldValue.delete(), shopAddedDayKey: FieldValue.delete() };
          if (listing) {
            tx.update(listing.ref, { shopHouseId: FieldValue.delete(), shopName: FieldValue.delete() });
            tx.update(d.ref, { ...clear, listed: true });
          } else tx.update(d.ref, { ...clear, listed: false });
          return { owner: it.ownerId, listed: Boolean(listing) };
        });
        if (!r?.owner) continue;
        items += 1;
        const o = (perOwner[r.owner] ||= { back: 0, listed: 0 });
        if (r.listed) o.listed += 1;
        else o.back += 1;
      }
    }
    // ürünü bulunamayan (kalıntı) dükkân ilanları da normal ilana döner
    const ls = await listingsRef.where('shopHouseId', '>', '').get();
    let orphan = 0;
    for (const d of ls.docs) {
      await d.ref.update({ shopHouseId: FieldValue.delete(), shopName: FieldValue.delete() }).catch(() => {});
      orphan += 1;
    }
    for (const [uid, o] of Object.entries(perOwner)) {
      const parts = [];
      if (o.back) parts.push(`${o.back} ürün envanterine döndü`);
      if (o.listed) parts.push(`${o.listed} ürün 2. elde satışta kalmaya devam ediyor`);
      await userRef(uid)
        .collection('messages')
        .add({
          text: `🏪 Silahçı / galeri sistemi yenilendi: dükkânındaki ${parts.join(', ')}. Artık dükkânın stoğunu Envanter › Vitrine ekle'den oyunun mağazasından alıyorsun.`,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          type: 'biz_shop_v130',
        })
        .catch(() => {});
    }
    await MIGRATION_DOC().set({ doneAtMs: now(), items, owners: Object.keys(perOwner).length, orphan }, { merge: true });
    return { items, owners: Object.keys(perOwner).length, orphan };
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
      ...itemListingTimeFields(now(), itemListingBand(itemType, item), price),
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
    // v130: envanterden vitrine ürün konmaz — stok oyunun mağazasından alınır (stockAdd)
    fail('failed-precondition', 'vitrin-closed');
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
      if ((item.lifeDays ?? lifeCapOf(itemType, item)) <= 0) fail('failed-precondition', 'life0');
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
    fail('failed-precondition', 'vitrin-closed'); // v130
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
      const cur = item.lifeDays ?? lifeCapOf(itemType, item);
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
    const pack = (snap, kind) => snap.docs.map((d) => ({ ref: d.ref, life: d.data().lifeDays ?? lifeCapOf(kind, d.data()), penalty: removePenalty(d.data()) }));
    // v130: stok — ödenen tutar sahibine iade edilir, belge silinir
    const ss = await tx.get(stockRef(houseId));
    const stock = ss.exists ? { ref: ss.ref, refund: Object.values(ss.data().paid || {}).reduce((a, n) => a + Math.max(0, Math.round(Number(n) || 0)), 0), kind: STOCK_KIND[ss.data().type] || null, cids: Object.keys(ss.data().items || {}) } : null;
    return { weapons: pack(ws, 'weapon'), vehicles: pack(vs, 'vehicle'), listings: ls.docs.map((d) => d.ref), stock };
  }
  function onCloseWrite(tx, { h, state }) {
    if (!state) return {};
    let stockRefund = 0;
    if (state.stock) {
      stockRefund = state.stock.refund;
      if (stockRefund > 0 && h?.ownerUid) tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(stockRefund), goldTag: goldTag('stok') });
      tx.delete(state.stock.ref);
      // v132: oyunun mağazasındaki tekliflerden de düşer
      if (state.stock.kind) for (const cid of state.stock.cids || []) offerWrite(tx, state.stock.kind, state.stock.ref.id, cid, 0);
    }
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
    return { weapons: state.weapons.length, vehicles: state.vehicles.length, stockRefund };
  }
  async function statusExtra({ houseId }) {
    const [ws, vs, ss] = await Promise.all([
      db.collection('weapons').where('shopHouseId', '==', houseId).get(),
      db.collection('vehicles').where('shopHouseId', '==', houseId).get(),
      stockRef(houseId).get(),
    ]);
    const stockRefund = ss.exists ? Object.values(ss.data().paid || {}).reduce((a, n) => a + Math.max(0, Math.round(Number(n) || 0)), 0) : 0;
    return { weapons: ws.size, vehicles: vs.size, stockRefund };
  }

  const shopAction = onCall(async (request) => {
    const uid = requireAuth(request);
    const p = request.data || {};
    switch (p.op) {
      case 'modify':
        return modify(uid, p);
      case 'workshop':
        return workshop(uid, p);
      // v196: oyuncu dükkânı yok — stok / vitrin / fiyat / teklif işlemleri kibar ret
      case 'stock':
      case 'prices':
      case 'vitrinAdd':
      case 'vitrinList':
      case 'vitrinUnlist':
      case 'vitrinRemove':
      case 'vitrinInstantSell':
      case 'stockAdd':
      case 'stockPrices':
      case 'stockBuy':
      case 'stockQuote':
        return fail('failed-precondition', V196_GONE_TEXT);
      case 'offersEnsure':
        return { ok: true };
      default:
        // v77 Faz 3: cafe/bar menüsü + internet kafe (functions/venue.js)
        if (Object.prototype.hasOwnProperty.call(extraOps, p.op)) return extraOps[p.op](uid, p);
        return fail('invalid-argument', 'Bilinmeyen işlem.');
    }
  });

  return { shopAction, migrateVitrin, gameStoreBuy, afterItemBuy, bizHooks: { onCloseRead, onCloseWrite, statusExtra } };
}
