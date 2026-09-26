import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

async function tradeGangWithMole(h, { moleRank = 'kidemli' } = {}) {
  const G = await setupGang(h, { members: 3, name: 'Hedef' });
  const mole = G.ids[1];
  await h.setPersona(mole, { reputation: 60 });
  await h.setPrestige(G.gangId, G.ids[0], 5_000_000);
  await h.setPrestige(G.gangId, G.ids[2], 4_000_000);
  await h.setPrestige(G.gangId, mole, moleRank === 'kidemli' ? 2_000_000 : moleRank === 'comez' ? 0 : 1_000_000);
  await h.recomputeRanks(G.gangId);
  await h.fundKasa(G.gangId, 5_000_000);
  await h.giveRoute(G.gangId, 'yasakliMadde', 1_000_000);
  await h.giveDepot(G.gangId, 1000);
  const { truckId, code } = await h.act(G.baba, 'buyTruck');
  await h.act(G.baba, 'placeOrder', { truckId, product: 'yasakliMadde', items: { yasakliMadde: 80 } });
  return { G, mole, truckId, code };
}

async function intelChief(h, name = 'Şef') {
  const id = await h.persona({ displayName: name, gold: 10, power: 30_000, reputation: 90 });
  const r = await h.act(id, 'joinIntel', { codeName: name });
  await h.db.doc(`gangWorlds/test/intelRoster/${r.rosterId}`).update({ rank: 'baskan', prestige: 5_000_000 });
  await h.db.doc(`gangWorlds/test/memberships/${id}`).set({ intelRank: 'baskan' }, { merge: true });
  return id;
}

test('katılım: 50 saygınlık yeter (polislik şartı yok); kod adı benzersiz; Baba katılamaz', async () => {
  const h = await createHarness();
  const low = await h.persona({ displayName: 'Düşük', gold: 1, power: 1, reputation: 49 });
  const civ = await h.persona({ displayName: 'Sivil', gold: 1, power: 1, reputation: 50, isPolice: false });
  const cop = await h.persona({ displayName: 'Polis', gold: 1, power: 1, reputation: 80, isPolice: true });
  assert.match((await h.fails(low, 'joinIntel', { codeName: 'Kurt' })).message, /50/);
  await h.act(civ, 'joinIntel', { codeName: 'Kurt' });
  assert.match((await h.fails(cop, 'joinIntel', { codeName: 'kurt' })).message, /kod adı/i);
  await h.act(cop, 'joinIntel', { codeName: 'Tilki' });
  const G = await setupGang(h, { members: 0 });
  assert.match((await h.fails(G.baba, 'joinIntel', { codeName: 'Baba' })).message, /Mafya Babası/);
  // roster UID içermez; sohbet kod adı kullanır
  const roster = h.db._dump('gangWorlds/test/intelRoster/');
  assert.ok(!JSON.stringify(roster).includes(civ));
  const chat = Object.values(h.db._dump('gangWorlds/test/intelChat_genel/'));
  assert.ok(chat.some((m) => m.text.includes('Kurt İstihbarata katıldı')));
  // ayrılınca prestij sıfırlanır, kod adı serbest
  const rid = (await h.membership(civ)).intelRosterId;
  await h.db.doc(`gangWorlds/test/intelRoster/${rid}`).update({ prestige: 999 });
  await h.act(civ, 'leaveIntel');
  await h.act(civ, 'joinIntel', { codeName: 'Kurt' });
  const rid2 = (await h.membership(civ)).intelRosterId;
  assert.notEqual(rid, rid2);
  assert.equal(h.get(`intelRoster/${rid2}`).prestige, 0);
  // kod adı sonradan değiştirilebilir (benzersiz)
  await h.fails(civ, 'changeCodeName', { codeName: 'tilki' });
  await h.act(civ, 'changeCodeName', { codeName: 'Gölge' });
  assert.equal(h.get(`intelRoster/${rid2}`).codeName, 'Gölge');
  assert.equal((await h.membership(civ)).intelCodeName, 'Gölge');
  await h.act(cop, 'changeCodeName', { codeName: 'Kurt' }); // eski ad serbest kaldı
  // İstihbarat sohbeti: 2 kanal (genel + rütbeli)
  await h.fails(civ, 'sendIntelChat', { channel: 'duyuru', text: 'x' });
  await h.fails(civ, 'sendIntelChat', { channel: 'yonetim', text: 'x' }); // Muhbir
  await h.act(civ, 'sendIntelChat', { channel: 'genel', text: 'selam' });
});

test('ihbar: Tetikçi+ ve seferdeki tır; bir kez (1M prestij); sızdırma: Kıdemli+, bir kez (1M); sadece ödül değeri; sohbete düşer', async () => {
  const h = await createHarness();
  const { G, mole, truckId, code } = await tradeGangWithMole(h, { moleRank: 'kidemli' });
  await h.act(mole, 'joinIntel', { codeName: 'Köstebek' });
  // yolda değilken ihbar yok
  assert.match((await h.fails(mole, 'reportTruck', { truckId })).message, /seferdeki/);
  await h.tickTo('2026-09-22', '08:00');
  const rs = await Promise.allSettled([h.act(mole, 'reportTruck', { truckId }), h.act(mole, 'reportTruck', { truckId })]);
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  const reportId = `${truckId}_2026-09-22`;
  const rep = h.get(`intelReports/${reportId}`);
  assert.equal(rep.truckCode, code);
  assert.equal(rep.leaked, false);
  const leak = await Promise.allSettled([h.act(mole, 'leakTruck', { reportId }), h.act(mole, 'leakTruck', { reportId })]);
  assert.equal(leak.filter((r) => r.status === 'fulfilled').length, 1);
  const rep2 = h.get(`intelReports/${reportId}`);
  assert.equal(rep2.cargo, undefined, 'içerik adetleri İstihbarata gösterilmez');
  assert.equal(rep2.estReward, 100_000); // anlık satış = 1.250 × 80
  const rid = (await h.membership(mole)).intelRosterId;
  assert.equal(h.get(`intelRoster/${rid}`).prestige, 1_000_000 + 1_000_000);
  assert.ok(h.intelChat().some((m) => /Köstebek, TIR #\d{4} \(Hedef\) tırını ihbar etti/.test(m)));
  assert.ok(h.intelChat().some((m) => /içeriğini sızdırdı — ödül değeri 100\.000/.test(m)));
  assert.ok(G);
});

test('ihbar/sızdırma yetkisi: Çömez ihbar edemez; Tetikçi ihbar eder ama sızdıramaz', async () => {
  const h = await createHarness();
  const { G, truckId } = await tradeGangWithMole(h, { moleRank: 'comez' });
  const c = G.ids[1];
  await h.act(c, 'joinIntel', { codeName: 'Çırak' });
  await h.tickTo('2026-09-22', '08:00');
  assert.match((await h.fails(c, 'reportTruck', { truckId })).message, /Tetikçi/);
  await h.setPrestige(G.gangId, c, 1_000_000);
  for (let i = 0; i < 5; i++) {
    const x = await h.persona({ displayName: `Dolgu${i}`, gold: 1, power: 1, reputation: 1 });
    await h.act(x, 'joinGang', { gangId: G.gangId });
    await h.setPrestige(G.gangId, x, 3_000_000 - i);
  }
  await h.recomputeRanks(G.gangId);
  assert.equal(h.member(G.gangId, c).rank, 'tetikci');
  await h.act(c, 'reportTruck', { truckId });
  assert.match((await h.fails(c, 'leakTruck', { reportId: `${truckId}_2026-09-22` })).message, /Kıdemli/);
});

test('operasyon: sadece ihbarlı tıra, 12:00ye kadar, ücret oyun geneli sabotaj fiyatı; başarılıysa yük imha + anlık değer ödülü', async () => {
  const h = await createHarness({ dice: [6, 6, 1, 1] });
  const { G, mole, truckId } = await tradeGangWithMole(h);
  await h.act(mole, 'joinIntel', { codeName: 'Köstebek' });
  const chief = await intelChief(h, 'Kartal');
  await h.tickTo('2026-09-22', '07:00');
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 100_000 }, { merge: true });
  const reportId = `${truckId}_2026-09-22`;
  assert.match((await h.fails(chief, 'startOperation', { reportId })).message, /bulunamadı/);
  await h.act(mole, 'reportTruck', { truckId });
  await h.fails(mole, 'startOperation', { reportId }); // Muhbir başlatamaz
  const op = await h.act(chief, 'startOperation', { reportId, bribe: 0 });
  assert.equal(op.started[0].price, 10_000);
  assert.equal(h.get('intel/main/private/state').kasa, 90_000);
  assert.equal(h.get('sabotageDays/2026-09-22').count, 1, 'operasyon oyun geneli sayacı artırır');
  await h.fails(chief, 'startOperation', { reportId });
  const warId = op.started[0].warId;
  await h.tickTo('2026-09-22', '12:10');
  await h.act(chief, 'rollDice', { warId }); // 12 × 30k = 360k
  await h.act(G.baba, 'rollDice', { warId: `def_${truckId}_2026-09-22` }); // 2 × 60k = 120k
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`trucks/${truckId}`).lastTrip.outcome, 'destroyed');
  assert.equal(h.get(`trucks/${truckId}`).gangId, G.gangId);
  const depot = h.get(`gangs/${G.gangId}/private/depot`);
  assert.equal(depot.items?.yasakliMadde || 0, 0, 'ürün kimseye geçmez');
  assert.equal(depot.reservedUnits, 0);
  assert.equal(h.get('intel/main/private/state').kasa, 90_000 + 100_000);
});

test('rüşvet: tutarı İstihbarat operasyonda belirler; savunan 12:00 duyurusundan sonra 18:00e kadar öder → operasyon durur, para İstihbarata', async () => {
  const h = await createHarness();
  const { G, mole, truckId } = await tradeGangWithMole(h);
  await h.act(mole, 'joinIntel', { codeName: 'Köstebek' });
  const chief = await intelChief(h, 'Kartal');
  await h.tickTo('2026-09-22', '07:00');
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 100_000 }, { merge: true });
  await h.act(mole, 'reportTruck', { truckId });
  const op = await h.act(chief, 'startOperation', { reportId: `${truckId}_2026-09-22`, bribe: 75_000 });
  const warId = op.started[0].warId;
  assert.equal(h.get(`wars/${warId}`).bribe, 75_000);
  await h.fails(G.baba, 'payBribe', { warId }); // henüz duyurulmadı
  await h.tickTo('2026-09-22', '12:05');
  assert.ok(h.chat(G.gangId).some((m) => /İstihbarat \(rüşvet 75\.000\)/.test(m)));
  const kasa = h.state(G.gangId).kasa;
  await h.fails(mole, 'payBribe', { warId }); // Kıdemli ödeyemez
  const rs = await Promise.allSettled([h.act(G.baba, 'payBribe', { warId }), h.act(G.ids[0], 'payBribe', { warId })]);
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1, 'çift ödeme yok');
  assert.equal(h.get(`wars/${warId}`).status, 'cancelled_bribe');
  assert.equal(h.state(G.gangId).kasa, kasa - 75_000);
  assert.equal(h.get('intel/main/private/state').kasa, 90_000 + 75_000);
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`trucks/${truckId}`).lastTrip.outcome, 'delivered');
});

test('çeteyi İstihbarata teslim et → çete kapanır, üyeler atılır, TÜM kasa İstihbarat kasasına; karar yoksa 00:00da İstihbarattan çıkar', async () => {
  const h = await createHarness();
  const G = await setupGang(h, { members: 3, name: 'Kurban' });
  await h.fundKasa(G.gangId, 300_000);
  const spy = G.ids[0];
  await h.act(spy, 'joinIntel', { codeName: 'Truva' });
  await h.setPrestige(G.gangId, spy, 50_000_000);
  await h.act(G.baba, 'leaveGang'); // v41: halef 00:00'da → en yüksek prestij → casus
  await h.nextDay();
  const ms = await h.membership(spy);
  assert.equal(ms.intelDecisionGangId, G.gangId);
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, spy);
  const intel0 = h.get('intel/main/private/state').kasa || 0;
  await h.act(spy, 'intelDecision', { choice: 'disband' });
  await h.internal.clock.runClock('test');
  const g = h.get(`gangs/${G.gangId}`);
  assert.equal(g.status, 'disbanded');
  assert.equal(g.cleanupDone, true);
  for (const id of G.ids) assert.equal(h.gangOf(id), null);
  assert.equal(h.state(G.gangId).kasa, 0);
  assert.equal(h.get('intel/main/private/state').kasa, intel0 + 300_000, 'çetenin tüm parası İstihbarat kasasına');
  const msgs = Object.values(h.db._dump('gangWorlds/test/inbox/')).filter((m) => m.to === G.ids[1]);
  assert.ok(msgs.some((m) => m.text.includes('İstihbarat tarafından ele geçirildi ve dağıtıldı')));
  const rid = (await h.membership(spy)).intelRosterId;
  assert.equal(h.get(`intelRoster/${rid}`).prestige, 10_000_000);

  // ikinci senaryo: karar vermezse 00:00'da İstihbarattan sessizce çıkar (Baba kalır)
  const H = await setupGang(h, { members: 2, name: 'İkinci' });
  const spy2 = H.ids[0];
  await h.act(spy2, 'joinIntel', { codeName: 'Sessiz' });
  await h.setPrestige(H.gangId, spy2, 50_000_000);
  await h.act(H.baba, 'leaveGang');
  await h.nextDay(); // v41: 00:00'da casus Baba olur, karar süresi başlar
  const intelCount = h.get('intel/main').memberCount;
  await h.nextDay();
  const ms2 = await h.membership(spy2);
  assert.equal(ms2.intelRosterId, null);
  assert.equal(ms2.gangRank, 'baba');
  assert.equal(h.get('intel/main').memberCount, intelCount - 1);
  const intelChat = Object.values(h.db._dump('gangWorlds/test/intelChat_genel/'));
  assert.ok(!intelChat.some((m) => /ayrıldı/.test(m.text)), 'İstihbarata "ayrıldı" bildirimi yok');
});

test('İstihbarat atma: Başkan → Ajan/Muhbir, Şef → Muhbir anında; oylama: Başkan için >%66, diğerleri %51; başarısızda değişiklik yok', async () => {
  const h = await createHarness();
  const mk = async (name, prestige, rank) => {
    const id = await h.persona({ displayName: name, gold: 1, power: 1000, reputation: 60 });
    const r = await h.act(id, 'joinIntel', { codeName: name });
    await h.db.doc(`gangWorlds/test/intelRoster/${r.rosterId}`).update({ rank, prestige });
    await h.db.doc(`gangWorlds/test/memberships/${id}`).set({ intelRank: rank }, { merge: true });
    return { id, rid: r.rosterId };
  };
  const B = await mk('Baskan', 9_000_000, 'baskan');
  const S1 = await mk('Sef1', 8_000_000, 'sef');
  const S2 = await mk('Sef2', 7_500_000, 'sef');
  const U = await mk('Uzman', 7_000_000, 'uzman');
  const A = await mk('Ajan', 2_000_000, 'ajan');
  const M = await mk('Muhbir', 0, 'muhbir');
  const M2 = await mk('Muhbir2', 0, 'muhbir');
  await h.fails(S1.id, 'kickIntelMember', { targetRosterId: A.rid }); // Şef Ajanı atamaz
  await h.act(S1.id, 'kickIntelMember', { targetRosterId: M.rid });
  await h.act(B.id, 'kickIntelMember', { targetRosterId: A.rid });
  assert.equal(h.get(`intelRoster/${A.rid}`), undefined);
  assert.equal((await h.membership(A.id)).intelRosterId, null);
  assert.ok(h.intelChat().some((m) => /Ajan, Baskan tarafından İstihbarattan çıkarıldı/.test(m)));
  // oylamalar
  await h.fails(U.id, 'requestIntelKickVote', { targetRosterId: B.rid }); // Uzman Başkanı oylatamaz
  await h.fails(M2.id, 'requestIntelKickVote', { targetRosterId: U.rid }); // Muhbir yetkisiz
  await h.fails(B.id, 'requestIntelKickVote', { targetRosterId: M2.rid }); // doğrudan atabileceğini oylatamaz
  await h.act(S1.id, 'requestIntelKickVote', { targetRosterId: B.rid }); // Şef Başkanı oylatabilir
  await h.act(U.id, 'requestIntelKickVote', { targetRosterId: S2.rid });
  await h.fails(S2.id, 'requestIntelKickVote', { targetRosterId: B.rid }); // aynı hedefe ikinci oylama yok
  const votes = Object.entries(h.db._dump('gangWorlds/test/intel/main/votes/'))
    .filter(([p, v]) => !p.includes('/ballots/') && v.status === 'active')
    .map(([p, v]) => ({ id: p.split('/').pop(), ...v }));
  assert.equal(votes.length, 2);
  const vB = votes.find((v) => v.targetRosterId === B.rid);
  const vS = votes.find((v) => v.targetRosterId === S2.rid);
  assert.equal(vB.targetWasBaskan, true);
  await h.fails(M2.id, 'castIntelVote', { voteId: vB.id, choice: 'yes' }); // oy hakkı yok
  await h.act(S1.id, 'castIntelVote', { voteId: vB.id, choice: 'yes' });
  await h.act(S2.id, 'castIntelVote', { voteId: vB.id, choice: 'yes' });
  await h.act(B.id, 'castIntelVote', { voteId: vB.id, choice: 'no' }); // 2-1 = %67 > %66 → geçer
  await h.act(U.id, 'castIntelVote', { voteId: vS.id, choice: 'yes' });
  await h.act(S2.id, 'castIntelVote', { voteId: vS.id, choice: 'no' }); // 1-1 → geçmez
  await h.fails(U.id, 'castIntelVote', { voteId: vS.id, choice: 'no' });
  await h.nextDay();
  assert.equal(h.get(`intelRoster/${B.rid}`), undefined, 'Başkan atıldı');
  assert.ok(h.get(`intelRoster/${S2.rid}`), 'başarısız oylama: değişiklik yok');
  assert.equal(h.get(`intelRoster/${S1.rid}`).rank, 'baskan', 'boşalan yer 00:00da doldu');
});

test('şüpheyle yakalanma cezası → İstihbarat kasasına (canlı dünya, idempotent); canlı kapalıyken etkisiz', async () => {
  const h = await createHarness();
  const closed = await h.system.onSuspicionFine('u1', 40_000, 'heist_a');
  assert.equal(closed.skipped, true);
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const cfg = h.raw('gangSystem/config');
  await h.system.onSuspicionFine('u1', 40_000, 'heist_a_u1');
  await h.system.onSuspicionFine('u1', 40_000, 'heist_a_u1'); // tekrar → yok sayılır
  await h.system.onSuspicionFine('u2', 10_000, 'contraband_b');
  assert.equal(h.raw(`gangWorlds/${cfg.liveWorldId}/intel/main/private/state`).kasa, 50_000);
  assert.equal(h.get('intel/main/private/state').kasa || 0, 0, 'test dünyasına yazılmaz');
});

test('polis yakalama ödülü → İstihbarat prestiji (canlı dünya, idempotent)', async () => {
  const h = await createHarness();
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const cfg = h.raw('gangSystem/config');
  const uid = 'realPlayer01';
  await h.db.doc(`users/${uid}`).set({ displayName: 'Komiser', gold: 0, reputation: 70, profession: 'polis' });
  await h.system.handleAction({ auth: { uid }, data: { action: 'joinIntel', payload: { codeName: 'Rozet' } } });
  await h.system.onPoliceBustReward(uid, 500_000, 'plan123');
  await h.system.onPoliceBustReward(uid, 500_000, 'plan123'); // tekrar → yok sayılır
  const rid = h.raw(`gangWorlds/${cfg.liveWorldId}/memberships/${uid}`).intelRosterId;
  assert.equal(h.raw(`gangWorlds/${cfg.liveWorldId}/intelRoster/${rid}`).prestige, 500_000);
  const res = await h.system.onPoliceBustReward('someoneElse', 100, 'p2');
  assert.equal(res.skipped, true);
});

test('v38: tır ihbarı ve içerik sızdırma sadece yola çıktığı gün 00:00–12:00', async () => {
  const h = await createHarness();
  const { mole, truckId } = await tradeGangWithMole(h, { moleRank: 'kidemli' });
  await h.act(mole, 'joinIntel', { codeName: 'Geçkalan' });
  await h.tickTo('2026-09-22', '12:00');
  assert.match((await h.fails(mole, 'reportTruck', { truckId })).message, /12:00/);
  const h2 = await createHarness();
  const X = await tradeGangWithMole(h2, { moleRank: 'kidemli' });
  await h2.act(X.mole, 'joinIntel', { codeName: 'Erkenci' });
  await h2.tickTo('2026-09-22', '11:59');
  const { reportId } = await h2.act(X.mole, 'reportTruck', { truckId: X.truckId });
  h2.at('2026-09-22', '12:00');
  assert.match((await h2.fails(X.mole, 'leakTruck', { reportId })).message, /12:00/);
});
