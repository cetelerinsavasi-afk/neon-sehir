import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, setupGang } from './harness.js';

const LOGO = { emoji: '🐍', color: '#19e8ff', bg: '#06222b' };

test('çete kurma şartları: altın / saygınlık / güç', async () => {
  const h = await createHarness();
  const poor = await h.persona({ displayName: 'Fakir', gold: 999_999, power: 50_000, reputation: 100 });
  const lowRep = await h.persona({ displayName: 'Şüpheli', gold: 2_000_000, power: 50_000, reputation: 99 });
  const weak = await h.persona({ displayName: 'Zayıf', gold: 2_000_000, power: 39_999, reputation: 100 });
  assert.match((await h.fails(poor, 'createGang', { name: 'Aaa', logo: LOGO })).message, /altın/);
  assert.match((await h.fails(lowRep, 'createGang', { name: 'Bbb', logo: LOGO })).message, /saygınlık/);
  assert.match((await h.fails(weak, 'createGang', { name: 'Ccc', logo: LOGO })).message, /güç/);
});

test('kurucu Mafya Babası olur, 10M prestij, ücret düşülür, ad benzersiz', async () => {
  const h = await createHarness();
  const b = await h.persona({ displayName: 'Kurucu', gold: 3_000_000, power: 50_000, reputation: 100 });
  const { gangId } = await h.act(b, 'createGang', { name: 'Gece Kuşları', logo: LOGO, note: 'selam' });
  const m = h.member(gangId, b);
  assert.equal(m.rank, 'baba');
  assert.equal(m.prestige, 10_000_000);
  assert.equal(h.gold(b), 2_000_000);
  const other = await h.persona({ displayName: 'Diğer', gold: 3_000_000, power: 50_000, reputation: 100 });
  const err = await h.fails(other, 'createGang', { name: 'gece  kuşları', logo: LOGO });
  assert.match(err.message, /alınmış/);
});

test('katılma: yeni üye Çömez, prestij 0; başka çeteye geçiş onay ister ve prestiji siler', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 1, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  const u = A.ids[0];
  assert.equal(h.member(A.gangId, u).rank, 'comez');
  await h.act(u, 'donate', { amount: 5000 });
  assert.equal(h.member(A.gangId, u).prestige, 25_000, '1 altın = 5 prestij');
  const err = await h.fails(u, 'joinGang', { gangId: B.gangId });
  assert.equal(err.message, 'CONFIRM_LEAVE_REQUIRED');
  await h.act(u, 'joinGang', { gangId: B.gangId, confirmLeave: true });
  assert.equal(h.member(A.gangId, u), undefined);
  assert.equal(h.member(B.gangId, u).prestige, 0);
  // aynı gün ayrıldığı çeteye 00:00'a kadar giremez; ertesi gün dönünce yine 0
  const same = await h.fails(u, 'joinGang', { gangId: A.gangId, confirmLeave: true });
  assert.match(same.message, /00:00/);
  await h.nextDay();
  await h.act(u, 'joinGang', { gangId: A.gangId, confirmLeave: true });
  assert.equal(h.member(A.gangId, u).prestige, 0);
});

test('aynı oyuncu aynı anda iki çeteye katılamaz (race)', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 0, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  const u = await h.persona({ displayName: 'Kararsız', gold: 10, power: 1, reputation: 10 });
  const results = await Promise.allSettled([h.act(u, 'joinGang', { gangId: A.gangId }), h.act(u, 'joinGang', { gangId: B.gangId })]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  assert.equal(ok.length, 1, 'tam olarak bir katılım başarılı olmalı');
  const inA = Boolean(h.member(A.gangId, u));
  const inB = Boolean(h.member(B.gangId, u));
  assert.equal(inA + inB, 1);
  assert.equal(h.gangOf(u), inA ? A.gangId : B.gangId);
  const ga = h.get(`gangs/${A.gangId}`);
  const gb = h.get(`gangs/${B.gangId}`);
  assert.equal(ga.memberCount + gb.memberCount, 3);
});

test('başka çetedeyken yeni çete kurmak: eski çeteden çıkar, prestij silinir, İstihbarattan çıkar', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 1, name: 'Alfa' });
  const u = A.ids[0];
  await h.setPersona(u, { gold: 2_000_000, power: 45_000, reputation: 100 });
  await h.act(u, 'joinIntel', { codeName: 'Gölge' });
  assert.ok((await h.membership(u)).intelRosterId);
  const err = await h.fails(u, 'createGang', { name: 'Yeni Çete', logo: LOGO });
  assert.equal(err.message, 'CONFIRM_LEAVE_REQUIRED');
  const { gangId } = await h.act(u, 'createGang', { name: 'Yeni Çete', logo: LOGO, confirmLeave: true });
  assert.equal(h.member(A.gangId, u), undefined);
  assert.equal(h.member(gangId, u).rank, 'baba');
  const ms = await h.membership(u);
  assert.equal(ms.intelRosterId, null);
  assert.equal(h.get(`intelCodeNames/gölge`), undefined, 'kod adı serbest kalmalı');
});

test('v41: Baba ayrılırsa 00:00da en yüksek prestijli üye Baba olur; son üye ayrılırsa çete dağılır', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 2, name: 'Alfa' });
  await h.setPrestige(A.gangId, A.ids[1], 5_000_000);
  await h.act(A.baba, 'leaveGang');
  // v41: gün içinde yerine kimse geçmez; herkes mevkiinde kalır, sohbette duyurulur
  assert.equal(h.get(`gangs/${A.gangId}`).babaId, null);
  assert.notEqual(h.member(A.gangId, A.ids[1]).rank, 'baba');
  assert.ok(h.chat(A.gangId).some((m) => /çeteden ayrıldı.*00:00/.test(m)));
  await h.nextDay(); // 00:00: en yüksek prestijli üye Baba
  assert.equal(h.get(`gangs/${A.gangId}`).babaId, A.ids[1]);
  assert.equal(h.member(A.gangId, A.ids[1]).rank, 'baba');
  await h.act(A.ids[1], 'leaveGang');
  await h.act(A.ids[0], 'leaveGang');
  const g = h.get(`gangs/${A.gangId}`);
  assert.equal(g.status, 'disbanded');
  assert.equal(h.get(`gangNames/alfa`), undefined);
});

test('atma yetkileri: Baba → Tetikçi/Çömez, Sağ Kol → sadece Çömez', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 4 });
  const [s, k, t, c] = A.ids;
  await h.setRank(A.gangId, s, 'sagkol');
  await h.setRank(A.gangId, k, 'kidemli');
  await h.setRank(A.gangId, t, 'tetikci');
  assert.match((await h.fails(s, 'kickMember', { targetId: t })).message, /oylama/);
  assert.match((await h.fails(A.baba, 'kickMember', { targetId: k })).message, /oylama/);
  await h.act(s, 'kickMember', { targetId: c });
  await h.act(A.baba, 'kickMember', { targetId: t });
  assert.equal(h.member(A.gangId, c), undefined);
  assert.equal(h.member(A.gangId, t), undefined);
  assert.match((await h.fails(k, 'kickMember', { targetId: s })).message, /oylama/);
});

test('Mafya Babası saygısı: +1M, üyelik başına bir kez; ayrılıp gelince tekrar verilebilir', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 1 });
  const u = A.ids[0];
  await h.act(A.baba, 'giveRespect', { targetId: u });
  assert.equal(h.member(A.gangId, u).prestige, 1_000_000);
  assert.match((await h.fails(A.baba, 'giveRespect', { targetId: u })).message, /zaten/);
  // eşzamanlı çift saygı → tek kez
  await h.act(u, 'leaveGang');
  await h.nextDay();
  await h.act(u, 'joinGang', { gangId: A.gangId });
  const rs = await Promise.allSettled([h.act(A.baba, 'giveRespect', { targetId: u }), h.act(A.baba, 'giveRespect', { targetId: u })]);
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(h.member(A.gangId, u).prestige, 1_000_000);
});

test('bağış: 1 altın = 5 prestij, requestId ile çift tıklama tek işlem', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 1 });
  const u = A.ids[0];
  const before = h.gold(u);
  await Promise.all([h.act(u, 'donate', { amount: 10_000, requestId: 'abc-1' }), h.act(u, 'donate', { amount: 10_000, requestId: 'abc-1' })]);
  await h.act(u, 'donate', { amount: 10_000, requestId: 'abc-1' });
  assert.equal(h.gold(u), before - 10_000);
  assert.equal(h.state(A.gangId).kasa, 10_000);
  assert.equal(h.member(A.gangId, u).prestige, 50_000);
  await h.fails(u, 'donate', { amount: 50 });
  await h.fails(u, 'donate', { amount: 99_000_000 });
});

test('profil: ad/logo sadece Baba, not Baba+Sağ Kol; geçersiz logo reddedilir', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 2 });
  await h.setRank(A.gangId, A.ids[0], 'sagkol');
  await h.act(A.ids[0], 'updateGangProfile', { note: 'Kimse bizi durduramaz' });
  await h.fails(A.ids[0], 'updateGangProfile', { name: 'Başka Ad' });
  await h.fails(A.ids[1], 'updateGangProfile', { note: 'x' });
  await h.fails(A.baba, 'updateGangProfile', { logo: { emoji: '<script>', color: '#fff', bg: '#000' } });
  await h.act(A.baba, 'updateGangProfile', { name: 'Yeni Kartallar', logo: LOGO });
  const g = h.get(`gangs/${A.gangId}`);
  assert.equal(g.name, 'Yeni Kartallar');
  assert.equal(g.note, 'Kimse bizi durduramaz');
  assert.ok(h.get('gangNames/yeni kartallar'));
  assert.equal(h.get('gangNames/kara kartallar'), undefined);
});

test('sohbet: yönetim kanalı rütbelilere, çok hızlı mesaj engeli; sohbet aktiflik SAYILMAZ; tüm çetelerin rütbeli sohbeti', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 1 });
  const u = A.ids[0];
  await h.fails(u, 'sendGangChat', { channel: 'yonetim', text: 'selam' });
  await h.act(u, 'sendGangChat', { channel: 'genel', text: 'selam' });
  const err = await h.fails(u, 'sendGangChat', { channel: 'genel', text: 'tekrar' });
  assert.equal(err.code, 'resource-exhausted');
  h.clock.now += 2000;
  await h.act(u, 'sendGangChat', { channel: 'genel', text: 'tekrar' });
  await h.act(A.baba, 'sendGangChat', { channel: 'yonetim', text: 'gizli' });
  assert.equal(h.member(A.gangId, u).lastActiveAtMs, h.member(A.gangId, u).joinedAtMs, 'sohbet aktiflik sayacını yenilemez');
  await h.fails(A.baba, 'sendGangChat', { channel: 'duyuru', text: 'eski kanal yok' });
  // tüm çetelerin rütbelileri sohbeti: rütbeli yazar, Çömez yazamaz
  await h.act(A.baba, 'sendGlobalChat', { text: 'Tüm çetelere selam' });
  await h.fails(u, 'sendGlobalChat', { text: 'ben de' });
  const g = Object.values(h.db._dump('gangWorlds/test/globalChat/'));
  assert.equal(g.length, 1);
  assert.equal(g[0].gangName, 'Kara Kartallar');
});

test('v38 herkese açık görünüm: üye listesi 00:00 prestijini gösterir, anlık prestij sadece üyenin kendi belgesinde; kasa 00:00 değeri çete belgesinde', async () => {
  const h = await createHarness({ dice: [6, 6] });
  const A = await setupGang(h, { members: 2, name: 'Alfa' });
  const B = await setupGang(h, { members: 0, name: 'Beta' });
  await h.fundKasa(A.gangId, 1_000_000);
  await h.fundKasa(B.gangId, 1_000_000);
  await h.internal.clock.runClock('test'); // tek seferlik kurulum
  const r0 = h.get(`gangs/${A.gangId}/public/roster`);
  assert.equal(Object.keys(r0.members).length, 3);
  assert.equal(r0.members[A.baba].rank, 'baba');
  const p0 = r0.members[A.ids[0]].prestige;
  // yeni üye listeye hemen düşer
  const newbie = await h.persona({ displayName: 'Yeni', gold: 10, power: 5_000, reputation: 60 });
  await h.act(newbie, 'joinGang', { gangId: A.gangId });
  assert.equal(h.get(`gangs/${A.gangId}/public/roster`).members[newbie].prestige, 0);
  // gün içi bağış anlık prestiji artırır ama listede 00:00 değeri kalır
  await h.act(A.ids[0], 'donate', { amount: 1_000 });
  assert.equal(h.member(A.gangId, A.ids[0]).prestige, p0 + 5_000);
  assert.equal(h.get(`gangs/${A.gangId}/public/roster`).members[A.ids[0]].prestige, p0);
  // ayrılan listeden hemen düşer
  await h.act(newbie, 'leaveGang');
  assert.equal(h.get(`gangs/${A.gangId}/public/roster`).members[newbie], undefined);
  // 00:00'da liste ve 00:00 kasası güncellenir
  const kasa = h.state(A.gangId).kasa;
  await h.nextDay();
  assert.equal(h.get(`gangs/${A.gangId}/public/roster`).members[A.ids[0]].prestige, p0 + 5_000);
  assert.equal(h.get(`gangs/${A.gangId}`).kasaAtMidnight, kasa);
});

test('v38 ensurePublicView: liste belgesi yoksa üye isteğiyle hemen kurulur', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 2, name: 'Alfa' });
  await h.db.doc(`gangWorlds/test/gangs/${A.gangId}/public/roster`).delete();
  const r = await h.act(A.ids[1], 'ensurePublicView', {});
  assert.equal(r.gang, true);
  assert.equal(Object.keys(h.get(`gangs/${A.gangId}/public/roster`).members).length, 3);
  const again = await h.act(A.ids[1], 'ensurePublicView', {});
  assert.equal(again.gang, false, 'güncelse tekrar yazmaz');
});

test('v41 başkanlık devri: Baba → Sağ Kol; kabul → 00:00da yeni Baba; ret → Baba devam; cevapsız → iptal', async () => {
  const h = await createHarness();
  const A = await setupGang(h, { members: 3, name: 'Devir' });
  const [s1, s2, c] = A.ids;
  await h.setPrestige(A.gangId, s1, 5_000_000);
  await h.setPrestige(A.gangId, s2, 4_000_000);
  await h.setRank(A.gangId, s1, 'sagkol');
  await h.setRank(A.gangId, s2, 'sagkol');
  // sadece Baba, sadece Sağ Kola
  await h.fails(s1, 'offerHandover', { targetId: s2 });
  assert.match((await h.fails(A.baba, 'offerHandover', { targetId: c })).message, /Sağ Kol/);
  // 1) kabul
  await h.act(A.baba, 'offerHandover', { targetId: s2 });
  await h.fails(A.baba, 'offerHandover', { targetId: s1 }); // günde tek talep
  await h.fails(s1, 'respondHandover', { accept: true }); // başkası cevaplayamaz
  await h.act(s2, 'respondHandover', { accept: true });
  assert.equal(h.get(`gangs/${A.gangId}`).babaId, A.baba, '00:00a kadar herkes mevkiinde');
  await h.nextDay();
  assert.equal(h.get(`gangs/${A.gangId}`).babaId, s2);
  assert.equal(h.member(A.gangId, s2).rank, 'baba');
  assert.notEqual(h.member(A.gangId, A.baba).rank, 'baba');
  assert.ok(h.member(A.gangId, A.baba), 'eski Baba çetede kalır');
  // 2) ret
  await h.act(s2, 'offerHandover', { targetId: s1 });
  await h.act(s1, 'respondHandover', { accept: false });
  await h.nextDay();
  assert.equal(h.get(`gangs/${A.gangId}`).babaId, s2);
  // 3) cevapsız → iptal
  await h.act(s2, 'offerHandover', { targetId: s1 });
  await h.nextDay();
  assert.equal(h.get(`gangs/${A.gangId}`).babaId, s2);
  assert.equal(h.get(`gangs/${A.gangId}/public/handover`).status, 'expired');
});
