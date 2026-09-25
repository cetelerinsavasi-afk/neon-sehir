// TİCARET — ticaret yolu, tır, sipariş, depo.
//  - Sadece ticaret yolu sahibi çete (yol 21 gün elde kalır), o yolun ürününü
//    mağaza (yasaklı madde: Amazor) fiyatının yarısına sipariş edebilir.
//    Günlük sipariş limiti = yolu kazanırken kullanılan gücün %1'i (altın) — v39.
//  - Sipariş sadece Pzt–Cum; sadece Mafya Babası + Sağ Kol.
//  - Bugün verilen sipariş sonraki 00:00'da yola çıkar, 24 saat sonra (bir
//    sonraki 00:00) depoya ulaşır. YOLDAKİ tır da yeni sipariş alabilir
//    (bugünkü sipariş yarın çıkar). Her tıra günde tek sipariş.
//  - Tır: 100.000 altın, kapasite 10 araba YA DA 10 silah YA DA 100 yasaklı
//    madde (tek tür), ömrü 21 GÜN; son gün sipariş verilemez; ömrü bitince
//    hurdaya çıkar; satılamaz.
//  - Depo: her alım 100.000 altın = +100 kapasite (ömürsüz, satılamaz).
//    Yer: araba 10, silah 10, yasaklı madde 1. Depoda yer yoksa sipariş yok.
//  - Siparişler `orders/{tırId}_{gün}` belgesinde (içerik sadece çetenin
//    Kıdemli+ üyelerine görünür). Tır belgesi herkese görünür ama içerik
//    içermez.
import { GANG, productById, atLeast } from '../config.js';
import { addDays, daysBetweenKeys } from '../time.js';

export function createTradeActions(core, treasury) {
  const { FV, fail, readMembership, ledger, gangLog, announce, posInt, requireGangMember, requireRank, requestGuard, unitsOfItems, depotFree } = core;
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

  async function readGangRole(tx, ctx, minRank, msg) {
    const membership = await readMembership(tx, ctx, ctx.actorId);
    const gangId = requireGangMember(membership);
    const meSnap = await tx.get(ctx.ref.member(gangId, ctx.actorId));
    const me = core.withEffRank(meSnap.data(), ctx);
    if (!me) fail('failed-precondition', 'Bir çetede değilsin.');
    if (minRank) requireRank(me.rank, minRank, core.underVote(me, ctx) ? '🗳️ Adına oylama sürüyor — 00:00\'a kadar Çömez yetkisindesin.' : msg);
    return { gangId, me, membership };
  }

  // 2. el pazarında ilanda olan ürünler depoda durur (yer kaplar) ama satılamaz/dağıtılamaz
  function availableOf(depot, key) {
    return Number(depot?.items?.[key] || 0) - Number(depot?.listed?.[key] || 0);
  }

  function truckLifeLeft(truck, dateKey) {
    return truck?.expiresDateKey ? daysBetweenKeys(dateKey, truck.expiresDateKey) : 0;
  }

  // ---------------------------------------------------------------------------
  // Tır satın al
  // ---------------------------------------------------------------------------
  async function buyTruck(ctx, data) {
    const candidates = Array.from({ length: 12 }, () => String(core.randomInt(1000, 10000)));
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await readGangRole(tx, ctx, 'sagkol', 'Tır sadece Mafya Babası ve Sağ Kol tarafından alınabilir.');
      const [stateSnap, gangSnap] = await Promise.all([tx.get(ctx.ref.gangState(gangId)), tx.get(ctx.ref.gang(gangId))]);
      const kasa = Number(stateSnap.data()?.kasa || 0);
      // v39: çete günde en fazla 1 tır alabilir (ayrılmak üzere olan birinin kasayı boşa harcamasını önler)
      if (stateSnap.data()?.truckBuyDateKey === ctx.dateKey) fail('resource-exhausted', "Bugün zaten tır alındı — yenisi 00:00'dan sonra.");
      if (kasa < GANG.TRUCK_PRICE) fail('failed-precondition', 'Kasada yeterli para yok.');
      const codeSnaps = await Promise.all([...new Set(candidates)].map((c) => tx.get(ctx.ref.truckCode(c))));
      const free = codeSnaps.find((s) => !s.exists);
      if (!free) fail('aborted', 'Tır kimliği üretilemedi, tekrar dene.');
      const code = free.id;
      const truckRef = ctx.ref.trucks().doc();
      const g = gangSnap.data();
      tx.set(ctx.ref.truckCode(code), { truckId: truckRef.id, gangId });
      tx.set(truckRef, {
        code,
        gangId,
        gangName: g.name,
        gangLogo: g.logo || null,
        status: 'idle',
        departDateKey: null,
        boughtDateKey: ctx.dateKey,
        expiresDateKey: addDays(ctx.dateKey, GANG.TRUCK_LIFE_DAYS),
        createdAtMs: ctx.now,
      });
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-GANG.TRUCK_PRICE), truckBuyDateKey: ctx.dateKey });
      ledger(tx, ctx, { type: 'truck_buy', amount: GANG.TRUCK_PRICE, from: { kind: 'gang', id: gangId }, to: { kind: 'burn' }, before: kasa, refId: truckRef.id });
      announce(tx, ctx, gangId, '🚚', `${me.name} yeni tır aldı: TIR #${code} (${GANG.TRUCK_LIFE_DAYS} gün ömürlü).`);
      const res = { truckId: truckRef.id, code };
      guard.save(res);
      return res;
    });
  }

  // ---------------------------------------------------------------------------
  // Depo satın al / genişlet: her alım +100 kapasite
  // ---------------------------------------------------------------------------
  async function buyDepot(ctx, data) {
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await readGangRole(tx, ctx, 'sagkol', 'Depoyu sadece Mafya Babası ve Sağ Kol alabilir.');
      const [stateSnap, depotSnap] = await Promise.all([tx.get(ctx.ref.gangState(gangId)), tx.get(ctx.ref.depot(gangId))]);
      const kasa = Number(stateSnap.data()?.kasa || 0);
      // v39: çete günde en fazla 1 depo genişletmesi yapabilir
      if (stateSnap.data()?.depotBuyDateKey === ctx.dateKey) fail('resource-exhausted', "Bugün zaten depo genişletildi — yenisi 00:00'dan sonra.");
      if (kasa < GANG.DEPOT_PRICE) fail('failed-precondition', 'Kasada yeterli para yok.');
      const cap = Number(depotSnap.data()?.capacity || 0) + GANG.DEPOT_CAPACITY_PER_PURCHASE;
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-GANG.DEPOT_PRICE), depotBuyDateKey: ctx.dateKey });
      tx.set(ctx.ref.depot(gangId), { capacity: FV.increment(GANG.DEPOT_CAPACITY_PER_PURCHASE) }, { merge: true });
      ledger(tx, ctx, { type: 'depot_buy', amount: GANG.DEPOT_PRICE, from: { kind: 'gang', id: gangId }, to: { kind: 'burn' }, before: kasa });
      announce(tx, ctx, gangId, '🏚️', `${me.name} depoyu genişletti — kapasite ${fmt(cap)}.`);
      const res = { capacity: cap };
      guard.save(res);
      return res;
    });
  }

  // ---------------------------------------------------------------------------
  // Sipariş ver — items: { itemKey: qty } (tek ürün türü)
  // ---------------------------------------------------------------------------
  function parseOrderItems(productId, raw) {
    const items = {};
    for (const [key, q] of Object.entries(raw || {})) {
      const qty = Number(q);
      if (!qty) continue;
      const it = core.parseItemKey(key);
      if (!it || it.productId !== productId) fail('invalid-argument', 'Geçersiz ürün kalemi.');
      items[key] = posInt(qty);
    }
    if (Object.keys(items).length === 0) fail('invalid-argument', 'Sipariş boş.');
    return items;
  }

  async function placeOrder(ctx, data) {
    const truckId = String(data.truckId || '');
    const productId = String(data.product || '');
    const product = productById(productId);
    if (!product) fail('invalid-argument', 'Geçersiz ürün.');
    if (!GANG.ORDER_WEEKDAYS.includes(ctx.weekday)) fail('failed-precondition', 'Sipariş sadece Pazartesi–Cuma verilebilir.');
    const items = parseOrderItems(productId, data.items);
    const count = Object.values(items).reduce((s, q) => s + q, 0);
    const maxCount = GANG.TRUCK_CAPACITY[productId];
    if (count > maxCount) fail('failed-precondition', `Tır kapasitesi: en fazla ${maxCount} ${product.label.toLocaleLowerCase('tr-TR')}.`);
    const units = unitsOfItems(items);
    const cost = Object.entries(items).reduce((s, [k, q]) => s + core.unitBuyPrice(core.parseItemKey(k)) * q, 0);
    const orderId = `${truckId}_${ctx.dateKey}`;

    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId, me } = await readGangRole(tx, ctx, 'sagkol', 'Sipariş sadece Mafya Babası ve Sağ Kol tarafından verilebilir.');
      const [routeSnap, truckSnap, stateSnap, depotSnap, orderSnap, pendingSnap] = await Promise.all([
        tx.get(ctx.ref.route(productId)),
        tx.get(ctx.ref.truck(truckId)),
        tx.get(ctx.ref.gangState(gangId)),
        tx.get(ctx.ref.depot(gangId)),
        tx.get(ctx.ref.order(orderId)),
        tx.get(ctx.ref.orders().where('truckId', '==', truckId)),
      ]);
      const route = routeSnap.data();
      if (!route || route.holderType !== 'gang' || route.holderId !== gangId) fail('failed-precondition', 'Bu ticaret yolu çetenizde değil.');
      if (route.untilDateKey && ctx.dateKey >= route.untilDateKey) fail('failed-precondition', 'Bu ticaret yolunun süresi doldu.');
      const truck = truckSnap.data();
      if (!truck || truck.gangId !== gangId || truck.status === 'retired') fail('failed-precondition', 'Tır bulunamadı.');
      if (truckLifeLeft(truck, ctx.dateKey) < 2) fail('failed-precondition', 'Tırın ömrü bitmek üzere — sipariş verilemez.');
      if ((orderSnap.exists && orderSnap.data().status !== 'cancelled') || pendingSnap.docs.some((d) => d.data().status === 'pending')) fail('already-exists', 'Bu tırın bekleyen bir siparişi var.');
      const state = stateSnap.data() || {};
      const spentToday = state.orderSpent?.dateKey === ctx.dateKey ? Number(state.orderSpent.byProduct?.[productId] || 0) : 0;
      const limit = Number(route.dailyOrderLimit || 0);
      if (spentToday + cost > limit) fail('failed-precondition', `Günlük sipariş limitin: ${fmt(Math.max(0, limit - spentToday))} altın kaldı.`);
      if (Number(state.kasa || 0) < cost) fail('failed-precondition', 'Kasada yeterli para yok.');
      const free = depotFree(depotSnap.data());
      if (free < units) fail('failed-precondition', free <= 0 ? 'Depon yok ya da dolu — önce depo al.' : `Depoda yeterli yer yok (boş yer: ${fmt(free)}).`);
      const orderSpent =
        state.orderSpent?.dateKey === ctx.dateKey
          ? { dateKey: ctx.dateKey, byProduct: { ...state.orderSpent.byProduct, [productId]: spentToday + cost } }
          : { dateKey: ctx.dateKey, byProduct: { [productId]: cost } };
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(-cost), orderSpent });
      tx.set(ctx.ref.depot(gangId), { reservedUnits: FV.increment(units) }, { merge: true });
      tx.set(ctx.ref.order(orderId), {
        truckId,
        truckCode: truck.code,
        gangId,
        product: productId,
        items,
        count,
        units,
        cost,
        status: 'pending',
        dateKey: ctx.dateKey,
        departDateKey: addDays(ctx.dateKey, 1),
        createdByName: me.name,
        createdAtMs: ctx.now,
      });
      ledger(tx, ctx, { type: 'trade_order', amount: cost, from: { kind: 'gang', id: gangId }, to: { kind: 'burn' }, before: state.kasa, refId: orderId });
      announce(tx, ctx, gangId, '📦', `TIR #${truck.code} için sipariş verildi (${product.label}) — 00:00'da yola çıkacak.`);
      const res = { orderId, cost, units };
      guard.save(res);
      return res;
    });
  }

  // Yola çıkmadan önce (aynı gün) siparişi iptal: para, limit ve depo yeri geri.
  async function cancelOrder(ctx, data) {
    const orderId = String(data.orderId || '');
    return core.db.runTransaction(async (tx) => {
      const { gangId } = await readGangRole(tx, ctx, 'sagkol', 'Yetkin yok.');
      const [orderSnap, stateSnap] = await Promise.all([tx.get(ctx.ref.order(orderId)), tx.get(ctx.ref.gangState(gangId))]);
      const order = orderSnap.data();
      if (!order || order.gangId !== gangId || order.status !== 'pending' || order.dateKey !== ctx.dateKey) fail('failed-precondition', 'Bu sipariş artık iptal edilemez.');
      const state = stateSnap.data() || {};
      const upd = { kasa: FV.increment(order.cost || 0) };
      if (state.orderSpent?.dateKey === order.dateKey) upd[`orderSpent.byProduct.${order.product}`] = FV.increment(-(order.cost || 0));
      tx.update(ctx.ref.gangState(gangId), upd);
      tx.set(ctx.ref.depot(gangId), { reservedUnits: FV.increment(-(order.units || 0)) }, { merge: true });
      tx.update(ctx.ref.order(orderId), { status: 'cancelled', cancelledAtMs: ctx.now });
      ledger(tx, ctx, { type: 'trade_order_cancel', amount: order.cost || 0, from: { kind: 'burn' }, to: { kind: 'gang', id: gangId }, refId: orderId });
      gangLog(tx, ctx, gangId, '↩️', `TIR #${order.truckCode} siparişi iptal edildi.`);
      return { refunded: order.cost || 0 };
    });
  }

  // Depodan sisteme sat: anlık satış değeri (mağaza fiyatının yarısı) → kasa
  async function sellFromDepot(ctx, data) {
    const key = String(data.itemKey || '');
    const qty = posInt(data.qty);
    const it = core.parseItemKey(key);
    if (!it) fail('invalid-argument', 'Geçersiz ürün.');
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId } = await readGangRole(tx, ctx, 'sagkol', 'Depo sadece Mafya Babası ve Sağ Kol tarafından yönetilir.');
      const depotSnap = await tx.get(ctx.ref.depot(gangId));
      const have = availableOf(depotSnap.data(), key);
      if (have < qty) fail('failed-precondition', 'Depoda yeterli ürün yok (2. eldeki ilanlar hariç).');
      const value = core.unitInstantValue(it) * qty;
      tx.update(ctx.ref.depot(gangId), { [`items.${key}`]: FV.increment(-qty), usedUnits: FV.increment(-unitsOfItems({ [key]: qty })) });
      tx.update(ctx.ref.gangState(gangId), { kasa: FV.increment(value) });
      ledger(tx, ctx, { type: 'depot_sell', amount: value, from: { kind: 'system' }, to: { kind: 'gang', id: gangId }, refId: key });
      gangLog(tx, ctx, gangId, '🏷️', `${qty} × ${it.label} satıldı: +${fmt(value)}`);
      const res = { value };
      guard.save(res);
      return res;
    });
  }

  // Depodan üyelere dağıt — gruplara eşit, doğrudan envantere (20/20 yeni ürün).
  async function distributeFromDepot(ctx, data) {
    const key = String(data.itemKey || '');
    const qty = posInt(data.qty);
    const group = String(data.group || '');
    const it = core.parseItemKey(key);
    if (!it) fail('invalid-argument', 'Geçersiz ürün.');
    return core.db.runTransaction(async (tx) => {
      const guard = await requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const { gangId } = await readGangRole(tx, ctx, 'sagkol', 'Depo sadece Mafya Babası ve Sağ Kol tarafından yönetilir.');
      const [depotSnap, membersSnap] = await Promise.all([tx.get(ctx.ref.depot(gangId)), tx.get(ctx.ref.members(gangId))]);
      const have = availableOf(depotSnap.data(), key);
      const recipients = membersSnap.docs.filter((d) => treasury.inGroup(d.data().rank, group, false));
      if (recipients.length === 0) fail('failed-precondition', 'Bu grupta kimse yok.');
      const per = Math.floor(qty / recipients.length);
      if (per < 1) fail('invalid-argument', 'Kişi başı en az 1 adet düşmeli.');
      const total = per * recipients.length;
      if (have < total) fail('failed-precondition', 'Depoda yeterli ürün yok.');
      tx.update(ctx.ref.depot(gangId), { [`items.${key}`]: FV.increment(-total), usedUnits: FV.increment(-unitsOfItems({ [key]: total })) });
      for (const r of recipients) deliverItem(tx, ctx, r.id, it, per);
      announce(tx, ctx, gangId, '🎁', `${recipients.length} üyeye ${per} × ${it.label} dağıtıldı.`);
      const res = { per, recipients: recipients.length };
      guard.save(res);
      return res;
    });
  }

  // Ürünü oyuncuya teslim: canlıda mevcut envanter/silah/araç şemasıyla
  // (buyWeapon/buyVehicle ile birebir aynı alanlar → 20/20 ömürlü YENİ ürün;
  // ömrü mevcut gece işleminde ilk kez sonraki 00:00'da azalır), testte
  // persona envanteri.
  function deliverItem(tx, ctx, actorId, it, qty) {
    const { catalogs, lifeDays } = core.deps;
    if (ctx.isTest) {
      tx.update(ctx.ref.player(actorId), { [`inventory.${it.key.replace(':', '_')}`]: FV.increment(qty) });
      return;
    }
    if (it.kind === 'material') {
      tx.set(core.db.doc(`users/${actorId}/inventory/${it.material}`), { quantity: FV.increment(qty) }, { merge: true });
      return;
    }
    for (let i = 0; i < qty; i++) {
      if (it.kind === 'weapon') {
        const c = catalogs.WEAPON_CATALOG[it.catalogId];
        tx.set(core.db.collection('weapons').doc(), {
          ownerId: actorId,
          catalogId: Number(it.catalogId),
          name: c.name,
          basePrice: c.price,
          basePower: c.power,
          power: c.power,
          level: 1,
          lifeDays,
          repairsUsed: 0,
          purchasedAt: FV.serverTimestamp(),
          source: 'gang_depot',
        });
      } else {
        const c = catalogs.VEHICLE_CATALOG[it.catalogId];
        tx.set(core.db.collection('vehicles').doc(), {
          ownerId: actorId,
          catalogId: Number(it.catalogId),
          model: c.name,
          baseGalleryValue: c.price,
          gearLevel: c.gearLevel,
          baseTank: c.baseTank,
          tankBonus: 0,
          gearUpgraded: false,
          tankUpgraded: false,
          storage: c.storage,
          turboCount: c.turboCount,
          mortgaged: false,
          seizedByBank: false,
          lifeDays,
          repairsUsed: 0,
          purchasedAt: FV.serverTimestamp(),
          source: 'gang_depot',
        });
      }
    }
  }

  function canSeeCargo(rank) {
    return atLeast(rank, 'kidemli');
  }

  return { buyTruck, buyDepot, placeOrder, cancelOrder, sellFromDepot, distributeFromDepot, deliverItem, canSeeCargo, truckLifeLeft, availableOf, readGangRole };
}
