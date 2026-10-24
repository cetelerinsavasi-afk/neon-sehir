// v124 Faz 6 — Oyuncu gazinoları (functions/casino.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createCasino, casinoPricesOf, casinoWithdrawSplit, slotReady, CASINO_TEXT, isPlayerCasinoId } from '../casino.js';
import { combineBizHooks } from '../depo.js';
import { normalizeRouletteBets, rouletteMaxNetWin, SLOT_SYMBOLS, lotteryTicketPrice } from '../casinoRules.js';
import { BIZ_TYPES, BIZ_BY_REGION, checkBizRequirements } from '../businessCatalogData.js';
import { TAX_SOURCES } from '../tax.js';
import { STATE_IN } from '../stateTreasury.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const split = (debt, amount) => {
  if (!(debt > 0)) return { goldDelta: amount, debtDelta: 0 };
  const repay = Math.min(Math.floor(amount / 2), debt);
  return { goldDelta: amount - repay, debtDelta: -repay };
};
const DAY = '2026-10-24';
const T = Date.UTC(2026, 9, 24, 9, 0); // 12:00 İstanbul

function setup() {
  const db = new FakeFirestore({ yieldEvery: false, clock: () => T });
  const S = (p, d) => db._store.set(p, { data: d, version: 1 });
  const G = (p) => db._store.get(p)?.data;
  const casino = createCasino({ db, FieldValue, HttpsError, splitIncomeForDebt: split, now: () => T });
  S('users/ali', { gold: 100_000, displayName: 'Ali' });
  S('users/veli', { gold: 50_000, displayName: 'Veli' });
  S('users/patron', { gold: 500_000, displayName: 'Patron' });
  S('users/patron/inventory/yasakliMadde', { quantity: 20 });
  S('houses/g1', { ownerUid: 'patron', name: 'Altın Saray', biz: { type: 'gazino' }, bizType: 'gazino', bizPrices: { gazino: { slot: 1450, cut: 5 } } });
  return { db, S, G, casino };
}
// randInt'i sırayla verilen sembollere göre çalıştırır
const reelsOf = (...syms) => {
  const q = syms.map((s) => SLOT_SYMBOLS.indexOf(s));
  return () => q.shift();
};
const report = (h, game) => h.G(`businessDaily/g1_${DAY}`)?.casino?.[game] || {};

test('işletme türü: Gazino haritada Casino bölgesinde; 4 mobilya gerekli; fiyat bantları', () => {
  assert.equal(BIZ_BY_REGION.casino, 'gazino');
  assert.deepEqual(BIZ_TYPES.gazino.groups.map((g) => g.any[0]), ['piyangogise', 'kartmasa', 'rulet', 'slotm']);
  const items = ['piyangogise', 'kartmasa', 'rulet', 'slotm'].map((k, i) => ({ i: `x${i}`, k, x: 0, z: 0, p: 1 }));
  assert.equal(checkBizRequirements('gazino', items).ok, true);
  assert.equal(checkBizRequirements('gazino', items.slice(1)).ok, false);
  assert.deepEqual(casinoPricesOf({}), { slot: 1600, cut: 10 });
  assert.deepEqual(casinoPricesOf({ bizPrices: { gazino: { slot: 1450, cut: 5 } } }), { slot: 1450, cut: 5 });
  assert.deepEqual(casinoPricesOf({ bizPrices: { gazino: { slot: 1, cut: 99 } } }), { slot: 1400, cut: 10 }, 'banda çekilir');
  assert.deepEqual(casinoWithdrawSplit(10_005), { gross: 10_005, tax: 1000, net: 9005 });
  assert.equal(isPlayerCasinoId('game'), false);
  assert.equal(isPlayerCasinoId('g1'), true);
  assert.ok(TAX_SOURCES.gazinoCekim && STATE_IN.vergi_gazinoCekim, 'kasa çekim vergisi devlete ayrı kalem');
});

test('sahip: fiyat 1.400–1.600 (50) ve kâr 1–10; başkası değiştiremez', async () => {
  const h = setup();
  await h.casino.price('patron', { houseId: 'g1', slot: 1500, cut: 3 });
  assert.deepEqual(h.G('houses/g1').bizPrices.gazino, { slot: 1500, cut: 3 });
  await assert.rejects(h.casino.price('patron', { houseId: 'g1', slot: 1525, cut: 3 }), /price-band:slot/);
  await assert.rejects(h.casino.price('patron', { houseId: 'g1', slot: 1500, cut: 11 }), /price-band:cut/);
  await assert.rejects(h.casino.price('patron', { houseId: 'g1', slot: 1350, cut: 3 }), /price-band:slot/);
  await assert.rejects(h.casino.price('ali', { houseId: 'g1', slot: 1500, cut: 3 }), /senin değil/);
});

test('envanter: ekleme vergisiz; altın çekerken %10 vergi (devlete); yasaklı madde sadece slota, çekmesi vergisiz', async () => {
  const h = setup();
  await h.casino.stock('patron', { houseId: 'g1', machine: 'slot', asset: 'gold', qty: 20_000 });
  await h.casino.stock('patron', { houseId: 'g1', machine: 'slot', asset: 'yasakliMadde', qty: 5 });
  await h.casino.stock('patron', { houseId: 'g1', machine: 'rulet', asset: 'gold', qty: 30_000 });
  assert.equal(h.G('users/patron').gold, 450_000);
  assert.equal(h.G('users/patron/inventory/yasakliMadde').quantity, 15);
  assert.equal(h.G('casinoMachines/g1_slot').gold, 20_000);
  assert.equal(h.G('casinoMachines/g1_slot').yasakliMadde, 5);
  await assert.rejects(h.casino.stock('patron', { houseId: 'g1', machine: 'rulet', asset: 'yasakliMadde', qty: 1 }), /sadece slot/);
  await assert.rejects(h.casino.stock('patron', { houseId: 'g1', machine: 'slot', asset: 'gold', qty: -20_001 }), /casino-short/);
  await assert.rejects(h.casino.stock('patron', { houseId: 'g1', machine: 'slot', asset: 'gold', qty: -10_000, expectTax: 5 }), /tax-changed:1000/);
  await assert.rejects(h.casino.stock('ali', { houseId: 'g1', machine: 'slot', asset: 'gold', qty: 1 }), /senin değil/);
  const r = await h.casino.stock('patron', { houseId: 'g1', machine: 'rulet', asset: 'gold', qty: -10_000, expectTax: 1000 });
  assert.deepEqual([r.withdrawn, r.tax, r.net], [10_000, 1000, 9000]);
  assert.equal(h.G('users/patron').gold, 459_000);
  assert.equal(h.G('casinoMachines/g1_rulet').gold, 20_000);
  assert.equal(h.G(`taxLedger/${DAY}_patron`).bySource.gazinoCekim, 1000);
  await h.casino.stock('patron', { houseId: 'g1', machine: 'slot', asset: 'yasakliMadde', qty: -2 });
  assert.equal(h.G('users/patron/inventory/yasakliMadde').quantity, 17);
  assert.equal(h.G('users/patron').gold, 459_000, 'yasaklı madde çekmek vergisiz');
});

test('slot: en az 3 yasaklı + 10.000 altın yoksa çalışmaz; ücret makineye, ödül makineden; rapor makine başı', async () => {
  const h = setup();
  await assert.rejects(h.casino.slotSpin('ali', { casinoId: 'g1' }, reelsOf('bos', 'bos', 'bos')), new RegExp(CASINO_TEXT.slotEmpty));
  h.S('casinoMachines/g1_slot', { casinoId: 'g1', ownerUid: 'patron', m: 'slot', gold: 10_000, yasakliMadde: 2 });
  await assert.rejects(h.casino.slotSpin('ali', { casinoId: 'g1' }, reelsOf('bos', 'bos', 'bos')), /slot çalışmıyor/);
  h.S('casinoMachines/g1_slot', { casinoId: 'g1', ownerUid: 'patron', m: 'slot', gold: 10_000, yasakliMadde: 3 });
  assert.equal(slotReady(h.G('casinoMachines/g1_slot')), true);
  await assert.rejects(h.casino.slotSpin('ali', { casinoId: 'g1', expect: 1600 }, reelsOf('bos', 'bos', 'bos')), /price-changed:1450/);
  // 3 altın: 10.000 makineden
  const r1 = await h.casino.slotSpin('ali', { casinoId: 'g1', expect: 1450 }, reelsOf('altin', 'altin', 'altin'));
  assert.equal(r1.gold, 10_000);
  assert.equal(h.G('users/ali').gold, 100_000 - 1450 + 10_000);
  assert.equal(h.G('casinoMachines/g1_slot').gold, 10_000 + 1450 - 10_000);
  // makine artık 10.000'in altında → çalışmaz
  await assert.rejects(h.casino.slotSpin('veli', { casinoId: 'g1' }, reelsOf('bos', 'bos', 'bos')), /slot çalışmıyor/);
  await h.casino.stock('patron', { houseId: 'g1', machine: 'slot', asset: 'gold', qty: 20_000 });
  // 2 yasaklı: 1 adet makineden
  const r2 = await h.casino.slotSpin('veli', { casinoId: 'g1' }, reelsOf('yasakliMadde', 'bos', 'yasakliMadde'));
  assert.equal(r2.yasakliMadde, 1);
  assert.equal(h.G('users/veli/inventory/yasakliMadde').quantity, 1);
  assert.equal(h.G('casinoMachines/g1_slot').yasakliMadde, 2);
  assert.equal(h.G('casinoMachines/g1_slot').gold, 1450 + 20_000 + 1450);
  const rep = report(h, 'slot');
  assert.deepEqual([rep.in, rep.outGold, rep.outYm, rep.n], [2900, 10_000, 1, 2]);
  const daily = h.G(`businessDaily/g1_${DAY}`);
  assert.equal(daily.revenue, 2900);
  assert.equal(daily.ownerUid, 'patron');
  assert.deepEqual(Object.keys(daily.cust).sort(), ['ali', 'veli']);
});

test('rulet: en kötü durumdaki net kazancı masa karşılamıyorsa bahis açılmaz; kazanç masadan', async () => {
  const h = setup();
  const nb = normalizeRouletteBets({ n7: 1000 }); // 7 gelirse 12.000 öder → net 11.000
  assert.equal(rouletteMaxNetWin(nb.bets), 11_000);
  h.S('casinoMachines/g1_rulet', { casinoId: 'g1', ownerUid: 'patron', m: 'rulet', gold: 10_999 });
  await assert.rejects(h.casino.rouletteSpin('ali', { casinoId: 'g1', nb, number: 7 }), /yeterli altın olmadığı için bu bahis açılamıyor/);
  h.S('casinoMachines/g1_rulet', { casinoId: 'g1', ownerUid: 'patron', m: 'rulet', gold: 11_000 });
  await h.casino.rouletteSpin('ali', { casinoId: 'g1', nb, number: 7 });
  assert.equal(h.G('users/ali').gold, 111_000);
  assert.equal(h.G('casinoMachines/g1_rulet').gold, 0);
  // kaybeden bahis masayı doldurur
  const nb2 = normalizeRouletteBets({ red: 100, black: 100 }); // en kötü: yeşil → 0 net kazanç gerekmez
  await h.casino.rouletteSpin('veli', { casinoId: 'g1', nb: nb2, number: 0 });
  assert.equal(h.G('casinoMachines/g1_rulet').gold, 200);
  assert.equal(h.G('users/veli').gold, 49_800);
  const rep = report(h, 'rulet');
  assert.deepEqual([rep.in, rep.out, rep.n], [1200, 12_000, 2]);
});

test('10 Numara: bahis ≤ kart masası; dağıtımda kurpiyerin payı masadan, el sonunda ödenmeyen pot masaya', async () => {
  const h = setup();
  await assert.rejects(h.casino.tableCreateCheck('ali', 'g1', 500), /kart dağıtılamıyor/);
  h.S('casinoMachines/g1_kart', { casinoId: 'g1', ownerUid: 'patron', m: 'kart', gold: 500 });
  await assert.rejects(h.casino.tableCreateCheck('ali', 'g1', 1000), /en fazla 500 altınlık masa/);
  const meta = await h.casino.tableCreateCheck('ali', 'g1', 500);
  assert.equal(meta.casinoOwnerUid, 'patron');
  // sahip kendi masasını açamaz / oturamaz; kasada para olsa da en fazla 100.000
  await assert.rejects(h.casino.tableCreateCheck('patron', 'g1', 100), /Kendi gazinonda/);
  assert.throws(() => h.casino.assertJoin('patron', { casinoOwnerUid: 'patron' }), /Kendi gazinonda/);
  h.S('casinoMachines/g1_kart', { casinoId: 'g1', ownerUid: 'patron', m: 'kart', gold: 500_000 });
  await assert.rejects(h.casino.tableCreateCheck('ali', 'g1', 100_001), /en fazla 100\.000/);
  await h.casino.tableCreateCheck('ali', 'g1', 100_000);
  h.S('casinoMachines/g1_kart', { casinoId: 'g1', ownerUid: 'patron', m: 'kart', gold: 500 });
  const table = { casinoId: 'g1', casinoOwnerUid: 'patron', betAmount: 500 };
  // dağıtım: 2 oyuncu → masadan 500 (kurpiyerin payı), rapor: giren 1.000
  await h.db.runTransaction(async (tx) => {
    const st = await h.casino.dealRead(tx, table);
    h.casino.dealWrite(tx, table, st, ['ali', 'veli']);
  });
  assert.equal(h.G('casinoMachines/g1_kart').gold, 0);
  // masa boşken ikinci dağıtım yapılamaz
  await assert.rejects(
    h.db.runTransaction(async (tx) => {
      const st = await h.casino.dealRead(tx, table);
      h.casino.dealWrite(tx, table, st, ['ali']);
    }),
    /kart dağıtılamıyor/
  );
  // pot 1.500; ali tek kazandı → 1.500 ödendi, masaya 0 döner (kurpiyer −500)
  // senaryo B: kurpiyer kazandı → pot 1.500 masaya döner
  await h.db.runTransaction(async (tx) => h.casino.resolveWrite(tx, table, { houseBack: 1500, paidOut: 0 }));
  assert.equal(h.G('casinoMachines/g1_kart').gold, 1500);
  const rep = report(h, 'onnumara');
  assert.deepEqual([rep.in, rep.out || 0, rep.n], [1000, 0, 1]);
});

test('piyango: bilet = 90 + sahibin kârı (5 → 95); havuza 90; gece kazanana −%10, sahibine kâr −%10 + SMS; tek sefer', async () => {
  const h = setup();
  assert.equal(lotteryTicketPrice(10), 100);
  assert.equal(lotteryTicketPrice(1), 91);
  await assert.rejects(h.casino.buyTickets('ali', { casinoId: 'g1', qty: 1, dateKey: DAY, expect: 100 }), /price-changed:95/);
  await h.casino.buyTickets('ali', { casinoId: 'g1', qty: 3, dateKey: DAY, expect: 95 });
  await h.casino.buyTickets('veli', { casinoId: 'g1', qty: 1, dateKey: DAY });
  const L = h.G(`casinoLottery/g1_${DAY}`);
  assert.deepEqual([L.jackpot, L.ownerCut, L.totalTickets], [360, 20, 4]);
  assert.equal(h.G('users/ali').gold, 100_000 - 285);
  const rep = report(h, 'piyango');
  assert.deepEqual([rep.in, rep.out], [380, 360]);
  // aynı gün çekilmez
  let s = await h.casino.drawLotteries(DAY);
  assert.equal(s.drawn, 0);
  // ertesi gün
  const wins = [];
  s = await h.casino.drawLotteries('2026-10-25', { onWin: async (u) => wins.push(u) });
  assert.equal(s.drawn, 1);
  const D = h.G(`casinoLottery/g1_${DAY}`);
  assert.ok(D.drawnAt);
  assert.ok(['ali', 'veli'].includes(D.winnerUid));
  assert.deepEqual([D.winnerAmount, D.winnerTax, D.winnerNet, D.ownerTax, D.ownerNet], [360, 36, 324, 2, 18]);
  const w = D.winnerUid;
  assert.equal(h.G(`users/${w}`).gold, (w === 'ali' ? 99_715 : 49_905) + 324);
  assert.equal(h.G('users/patron').gold, 500_018);
  assert.deepEqual(wins, [w]);
  const msgs = (uid) => [...h.db._store.keys()].filter((k) => k.startsWith(`users/${uid}/messages/`)).map((k) => h.G(k));
  assert.match(msgs('patron')[0].text, /4 bilet satıldı.*20 altın.*%10 vergi \(2 altın\).*18 altın/);
  assert.match(msgs(w)[0].text, /Altın Saray.*360 altın kazandın.*324/);
  // tekrar çalışsa da ikinci kez ödemez
  s = await h.casino.drawLotteries('2026-10-25');
  assert.equal(s.drawn, 0);
  assert.equal(h.G('users/patron').gold, 500_018);
  assert.equal(h.G(`taxLedger/2026-10-24_patron`).bySource.gazino, 2);
});

test('kapanış: açık 10 Numara masası varken kapanmaz; makinelerdeki altın −%10 vergiyle, yasaklı madde sahibine (bir kez)', async () => {
  const h = setup();
  const hooks = combineBizHooks(h.casino.bizHooks);
  h.S('casinoMachines/g1_slot', { casinoId: 'g1', ownerUid: 'patron', m: 'slot', gold: 10_000, yasakliMadde: 4 });
  h.S('casinoMachines/g1_rulet', { casinoId: 'g1', ownerUid: 'patron', m: 'rulet', gold: 5_000 });
  h.S('onNumaraTables/t1', { casinoId: 'g1', status: 'open', seatOrder: ['ali'] });
  const house = h.G('houses/g1');
  await assert.rejects(h.db.runTransaction(async (tx) => hooks.onCloseRead(tx, { houseId: 'g1', h: house })), /biz-casino-table/);
  const st = await hooks.statusExtra({ houseId: 'g1', h: house });
  assert.deepEqual(st, { casinoGold: 13_500, casinoTax: 1500, casinoContraband: 4, casinoOpenTables: 1 });
  h.S('onNumaraTables/t1', { casinoId: 'g1', status: 'closed', seatOrder: [] });
  let ret = null;
  await h.db.runTransaction(async (tx) => {
    const state = await hooks.onCloseRead(tx, { houseId: 'g1', h: house });
    ret = hooks.onCloseWrite(tx, { houseId: 'g1', h: house, state });
  });
  assert.deepEqual(ret, { casinoGold: 13_500, casinoTax: 1500, casinoContraband: 4 });
  assert.equal(h.G('users/patron').gold, 513_500);
  assert.equal(h.G('users/patron/inventory/yasakliMadde').quantity, 24);
  assert.equal(h.G('casinoMachines/g1_slot').gold, 0);
  assert.equal(h.G('casinoMachines/g1_rulet').gold, 0);
  assert.equal(h.G('casinoMachines/g1_kart'), undefined, 'olmayan makine belgesi yazılmaz');
  // ikinci kapanış (tekrar) bir şey iade etmez
  await h.db.runTransaction(async (tx) => {
    const state = await hooks.onCloseRead(tx, { houseId: 'g1', h: house });
    ret = hooks.onCloseWrite(tx, { houseId: 'g1', h: house, state });
  });
  assert.equal(h.G('users/patron').gold, 513_500);
  // diğer işletme türlerinde kanca boş döner
  const other = await h.db.runTransaction(async (tx) => hooks.onCloseRead(tx, { houseId: 'x', h: { biz: { type: 'depo' } } }));
  assert.deepEqual(other, [null]);
});

test('kapalı gazinoda oynanmaz (işletme türü değişmişse)', async () => {
  const h = setup();
  h.S('houses/g1', { ownerUid: 'patron', name: 'Ev', biz: null, bizType: null });
  await assert.rejects(h.casino.buyTickets('ali', { casinoId: 'g1', qty: 1, dateKey: DAY }), /Bu gazino kapandı/);
  await assert.rejects(h.casino.slotSpin('ali', { casinoId: 'g1' }, reelsOf('bos', 'bos', 'bos')), /Bu gazino kapandı/);
});

test('index.js bağlantıları: slot/rulet/piyango/10 Numara casinoId, kapanış kancası, gece çekilişi', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /casino\.slotSpin\(uid, \{ casinoId/);
  assert.match(src, /casino\.rouletteSpin\(uid, \{ casinoId, nb, number \}\)/);
  assert.match(src, /casino\.buyTickets\(uid, \{ casinoId: lotCasinoId/);
  assert.match(src, /casino\.tableCreateCheck\(uid, tCasinoId, bet\)/);
  assert.match(src, /casino\.assertJoin\(uid, table\)/);
  assert.match(src, /casino\.dealRead\(tx, table\)/);
  assert.equal((src.match(/casino\.resolveWrite\(tx, table/g) || []).length, 2, 'beraberlik + kazanan yolları');
  assert.match(src, /houseStake,/);
  assert.match(src, /combineBizHooks\(shop\.bizHooks, depo\.bizHooks, casino\.bizHooks\)/);
  assert.match(src, /casino\.drawLotteries\(dateKey/);
  assert.match(src, /\.\.\.casino\.ops/);
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/casinoMachines\/\{docId\}[\s\S]*?allow write: if false;/);
  assert.match(rules, /match \/casinoLottery\/\{docId\}[\s\S]*?allow write: if false;/);
});

test('sahip kendi gazinosunda oynayamaz (slot, rulet, piyango)', async () => {
  const h = setup();
  h.S('casinoMachines/g1_slot', { casinoId: 'g1', ownerUid: 'patron', m: 'slot', gold: 20_000, yasakliMadde: 3 });
  h.S('casinoMachines/g1_rulet', { casinoId: 'g1', ownerUid: 'patron', m: 'rulet', gold: 50_000 });
  await assert.rejects(h.casino.slotSpin('patron', { casinoId: 'g1' }, reelsOf('bos', 'bos', 'bos')), /Kendi gazinonda/);
  await assert.rejects(h.casino.rouletteSpin('patron', { casinoId: 'g1', nb: normalizeRouletteBets({ red: 10 }), number: 1 }), /Kendi gazinonda/);
  await assert.rejects(h.casino.buyTickets('patron', { casinoId: 'g1', qty: 1, dateKey: DAY }), /Kendi gazinonda/);
  assert.equal(h.G('users/patron').gold, 500_000);
});

test('Faz 7 yayın: "10 Numara" yerine "Casinolar" (On Numara · Rulet · Slot, piyango yok); rulet/slot izleyiciye aynalanır', () => {
  const rd = (f) => fs.readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  const host = rd('components/Stream/StreamHost.jsx');
  assert.match(host, /<b>Casinolar<\/b>/);
  assert.doesNotMatch(host, /<b>10 Numara<\/b>/);
  const hs = rd('components/HouseScreen/HouseScreen.jsx');
  assert.match(hs, /onCasino=\{playCasino\}/);
  assert.match(hs, /<StreamCasinoSheet /);
  assert.doesNotMatch(hs, /gazino: \[\{ panel: 'casino'/, 'gazinoda üstte Oyunlar butonu yok');
  const sc = rd('components/Casino/StreamCasino.jsx');
  assert.match(sc, /games=\{\['onnumara', 'rulet', 'slot'\]\}/);
  assert.match(sc, /publishCasinoFrame\(/);
  assert.match(rd('components/Stream/StreamViewer.jsx'), /f\.g === 'casino' \? 'casino'/);
  assert.match(rd('components/Stream/streamShared.js'), /sendFrame\('casino'/);
});
