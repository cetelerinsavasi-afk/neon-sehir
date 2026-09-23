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
    const { min, max } = priceRange(it);
    if (unitPrice < min || unitPrice > max) fail('invalid-argument', `Adet fiyatı ${fmt(min)} – ${fmt(max)} altın arasında olmalı.`);
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await trade.readGangRole(tx, ctx, 'sagkol', 'Depodan ilanı sadece Mafya Babası ve Sağ Kol verebilir.');
      const [depotSnap, gangSnap] = await Promise.all([tx.get(ctx.ref.depot(gangId)), tx.get(ctx.ref.gang(gangId))]);
      if (trade.availableOf(depotSnap.data(), key) < qty) fail('failed-precondition', 'Depoda bu kadar (ilanda olmayan) ürün yok.');
      const g = gangSnap.data();
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
      tx.update(ctx.ref.listing(listingId), { status: 'cancelled', cancelledAtMs: ctx.now });
      tx.update(ctx.ref.depot(gangId), { [`listed.${l.itemKey}`]: FV.increment(-l.quantity) });
      return { cancelled: true };
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
      tx.update(ctx.ref.listing(listingId), { quantity: left, soldQty: FV.increment(qty), status: left <= 0 ? 'sold' : 'open', lastSoldAtMs: ctx.now });
      trade.deliverItem(tx, ctx, ctx.actorId, it, qty);
      ledger(tx, ctx, { type: 'gang_market_sale', amount: cost, from: { kind: 'player', id: ctx.actorId }, to: { kind: 'gang', id: l.gangId }, before, refId: listingId });
      announce(tx, ctx, l.gangId, '💵', `2. elden ${qty} × ${l.label} satıldı: kasaya +${fmt(cost)}.`);
      notify(tx, ctx, ctx.actorId, `🛒 ${l.gangName} çetesinden ${qty} × ${l.label} aldın (${fmt(cost)} altın). Ürün${it.kind === 'material' ? '' : 'ler yeni (20/20 ömür) olarak'} envanterinde.`, 'market');
      const res = { bought: qty, cost, kind: it.kind, material: it.material || null };
      guard.save(res);
      return res;
    });
  }

  return { listDepotItem, cancelDepotListing, buyMarketListing, priceRange, MAX_LIST: GANG.DEPOT_CAPACITY_PER_PURCHASE };
}
