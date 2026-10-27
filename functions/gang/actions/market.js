// 2. EL PAZARI — çete deposundaki ürünlerin diğer oyunculara satışı.
//  - Baba / Sağ Kol depodaki araba, silah ya da yasaklı maddeyi adet fiyatıyla
//    ilana koyar. Fiyat aralığı mevcut 2. el pazarıyla aynı: yeni ürün için
//    mağaza (yasaklı madde: Amazor) fiyatının yarısı ile tamamı arası.
//  - İlandaki ürünler SATILANA KADAR depoda kalır ve yer kaplar; bu sürede
//    sisteme satılamaz, dağıtılamaz, tekrar ilana konamaz (depot.listed).
//  - Her oyuncu (çetesi olmasa da) satın alabilir: para alıcıdan düşer, çete
//    kasasına girer; alıcıya YENİ ürün verilir (araç/silah 20/20 ömür — ömrü
//    mevcut gece işleminde ilk kez bir sonraki 00:00'da azalır).
//  - İlanlar çete dünyasında (gangWorlds/{dünya}/market) tutulur; mevcut
//    marketplaceListings koleksiyonuna ve fonksiyonlarına dokunulmaz.
import { GANG } from '../config.js';
import { adPriceFor, countActiveAds } from '../../marketAds.js';
import { LISTING_TTL_MS as LISTING_TTL, autoSellsAt, batchesOf, addBatch, consumeBatches, splitDue, nextExpireAtMs } from '../../listingBatches.js';
import { isPristineListing, bestStockPrice } from '../../shopStockRules.js';

// v103: depodaki MALZEME (yasaklı madde) ilanı, adet fiyatı aralığın %50'sinin
// altındaysa her parti 7 gün sonra satılmamışsa oyuna satılır (para kasaya).
// %50 ve üstü ilanlar eskisi gibi açık kalır. Bkz. functions/listingBatches.js
// v134: aynı kural depodaki ARABA / SİLAH ilanları için de geçerli (fabrika
// malzeme satışıyla aynı): fiyat avantajlıysa 7 gün sonra oyuna satılır.

export function createMarketActions(core, trade) {
  const { FV, fail, readWallet, debitGold, ledger, announce, notify, posInt, requestGuard, unitsOfItems } = core;
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

  function priceRange(it) {
    return { min: Math.floor(it.storePrice / 2), max: it.storePrice };
  }

  async function listDepotItem(ctx, data) {
    const key = String(data.itemKey || '');
    const qty = posInt(data.qty, 'Adet');
    const unitPrice = posInt(data.unitPrice, 'Fiyat');
    const it = core.parseItemKey(key);
    if (!it) fail('invalid-argument', 'Geçersiz ürün.');
    // v124: yasaklı madde 2. elde satılmaz — çete deposundan "Depoya sat"
    if (it.kind === 'material' && it.material === 'yasakliMadde') fail('failed-precondition', 'Yasaklı madde artık 2. elde satılmıyor — Depo › "Depoya sat" ile bir depoya satabilirsin.');
    const { min, max } = priceRange(it);
    if (unitPrice < min || unitPrice > max) fail('invalid-argument', `Adet fiyatı ${fmt(min)} – ${fmt(max)} altın arasında olmalı.`);
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await trade.readGangRole(tx, ctx, 'sagkol', 'Depodan ilanı sadece Mafya Babası ve Sağ Kol verebilir.');
      const [depotSnap, gangSnap, sameSnap] = await Promise.all([
        tx.get(ctx.ref.depot(gangId)),
        tx.get(ctx.ref.gang(gangId)),
        tx.get(ctx.ref.listings().where('gangId', '==', gangId).where('itemKey', '==', key).where('status', '==', 'open')),
      ]);
      if (trade.availableOf(depotSnap.data(), key) < qty) fail('failed-precondition', 'Depoda bu kadar (ilanda olmayan) ürün yok.');
      const g = gangSnap.data();
      // v70: aynı ürün aynı fiyatla zaten ilandaysa yeni ilan açılmaz, mevcut ilana eklenir
      const same = sameSnap.docs.find((d) => Number(d.data().unitPrice) === unitPrice);
      const autoSell = autoSellsAt(unitPrice, min, max);
      if (same) {
        const cur = same.data();
        // partisiz eski araba/silah ilanının mevcut adedi için 7 gün bugünden başlar
        const base = Array.isArray(cur.batches) || it.kind === 'material' ? batchesOf(cur, cur.createdAtMs) : batchesOf(cur, ctx.now);
        const batches = addBatch(base, qty, ctx.now);
        tx.update(same.ref, {
          quantity: FV.increment(qty),
          listedQty: FV.increment(qty),
          batches,
          ...(autoSell ? { autoSellAtMs: nextExpireAtMs(batches) } : {}),
        });
        tx.update(ctx.ref.depot(gangId), { [`listed.${key}`]: FV.increment(qty) });
        announce(tx, ctx, gangId, '🏷️', `${me.name} 2. eldeki ${it.label} ilanına ${qty} adet ekledi (adet ${fmt(unitPrice)}).`);
        const res = { listingId: same.id, merged: true };
        guard.save(res);
        return res;
      }
      const ref = ctx.ref.listings().doc();
      tx.set(ref, {
        gangId,
        gangName: g.name,
        gangLogo: g.logo || null,
        itemKey: key,
        itemType: it.kind,
        productId: it.productId,
        catalogId: it.catalogId ?? null,
        materialType: it.material || null,
        label: it.label,
        storePrice: it.storePrice,
        unitPrice,
        quantity: qty,
        listedQty: qty,
        soldQty: 0,
        status: 'open',
        createdByName: me.name,
        createdAtMs: ctx.now,
        batches: [{ q: qty, at: ctx.now }],
        ...(autoSell ? { autoSellAtMs: ctx.now + LISTING_TTL } : {}),
      });
      tx.update(ctx.ref.depot(gangId), { [`listed.${key}`]: FV.increment(qty) });
      announce(tx, ctx, gangId, '🏷️', `${me.name} depodan 2. ele ${qty} × ${it.label} koydu (adet ${fmt(unitPrice)}).`);
      const res = { listingId: ref.id };
      guard.save(res);
      return res;
    });
  }

  async function cancelDepotListing(ctx, data) {
    const listingId = String(data.listingId || '');
    return core.db.runTransaction(async (tx) => {
      const { gangId } = await trade.readGangRole(tx, ctx, 'sagkol', 'İlanı sadece Mafya Babası ve Sağ Kol kaldırabilir.');
      const l = (await tx.get(ctx.ref.listing(listingId))).data();
      if (!l || l.gangId !== gangId) fail('not-found', 'İlan bulunamadı.');
      if (l.status !== 'open') fail('failed-precondition', 'Bu ilan artık açık değil.');
      tx.update(ctx.ref.listing(listingId), { status: 'cancelled', cancelledAtMs: ctx.now, ...(l.autoSellAtMs != null ? { autoSellAtMs: FV.delete() } : {}) });
      tx.update(ctx.ref.depot(gangId), { [`listed.${l.itemKey}`]: FV.increment(-l.quantity) });
      return { cancelled: true };
    });
  }

  // v71 — ilana reklam: "📢 Reklam Verilen Ürünler" panelinde 24 saat görünür.
  // Ücret çete kasasından düşer, iade edilmez (oyuncu ilan reklamıyla aynı).
  async function advertiseDepotListing(ctx, data) {
    const listingId = String(data.listingId || '');
    if (!listingId) fail('invalid-argument', 'İlan bulunamadı.');
    // v96: ücret paneldeki reklam sayısına göre (functions/marketAds.js)
    const adPrice = adPriceFor(
      await countActiveAds({ playersCol: core.db.collection('marketplaceListings'), gangMarketCol: ctx.ref.listings(), nowMs: ctx.now })
    );
    if (data.expect != null && Number(data.expect) !== adPrice) fail('failed-precondition', `Reklam ücreti değişti: ${fmt(adPrice)} altın. Tekrar dene.`);
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await trade.readGangRole(tx, ctx, 'sagkol', 'İlana reklamı sadece Mafya Babası ve Sağ Kol verebilir.');
      const [lSnap, stateSnap] = await Promise.all([tx.get(ctx.ref.listing(listingId)), tx.get(ctx.ref.gangState(gangId))]);
      const l = lSnap.data();
      if (!l || l.gangId !== gangId) fail('not-found', 'İlan bulunamadı.');
      if (l.status !== 'open' || Number(l.quantity || 0) <= 0) fail('failed-precondition', 'Bu ilan artık açık değil.');
      if (Number(l.adExpiresAtMs || 0) > ctx.now) fail('failed-precondition', 'Bu ilan zaten reklamda, süresi dolmadan tekrar reklam verilemez.');
      const kasa = Number(stateSnap.data()?.kasa || 0);
      const price = adPrice;
      if (kasa < price) fail('failed-precondition', 'Kasada yeterli para yok.');
      const adExpiresAtMs = ctx.now + GANG.MARKET_AD_DURATION_MS;
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-price) });
      tx.update(ctx.ref.listing(listingId), { adExpiresAtMs, adPurchasedAtMs: ctx.now });
      ledger(tx, ctx, { type: 'gang_market_ad', amount: price, from: { kind: 'gang', id: gangId }, to: { kind: 'burn' }, before: kasa, refId: listingId });
      announce(tx, ctx, gangId, '📢', `${me.name} 2. eldeki ${l.label} ilanına reklam verdi (${fmt(price)} altın, 24 saat).`);
      const res = { listingId, adExpiresAtMs };
      guard.save(res);
      return res;
    });
  }

  async function buyMarketListing(ctx, data) {
    const listingId = String(data.listingId || '');
    const qty = posInt(data.qty ?? 1, 'Adet');
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const lSnap = await tx.get(ctx.ref.listing(listingId));
      const l = lSnap.data();
      if (!l || l.status !== 'open') fail('failed-precondition', 'Bu ilan artık satışta değil.');
      if (qty > Number(l.quantity || 0)) fail('failed-precondition', 'İlanda bu kadar ürün kalmadı.');
      const [wallet, gangSnap, depotSnap] = await Promise.all([readWallet(tx, ctx, ctx.actorId), tx.get(ctx.ref.gang(l.gangId)), tx.get(ctx.ref.depot(l.gangId))]);
      if (gangSnap.data()?.status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
      const it = core.parseItemKey(l.itemKey);
      const have = Number(depotSnap.data()?.items?.[l.itemKey] || 0);
      if (!it || have < qty) fail('failed-precondition', 'Ürün depoda yok.');
      const cost = l.unitPrice * qty;
      const before = wallet.gold;
      debitGold(tx, ctx, ctx.actorId, wallet, cost);
      tx.update(ctx.ref.gangState(l.gangId), { kasa: FV.increment(cost) });
      tx.update(ctx.ref.depot(l.gangId), {
        [`items.${l.itemKey}`]: FV.increment(-qty),
        [`listed.${l.itemKey}`]: FV.increment(-qty),
        usedUnits: FV.increment(-unitsOfItems({ [l.itemKey]: qty })),
      });
      const left = Number(l.quantity) - qty;
      // v103: partili malzeme ilanında satış en eski partiden düşer (FIFO)
      const batchPatch = {};
      if (Array.isArray(l.batches)) {
        const batches = left > 0 ? consumeBatches(batchesOf(l, l.createdAtMs), qty) : [];
        batchPatch.batches = batches;
        if (l.autoSellAtMs != null) batchPatch.autoSellAtMs = left > 0 ? nextExpireAtMs(batches) : FV.delete();
      }
      tx.update(ctx.ref.listing(listingId), { quantity: left, soldQty: FV.increment(qty), status: left <= 0 ? 'sold' : 'open', lastSoldAtMs: ctx.now, ...batchPatch });
      trade.deliverItem(tx, ctx, ctx.actorId, it, qty);
      ledger(tx, ctx, { type: 'gang_market_sale', amount: cost, from: { kind: 'player', id: ctx.actorId }, to: { kind: 'gang', id: l.gangId }, before, refId: listingId });
      announce(tx, ctx, l.gangId, '💵', `2. elden ${qty} × ${l.label} satıldı: kasaya +${fmt(cost)}.`);
      notify(tx, ctx, ctx.actorId, `🛒 ${l.gangName} çetesinden ${qty} × ${l.label} aldın (${fmt(cost)} altın). Ürün${it.kind === 'material' ? '' : 'ler yeni (20/20 ömür) olarak'} envanterinde.`, 'market');
      const res = { bought: qty, cost, kind: it.kind, material: it.material || null };
      guard.save(res);
      return res;
    });
  }

  // v103 — saat turunda (gangClock): süresi dolan ucuz malzeme partileri oyuna
  // satılır. İdempotent: her parti bir kez düşer (işlem içinde yeniden okunur).
  async function settleDepotAutoSale(ctx, listingId) {
    return core.db.runTransaction(async (tx) => {
      const lRef = ctx.ref.listing(listingId);
      const l = (await tx.get(lRef)).data();
      if (!l) return { skipped: 'missing' };
      if (l.status !== 'open' || !['material', 'weapon', 'vehicle'].includes(l.itemType)) {
        if (l.autoSellAtMs != null) tx.update(lRef, { autoSellAtMs: FV.delete() });
        return { skipped: 'closed' };
      }
      const batches = batchesOf(l, l.createdAtMs);
      const { dueQty: rawDue, keep } = splitDue(batches, ctx.now);
      const [gangSnap, depotSnap] = await Promise.all([tx.get(ctx.ref.gang(l.gangId)), tx.get(ctx.ref.depot(l.gangId))]);
      const have = Number(depotSnap.data()?.items?.[l.itemKey] || 0);
      const dueQty = Math.min(rawDue, Number(l.quantity || 0), have);
      if (dueQty <= 0 || gangSnap.data()?.status !== 'active') {
        tx.update(lRef, { batches: keep, autoSellAtMs: nextExpireAtMs(keep) ?? FV.delete() });
        return { skipped: 'not_due' };
      }
      const amount = Number(l.unitPrice) * dueQty;
      tx.update(ctx.ref.gangState(l.gangId), { kasa: FV.increment(amount) });
      tx.update(ctx.ref.depot(l.gangId), {
        [`items.${l.itemKey}`]: FV.increment(-dueQty),
        [`listed.${l.itemKey}`]: FV.increment(-dueQty),
        usedUnits: FV.increment(-unitsOfItems({ [l.itemKey]: dueQty })),
      });
      const left = Number(l.quantity) - dueQty;
      tx.update(lRef, {
        quantity: left,
        soldQty: FV.increment(dueQty),
        autoSoldQty: FV.increment(dueQty),
        status: left <= 0 ? 'sold' : 'open',
        lastSoldAtMs: ctx.now,
        batches: left > 0 ? keep : [],
        autoSellAtMs: left > 0 ? nextExpireAtMs(keep) ?? FV.delete() : FV.delete(),
      });
      ledger(tx, ctx, { type: 'gang_market_autosale', amount, from: { kind: 'system' }, to: { kind: 'gang', id: l.gangId }, refId: listingId, actorId: 'system' });
      announce(tx, ctx, l.gangId, '✅', `2. eldeki ${fmt(dueQty)} × ${l.label} 7 gün içinde satılmadığı için otomatik satıldı: kasaya +${fmt(amount)}.`);
      return { sold: dueQty, amount };
    });
  }

  async function settleDepotAutoSales(ctx) {
    const due = await ctx.ref.listings().where('autoSellAtMs', '<=', ctx.now).limit(200).get();
    let n = 0;
    for (const d of due.docs) {
      const r = await settleDepotAutoSale(ctx, d.id);
      if (r?.sold) n += 1;
    }
    return { settled: n };
  }

  // ---------------------------------------------------------------------------
  // v132 — SİLAHÇI / GALERİ STOK KAYNAĞI: çete deposundaki araç / silah her zaman
  // sıfırdır (alıcıya yeni ürün verilir). Silahçı / galeri "Vitrine ekle" dediğinde,
  // fiyatı alış fiyatına eşit ya da daha ucuz olan en ucuz çete ilanı otomatik alınır
  // (functions/shop.js stockAdd). get: tx.get ya da (teklif için) düz okuma.
  // ---------------------------------------------------------------------------
  const stockKeyOf = (kind, catalogId) => `${kind === 'vehicle' ? 'araba' : 'silah'}:${Number(catalogId)}`;
  async function stockCandidates(get, ctx, kind, catalogId = null) {
    const base = ctx.ref.listings().where('status', '==', 'open');
    const snap = await get(catalogId == null ? base.where('itemType', '==', kind) : base.where('itemKey', '==', stockKeyOf(kind, catalogId)));
    return snap.docs
      .map((d) => ({ id: d.id, ref: d.ref, l: d.data() }))
      .filter(({ l }) => l.itemType === kind && Number(l.quantity || 0) > 0 && Number(l.unitPrice) > 0)
      .map(({ id, ref, l }) => ({ src: 'g', id, ref, l, catalogId: Number(l.catalogId), price: Number(l.unitPrice), qty: Number(l.quantity), at: Number(l.createdAtMs || 0) }));
  }
  // İşlem içinde: çete aktif mi, depoda ürün var mı → kaç adet alınabilir
  async function stockValidate(tx, ctx, cand) {
    const [ls, gs, ds] = await Promise.all([tx.get(cand.ref), tx.get(ctx.ref.gang(cand.l.gangId)), tx.get(ctx.ref.depot(cand.l.gangId))]);
    const l = ls.data();
    if (!l || l.status !== 'open' || gs.data()?.status !== 'active') return 0;
    const have = Number(ds.data()?.items?.[l.itemKey] || 0);
    return Math.max(0, Math.min(Number(l.quantity || 0), have));
  }
  // İşlem içinde YAZMA: qty adet → çete kasasına para, depodan düş, ilan güncelle
  function stockWrite(tx, ctx, cand, qty, { shopName = 'Bir dükkân' } = {}) {
    const l = cand.l;
    const cost = Number(l.unitPrice) * qty;
    tx.update(ctx.ref.gangState(l.gangId), { kasa: FV.increment(cost) });
    tx.update(ctx.ref.depot(l.gangId), {
      [`items.${l.itemKey}`]: FV.increment(-qty),
      [`listed.${l.itemKey}`]: FV.increment(-qty),
      usedUnits: FV.increment(-unitsOfItems({ [l.itemKey]: qty })),
    });
    const left = Number(l.quantity) - qty;
    // v134: partili ilanda satış en eski partiden düşer (otomatik satış zamanı da güncellenir)
    const batchPatch = {};
    if (Array.isArray(l.batches)) {
      const batches = left > 0 ? consumeBatches(batchesOf(l, l.createdAtMs), qty) : [];
      batchPatch.batches = batches;
      if (l.autoSellAtMs != null) batchPatch.autoSellAtMs = left > 0 ? nextExpireAtMs(batches) ?? FV.delete() : FV.delete();
    }
    tx.update(cand.ref, { quantity: left, soldQty: FV.increment(qty), status: left <= 0 ? 'sold' : 'open', lastSoldAtMs: ctx.now, ...batchPatch });
    ledger(tx, ctx, { type: 'gang_market_sale', amount: cost, from: { kind: 'player', id: ctx.actorId }, to: { kind: 'gang', id: l.gangId }, refId: cand.id });
    announce(tx, ctx, l.gangId, '💵', `2. elden ${qty} × ${l.label} satıldı (${String(shopName).slice(0, 40)}): kasaya +${fmt(cost)}.`);
    return cost;
  }

  // v134 — PİYASA DEĞERİ (ilana koyarken gösterilir): galericinin / silahçının
  // "Vitrine ekle" deyince bu ürüne ödeyeceği fiyat = alış fiyatı (mağaza fiyatının
  // %75'i) ya da daha ucuza satıştaki en ucuz sıfır ilan (başka çeteler + 2. el).
  // Bu fiyata ya da altına konan ilanı dükkân oyundan önce alır.
  async function quoteMarketValue(ctx, data) {
    const it = core.parseItemKey(String(data.itemKey || ''));
    if (!it) fail('invalid-argument', 'Geçersiz ürün.');
    if (it.kind !== 'weapon' && it.kind !== 'vehicle') return { value: null };
    const m = await core.readMembership(null, ctx, ctx.actorId);
    const own = m?.gangId || null;
    const sources = [];
    try {
      for (const c of await stockCandidates((q) => q.get(), ctx, it.kind, it.catalogId)) if (c.l.gangId !== own) sources.push({ price: c.price });
    } catch (err) {
      ctx.logs.push({ gang: 'market_value_error', src: 'gang', err: String(err?.message || err) });
    }
    if (!ctx.isTest) {
      try {
        const field = it.kind === 'vehicle' ? 'vehicleCatalogId' : 'weaponCatalogId';
        const snap = await core.db.collection('marketplaceListings').where('sold', '==', false).where('itemType', '==', it.kind).where(field, '==', Number(it.catalogId)).get();
        for (const d of snap.docs) {
          const l = d.data();
          if (isPristineListing(l) && Number(l.price) > 0) sources.push({ price: Math.floor(Number(l.price)) });
        }
      } catch (err) {
        ctx.logs.push({ gang: 'market_value_error', src: 'player', err: String(err?.message || err) });
      }
    }
    return { value: bestStockPrice(it.storePrice, sources) };
  }

  return { quoteMarketValue, listDepotItem, cancelDepotListing, advertiseDepotListing, buyMarketListing, settleDepotAutoSales, priceRange, MAX_LIST: GANG.DEPOT_CAPACITY_PER_PURCHASE, stockCandidates, stockValidate, stockWrite };
}
