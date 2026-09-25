import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

// Harness başlangıcı: 2026-09-21 Pazartesi 09:00 (İstanbul)

async function setupTradeGang(h, name = 'Alfa', { depot = 1000 } = {}) {
  const G = await setupGang(h, { members: 4, name });
  // prestijler 00:00 rütbe hesabıyla tutarlı: ids0 & ids3 Sağ Kol, ids1 & ids2 Kıdemli
  const plan = [
    [0, 5_000_000, 'sagkol'],
    [3, 4_000_000, 'sagkol'],
    [1, 2_000_000, 'kidemli'],
    [2, 1_000_000, 'kidemli'],
  ];
  for (const [i, p, r] of plan) {
    await h.setPrestige(G.gangId, G.ids[i], p);
    await h.setRank(G.gangId, G.ids[i], r);
  }
  await h.fundKasa(G.gangId, 5_000_000);
  if (depot) await h.giveDepot(G.gangId, depot);
  return G;
}

const depotOf = (h, gangId) => h.get(`gangs/${gangId}/private/depot`);

test('tır: 100.000 altın, sadece Baba/Sağ Kol; 4 haneli benzersiz kimlik; ömür 21 gün; adet sınırı yok', async () => {
  const h = await createHarness();
  const G = await setupTradeGang(h);
  await h.fails(G.ids[1], 'buyTruck');
  const rs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => h.act(i % 2 ? G.baba : G.ids[0], 'buyTruck', { requestId: `t${i}` })));
  const codes = rs.map((r) => r.code);
  assert.equal(new Set(codes).size, 6);
  for (const c of codes) assert.match(c, /^\d{4}$/);
  assert.equal(h.state(G.gangId).kasa, 5_000_000 - 6 * 100_000);
  const t = h.get(`trucks/${rs[0].truckId}`);
  assert.equal(t.boughtDateKey, '2026-09-21');
  assert.equal(t.expiresDateKey, '2026-10-12');
});

test('depo: 100.000 = +100 kapasite, her alımda genişler; sadece Baba/Sağ Kol', async () => {
  const h = await createHarness();
  const G = await setupTradeGang(h, 'Alfa', { depot: 0 });
  await h.fails(G.ids[1], 'buyDepot');
  await h.act(G.baba, 'buyDepot');
  await h.act(G.ids[0], 'buyDepot');
  assert.equal(depotOf(h, G.gangId).capacity, 200);
  assert.equal(h.state(G.gangId).kasa, 5_000_000 - 200_000);
  assert.ok(h.chat(G.gangId).some((m) => /kapasite 200/.test(m)));
});

test('sipariş: yol sahibi, yarı fiyat, Pzt–Cum, tır kapasitesi 10/10/100, tek tür, depo yeri, günlük limit, iptal', async () => {
  const h = await createHarness();
  const G = await setupTradeGang(h, 'Alfa', { depot: 0 });
  const { truckId } = await h.act(G.baba, 'buyTruck');
  const e0 = await h.fails(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 10 } });
  assert.match(e0.message, /ticaret yolu/);
  await h.giveRoute(G.gangId, 'yasakliMadde', 100_000);
  await h.giveRoute(G.gangId, 'silah', 1_000_000);
  // depo yok → sipariş yok
  const e1 = await h.fails(G.baba, 'placeOrder', { truckId, product: 'silah', items: { 'silah:1': 1 } });
  assert.match(e1.message, /depo/i);
  await h.act(G.baba, 'buyDepot'); // 100 kapasite
  await h.fails(G.ids[1], 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 10 } }); // Kıdemli
  await h.fails(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { 'silah:1': 1 } }); // tek tür
  await h.fails(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 101 } }); // tır: 100
  await h.fails(G.baba, 'placeOrder', { truckId, product: 'silah', items: { 'silah:1': 6, 'silah:2': 5 } }); // tır: 10 silah
  // limit 100k → yasaklı madde 1.250 → en fazla 80 adet
  const lim = await h.fails(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 81 } });
  assert.match(lim.message, /limit/);
  const k0 = h.state(G.gangId).kasa;
  const r = await h.act(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 80 } });
  assert.equal(r.cost, 80 * 1250);
  assert.equal(r.units, 80);
  assert.equal(h.state(G.gangId).kasa, k0 - 100_000);
  assert.equal(depotOf(h, G.gangId).reservedUnits, 80);
  // tıra günde tek sipariş
  const dup = await h.fails(G.ids[0], 'placeOrder', { truckId, product: 'silah', items: { 'silah:1': 1 } });
  assert.match(dup.message, /bekleyen/);
  // ikinci tır: depoda 20 yer kaldı → 3 silah (30 yer) sığmaz, 2 silah sığar
  const t2 = (await h.act(G.baba, 'buyTruck')).truckId;
  const full = await h.fails(G.baba, 'placeOrder', { truckId: t2, product: 'silah', items: { 'silah:1': 3 } });
  assert.match(full.message, /yer/);
  await h.act(G.baba, 'placeOrder', { truckId: t2, product: 'silah', items: { 'silah:1': 2 } });
  assert.equal(depotOf(h, G.gangId).reservedUnits, 100);
  // iptal: para, limit ve yer geri
  await h.act(G.baba, 'cancelOrder', { orderId: `${truckId}_2026-09-21` });
  assert.equal(depotOf(h, G.gangId).reservedUnits, 20);
  await h.act(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 80 } });
  // hafta sonu sipariş yok (Cumartesi)
  h.at('2026-09-26', '10:00');
  const we = await h.fails(G.baba, 'placeOrder', { truckId: t2, product: 'silah', items: { 'silah:1': 1 } });
  assert.match(we.message, /Pazartesi–Cuma/);
});

test('yoldaki tıra yeni sipariş: bugün verilen yarın 00:00 çıkar, ertesi 00:00 depoya ulaşır; çift teslim yok', async () => {
  const h = await createHarness();
  const G = await setupTradeGang(h);
  await h.giveRoute(G.gangId, 'araba', 1_000_000);
  const { truckId } = await h.act(G.baba, 'buyTruck');
  await h.act(G.baba, 'placeOrder', { truckId, product: 'araba', items: { 'araba:1': 4 } });
  await h.tickTo('2026-09-22', '00:05');
  let t = h.get(`trucks/${truckId}`);
  assert.equal(t.status, 'in_transit');
  assert.equal(t.departDateKey, '2026-09-22');
  assert.deepEqual(h.get(`trucks/${truckId}/cargo/main`).items, { 'araba:1': 4 });
  // yoldayken yeni sipariş
  await h.act(G.baba, 'placeOrder', { truckId, product: 'araba', items: { 'araba:2': 3 } });
  await h.tickTo('2026-09-23', '00:05');
  const d = depotOf(h, G.gangId);
  assert.equal(d.items['araba:1'], 4);
  assert.equal(d.usedUnits, 40);
  assert.equal(d.reservedUnits, 30, 'yeni sipariş yolda (30 yer ayrılı)');
  t = h.get(`trucks/${truckId}`);
  assert.equal(t.status, 'in_transit', 'aynı 00:00da tekrar yola çıktı');
  assert.equal(t.departDateKey, '2026-09-23');
  assert.ok(h.chat(G.gangId).some((m) => /depoya ulaştı: 4 × /.test(m)));
  await h.internal.clock.runClock('test');
  assert.equal(depotOf(h, G.gangId).items['araba:1'], 4);
  await h.tickTo('2026-09-24', '00:05');
  assert.equal(depotOf(h, G.gangId).items['araba:2'], 3);
  assert.equal(depotOf(h, G.gangId).usedUnits, 70);
  assert.equal(depotOf(h, G.gangId).reservedUnits, 0);
  assert.equal(h.get(`trucks/${truckId}`).status, 'idle');
});

test('tır ömrü: son gün sipariş yok; ömrü dolunca hurdaya çıkar, kimlik serbest', async () => {
  const h = await createHarness();
  const G = await setupTradeGang(h);
  await h.giveRoute(G.gangId, 'yasakliMadde', 1_000_000);
  const { truckId, code } = await h.act(G.baba, 'buyTruck');
  await h.db.doc(`gangWorlds/test/trucks/${truckId}`).update({ expiresDateKey: '2026-09-23' });
  await h.act(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 5 } }); // 2 gün kaldı: olur
  await h.tickTo('2026-09-22', '09:00');
  const e = await h.fails(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 5 } });
  assert.match(e.message, /ömrü/);
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(depotOf(h, G.gangId).items.yasakliMadde, 5, 'son sefer teslim edildi');
  const t = h.get(`trucks/${truckId}`);
  assert.equal(t.status, 'retired');
  assert.equal(h.get(`truckCodes/${code}`), undefined);
});

test('depo: sisteme sat (anlık değer) ve gruplara dağıt (eşit, envantere); yer serbest kalır', async () => {
  const h = await createHarness();
  const G = await setupTradeGang(h);
  await h.db.doc(`gangWorlds/test/gangs/${G.gangId}/private/depot`).set({ items: { yasakliMadde: 100, 'silah:2': 5 }, capacity: 200, usedUnits: 150, reservedUnits: 0 });
  const kasa0 = h.state(G.gangId).kasa;
  const r = await h.act(G.baba, 'sellFromDepot', { itemKey: 'yasakliMadde', qty: 10 });
  assert.equal(r.value, 12_500);
  assert.equal(h.state(G.gangId).kasa, kasa0 + 12_500);
  assert.equal(depotOf(h, G.gangId).usedUnits, 140);
  await h.fails(G.ids[1], 'sellFromDepot', { itemKey: 'yasakliMadde', qty: 1 });
  await h.fails(G.baba, 'sellFromDepot', { itemKey: 'yasakliMadde', qty: 5000 });
  const d = await h.act(G.baba, 'distributeFromDepot', { itemKey: 'silah:2', qty: 5, group: 'rutbeli' });
  assert.equal(d.per, 1);
  assert.equal(d.recipients, 5);
  assert.equal(h.raw(`gangWorlds/test/players/${G.ids[1]}`).inventory.silah_2, 1);
  assert.equal(depotOf(h, G.gangId).usedUnits, 90);
});

// Sabotaj kurulum: A'nın n tırı yolda (yasaklı madde)
async function trucksOnRoad(h, A, n, qty = 50, product = 'yasakliMadde') {
  await h.giveRoute(A.gangId, product, 5_000_000);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const { truckId } = await h.act(A.baba, 'buyTruck');
    const items = product === 'yasakliMadde' ? { yasakliMadde: qty } : { [`${product}:1`]: qty };
    await h.act(A.baba, 'placeOrder', { truckId, product, items });
    ids.push(truckId);
  }
  return ids;
}

test('sabotaj ücreti OYUN GENELİNDE 10k→20k→30k (operasyon dahil), 00:00 sıfırlanır; 12:00 sonrası yok; Kıdemli başlatamaz', async () => {
  const h = await createHarness();
  const A = await setupTradeGang(h, 'Alfa', { depot: 5000 });
  const B = await setupTradeGang(h, 'Beta', { depot: 5000 });
  const C = await setupTradeGang(h, 'Gama', { depot: 5000 });
  const trucks = await trucksOnRoad(h, A, 3);
  await h.tickTo('2026-09-22', '08:00');
  const kB = h.state(B.gangId).kasa;
  const q = await h.act(B.baba, 'quoteSabotage', { truckId: trucks[0] });
  assert.equal(q.price, 10_000);
  await h.act(B.baba, 'startSabotage', { truckId: trucks[0] });
  const q2 = await h.act(C.baba, 'quoteSabotage', { truckId: trucks[1] });
  assert.equal(q2.price, 20_000, 'başka çetenin sabotajı da fiyatı artırır');
  await h.act(C.ids[0], 'startSabotage', { truckId: trucks[1] });
  await h.fails(B.ids[1], 'startSabotage', { truckId: trucks[2] }); // Kıdemli yetkisiz
  const q3 = await h.act(B.baba, 'quoteSabotage', { truckId: trucks[2] });
  assert.equal(q3.price, 30_000);
  assert.equal(h.state(B.gangId).kasa, kB - 10_000);
  await h.fails(B.baba, 'startSabotage', { truckId: trucks[0] }); // aynı tır tekrar
  h.at('2026-09-22', '12:00');
  const late = await h.fails(B.baba, 'startSabotage', { truckId: trucks[2] });
  assert.match(late.message, /12:00/);
  // ertesi gün sıfır
  const [t4] = await trucksOnRoad(h, A, 1);
  await h.tickTo('2026-09-23', '09:00');
  assert.equal((await h.act(B.baba, 'quoteSabotage', { truckId: t4 })).price, 10_000);
});

test('sabotaj talebi: Kıdemli/Tetikçi sohbete talep gönderir, Çömez gönderemez, tekrar yok', async () => {
  const h = await createHarness();
  const A = await setupTradeGang(h, 'Alfa');
  const B = await setupTradeGang(h, 'Beta');
  const [t1] = await trucksOnRoad(h, A, 1);
  const x = await h.persona({ displayName: 'Çömez B', gold: 1, power: 1000, reputation: 1 });
  await h.act(x, 'joinGang', { gangId: B.gangId });
  await h.tickTo('2026-09-22', '08:00');
  await h.act(B.ids[1], 'requestSabotage', { truckId: t1 });
  await h.fails(B.ids[1], 'requestSabotage', { truckId: t1 });
  await h.fails(x, 'requestSabotage', { truckId: t1 });
  await h.fails(B.baba, 'requestSabotage', { truckId: t1 }); // Baba doğrudan başlatır
  assert.ok(h.chat(B.gangId).some((m) => /sabotaj talebi gönderdi: TIR #/.test(m)));
});

test('saldırılar tır sahibine 12:00de duyurulur; o zamana kadar savunma/saldırı kartını göremez', async () => {
  const h = await createHarness();
  const A = await setupTradeGang(h, 'Alfa');
  const B = await setupTradeGang(h, 'Beta');
  const [t1] = await trucksOnRoad(h, A, 1);
  await h.tickTo('2026-09-22', '08:00');
  const { warId } = await h.act(B.baba, 'startSabotage', { truckId: t1, harac: 5000 });
  const defId = `def_${t1}_2026-09-22`;
  assert.ok(!h.get(`wars/${warId}`).gangIds.includes(A.gangId));
  assert.ok(!h.get(`wars/${defId}`).gangIds.includes(A.gangId));
  assert.ok(h.get(`wars/${defId}`).gangIds.includes(B.gangId), 'saldıran savunma gücünü görebilir');
  assert.ok(!h.chat(A.gangId).some((m) => /saldırı altında/.test(m)));
  await h.fails(A.baba, 'payHarac', { warId }); // henüz duyurulmadı
  await h.tickTo('2026-09-22', '12:01');
  assert.ok(h.get(`wars/${warId}`).gangIds.includes(A.gangId));
  assert.ok(h.get(`wars/${defId}`).gangIds.includes(A.gangId));
  assert.ok(h.chat(A.gangId).some((m) => /TIR #\d{4} saldırı altında! Beta \(haraç 5\.000\)/.test(m)));
  await h.internal.clock.runClock('test'); // tekrar duyuru yok
  assert.equal(h.chat(A.gangId).filter((m) => /saldırı altında/.test(m)).length, 1);
});

test('sabotaj başarılı: yük saldırganın deposuna, tır sahibine boş döner; savunma başarılıysa teslim', async () => {
  const h = await createHarness({ dice: [6, 6, 1, 1, 1, 1, 6, 6] });
  const A = await setupTradeGang(h, 'Alfa');
  const B = await setupTradeGang(h, 'Beta');
  const [t1, t2] = await trucksOnRoad(h, A, 2, 40);
  await h.tickTo('2026-09-22', '09:00');
  const s1 = await h.act(B.baba, 'startSabotage', { truckId: t1 });
  const s2 = await h.act(B.baba, 'startSabotage', { truckId: t2 });
  assert.equal(depotOf(h, B.gangId).reservedUnits, 80, 'gerçek yük kadar yer ayrıldı');
  await h.fails(B.baba, 'rollDice', { warId: s1.warId }); // 12:00 öncesi saldırı yok
  await h.tickTo('2026-09-22', '12:30');
  await h.act(B.baba, 'rollDice', { warId: s1.warId }); // 12 × 60k
  await h.act(A.baba, 'rollDice', { warId: `def_${t1}_2026-09-22` }); // 2 × 60k
  h.at('2026-09-22', '18:30');
  await h.act(B.baba, 'rollDice', { warId: s2.warId }); // 2 × 60k
  await h.act(A.baba, 'rollDice', { warId: `def_${t2}_2026-09-22` }); // 12 × 60k
  await h.tickTo('2026-09-23', '00:05');
  const depB = depotOf(h, B.gangId);
  const depA = depotOf(h, A.gangId);
  assert.equal(depB.items.yasakliMadde, 40, 't1 yükü B deposunda');
  assert.equal(depB.usedUnits, 40);
  assert.equal(depB.reservedUnits, 0, 'saldırı yeri serbest');
  assert.equal(depA.items.yasakliMadde, 40, 't2 savunuldu, A deposunda');
  assert.equal(depA.reservedUnits, 0);
  assert.equal(depA.usedUnits, 40);
  assert.equal(h.get(`trucks/${t1}`).status, 'idle');
  assert.equal(h.get(`trucks/${t1}`).gangId, A.gangId, 'tır çalınmaz, sahibine döner');
  assert.equal(h.get(`trucks/${t1}`).lastTrip.outcome, 'stolen');
  assert.equal(h.get(`wars/${s1.warId}`).result.won, true);
  assert.equal(h.get(`wars/${s2.warId}`).result.won, false);
  assert.ok(h.chat(B.gangId).some((m) => /sabotajı BAŞARILI/.test(m)));
});

test('haraç: alt/üst sınır yok; 21:00e kadar (v38); en güçlünün haracı ödenince sıradaki en güçlü esas alınır', async () => {
  const h = await createHarness({ dice: [6, 6, 1, 1, 2, 2] });
  const A = await setupTradeGang(h, 'Alfa');
  const B = await setupTradeGang(h, 'Beta');
  const C = await setupTradeGang(h, 'Gama');
  const [t1, t2] = await trucksOnRoad(h, A, 2, 10);
  await h.tickTo('2026-09-22', '09:00');
  const huge = 999_000_000; // üst sınır yok
  const sB = await h.act(B.baba, 'startSabotage', { truckId: t1, harac: 40_000 });
  const sC = await h.act(C.baba, 'startSabotage', { truckId: t1, harac: huge });
  await h.act(C.baba, 'startSabotage', { truckId: t2, harac: 0 });
  await h.fails(B.baba, 'startSabotage', { truckId: t2, harac: -5 });
  await h.tickTo('2026-09-22', '12:30');
  await h.act(B.baba, 'rollDice', { warId: sB.warId }); // 12 × 60k = 720k (en güçlü)
  await h.act(C.baba, 'rollDice', { warId: sC.warId }); // 2 × 60k = 120k
  await h.act(A.baba, 'rollDice', { warId: `def_${t1}_2026-09-22` }); // 4 × 60k = 240k
  const kasaB = h.state(B.gangId).kasa;
  await h.fails(A.ids[1], 'payHarac', { warId: sB.warId }); // Kıdemli ödeyemez
  await h.act(A.ids[0], 'payHarac', { warId: sB.warId });
  assert.equal(h.get(`wars/${sB.warId}`).status, 'cancelled_harac');
  assert.equal(h.state(B.gangId).kasa, kasaB + 40_000);
  await h.fails(A.baba, 'payHarac', { warId: sB.warId }); // ikinci ödeme yok
  // v38: son ödeme son dilim (21:00) başlayana kadar
  h.at('2026-09-22', '18:00');
  const stillOk = await h.fails(A.baba, 'payHarac', { warId: sC.warId }); // 18:00'de hâlâ açık (kasa yetmez → süre hatası değil)
  assert.doesNotMatch(stillOk.message, /kapandı/);
  h.at('2026-09-22', '21:00');
  const late = await h.fails(A.baba, 'payHarac', { warId: sC.warId });
  assert.match(late.message, /21:00/);
  await h.tickTo('2026-09-23', '00:05');
  // B çekildi → C (120k) < savunma (240k) → tır güvenle ulaştı
  assert.equal(h.get(`trucks/${t1}`).lastTrip.outcome, 'delivered');
  assert.equal(depotOf(h, B.gangId).reservedUnits, 0);
});

test('depo yeri tırın GERÇEK yüküyle: 1 arabası olan 100lük depoya 100 yasaklı madde sığmaz → sabotaj yok', async () => {
  const h = await createHarness();
  const A = await setupTradeGang(h, 'Alfa');
  const B = await setupTradeGang(h, 'Beta', { depot: 0 });
  const [big] = await trucksOnRoad(h, A, 1, 100);
  await h.giveRoute(A.gangId, 'araba', 5_000_000);
  const small = (await h.act(A.baba, 'buyTruck')).truckId;
  await h.act(A.baba, 'placeOrder', { truckId: small, product: 'araba', items: { 'araba:1': 9 } });
  await h.db.doc(`gangWorlds/test/gangs/${B.gangId}/private/depot`).set({ items: { 'araba:1': 1 }, capacity: 100, usedUnits: 10, reservedUnits: 0 });
  await h.tickTo('2026-09-22', '09:00');
  const q = await h.act(B.baba, 'quoteSabotage', { truckId: big });
  assert.equal(q.canReceive, false);
  const err = await h.fails(B.baba, 'startSabotage', { truckId: big });
  assert.match(err.message, /yer yok/);
  const q2 = await h.act(B.baba, 'quoteSabotage', { truckId: small }); // 90 yer = 9 araba sığar
  assert.equal(q2.canReceive, true);
  await h.act(B.baba, 'startSabotage', { truckId: small });
});

test('müttefik savunmaya güç ekler (12:00 duyurusuyla görür); müttefike sabotaj yapılamaz', async () => {
  const h = await createHarness({ dice: [3, 3, 6, 6, 5, 5] });
  const A = await setupTradeGang(h, 'Alfa');
  const B = await setupTradeGang(h, 'Beta');
  const C = await setupTradeGang(h, 'Gama');
  const { allianceId } = await h.act(A.baba, 'requestAlliance', { targetGangId: C.gangId });
  await h.act(C.ids[0], 'respondAlliance', { allianceId, accept: true }); // Sağ Kol kabul edebilir
  const [t1] = await trucksOnRoad(h, A, 1);
  await h.tickTo('2026-09-22', '09:00');
  const err = await h.fails(C.baba, 'startSabotage', { truckId: t1 });
  assert.match(err.message, /İttifak/);
  const { warId } = await h.act(B.baba, 'startSabotage', { truckId: t1 });
  await h.tickTo('2026-09-22', '13:00');
  assert.ok(h.get(`wars/def_${t1}_2026-09-22`).gangIds.includes(C.gangId));
  assert.ok(h.chat(C.gangId).some((m) => /Müttefik Alfa/.test(m)));
  await h.act(B.baba, 'rollDice', { warId }); // 6×60k=360k
  await h.act(A.baba, 'rollDice', { warId: `def_${t1}_2026-09-22` }); // 12×60k = 720k
  await h.act(C.baba, 'rollDice', { warId: `def_${t1}_2026-09-22` }); // müttefik: 10×60k
  const x = await h.persona({ displayName: 'Yabancı', gold: 1, power: 5000, reputation: 1 });
  await h.act(x, 'joinGang', { gangId: B.gangId });
  await h.fails(x, 'rollDice', { warId: `def_${t1}_2026-09-22` });
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`wars/def_${t1}_2026-09-22`).result.defensePower, 720_000 + 600_000);
  assert.equal(h.get(`trucks/${t1}`).lastTrip.outcome, 'delivered');
});

test('v38: sabotajda günde 4 dilim (12·15·18·21): 12:00 öncesi zar yok; dilim başına 1 saldırı, farklı savaşlar dahil', async () => {
  const h = await createHarness();
  const A = await setupTradeGang(h, 'Alfa');
  const B = await setupTradeGang(h, 'Beta');
  const [t1, t2] = await trucksOnRoad(h, A, 2);
  await h.tickTo('2026-09-22', '09:00');
  const s1 = (await h.act(B.baba, 'startSabotage', { truckId: t1 })).warId;
  const s2 = (await h.act(B.baba, 'startSabotage', { truckId: t2 })).warId;
  const early = await h.fails(B.baba, 'rollDice', { warId: s1 });
  assert.match(early.message, /başlamadı/);
  await h.tickTo('2026-09-22', '12:00');
  await h.act(B.baba, 'rollDice', { warId: s1 });
  const same = await h.fails(B.baba, 'rollDice', { warId: s2 }); // aynı dilimde başka sabotaj da yok
  assert.match(same.message, /dilimde/);
  h.at('2026-09-22', '14:59');
  await h.fails(B.baba, 'rollDice', { warId: s1 });
  for (const [t, w] of [['15:00', s2], ['18:00', s1], ['21:00', s2]]) {
    h.at('2026-09-22', t);
    await h.act(B.baba, 'rollDice', { warId: w }); // yeni dilimde yeni saldırı
    await h.fails(B.baba, 'rollDice', { warId: w === s1 ? s2 : s1 });
  }
  const slots = Object.keys(h.db._dump('gangWorlds/test/slots/')).filter((k) => k.includes(B.baba));
  assert.equal(slots.length, 4, 'sabotaj gününde en fazla 4 saldırı');
});
