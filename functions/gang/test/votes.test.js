import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

// 7 rütbeli: Baba + 2 Sağ Kol + 4 Kıdemli; + 1 Tetikçi (gerek 7 rütbeli dolu) + 1 Çömez
async function fullGang(h, { sagPrestige = [6_000_000, 5_000_000] } = {}) {
  const G = await setupGang(h, { members: 8 });
  const pres = [...sagPrestige, 4_000_000, 3_900_000, 3_800_000, 3_700_000, 1_500_000, 0];
  for (let i = 0; i < 8; i++) await h.setPrestige(G.gangId, G.ids[i], pres[i]);
  await h.recomputeRanks(G.gangId);
  return G;
}

async function voteAll(h, G, voteId, choices) {
  for (const [id, c] of choices) await h.act(id, 'castVote', { voteId, choice: c });
}

function activeVote(h, gangId) {
  const all = h.db._dump(`gangWorlds/test/gangs/${gangId}/votes/`);
  const e = Object.entries(all).find(([p, v]) => !p.includes('/ballots/') && v.status === 'active');
  return e ? { id: e[0].split('/').pop(), ...e[1] } : null;
}

test('rütbe hesabı: 2 Sağ Kol, 4 Kıdemli, 1M altı Çömez; eşitlikte kıdem', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const r = (i) => h.member(G.gangId, G.ids[i]).rank;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(r), ['sagkol', 'sagkol', 'kidemli', 'kidemli', 'kidemli', 'kidemli', 'tetikci', 'comez']);
  // eşit prestij → önce katılan önde
  await h.setPrestige(G.gangId, G.ids[6], 3_700_000);
  await h.nextDay();
  assert.equal(r(5), 'kidemli');
  assert.equal(r(6), 'tetikci');
  assert.equal((await h.membership(G.ids[6])).gangRank, 'tetikci');
});

test('devirme: sadece prestiji Babayı geçen Sağ Kol; 00:00–12:00 arası ANINDA başlar, o gece biter; %51 → yeni Baba, eski Baba atılır', async () => {
  const h = await createHarness();
  const G = await fullGang(h, { sagPrestige: [12_000_000, 5_000_000] });
  const [s1, s2] = G.ids;
  await h.fails(s2, 'requestVote', { type: 'devirme' });
  await h.fails(G.ids[2], 'requestVote', { type: 'devirme' });
  const { voteId } = await h.act(s1, 'requestVote', { type: 'devirme' });
  const v = activeVote(h, G.gangId);
  assert.equal(v.id, voteId, 'bekleme yok, anında aktif');
  assert.equal(v.voterIds.length, 7);
  assert.ok(!v.voterIds.includes(G.ids[6]), 'Tetikçi oy veremez');
  await h.fails(s2, 'requestVote', { type: 'ayaklanma' }); // aynı anda ikinci liderlik oylaması yok
  await h.fails(G.ids[6], 'castVote', { voteId: v.id, choice: 'yes' });
  // 4 evet / 3 hayır = %57 (v52: sıra, son oya kadar sonucu belirsiz bırakacak şekilde)
  await voteAll(h, G, v.id, [[G.baba, 'no'], [s2, 'no'], [G.ids[5], 'no'], [s1, 'yes'], [G.ids[2], 'yes'], [G.ids[3], 'yes']]);
  await h.fails(s1, 'castVote', { voteId: v.id, choice: 'yes' }); // ikinci oy
  assert.equal(h.get(`gangs/${G.gangId}/votes/${v.id}`).status, 'active', '6 oyda sonuç henüz belli değil');
  await voteAll(h, G, v.id, [[G.ids[4], 'yes']]); // herkes oy verdi → v52: hemen sonuçlanır
  const tally = h.get(`gangs/${G.gangId}/votes/${v.id}`);
  assert.equal(tally.yes, 4);
  assert.equal(tally.no, 3);
  assert.equal(tally.status, 'resolved');
  assert.equal(tally.result.endedEarly, true);
  const g = h.get(`gangs/${G.gangId}`);
  assert.equal(g.babaId, s1);
  assert.equal(h.member(G.gangId, G.baba), undefined, 'eski Baba çeteden çıktı');
  assert.equal(h.member(G.gangId, s1).rank, 'baba');
});

test('oylama gün içinde başlar: voter listesi başladığı andaki 7 rütbeli; 00:00 sonucu rütbe hesabından ÖNCE', async () => {
  const h = await createHarness();
  const G = await fullGang(h, { sagPrestige: [12_000_000, 5_000_000] });
  const s1 = G.ids[0];
  // Tetikçi gün içinde prestij kazansa da rütbe 00:00'a kadar değişmez → oy hakkı yok
  await h.setPrestige(G.gangId, G.ids[6], 50_000_000);
  const { voteId } = await h.act(s1, 'requestVote', { type: 'devirme' });
  const v = h.get(`gangs/${G.gangId}/votes/${voteId}`);
  assert.ok(!v.voterIds.includes(G.ids[6]));
  await voteAll(h, G, voteId, [[s1, 'yes'], [G.baba, 'no']]); // %50 → devirme geçmez → aday atılır
  await h.nextDay();
  assert.equal(h.member(G.gangId, s1), undefined, 'başarısız devirmede aday atılır');
  assert.equal(h.member(G.gangId, G.ids[6]).rank, 'sagkol', 'rütbeler oylamadan sonra yeniden dizildi');
});

test('ayaklanma: %66dan fazla gerekir; başarılıysa Baba görevden alınır; başarısızsa başlatan atılır', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  await h.act(s2, 'requestVote', { type: 'ayaklanma' });
  let v = activeVote(h, G.gangId);
  // 4/6 = %66.67 > %66 → geçer (tam %66 geçmez)
  await voteAll(h, G, v.id, [[s2, 'yes'], [s1, 'yes'], [G.ids[2], 'yes'], [G.ids[3], 'yes'], [G.baba, 'no'], [G.ids[4], 'no']]);
  await h.nextDay();
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s2);
  assert.ok(h.member(G.gangId, G.baba), 'eski Baba çetede kalır');
  assert.notEqual(h.member(G.gangId, G.baba).rank, 'baba');
  // başarısız ayaklanma → başlatan çeteden atılır
  const sag = Object.entries(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/members/`)).find(([, m]) => m.rank === 'sagkol');
  const rebel = sag[0].split('/').pop();
  await h.act(rebel, 'requestVote', { type: 'ayaklanma' });
  v = activeVote(h, G.gangId);
  await voteAll(h, G, v.id, [[rebel, 'yes'], [s2, 'no']]);
  await h.nextDay();
  assert.equal(h.member(G.gangId, rebel), undefined, 'başlatan atıldı');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s2);
  await h.act(rebel, 'joinGang', { gangId: G.gangId }); // v56: 00:00'da çıkarılan hemen sıfırdan girebilir
  assert.equal(h.member(G.gangId, rebel).prestige, 0);
  assert.ok(h.chat(G.gangId).some((m) => /Ayaklanma başarısız .*çeteden çıkarıldı/.test(m)));
});

test('çıkarma oylaması: Baba → Kıdemli; aynı hedefe ikinci oylama yok; hedef ayrılsa da oylama sürer, sonuç bir şey değiştirmez', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const target = G.ids[5];
  await h.fails(G.ids[2], 'requestVote', { type: 'kick', targetId: G.ids[3] }); // Kıdemli başlatamaz
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: target });
  await h.fails(G.ids[0], 'requestVote', { type: 'kick', targetId: target }); // süren oylama zaten görünür
  const v = activeVote(h, G.gangId);
  assert.equal(v.type, 'kick');
  await h.fails(G.ids[6], 'castVote', { voteId: v.id, choice: 'yes' });
  await h.act(target, 'leaveGang');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${v.id}`).status, 'active', 'oylama devam eder');
  await h.act(G.baba, 'castVote', { voteId: v.id, choice: 'no' });
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: G.ids[4] }); // başka hedef serbest
  await h.nextDay();
  const done = h.get(`gangs/${G.gangId}/votes/${v.id}`);
  assert.equal(done.status, 'resolved');
  assert.equal(done.result.targetLeft, true);
  assert.equal(h.member(G.gangId, target), undefined, 'reddedilse de zaten çıktı');
});

test('çıkarma oylaması geçer → hedef atılır; oy kullanmayan sayılmaz; 00:00 sonrası oy yok', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const target = G.ids[4];
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: target });
  const v = activeVote(h, G.gangId);
  await voteAll(h, G, v.id, [[G.baba, 'yes'], [G.ids[0], 'yes'], [target, 'no']]);
  await h.nextDay();
  assert.equal(h.member(G.gangId, target), undefined);
  const late = await h.fails(G.ids[1], 'castVote', { voteId: v.id, choice: 'no' });
  assert.match(late.message, /kapandı/);
  // v56: 00:00'da sonuçlanan oylamayla atılan hemen sıfırdan girebilir
  await h.act(target, 'joinGang', { gangId: G.gangId });
  assert.equal(h.member(G.gangId, target).rank, 'comez');
  assert.equal(h.member(G.gangId, target).prestige, 0);
});

test('çıkarma oylaması yetkileri: Sağ Kol → Kıdemli/Tetikçi, Kıdemli → Tetikçi/Çömez; 1-1 (%50) geçmez', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2, k1, k2] = G.ids;
  const tetikci = G.ids[6];
  const comez = G.ids[7];
  assert.equal(h.member(G.gangId, tetikci).rank, 'tetikci');
  assert.equal(h.member(G.gangId, comez).rank, 'comez');
  await h.fails(s1, 'requestVote', { type: 'kick', targetId: s2 }); // Sağ Kol → Sağ Kol yok
  await h.fails(s1, 'requestVote', { type: 'kick', targetId: comez }); // Çömezi doğrudan atar
  await h.fails(k1, 'requestVote', { type: 'kick', targetId: k2 }); // Kıdemli → Kıdemli yok
  await h.fails(tetikci, 'requestVote', { type: 'kick', targetId: comez }); // Tetikçi başlatamaz
  await h.act(s1, 'requestVote', { type: 'kick', targetId: tetikci });
  await h.act(k1, 'requestVote', { type: 'kick', targetId: comez });
  await h.act(s2, 'requestVote', { type: 'kick', targetId: k2 });
  const votes = Object.entries(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/votes/`))
    .filter(([p, v]) => !p.includes('/ballots/') && v.status === 'active')
    .map(([p, v]) => ({ id: p.split('/').pop(), ...v }));
  assert.equal(votes.length, 3);
  const vT = votes.find((v) => v.targetId === tetikci);
  const vC = votes.find((v) => v.targetId === comez);
  await voteAll(h, G, vT.id, [[G.baba, 'yes'], [s2, 'no']]); // %50 → geçmez
  await voteAll(h, G, vC.id, [[G.baba, 'yes'], [s2, 'yes'], [k2, 'no']]); // %67 → geçer
  await h.nextDay();
  assert.ok(h.member(G.gangId, tetikci), '1-1 geçmedi');
  assert.equal(h.member(G.gangId, comez), undefined);
});

test('aynı gece: çıkarma oylaması ayaklanmadan önce çözülür (belirli sıra)', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: s1 });
  await h.act(s2, 'requestVote', { type: 'ayaklanma' });
  const all = Object.entries(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/votes/`)).filter(([p, v]) => !p.includes('/ballots/') && v.status === 'active');
  assert.equal(all.length, 2);
  const id = (t) => all.find(([, v]) => v.type === t)[0].split('/').pop();
  // v52: sonuçlar gün içinde kesinleşmeyecek kadar oy (00:00 sırası sınanır)
  for (const v of [G.baba, s2, G.ids[2]]) await h.act(v, 'castVote', { voteId: id('kick'), choice: 'yes' });
  for (const v of [s2, G.ids[2], G.ids[3]]) await h.act(v, 'castVote', { voteId: id('ayaklanma'), choice: 'yes' });
  await h.act(s1, 'castVote', { voteId: id('ayaklanma'), choice: 'yes' });
  assert.equal(h.get(`gangs/${G.gangId}/votes/${id('kick')}`).status, 'active');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${id('ayaklanma')}`).status, 'active');
  await h.nextDay();
  assert.equal(h.member(G.gangId, s1), undefined, 's1 çıkarıldı');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${id('ayaklanma')}`).status, 'resolved');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s2);
  assert.ok(h.member(G.gangId, G.baba), 'eski Baba çetede kalır');
});

test('v39: adına oylama açılan üye oylama bitene kadar Çömez yetkisinde (Baba dahil); 00:00 sonrası yetki geri gelir', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  await h.fundKasa(G.gangId, 1_000_000, { snapshot: true });
  await h.act(s1, 'requestVote', { type: 'ayaklanma' });
  // Baba: kasadan para alamaz, dağıtım yapamaz, çıkarma oylaması / doğrudan atma yok
  assert.match((await h.fails(G.baba, 'withdrawToSelf', { amount: 1000 })).message, /oylama/);
  await h.fails(G.baba, 'requestVote', { type: 'kick', targetId: s2 });
  await h.fails(G.baba, 'kickMember', { targetId: G.ids[5] });
  await h.fails(G.baba, 'buyTruck');
  // başka bir üye için çıkarma oylaması → o üye de Çömez yetkisinde
  await h.act(s2, 'castVote', { voteId: Object.keys(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/votes/`)).find((k) => !k.includes('ballots')).split('/').pop(), choice: 'no' });
  await h.nextDay();
  // oylama bitti (geçmedi → başlatan atıldı); Baba yetkisi geri geldi
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, G.baba);
  await h.act(G.baba, 'buyTruck');
});

test("v32'den kalan bekleyen talepler kaybolmaz: 00:00'da başlar", async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  await h.db.doc(`gangWorlds/test/gangs/${G.gangId}/pending/eski1`).set({ type: 'kick', status: 'pending', initiatorId: G.baba, initiatorName: 'B', targetId: G.ids[5], targetName: 'K', requestedAtMs: h.clock.now - 1000, startDateKey: null });
  await h.nextDay();
  const v = activeVote(h, G.gangId);
  assert.equal(v.targetId, G.ids[5]);
  await h.fails(G.ids[0], 'requestVote', { type: 'kick', targetId: G.ids[5] }); // kilit de yazıldı
});

// ---- v34: ayrılma senaryoları (oylama devam eder) ----
test('devirme başlatan ayrıldı + oylama geçti → eski Baba çıkar, başa en yüksek prestijli üye geçer', async () => {
  const h = await createHarness();
  const G = await fullGang(h, { sagPrestige: [12_000_000, 5_000_000] });
  const [s1, s2] = G.ids;
  const { voteId } = await h.act(s1, 'requestVote', { type: 'devirme' });
  await voteAll(h, G, voteId, [[s1, 'yes'], [s2, 'yes'], [G.ids[2], 'yes'], [G.baba, 'no']]);
  await h.act(s1, 'leaveGang');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'active', 'başlatan ayrılınca oylama sürer');
  await h.nextDay();
  const v = h.get(`gangs/${G.gangId}/votes/${voteId}`);
  assert.equal(v.status, 'resolved');
  assert.equal(v.result.initiatorLeft, true);
  assert.equal(h.member(G.gangId, G.baba), undefined, 'devrilen Baba çıktı');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s2, 'en yüksek prestijli üye Baba');
  assert.equal(h.member(G.gangId, s2).rank, 'baba');
});

test('devirme / ayaklanma başlatan ayrıldı + oylama geçmedi → hiçbir şey değişmez', async () => {
  for (const type of ['devirme', 'ayaklanma']) {
    const h = await createHarness();
    const G = await fullGang(h, { sagPrestige: [12_000_000, 5_000_000] });
    const s1 = G.ids[0];
    const { voteId } = await h.act(s1, 'requestVote', { type });
    await voteAll(h, G, voteId, [[G.baba, 'no'], [G.ids[1], 'no']]);
    await h.act(s1, 'leaveGang');
    await h.nextDay();
    assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'resolved');
    assert.equal(h.get(`gangs/${G.gangId}`).babaId, G.baba, `${type}: Baba yerinde`);
  }
});

test('çıkarma: başlatan ayrılsa da oylama sürer ve geçerse hedef atılır', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const target = G.ids[4];
  const { voteId } = await h.act(G.ids[0], 'requestVote', { type: 'kick', targetId: target }); // Sağ Kol → Kıdemli
  await voteAll(h, G, voteId, [[G.ids[0], 'yes'], [G.baba, 'yes'], [G.ids[1], 'yes']]);
  await h.act(G.ids[0], 'leaveGang');
  await h.nextDay();
  assert.equal(h.member(G.gangId, target), undefined, 'hedef atıldı');
});

test('ayrılan hedef 00:00 sonrası geri girse de eski oylamanın sonucu yeni üyeliğini etkilemez; aynı gün geri giremez', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const target = G.ids[4];
  const { voteId } = await h.act(G.baba, 'requestVote', { type: 'kick', targetId: target });
  await voteAll(h, G, voteId, [[G.baba, 'yes'], [G.ids[0], 'yes']]);
  await h.act(target, 'leaveGang');
  const same = await h.fails(target, 'joinGang', { gangId: G.gangId });
  assert.match(same.message, /00:00/);
  h.at('2026-09-22', '00:01'); // saat turu henüz çalışmadı
  await h.act(target, 'joinGang', { gangId: G.gangId });
  await h.internal.clock.runClock('test');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'resolved');
  assert.ok(h.member(G.gangId, target), 'yeni üyelik eski oylamadan etkilenmedi');
});

test('Mafya Babası oylama sürerken çeteden ayrılırsa liderlik oylaması sonuçsuz kapanır (başlatan atılmaz)', async () => {
  const h = await createHarness();
  const G = await fullGang(h, { sagPrestige: [12_000_000, 5_000_000] });
  const s1 = G.ids[0];
  const { voteId } = await h.act(s1, 'requestVote', { type: 'devirme' });
  await h.act(G.baba, 'leaveGang');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'cancelled');
  await h.nextDay();
  assert.ok(h.member(G.gangId, s1), 'başlatan çetede');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s1, 'halef: en yüksek prestijli üye');
});

// ---------------------------------------------------------------------------
// v52 — hedef ve başlatan oy kullanır; sonuç kesinleşince oylama hemen biter
// ---------------------------------------------------------------------------
test('v52: ayaklanma hedefi Baba (Çömez yetkisindeyken) ve başlatan Sağ Kol oy kullanabilir', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1] = G.ids;
  const { voteId } = await h.act(s1, 'requestVote', { type: 'ayaklanma' });
  const v = h.get(`gangs/${G.gangId}/votes/${voteId}`);
  assert.ok(v.voterIds.includes(G.baba) && v.voterIds.includes(s1));
  await h.act(G.baba, 'castVote', { voteId, choice: 'no' });
  await h.act(s1, 'castVote', { voteId, choice: 'yes' });
  const t = h.get(`gangs/${G.gangId}/votes/${voteId}`);
  assert.equal(t.yes, 1);
  assert.equal(t.no, 1);
});

test('v52: çıkarma — kalan herkes Hayır dese bile geçiyorsa oylama anında biter, hedef hemen çıkar', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  const { voteId } = await h.act(G.baba, 'requestVote', { type: 'kick', targetId: s1 });
  const r3 = await voteAll(h, G, voteId, [[G.baba, 'yes'], [s2, 'yes'], [G.ids[2], 'yes']]);
  void r3;
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'active', '3/7: kalan 4 Hayır derse %43 → belli değil');
  const res = await h.act(G.ids[3], 'castVote', { voteId, choice: 'yes' }); // 4/7 = %57 > %51 → kesin
  assert.equal(res.ended, true);
  const vote = h.get(`gangs/${G.gangId}/votes/${voteId}`);
  assert.equal(vote.status, 'resolved');
  assert.equal(vote.result.passed, true);
  assert.equal(vote.result.endedEarly, true);
  assert.equal(h.member(G.gangId, s1), undefined, 'hedef gece beklemeden çıkarıldı');
  assert.ok(h.chat(G.gangId).some((m) => /erken bitti/.test(m)), 'duyuruda erken bittiği yazar');
  await h.fails(G.ids[4], 'castVote', { voteId, choice: 'no' }); // oylama kapandı
  // v56: gün içinde erken atılan o gün 00:00'a kadar aynı çeteye giremez
  assert.match((await h.fails(s1, 'joinGang', { gangId: G.gangId })).message, /atıldığın çeteye 00:00/);
  // aynı gece 00:00'da tekrar sonuçlanmaz
  await h.nextDay();
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).resolvedAtMs, vote.resolvedAtMs);
  // 00:00'dan sonra sıfırdan girebilir
  await h.act(s1, 'joinGang', { gangId: G.gangId });
  assert.equal(h.member(G.gangId, s1).prestige, 0);
});

test('v52: kalan herkes Evet dese bile geçmiyorsa oylama anında reddedilir; hedefin Çömez yetkisi hemen kalkar', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1] = G.ids;
  const { voteId } = await h.act(G.baba, 'requestVote', { type: 'kick', targetId: s1 });
  await h.fails(s1, 'requestVote', { type: 'kick', targetId: G.ids[6] }); // oylama altında: Çömez yetkisi
  await voteAll(h, G, voteId, [[s1, 'no'], [G.ids[1], 'no'], [G.ids[2], 'no']]);
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'active', '3 hayır: kalan 4 evet → %57 → belli değil');
  await h.act(G.ids[3], 'castVote', { voteId, choice: 'no' }); // en fazla 3/7 = %43 → kesin reddedildi
  const vote = h.get(`gangs/${G.gangId}/votes/${voteId}`);
  assert.equal(vote.status, 'resolved');
  assert.equal(vote.result.passed, false);
  assert.ok(h.member(G.gangId, s1), 'hedef çetede kalır');
  assert.equal(h.member(G.gangId, s1).rank, 'sagkol');
  await h.act(s1, 'requestVote', { type: 'kick', targetId: G.ids[6] }); // Çömez yetkisi bitti (gece beklenmedi)
});

test('v52: ayaklanma erken geçer → yeni Baba hemen başa geçer, eski Baba Sağ Kol olur', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  const { voteId } = await h.act(s1, 'requestVote', { type: 'ayaklanma' });
  // > %66: 5 evet → kalan 2 hayır derse 5/7 = %71 → kesin
  await voteAll(h, G, voteId, [[s1, 'yes'], [s2, 'yes'], [G.ids[2], 'yes'], [G.ids[3], 'yes']]);
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'active');
  await h.act(G.ids[4], 'castVote', { voteId, choice: 'yes' });
  assert.equal(h.get(`gangs/${G.gangId}/votes/${voteId}`).status, 'resolved');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s1);
  assert.equal(h.member(G.gangId, G.baba).rank, 'sagkol');
  assert.ok(!(Number(h.member(G.gangId, G.baba).underVoteUntilMs || 0) > h.clock.now), 'eski Babanın oylama kısıtı kalktı');
});

test('v52: decidedOutcome — örnek: 3 oy hakkı, %50 gereken oylamada 2 aynı oy sonucu belirler', async () => {
  const { decidedOutcome } = await import('../actions/votes.js');
  const half = (v) => {
    const t = v.yes + v.no;
    return { passed: t > 0 && v.yes / t > 0.5 };
  };
  const base = { voterIds: ['a', 'b', 'c'] };
  assert.deepEqual(decidedOutcome({ ...base, yes: 2, no: 0, votedCount: 2 }, half), { passed: true });
  assert.deepEqual(decidedOutcome({ ...base, yes: 0, no: 2, votedCount: 2 }, half), { passed: false });
  assert.equal(decidedOutcome({ ...base, yes: 1, no: 1, votedCount: 2 }, half), null);
  assert.equal(decidedOutcome({ ...base, yes: 1, no: 0, votedCount: 1 }, half), null);
  assert.deepEqual(decidedOutcome({ ...base, yes: 2, no: 1, votedCount: 3 }, half), { passed: true }, 'herkes oy verdi');
});
