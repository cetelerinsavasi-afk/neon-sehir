// v78 — Zamana karşı yarış: deterministik fizik (raceSim) + sunucu (raceTa)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue } from '../gang/test/fakeFirestore.js';
import { createRaceTa, decideTaWinner } from '../raceTa.js';
import * as R from '../raceSim.js';
import { workshopJob, vehicleLevelUpPatch, itemListingBand } from '../itemRules.js';

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// İyi bir "oyuncu": botun sürüşünü dijital tuşlara çevirir (gerçek dokunmatik girdi gibi)
function playerRun(catalogId, level, skill = 0.97) {
  const st = R.carStats(catalogId, level);
  const S = R.newCarState();
  const rec = R.createInputRecorder();
  while (!S.done && S.f < R.MAX_RACE_FRAMES) {
    const { bits, steer } = R.botInput(S, st, skill);
    let b = bits;
    if (steer > 0.25) b |= R.IN_R;
    else if (steer < -0.25) b |= R.IN_L;
    rec.push(b);
    R.stepCar(S, st, b);
  }
  return { runs: rec.runs, frames: S.f, ms: R.framesToMs(S.f), done: S.done };
}

function setup() {
  const db = new FakeFirestore({ yieldEvery: false });
  const G = (p) => db._store.get(p)?.data;
  const clock = { now: 1_800_000_000_000 };
  const rewards = [];
  function finalizeRace({ tx, roomRef, room, winnerUid, players, userRefs }) {
    const pot = room.betAmount;
    Object.keys(players).forEach((u) => {
      if (u === 'bot') return;
      const amount = winnerUid === 'draw' ? pot : winnerUid === u ? pot * 2 : 0;
      if (amount > 0) tx.update(userRefs[u], { gold: FieldValue.increment(amount) });
    });
    const upd = { status: 'finished', winnerUid };
    Object.keys(players).forEach((u) => (upd[`players.${u}`] = players[u]));
    tx.update(roomRef, upd);
  }
  const ta = createRaceTa({
    db,
    FieldValue,
    HttpsError,
    requireAuth: (r) => r.auth.uid,
    finalizeRace,
    processTrainingReward: async (id) => rewards.push(id),
    now: () => clock.now,
  });
  const call = (uid, fn, data) => ta[fn]({ auth: { uid }, data });
  return { db, G, clock, ta, call, rewards };
}
const pl = (name, catalogId, level = 1) => ({ displayName: name, vehicleId: `v_${name}`, vehicleModel: 'Araç', catalogId, level, finishMs: null, dnf: false });

test('raceSim: deterministik matematik ve pist', () => {
  for (let i = 0; i < 2000; i++) {
    const x = (i - 1000) / 37;
    assert.ok(Math.abs(R.dsin(x) - Math.sin(x)) < 1e-12);
    assert.ok(Math.abs(R.dcos(x) - Math.cos(x)) < 1e-12);
    assert.ok(Math.abs(R.datan2(x, 1.3 - x / 9) - Math.atan2(x, 1.3 - x / 9)) < 1e-12);
  }
  assert.ok(R.TRACK.N > 600 && R.TRACK.FIN > R.TRACK.START);
});

test('raceSim: araç değerleri fiyat ve seviyeyle artar; en ucuz 230, tavan 560', () => {
  assert.equal(Math.round(R.carStats(1, 1).vmax), 230, 'en ucuz araç seviye 1 = örnekteki en ucuz hız');
  assert.equal(Math.round(R.carStats(10, 3).vmax), 560, 'en pahalı araç seviye 3 = oyunun tavanı');
  for (let id = 1; id <= 10; id++) {
    for (let lv = 1; lv < 3; lv++) {
      const a = R.carStats(id, lv);
      const b = R.carStats(id, lv + 1);
      assert.ok(b.vmax - a.vmax > 25 && b.a0 > a.a0 && b.ncap > a.ncap, `seviye farkı belirgin (${id}/${lv})`);
    }
    if (id < 10) assert.ok(R.carStats(id + 1, 1).vmax > R.carStats(id, 1).vmax, 'pahalı araç daha hızlı');
  }
  // eski vites/depo geliştirmeleri seviyeye sayılır
  assert.equal(R.vehicleRaceLevel({ gearUpgraded: true }), 2);
  assert.equal(R.vehicleRaceLevel({ gearUpgraded: true, tankUpgraded: true }), 3);
  assert.equal(R.vehicleRaceLevel({ raceLevel: 2, gearUpgraded: true, tankUpgraded: true }), 2);
});

test('raceSim: tuş kaydı tekrar oynatılınca aynı süre (sunucu doğrulaması)', () => {
  const run = playerRun(4, 2);
  assert.ok(run.done);
  const r = R.replayRun(4, 2, run.runs);
  assert.equal(r.ok, true);
  assert.equal(r.frames, run.frames);
  // başka araçla oynatılırsa aynı süre çıkmaz / bozuk kayıt reddedilir
  assert.equal(R.replayRun(10, 3, run.runs).ok, false, 'başka araçla aynı tuşlar pisti bitiremez');
  assert.equal(R.replayRun(4, 2, [4, 10]).ok, false, 'bitmeyen kayıt geçersiz');
  assert.equal(R.replayRun(4, 2, [99, 10]).ok, false, 'geçersiz tuş');
});

test('antrenman: N. seviye bot N. aracı sürer; aynı aracı iyi süren oyuncu yener', () => {
  for (const lvl of [1, 5, 10]) {
    const bot = R.trainingBotRun(lvl);
    assert.equal(bot.catalogId, lvl);
    assert.ok(bot.done);
    const me = playerRun(lvl, 1);
    assert.ok(me.ms < bot.ms, `seviye ${lvl}: oyuncu ${me.ms} < bot ${bot.ms}`);
  }
  // bot sırası: üst seviye daha hızlı
  for (let l = 1; l < 10; l++) assert.ok(R.trainingBotRun(l + 1).ms < R.trainingBotRun(l).ms);
});

test('taFinish antrenman: süre sunucuda hesaplanır, bot süresiyle karşılaştırılır', async () => {
  const h = setup();
  const bot = R.trainingBotRun(2);
  await h.db.doc('raceRooms/t1').set({ engine: 'ta', status: 'racing', isTraining: true, trainingLevel: 2, creatorUid: 'ali', participantUids: ['ali', 'bot'], players: { ali: pl('ali', 2), bot: { finishMs: bot.ms, catalogId: 2, level: 1 } } });
  // başlatılmadan bitirilemez
  const run = playerRun(2, 1);
  await assert.rejects(h.call('ali', 'finish', { roomId: 't1', runs: run.runs }), /başlangıcı/);
  await h.call('ali', 'start', { roomId: 't1' });
  await assert.rejects(h.call('ali', 'start', { roomId: 't1' }), (e) => e.code === 'already-exists', 'tek deneme');
  // hızlandırılmış oyun: gerçek süre geçmeden bitiş
  h.clock.now += 2000;
  await assert.rejects(h.call('ali', 'finish', { roomId: 't1', runs: run.runs }), /süresi doğrulanamadı/);
  h.clock.now += run.ms + 3000;
  const res = await h.call('ali', 'finish', { roomId: 't1', runs: run.runs });
  assert.equal(res.finishMs, run.ms);
  assert.equal(h.G('raceRooms/t1').status, 'finished');
  assert.equal(h.G('raceRooms/t1').winnerUid, 'ali');
  assert.deepEqual(h.rewards, ['t1']);
});

test('taFinish şampiyona: günün en hızlısı lider olur', async () => {
  const h = setup();
  const mk = async (id, uid, lv) => {
    await h.db.doc(`raceRooms/${id}`).set({ engine: 'ta', status: 'racing', isChampionship: true, championshipCatalogId: 3, championshipDateKey: '2026-10-09', creatorUid: uid, participantUids: [uid], players: { [uid]: pl(uid, 3, lv) } });
    await h.call(uid, 'start', { roomId: id });
  };
  await mk('c1', 'ali', 1);
  await mk('c2', 'veli', 3);
  const a = playerRun(3, 1);
  const v = playerRun(3, 3);
  h.clock.now += 5 * 60_000;
  await h.call('ali', 'finish', { roomId: 'c1', runs: a.runs });
  assert.equal(h.G('championshipDaily/3_2026-10-09').leaderUid, 'ali');
  await h.call('veli', 'finish', { roomId: 'c2', runs: v.runs });
  const d = h.G('championshipDaily/3_2026-10-09');
  assert.equal(d.leaderUid, 'veli', 'seviye 3 araç daha hızlı');
  assert.equal(d.leaderTimeMs, v.ms);
});

test('taFinish bahisli: kısa süre kazanır, bahis ödenir; geride kalan vazgeçince hemen biter', async () => {
  const h = setup();
  await h.db.doc('users/ali').set({ gold: 0 });
  await h.db.doc('users/veli').set({ gold: 0 });
  const room = () => ({ engine: 'ta', status: 'racing', betAmount: 1000, creatorUid: 'ali', participantUids: ['ali', 'veli'], deadlineMs: h.clock.now + 240_000, players: { ali: pl('ali', 5, 1), veli: pl('veli', 5, 2) } });
  await h.db.doc('raceRooms/b1').set(room());
  await h.call('ali', 'start', { roomId: 'b1' });
  await h.call('veli', 'start', { roomId: 'b1' });
  h.clock.now += 120_000;
  const a = playerRun(5, 1);
  const v = playerRun(5, 2);
  const r1 = await h.call('ali', 'finish', { roomId: 'b1', runs: a.runs });
  assert.equal(r1.waiting, true, 'rakip bekleniyor');
  assert.equal(h.G('raceRooms/b1').status, 'racing');
  await h.call('veli', 'finish', { roomId: 'b1', runs: v.runs });
  assert.equal(h.G('raceRooms/b1').winnerUid, 'veli');
  assert.equal(h.G('users/veli').gold, 2000);
  assert.equal(h.G('users/ali').gold, 0);

  // ikinci oda: ali bitirdi, veli onun süresini geçince vazgeçer (dnf) → ali kazanır
  await h.db.doc('raceRooms/b2').set(room());
  await h.call('ali', 'start', { roomId: 'b2' });
  await h.call('veli', 'start', { roomId: 'b2' });
  h.clock.now += 120_000;
  await h.call('ali', 'finish', { roomId: 'b2', runs: a.runs });
  await h.call('veli', 'finish', { roomId: 'b2', dnf: true });
  assert.equal(h.G('raceRooms/b2').winnerUid, 'ali');

  // üçüncü oda: süre doldu, kimse bitirmedi → berabere (iade)
  await h.db.doc('raceRooms/b3').set(room());
  await h.call('ali', 'timeout', { roomId: 'b3' });
  assert.equal(h.G('raceRooms/b3').status, 'racing', 'süre dolmadan bir şey olmaz');
  h.clock.now += 300_000;
  await h.call('ali', 'timeout', { roomId: 'b3' });
  assert.equal(h.G('raceRooms/b3').winnerUid, 'draw');
});

test('decideTaWinner kenar durumlar', () => {
  const room = { participantUids: ['a', 'b'] };
  assert.equal(decideTaWinner(room, { a: { finishMs: 50000 }, b: { finishMs: 50000 } }), 'draw');
  assert.equal(decideTaWinner(room, { a: { dnf: true }, b: {} }), 'b', 'vazgeçen kaybeder');
  assert.equal(decideTaWinner(room, { a: { finishMs: 60000 }, b: {} }), 'a');
  assert.equal(decideTaWinner(room, { a: {}, b: {} }), 'draw');
});

test('atölye: araç geliştirmesi seviye 1→2→3, maliyet aynı, 2. el değeri seviyeyle', () => {
  let v = { catalogId: 5, lifeDays: 20 };
  const j1 = workshopJob({ itemType: 'vehicle', item: v, action: 'upgrade', upgradeType: 'level' });
  assert.equal(j1.block, null);
  assert.equal(j1.qty, 200, 'fiyat/500 — eskisiyle aynı');
  v = { ...v, ...vehicleLevelUpPatch(v) };
  assert.equal(v.raceLevel, 2);
  v = { ...v, ...vehicleLevelUpPatch(v) };
  assert.equal(v.raceLevel, 3);
  assert.equal(workshopJob({ itemType: 'vehicle', item: v, action: 'upgrade', upgradeType: 'level' }).block, 'maxLevel');
  assert.equal(itemListingBand('vehicle', v).max, 100000 * 3);
  // eski istemci 'gear' gönderirse de bir seviye
  assert.equal(workshopJob({ itemType: 'vehicle', item: { catalogId: 5 }, action: 'upgrade', upgradeType: 'gear' }).block, null);
});
