import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';
import { weekdayOfKey } from '../time.js';

// v136 — ticaret yolu savaşı Pazar → Cumartesi.
// Harness başlangıcı: 2026-09-21 Pazartesi 09:00 (açılış günü).

test('v136: savaş Cumartesi açılır, Pazar açılmaz; ürün sırası haftalarla devam eder (Pazar → Cumartesi geçişinde atlama/tekrar yok)', async () => {
  const h = await createHarness();
  await setupGang(h, { members: 0, name: 'Alfa' });
  await h.tickTo('2026-09-26', '00:10'); // Cumartesi
  assert.equal(h.get('wars/trade_2026-09-26').status, 'active');
  await h.tickTo('2026-09-27', '00:10'); // Pazar
  assert.equal(h.get('wars/trade_2026-09-27'), undefined, 'Pazar artık savaş yok');
  const world = { launchDateKey: '2026-09-21' };
  const p = (k) => h.internal.clock.productForSunday(world, k).id;
  // eski Pazar savaşları ve yeni Cumartesi savaşları aynı haftalık sırayı izler
  assert.equal(p('2026-10-18'), 'yasakliMadde'); // Pazar (eski)
  assert.equal(p('2026-10-25'), 'silah'); // Pazar (eski — son Pazar savaşı)
  assert.equal(p('2026-10-31'), 'araba', 'ilk Cumartesi: bir sonraki ürün');
  assert.equal(p('2026-11-07'), 'yasakliMadde');
  assert.equal(p('2026-11-14'), 'silah');
  assert.equal(weekdayOfKey('2026-10-31'), 6);
});

test('v136 tek seferlik: Pazartesi biten yollar bir gün öne (Pazar) alınır; diğerleri ve ikinci çalıştırma etkisiz', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  await h.tickTo('2026-09-22', '00:10'); // dünya kuruldu (bayrak yazıldı)
  await h.db.doc('gangWorlds/test').update({ routeSaturdayV136: null });
  await h.giveRoute(A.gangId, 'yasakliMadde', 100_000, '2026-10-05'); // Pazartesi
  await h.giveRoute(A.gangId, 'silah', 100_000, '2026-10-12'); // Pazartesi
  await h.giveRoute(A.gangId, 'araba', 100_000, '2026-10-11'); // Pazar (zaten yeni düzen)
  const ctx = () => h.internal.core.makeCtx('test', h.raw('gangWorlds/test'), { actorId: 'system' });
  const r = await h.internal.clock.ensureRouteSaturdayV136(ctx());
  assert.equal(r.shifted, 2);
  assert.equal(h.get('routes/yasakliMadde').untilDateKey, '2026-10-04');
  assert.equal(h.get('routes/silah').untilDateKey, '2026-10-11');
  assert.equal(h.get('routes/araba').untilDateKey, '2026-10-11');
  await h.db.doc('gangWorlds/test').update({ routeSaturdayV136: null });
  const r2 = await h.internal.clock.ensureRouteSaturdayV136(ctx());
  assert.equal(r2.shifted, 0, 'Pazar biten yollar tekrar kaydırılmaz');
  assert.equal(h.get('routes/yasakliMadde').untilDateKey, '2026-10-04');
});

test('v136: belediye yetkilisi teşkilat Genel sohbetine yazar (ad + unvan), rütbeliler sohbetine yazamaz; yetkisiz oyuncu yazamaz', async () => {
  const h = await createHarness();
  const may1 = await h.persona({ displayName: 'Ayşe', gold: 1_000_000, power: 1000, reputation: 50 });
  const clerk = await h.persona({ displayName: 'Memur', gold: 1_000_000, power: 1000, reputation: 50 });
  await h.db.doc(`users/${may1}`).set({ displayName: 'Ayşe' }, { merge: true });
  await h.db.doc(`belediyeStaff/${may1}`).set({ seat: 'bsk' });
  await h.db.doc(`belediyeStaff/${clerk}`).set({ seat: 'zab' });
  await h.act(may1, 'sendIntelChat', { channel: 'genel', text: 'merhaba' });
  const msg = Object.values(h.db._dump('gangWorlds/test/intelChat_genel/')).find((m) => m.text === 'merhaba');
  assert.equal(msg.official, true);
  assert.equal(msg.name, 'Ayşe');
  assert.equal(msg.title, 'Belediye Başkanı');
  assert.equal(msg.uid, may1);
  await h.fails(may1, 'sendIntelChat', { channel: 'yonetim', text: 'x' });
  await h.fails(clerk, 'sendIntelChat', { channel: 'genel', text: 'x' });
  // yedek: belediyeStaff belgesi yoksa users.belediyeSeat
  const yrd = await h.persona({ displayName: 'Yard', gold: 1_000_000, power: 1000, reputation: 50 });
  await h.db.doc(`users/${yrd}`).set({ displayName: 'Yard', belediyeSeat: 'yrd1' }, { merge: true });
  await h.act(yrd, 'sendIntelChat', { channel: 'genel', text: 'yardımcı' });
  assert.ok(Object.values(h.db._dump('gangWorlds/test/intelChat_genel/')).some((m) => m.text === 'yardımcı' && m.title === 'Belediye Başkan Yardımcısı'));
});

async function cop(h, name, rank, prestige) {
  const id = await h.persona({ displayName: name, gold: 10, power: 30_000, reputation: 90 });
  const r = await h.act(id, 'joinIntel', { codeName: name });
  await h.db.doc(`gangWorlds/test/intelRoster/${r.rosterId}`).update({ rank, prestige, joinedAtMs: 1 });
  await h.db.doc(`gangWorlds/test/memberships/${id}`).set({ intelRank: rank }, { merge: true });
  return { id, rid: r.rosterId };
}

test('v136 darbe kilidi: darbe sürerken EGM istifa edemez, hakkında oylama açılamaz, rütbesi düşmez; darbe yoksa normal', async () => {
  const h = await createHarness();
  const egm = await cop(h, 'Kartal', 'baskan', 2_000_000);
  const amir = await cop(h, 'Sahin', 'sef', 9_000_000);
  await h.db.doc('gangWorlds/test').update({ coupCheckInTest: true });
  const now = h.clock.now;
  await h.db.doc('politics/state').set({ gov: { uid: 'x' }, phase: 'idle', coup: { id: 'c1', status: 'active', leaderRid: egm.rid, startMs: now - 3600_000, endMs: now + 40 * 3600_000 } });
  assert.match((await h.fails(egm.id, 'leaveIntel')).message, /Darbe sürerken/);
  assert.match((await h.fails(amir.id, 'requestIntelKickVote', { targetRosterId: egm.rid })).message, /Darbe sürerken/);
  await h.nextDay(); // 00:05 — prestiji düşük ama EGM kalır
  assert.equal(h.get(`intelRoster/${egm.rid}`).rank, 'baskan');
  assert.equal(h.get(`intelRoster/${amir.rid}`).rank, 'sef');
  // başarılı darbe, karar bekleniyor: istifa / oylama yok, rütbe normal hesaplanır
  await h.db.doc('politics/state').set({ gov: null, phase: 'idle', coup: { id: 'c1', status: 'decision', leaderRid: egm.rid, startMs: now - 3600_000, endMs: now, decideUntilMs: h.clock.now + 30 * 3600_000 } });
  assert.match((await h.fails(egm.id, 'leaveIntel')).message, /karar verilene kadar/);
  assert.match((await h.fails(amir.id, 'requestIntelKickVote', { targetRosterId: egm.rid })).message, /Darbe sürerken/);
  // darbe bitti → normal
  await h.db.doc('politics/state').set({ gov: { uid: 'x' }, phase: 'idle', coup: null });
  await h.nextDay();
  assert.equal(h.get(`intelRoster/${amir.rid}`).rank, 'baskan');
  assert.equal(h.get(`intelRoster/${egm.rid}`).rank, 'sef');
  await h.act(egm.id, 'leaveIntel');
});

test('v136 darbe kilidi: polis oylaması geçip bittiyse (darbe bu gece başlıyor) EGM rütbesi korunur; reddedildiyse korunmaz', async () => {
  const h = await createHarness();
  const egm = await cop(h, 'Kartal', 'baskan', 2_000_000);
  const amir = await cop(h, 'Sahin', 'sef', 9_000_000);
  await h.db.doc('gangWorlds/test').update({ coupCheckInTest: true });
  await h.db.doc('politics/state').set({ gov: { uid: 'x' }, phase: 'idle', coup: null });
  const end = h.clock.now + 3600_000; // bu gece 00:00'dan önce bitiyor
  await h.db.doc('coupPlans/current').set({ status: 'voting', leaderRid: egm.rid, voteEndMs: end, yes: 3, no: 1 });
  await h.nextDay();
  assert.equal(h.get(`intelRoster/${egm.rid}`).rank, 'baskan', 'darbe başlayacak — rütbe sabit');
  await h.db.doc('coupPlans/current').set({ status: 'voting', leaderRid: egm.rid, voteEndMs: end, yes: 3, no: 3 });
  await h.nextDay();
  assert.equal(h.get(`intelRoster/${egm.rid}`).rank, 'sef', 'oylama geçmedi — normal hesap');
  assert.equal(h.get(`intelRoster/${amir.rid}`).rank, 'baskan');
});
