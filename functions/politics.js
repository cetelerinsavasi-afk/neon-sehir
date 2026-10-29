// =============================================================================
// politics.js — v136 SEÇİM SİSTEMİ (sunucu)
// -----------------------------------------------------------------------------
// Takvim ve saf kurallar: functions/politicsRules.js (istemciyle ortak).
//
// Belgeler
//   politics/state                 (herkes okur) evre, döngü, hükümet, sıradaki imza günü
//   politicsCycles/{F}             (herkes okur) adaylar: ad, avatar, imza sayısı, yazı
//   politicsCycles/{F}/live/count  (herkes okur) SAYIM: sadece 21:00'dan sonra, açıklandıkça
//   politicsVoters/{F}_{uid}       (sadece sunucu) imza / adaylık / oy kullandı mı
//   politicsBallots/{F}_{uid}      (sadece sunucu) GİZLİ oy (aday + an)
//   politicsPrivate/{F}_tally      (sadece sunucu) 21:00'da kurulan dakikalık sayım çizelgesi
//   users/{uid}.pol                (sahibi okur) { c, cand, sign, voted } — buton durumu
//
// Kurallar
//   • Katılım (imza, adaylık, oy): başlangıç görevlerini bitirmiş oyuncular.
//   • Ya aday olunur ya imza verilir; ikisi birden olmaz. İmza / oy / adaylık geri alınmaz.
//   • Adaylık 500.000 altın → belediye kasası (gelir: 'adaylik'); 10 imza toplanamazsa iade yok.
//   • 10 imzaya ulaşan adaya yeni imza verilmez. Seçimde en hızlı 10 imzayı toplayan en üstte.
//   • Oylar gizli. Sayım 21:00–24:00: oylar verildiği sırayla, 7 kat hızlı açıklanır.
//   • Eşitlikte kura. Hiç başvuru yok / kimse 10 imza toplayamadı → seçim yok, ekip devam
//     eder, bir sonraki Cuma başvurular yeniden açılır.
//   • Pazartesi 00:00 (gece maaş listesi alındıktan SONRA): eski kadro görevden alınır,
//     kazanan başkan olur. Polis / imam ise o görevi biter.
// =============================================================================
import { randomInt } from 'node:crypto';
import { POLITICS, polDayKey, polAddDays, polMidnight, polWeekday, fridayAfter, termSignupDay, cycleTimes, phaseAt, revealAtMs, splitCandidates, cleanPoliticsText } from './politicsRules.js';
import { stateWrite } from './stateTreasury.js';
import { createCoup } from './politicsCoup.js';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const MIN = 60_000;
// gece işi gecikirse saat turu devralır: 00:40'tan sonra (gece işinin belediye
// maaş adımı bittiyse) ya da 04:00'ten sonra (gece işi hiç bitmediyse)
const NIGHT_FALLBACK_MS = 40 * MIN;
const NIGHT_FORCE_MS = 4 * 60 * MIN;

export function createPolitics({
  db,
  FieldValue,
  HttpsError,
  requireAuth,
  onCall,
  goldTag = (s) => s,
  assertCanSpeak = async () => {},
  belediye, // { installElected, snapshotStaffAndImam }
  resignPolice = async () => ({ skipped: true }), // uid → canlı teşkilattan çıkar
  removePolice = async () => ({ skipped: true }), // v136 darbe: başarısız EGM görevden alınır
  liveWorldId = async () => { const c = (await db.doc('gangSystem/config').get()).data() || {}; return c.liveWorldId || null; },
  now = () => Date.now(),
  rnd = (n) => randomInt(n), // 0..n-1 (kura)
}) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const inc = (n) => FieldValue.increment(n);
  const stateRef = db.doc('politics/state');
  const cycleRef = (c) => db.collection('politicsCycles').doc(c);
  const countRef = (c) => db.doc(`politicsCycles/${c}/live/count`);
  const voterRef = (c, uid) => db.collection('politicsVoters').doc(`${c}_${uid}`);
  const ballotRef = (c, uid) => db.collection('politicsBallots').doc(`${c}_${uid}`);
  const tallyRef = (c) => db.collection('politicsPrivate').doc(`${c}_tally`);
  const userRef = (uid) => db.collection('users').doc(uid);
  const smsTo = (tx, uid, text, type = 'secim') => tx.set(userRef(uid).collection('messages').doc(), { text, createdAt: FieldValue.serverTimestamp(), read: false, type });

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  // İlk okuma: belge yoksa mevcut belediye başkanıyla kurulur (yönetici hükümeti).
  async function readState() {
    const s = await stateRef.get();
    if (s.exists) return s.data();
    const main = (await db.doc('belediye/main').get()).data() || {};
    const bsk = main.seats?.bsk?.uid ? main.seats.bsk : null;
    const init = {
      v: 1,
      phase: 'idle',
      cycle: null,
      nextSignupDay: POLITICS.FIRST_SIGNUP_DAY,
      gov: bsk ? { uid: bsk.uid, name: bsk.name || 'Oyuncu', since: polDayKey(Number(bsk.sinceMs) || now()), kind: 'admin' } : null,
      coupFreeFromMs: 0,
      last: null,
      createdAtMs: now(),
      updatedAtMs: now(),
    };
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(stateRef);
      if (!cur.exists) tx.set(stateRef, init);
    });
    return (await stateRef.get()).data();
  }

  function eligibleBlock(user) {
    if (!user) return 'Oyuncu bulunamadı.';
    if (!user.onboardingRewardClaimed) return 'Seçimlere katılmak için önce başlangıç görevlerini (📋) tamamlamalısın.';
    return null;
  }
  // users.pol: bu döngünün durumu (eski döngünün bayrakları taşınmaz — tam yazılır)
  const polOf = (u, c) => (u?.pol?.c === c ? { c, cand: Boolean(u.pol.cand), sign: u.pol.sign || null, voted: Boolean(u.pol.voted), vote: u.pol.vote || null } : { c, cand: false, sign: null, voted: false, vote: null });

  async function requirePhase(phase) {
    const st = await readState();
    const t = now();
    const ok = Array.isArray(phase) ? phase : [phase];
    if (!st.cycle || !ok.includes(st.phase) || !ok.includes(phaseAt(st.cycle, t))) {
      const at = phaseAt(st.cycle, t);
      if (st.cycle && at !== st.phase) fail('unavailable', 'Seçim takvimi güncelleniyor — birkaç dakika sonra tekrar dene.');
      fail('failed-precondition', ok.includes('signup') ? 'Şu an adaylık / imza dönemi değil.' : ok.includes('election') ? 'Şu an oylama yok.' : 'Şu an bu işlem yapılamaz.');
    }
    return st;
  }

  // v136 — darbe (functions/politicsCoup.js)
  const coup = createCoup({ db, FieldValue, fail, now, smsTo, userRef, stateRef, readState: () => readState(), belediye, resignPolice, removePolice, liveWorldId, assertCanSpeak });

  // ---------------------------------------------------------------------------
  // Oyuncu işlemleri
  // ---------------------------------------------------------------------------
  async function apply(uid, { text } = {}) {
    const st = await requirePhase('signup');
    const c = st.cycle;
    const msg = cleanPoliticsText(text);
    if (msg) await assertCanSpeak(uid, { text: msg });
    const t = now();
    await db.runTransaction(async (tx) => {
      const [us, vs, cs] = await Promise.all([tx.get(userRef(uid)), tx.get(voterRef(c, uid)), tx.get(cycleRef(c))]);
      const u = us.data();
      const block = eligibleBlock(u);
      if (block) fail('failed-precondition', block);
      if (cs.data()?.status !== 'signup') fail('failed-precondition', 'Şu an adaylık dönemi değil.');
      const v = vs.data() || {};
      if (v.cand || cs.data()?.cands?.[uid]) fail('already-exists', 'Zaten adaysın.');
      if (v.sign) fail('failed-precondition', 'Bir adaya imza verdin — aynı seçimde aday olamazsın.');
      if (Number(u.gold || 0) < POLITICS.FEE) fail('failed-precondition', `Adaylık için ${fmt(POLITICS.FEE)} altın gerekir.`);
      const pol = { ...polOf(u, c), cand: true };
      tx.update(userRef(uid), { gold: inc(-POLITICS.FEE), goldTag: goldTag('adaylik'), pol });
      tx.set(voterRef(c, uid), { cycle: c, uid, cand: true, candAt: t }, { merge: true });
      tx.update(cycleRef(c), {
        [`cands.${uid}`]: { name: u.displayName || 'Oyuncu', avatar: u.avatar || null, sigs: 0, appliedAtMs: t, fullAtMs: null, text: msg, textAtMs: msg ? t : 0 },
        updatedAtMs: t,
      });
      stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'adaylik', amount: POLITICS.FEE, atMs: t, stat: { adaylik_n: 1 } });
      smsTo(tx, uid, `🗳️ Adaylık başvurun alındı. ${fmt(POLITICS.FEE)} altın belediye kasasına geçti. Pazar 00:00'a kadar ${POLITICS.NEED} imza toplarsan seçime katılırsın.`);
    });
    return { ok: true };
  }

  async function sign(uid, { cand } = {}) {
    const st = await requirePhase('signup');
    const c = st.cycle;
    const target = String(cand || '');
    if (!target || target === uid) fail('invalid-argument', 'Kendine imza veremezsin.');
    const t = now();
    let full = false;
    await db.runTransaction(async (tx) => {
      const [us, vs, cs] = await Promise.all([tx.get(userRef(uid)), tx.get(voterRef(c, uid)), tx.get(cycleRef(c))]);
      const u = us.data();
      const block = eligibleBlock(u);
      if (block) fail('failed-precondition', block);
      const cy = cs.data() || {};
      if (cy.status !== 'signup') fail('failed-precondition', 'İmza dönemi bitti.');
      const v = vs.data() || {};
      if (v.cand || cy.cands?.[uid]) fail('failed-precondition', 'Adaysın — başka bir adaya imza veremezsin.');
      if (v.sign) fail('already-exists', 'Bu seçimde imzanı zaten verdin.');
      const k = cy.cands?.[target];
      if (!k) fail('not-found', 'Aday bulunamadı.');
      const n = Number(k.sigs || 0);
      if (n >= POLITICS.NEED) fail('failed-precondition', `Bu aday ${POLITICS.NEED} imzayı topladı.`);
      full = n + 1 >= POLITICS.NEED;
      tx.update(cycleRef(c), { [`cands.${target}.sigs`]: n + 1, ...(full ? { [`cands.${target}.fullAtMs`]: t } : {}), updatedAtMs: t });
      tx.set(voterRef(c, uid), { cycle: c, uid, sign: target, signAt: t }, { merge: true });
      tx.update(userRef(uid), { pol: { ...polOf(u, c), sign: target } });
      if (full) smsTo(tx, target, `🗳️ ${POLITICS.NEED} imzayı topladın! Pazar 00:00'da seçim başladığında sandıktasın.`);
    });
    return { ok: true, full };
  }

  async function vote(uid, { cand } = {}) {
    const st = await requirePhase('election');
    const c = st.cycle;
    const target = String(cand || '');
    const cy = (await cycleRef(c).get()).data() || {};
    if (cy.status !== 'election' || !(cy.finalists || []).includes(target)) fail('not-found', 'Aday bulunamadı.');
    const t = now();
    if (t >= cycleTimes(c).voteEnd) fail('deadline-exceeded', 'Oylama bitti.');
    await db.runTransaction(async (tx) => {
      const [us, vs, bs] = await Promise.all([tx.get(userRef(uid)), tx.get(voterRef(c, uid)), tx.get(ballotRef(c, uid))]);
      const u = us.data();
      const block = eligibleBlock(u);
      if (block) fail('failed-precondition', block);
      if (vs.data()?.voted || bs.exists) fail('already-exists', 'Oyunu zaten kullandın.');
      tx.set(ballotRef(c, uid), { cycle: c, c: target, at: t });
      tx.set(voterRef(c, uid), { cycle: c, uid, voted: true, voteAt: t }, { merge: true });
      tx.update(userRef(uid), { pol: { ...polOf(u, c), voted: true, vote: target } }); // kendi belgesi — sadece sahibi okur
    });
    return { ok: true };
  }

  // Aday yazısı: imza döneminden seçim sonuna (Pazartesi 00:00) kadar değiştirilebilir
  async function setText(uid, { text } = {}) {
    const st = await requirePhase(['signup', 'election', 'counting']);
    const c = st.cycle;
    const msg = cleanPoliticsText(text);
    if (msg) await assertCanSpeak(uid, { text: msg });
    const t = now();
    await db.runTransaction(async (tx) => {
      const cs = await tx.get(cycleRef(c));
      const k = cs.data()?.cands?.[uid];
      if (!k) fail('permission-denied', 'Sadece adaylar yazı yazabilir.');
      if (t - Number(k.textAtMs || 0) < POLITICS.TEXT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz bekle.');
      tx.update(cycleRef(c), { [`cands.${uid}.text`]: msg, [`cands.${uid}.textAtMs`]: t });
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Evre geçişleri
  // ---------------------------------------------------------------------------
  // Cuma 00:00 — imza dönemi
  async function startSignup(day) {
    let started = false;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data();
      if (!s || s.phase !== 'idle' || !s.nextSignupDay || s.nextSignupDay > day || polWeekday(day) !== 5) return;
      const cs = await tx.get(cycleRef(day));
      if (cs.exists) return;
      const t = now();
      tx.set(cycleRef(day), { cycle: day, status: 'signup', cands: {}, finalists: [], createdAtMs: t, updatedAtMs: t, times: cycleTimes(day) });
      tx.update(stateRef, { phase: 'signup', cycle: day, times: cycleTimes(day), nextSignupDay: null, updatedAtMs: t });
      started = true;
    });
    return started;
  }

  // Pazar 00:00 — 10 imzayı toplayanlar sandığa; kimse yoksa seçim olmaz
  async function closeSignup(day) {
    let res = null;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data();
      if (!s || s.phase !== 'signup' || !s.cycle || day < polAddDays(s.cycle, 2)) return;
      const c = s.cycle;
      const cy = (await tx.get(cycleRef(c))).data() || {};
      const { full, pending } = splitCandidates(cy.cands);
      const t = now();
      if (!full.length) {
        const outcome = pending.length ? 'noQualified' : 'noApplicants';
        const next = fridayAfter(day);
        tx.update(cycleRef(c), { status: 'failed', outcome, finalists: [], closedAtMs: t, updatedAtMs: t });
        tx.update(stateRef, { phase: 'idle', cycle: null, times: null, nextSignupDay: next, last: { cycle: c, outcome, day, applicants: pending.length, govName: s.gov?.name || null }, updatedAtMs: t });
        for (const k of pending) smsTo(tx, k.uid, `🗳️ Pazar 00:00'a kadar ${POLITICS.NEED} imza toplayamadın; bu seçime katılamıyorsun.`);
        res = { failed: outcome, next };
        return;
      }
      tx.update(cycleRef(c), { status: 'election', finalists: full.map((k) => k.uid), closedAtMs: t, updatedAtMs: t });
      tx.update(stateRef, { phase: 'election', updatedAtMs: t });
      for (const k of pending) smsTo(tx, k.uid, `🗳️ Pazar 00:00'a kadar ${POLITICS.NEED} imza toplayamadın; bu seçime katılamıyorsun.`);
      for (const k of full) smsTo(tx, k.uid, '🗳️ Seçim başladı! Oylama bu akşam 21:00\'e kadar sürecek.');
      res = { finalists: full.length };
    });
    return res;
  }

  // Pazar 21:00 — gizli oylar okunur, dakikalık açıklama çizelgesi kurulur (bir kez)
  async function buildTally(c) {
    const ex = await tallyRef(c).get();
    if (ex.exists) return ex.data();
    const cy = (await cycleRef(c).get()).data() || {};
    const fin = cy.finalists || [];
    const t = cycleTimes(c);
    const snap = await db.collection('politicsBallots').where('cycle', '==', c).get();
    const buckets = {};
    let total = 0;
    snap.forEach((d) => {
      const b = d.data();
      const i = fin.indexOf(b.c);
      if (i < 0) return;
      const m = Math.max(0, Math.min(POLITICS.COUNT_HOURS * 60 - 1, Math.floor((revealAtMs(c, Number(b.at) || t.signupEnd) - t.voteEnd) / MIN)));
      if (!buckets[m]) buckets[m] = fin.map(() => 0);
      buckets[m][i] += 1;
      total += 1;
    });
    const tally = { cycle: c, finalists: fin, buckets, total, builtAtMs: now() };
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(tallyRef(c));
      if (cur.exists) return;
      tx.set(tallyRef(c), tally);
    });
    return (await tallyRef(c).get()).data();
  }
  function countsUpTo(tally, minute) {
    const fin = tally.finalists || [];
    const out = fin.map(() => 0);
    for (const [m, arr] of Object.entries(tally.buckets || {})) {
      if (Number(m) > minute) continue;
      arr.forEach((n, i) => (out[i] += Number(n) || 0));
    }
    return Object.fromEntries(fin.map((uid, i) => [uid, out[i]]));
  }
  async function startCounting(c) {
    const tally = await buildTally(c);
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data();
      if (s?.phase !== 'election' || s.cycle !== c) return;
      tx.update(stateRef, { phase: 'counting', updatedAtMs: now() });
      tx.update(cycleRef(c), { status: 'counting', updatedAtMs: now() });
      tx.set(countRef(c), { counts: countsUpTo(tally, -1), total: 0, minute: -1, done: false, atMs: now() });
    });
    return tally;
  }
  let tallyCache = null;
  async function revealTick(c) {
    const t = cycleTimes(c);
    const minute = Math.min(POLITICS.COUNT_HOURS * 60 - 1, Math.floor((now() - t.voteEnd) / MIN));
    if (minute < 0) return null;
    if (tallyCache?.cycle !== c) tallyCache = await buildTally(c);
    const counts = countsUpTo(tallyCache, minute);
    const total = Object.values(counts).reduce((a, n) => a + n, 0);
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(countRef(c))).data();
      if (cur?.done || Number(cur?.minute ?? -2) >= minute) return;
      tx.set(countRef(c), { counts, total, minute, done: false, atMs: now() });
    });
    return { minute, total };
  }

  // Pazartesi 00:00 — sonuç + devir (gece maaş listesi alındıktan SONRA)
  async function finalize(day) {
    const s0 = (await stateRef.get()).data();
    if (!s0 || !['election', 'counting'].includes(s0.phase) || !s0.cycle || day < polAddDays(s0.cycle, 3)) return null;
    const c = s0.cycle;
    const tally = await buildTally(c);
    const counts = countsUpTo(tally, Infinity);
    const fin = tally.finalists || [];
    const total = Object.values(counts).reduce((a, n) => a + n, 0);
    const max = Math.max(0, ...fin.map((u) => counts[u] || 0));
    const top = fin.filter((u) => (counts[u] || 0) === max);
    // kura bir kez çekilir ve kaydedilir (tekrar çalıştırmada aynı kazanan)
    let pickRef = s0.pending?.cycle === c ? s0.pending : null;
    if (!pickRef) {
      const winner = top.length > 1 ? top[rnd(top.length)] : top[0];
      pickRef = { cycle: c, winner, tie: top.length > 1, counts, total };
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data();
        if (s?.pending?.cycle === c) {
          pickRef = s.pending;
          return;
        }
        tx.update(stateRef, { pending: pickRef });
      });
    }
    const { winner, tie } = pickRef;
    const cy = (await cycleRef(c).get()).data() || {};
    const w = cy.cands?.[winner] || {};
    // kadro devri — maaş listesi (biten gün) alınmış olmalı
    if (belediye?.snapshotStaffAndImam) await belediye.snapshotStaffAndImam(day);
    await belediye.installElected(winner, { key: `election_${c}`, source: 'election', name: w.name });
    const since = day;
    let out = null;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data();
      if (!s || !['election', 'counting'].includes(s.phase) || s.cycle !== c) return;
      const t = now();
      const sorted = [...fin].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
      const result = { winner, winnerName: w.name || 'Oyuncu', tie, total, counts, order: sorted };
      tx.update(cycleRef(c), { status: 'done', result, doneAtMs: t, updatedAtMs: t });
      tx.set(countRef(c), { counts, total, minute: POLITICS.COUNT_HOURS * 60, done: true, winner, tie, atMs: t });
      const prevGov = s.gov || null;
      tx.update(stateRef, {
        phase: 'results',
        gov: { uid: winner, name: w.name || 'Oyuncu', since, kind: 'election', cycle: c },
        nextSignupDay: termSignupDay(since),
        coupFreeFromMs: polMidnight(since) + POLITICS.COUP_GUARD_DAYS * 24 * 3_600_000,
        last: { cycle: c, outcome: 'won', day, winner, winnerName: w.name || 'Oyuncu', tie, total, votes: counts[winner] || 0, reelected: prevGov?.uid === winner, prevName: prevGov?.name || null, finalists: sorted.map((u) => ({ uid: u, name: cy.cands?.[u]?.name || 'Oyuncu', votes: counts[u] || 0 })) },
        pending: FieldValue.delete(),
        jobCheck: winner,
        updatedAtMs: t,
      });
      smsTo(tx, winner, `🏛️ Tebrikler! ${fmt(counts[winner] || 0)} oyla Neon Şehir Belediye Başkanı seçildin${tie ? ' (eşitlik kurayla bozuldu)' : ''}. Ekibini Belediye › Başkanlık sekmesinden kurabilirsin.`);
      for (const u of fin) if (u !== winner) smsTo(tx, u, `🗳️ Seçimi ${w.name || 'rakibin'} kazandı. Sen ${fmt(counts[u] || 0)} oy aldın.`);
      out = { winner, tie, total };
    });
    await clearOtherJobs(winner).catch((err) => console.error('politics: başkanın diğer görevi', err?.message || err));
    return out;
  }

  // Seçilen başkan polis / imam ise o görev biter (belediyede başka devlet görevi olmaz)
  async function clearOtherJobs(uid) {
    if (!uid) return;
    const u = (await userRef(uid).get()).data() || {};
    if (u.isImam) {
      await db.runTransaction(async (tx) => {
        const cur = db.doc('imamState/current');
        const im = await tx.get(cur);
        if (im.data()?.uid === uid) tx.delete(cur);
        tx.set(userRef(uid), { isImam: false }, { merge: true });
        smsTo(tx, uid, '🕌 Belediye başkanı seçildiğin için imamlık görevin sona erdi.', 'imam_resigned');
      });
    }
    const r = await resignPolice(uid);
    if (r && !r.notMember && !r.skipped) {
      await userRef(uid).collection('messages').add({ text: '🚓 Belediye başkanı seçildiğin için polislik görevin sona erdi.', createdAt: FieldValue.serverTimestamp(), read: false, type: 'secim' });
    }
    await stateRef.set({ jobCheck: FieldValue.delete() }, { merge: true });
  }

  // Salı 00:00 — sonuç ekranı kalkar
  async function endResults(day) {
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data();
      if (s?.phase !== 'results' || !s.cycle || day < polAddDays(s.cycle, 4)) return;
      tx.update(stateRef, { phase: 'idle', cycle: null, times: null, updatedAtMs: now() });
    });
  }

  // Gece işi (dailyReset — belediye maaş listesinden sonra). İdempotent; kaçırılmış
  // adımlar sırayla işlenir.
  async function nightly(day = polDayKey(now())) {
    await readState();
    const log = [];
    // darbe geçişleri önce (karar süresi Cuma gecesi dolarsa aynı gece imza dönemi başlar)
    const cl = await coup.nightly(day).catch((err) => {
      console.error('politics: darbe gece işi', err?.message || err);
      return [['error', String(err?.message || err)]];
    });
    if (cl.length) log.push(['coup', cl]);
    for (let i = 0; i < 4; i += 1) {
      const s = (await stateRef.get()).data();
      if (s.phase === 'results' && day >= polAddDays(s.cycle, 4)) {
        await endResults(day);
        log.push('results→idle');
        continue;
      }
      if (['election', 'counting'].includes(s.phase) && day >= polAddDays(s.cycle, 3)) {
        log.push(['final', await finalize(day)]);
        continue;
      }
      if (s.phase === 'signup' && day >= polAddDays(s.cycle, 2)) {
        log.push(['close', await closeSignup(day)]);
        continue;
      }
      if (s.phase === 'idle' && s.nextSignupDay && s.nextSignupDay <= day && polWeekday(day) === 5) {
        if (await startSignup(day)) {
          log.push('signup');
          continue;
        }
      }
      // hükümet yoksa ve sıradaki imza günü hiç yoksa (eski kayıt) bir sonraki Cuma
      if (s.phase === 'idle' && !s.nextSignupDay) {
        await stateRef.update({ nextSignupDay: fridayAfter(day), updatedAtMs: now() });
        log.push('next');
      }
      break;
    }
    return log;
  }

  // Saat turu (dakikada bir): 21:00 sayımı başlatır, açıklamaları ilerletir; gece işi
  // gecikirse (00:10'dan sonra hâlâ eski evredeyse) geçişleri devralır.
  async function clock() {
    const st = await readState();
    const t = now();
    const day = polDayKey(t);
    const out = {};
    if (st.cycle && st.phase === 'election' && t >= cycleTimes(st.cycle).voteEnd && t < cycleTimes(st.cycle).countEnd) {
      await startCounting(st.cycle);
      out.counting = true;
    }
    const s2 = out.counting ? (await stateRef.get()).data() : st;
    if (s2.cycle && s2.phase === 'counting' && t < cycleTimes(s2.cycle).countEnd) out.reveal = await revealTick(s2.cycle);
    const lag = t - polMidnight(day) >= NIGHT_FALLBACK_MS;
    const expected = phaseAt(s2.cycle, t);
    const behind = (s2.cycle && expected !== s2.phase && !(s2.phase === 'election' && expected === 'counting')) || (s2.phase === 'idle' && s2.nextSignupDay && s2.nextSignupDay <= day && polWeekday(day) === 5);
    // darbe geçişi gecikmiş mi (00:01–05:00 arası; plan belgesi okuması). Darbe geçişleri
    // çete saatinin o geceki turunu bekler (politicsCoup.gangTickDone) — tur bitince
    // burada (dakikada bir) yakalanır.
    let coupDue = false;
    const coupLag = t - polMidnight(day) >= MIN;
    if (coupLag && t - polMidnight(day) < 5 * 60 * MIN) {
      const cp = s2.coup;
      coupDue = Boolean(cp && ((cp.status === 'active' && cp.endMs <= t) || (cp.status === 'decision' && cp.decideUntilMs <= t)));
      if (!coupDue) {
        const p = (await db.doc('coupPlans/current').get()).data();
        coupDue = Boolean(p && ((p.status === 'planned' && p.voteStartMs <= t) || (p.status === 'voting' && p.voteEndMs <= t)));
      }
    }
    if ((lag && behind) || coupDue) {
      const run = (await db.doc(`dailyResetRuns/${day}`).get()).data();
      if (run?.steps?.belediyePayroll || t - polMidnight(day) >= NIGHT_FORCE_MS) out.nightly = await nightly(day);
    }
    if (s2.jobCheck) await clearOtherJobs(s2.jobCheck).catch(() => {});
    // başarılı darbe: karar için son 12 saat hatırlatması
    if (s2.coup?.status === 'decision') out.remind = await coup.remindTick(s2, t).catch(() => null);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Callable
  // ---------------------------------------------------------------------------
  const OPS = {
    apply: (uid, d) => apply(uid, d),
    sign: (uid, d) => sign(uid, d),
    vote: (uid, d) => vote(uid, d),
    setText: (uid, d) => setText(uid, d),
    ...coup.OPS,
  };
  async function handle(uid, data) {
    const fn = OPS[String(data?.op || '')];
    if (!fn) fail('invalid-argument', 'Geçersiz işlem.');
    return fn(uid, data || {});
  }
  const politicsAction = onCall
    ? onCall(async (request) => {
        const uid = requireAuth(request);
        return handle(uid, request.data || {});
      })
    : null;

  return { politicsAction, coup, handle, nightly, clock, readState, buildTally, finalize, closeSignup, startSignup, startCounting, revealTick, clearOtherJobs };
}
