import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang, ADMIN_UID, PASSWORD } from './harness.js';

test('güvenlik: canlı kapalıyken oyuncu hiçbir işlem yapamaz; test dünyası admin oturumu ister', async () => {
  const h = await createHarness();
  const player = 'normalUid';
  await h.db.doc(`users/${player}`).set({ displayName: 'Normal', gold: 5_000_000, reputation: 100 });
  await assert.rejects(h.system.handleAction({ auth: { uid: player }, data: { action: 'joinIntel', payload: { codeName: 'X1' } } }), /tadilatta/);
  await assert.rejects(h.system.handleAction({ auth: { uid: player }, data: { world: 'test', actAs: 'tpabcdef12', action: 'leaveGang' } }), /Test modu kapalı/);
  await assert.rejects(h.system.handleAdmin({ auth: { uid: player }, data: { action: 'unlock', password: PASSWORD } }), /Yetkin yok/);
  await assert.rejects(h.system.handleAction({ auth: null, data: { action: 'leaveGang' } }), /giriş/);
});

test('admin şifresi: yanlış şifre reddedilir, 5 hatada kilit; oturum süresi dolunca test kapanır', async () => {
  const h = await createHarness();
  await h.db.doc(`gangAdmins/${ADMIN_UID}`).set({ expiresAtMs: 0 });
  for (let i = 0; i < 5; i++) await assert.rejects(h.admin('unlock', { password: 'yanlis' }), /Şifre yanlış/);
  await assert.rejects(h.admin('unlock', { password: PASSWORD }), /Çok fazla/);
  h.clock.now += 16 * 60_000;
  await h.admin('unlock', { password: PASSWORD });
  await h.admin('status');
  h.clock.now += 13 * 3600_000;
  await assert.rejects(h.admin('status'), /oturumu kapalı/);
});

test('zaman simülasyonu sadece test dünyasında; canlı dünya gerçek saati kullanır', async () => {
  const h = await createHarness();
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const { liveWorldId } = h.raw('gangSystem/config');
  await h.admin('advanceTime', { hours: 72 });
  const core = h.internal.core;
  const testCtx = core.makeCtx('test', h.raw('gangWorlds/test'));
  // saldırgan biri canlı dünya belgesine ofset yazsa bile uygulanmaz
  await h.db.doc(`gangWorlds/${liveWorldId}`).set({ clockOffsetMs: 999_999_999 }, { merge: true });
  const liveCtx = core.makeCtx(liveWorldId, h.raw(`gangWorlds/${liveWorldId}`));
  assert.equal(liveCtx.now, h.clock.now);
  assert.equal(testCtx.now, h.clock.now + 72 * 3600_000);
  assert.equal(h.raw(`gangWorlds/${liveWorldId}`).lastTickDateKey, '2026-09-21', 'canlı dünyada tick ilerlemedi');
});

test('canlıya açma: yepyeni boş dünya; test verisi taşınmaz; test sıfırlama canlıya dokunmaz', async () => {
  const h = await createHarness();
  const G = await setupGang(h, { members: 2 });
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const { liveWorldId, liveOpen } = h.raw('gangSystem/config');
  assert.equal(liveOpen, true);
  assert.equal(Object.keys(h.db._dump(`gangWorlds/${liveWorldId}/gangs/`)).length, 0);
  const uid = 'realP';
  await h.db.doc(`users/${uid}`).set({ displayName: 'Gerçek', gold: 2_000_000, reputation: 100 });
  h.weaponsByOwner.set(uid, 45_000);
  const res = await h.system.handleAction({ auth: { uid }, data: { action: 'createGang', payload: { name: 'Canlı Çete', logo: { emoji: '🐺', color: '#ffd23f', bg: '#231c05' } } } });
  assert.ok(res.gangId);
  assert.equal(h.raw(`users/${uid}`).gold, 1_000_000);
  await assert.rejects(h.admin('resetTestWorld', { confirm: 'evet' }), /Onay/);
  await h.admin('resetTestWorld', { confirm: 'SIFIRLA' });
  assert.equal(h.get(`gangs/${G.gangId}`), undefined);
  assert.ok(h.raw(`gangWorlds/${liveWorldId}/gangs/${res.gangId}`), 'canlı çete duruyor');
  assert.ok(h.raw('gangWorlds/test'), 'test dünyası yeniden oluşturuldu');
});

test('kaçırılan günler sırayla işlenir; eşzamanlı iki saat aynı günü iki kez işlemez', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 1, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  const { warId } = await h.act(A.baba, 'offerBet', { targetGangId: B.gangId, stake: 100_000 });
  await h.act(B.baba, 'respondBet', { warId, accept: true });
  h.at('2026-09-24', '00:10'); // 3 gün atlandı
  await Promise.all([h.internal.clock.runClock('test'), h.internal.clock.runClock('test'), h.internal.clock.runClock('test')]);
  await h.internal.clock.runClock('test');
  assert.equal(h.raw('gangWorlds/test').lastTickDateKey, '2026-09-24');
  for (const d of ['2026-09-22', '2026-09-23', '2026-09-24']) assert.equal(h.get(`ticks/${d}`).status, 'done');
  const w = h.get(`wars/${warId}`);
  assert.equal(w.status, 'resolved');
  const payouts = Object.values(h.db._dump('gangWorlds/test/ledger/')).filter((l) => l.refId === warId && /bet_(payout|refund)/.test(l.type));
  assert.equal(payouts.length, 2, 'berabere: iki iade, tekrar yok');
  assert.equal(h.state(A.gangId).kasa + h.state(B.gangId).kasa, 2_000_000);
});

test('aktiflik: SADECE savaş sayılır; 29 gün uyarı, 30. gün çıkarma; Baba da muaf değil (halef / dağılma)', async () => {
  const h = await createHarness();
  const G = await setupGang(h, { members: 2 });
  const [lazy, warrior] = G.ids;
  const Solo = await setupGang(h, { members: 0, name: 'Tek Kişilik' });
  h.at('2026-10-17', '12:00');
  await h.act(lazy, 'sendGangChat', { text: 'buradayım' }); // sohbet sayılmaz
  await h.tickTo('2026-10-18', '12:00'); // Pazar: ticaret savaşı
  await h.act(warrior, 'rollDice', { warId: 'trade_2026-10-18' });
  await h.tickTo('2026-10-21', '00:05'); // 29 tam gün
  assert.equal(h.member(G.gangId, lazy).inactiveWarn, true);
  assert.equal(h.member(G.gangId, warrior).inactiveWarn, false);
  await h.tickTo('2026-10-22', '00:05'); // 30 tam gün
  assert.equal(h.member(G.gangId, lazy), undefined);
  assert.equal(h.member(G.gangId, G.baba), undefined, 'Baba da çıkarıldı');
  assert.equal(h.get(`gangs/${G.gangId}`).babaId, warrior, 'en yüksek prestijli kalan üye Baba');
  assert.equal(h.member(G.gangId, warrior).rank, 'baba');
  assert.equal(h.get(`gangs/${Solo.gangId}`).status, 'disbanded', 'kimse kalmadı → çete kapandı');
  const msg = Object.values(h.db._dump('gangWorlds/test/inbox/')).find((m) => m.to === lazy && /hiçbir savaşa katılmadığın/.test(m.text));
  assert.ok(msg);
});

test('dağılan çete: kasa yakılır, tırlar emekli, ticaret yolu boşa çıkar, bekleyen bahis iade', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.fundKasa(A.gangId, 2_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  await h.db.doc('gangWorlds/test/routes/silah').set({ product: 'silah', holderType: 'gang', holderId: A.gangId, dailyOrderLimit: 100 });
  await h.db.doc(`gangWorlds/test/gangs/${A.gangId}`).update({ routeProducts: ['silah'] });
  const { code } = await h.act(A.baba, 'buyTruck');
  const { warId } = await h.act(B.baba, 'offerBet', { targetGangId: A.gangId, stake: 100_000 });
  await h.act(A.baba, 'leaveGang');
  await h.internal.clock.runClock('test');
  assert.equal(h.get(`gangs/${A.gangId}`).status, 'disbanded');
  assert.equal(h.state(A.gangId).kasa, 0);
  assert.equal(h.get('routes/silah').holderId, null);
  assert.equal(h.get(`truckCodes/${code}`), undefined);
  assert.equal(h.get(`wars/${warId}`).status, 'cancelled');
  assert.equal(h.state(B.gangId).kasa, 1_000_000);
});

test('canlı dünyada dağıtım talebi mevcut borç kuralına uyar (%50 borca)', async () => {
  const h = await createHarness();
  await h.admin('openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' });
  const { liveWorldId } = h.raw('gangSystem/config');
  const act = (uid, action, payload) => h.system.handleAction({ auth: { uid }, data: { action, payload } });
  await h.db.doc('users/boss').set({ displayName: 'Boss', gold: 3_000_000, reputation: 100 });
  await h.db.doc('users/debtor').set({ displayName: 'Borçlu', gold: 0, reputation: 10, debtToState: 1_000_000 });
  h.weaponsByOwner.set('boss', 50_000);
  const { gangId } = await act('boss', 'createGang', { name: 'Borç Çetesi', logo: { emoji: '🐺', color: '#ffd23f', bg: '#231c05' } });
  await act('debtor', 'joinGang', { gangId });
  await act('boss', 'donate', { amount: 1_000_000 });
  // 00:00 kasası
  h.at('2026-09-22', '00:02');
  await h.internal.clock.runClock(liveWorldId);
  const r = await act('boss', 'createDistribution', { group: 'hepsi', perPerson: 20_000, slots: 7 });
  await act('debtor', 'claimDistribution', { distributionId: r.distributionId });
  const u = h.raw('users/debtor');
  assert.equal(u.gold, 10_000);
  assert.equal(u.debtToState, 990_000);
});
