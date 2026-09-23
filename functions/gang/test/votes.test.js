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

test('devirme: sadece prestiji Babayı geçen Sağ Kol; 00:00 gizli, iptal edilebilir; %51 → yeni Baba, eski Baba atılır', async () => {
  const h = await createHarness();
  const G = await fullGang(h, { sagPrestige: [12_000_000, 5_000_000] });
  const [s1, s2] = G.ids;
  await h.fails(s2, 'requestVote', { type: 'devirme' });
  await h.fails(G.ids[2], 'requestVote', { type: 'devirme' });
  const { pendingId } = await h.act(s1, 'requestVote', { type: 'devirme' });
  await h.act(s1, 'cancelVoteRequest', { pendingId });
  await h.act(s1, 'requestVote', { type: 'devirme' });
  assert.equal(activeVote(h, G.gangId), null, 'başlamadan önce aktif oylama yok');
  await h.nextDay();
  const v = activeVote(h, G.gangId);
  assert.ok(v);
  assert.equal(v.voterIds.length, 7);
  assert.ok(!v.voterIds.includes(G.ids[6]), 'Tetikçi oy veremez');
  await h.fails(G.ids[6], 'castVote', { voteId: v.id, choice: 'yes' });
  // 4 evet / 3 hayır = %57
  await voteAll(h, G, v.id, [[s1, 'yes'], [G.ids[2], 'yes'], [G.ids[3], 'yes'], [G.ids[4], 'yes'], [G.baba, 'no'], [s2, 'no'], [G.ids[5], 'no']]);
  await h.fails(s1, 'castVote', { voteId: v.id, choice: 'yes' }); // ikinci oy
  const tally = h.get(`gangs/${G.gangId}/votes/${v.id}`);
  assert.equal(tally.yes, 4);
  assert.equal(tally.no, 3);
  await h.nextDay();
  const g = h.get(`gangs/${G.gangId}`);
  assert.equal(g.babaId, s1);
  assert.equal(h.member(G.gangId, G.baba), undefined, 'eski Baba çeteden çıktı');
  assert.equal(h.member(G.gangId, s1).rank, 'baba');
});

test('devirme şartı 00:00da bozulursa sessizce iptal (bildirim yok)', async () => {
  const h = await createHarness();
  const G = await fullGang(h, { sagPrestige: [12_000_000, 5_000_000] });
  const s1 = G.ids[0];
  await h.act(s1, 'requestVote', { type: 'devirme' });
  await h.setPrestige(G.gangId, G.baba, 20_000_000);
  const inboxBefore = Object.keys(h.db._dump('gangWorlds/test/inbox/')).length;
  await h.nextDay();
  assert.equal(activeVote(h, G.gangId), null);
  const p = Object.values(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/pending/`))[0];
  assert.equal(p.status, 'cancelled');
  const newMsgs = Object.values(h.db._dump('gangWorlds/test/inbox/')).slice(inboxBefore);
  assert.ok(!newMsgs.some((m) => /oylama/i.test(m.text)), 'oylama bildirimi gitmemeli');
});

test('ayaklanma: %66dan fazla gerekir; başarılıysa Baba görevden alınır; başarısızsa başlatan atılır', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  await h.act(s2, 'requestVote', { type: 'ayaklanma' });
  await h.nextDay();
  let v = activeVote(h, G.gangId);
  // 4/6 = %66.67 > %66 → geçer (tam %66 geçmez)
  await voteAll(h, G, v.id, [[s2, 'yes'], [s1, 'yes'], [G.ids[2], 'yes'], [G.ids[3], 'yes'], [G.baba, 'no'], [G.ids[4], 'no']]);
  await h.nextDay();
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s2);
  assert.ok(h.member(G.gangId, G.baba), 'eski Baba çetede kalır');
  assert.notEqual(h.member(G.gangId, G.baba).rank, 'baba');
  // başarısız ayaklanma → başlatan çeteden atılır
  await h.nextDay();
  const sag = Object.entries(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/members/`)).find(([, m]) => m.rank === 'sagkol');
  const rebel = sag[0].split('/').pop();
  await h.act(rebel, 'requestVote', { type: 'ayaklanma' });
  await h.nextDay();
  v = activeVote(h, G.gangId);
  await voteAll(h, G, v.id, [[rebel, 'yes'], [s2, 'no']]);
  await h.nextDay();
  assert.equal(h.member(G.gangId, rebel), undefined, 'başlatan atıldı');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s2);
  assert.ok(h.chat(G.gangId).some((m) => /Ayaklanma başarısız .*çeteden çıkarıldı/.test(m)));
});

test('çıkarma oylaması: Baba → Kıdemli; hedef ayrılırsa oylama iptal; oy hakkı snapshot', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const target = G.ids[5];
  await h.fails(G.ids[2], 'requestVote', { type: 'kick', targetId: G.ids[3] }); // Kıdemli başlatamaz
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: target });
  await h.act(G.ids[0], 'requestVote', { type: 'kick', targetId: target }); // başkasının gizli talebi ifşa edilmez; 00:00'da tek oylama
  await h.nextDay();
  const v = activeVote(h, G.gangId);
  assert.equal(v.type, 'kick');
  // Tetikçi prestij kazanıp yükselse bile bu oylamada oy hakkı yok
  await h.setPrestige(G.gangId, G.ids[6], 50_000_000);
  await h.fails(G.ids[6], 'castVote', { voteId: v.id, choice: 'yes' });
  await h.act(target, 'leaveGang');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${v.id}`).status, 'cancelled');
});

test('çıkarma oylaması geçer → hedef atılır; oy kullanmayan sayılmaz', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const target = G.ids[4];
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: target });
  await h.nextDay();
  const v = activeVote(h, G.gangId);
  await voteAll(h, G, v.id, [[G.baba, 'yes'], [G.ids[0], 'yes'], [target, 'no']]);
  // süresi dolduktan sonra oy kullanılamaz
  await h.nextDay();
  assert.equal(h.member(G.gangId, target), undefined);
  const late = await h.fails(G.ids[1], 'castVote', { voteId: v.id, choice: 'no' });
  assert.match(late.message, /kapandı/);
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
  await h.nextDay();
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

test('çıkarma talebi gizli: aynı hedefe iki talep → ikisi de alınır (ifşa yok), 00:00da tek oylama başlar', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  const kid = G.ids[2];
  await h.act(s1, 'requestVote', { type: 'kick', targetId: kid });
  await h.act(s2, 'requestVote', { type: 'kick', targetId: kid }); // başkasının talebi ifşa edilmez
  await h.fails(s2, 'requestVote', { type: 'kick', targetId: kid }); // kendi tekrarı olmaz
  await h.nextDay();
  const votes = Object.entries(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/votes/`)).filter(([p, v]) => !p.includes('/ballots/') && v.status === 'active');
  assert.equal(votes.length, 1, 'tek oylama');
  const pend = Object.values(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/pending/`));
  assert.deepEqual(pend.map((p) => p.status).sort(), ['cancelled', 'started']);
  // aktif oylama varken yeni talep reddedilir (oylama zaten herkese görünür)
  await h.fails(G.baba, 'requestVote', { type: 'kick', targetId: kid });
});

test('ayaklanmayla Baba olan üyeye karşı bekleyen çıkarma talebi 00:00da düşer', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  // 1. gün: s1 ayaklanma talebi → 2. gün oylama
  await h.act(s1, 'requestVote', { type: 'ayaklanma' });
  await h.nextDay();
  const ay = activeVote(h, G.gangId);
  assert.equal(ay.type, 'ayaklanma');
  // aynı gün Baba, s1 için çıkarma talebi verir → 3. gün başlar
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: s1 });
  await voteAll(h, G, ay.id, [[s1, 'yes'], [s2, 'yes'], [G.ids[2], 'yes'], [G.ids[3], 'yes'], [G.ids[4], 'yes'], [G.ids[5], 'yes'], [G.baba, 'no']]);
  await h.nextDay(); // ayaklanma başarılı: s1 Baba; çıkarma talebi Baba'ya karşı geçersiz → düşer
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, s1);
  assert.equal(activeVote(h, G.gangId), null, 'yeni Babaya karşı çıkarma oylaması başlamaz');
  assert.ok(h.member(G.gangId, s1));
});

test('aynı gece: çıkarma oylaması ayaklanmadan önce çözülür (belirli sıra)', async () => {
  const h = await createHarness();
  const G = await fullGang(h);
  const [s1, s2] = G.ids;
  await h.act(s1, 'requestVote', { type: 'ayaklanma' });
  await h.act(G.baba, 'requestVote', { type: 'kick', targetId: s1 });
  await h.nextDay();
  const all = Object.entries(h.db._dump(`gangWorlds/test/gangs/${G.gangId}/votes/`)).filter(([p, v]) => !p.includes('/ballots/') && v.status === 'active');
  assert.equal(all.length, 2);
  const id = (t) => all.find(([, v]) => v.type === t)[0].split('/').pop();
  const voters = [G.baba, s2, G.ids[2], G.ids[3], G.ids[4], G.ids[5]];
  for (const v of voters) await h.act(v, 'castVote', { voteId: id('kick'), choice: 'yes' });
  for (const v of voters.slice(1)) await h.act(v, 'castVote', { voteId: id('ayaklanma'), choice: 'yes' });
  await h.act(s1, 'castVote', { voteId: id('ayaklanma'), choice: 'yes' });
  await h.nextDay();
  assert.equal(h.member(G.gangId, s1), undefined, 's1 çıkarıldı');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, G.baba, 'Baba yerinde');
  assert.equal(h.get(`gangs/${G.gangId}/votes/${id('ayaklanma')}`).status, 'cancelled');
});
