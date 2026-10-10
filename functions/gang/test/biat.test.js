import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang, ist } from './harness.js';

// v84 — BİAT. Harness başlangıcı: 2026-09-21 Pazartesi 09:00; 2026-09-27 Pazar.

async function setupRankedGang(h, name) {
  const G = await setupGang(h, { members: 4, name });
  // ids0 & ids3 Sağ Kol, ids1 & ids2 Kıdemli (prestij 00:00 rütbe hesabıyla tutarlı)
  for (const [i, p, r] of [
    [0, 5_000_000, 'sagkol'],
    [3, 4_000_000, 'sagkol'],
    [1, 2_000_000, 'kidemli'],
    [2, 1_000_000, 'kidemli'],
  ]) {
    await h.setPrestige(G.gangId, G.ids[i], p);
    await h.setRank(G.gangId, G.ids[i], r);
  }
  await h.fundKasa(G.gangId, 5_000_000);
  return G;
}

async function setRoutes(h, gangId, routeProducts) {
  await h.db.doc(`gangWorlds/test/gangs/${gangId}`).update({ routeProducts });
}

test('biat: sadece Baba teklif eder; yolu olan edemez; Sağ Kol kabul eder; 00:00 başlar; işaretler; bahis/sabotaj yok', async () => {
  const h = await createHarness();
  const A = await setupRankedGang(h, 'Alfa'); // biat edecek
  const B = await setupRankedGang(h, 'Beta'); // biat edilecek
  const C = await setupRankedGang(h, 'Gama');

  assert.match((await h.fails(A.ids[0], 'requestBiat', { targetGangId: B.gangId })).message, /Mafya Babası/, 'Sağ Kol teklif edemez');
  assert.match((await h.fails(A.baba, 'requestBiat', { targetGangId: A.gangId })).message, /Geçersiz/);
  await setRoutes(h, A.gangId, ['silah']);
  assert.match((await h.fails(A.baba, 'requestBiat', { targetGangId: B.gangId })).message, /ticaret yolu/);
  await setRoutes(h, A.gangId, []);

  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  const doc = h.get(`alliances/${biatId}`);
  assert.equal(doc.kind, 'biat');
  assert.equal(doc.vassalId, A.gangId);
  assert.equal(doc.overlordId, B.gangId);
  assert.equal(doc.status, 'requested');
  assert.match((await h.fails(A.baba, 'requestBiat', { targetGangId: C.gangId })).message, /bekleyen/, 'aynı anda tek teklif');
  assert.match((await h.fails(A.baba, 'respondBiat', { biatId, accept: true })).message, /bulunamadı/, 'kendi teklifini kabul edemez');
  await h.fails(B.baba, 'respondAlliance', { allianceId: biatId, accept: true }); // ittifak yolu biatı kabul etmez
  await h.act(B.ids[1], 'suggest', { kind: 'biat', refId: biatId, choice: 'accept' });
  assert.ok(h.chat(B.gangId).some((m) => /öneriyor: Alfa biat teklifini KABUL ET/.test(m)));
  await h.fails(B.ids[1], 'respondBiat', { biatId, accept: true }); // Kıdemli karar veremez
  await h.act(B.ids[0], 'respondBiat', { biatId, accept: true }); // Sağ Kol kabul edebilir
  assert.equal(h.get(`alliances/${biatId}`).status, 'accepted');
  assert.equal(h.get(`gangs/${A.gangId}`).biat, undefined, 'işaret 00:00\'da yazılır');
  assert.match((await h.fails(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 })).message, /Biat/);

  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.get(`alliances/${biatId}`).status, 'active');
  assert.equal(h.get(`gangs/${A.gangId}`).biat.gangId, B.gangId);
  assert.equal(h.get(`gangs/${A.gangId}`).biat.name, 'Beta');
  assert.equal(h.get(`gangs/${B.gangId}`).vassals[A.gangId].name, 'Alfa');
  await h.fundKasa(B.gangId, 0);
  assert.match((await h.fails(B.baba, 'offerBet', { targetGangId: A.gangId, stake: 10_000 })).message, /Biat/);

  // zincir yok: biat etmiş çeteye biat edilemez; kendisine biat edilen başkasına biat edemez
  assert.match((await h.fails(C.baba, 'requestBiat', { targetGangId: A.gangId })).message, /başka bir çeteye biat etmiş/);
  assert.match((await h.fails(B.baba, 'requestBiat', { targetGangId: C.gangId })).message, /Size biat eden/);
  assert.match((await h.fails(A.baba, 'requestBiat', { targetGangId: C.gangId })).message, /Zaten bir çeteye biat/);
  // v85.1: biat varken ittifak da kurulabilir (bağımsız, ayrı belge)
  const { allianceId: abAl } = await h.act(A.baba, 'requestAlliance', { targetGangId: B.gangId });
  assert.notEqual(abAl, biatId);
  assert.equal(h.get(`alliances/${biatId}`).kind, 'biat', 'biat belgesi bozulmaz');
  await h.act(B.baba, 'respondAlliance', { allianceId: abAl, accept: false });
  // başkası (C) biat edilen çeteye (B) biat edebilir
  const c = await h.act(C.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondBiat', { biatId: c.biatId, accept: false });
  assert.equal(h.get(`alliances/${c.biatId}`).status, 'declined');
});

test('biat: Pazar savaşında biat eden çete biat ettiği çete adına savaşır; katkı herkese görünür; yolu biat edilen alır', async () => {
  const h = await createHarness({ dice: [5, 5, 3, 3, 6, 6] });
  const A = await setupGang(h, { members: 1, name: 'Alfa' }); // biat eden
  const B = await setupGang(h, { members: 0, name: 'Beta' }); // biat edilen
  const C = await setupGang(h, { members: 0, name: 'Gama' }); // rakip
  for (const id of [A.baba, A.ids[0], B.baba, C.baba]) await h.setPersona(id, { power: 100_000 });
  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondBiat', { biatId, accept: true });
  await h.tickTo('2026-09-27', '00:10');
  const warId = 'trade_2026-09-27';
  const r1 = await h.act(A.baba, 'rollDice', { warId }); // 10 × 100k = 1M → Beta hanesine
  assert.equal(r1.sideKey, B.gangId);
  assert.equal(r1.forGangName, 'Beta');
  await h.act(B.baba, 'rollDice', { warId }); // 6 × 100k = 600k
  await h.act(C.baba, 'rollDice', { warId }); // 12 × 100k = 1.2M
  h.at('2026-09-27', '03:00');
  await h.act(A.ids[0], 'rollDice', { warId }); // rastgele zar
  const war = h.get(`wars/${warId}`);
  assert.equal(war.sides[A.gangId], undefined, 'biat eden çetenin kendi hanesi yok');
  assert.equal(war.sides[B.gangId].name, 'Beta', 'taraf adı biat edilen çete');
  assert.ok(war.biatDisplay[A.gangId] >= 1_000_000 + 200_000);
  assert.equal(war.biatSides[A.gangId].overlordId, B.gangId);
  assert.equal(war.display[B.gangId], 600_000 + war.biatDisplay[A.gangId], 'biat edenin gücü biat edilene eklenir');
  const roll = h.get(`wars/${warId}/rolls/${A.baba}_2026-09-27_w0`);
  assert.equal(roll.viaGangId, A.gangId);
  // izleme: biat katkısı herkese açık
  const watcher = await h.persona({ displayName: 'İzleyici', gold: 1, power: 1, reputation: 1 });
  const watch = await h.act(watcher, 'watchWars');
  const tw = watch.wars.find((w) => w.type === 'trade');
  assert.equal(tw.biat[0].name, 'Alfa');
  assert.equal(tw.biat[0].forName, 'Beta');

  const totalB = war.display[B.gangId];
  await h.tickTo('2026-09-28', '00:05');
  const route = h.get('routes/yasakliMadde');
  assert.equal(route.holderId, B.gangId, 'biat sayesinde Beta kazandı (Gama 1.2M)');
  assert.equal(route.powerUsed, totalB);
  assert.deepEqual(h.get(`gangs/${A.gangId}`).routeProducts, [], 'biat eden yol almaz');
  assert.equal(h.get(`wars/${warId}`).result.biatTotals[A.gangId], war.biatDisplay[A.gangId]);
  assert.equal(h.get(`gangs/${A.gangId}`).lastSundayPower, war.biatDisplay[A.gangId]);
  assert.equal(h.get(`gangs/${A.gangId}`).lastSundayBiat, true);
  assert.equal(h.get(`gangs/${B.gangId}`).lastSundayPower, totalB);
  const logA = Object.values(h.db._dump(`gangWorlds/test/gangs/${A.gangId}/log/`)).map((x) => x.text);
  assert.ok(logA.some((t) => /Beta adına .* hasar verdiniz — Yasaklı Madde yolunu kazandılar/.test(t)));
});

test('biat: bahisli savaşa katkı yok; biat edilenin tırını savunabilir; bozulunca 00:00 biter ve kendi adına savaşır', async () => {
  const h = await createHarness({ dice: [3, 3, 4, 4, 5, 5, 6, 6] });
  const A = await setupRankedGang(h, 'Alfa'); // biat eden
  const B = await setupRankedGang(h, 'Beta'); // biat edilen (tır sahibi)
  const C = await setupRankedGang(h, 'Gama'); // saldıran
  await h.giveDepot(C.gangId, 1000);
  await h.giveDepot(B.gangId, 1000);
  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondBiat', { biatId, accept: true });
  await h.tickTo('2026-09-22', '00:05');
  // bahis: Beta ⚔️ Gama — Alfa katılamaz
  const { warId: betId } = await h.act(B.baba, 'offerBet', { targetGangId: C.gangId, stake: 50_000 });
  await h.act(C.baba, 'respondBet', { warId: betId, accept: true });
  h.at('2026-09-22', '03:00');
  assert.match((await h.fails(A.baba, 'rollDice', { warId: betId })).message, /senin çetenin değil/);
  // tır savunması
  await h.giveRoute(B.gangId, 'yasakliMadde', 5_000_000);
  h.at('2026-09-22', '05:30');
  const { truckId } = await h.act(B.baba, 'buyTruck');
  await h.act(B.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 20 } });
  await h.tickTo('2026-09-22', '09:00');
  assert.match((await h.fails(A.baba, 'startSabotage', { truckId })).message, /Biat/, 'biat edilene saldırılamaz');
  const { warId: sab } = await h.act(C.baba, 'startSabotage', { truckId });
  await h.tickTo('2026-09-22', '15:00');
  const defId = `def_${truckId}_2026-09-22`;
  assert.ok(h.get(`wars/${defId}`).gangIds.includes(A.gangId), 'biat eden saldırıyı görür');
  await h.act(C.baba, 'rollDice', { warId: sab });
  await h.act(A.baba, 'rollDice', { warId: defId, side: 'defense' });
  assert.ok(h.get(`wars/${defId}`).display[A.gangId] > 0, 'biat eden savunmaya güç ekledi');

  // v85.1: biatı bozma — biat eden tarafta da Sağ Kol bozabilir; Kıdemli bozamaz
  assert.match((await h.fails(A.ids[1], 'endBiat', { biatId })).message, /Mafya Babası ve Sağ Kol/);
  await h.fails(A.baba, 'endAlliance', { allianceId: biatId });
  await h.act(A.ids[0], 'endBiat', { biatId });
  assert.equal(h.get(`alliances/${biatId}`).status, 'ending');
  assert.equal(h.get(`gangs/${A.gangId}`).biat.gangId, B.gangId, 'gece yarısına kadar sürer');
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`alliances/${biatId}`).status, 'ended');
  assert.equal(h.get(`gangs/${A.gangId}`).biat, undefined);
  assert.equal(h.get(`gangs/${B.gangId}`).vassals?.[A.gangId], undefined);
  await h.tickTo('2026-09-27', '00:10');
  const r = await h.act(A.baba, 'rollDice', { warId: 'trade_2026-09-27' });
  assert.equal(r.sideKey, A.gangId, 'biat bitince kendi adına savaşır');
});

test('v86: Pazar günü kabul edilen biat o günün savaşında sayılır — biat edenin gücü biat edilene katılır, yolu biat edilen alır; biat edilen dağılırsa işaret kalkar', async () => {
  const h = await createHarness({ dice: [6, 6, 1, 1] });
  const A = await setupRankedGang(h, 'Alfa');
  const B = await setupRankedGang(h, 'Beta');
  await h.setPersona(A.baba, { power: 100_000 });
  await h.setPersona(B.baba, { power: 100_000 });
  await h.tickTo('2026-09-27', '00:10');
  const warId = 'trade_2026-09-27';
  await h.act(A.baba, 'rollDice', { warId }); // biat henüz yok → kendi adına (1.2M)
  await h.act(B.baba, 'rollDice', { warId });
  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondBiat', { biatId, accept: true });
  // ekran: A'nın ayrı hanesi yok, gücü B'nin toplamında; biat bölümü için bağ yazıldı
  const live = h.get(`wars/${warId}`);
  assert.equal(live.display[A.gangId], undefined, 'biat eden ayrı sırada görünmez');
  assert.equal(live.display[B.gangId], 1_200_000 + 200_000);
  assert.equal(live.biatDisplay[A.gangId], 1_200_000);
  assert.equal(live.biatLinks[A.gangId].overlordId, B.gangId);
  await h.tickTo('2026-09-28', '00:05');
  const done = h.get(`wars/${warId}`);
  assert.equal(done.result.winnerKey, B.gangId, 'birleşik güçle biat edilen kazanır');
  assert.deepEqual(h.get(`gangs/${B.gangId}`).routeProducts, ['yasakliMadde']);
  assert.deepEqual(h.get(`gangs/${A.gangId}`).routeProducts || [], []);
  assert.equal(h.get(`alliances/${biatId}`).status, 'active', 'yolu olmadığı için biat başlar');
  assert.equal(h.get(`gangs/${A.gangId}`).biat.gangId, B.gangId);
  assert.equal(h.get(`gangs/${A.gangId}`).lastSundayBiat, true);
  // temizlik: sonraki senaryo için biatı bitir
  await h.act(A.baba, 'endBiat', { biatId });
  await h.tickTo('2026-09-28', '23:59');

  // dağılma: C → B biatı aktifken B dağılır
  const C = await setupRankedGang(h, 'Gama');
  const c = await h.act(C.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondBiat', { biatId: c.biatId, accept: true });
  await h.tickTo('2026-09-29', '00:05');
  assert.equal(h.get(`gangs/${C.gangId}`).biat.gangId, B.gangId);
  await h.db.doc(`gangWorlds/test/gangs/${B.gangId}`).update({ status: 'disbanded', cleanupDone: false });
  await h.tickTo('2026-09-29', '00:15');
  assert.equal(h.get(`alliances/${c.biatId}`).status, 'ended');
  assert.equal(h.get(`gangs/${C.gangId}`).biat, undefined);
  void ist;
});

test('v85: ittifak biata engel değil — müttefik çete biat eder; ikisi ayrı yaşar; biat bitince ittifak sürer', async () => {
  const h = await createHarness();
  const A = await setupRankedGang(h, 'Alfa');
  const B = await setupRankedGang(h, 'Beta');

  const { allianceId } = await h.act(A.baba, 'requestAlliance', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondAlliance', { allianceId, accept: true });
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'active');

  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  assert.notEqual(biatId, allianceId, 'biat ayrı belgede');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'active', 'ittifak bozulmaz');
  assert.match((await h.fails(A.baba, 'requestBiat', { targetGangId: B.gangId })).message, /bekleyen|biat süreci/);
  await h.act(B.baba, 'respondBiat', { biatId, accept: true });
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`alliances/${biatId}`).status, 'active');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'active');
  assert.equal(h.get(`gangs/${A.gangId}`).biat.gangId, B.gangId);

  await h.act(A.baba, 'endBiat', { biatId });
  await h.tickTo('2026-09-24', '00:05');
  assert.equal(h.get(`alliances/${biatId}`).status, 'ended');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'active', 'biat bitince ittifak devam eder');
  assert.equal(h.get(`gangs/${A.gangId}`).biat, undefined);
});

test('v85.1: biat ve ittifak bağımsız — önce biat sonra ittifak; sadece ittifak ya da sadece biat bozulabilir; Sağ Kol bozar', async () => {
  const h = await createHarness();
  const A = await setupRankedGang(h, 'Alfa');
  const B = await setupRankedGang(h, 'Beta');

  // ittifak yokken biat
  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.ids[0], 'respondBiat', { biatId, accept: true });
  // biat sürecindeyken ittifak (Sağ Kol teklif eder)
  const { allianceId } = await h.act(A.ids[0], 'requestAlliance', { targetGangId: B.gangId });
  await h.act(B.ids[3], 'respondAlliance', { allianceId, accept: true });
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.get(`alliances/${biatId}`).status, 'active');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'active');

  // sadece ittifakı boz → biat sürer
  await h.act(B.ids[0], 'endAlliance', { allianceId });
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`alliances/${allianceId}`).status, 'ended');
  assert.equal(h.get(`alliances/${biatId}`).status, 'active');
  assert.equal(h.get(`gangs/${A.gangId}`).biat.gangId, B.gangId);
  assert.match((await h.fails(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 })).message, /Biat/, 'biat korur');

  // yeniden ittifak, sonra ikisini birden boz (biat edilen tarafın Sağ Kolu biatı bozar)
  const r2 = await h.act(B.baba, 'requestAlliance', { targetGangId: A.gangId });
  await h.act(A.ids[3], 'respondAlliance', { allianceId: r2.allianceId, accept: true });
  await h.tickTo('2026-09-24', '00:05');
  await h.act(B.ids[3], 'endBiat', { biatId });
  await h.act(A.baba, 'endAlliance', { allianceId: r2.allianceId });
  await h.tickTo('2026-09-25', '00:05');
  assert.equal(h.get(`alliances/${biatId}`).status, 'ended');
  assert.equal(h.get(`alliances/${r2.allianceId}`).status, 'ended');
  assert.equal(h.get(`gangs/${A.gangId}`).biat, undefined);
});

test('v85.1: v84\'ten kalma (çift anahtarındaki) biat, ittifak kurulunca kendi belgesine taşınır', async () => {
  const h = await createHarness();
  const A = await setupRankedGang(h, 'Alfa');
  const B = await setupRankedGang(h, 'Beta');
  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondBiat', { biatId, accept: true });
  await h.tickTo('2026-09-22', '00:05');
  // eski düzeni taklit et: biat çift anahtarında
  const pk = [A.gangId, B.gangId].sort().join('__');
  const legacy = h.get(`alliances/${biatId}`);
  await h.db.doc(`gangWorlds/test/alliances/${pk}`).set(legacy);
  await h.db.doc(`gangWorlds/test/alliances/${biatId}`).delete();

  const { allianceId } = await h.act(A.baba, 'requestAlliance', { targetGangId: B.gangId });
  assert.equal(allianceId, pk);
  assert.notEqual(h.get(`alliances/${pk}`).kind, 'biat');
  assert.equal(h.get(`alliances/${biatId}`).kind, 'biat', 'biat yeni anahtara taşındı');
  assert.equal(h.get(`alliances/${biatId}`).status, 'active');
  assert.match((await h.fails(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 10_000 })).message, /Biat/);
  await h.act(A.ids[0], 'endBiat', { biatId });
  assert.equal(h.get(`alliances/${biatId}`).status, 'ending');
  assert.equal(h.get(`alliances/${pk}`).status, 'requested', 'ittifak teklifi etkilenmez');
});

test('v86.1: Pazar günü kabul edilen biatta biat edenin sonraki zarları doğrudan biat edilene yazılır; saat turu bağları yeniler', async () => {
  const h = await createHarness({ dice: [3, 3, 3, 3, 3, 3] });
  const A = await setupRankedGang(h, 'Alfa');
  const B = await setupRankedGang(h, 'Beta');
  await h.setPersona(A.baba, { power: 1000 });
  await h.tickTo('2026-09-27', '00:10');
  const warId = 'trade_2026-09-27';
  const r1 = await h.act(A.baba, 'rollDice', { warId });
  assert.equal(r1.sideKey, A.gangId, 'biat yokken kendi adına');
  const { biatId } = await h.act(A.baba, 'requestBiat', { targetGangId: B.gangId });
  await h.act(B.baba, 'respondBiat', { biatId, accept: true });
  assert.equal(h.get(`alliances/${biatId}`).status, 'accepted');
  await h.tickTo('2026-09-27', '03:10'); // sonraki 3 saatlik dilim
  const r2 = await h.act(A.baba, 'rollDice', { warId });
  assert.equal(r2.sideKey, B.gangId, 'kabul edilmiş biat: Beta adına');
  assert.equal(r2.forGangId, B.gangId);
  const w = h.get(`wars/${warId}`);
  assert.equal(w.display[A.gangId], undefined);
  assert.equal(w.display[B.gangId], 12_000);
  assert.equal(w.biatDisplay[A.gangId], 12_000);
  // bağ silinse bile saat turu yeniden yazar
  await h.db.doc(`gangWorlds/test/wars/${warId}`).update({ biatLinks: {} });
  await h.tickTo('2026-09-27', '03:20');
  assert.equal(h.get(`wars/${warId}`).biatLinks[A.gangId].overlordId, B.gangId);
});
