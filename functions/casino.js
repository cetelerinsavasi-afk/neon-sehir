// =============================================================================
// casino.js — v124 Faz 6: OYUNCU GAZİNOLARI
// =============================================================================
// İşletme türü 'gazino' (mobilyalar: piyango gişesi, kart masası, rulet masası,
// slot makinesi). Haritada Gazino → gazinolar listesi (oyunun gazinosu + oyuncular).
// Kurallar (kullanıcı notu) — oyunun kendi gazinosu ile birebir, farkları:
//   • SLOT: çevirme ücreti sahibin belirlediği 1.400–1.600 (50'şer). Makinede en az
//     3 yasaklı madde + 10.000 altın yoksa çalışmaz. Ödüller makineden verilir,
//     ücret makineye girer.
//   • RULET: kazanç masadan ödenir; en kötü durumda ödenecek net kazancı masanın
//     altını karşılamıyorsa bahis açılamaz.
//   • 10 NUMARA: kurpiyerin (kart masasının) payı masadan konur → bahis en fazla
//     kart masasındaki altın kadar; dağıtımda masada bahis kadar altın yoksa
//     "kart dağıtılamıyor". El bitince potun oyunculara ödenmeyen kısmı masaya döner.
//   • PİYANGO: bilet = 90 (havuza) + sahibin kârı 1–10 → 91–100 altın. Gece 00:00:
//     kazanana havuz − %10 piyango vergisi; sahibine biletlerin kârı − %10 vergi + SMS.
//     Piyango gişesine altın eklenmez.
//   • Sahip makinelere envanterinden altın (slot: + yasaklı madde) ekler; eklerken
//     vergi yok. Çekerken ALTININ %10'u vergi (onay ekranında gösterilir). Yasaklı
//     madde çekmek vergisiz.
//   • Sahip kendi gazinosunda oynayamaz / bilet alamaz / masaya oturamaz (kullanıcı kararı:
//     şimdilik — kendi makinesinde oynayıp %10 çekim vergisinden kaçmasın).
//   • 10 Numara: oyuncu gazinosunda masa bahsi en fazla 100.000 altın.
//   • İşletme kapanırsa makinelerdeki altın (−%10 vergi, çekim gibi) ve yasaklı
//     madde sahibine döner. Açık 10 Numara masası varken kapanmaz.
//
// Veri (yazma SADECE sunucudan):
//   casinoMachines/{houseId}_{slot|rulet|kart} — { casinoId, ownerUid, m, gold, yasakliMadde, updatedAtMs }
//       (herkes okur: masadaki altın oyunun kuralı gereği zaten görünür — en fazla bahis)
//   casinoLottery/{houseId}_{gün} — { casinoId, ownerUid, casinoName, dateKey, jackpot, ownerCut,
//       totalTickets, drawnAt, winner* } + tickets/{uid} { uid, displayName, count }
//   houses/{id}.bizPrices.gazino = { slot, cut } — listede fiyat (herkes görür)
//   businessDaily/{houseId}_{gün}.casino = { slot:{in,outGold,outYm,n}, piyango:{in,out,n},
//       rulet:{in,out,n}, onnumara:{in,out,n} } — makine başı günlük rapor (sadece sahibi)
//       in = makineye giren (kazanç), out = oyunculara verilen. revenue = toplam giren.
// =============================================================================

import { goldTag } from './moneyLog.js';
import { taxLedgerWrite, splitLotteryTax } from './tax.js';
import { bizDayKey } from './businessCatalogData.js';
import {
  GAME_CASINO_ID,
  SLOT_PRICE_MIN,
  SLOT_PRICE_MAX,
  SLOT_PRICE_STEP,
  SLOT_MIN_STOCK,
  slotPriceOk,
  slotOutcome,
  rollSlotReels,
  roulettePayout,
  rouletteMaxNetWin,
  LOTTERY_POOL_PER_TICKET,
  lotteryTicketPrice,
  LOTTERY_CUT_MIN,
  LOTTERY_CUT_MAX,
  lotteryCutOk,
  splitCasinoCut,
} from './casinoRules.js';

export const CASINO_TYPE = 'gazino';
export const CASINO_MACHINES = ['slot', 'rulet', 'kart'];
export const CASINO_MACHINE_LABEL = { slot: 'Slot makinesi', rulet: 'Rulet masası', kart: 'Kart masası (10 Numara)' };
export const CASINO_WITHDRAW_TAX_RATE = 0.1;
export const CASINO_LOW_GOLD = 1000; // hatırlatma eşiği (rulet / kart masası)
export const CASINO_TABLE_MAX_BET = 100_000; // oyuncu gazinosunda 10 Numara masa bahsi üst sınırı
export const CASINO_MAX_QTY = 1_000_000_000;
export const CASINO_DEFAULT_PRICES = { slot: SLOT_PRICE_MAX, cut: LOTTERY_CUT_MAX };
// Oyuncuya gösterilen sabit cümleler (kullanıcı notundaki ifadeler)
export const CASINO_TEXT = {
  slotEmpty: 'Casinoda yeterli altın olmadığı için slot çalışmıyor.',
  rouletteBank: 'Casinoda yeterli altın olmadığı için bu bahis açılamıyor.',
  dealBank: 'Casinoda yeterli altın olmadığı için kart dağıtılamıyor.',
  own: 'Kendi gazinonda oynayamazsın.',
  closed: 'Bu gazino kapandı.',
};

const ofStep = (n, min, max, step) => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return max;
  const c = Math.min(max, Math.max(min, v));
  return min + Math.round((c - min) / step) * step;
};
// Bir oyuncu gazinosunun geçerli fiyatları (bantlara çekilir)
export function casinoPricesOf(h) {
  const p = h?.bizPrices?.gazino || {};
  return {
    slot: ofStep(p.slot ?? CASINO_DEFAULT_PRICES.slot, SLOT_PRICE_MIN, SLOT_PRICE_MAX, SLOT_PRICE_STEP),
    cut: ofStep(p.cut ?? CASINO_DEFAULT_PRICES.cut, LOTTERY_CUT_MIN, LOTTERY_CUT_MAX, 1),
  };
}
// Kasadan altın çekerken %10 vergi: { tax, net } (net + tax = brüt)
export function casinoWithdrawSplit(gross) {
  const g = Math.max(0, Math.floor(Number(gross) || 0));
  const tax = Math.min(g, Math.floor(g * CASINO_WITHDRAW_TAX_RATE));
  return { gross: g, tax, net: g - tax };
}
export const machineDocId = (houseId, m) => `${houseId}_${m}`;
// Slotun çalışması için makinede gereken en az stok
export const slotReady = (mc) => Number(mc?.gold || 0) >= SLOT_MIN_STOCK.gold && Number(mc?.yasakliMadde || 0) >= SLOT_MIN_STOCK.yasakliMadde;
export const isPlayerCasinoId = (id) => typeof id === 'string' && id !== GAME_CASINO_ID && /^[A-Za-z0-9_-]{1,128}$/.test(id);

export function createCasino({ db, FieldValue, HttpsError, splitIncomeForDebt, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const machineRef = (houseId, m) => db.collection('casinoMachines').doc(machineDocId(houseId, m));
  const userRef = (uid) => db.collection('users').doc(uid);
  const ymRef = (uid) => userRef(uid).collection('inventory').doc('yasakliMadde');
  const lotteryRef = (houseId, dayKey) => db.collection('casinoLottery').doc(`${houseId}_${dayKey}`);
  const dailyRef = (houseId, dayKey) => db.collection('businessDaily').doc(`${houseId}_${dayKey}`);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

  // ---- okumalar (transaction içinde, yazmalardan ÖNCE) ------------------------------
  async function readCasino(tx, casinoId) {
    if (!isPlayerCasinoId(casinoId)) fail('invalid-argument', 'Geçersiz gazino.');
    const hs = await tx.get(houseRef(casinoId));
    if (!hs.exists) fail('not-found', 'Gazino bulunamadı.');
    const h = { id: casinoId, ...hs.data() };
    if (h.biz?.type !== CASINO_TYPE) fail('failed-precondition', CASINO_TEXT.closed);
    return { id: casinoId, h, ownerUid: h.ownerUid, prices: casinoPricesOf(h) };
  }
  async function readMachine(tx, casinoId, m) {
    const s = await tx.get(machineRef(casinoId, m));
    const d = s.exists ? s.data() : {};
    return { m, exists: s.exists, gold: int(d.gold), yasakliMadde: int(d.yasakliMadde) };
  }
  // ---- yazmalar ----------------------------------------------------------------------
  function writeMachine(tx, casinoId, ownerUid, mc) {
    if (mc.gold < 0 || mc.yasakliMadde < 0) fail('failed-precondition', 'casino-short');
    tx.set(machineRef(casinoId, mc.m), { casinoId, ownerUid, m: mc.m, gold: mc.gold, yasakliMadde: mc.yasakliMadde, updatedAtMs: now() }, { merge: true });
  }
  // Makine başı günlük rapor. inc: { in, out, outGold, outYm } (pozitif) · count: oyun sayısı (n)
  // revenue (= toplam giren) işletme sıralamasında kullanılır (business.rollover).
  function recordTx(tx, { casinoId, ownerUid, game, inc = {}, count = 1, customers = [], atMs }) {
    const dayKey = bizDayKey(CASINO_TYPE, atMs ?? now());
    const g = {};
    for (const k of ['in', 'out', 'outGold', 'outYm']) {
      const n = Math.max(0, Math.round(Number(inc[k]) || 0));
      if (n) g[k] = FieldValue.increment(n);
    }
    if (count) g.n = FieldValue.increment(count);
    // DİKKAT: merge'de boş harita ({}) alanın TAMAMINI boşaltır → raporu sıfırlıyordu
    // (10 Numara'da kurpiyer kazanınca "verilen 0" yazımı). Boşsa makine alanı yazılmaz.
    const patch = { houseId: casinoId, ownerUid, type: CASINO_TYPE, dayKey, updatedAtMs: now() };
    if (Object.keys(g).length) patch.casino = { [game]: g };
    const revenue = Math.max(0, Math.round(Number(inc.in) || 0));
    if (revenue) {
      patch.revenue = FieldValue.increment(revenue);
      patch.byKind = { service: FieldValue.increment(revenue) };
    }
    const cust = customers.filter(Boolean);
    if (cust.length) patch.cust = Object.fromEntries(cust.map((u) => [u, true]));
    tx.set(dailyRef(casinoId, dayKey), patch, { merge: true });
  }
  const assertNotOwner = (c, uid) => {
    if (c.ownerUid === uid) fail('failed-precondition', CASINO_TEXT.own);
  };

  // ---- SLOT ----------------------------------------------------------------------------
  // p: { casinoId, expect (istemcinin gördüğü fiyat) } · randInt(n) → 0..n-1
  async function slotSpin(uid, p, randInt) {
    const casinoId = String(p.casinoId || '');
    const reels = rollSlotReels(randInt);
    const out = slotOutcome(reels);
    let cost = 0;
    await db.runTransaction(async (tx) => {
      const c = await readCasino(tx, casinoId);
      assertNotOwner(c, uid);
      const [us, mc] = await Promise.all([tx.get(userRef(uid)), readMachine(tx, casinoId, 'slot')]);
      if (!us.exists) fail('failed-precondition', 'Oyuncu bulunamadı.');
      cost = c.prices.slot;
      if (p.expect != null && Number(p.expect) !== cost) fail('aborted', `price-changed:${cost}`);
      if (!slotReady(mc)) fail('failed-precondition', CASINO_TEXT.slotEmpty);
      if (Number(us.data().gold || 0) < cost) fail('failed-precondition', 'Yetersiz altın.');
      tx.update(userRef(uid), { gold: FieldValue.increment(out.gold - cost), goldTag: goldTag('slot') });
      if (out.yasakliMadde > 0) tx.set(ymRef(uid), { quantity: FieldValue.increment(out.yasakliMadde) }, { merge: true });
      writeMachine(tx, casinoId, c.ownerUid, { ...mc, gold: mc.gold + cost - out.gold, yasakliMadde: mc.yasakliMadde - out.yasakliMadde });
      recordTx(tx, { casinoId, ownerUid: c.ownerUid, game: 'slot', inc: { in: cost, outGold: out.gold, outYm: out.yasakliMadde }, customers: [uid] });
    });
    return { reels, cost, ...out };
  }

  // ---- RULET ---------------------------------------------------------------------------
  // nb: normalizeRouletteBets çıktısı · number: sunucuda çekilen sayı
  async function rouletteSpin(uid, { casinoId, nb, number }) {
    const payout = roulettePayout(nb.bets, number);
    const worst = rouletteMaxNetWin(nb.bets);
    await db.runTransaction(async (tx) => {
      const c = await readCasino(tx, String(casinoId || ''));
      assertNotOwner(c, uid);
      const [us, mc] = await Promise.all([tx.get(userRef(uid)), readMachine(tx, c.id, 'rulet')]);
      if (!us.exists || Number(us.data().gold || 0) < nb.total) fail('failed-precondition', 'Yetersiz altın.');
      if (worst > mc.gold) fail('failed-precondition', `${CASINO_TEXT.rouletteBank} (masada ${fmt(mc.gold)} altın var)`);
      tx.update(userRef(uid), { gold: FieldValue.increment(payout - nb.total), goldTag: goldTag('rulet') });
      writeMachine(tx, c.id, c.ownerUid, { ...mc, gold: mc.gold + nb.total - payout });
      recordTx(tx, { casinoId: c.id, ownerUid: c.ownerUid, game: 'rulet', inc: { in: nb.total, out: payout }, customers: [uid] });
    });
    return { payout };
  }

  // ---- PİYANGO -------------------------------------------------------------------------
  // expect: istemcinin gördüğü bilet fiyatı (sahip kârı değiştirdiyse işlem durur)
  async function buyTickets(uid, { casinoId, qty, dateKey, expect = null }) {
    let res = null;
    await db.runTransaction(async (tx) => {
      const c = await readCasino(tx, String(casinoId || ''));
      assertNotOwner(c, uid);
      const lref = lotteryRef(c.id, dateKey);
      const [us, ls] = await Promise.all([tx.get(userRef(uid)), tx.get(lref)]);
      const cut = c.prices.cut;
      const unit = lotteryTicketPrice(cut);
      if (expect != null && Number(expect) !== unit) fail('aborted', `price-changed:${unit}`);
      const cost = qty * unit;
      const user = us.data();
      if (!user || Number(user.gold || 0) < cost) fail('failed-precondition', 'Yetersiz altın.');
      const pool = qty * LOTTERY_POOL_PER_TICKET;
      const ownerCut = qty * cut;
      tx.update(userRef(uid), { gold: FieldValue.increment(-cost), goldTag: goldTag('piyango') });
      if (!ls.exists) {
        tx.set(lref, { casinoId: c.id, ownerUid: c.ownerUid, casinoName: c.h.name || 'Gazino', dateKey, jackpot: pool, ownerCut, totalTickets: qty, drawnAt: null, winnerUid: null, winnerAmount: null, createdAtMs: now() });
      } else {
        tx.update(lref, { jackpot: FieldValue.increment(pool), ownerCut: FieldValue.increment(ownerCut), totalTickets: FieldValue.increment(qty) });
      }
      tx.set(lref.collection('tickets').doc(uid), { uid, displayName: user.displayName || 'Oyuncu', count: FieldValue.increment(qty) }, { merge: true });
      recordTx(tx, { casinoId: c.id, ownerUid: c.ownerUid, game: 'piyango', inc: { in: cost, out: pool }, customers: [uid] });
      res = { ok: true, cost, pool, cut, unit };
    });
    return res;
  }

  // Gece 00:00 — dünden (ve önceki günlerden) kalan çekilmemiş gazino piyangoları.
  // Her gün belgesi KENDİ transaction'ında çekilir (iki kez çalışsa da iki kez ödemez).
  async function drawLotteries(todayKey, { onWin } = {}) {
    const snap = await db.collection('casinoLottery').where('drawnAt', '==', null).limit(300).get();
    const summary = { drawn: 0, paid: 0 };
    for (const d of snap.docs) {
      if (String(d.data().dateKey || '') >= todayKey) continue; // bugünün piyangosu sürüyor
      let won = null;
      await db.runTransaction(async (tx) => {
        const ls = await tx.get(d.ref);
        if (!ls.exists) return;
        const L = ls.data();
        if (L.drawnAt != null) return; // başka bir çalışma çekti
        const total = int(L.totalTickets);
        if (!total) {
          tx.update(d.ref, { drawnAt: FieldValue.serverTimestamp() });
          return;
        }
        const tickets = await tx.get(d.ref.collection('tickets'));
        const sumTickets = tickets.docs.reduce((a, t) => a + int(t.data().count), 0) || total;
        const roll = Math.random() * sumTickets;
        let acc = 0;
        let winner = null;
        for (const t of tickets.docs) {
          acc += int(t.data().count);
          if (roll < acc) {
            winner = { uid: t.data().uid || t.id, name: t.data().displayName || 'Oyuncu' };
            break;
          }
        }
        if (!winner && tickets.docs.length) winner = { uid: tickets.docs[0].data().uid || tickets.docs[0].id, name: tickets.docs[0].data().displayName || 'Oyuncu' };
        const [ws, os] = await Promise.all([winner ? tx.get(userRef(winner.uid)) : null, L.ownerUid ? tx.get(userRef(L.ownerUid)) : null]);
        const name = L.casinoName || 'Gazino';
        const atMs = now();
        const jackpot = int(L.jackpot);
        const lot = splitLotteryTax(jackpot);
        // kazanan (silinmiş hesapsa ödeme yapılmaz; çekiliş yine kapanır)
        if (winner && ws?.exists && jackpot > 0) {
          const { goldDelta, debtDelta } = splitIncomeForDebt(ws.data()?.debtToState, lot.net);
          tx.update(userRef(winner.uid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('piyango'), ...(debtDelta ? { debtToState: FieldValue.increment(debtDelta) } : {}) });
          taxLedgerWrite(tx, db, FieldValue, { amount: lot.tax, source: 'piyango', uid: winner.uid, atMs, ref: `gpiyango_${d.id}` });
          tx.set(userRef(winner.uid).collection('messages').doc(), {
            text: `🎟️ Tebrikler! ${name} gazinosunun piyangosundan ${fmt(jackpot)} altın kazandın. %10 piyango vergisi (${fmt(lot.tax)} altın) belediyeye ödendi, hesabına ${fmt(lot.net)} altın yattı.`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
            type: 'lottery_win',
            casinoId: L.casinoId || null,
            jackpot,
            tax: lot.tax,
            net: lot.net,
          });
          won = winner.uid;
        }
        // sahibin bilet kârı: %10'u devlete, kalanı sahibine + SMS
        const cut = splitCasinoCut(L.ownerCut);
        if (L.ownerUid && os?.exists && cut.rest + cut.tax > 0) {
          if (cut.rest > 0) {
            const { goldDelta, debtDelta } = splitIncomeForDebt(os.data()?.debtToState, cut.rest);
            tx.update(userRef(L.ownerUid), { gold: FieldValue.increment(goldDelta), goldTag: goldTag('gazino'), ...(debtDelta ? { debtToState: FieldValue.increment(debtDelta) } : {}) });
          }
          taxLedgerWrite(tx, db, FieldValue, { amount: cut.tax, source: 'gazino', uid: L.ownerUid, atMs, ref: `gpiyango_kasa_${d.id}` });
          tx.set(userRef(L.ownerUid).collection('messages').doc(), {
            text: `🎰 ${name} — dünkü piyango: ${fmt(total)} bilet satıldı. Bilet kârın ${fmt(cut.rest + cut.tax)} altın; %10 vergi (${fmt(cut.tax)} altın) düşüldü, hesabına ${fmt(cut.rest)} altın yattı.`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
            type: 'casino_lottery',
            casinoId: L.casinoId || null,
          });
        }
        tx.update(d.ref, {
          drawnAt: FieldValue.serverTimestamp(),
          winnerUid: winner?.uid || null,
          winnerName: winner?.name || null,
          winnerAmount: jackpot,
          winnerTax: lot.tax,
          winnerNet: lot.net,
          ownerTax: cut.tax,
          ownerNet: cut.rest,
        });
        summary.paid += jackpot;
      });
      summary.drawn += 1;
      if (won && onWin) await onWin(won).catch(() => {});
    }
    return summary;
  }

  // ---- 10 NUMARA -----------------------------------------------------------------------
  // Masa kurulurken: bahis en fazla kart masasındaki altın kadar. (işlem dışı okuma)
  async function tableCreateCheck(uid, casinoId, bet) {
    let out = null;
    await db.runTransaction(async (tx) => {
      const c = await readCasino(tx, String(casinoId || ''));
      assertNotOwner(c, uid);
      if (bet > CASINO_TABLE_MAX_BET) fail('failed-precondition', `10 Numara'da en fazla ${fmt(CASINO_TABLE_MAX_BET)} altınlık masa açılabilir.`);
      const mc = await readMachine(tx, c.id, 'kart');
      if (bet > mc.gold) fail('failed-precondition', mc.gold > 0 ? `Kurpiyerin kasasında ${fmt(mc.gold)} altın var — en fazla ${fmt(mc.gold)} altınlık masa açabilirsin.` : CASINO_TEXT.dealBank);
      out = { casinoOwnerUid: c.ownerUid, casinoName: c.h.name || 'Gazino' };
    });
    return out;
  }
  function assertJoin(uid, table) {
    if (table?.casinoOwnerUid && table.casinoOwnerUid === uid) fail('failed-precondition', CASINO_TEXT.own);
  }
  // Dağıtım: OKUMA (yazmalardan önce)
  async function dealRead(tx, table) {
    const c = await readCasino(tx, String(table.casinoId || ''));
    const mc = await readMachine(tx, c.id, 'kart');
    return { c, mc };
  }
  // Dağıtım: YAZMA — kurpiyerin payı masadan; rapor: oyuncuların bahisleri "giren"
  function dealWrite(tx, table, st, eligible) {
    const bet = int(table.betAmount);
    if (st.mc.gold < bet) fail('failed-precondition', CASINO_TEXT.dealBank);
    writeMachine(tx, st.c.id, st.c.ownerUid, { ...st.mc, gold: st.mc.gold - bet });
    recordTx(tx, { casinoId: st.c.id, ownerUid: st.c.ownerUid, game: 'onnumara', inc: { in: bet * eligible.length }, count: 1, customers: eligible });
    return bet;
  }
  // El sonucu: YAZMA (okuma gerekmez) — potun oyunculara ödenmeyen kısmı masaya döner
  function resolveWrite(tx, table, { houseBack, paidOut }) {
    if (!isPlayerCasinoId(table?.casinoId)) return;
    const back = int(houseBack);
    if (back > 0) tx.set(machineRef(table.casinoId, 'kart'), { casinoId: table.casinoId, ownerUid: table.casinoOwnerUid || null, m: 'kart', gold: FieldValue.increment(back), updatedAtMs: now() }, { merge: true });
    recordTx(tx, { casinoId: table.casinoId, ownerUid: table.casinoOwnerUid || null, game: 'onnumara', inc: { out: int(paidOut) }, count: 0 });
  }

  // ---- sahip: fiyat / envanter ---------------------------------------------------------
  async function ownCasino(tx, uid, houseId) {
    const c = await readCasino(tx, String(houseId || ''));
    if (c.ownerUid !== uid) fail('permission-denied', 'Bu gazino senin değil.');
    return c;
  }
  async function price(uid, p) {
    const slot = Number(p.slot);
    const cut = Number(p.cut);
    if (!slotPriceOk(slot)) fail('invalid-argument', `price-band:slot:${SLOT_PRICE_MIN}-${SLOT_PRICE_MAX}`);
    if (!lotteryCutOk(cut)) fail('invalid-argument', `price-band:cut:${LOTTERY_CUT_MIN}-${LOTTERY_CUT_MAX}`);
    await db.runTransaction(async (tx) => {
      const c = await ownCasino(tx, uid, p.houseId || p.casinoId);
      tx.update(houseRef(c.id), { 'bizPrices.gazino': { slot, cut }, bizPricesAtMs: now() });
    });
    return { ok: true, slot, cut };
  }
  // p: { houseId, machine: slot|rulet|kart, asset: gold|yasakliMadde, qty: + ekle / − çek, expectTax? }
  async function stock(uid, p) {
    const m = CASINO_MACHINES.includes(p.machine) ? p.machine : fail('invalid-argument', 'Geçersiz makine.');
    const asset = p.asset === 'gold' ? 'gold' : p.asset === 'yasakliMadde' ? 'yasakliMadde' : fail('invalid-argument', 'Geçersiz kalem.');
    if (asset === 'yasakliMadde' && m !== 'slot') fail('invalid-argument', 'Yasaklı madde sadece slot makinesine eklenir.');
    const qty = Number(p.qty);
    if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > (asset === 'gold' ? CASINO_MAX_QTY : 100_000)) fail('invalid-argument', 'Geçersiz miktar.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const c = await ownCasino(tx, uid, p.houseId || p.casinoId);
      const [us, is, mc] = await Promise.all([tx.get(userRef(uid)), tx.get(ymRef(uid)), readMachine(tx, c.id, m)]);
      const atMs = now();
      if (asset === 'gold') {
        if (qty > 0) {
          if (int(us.data()?.gold) < qty) fail('failed-precondition', 'gold');
          tx.update(userRef(uid), { gold: FieldValue.increment(-qty), goldTag: goldTag('gazinoKasa', {}) }); // kendi parası: rapora girmez
          writeMachine(tx, c.id, uid, { ...mc, gold: mc.gold + qty });
          result = { ok: true, added: qty, tax: 0, net: 0 };
        } else {
          const want = -qty;
          if (mc.gold < want) fail('failed-precondition', 'casino-short');
          const sp = casinoWithdrawSplit(want);
          if (p.expectTax != null && Number(p.expectTax) !== sp.tax) fail('aborted', `tax-changed:${sp.tax}`);
          // rapora sadece vergi (gider) yazılır — kasaya kendi eklediğin para "gelir" görünmesin
          tx.update(userRef(uid), { gold: FieldValue.increment(sp.net), goldTag: goldTag('gazinoKasa', sp.tax ? { gazinoVergi: -sp.tax } : {}) });
          writeMachine(tx, c.id, uid, { ...mc, gold: mc.gold - want });
          taxLedgerWrite(tx, db, FieldValue, { amount: sp.tax, source: 'gazinoCekim', uid, atMs, ref: c.id });
          result = { ok: true, withdrawn: want, tax: sp.tax, net: sp.net };
        }
      } else {
        const mine = int(is.exists ? is.data().quantity : 0);
        if (qty > 0 && mine < qty) fail('failed-precondition', 'own-short');
        if (qty < 0 && mc.yasakliMadde < -qty) fail('failed-precondition', 'casino-short');
        tx.set(ymRef(uid), { quantity: FieldValue.increment(-qty) }, { merge: true });
        writeMachine(tx, c.id, uid, { ...mc, yasakliMadde: mc.yasakliMadde + qty });
        result = { ok: true, moved: qty };
      }
    });
    return result;
  }

  // ---- kapanış kancaları (houses.js) ---------------------------------------------------
  async function onCloseRead(tx, { houseId, h }) {
    if (h?.biz?.type !== CASINO_TYPE) return null;
    const openQ = db.collection('onNumaraTables').where('casinoId', '==', houseId).where('status', '==', 'open').limit(1);
    const [open, ...mcs] = await Promise.all([tx.get(openQ), ...CASINO_MACHINES.map((m) => readMachine(tx, houseId, m))]);
    if (!open.empty) fail('failed-precondition', 'biz-casino-table');
    return { mcs };
  }
  function onCloseWrite(tx, { houseId, h, state }) {
    if (!state || h?.biz?.type !== CASINO_TYPE) return {};
    const gold = state.mcs.reduce((a, mc) => a + mc.gold, 0);
    const ym = state.mcs.reduce((a, mc) => a + mc.yasakliMadde, 0);
    const sp = casinoWithdrawSplit(gold);
    if (sp.net) tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(sp.net), goldTag: goldTag('gazinoKasa', sp.tax ? { gazinoVergi: -sp.tax } : {}) });
    if (sp.tax) taxLedgerWrite(tx, db, FieldValue, { amount: sp.tax, source: 'gazinoCekim', uid: h.ownerUid, atMs: now(), ref: houseId });
    if (ym) tx.set(ymRef(h.ownerUid), { quantity: FieldValue.increment(ym) }, { merge: true });
    // merge YOK: aynı kapanış iki kez iade etmesin
    state.mcs.forEach((mc) => {
      if (mc.exists) tx.set(machineRef(houseId, mc.m), { casinoId: houseId, ownerUid: h.ownerUid, m: mc.m, gold: 0, yasakliMadde: 0, closedAtMs: now(), updatedAtMs: now() });
    });
    return { casinoGold: sp.net, casinoTax: sp.tax, casinoContraband: ym };
  }
  async function statusExtra({ houseId, h }) {
    if (h?.biz?.type !== CASINO_TYPE) return {};
    const snaps = await Promise.all(CASINO_MACHINES.map((m) => machineRef(houseId, m).get()));
    const gold = snaps.reduce((a, s) => a + int(s.exists ? s.data().gold : 0), 0);
    const ym = snaps.reduce((a, s) => a + int(s.exists ? s.data().yasakliMadde : 0), 0);
    const sp = casinoWithdrawSplit(gold);
    const open = await db.collection('onNumaraTables').where('casinoId', '==', houseId).where('status', '==', 'open').limit(1).get();
    return { casinoGold: sp.net, casinoTax: sp.tax, casinoContraband: ym, casinoOpenTables: open.empty ? 0 : 1 };
  }

  const ops = {
    casinoPrice: (uid, p) => price(uid, p),
    casinoStock: (uid, p) => stock(uid, p),
  };
  return {
    ops,
    price,
    stock,
    slotSpin,
    rouletteSpin,
    buyTickets,
    drawLotteries,
    tableCreateCheck,
    assertJoin,
    dealRead,
    dealWrite,
    resolveWrite,
    bizHooks: { onCloseRead, onCloseWrite, statusExtra },
  };
}

