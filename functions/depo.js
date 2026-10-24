// =============================================================================
// depo.js — v124 DEPOLAR (yasaklı madde ticareti)
// =============================================================================
// Amazor + Liman kalktı; yasaklı madde ticareti depolarda döner.
//   • Oyunun deposu (houses/game_depo — 3D, herkes girer): sınırsız stok ve
//     altın; oyuncudan ALIŞ 1.500, oyuncuya SATIŞ 2.250.
//   • Oyuncu depoları (işletme türü 'depo'; mobilyalar: patron masası, kaçak
//     kasalar, makam masası, çelik/altın kasa). Sahibi fiyat belirler (±50):
//       alış (oyuncudan alır) 1.500 – 1.750 · satış (oyuncuya satar) 2.000 – 2.250
//     Depo envanteri: altın + yasaklı madde. Sahibi ekler/çeker — VERGİ YOK.
//     Oyuncu en fazla depodaki yasaklı madde kadar alabilir; depoya en fazla
//     deponun kasasındaki altının yettiği kadar satabilir.
//   • Çete deposundaki yasaklı madde "Depoya sat" ile (gang/actions/trade.js)
//     aynı kurallarla bir depoya satılır; para çete kasasına girer.
//
// Veri (yazma SADECE sunucudan):
//   depots/{houseId}    — { ownerUid, gold, yasakliMadde, updatedAtMs } (sadece sahibi okur)
//   depotView/{houseId} — { buy, sell, stock, cap, updatedAtMs } (herkes okur; cap = alabileceği adet)
//   houses/{id}.bizPrices.depo = { buy, sell } — işletme listesinde fiyat (herkes görür)
// Ticaret vergisizdir (kullanıcı kararı yalnız envanter için "vergisiz" dedi;
// ticarete de vergi eklenmedi).
// =============================================================================

import { goldTag } from './moneyLog.js';

export const DEPO_TYPE = 'depo';
export const GAME_DEPO_ID = 'game_depo';
export const GAME_DEPO_OWNER = '__game__';
export const DEPO_STEP = 50;
export const DEPO_BUY = { min: 1500, max: 1750, def: 1500 }; // depo oyuncudan alır
export const DEPO_SELL = { min: 2000, max: 2250, def: 2250 }; // depo oyuncuya satar
export const GAME_DEPO_PRICES = { buy: 1500, sell: 2250 };
export const DEPO_MAX_QTY = 100_000; // tek işlemde (taşma / hata koruması)
export const CONTRABAND = 'yasakliMadde';

const onStep = (v, band) => Number.isInteger(v) && v >= band.min && v <= band.max && (v - band.min) % DEPO_STEP === 0;
export const clampDepoPrice = (v, band) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return band.def;
  const c = Math.min(band.max, Math.max(band.min, n));
  return band.min + Math.round((c - band.min) / DEPO_STEP) * DEPO_STEP;
};
// Bir deponun geçerli fiyatları (oyunun deposu sabit)
export function depoPricesOf(h) {
  if (!h || h.bizGame || h.id === GAME_DEPO_ID) return { ...GAME_DEPO_PRICES };
  const p = h.bizPrices?.depo || {};
  return { buy: clampDepoPrice(p.buy ?? DEPO_BUY.def, DEPO_BUY), sell: clampDepoPrice(p.sell ?? DEPO_SELL.def, DEPO_SELL) };
}
export const capOf = (gold, buy) => (buy > 0 ? Math.floor(Math.max(0, Number(gold) || 0) / buy) : 0);

// Oyunun deposunun sabit yerleşimi (18×14 oda; r: 45° adım)
const it = (i, k, x, z, r = 0, c = 0) => ({ i, k, x, z, r, c, p: 1 });
export const GAME_DEPO_LAYOUT = {
  items: [
    it('d1', 'bosstable', 0, -4.6),
    it('d2', 'officedesk', -4.6, -4.8),
    it('d3', 'safe', -8, -6),
    it('d4', 'safeg', -6.6, -6),
    it('d5', 'goldbars', -7.6, -4.2),
    it('d6', 'crates', 4.6, -5.4),
    it('d7', 'crates', 7.4, -5.4),
    it('d8', 'crates', 7.6, -2.2, 6),
    it('d9', 'crate', 4.4, -2.6),
    it('da', 'crate', 5.6, -2.1),
    it('db', 'barrel', 8, 1.2),
    it('dc', 'barrel', 8, 2.6),
    it('dd', 'tires', 6.2, 4.4),
    it('de', 'shelf', -8.4, -1, 2),
    it('df', 'filecab', -8.4, 2.2, 2),
    it('dg', 'bulb', 0, -1.6),
    it('dh', 'bulb', 5.6, -3.6),
    it('di', 'crate', -3, 5.2),
    it('dj', 'crate', -1.8, 5.6),
    it('dk', 'extinguisher', 8.4, 5.8, 6),
    it('dl', 'plantb', -8.3, 6),
    it('dm', 'money', 2, -4.4),
  ],
  wall: 'tugla',
  floor: 'beton',
};

export function createDepo({ db, FieldValue, HttpsError, splitIncomeForDebt, business = null, advanceOnboardingStep = async () => {}, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
  const houseRef = (id) => db.collection('houses').doc(id);
  const depotRef = (id) => db.collection('depots').doc(id);
  const viewRef = (id) => db.collection('depotView').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const invRef = (uid) => userRef(uid).collection('inventory').doc(CONTRABAND);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const posQty = (v) => {
    const q = Number(v);
    if (!Number.isInteger(q) || q <= 0 || q > DEPO_MAX_QTY) fail('invalid-argument', 'Geçersiz adet.');
    return q;
  };

  // Depoyu oku (OKUMA — yazmalardan önce). Oyunun deposu: sınırsız.
  async function readDepot(tx, depotId) {
    if (!isId(depotId)) fail('invalid-argument', 'Geçersiz depo.');
    if (depotId === GAME_DEPO_ID) return { game: true, id: depotId, prices: { ...GAME_DEPO_PRICES } };
    const [hs, ds] = await Promise.all([tx.get(houseRef(depotId)), tx.get(depotRef(depotId))]);
    if (!hs.exists) fail('not-found', 'Depo bulunamadı.');
    const h = { id: depotId, ...hs.data() };
    if (h.biz?.type !== DEPO_TYPE) fail('failed-precondition', 'biz-closed');
    const d = ds.exists ? ds.data() : {};
    return {
      game: false,
      id: depotId,
      h,
      prices: depoPricesOf(h),
      gold: Math.max(0, Math.floor(Number(d.gold) || 0)),
      stock: Math.max(0, Math.floor(Number(d[CONTRABAND]) || 0)),
    };
  }
  // Depo envanteri + herkese açık görünüm (YAZMA)
  function writeDepot(tx, dep, { goldDelta = 0, stockDelta = 0, prices = null } = {}) {
    if (dep.game) return;
    const gold = dep.gold + goldDelta;
    const stock = dep.stock + stockDelta;
    if (gold < 0 || stock < 0) fail('failed-precondition', 'depo-short');
    const pr = prices || dep.prices;
    tx.set(depotRef(dep.id), { ownerUid: dep.h.ownerUid, gold, [CONTRABAND]: stock, updatedAtMs: now() }, { merge: true });
    tx.set(viewRef(dep.id), { buy: pr.buy, sell: pr.sell, stock, cap: capOf(gold, pr.buy), updatedAtMs: now() });
    dep.gold = gold;
    dep.stock = stock;
  }

  // ---- müşteri: al / sat --------------------------------------------------------
  // p: { depotId, side: 'buy' (oyuncu alır) | 'sell' (oyuncu satar), qty, expect: adet fiyatı }
  async function trade(uid, p) {
    const depotId = String(p.depotId || '');
    const side = p.side === 'sell' ? 'sell' : p.side === 'buy' ? 'buy' : fail('invalid-argument', 'Geçersiz işlem.');
    const qty = posQty(p.qty);
    let result = null;
    await db.runTransaction(async (tx) => {
      const dep = await readDepot(tx, depotId);
      const [us, is] = await Promise.all([tx.get(userRef(uid)), tx.get(invRef(uid))]);
      if (!us.exists) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if (!dep.game && dep.h.ownerUid === uid) fail('failed-precondition', 'Kendi deponla ticaret yapamazsın — malı / altını Envanter’den ekle ya da çek.');
      const user = us.data();
      const have = Math.max(0, Math.floor(Number(is.exists ? is.data().quantity : 0) || 0));
      // oyuncu ALIRSA deponun SATIŞ fiyatı, SATARSA deponun ALIŞ fiyatı
      const unit = side === 'buy' ? dep.prices.sell : dep.prices.buy;
      if (p.expect != null && Number(p.expect) !== unit) fail('aborted', `price-changed:${unit}`);
      const total = unit * qty;
      const atMs = now();
      if (side === 'buy') {
        if (!dep.game && dep.stock < qty) fail('failed-precondition', `depo-stock:${dep.stock}`);
        if (Number(user.gold || 0) < total) fail('failed-precondition', 'gold');
        tx.update(userRef(uid), { gold: FieldValue.increment(-total), goldTag: goldTag('depo') });
        tx.set(invRef(uid), { quantity: FieldValue.increment(qty) }, { merge: true });
        writeDepot(tx, dep, { goldDelta: total, stockDelta: -qty });
        if (!dep.game) business?.recordIncomeTx?.(tx, { houseId: dep.id, h: dep.h, amount: total, kind: 'sale', customerUid: uid, products: { [CONTRABAND]: qty }, atMs });
      } else {
        if (have < qty) fail('failed-precondition', 'own-short');
        if (!dep.game && dep.gold < total) fail('failed-precondition', `depo-gold:${capOf(dep.gold, unit)}`);
        const { goldDelta, debtDelta } = splitIncomeForDebt(user.debtToState, total);
        tx.update(userRef(uid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('depo'), ...(debtDelta ? { debtToState: FieldValue.increment(debtDelta) } : {}) });
        tx.set(invRef(uid), { quantity: FieldValue.increment(-qty) }, { merge: true });
        writeDepot(tx, dep, { goldDelta: -total, stockDelta: qty });
        if (!dep.game) business?.recordIncomeTx?.(tx, { houseId: dep.id, h: dep.h, amount: 0, kind: 'sale', customerUid: uid, materialsIn: { [CONTRABAND]: qty }, atMs });
      }
      result = { ok: true, side, qty, unit, total, game: dep.game };
    });
    // Görev 2 — "Liman & Depo'ya git ve 1 adet yasaklı madde satın al"
    if (result.side === 'buy') await advanceOnboardingStep(uid, 2);
    return result;
  }

  // ---- sahip: fiyat / envanter -------------------------------------------------------
  async function price(uid, p) {
    const depotId = String(p.depotId || p.houseId || '');
    const buy = Number(p.buy);
    const sell = Number(p.sell);
    if (!onStep(buy, DEPO_BUY)) fail('invalid-argument', `price-band:buy:${DEPO_BUY.min}-${DEPO_BUY.max}`);
    if (!onStep(sell, DEPO_SELL)) fail('invalid-argument', `price-band:sell:${DEPO_SELL.min}-${DEPO_SELL.max}`);
    await db.runTransaction(async (tx) => {
      const dep = await readDepot(tx, depotId);
      if (dep.game || dep.h.ownerUid !== uid) fail('permission-denied', 'Bu depo senin değil.');
      tx.update(houseRef(depotId), { 'bizPrices.depo': { buy, sell }, bizPricesAtMs: now() });
      writeDepot(tx, dep, { prices: { buy, sell } });
    });
    return { ok: true, buy, sell };
  }
  // p: { depotId, asset: 'gold' | 'yasakliMadde', qty: + ekle / − çek } — vergisiz
  async function stock(uid, p) {
    const depotId = String(p.depotId || p.houseId || '');
    const asset = p.asset === 'gold' ? 'gold' : p.asset === CONTRABAND ? CONTRABAND : fail('invalid-argument', 'Geçersiz kalem.');
    const qty = Number(p.qty);
    if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > (asset === 'gold' ? 1_000_000_000 : DEPO_MAX_QTY)) fail('invalid-argument', 'Geçersiz miktar.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const dep = await readDepot(tx, depotId);
      if (dep.game || dep.h.ownerUid !== uid) fail('permission-denied', 'Bu depo senin değil.');
      const [us, is] = await Promise.all([tx.get(userRef(uid)), tx.get(invRef(uid))]);
      if (asset === 'gold') {
        const mine = Math.max(0, Math.floor(Number(us.data()?.gold) || 0));
        if (qty > 0 && mine < qty) fail('failed-precondition', 'gold');
        if (qty < 0 && dep.gold < -qty) fail('failed-precondition', 'depo-short');
        tx.update(userRef(uid), { gold: FieldValue.increment(-qty), goldTag: goldTag('depoKasa', {}) }); // kendi parası: rapora girmez
        writeDepot(tx, dep, { goldDelta: qty });
      } else {
        const mine = Math.max(0, Math.floor(Number(is.exists ? is.data().quantity : 0) || 0));
        if (qty > 0 && mine < qty) fail('failed-precondition', 'own-short');
        if (qty < 0 && dep.stock < -qty) fail('failed-precondition', 'depo-short');
        tx.set(invRef(uid), { quantity: FieldValue.increment(-qty) }, { merge: true });
        writeDepot(tx, dep, { stockDelta: qty });
      }
      result = { ok: true, gold: dep.gold, stock: dep.stock };
    });
    return result;
  }

  // ---- oyunun deposu (yoksa kurulur; idempotent) ----------------------------------
  async function ensureGame() {
    const ref = houseRef(GAME_DEPO_ID);
    const s = await ref.get();
    if (s.exists) return { ok: true, houseId: GAME_DEPO_ID };
    await db.runTransaction(async (tx) => {
      const again = await tx.get(ref);
      if (again.exists) return;
      tx.set(ref, {
        ownerUid: GAME_DEPO_OWNER,
        ownerName: 'Neon Şehir',
        ownerAvatar: null,
        name: 'Neon Liman Deposu',
        privacy: 'public',
        items: GAME_DEPO_LAYOUT.items,
        wall: GAME_DEPO_LAYOUT.wall,
        floor: GAME_DEPO_LAYOUT.floor,
        music: null,
        kicked: {},
        invites: {},
        biz: { type: DEPO_TYPE, openedAtMs: now() },
        bizType: DEPO_TYPE,
        bizGame: true,
        bizPrices: { depo: { ...GAME_DEPO_PRICES } },
        createdAtMs: now(),
        updatedAtMs: now(),
      });
    });
    return { ok: true, houseId: GAME_DEPO_ID };
  }

  // ---- çete deposundan depoya satış (gang/actions/trade.js çağırır) ----------------
  // OKUMA: readDepotForSale · YAZMA: writeDepotSale (çetenin kasası çağıranda)
  async function readDepotForSale(tx, depotId) {
    const dep = await readDepot(tx, depotId);
    return dep;
  }
  function writeDepotSale(tx, dep, qty) {
    const unit = dep.prices.buy;
    const total = unit * qty;
    if (!dep.game && dep.gold < total) fail('failed-precondition', `Deponun kasası yetmiyor: en fazla ${fmt(capOf(dep.gold, unit))} adet alabilir.`);
    writeDepot(tx, dep, { goldDelta: -total, stockDelta: qty });
    if (!dep.game) business?.recordIncomeTx?.(tx, { houseId: dep.id, h: dep.h, amount: 0, kind: 'sale', materialsIn: { [CONTRABAND]: qty }, atMs: now() });
    return { unit, total };
  }

  // ---- işletme kapanırken: depodaki altın + yasaklı madde sahibine döner -----------
  async function onCloseRead(tx, { houseId, h }) {
    if (h?.biz?.type !== DEPO_TYPE) return null;
    const ds = await tx.get(depotRef(houseId));
    return { depot: ds.exists ? ds.data() : null };
  }
  function onCloseWrite(tx, { houseId, h, state }) {
    if (!state || h?.biz?.type !== DEPO_TYPE) return {};
    const gold = Math.max(0, Math.floor(Number(state.depot?.gold) || 0));
    const stockN = Math.max(0, Math.floor(Number(state.depot?.[CONTRABAND]) || 0));
    if (gold) tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(gold), goldTag: goldTag('depoKasa', {}) });
    if (stockN) tx.set(invRef(h.ownerUid), { quantity: FieldValue.increment(stockN) }, { merge: true });
    // merge YOK: aynı kapanış iki kez iade etmesin
    if (state.depot) tx.set(depotRef(houseId), { ownerUid: h.ownerUid, gold: 0, [CONTRABAND]: 0, closedAtMs: now(), updatedAtMs: now() });
    tx.delete(viewRef(houseId));
    return { depotGold: gold, depotContraband: stockN };
  }
  async function statusExtra({ houseId, h }) {
    if (h?.biz?.type !== DEPO_TYPE) return {};
    const ds = await depotRef(houseId).get();
    const d = ds.exists ? ds.data() : {};
    return { depotGold: Math.max(0, Number(d.gold) || 0), depotContraband: Math.max(0, Number(d[CONTRABAND]) || 0) };
  }

  const ops = {
    depoTrade: (uid, p) => trade(uid, p),
    depoPrice: (uid, p) => price(uid, p),
    depoStock: (uid, p) => stock(uid, p),
    depoEnsureGame: () => ensureGame(),
  };
  return { ops, trade, price, stock, ensureGame, readDepotForSale, writeDepotSale, bizHooks: { onCloseRead, onCloseWrite, statusExtra } };
}

// İki işletme modülünün kapanış kancalarını birleştirir (houses.js tek kanca bekler)
export function combineBizHooks(...list) {
  const hooks = list.filter(Boolean);
  return {
    async onCloseRead(tx, args) {
      const out = [];
      for (const hk of hooks) out.push(hk.onCloseRead ? await hk.onCloseRead(tx, args) : null);
      return out;
    },
    onCloseWrite(tx, args) {
      const res = {};
      hooks.forEach((hk, i) => {
        if (hk.onCloseWrite) Object.assign(res, hk.onCloseWrite(tx, { ...args, state: args.state?.[i] ?? null }) || {});
      });
      return res;
    },
    async statusExtra(args) {
      const res = {};
      for (const hk of hooks) if (hk.statusExtra) Object.assign(res, (await hk.statusExtra(args)) || {});
      return res;
    },
  };
}
