// v109 — İstihbarat + Polis birleşti: "Polis Teşkilatı" (kodda intel).
// Teşkilat üyesi = polis; başvuru formu (çete listesi / hiçbir çetede değilim,
// neden); şartlar (%0 şüphe, 50 saygınlık, silah, görevler, imam/Baba değil);
// 24 saat yeniden başvuru yasağı; polis rütbe adları + maaşları; rüşvet payı;
// 10 gün pasiflik; soygun durdurma payı %25; tek seferlik canlı geçiş.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang, ist } from './harness.js';
import { policeBustSplit, heistStateEntries } from '../../policeRules.js';
import { computeIntelRanks } from '../ranks.js';
import { INTEL, RANK_LABELS, SALARIES } from '../config.js';

const ctxOf = (h) => h.internal.core.makeCtx('test', h.raw('gangWorlds/test'), { actorId: 'system' });

async function member(h, name, { rank = 'muhbir', prestige = 0, power = 20_000 } = {}) {
  const id = await h.persona({ displayName: name, gold: 0, power, reputation: 80 });
  const r = await h.act(id, 'joinIntel', { codeName: name });
  if (rank !== 'muhbir' || prestige) {
    await h.db.doc(`gangWorlds/test/intelRoster/${r.rosterId}`).update({ rank, prestige });
    await h.db.doc(`gangWorlds/test/memberships/${id}`).set({ intelRank: rank }, { merge: true });
  }
  return { id, rid: r.rosterId };
}
const FORM = { gangName: 'Kara Kartallar', gangRank: 'tetikci', reason: 'Şehri bu çetelerden temizlemek istiyorum.' };
const NO_GANG = { gangName: INTEL.APP_NO_GANG, reason: 'Şehri bu çetelerden temizlemek istiyorum.' };

test('v109 sabitleri: ad Polis Teşkilatı; rütbe adları ve maaşları polisten; ihbar/sızdırma 500.000; soygun payı %25', () => {
  assert.equal(INTEL.NAME, 'Polis Teşkilatı');
  assert.deepEqual(
    ['baskan', 'sef', 'uzman', 'ajan', 'muhbir'].map((r) => RANK_LABELS[r]),
    ['Emniyet Genel Müdürü', 'Emniyet Amiri', 'Başkomiser', 'Komiser', 'Polis Memuru']
  );
  assert.deepEqual(SALARIES, { baskan: 25_000, sef: 20_000, uzman: 15_000, ajan: 10_000, muhbir: 5_000 });
  for (const k of ['REPORT_PRESTIGE', 'LEAK_PRESTIGE', 'BET_REPORT_PRESTIGE', 'BET_LEAK_PRESTIGE']) assert.equal(INTEL[k], 500_000, k);
  assert.equal(INTEL.REJOIN_COOLDOWN_MS, 24 * 3600_000);
  // 2 polis 500.000 kurtardı → kişi başı 62.500 altın + 1.000.000 prestij, devlete 375.000
  assert.deepEqual(policeBustSplit(500_000, 2), { perEarning: 62_500, prestigeEach: 1_000_000, stateShare: 375_000 });
  assert.deepEqual(policeBustSplit(10_001, 3), { perEarning: 833, prestigeEach: 13_334, stateShare: 10_001 - 833 * 3 });
  assert.deepEqual(policeBustSplit(0, 2), { perEarning: 0, prestigeEach: 0, stateShare: 0 });
  assert.deepEqual(heistStateEntries({ fines: 500_000, recoveredToState: 375_000 }), [
    { kind: 'in', cat: 'soygun_ceza', amount: 500_000 },
    { kind: 'in', cat: 'soygun_kurtarma', amount: 375_000 },
  ]);
  // rütbe yapısı: 1 · 2 · 4 · kalan · 1M altı
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, prestige: 10_000_000 - i, joinedAtMs: i }));
  const r = computeIntelRanks([...many, { id: 'low', prestige: 999_999 }]);
  assert.equal(r.p0, 'baskan');
  assert.deepEqual([r.p1, r.p2], ['sef', 'sef']);
  assert.equal(r.low, 'muhbir');
});

test('başvuru formu: çete listesinden ya da "Hiçbir çetede değilim" (rütbe sorulmaz); neden zorunlu; şartlar; onayda polis olur', async () => {
  const h = await createHarness();
  const chief = await member(h, 'Müdür', { rank: 'baskan', prestige: 5_000_000 });
  const memur = await member(h, 'Kulak');
  const a = await h.persona({ displayName: 'Aday', gold: 0, power: 5_000, reputation: 60 });
  const b = await h.persona({ displayName: 'Aday2', gold: 0, power: 5_000, reputation: 60 });
  const weak = await h.persona({ displayName: 'Zayıf', gold: 0, power: 5_000, reputation: 49 });
  const sus = await h.persona({ displayName: 'Şüpheli', gold: 0, power: 5_000, reputation: 90 });
  await h.db.doc(`gangWorlds/test/players/${sus}`).update({ suspicion: 3 });
  const imam = await h.persona({ displayName: 'Hoca', gold: 0, power: 5_000, reputation: 90 });
  await h.db.doc(`gangWorlds/test/players/${imam}`).update({ isImam: true });
  const unarmed = await h.persona({ displayName: 'Silahsız', gold: 0, power: 0, reputation: 90 });
  assert.match((await h.fails(weak, 'applyIntel', { codeName: 'Mavi', ...FORM })).message, /50 saygınlık/);
  assert.match((await h.fails(sus, 'applyIntel', { codeName: 'Mavi', ...FORM })).message, /şüphen %0/);
  assert.match((await h.fails(imam, 'applyIntel', { codeName: 'Mavi', ...FORM })).message, /İmam polis olamaz/);
  assert.match((await h.fails(unarmed, 'applyIntel', { codeName: 'Mavi', ...FORM })).message, /silah/);
  assert.match((await h.fails(a, 'applyIntel', { codeName: 'Mavi', ...FORM, reason: 'kısa' })).message, /Neden/);
  assert.match((await h.fails(a, 'applyIntel', { codeName: 'Mavi', ...FORM, gangRank: '' })).message, /rütbeni seç/);
  assert.match((await h.fails(memur.id, 'applyIntel', { codeName: 'Mavi', ...FORM })).message, /Zaten polissin/);
  // çetesi yok → rütbe sorulmaz (gönderilse bile 'yok' yazılır)
  const r1 = await h.act(a, 'applyIntel', { codeName: 'Mavi', ...NO_GANG, gangRank: 'baba' });
  const app = h.get(`intel/main/applications/${r1.appId}`);
  assert.equal(app.gangName, 'Hiçbir çetede değilim');
  assert.equal(app.gangRank, 'yok');
  assert.ok(!JSON.stringify(app).includes(a), 'başvuru belgesi gerçek kimlik içermez');
  assert.match((await h.fails(a, 'applyIntel', { codeName: 'Yeşil', ...FORM })).message, /Bekleyen bir polislik başvurun/);
  assert.match((await h.fails(b, 'applyIntel', { codeName: 'mavi', ...FORM })).message, /kod adı/, 'başvurudaki kod adı ayrılmış');
  assert.equal(h.raw(`gangWorlds/test/players/${a}`).isPolice, false, 'onaydan önce polis değil');
  // Polis Memuru inceleyemez; EGM kabul eder → POLİS olur
  assert.match((await h.fails(memur.id, 'reviewIntelApplication', { appId: r1.appId, accept: true })).message, /Emniyet Genel Müdürü ve Emniyet Amirleri/);
  const ok = await h.act(chief.id, 'reviewIntelApplication', { appId: r1.appId, accept: true });
  assert.equal((await h.membership(a)).intelRosterId, ok.rosterId);
  assert.equal(h.raw(`gangWorlds/test/players/${a}`).isPolice, true, 'onaylanan polis olur');
  assert.equal(h.get(`intelRecords/${ok.rosterId}`).form.gangRank, 'yok');
  assert.ok(h.inbox(a).some((t) => /artık polissin/.test(t)));
  // çeteli başvuru + ret → kod adı serbest
  const r2 = await h.act(b, 'applyIntel', { codeName: 'Yeşil', ...FORM });
  assert.equal(h.get(`intel/main/applications/${r2.appId}`).gangRank, 'tetikci');
  await h.act(chief.id, 'reviewIntelApplication', { appId: r2.appId, accept: false });
  assert.ok(h.inbox(b).some((t) => /Polislik başvurun reddedildi/.test(t)));
  assert.equal(h.raw(`gangWorlds/test/players/${b}`).isPolice, false);
  // onay anında şart yeniden bakılır: bu arada imam olduysa geçersiz
  const r3 = await h.act(b, 'applyIntel', { codeName: 'Yeşil', ...FORM });
  await h.db.doc(`gangWorlds/test/players/${b}`).update({ isImam: true });
  const v = await h.act(chief.id, 'reviewIntelApplication', { appId: r3.appId, accept: true });
  assert.equal(v.void, true);
  assert.equal(h.raw(`gangWorlds/test/players/${b}`).isPolice, false);
  // şüphe sonradan artarsa da geçersiz (0 şüphe şartı)
  await h.db.doc(`gangWorlds/test/players/${b}`).update({ isImam: false });
  const r4 = await h.act(b, 'applyIntel', { codeName: 'Mor', ...FORM });
  await h.db.doc(`gangWorlds/test/players/${b}`).update({ suspicion: 10 });
  const v4 = await h.act(chief.id, 'reviewIntelApplication', { appId: r4.appId, accept: true });
  assert.equal(v4.void, true);
  assert.match(v4.reason, /şüphe/);
  // geri çekme
  await h.db.doc(`gangWorlds/test/players/${b}`).update({ suspicion: 0 });
  await h.act(b, 'applyIntel', { codeName: 'Mor', ...FORM });
  await h.act(b, 'cancelIntelApplication');
  assert.equal((await h.membership(b)).intelAppId, null);
  assert.equal(h.get('intelCodeNames/mor'), undefined);
});

test('başvuru: EGM/Amir yoksa anında onay; varsa 12 saatte yanıt yoksa otomatik onay; onayda polis olur', async () => {
  const h = await createHarness({ start: ist('2026-09-21', '09:00') });
  const a = await h.persona({ displayName: 'İlk', gold: 0, power: 5_000, reputation: 60 });
  const ra = await h.act(a, 'applyIntel', { codeName: 'Öncü', ...FORM });
  assert.equal(ra.accepted, true);
  assert.equal(h.raw(`gangWorlds/test/players/${a}`).isPolice, true);
  assert.ok(h.inbox(a).some((t) => /Polis Teşkilatına kabul edildin — artık polissin/.test(t)));
  const aRid = (await h.membership(a)).intelRosterId;
  await h.db.doc(`gangWorlds/test/intelRoster/${aRid}`).update({ rank: 'baskan', prestige: 5_000_000 });
  await h.db.doc(`gangWorlds/test/memberships/${a}`).set({ intelRank: 'baskan' }, { merge: true });
  const c = await h.persona({ displayName: 'Üçüncü', gold: 0, power: 5_000, reputation: 60 });
  const rc = await h.act(c, 'applyIntel', { codeName: 'Bekçi', ...FORM });
  assert.ok(!rc.accepted);
  assert.equal(rc.autoApproveAtMs, ist('2026-09-21', '21:00'));
  await h.tickTo('2026-09-21', '20:55');
  assert.equal(h.get(`intel/main/applications/${rc.appId}`).status, 'pending');
  assert.equal(h.raw(`gangWorlds/test/players/${c}`).isPolice, false);
  await h.tickTo('2026-09-21', '21:00');
  assert.equal(h.get(`intel/main/applications/${rc.appId}`).status, 'accepted');
  assert.equal(h.raw(`gangWorlds/test/players/${c}`).isPolice, true);
  assert.ok(h.inbox(c).some((t) => /Polis Teşkilatına kabul edildin/.test(t)));
  assert.ok(!h.inbox(c).some((t) => /yanıt verilmedi|otomatik/.test(t)), 'neden otomatik onaylandığı söylenmez');
  // EGM rütbesini kaybederse bekleyen başvuru bir sonraki turda onaylanır
  const f = await h.persona({ displayName: 'Altıncı', gold: 0, power: 5_000, reputation: 60 });
  const rf = await h.act(f, 'applyIntel', { codeName: 'Duman', ...NO_GANG });
  await h.db.doc(`gangWorlds/test/intelRoster/${aRid}`).update({ rank: 'muhbir' });
  await h.tickTo('2026-09-21', '21:10');
  assert.equal(h.get(`intel/main/applications/${rf.appId}`).status, 'accepted');
  assert.ok(h.inbox(f).some((t) => /Polis Teşkilatına kabul edildin/.test(t)));
});

test('24 saat yasak: istifa, atılma, oylamayla çıkarılma ve pasiflikten sonra; her ayrılış polisliği de alır', async () => {
  const h = await createHarness();
  // istifa
  const q = await member(h, 'İstifa');
  assert.equal(h.raw(`gangWorlds/test/players/${q.id}`).isPolice, true);
  await h.act(q.id, 'leaveIntel');
  const ms = await h.membership(q.id);
  assert.equal(ms.intelRosterId, null);
  assert.equal(h.raw(`gangWorlds/test/players/${q.id}`).isPolice, false);
  assert.equal(ms.intelCooldownUntilMs, h.clock.now + 24 * 3600_000);
  assert.match((await h.fails(q.id, 'applyIntel', { codeName: 'Geri', ...FORM })).message, /24 saat daha başvuru yapamazsın/);
  h.setTime(h.clock.now + 23 * 3600_000);
  assert.match((await h.fails(q.id, 'applyIntel', { codeName: 'Geri', ...FORM })).message, /1 saat daha/);
  h.setTime(h.clock.now + 3600_000 + 1);
  const back = await h.act(q.id, 'applyIntel', { codeName: 'Geri', ...FORM });
  assert.equal(back.accepted, true, 'süre dolunca başvurabilir (EGM yok → anında)');

  // atılma (EGM → Polis Memuru) + oylama
  const h2 = await createHarness();
  const all = [];
  for (let i = 0; i < 9; i++) all.push(await member(h2, `Polis${i}`));
  for (const m of all) await h2.db.doc(`gangWorlds/test/players/${m.id}`).update({ lastSeenAtMs: h2.clock.now });
  await h2.nextDay('09:00');
  const set = async (m, rank, prestige) => {
    await h2.db.doc(`gangWorlds/test/intelRoster/${m.rid}`).update({ rank, prestige });
    await h2.db.doc(`gangWorlds/test/memberships/${m.id}`).set({ intelRank: rank }, { merge: true });
  };
  await set(all[0], 'baskan', 9_000_000);
  await set(all[1], 'sef', 8_000_000);
  await set(all[2], 'uzman', 7_000_000);
  await h2.act(all[0].id, 'kickIntelMember', { targetRosterId: all[5].rid });
  assert.equal(h2.raw(`gangWorlds/test/players/${all[5].id}`).isPolice, false, 'atılan polislikten alınır');
  assert.ok((await h2.membership(all[5].id)).intelCooldownUntilMs > h2.clock.now);
  assert.ok(h2.inbox(all[5].id).some((t) => /atıldın ve polislikten alındın.*24 saat/.test(t)));
  assert.ok(h2.intelChat().some((m) => /Polis5, Polis0 tarafından teşkilattan atıldı/.test(m)));
  const v = await h2.act(all[2].id, 'requestIntelKickVote', { targetRosterId: all[1].rid });
  await h2.act(all[0].id, 'castIntelVote', { voteId: v.voteId, choice: 'yes' });
  await h2.act(all[2].id, 'castIntelVote', { voteId: v.voteId, choice: 'yes' });
  assert.equal((await h2.membership(all[1].id)).intelRosterId, null, 'oylamayla çıkarıldı');
  assert.equal(h2.raw(`gangWorlds/test/players/${all[1].id}`).isPolice, false);
  assert.ok((await h2.membership(all[1].id)).intelCooldownUntilMs > h2.clock.now);
});

test('10 gün oyuna girmeyen polis görevden alınır (polislik + 24 saat yasak); giren kalır', async () => {
  const h = await createHarness();
  const active = await member(h, 'Aktif');
  const lazy = await member(h, 'Uykucu');
  for (let d = 0; d < 11; d++) {
    await h.db.doc(`gangWorlds/test/players/${active.id}`).update({ lastSeenAtMs: h.clock.now });
    await h.nextDay();
  }
  assert.ok((await h.membership(active.id)).intelRosterId);
  assert.equal(h.raw(`gangWorlds/test/players/${active.id}`).isPolice, true);
  assert.equal((await h.membership(lazy.id)).intelRosterId, null);
  assert.equal(h.raw(`gangWorlds/test/players/${lazy.id}`).isPolice, false);
  assert.ok((await h.membership(lazy.id)).intelCooldownUntilMs > h.clock.now);
  assert.ok(h.inbox(lazy.id).some((t) => /10 gündür oyuna girmediğin için polislikten alındın/.test(t)));
  assert.equal(h.get(`intelRecords/${lazy.rid}`), undefined, 'sicil silinir');
});

test('çete kuran polis teşkilattan ve polislikten çıkar (Mafya Babası polis olamaz)', async () => {
  const h = await createHarness();
  const p = await member(h, 'Kurucu', { power: 50_000 });
  await h.setPersona(p.id, { gold: 5_000_000, reputation: 100, power: 50_000 });
  await h.act(p.id, 'createGang', { name: 'Yeni Düzen', logo: { emoji: '💀', color: '#ff2e8c', bg: '#1a0610' }, requestId: 'r1' });
  assert.equal((await h.membership(p.id)).intelRosterId, null);
  assert.equal(h.raw(`gangWorlds/test/players/${p.id}`).isPolice, false);
  assert.ok(h.inbox(p.id).some((t) => /Çete kurduğun için polislikten ayrıldın/.test(t)));
  assert.match((await h.fails(p.id, 'applyIntel', { codeName: 'Baba', ...FORM })).message, /Mafya Babası polis olamaz/);
});

test('00:00 maaşı (polis rütbe maaşları) + dünkü rüşvetler teşkilattaki polislere; 00:00 sonrası katılan almaz; tek maaş', async () => {
  const h = await createHarness({ start: ist('2026-09-21', '09:00') });
  const egm = await member(h, 'Bir', { rank: 'baskan', prestige: 3_000_000 });
  const m2 = await member(h, 'İki');
  const m3 = await member(h, 'Üçüncü');
  for (const c of [egm, m2, m3]) await h.db.doc(`gangWorlds/test/players/${c.id}`).update({ lastSeenAtMs: h.clock.now });
  await h.db.doc('gangWorlds/test/policeBribePool/2026-09-21').set({ dateKey: '2026-09-21', bribeCount: 7 }); // 21.000 → bu gece maaş alacak 2 polise 10.500'er (Üçüncü başka görevden maaş aldı)
  await h.db.doc(`gangWorlds/test/roleSalaryMarks/2026-09-22_${m3.id}`).set({ role: 'imam' });
  await h.tickTo('2026-09-21', '23:50');
  const g0 = { egm: h.gold(egm.id), m2: h.gold(m2.id), m3: h.gold(m3.id) };
  h.clock.now = ist('2026-09-22', '00:00') + 20_000;
  const late = await member(h, 'Geç');
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.gold(egm.id) - g0.egm, 25_000 + 10_500, 'Emniyet Genel Müdürü maaşı + rüşvet');
  assert.equal(h.gold(m2.id) - g0.m2, 5_000 + 10_500, 'Polis Memuru maaşı + rüşvet');
  assert.equal(h.gold(m3.id), g0.m3, 'oyuncu başına gecede tek maaş');
  assert.equal(h.gold(late.id), 0, '00:00 sonrası katılan bu gece almaz');
  assert.ok(h.inbox(m2.id).some((t) => /5\.000 maaş \+ 10\.500 rüşvet = 15\.500 altın hesabına aktarıldı — Polis · Polis Memuru/.test(t)));
  const t = h.treasury();
  assert.equal(t.out.maas_polis, 30_000);
  assert.equal(t.out.maas_istihbarat, undefined, 'ayrı istihbarat maaşı yok');
  assert.equal(t.in.rusvet_sahipsiz, undefined, 'polis varken rüşvetin hiçbiri devlete gitmez');
  const rep = await h.act(m2.id, 'intelMemberReport', { rosterId: m2.rid });
  assert.equal(rep.bribeTotal, undefined, 'sicilde alınan rüşvet gösterilmez');
  assert.equal(rep.salaryTotal, undefined, 'sicilde alınan maaş gösterilmez');
  const rec = h.get(`intelRecords/${m2.rid}`);
  assert.equal(rec.bribeTotal, 10_500, 'kayıtta tutulur');
  assert.equal(rec.salaryTotal, 5_000);
  await h.internal.roles.paySalaries(ctxOf(h), h.internal.clock.safe);
  assert.equal(h.gold(m2.id) - g0.m2, 15_500, 'tekrar çalıştırma çift ödeme yapmaz');
});

test('rüşvetin tamamı polislere: bölme artığı da dağıtılır (7 polis, 3.000 altın)', async () => {
  const h = await createHarness({ start: ist('2026-09-21', '09:00') });
  const ms = [];
  for (let i = 0; i < 7; i++) ms.push(await member(h, `Polis${i}`));
  for (const m of ms) await h.db.doc(`gangWorlds/test/players/${m.id}`).update({ lastSeenAtMs: h.clock.now });
  await h.db.doc('gangWorlds/test/policeBribePool/2026-09-21').set({ dateKey: '2026-09-21', bribeCount: 1 });
  const g0 = ms.map((m) => h.gold(m.id));
  await h.tickTo('2026-09-22', '00:05');
  const bribes = ms.map((m, i) => h.gold(m.id) - g0[i] - 5_000);
  assert.equal(bribes.reduce((a, b) => a + b, 0), 3_000, 'tamamı dağıtıldı');
  assert.ok(bribes.every((b) => b === 428 || b === 429));
  assert.equal(h.treasury().in.rusvet_sahipsiz, undefined);
});

test('o gece hiç polis yoksa günün rüşvetleri devlet kasasına', async () => {
  const h = await createHarness({ start: ist('2026-09-21', '09:00') });
  await h.db.doc('gangWorlds/test/policeBribePool/2026-09-21').set({ dateKey: '2026-09-21', bribeCount: 4 });
  await h.tickTo('2026-09-22', '00:05');
  assert.equal(h.treasury().in.rusvet_sahipsiz, 12_000);
});

test('kaldırılan v108 işlemleri yok (ayrı polis teşkilatı, belediye sohbeti)', async () => {
  const h = await createHarness();
  const p = await member(h, 'Rozet');
  for (const action of ['sendStateChat', 'sendPoliceChat', 'changePoliceCodeName', 'kickPoliceMember', 'policeMemberReport']) {
    await assert.rejects(h.act(p.id, action, { text: 'x' }), (err) => Boolean(err), action);
  }
  assert.equal(h.internal.police, undefined);
});

// ---------------------------------------------------------------------------
// Tek seferlik canlı geçiş (gang/actions/roles.js ensureRolesV109) — canlı
// yollar (users/{uid}) sahte veritabanında bir "canlı" dünya ile denenir.
// ---------------------------------------------------------------------------
test('v109 geçişi: polisler teşkilata (0 prestij, otomatik kod adı), üyeler polisliğe; Baba polis düşer; eski bekleyenler; tekrar çalışmaz', async () => {
  const h = await createHarness({ start: ist('2026-10-22', '14:00') });
  const W = 'live1';
  await h.db.doc(`gangWorlds/${W}`).set({ status: 'open' });
  const live = () => h.internal.core.makeCtx(W, h.raw(`gangWorlds/${W}`), { actorId: 'system' });
  const user = (uid, data) => h.db.doc(`users/${uid}`).set({ displayName: uid, gold: 0, reputation: 60, onboardingRewardClaimed: true, ...data });
  await user('cop1', { profession: 'polis' });
  await user('cop2', { profession: 'polis', suspicion: 40 });
  await user('copBaba', { profession: 'polis' });
  await h.db.doc(`gangWorlds/${W}/memberships/copBaba`).set({ gangId: 'g1', gangRank: 'baba' });
  await user('spy1', {});
  await user('spyCop', { profession: 'polis' });
  await user('pendApply', { pendingPoliceChange: 'apply' });
  await user('pendResign', { profession: 'polis', pendingPoliceChange: 'resign' });
  // mevcut istihbaratçılar (biri zaten polis — tekrar kayıt olmamalı)
  const ctx0 = live();
  const enroll = (uid, code, prestige) =>
    h.db.runTransaction(async (tx) => {
      const u = await h.internal.intel.readPoliceUser(tx, ctx0, uid);
      const [iv, st] = await Promise.all([tx.get(ctx0.ref.intel()), tx.get(ctx0.ref.intelState())]);
      h.internal.intel.enrollIntelTx(tx, ctx0, { actorId: uid, codeName: code, key: h.internal.core.nameKeyOf(code), intelExists: iv.exists, stateExists: st.exists, prestige });
      return u;
    });
  await enroll('spy1', 'Baykuş', 3_000_000);
  await enroll('spyCop', 'Çifte', 1_500_000);
  // eski sürümde polis + istihbaratçı olup gece işlenecek istifa / başvuru bırakmış üyeler
  await user('spyResign', { profession: 'polis', pendingPoliceChange: 'resign' });
  await user('spyApply', { pendingPoliceChange: 'apply' });
  await enroll('spyResign', 'Kalıcı', 2_000_000);
  await enroll('spyApply', 'Sabırlı', 0);
  const before = h.raw(`users/spy1`).profession;
  assert.equal(before, undefined, 'istihbaratçı henüz polis değil');

  const safe = h.internal.clock.safe;
  const out = await h.internal.roles.ensureRolesV109(live(), safe);
  assert.equal(out.incomplete, undefined, JSON.stringify(live().errors || out));
  assert.equal(out.cancelledApply, 1, 'üyenin başvurusu iptal SMS\'i almaz');
  assert.equal(out.resigned, 1, 'üyenin eski istifası teşkilattan çıkarmaz');
  assert.equal(out.enrolled, 2, 'cop1 + cop2 (şüphe geçişte aranmaz)');
  assert.equal(out.droppedBaba, 1);
  assert.equal(out.membersMadePolice, 2, 'spy1 + spyApply (spyCop ve spyResign zaten polisti)');
  for (const uid of ['spyResign', 'spyApply']) {
    assert.equal(h.raw(`users/${uid}`).pendingPoliceChange, null, `${uid}: eski bayrak temizlendi`);
    assert.equal(h.raw(`users/${uid}`).profession, 'polis');
    assert.ok(h.raw(`gangWorlds/${W}/memberships/${uid}`).intelRosterId, `${uid} teşkilatta kaldı`);
  }
  // polisler teşkilatta, 0 prestij, otomatik kod adı
  for (const uid of ['cop1', 'cop2']) {
    const ms = h.raw(`gangWorlds/${W}/memberships/${uid}`);
    assert.ok(ms.intelRosterId, uid);
    const r = h.raw(`gangWorlds/${W}/intelRoster/${ms.intelRosterId}`);
    assert.equal(r.prestige, 0);
    assert.equal(r.rank, 'muhbir');
    assert.ok(r.codeName && r.codeName.length >= 3 && r.codeName.length <= 16, r.codeName);
    assert.equal(h.raw(`users/${uid}`).profession, 'polis');
    assert.equal(h.raw(`users/${uid}/private/meta`).isPolice, true);
  }
  // istihbaratçı polis oldu, prestiji duruyor
  assert.equal(h.raw('users/spy1').profession, 'polis');
  const spyMs = h.raw(`gangWorlds/${W}/memberships/spy1`);
  assert.equal(h.raw(`gangWorlds/${W}/intelRoster/${spyMs.intelRosterId}`).prestige, 3_000_000);
  // tek üyelik (spyCop iki kez kaydolmadı)
  assert.equal(Object.keys(h.db._dump(`gangWorlds/${W}/intelRoster/`)).length, 6);
  // Baba polisliği düştü, teşkilata girmedi
  assert.equal(h.raw('users/copBaba').profession, null);
  assert.ok(!h.raw(`gangWorlds/${W}/memberships/copBaba`).intelRosterId);
  // eski bekleyenler
  assert.equal(h.raw('users/pendApply').pendingPoliceChange, null);
  assert.equal(h.raw('users/pendApply').profession, undefined);
  assert.equal(h.raw('users/pendResign').profession, null);
  assert.ok(!h.raw(`gangWorlds/${W}/memberships/pendResign`)?.intelRosterId);
  const sms = (uid) => Object.values(h.db._dump(`users/${uid}/messages/`)).map((m) => m.text);
  assert.ok(sms('cop1').some((t) => /Teşkilata otomatik alındın/.test(t)));
  assert.ok(sms('spy1').some((t) => /sen artık polissin/.test(t)));
  assert.ok(sms('copBaba').some((t) => /Mafya Babaları/.test(t)));
  assert.ok(sms('pendApply').some((t) => /yeni formla tekrar başvurabilirsin/.test(t)));
  assert.equal(h.raw('migrations/rolesV109').done, true);
  // ikinci çalıştırma hiçbir şey yapmaz
  assert.deepEqual(await h.internal.roles.ensureRolesV109(live(), safe), { skipped: true });
  assert.equal(Object.keys(h.db._dump(`gangWorlds/${W}/intelRoster/`)).length, 6);
});

test('v109 uzlaştırma (00:00, canlı): teşkilatta olmayan polisin polisliği alınır; mesleği eksik üyeye yazılır', async () => {
  const h = await createHarness({ start: ist('2026-10-22', '14:00') });
  const W = 'live1';
  await h.db.doc(`gangWorlds/${W}`).set({ status: 'open' });
  const ctx = h.internal.core.makeCtx(W, h.raw(`gangWorlds/${W}`), { actorId: 'system' });
  await h.db.doc('users/stray').set({ displayName: 'x', profession: 'polis' });
  await h.db.doc('users/mem').set({ displayName: 'y', profession: null });
  await h.db.runTransaction(async (tx) => {
    const [iv, st] = await Promise.all([tx.get(ctx.ref.intel()), tx.get(ctx.ref.intelState())]);
    h.internal.intel.enrollIntelTx(tx, ctx, { actorId: 'mem', codeName: 'Üye', key: 'üye', intelExists: iv.exists, stateExists: st.exists });
  });
  const out = await h.internal.roles.reconcilePolice(ctx, h.internal.clock.safe);
  assert.deepEqual(out, { dropped: 1, set: 1 });
  assert.equal(h.raw('users/stray').profession, null);
  assert.equal(h.raw('users/mem').profession, 'polis');
  assert.deepEqual(await h.internal.roles.reconcilePolice(ctx, h.internal.clock.safe), { dropped: 0, set: 0 }, 'ikinci kez değişiklik yok');
});

test('kod: setupGang ile çete üyesi polis başvurabilir (çifte ajan); polis olarak ihbar 500.000 prestij', async () => {
  const h = await createHarness();
  const G = await setupGang(h, { members: 2 });
  const id = G.ids[0];
  await h.setPersona(id, { reputation: 80 });
  const r = await h.act(id, 'applyIntel', { codeName: 'Köstebek', gangName: 'Kara Kartallar', gangRank: 'kidemli', reason: 'Çeteyi içeriden izleyeceğim.' });
  assert.equal(r.accepted, true);
  assert.equal(h.gangOf(id), G.gangId, 'çetede kalır');
  assert.equal(h.raw(`gangWorlds/test/players/${id}`).isPolice, true);
});

test('v116: çeteden ayrılan / atılan 24 saat polisliğe başvuramaz; süre dolunca başvurur', async () => {
  const h = await createHarness();
  const G = await setupGang(h, { members: 2 });
  const [leaver, kicked] = G.ids;
  await h.act(leaver, 'leaveGang');
  await h.act(G.baba, 'kickMember', { targetId: kicked });
  for (const id of [leaver, kicked]) {
    assert.equal((await h.membership(id)).gangCooldownUntilMs, h.clock.now + 24 * 3600_000);
    assert.match((await h.fails(id, 'applyIntel', { codeName: `P${id.slice(-4)}`, ...NO_GANG })).message, /24 saat geçmeden tekrar giremezsin/);
  }
  h.setTime(h.clock.now + 24 * 3600_000 + 1);
  const r = await h.act(leaver, 'applyIntel', { codeName: 'Donus', ...NO_GANG });
  assert.ok(r.accepted || r.appId, 'süre dolunca başvurabilir');
});
