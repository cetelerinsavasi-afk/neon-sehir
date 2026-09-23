import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

// 2026-09-21 = Pazartesi, 2026-09-27 = Pazar

test('zar: katkı = (z1+z2) × güç; güç anlık görüntü, sonradan değişmez', async () => {
  const h = await createHarness({ dice: [2, 6, 3, 3] });
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.setPersona(A.baba, { power: 40_000 });
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  const { warId } = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 100_000 });
  await h.act(B.baba, 'respondBet', { warId, accept: true });
  await h.tickTo('2026-09-22', '00:10');
  const r1 = await h.act(A.baba, 'rollDice', { warId });
  assert.deepEqual(r1.dice, [2, 6]);
  assert.equal(r1.contribution, 320_000);
  await h.setPersona(A.baba, { power: 1 });
  const roll = h.get(`wars/${warId}/rolls/${A.baba}_2026-09-22_0`);
  assert.equal(roll.contribution, 320_000, 'eski katkı değişmemeli');
  h.at('2026-09-22', '06:30');
  const r2 = await h.act(A.baba, 'rollDice', { warId });
  assert.equal(r2.contribution, 6, 'yeni saldırı yeni gücü kullanır');
  assert.equal(h.member(A.gangId, A.baba).prestige, 10_000_000 + 320_000 + 6);
});

test('pencere: aynı 6 saatte ikinci savaş yok (eşzamanlı çift tık dahil); günde en fazla 4', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  const { warId } = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 50_000 });
  await h.act(B.baba, 'respondBet', { warId, accept: true });
  await h.tickTo('2026-09-22', '00:01');
  const rs = await Promise.allSettled([1, 2, 3, 4, 5].map(() => h.act(A.baba, 'rollDice', { warId })));
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  let n = 1;
  for (const t of ['06:00', '12:00', '18:00']) {
    h.at('2026-09-22', t);
    await h.act(A.baba, 'rollDice', { warId });
    n += 1;
    const again = await h.fails(A.baba, 'rollDice', { warId });
    assert.match(again.message, /pencerede/);
  }
  assert.equal(n, 4);
  const shards = h.db._dump(`gangWorlds/test/wars/${warId}/shards/`);
  const rolls = Object.values(shards).reduce((s, x) => s + x.rolls, 0);
  assert.equal(rolls, 4);
});

test('bahis: kabul → 00:00 başlar → 24 saat sonra kazanan toplamı alır; tekrar çalışan saat çift ödeme yapmaz', async () => {
  const h = await createHarness({ dice: [6, 6, 1, 1] });
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  // limit: iki çetenin 00:00 kasalarından küçüğünün 1/4'ü = 250k
  const lim = await h.fails(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 250_001 });
  assert.match(lim.message, /En fazla 250\.000/);
  const { warId } = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 200_000 });
  assert.equal(h.state(A.gangId).kasa, 800_000);
  await h.act(B.baba, 'respondBet', { warId, accept: true });
  assert.equal(h.state(B.gangId).kasa, 800_000);
  const early = await h.fails(A.baba, 'rollDice', { warId });
  assert.match(early.message, /aktif değil|başlamadı/);
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.get(`wars/${warId}`).status, 'active');
  await h.act(A.baba, 'rollDice', { warId });
  await h.act(B.baba, 'rollDice', { warId });
  await h.tickTo('2026-09-23', '00:05');
  const w = h.get(`wars/${warId}`);
  assert.equal(w.status, 'resolved');
  assert.equal(w.result.winner, A.gangId);
  const kasaA = h.state(A.gangId).kasa;
  assert.equal(kasaA, 800_000 + 400_000);
  // aynı günü zorla tekrar çalıştır → değişiklik yok
  await h.db.doc('gangWorlds/test/ticks/2026-09-23').set({ status: 'failed' }, { merge: true });
  await h.internal.clock.runDailyTick('test', h.raw('gangWorlds/test'), '2026-09-23');
  await h.internal.clock.runClock('test');
  assert.equal(h.state(A.gangId).kasa, kasaA);
});

test('bahis: Baba+Sağ Kol; günde 1 teklif; küçük kasa sınırı; ret ve cevapsız kalma iade; hafta sonu teklif yok; öneri sohbete', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 2, name: 'Alfa' });
  const B = await setupGang(h, { members: 2, name: 'Beta' });
  const C = await setupGang(h, { members: 0, name: 'Gama' });
  for (const G of [A, B]) {
    await h.setPrestige(G.gangId, G.ids[0], 3_000_000);
    await h.setPrestige(G.gangId, G.ids[1], 1_000_000);
    await h.setRank(G.gangId, G.ids[0], 'sagkol');
    await h.setRank(G.gangId, G.ids[1], 'sagkol');
  }
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  await h.fundKasa(C.gangId, 100_000); // küçük kasa → A–C limiti 25k
  const small = await h.fails(A.ids[0], 'offerBet', { targetGangId: C.gangId, stake: 25_001 });
  assert.match(small.message, /En fazla 25\.000/);
  const { warId } = await h.act(A.ids[0], 'offerBet', { targetGangId: B.gangId, stake: 100_000 }); // Sağ Kol teklif eder
  const once = await h.fails(A.baba, 'offerBet', { targetGangId: C.gangId, stake: 10_000 });
  assert.match(once.message, /Bugün zaten/);
  assert.ok(h.chat(B.gangId).some((m) => /bahisli savaş teklif etti/.test(m)));
  // Kıdemli/Tetikçi öneri gönderir (karar vermez); Çömez gönderemez
  await h.setPrestige(B.gangId, B.ids[1], 1_000_000);
  await h.setRank(B.gangId, B.ids[1], 'kidemli');
  await h.act(B.ids[1], 'suggest', { kind: 'bet', refId: warId, choice: 'reject' });
  await h.fails(B.ids[1], 'suggest', { kind: 'bet', refId: warId, choice: 'accept' });
  await h.fails(B.ids[1], 'respondBet', { warId, accept: true });
  assert.ok(h.chat(B.gangId).some((m) => /öneriyor: Alfa bahis teklifini REDDET/.test(m)));
  await h.act(B.ids[0], 'respondBet', { warId, accept: false }); // Sağ Kol cevap verir
  assert.equal(h.state(A.gangId).kasa, 1_000_000);
  // ertesi gün 23:59'da teklif → 00:00'da cevapsız → iptal + iade
  await h.tickTo('2026-09-22', '23:59');
  const w2 = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 100_000 });
  await h.tickTo('2026-09-23', '00:01');
  assert.equal(h.get(`wars/${w2.warId}`).status, 'expired');
  assert.equal(h.state(A.gangId).kasa, 1_000_000);
  const late = await h.fails(B.baba, 'respondBet', { warId: w2.warId, accept: true });
  assert.match(late.message, /geçerli değil|süresi/);
  // Cumartesi ve Pazar teklif yok; Cuma açık (savaş Cumartesi)
  for (const day of ['2026-09-26', '2026-09-27']) {
    await h.tickTo(day, '10:00');
    const err = await h.fails(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 });
    assert.match(err.message, /Cumartesi ve Pazar/);
  }
  await h.tickTo('2026-10-02', '10:00'); // Cuma
  const fri = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 });
  assert.equal(h.get(`wars/${fri.warId}`).dateKey, '2026-10-03');
});

test('Pazar ticaret yolu savaşı: yasaklı madde→silah→araba; kazanan yolu 21 gün alır, limit = gücün %5i; kaybeden de prestij kazanır', async () => {
  const h = await createHarness({ dice: [5, 5, 1, 1] });
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.setPersona(A.baba, { power: 50_000 });
  await h.setPersona(B.baba, { power: 50_000 });
  await h.tickTo('2026-09-27', '00:10');
  const warId = 'trade_2026-09-27';
  const war = h.get(`wars/${warId}`);
  assert.equal(war.status, 'active');
  assert.equal(war.product, 'yasakliMadde', 'ilk pazar: yasaklı madde');
  await h.act(A.baba, 'rollDice', { warId }); // 10 × 50k = 500k
  await h.act(B.baba, 'rollDice', { warId }); // 2 × 50k = 100k
  const pB = h.member(B.gangId, B.baba).prestige;
  await h.tickTo('2026-09-28', '00:05');
  const route = h.get('routes/yasakliMadde');
  assert.equal(route.holderId, A.gangId);
  assert.equal(route.powerUsed, 500_000);
  assert.equal(route.dailyOrderLimit, 25_000, 'kullanılan gücün %5i');
  assert.equal(route.untilDateKey, '2026-10-19', '21 gün');
  assert.deepEqual(h.get(`gangs/${A.gangId}`).routeProducts, ['yasakliMadde']);
  assert.equal(h.member(B.gangId, B.baba).prestige, pB, 'kaybeden katkı prestijini korur');
  assert.equal(pB, 10_000_000 + 100_000);
  assert.equal(h.get(`gangs/${A.gangId}`).lastSundayPower, 500_000);
  assert.equal(h.get(`gangs/${B.gangId}`).lastSundayPower, 100_000);
  // rotasyon: yasaklı madde → silah → araba → yasaklı madde
  await h.tickTo('2026-10-04', '00:05');
  assert.equal(h.get('wars/trade_2026-10-04').product, 'silah');
  await h.tickTo('2026-10-11', '00:05');
  assert.equal(h.get('wars/trade_2026-10-11').product, 'araba');
  await h.tickTo('2026-10-18', '00:05');
  assert.equal(h.get('wars/trade_2026-10-18').product, 'yasakliMadde');
  assert.equal(h.get('routes/yasakliMadde').holderId, A.gangId, 'savaş sürerken yol hâlâ elde');
  await h.tickTo('2026-10-19', '00:05'); // kimse katılmadı → 21 gün doldu, yol boşa çıktı
  assert.equal(h.get('routes/yasakliMadde').holderId, null);
  assert.deepEqual(h.get(`gangs/${A.gangId}`).routeProducts, []);
});

test('İstihbarat pazar savaşını kazanırsa yol kimseye verilmez, kasaya gücün 1/10u', async () => {
  const h = await createHarness({ dice: [6, 6, 1, 1] });
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const spy = await h.persona({ displayName: 'Casus', gold: 10, power: 100_000, reputation: 50 });
  await h.act(spy, 'joinIntel', { codeName: 'Baykuş' });
  await h.tickTo('2026-09-27', '00:10');
  const warId = 'trade_2026-09-27';
  await h.act(spy, 'rollDice', { warId, side: 'intel' }); // 12 × 100k = 1.2M
  await h.act(A.baba, 'rollDice', { warId });
  await h.tickTo('2026-09-28', '00:05');
  const route = h.get('routes/yasakliMadde');
  assert.equal(route.holderType, null);
  assert.equal(route.lastWinner, 'intel');
  assert.equal(h.get('intel/main/private/state').kasa, 120_000);
  assert.equal(h.get('intel/main').lastSundayPower, 1_200_000);
  assert.deepEqual(h.get(`gangs/${A.gangId}`).routeProducts, []);
});

test('ittifak: Baba+Sağ Kol; öneri; 00:00 başlar; not; aktifken bahis ve sabotaj yok; bitiş 00:00', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const B = await setupGang(h, { members: 1, name: 'Beta' });
  await h.setPrestige(B.gangId, B.ids[0], 2_000_000);
  await h.setRank(B.gangId, B.ids[0], 'tetikci');
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  const { allianceId } = await h.act(A.baba, 'requestAlliance', { targetGangId: B.gangId });
  await h.fails(A.baba, 'respondAlliance', { allianceId, accept: true }); // kendi teklifini kabul edemez
  await h.act(B.ids[0], 'suggest', { kind: 'alliance', refId: allianceId, choice: 'accept' });
  assert.ok(h.chat(B.gangId).some((m) => /öneriyor: Alfa ittifak teklifini KABUL ET/.test(m)));
  await h.fails(B.ids[0], 'respondAlliance', { allianceId, accept: true }); // Tetikçi karar veremez
  await h.act(B.baba, 'respondAlliance', { allianceId, accept: true });
  await h.act(A.baba, 'sendAllianceNote', { allianceId, text: 'Salı gecesi tırlarımızı koruyun' });
  assert.equal(h.get(`alliances/${allianceId}`).notes[A.gangId].text, 'Salı gecesi tırlarımızı koruyun');
  assert.ok(h.chat(B.gangId).some((m) => /Müttefik Alfa: “Salı gecesi/.test(m)));
  await h.fails(B.ids[0], 'sendAllianceNote', { allianceId, text: 'x' });
  assert.equal(h.get(`alliances/${allianceId}`).status, 'accepted');
  const err = await h.fails(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 });
  assert.match(err.message, /İttifak/);
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'active');
  await h.act(B.baba, 'endAlliance', { allianceId });
  assert.equal(h.get(`alliances/${allianceId}`).status, 'ending');
  await h.fails(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 });
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'ended');
  await h.fundKasa(A.gangId, 0);
  await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 });
});
