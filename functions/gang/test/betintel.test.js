// v33: bahisli savaşa İstihbarat müdahalesi (ihbar → içerik → 100k operasyon → 3 taraf)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

async function setup(h, dice) {
  const A = await setupGang(h, { members: 2, name: 'Alfa' });
  const B = await setupGang(h, { members: 1, name: 'Beta' });
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  // A'nın 2 üyesi İstihbaratta: ids[0] Kıdemli (açar), ids[1] Tetikçi (ihbar)
  await h.setPrestige(A.gangId, A.ids[0], 3_000_000);
  await h.setPrestige(A.gangId, A.ids[1], 1_000_000);
  await h.recomputeRanks(A.gangId);
  await h.setRank(A.gangId, A.ids[0], 'kidemli');
  await h.setRank(A.gangId, A.ids[1], 'tetikci');
  const mkIntel = async (id, code, rank, prestige) => {
    await h.setPersona(id, { reputation: 80 });
    const r = await h.act(id, 'joinIntel', { codeName: code });
    await h.db.doc(`gangWorlds/test/intelRoster/${r.rosterId}`).update({ rank, prestige });
    await h.db.doc(`gangWorlds/test/memberships/${id}`).set({ intelRank: rank }, { merge: true });
    return r.rosterId;
  };
  const kid = await mkIntel(A.ids[0], 'Kidem', 'ajan', 0);
  const tet = await mkIntel(A.ids[1], 'Tetik', 'muhbir', 0);
  const bas = await h.persona({ displayName: 'Baskan', gold: 1, power: 40_000, reputation: 90 });
  const basR = await mkIntel(bas, 'Başkan', 'baskan', 5_000_000);
  const outsider = await h.persona({ displayName: 'Dis', gold: 1, power: 1000, reputation: 90 });
  await mkIntel(outsider, 'Dışarı', 'sef', 2_000_000);
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 150_000 }, { merge: true });
  const { warId } = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 200_000 });
  return { A, B, kid, tet, bas, basR, outsider, warId };
}

test('bahis ihbarı: sadece kabul edilmiş bahis, iki çeteden birinde Tetikçi+; tutar görünmez; içerik Kıdemli+ → havuz görünür', async () => {
  const h = await createHarness();
  const S = await setup(h);
  // teklif aşamasında ihbar yok
  await h.fails(S.A.ids[1], 'reportBet', { warId: S.warId });
  await h.act(S.B.baba, 'respondBet', { warId: S.warId, accept: true });
  await h.fails(S.outsider, 'reportBet', { warId: S.warId }); // bahisli çetelerde değil
  await h.fails(S.A.ids[1], 'leakBet', { warId: S.warId }); // önce ihbar
  const r = await h.act(S.A.ids[1], 'reportBet', { warId: S.warId }); // Tetikçi
  assert.equal(r.prestige, 1_000_000);
  await h.fails(S.A.ids[0], 'reportBet', { warId: S.warId }); // ikinci ihbar yok
  const rep = h.get(`betReports/${S.warId}`);
  assert.equal(rep.pot, null, 'tutar görünmez');
  assert.equal(rep.leaked, false);
  await h.fails(S.A.ids[1], 'leakBet', { warId: S.warId }); // Tetikçi açamaz
  await h.act(S.A.ids[0], 'leakBet', { warId: S.warId }); // Kıdemli açar
  assert.equal(h.get(`betReports/${S.warId}`).pot, 400_000);
  assert.ok(h.intelChat().some((m) => /bahisli savaşını ihbar etti/.test(m)));
});

test('operasyon: Başkan/Şef, 100k, 00:00 öncesi; savaş 3 taraflı başlar; İstihbarat en güçlüyse tüm bahsi alır', async () => {
  const h = await createHarness({ dice: [6, 6, 1, 1, 1, 1] });
  const S = await setup(h);
  await h.act(S.B.baba, 'respondBet', { warId: S.warId, accept: true });
  await h.act(S.A.ids[1], 'reportBet', { warId: S.warId });
  await h.fails(S.A.ids[1], 'startBetOperation', { warId: S.warId }); // Muhbir başlatamaz
  await h.act(S.bas, 'startBetOperation', { warId: S.warId }); // tutar görülmeden de olur
  await h.fails(S.outsider, 'startBetOperation', { warId: S.warId }); // ikinci operasyon yok
  assert.equal(h.get('intel/main/private/state').kasa, 50_000);
  // çeteler 00:00'a kadar görmez
  assert.equal(h.get(`wars/${S.warId}`).sides.intel, undefined);
  await h.tickTo('2026-09-22', '00:05');
  const w = h.get(`wars/${S.warId}`);
  assert.equal(w.status, 'active');
  assert.ok(w.sides.intel, '3. taraf');
  assert.ok(h.chat(S.A.gangId).some((m) => /İstihbarat .* dahil oldu/.test(m)));
  // 00:00 sonrası müdahale yok
  await h.fails(S.A.ids[0], 'leakBet', { warId: S.warId });
  // İstihbarat 12 × 40k = 480k; A: 2 × 60k; B: 2 × 60k
  await h.act(S.bas, 'rollDice', { warId: S.warId, side: 'intel' });
  await h.act(S.A.baba, 'rollDice', { warId: S.warId });
  await h.act(S.B.baba, 'rollDice', { warId: S.warId });
  const presBefore = h.get(`intelRoster/${S.basR}`).prestige;
  assert.equal(presBefore, 5_000_000 + 480_000, 'İstihbarat savaş gücü = prestij');
  const kA = h.state(S.A.gangId).kasa;
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`wars/${S.warId}`).result.winner, 'intel');
  assert.equal(h.get('intel/main/private/state').kasa, 50_000 + 400_000);
  assert.equal(h.state(S.A.gangId).kasa, kA, 'çetelere bir şey dönmez');
});

test('İstihbarat müdahalesinde de en güçlü çete kazanırsa tüm bahsi alır; 00:00 geçtiyse operasyon başlatılamaz', async () => {
  const h = await createHarness({ dice: [1, 1, 6, 6, 1, 1] });
  const S = await setup(h);
  await h.act(S.B.baba, 'respondBet', { warId: S.warId, accept: true });
  await h.act(S.A.ids[1], 'reportBet', { warId: S.warId });
  await h.act(S.bas, 'startBetOperation', { warId: S.warId });
  await h.tickTo('2026-09-22', '00:05');
  await h.fails(S.outsider, 'startBetOperation', { warId: S.warId });
  await h.act(S.bas, 'rollDice', { warId: S.warId, side: 'intel' }); // 2 × 40k
  await h.act(S.A.baba, 'rollDice', { warId: S.warId }); // 12 × 60k
  await h.act(S.B.baba, 'rollDice', { warId: S.warId }); // 2 × 60k
  const kA = h.state(S.A.gangId).kasa;
  await h.tickTo('2026-09-23', '00:05');
  assert.equal(h.get(`wars/${S.warId}`).result.winner, S.A.gangId);
  assert.equal(h.state(S.A.gangId).kasa, kA + 400_000);
});

test('bahis başlayamazsa (çete dağıldı) operasyon ücreti İstihbarata iade edilir', async () => {
  const h = await createHarness();
  const S = await setup(h);
  await h.act(S.B.baba, 'respondBet', { warId: S.warId, accept: true });
  await h.act(S.A.ids[1], 'reportBet', { warId: S.warId });
  await h.act(S.bas, 'startBetOperation', { warId: S.warId });
  await h.act(S.B.ids[0], 'leaveGang');
  await h.act(S.B.baba, 'leaveGang'); // Beta dağıldı
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.get(`wars/${S.warId}`).status, 'cancelled');
  assert.equal(h.get('intel/main/private/state').kasa, 150_000);
});
