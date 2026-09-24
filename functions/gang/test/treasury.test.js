import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

async function rankedGang(h, members = 10) {
  const A = await setupGang(h, { members });
  // 2 Sağ Kol, 4 Kıdemli, 2 Tetikçi, kalanlar Çömez
  const ranks = ['sagkol', 'sagkol', 'kidemli', 'kidemli', 'kidemli', 'kidemli', 'tetikci', 'tetikci'];
  for (let i = 0; i < members; i++) await h.setRank(A.gangId, A.ids[i], ranks[i] || 'comez');
  return A;
}

test('dağıtım: kişi başı tutar × kişi sayısı; rütbeliler sabit 7; diğerleri en az 7; %20 serbest para sınırı', async () => {
  const h = await createHarness();
  const A = await rankedGang(h);
  await h.fundKasa(A.gangId, 100_000); // 00:00 kasası 100k → serbest 20k
  const r1 = await h.act(A.baba, 'createDistribution', { group: 'rutbeli', perPerson: 1000, slots: 99 });
  assert.equal(r1.slots, 7, 'rütbeliler her zaman 7 kişi');
  assert.equal(r1.total, 7000);
  const e1 = await h.fails(A.baba, 'createDistribution', { group: 'hepsi', perPerson: 100, slots: 6 });
  assert.match(e1.message, /En az 7/);
  const r2 = await h.act(A.ids[0], 'createDistribution', { group: 'hepsi', perPerson: 1000, slots: 10 });
  assert.equal(r2.total, 10_000);
  const st = h.state(A.gangId);
  assert.equal(st.kasa, 100_000 - 17_000);
  assert.equal(st.distributableLeft, 3000);
  const e2 = await h.fails(A.baba, 'createDistribution', { group: 'comez', perPerson: 500, slots: 7 }); // 3500 > 3000
  assert.match(e2.message, /serbest para/);
  await h.fails(A.ids[2], 'createDistribution', { group: 'hepsi', perPerson: 100, slots: 7 }); // Kıdemli yapamaz
  assert.ok(h.chat(A.gangId).some((m) => /altın dağıtıyor: Rütbeliler · kişi başı 1\.000 · 7 kişi/.test(m)));
});

test('claim: grup üyesi, bir kez, ilk gelen alır; Baba rütbeliden alır; sohbete kim ne aldı düşer; eşzamanlı çift claim tek ödeme', async () => {
  const h = await createHarness();
  const A = await rankedGang(h);
  await h.fundKasa(A.gangId, 1_000_000);
  const { distributionId } = await h.act(A.baba, 'createDistribution', { group: 'rutbeli', perPerson: 1000 });
  const s = A.ids[0];
  const before = h.gold(s);
  const rs = await Promise.allSettled([1, 2, 3].map(() => h.act(s, 'claimDistribution', { distributionId })));
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(h.gold(s), before + 1000);
  const tetikci = A.ids[6];
  const err = await h.fails(tetikci, 'claimDistribution', { distributionId });
  assert.match(err.message, /sadece Rütbeliler/);
  const b0 = h.gold(A.baba);
  await h.act(A.baba, 'claimDistribution', { distributionId });
  assert.equal(h.gold(A.baba), b0 + 1000);
  assert.ok(h.chat(A.gangId).some((m) => /Üye1 dağıtımdan 1\.000 altın aldı/.test(m)));
  const d = h.get(`distributions/${distributionId}`);
  assert.equal(d.claimedCount, 2);
  assert.equal(d.claimedTotal, 2000);
});

test('en fazla kişi sayısı dolunca başka kimse alamaz (tüm üyeler grubu, ilk gelen)', async () => {
  const h = await createHarness();
  const A = await rankedGang(h, 10);
  await h.fundKasa(A.gangId, 1_000_000);
  const { distributionId } = await h.act(A.baba, 'createDistribution', { group: 'hepsi', perPerson: 500, slots: 7 });
  const results = await Promise.allSettled(A.ids.map((id) => h.act(id, 'claimDistribution', { distributionId })));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.ok(ok <= 7);
  const d = h.get(`distributions/${distributionId}`);
  assert.equal(d.claimedCount, ok);
  if (ok === 7) assert.equal(d.status, 'completed');
  // sıralı olarak kalanları dene
  for (const id of A.ids) await h.act(id, 'claimDistribution', { distributionId }).catch(() => null);
  assert.equal(h.get(`distributions/${distributionId}`).claimedCount, 7);
  assert.equal(h.get(`distributions/${distributionId}`).status, 'completed');
});

test('24 saat sonunda alınmayan para kasaya döner, bir kez; süresi geçince claim yok', async () => {
  const h = await createHarness();
  const A = await rankedGang(h);
  await h.fundKasa(A.gangId, 100_000);
  const { distributionId } = await h.act(A.baba, 'createDistribution', { group: 'rutbeli', perPerson: 1000 });
  await h.act(A.ids[0], 'claimDistribution', { distributionId });
  const kasaAfterCreate = h.state(A.gangId).kasa;
  h.clock.now += 24 * 3600_000 + 1000;
  const err = await h.fails(A.ids[1], 'claimDistribution', { distributionId });
  assert.equal(err.code, 'deadline-exceeded');
  await h.internal.clock.runClock('test');
  await h.internal.clock.runClock('test'); // ikinci çalışma iade tekrarlamamalı
  const d = h.get(`distributions/${distributionId}`);
  assert.equal(d.status, 'expired');
  assert.equal(d.refunded, 6000);
  assert.equal(h.state(A.gangId).kasa, kasaAfterCreate + 6000);
});

test('claim ve iade yarışı: toplam para korunur (çift ödeme/çift iade yok)', async () => {
  for (let run = 0; run < 8; run++) {
    const h = await createHarness();
    const A = await rankedGang(h);
    await h.fundKasa(A.gangId, 100_000);
    const { distributionId } = await h.act(A.baba, 'createDistribution', { group: 'rutbeli', perPerson: 1000 });
    const kasa0 = h.state(A.gangId).kasa;
    const golds0 = A.ids.slice(0, 6).map((id) => h.gold(id));
    h.clock.now += 24 * 3600_000 - 1;
    const claims = A.ids.slice(0, 6).map((id) => h.act(id, 'claimDistribution', { distributionId }).catch(() => null));
    const sweep = (async () => {
      h.clock.now += 2;
      await h.internal.clock.runClock('test');
    })();
    await Promise.all([...claims, sweep]);
    await h.internal.clock.runClock('test');
    const paid = A.ids.slice(0, 6).reduce((s, id, i) => s + (h.gold(id) - golds0[i]), 0);
    const refunded = h.state(A.gangId).kasa - kasa0;
    const d = h.get(`distributions/${distributionId}`);
    assert.equal(paid + refunded, 7000, `run ${run}: paid=${paid} refunded=${refunded}`);
    assert.equal(d.claimedTotal, paid);
  }
});

test('dağıtım açıldıktan sonra katılan (ya da ayrılıp dönen) oyuncu o dağıtımdan alamaz', async () => {
  const h = await createHarness();
  const A = await rankedGang(h);
  await h.fundKasa(A.gangId, 100_000);
  const { distributionId } = await h.act(A.baba, 'createDistribution', { group: 'hepsi', perPerson: 100, slots: 20 });
  const u = A.ids[9];
  h.clock.now += 1000;
  await h.act(u, 'leaveGang');
  await h.tickTo('2026-09-22', '00:05'); // aynı gün geri giremez
  await h.act(u, 'joinGang', { gangId: A.gangId });
  const err = await h.fails(u, 'claimDistribution', { distributionId });
  assert.match(err.message, /katılmadan önce/);
  const x = await h.persona({ displayName: 'Yeni', gold: 1, power: 1, reputation: 1 });
  await h.act(x, 'joinGang', { gangId: A.gangId });
  await h.fails(x, 'claimDistribution', { distributionId });
});

test('Baba kendi hesabına: serbest paradan, prestij −tutar×5; Sağ Kol alamaz; serbest para ortak', async () => {
  const h = await createHarness();
  const A = await rankedGang(h);
  await h.fundKasa(A.gangId, 100_000); // serbest 20k
  const p0 = h.member(A.gangId, A.baba).prestige;
  const g0 = h.gold(A.baba);
  await h.fails(A.ids[0], 'withdrawToSelf', { amount: 1000 });
  const r = await h.act(A.baba, 'withdrawToSelf', { amount: 12_000 });
  assert.equal(r.prestigePenalty, 60_000);
  assert.equal(h.gold(A.baba), g0 + 12_000);
  assert.equal(h.member(A.gangId, A.baba).prestige, p0 - 60_000);
  assert.equal(h.state(A.gangId).distributableLeft, 8000);
  // aynı %20 hakkından dağıtım: 7×1000 olur, 7×2000 olmaz
  await h.fails(A.baba, 'createDistribution', { group: 'rutbeli', perPerson: 2000 });
  await h.act(A.baba, 'createDistribution', { group: 'rutbeli', perPerson: 1000 });
  await h.fails(A.baba, 'withdrawToSelf', { amount: 1001 });
  assert.ok(h.chat(A.gangId).some((m) => /kendi hesabına 12\.000 altın aldı \(prestij −60\.000\)/.test(m)));
  // dağıtım prestij düşürmez
  const pS = h.member(A.gangId, A.ids[0]).prestige;
  const { distributionId } = await h.act(A.ids[0], 'createDistribution', { group: 'rutbeli', perPerson: 100 }).catch(() => ({}));
  if (distributionId) await h.act(A.ids[0], 'claimDistribution', { distributionId });
  assert.equal(h.member(A.gangId, A.ids[0]).prestige, pS);
});

test('başka çeteye para: Baba/Sağ Kol, serbest paradan; iki sohbete duyuru', async () => {
  const h = await createHarness();
  const A = await rankedGang(h);
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.fundKasa(A.gangId, 100_000);
  const kB = h.state(B.gangId).kasa;
  await h.fails(A.ids[2], 'transferToGang', { targetGangId: B.gangId, amount: 100 }); // Kıdemli
  await h.fails(A.ids[0], 'transferToGang', { targetGangId: B.gangId, amount: 20_001 });
  await h.act(A.ids[0], 'transferToGang', { targetGangId: B.gangId, amount: 15_000 });
  assert.equal(h.state(B.gangId).kasa, kB + 15_000);
  assert.equal(h.state(A.gangId).distributableLeft, 5000);
  assert.ok(h.chat(B.gangId).some((m) => /kasamıza 15\.000 altın gönderdi/.test(m)));
  assert.ok(h.chat(A.gangId).some((m) => /Beta çetesine 15\.000 altın gönderdi/.test(m)));
  await h.fails(A.baba, 'transferToGang', { targetGangId: A.gangId, amount: 10 });
});

test('İstihbarat dağıtımı: dağıtan ve Başkan alamaz; belge gerçek oyuncu kimliği içermez; İstihbarata bağış yok', async () => {
  const h = await createHarness();
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const id = await h.persona({ displayName: `Ajan${i}`, gold: 10, power: 1000, reputation: 60 });
    await h.act(id, 'joinIntel', { codeName: `Kod${i}` });
    ids.push(id);
  }
  const rid = async (i) => (await h.membership(ids[i])).intelRosterId;
  await h.db.doc(`gangWorlds/test/intelRoster/${await rid(0)}`).update({ rank: 'baskan' });
  await h.db.doc(`gangWorlds/test/intelRoster/${await rid(1)}`).update({ rank: 'sef' });
  const ctx = h.internal.core.makeCtx('test', h.raw('gangWorlds/test'));
  await h.db.doc('gangWorlds/test/intel/main/private/state').set({ kasa: 50_000, kasaAtMidnight: 50_000, midnightDateKey: ctx.dateKey, distributableLeft: 10_000 }, { merge: true });
  h.clock.now += 1000;
  const res = await h.act(ids[1], 'createDistribution', { org: 'intel', group: 'hepsi', perPerson: 1000, slots: 7 });
  assert.equal(res.total, 7000);
  const e1 = await h.fails(ids[1], 'claimDistribution', { distributionId: res.distributionId });
  assert.match(e1.message, /Kendi açtığın/);
  const e2 = await h.fails(ids[0], 'claimDistribution', { distributionId: res.distributionId });
  assert.match(e2.message, /Başkan/);
  await h.act(ids[2], 'claimDistribution', { distributionId: res.distributionId });
  const d = h.get(`distributions/${res.distributionId}`);
  for (const id of ids) assert.ok(!JSON.stringify(d).includes(id), 'İstihbarat dağıtım belgesi gerçek oyuncu kimliği içermemeli');
  assert.ok(h.intelChat().some((m) => /Kod2 dağıtımdan 1\.000 altın aldı/.test(m)));
  await h.fails(ids[2], 'donate', { amount: 1000 }); // çetesi yok → bağış yok
  await h.fails(ids[1], 'withdrawToSelf', { amount: 100 });
});
