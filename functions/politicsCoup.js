// =============================================================================
// politicsCoup.js — v136 DARBE SİSTEMİ (sunucu)
// -----------------------------------------------------------------------------
// Akış (D = Emniyet Genel Müdürünün karar verdiği gün — sadece Pazar / Pazartesi):
//   D       EGM "Darbe başlat" → plan (GİZLİ; sadece rütbeli polisler görür). 00:00'a
//           kadar iptal edebilir.
//   D+1 00  rütbeli polislere (EGM + Amirler + Başkomiserler; o anki liste) EVET/HAYIR
//           oylaması — 24 saat. Oylar gizli, sayılar rütbelilere açık.
//   D+2 00  en az 3 EVET ve EVET > HAYIR → DARBE başlar (herkese açık, 24 saat).
//           Değilse iptal (EGM'ye bir şey olmaz; oy verenlere de).
//   D+2–D+3 her oyuncu (başlangıç görevleri bitmiş) BİR KEZ taraf seçer:
//             hükümeti savun: Komiser ve üstü polis 3 güç (+1.000.000 polis prestiji);
//                             Polis Memuru ve vatandaş 1 (darbe sırasında polis olanlar
//                             Polis Memuru olduğu için rütbe kasamaz)
//             darbeyi destekle: herkes 1 güç
//           EGM, oylama sunulduğunda EGM ise darbe bitene kadar EGM kalır (prestiji
//           düşse bile — gang/clock.js recomputeIntelRanks, coupRankLock); darbe
//           sürerken istifa edemez, atılamaz, hakkında çıkarma oylaması açılamaz.
//           Plan → oylama arasında EGM değilse oylama başlamaz; oylama sürerken
//           teşkilattan ayrıldıysa darbe başlamaz (gece geçişleri çete saatinin
//           o geceki turundan SONRA çalışır — rütbe / çıkarma oylamaları kesinleşsin).
//   D+3 00  darbe gücü > hükümet gücü → BAŞARILI: belediye kadrosu anında görevden
//           alınır; EGM'nin 24 saat kararı: 'rule' (başkan olur, polislikten ayrılır,
//           hükümet gibi 7 gün korumalı, 21 gün + ilk Cuma kuralı) ya da 'election'
//           (polis kalır, belediye boş, bir sonraki Cuma imza dönemi). Karar vermezse
//           erken seçim (D+4 Cuma ise o gece imza dönemi başlar).
//           Eşitlik ya da hükümet üstünse BAŞARISIZ: hükümet devam eder, EGM teşkilattan
//           atılır.
// Koşullar: hükümet (başkan) olmalı, göreve gelişinin 7 günü dolmuş olmalı, seçim
// süreci (imza / oylama / sonuç) olmamalı, sürmekte olan başka darbe olmamalı.
//
// Belgeler
//   coupPlans/current          (rütbeli polisler okur) plan + polis oylaması sayıları
//   coupPlans/current/ballots  (sadece sunucu) polis oyları
//   politicsCoups/{id}         (herkes okur) darbe ekranı: güçler, sayılar, açıklamalar
//   politicsCoupVotes/{id}_{uid} (sadece sunucu) halkın tarafı
//   politics/state.coup        (herkes) { id, status: 'active'|'decision', ... } · lastCoup
//   users/{uid}.coupPlanVote / .coupSide  (sahibi okur) buton durumları
// =============================================================================
import { POLITICS, polDayKey, polAddDays, polMidnight, polWeekday, fridayAfter, fridayOnOrAfter, termSignupDay, cleanPoliticsText } from './politicsRules.js';

export const COUP = {
  START_WEEKDAYS: [0, 1], // Pazar, Pazartesi
  RANKED: ['baskan', 'sef', 'uzman'],
  MIN_YES: 3,
  POLICE_GOV_POWER: 3,
  CITIZEN_POWER: 1,
  POLICE_GOV_PRESTIGE: 1_000_000,
  TEXT_MAX: POLITICS.TEXT_MAX,
};
const H = 3_600_000;
const D = 24 * H;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

/** Polis oylaması sonucu: en az 3 evet ve çoğunluk (3-2, 4-3 geçer; 3-3, 2-2 geçmez) */
export function coupVotePassed(yes, no) {
  return Number(yes) >= COUP.MIN_YES && Number(yes) > Number(no);
}
/**
 * Darbe kilidi: EGM'nin rütbesi sabitlenir ve teşkilattan çıkarılamaz.
 *   - darbe sürüyor (state.coup active) → darbe çözülene kadar
 *   - darbe başarılı, karar bekleniyor (decision) → istifa / atılma yok; rütbe serbest
 *   - polis oylaması bitti + geçti (darbe bu gece başlayacak) → aynı
 * Dönüş: { rid, startMs } | null. rankOnly: rütbe kilidi sadece darbe süresince
 * (bitiş anından sonra rütbeler normal hesaplanır — sonuç ne olursa olsun).
 */
export function coupLock({ state, plan, now, rankOnly = false }) {
  const cp = state?.coup;
  if (cp?.status === 'active' && cp.leaderRid) {
    if (rankOnly && now >= Number(cp.endMs || 0)) return null;
    return { rid: cp.leaderRid, startMs: Number(cp.startMs || 0) };
  }
  // başarılı darbe: karar verilene kadar istifa / atılma yok (rütbe normal hesaplanır)
  if (cp?.status === 'decision' && cp.leaderRid) return rankOnly ? null : { rid: cp.leaderRid, startMs: Number(cp.startMs || 0) };
  if (plan?.status === 'voting' && plan.leaderRid && now >= Number(plan.voteEndMs || Infinity) && coupVotePassed(plan.yes, plan.no) && state?.gov?.uid && (!state.phase || state.phase === 'idle')) {
    return { rid: plan.leaderRid, startMs: Number(plan.voteEndMs) };
  }
  return null;
}
/** Darbe gücü: hükümeti savunan Komiser ve üstü polis 3, diğer herkes 1 */
export function coupPowerOf(side, intelRank) {
  const ranked = Boolean(intelRank) && intelRank !== 'muhbir';
  return side === 'gov' && ranked ? { power: COUP.POLICE_GOV_POWER, prestige: COUP.POLICE_GOV_PRESTIGE } : { power: COUP.CITIZEN_POWER, prestige: 0 };
}
/** Halk darbesi: darbe gücü hükümetinkinden FAZLA ise başarılı (eşitlikte hükümet) */
export function coupWon(power) {
  return Number(power?.coup || 0) > Number(power?.gov || 0);
}

export function createCoup({ db, FieldValue, fail, now, smsTo, userRef, stateRef, readState, belediye, resignPolice, removePolice, liveWorldId, assertCanSpeak = async () => {} }) {
  const inc = (n) => FieldValue.increment(n);
  const planRef = db.doc('coupPlans/current');
  // oy belgesi plan anahtarıyla (aynı gün iptal edilip yeniden kurulan plan ayrı sayılır)
  const ballotRef = (key, rid) => db.doc(`coupPlans/current/ballots/${key}_${rid}`);
  const coupRef = (id) => db.collection('politicsCoups').doc(id);
  const sideRef = (id, uid) => db.collection('politicsCoupVotes').doc(`${id}_${uid}`);
  // EGM'nin gerçek kimliği SADECE sunucuda (plan belgesini rütbeli polisler okur)
  const leaderRef = db.doc('politicsPrivate/coupLeader');
  const leaderUidOf = async (id) => {
    const d = (await leaderRef.get()).data();
    return d?.id === id ? d.uid : null;
  };

  // Gece geçişleri çete saatinin o geceki turundan sonra (rütbeler + çıkarma oylamaları)
  async function gangTickDone(w, day) {
    const wd = (await db.doc(`gangWorlds/${w}`).get()).data();
    return !wd?.lastTickDateKey || wd.lastTickDateKey >= day;
  }

  async function membershipOf(uid, tx = null) {
    const w = await liveWorldId();
    if (!w) return { w: null, ms: {} };
    const ref = db.doc(`gangWorlds/${w}/memberships/${uid}`);
    const s = tx ? await tx.get(ref) : await ref.get();
    return { w, ms: s.data() || {} };
  }

  // EGM'nin darbe başlatıp başlatamayacağı (istemci de aynı kontrolü gösterir)
  function startBlock(st, t) {
    const day = polDayKey(t);
    if (!COUP.START_WEEKDAYS.includes(polWeekday(day))) return 'Darbe sadece Pazar ve Pazartesi başlatılabilir.';
    if (!st?.gov?.uid) return 'Şu an devletin başında kimse yok.';
    if (st.phase && st.phase !== 'idle') return 'Seçim süreci varken darbe yapılamaz.';
    if (st.coup) return 'Zaten süren bir darbe var.';
    if (Number(st.coupFreeFromMs || 0) > t) return `Yeni hükümetin ilk 7 günü darbe yapılamaz (${Math.ceil((st.coupFreeFromMs - t) / H)} saat kaldı).`;
    return null;
  }

  // ---------------------------------------------------------------------------
  // EGM: plan / iptal
  // ---------------------------------------------------------------------------
  async function plan(uid) {
    const t = now();
    const st = await readState();
    const block = startBlock(st, t);
    if (block) fail('failed-precondition', block);
    const day = polDayKey(t);
    await db.runTransaction(async (tx) => {
      const [{ ms }, ps, s] = await Promise.all([membershipOf(uid, tx), tx.get(planRef), tx.get(stateRef)]);
      if (!ms.intelRosterId || ms.intelRank !== 'baskan') fail('permission-denied', 'Darbeyi sadece Emniyet Genel Müdürü başlatabilir.');
      const again = startBlock(s.data(), t);
      if (again) fail('failed-precondition', again);
      const p = ps.data();
      if (p && ['planned', 'voting'].includes(p.status)) fail('failed-precondition', 'Zaten bir darbe planı var.');
      tx.set(planRef, {
        id: day,
        key: String(t),
        status: 'planned',
        leaderRid: ms.intelRosterId,
        leaderCode: ms.intelCodeName || 'Emniyet Genel Müdürü',
        decidedAtMs: t,
        voteStartMs: polMidnight(polAddDays(day, 1)),
        voteEndMs: polMidnight(polAddDays(day, 2)),
        voters: [],
        yes: 0,
        no: 0,
      });
    });
    return { ok: true };
  }

  async function cancel(uid) {
    await db.runTransaction(async (tx) => {
      const [{ ms }, ps] = await Promise.all([membershipOf(uid, tx), tx.get(planRef)]);
      const p = ps.data();
      if (!p || p.status !== 'planned') fail('failed-precondition', 'İptal edilecek bir plan yok.');
      if (ms.intelRosterId !== p.leaderRid) fail('permission-denied', 'Planı sadece başlatan iptal edebilir.');
      tx.update(planRef, { status: 'cancelled', cancelReason: 'leader', resolvedAtMs: now() });
    });
    return { ok: true };
  }

  // Rütbeli polis: evet / hayır (geri alınmaz)
  async function policeVote(uid, { choice } = {}) {
    const c = choice === 'yes' ? 'yes' : choice === 'no' ? 'no' : null;
    if (!c) fail('invalid-argument', 'Geçersiz oy.');
    const t = now();
    await db.runTransaction(async (tx) => {
      const [{ ms }, ps, us] = await Promise.all([membershipOf(uid, tx), tx.get(planRef), tx.get(userRef(uid))]);
      const p = ps.data();
      if (!p || p.status !== 'voting' || t >= p.voteEndMs) fail('failed-precondition', 'Şu an darbe oylaması yok.');
      const rid = ms.intelRosterId;
      if (!rid || !(p.voters || []).includes(rid)) fail('permission-denied', 'Bu oylamada oy hakkın yok.');
      const b = await tx.get(ballotRef(p.key || p.id, rid));
      if (b.exists) fail('already-exists', 'Oyunu zaten kullandın.');
      tx.set(ballotRef(p.key || p.id, rid), { choice: c, atMs: t });
      tx.update(planRef, { [c]: inc(1), votedCount: inc(1) });
      if (us.exists) tx.update(userRef(uid), { coupPlanVote: { id: p.key || p.id, choice: c, endMs: p.voteEndMs } });
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Halk: taraf seç (bir kez; geri alınmaz)
  // ---------------------------------------------------------------------------
  async function join(uid, { side } = {}) {
    const sd = side === 'coup' ? 'coup' : side === 'gov' ? 'gov' : null;
    if (!sd) fail('invalid-argument', 'Geçersiz taraf.');
    const t = now();
    const st = await readState();
    const cp = st.coup;
    if (!cp || cp.status !== 'active' || t < cp.startMs || t >= cp.endMs) fail('failed-precondition', 'Şu an süren bir darbe yok.');
    const id = cp.id;
    let out = null;
    await db.runTransaction(async (tx) => {
      const [us, vs, mem] = await Promise.all([tx.get(userRef(uid)), tx.get(sideRef(id, uid)), membershipOf(uid, tx)]);
      const u = us.data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if (!u.onboardingRewardClaimed) fail('failed-precondition', 'Darbeye katılmak için önce başlangıç görevlerini (📋) tamamlamalısın.');
      if (vs.exists) fail('already-exists', 'Tarafını zaten seçtin.');
      const police = Boolean(mem.ms.intelRosterId);
      const { power, prestige } = police ? coupPowerOf(sd, mem.ms.intelRank || 'muhbir') : coupPowerOf(sd, null);
      tx.set(sideRef(id, uid), { coup: id, uid, side: sd, police, power, atMs: t });
      tx.set(coupRef(id), { power: { [sd]: inc(power) }, count: { [sd]: inc(1) }, ...(police ? { police: { [sd]: inc(1) } } : {}), updatedAtMs: t }, { merge: true });
      tx.update(userRef(uid), { coupSide: { id, side: sd } });
      if (prestige && mem.w) tx.update(db.doc(`gangWorlds/${mem.w}/intelRoster/${mem.ms.intelRosterId}`), { prestige: inc(prestige), lastActiveAtMs: t });
      out = { ok: true, power, prestige };
    });
    return out;
  }

  // Açıklama: darbeci (EGM, kod adıyla) · hükümet (başkan + yardımcılar)
  async function setText(uid, { text } = {}) {
    const msg = cleanPoliticsText(text);
    if (msg) await assertCanSpeak(uid, { text: msg });
    const st = await readState();
    const cp = st.coup;
    if (!cp || !['active', 'decision'].includes(cp.status)) fail('failed-precondition', 'Açıklama sadece darbe sürerken yazılabilir.');
    const t = now();
    const [{ ms }, main, us] = await Promise.all([membershipOf(uid), db.doc('belediye/main').get().then((s) => s.data() || {}), userRef(uid).get().then((s) => s.data() || {})]);
    const seat = ['bsk', 'yrd1', 'yrd2'].find((s) => main.seats?.[s]?.uid === uid) || null;
    let patch;
    if (ms.intelRosterId && ms.intelRosterId === cp.leaderRid) patch = { leaderText: msg, leaderTextAtMs: t };
    else if (seat && cp.status === 'active') patch = { govText: msg, govTextAtMs: t, govTextBy: { name: us.displayName || 'Oyuncu', title: seat === 'bsk' ? 'Belediye Başkanı' : 'Belediye Başkan Yardımcısı' } };
    else fail('permission-denied', 'Bu açıklamayı yazma yetkin yok.');
    await coupRef(cp.id).set({ ...patch, updatedAtMs: t }, { merge: true });
    return { ok: true };
  }

  // EGM kararı (başarılı darbeden sonra 24 saat)
  async function decide(uid, { choice } = {}) {
    if (!['rule', 'election'].includes(choice)) fail('invalid-argument', 'Geçersiz seçim.');
    const t = now();
    const st = await readState();
    const cp = st.coup;
    if (!cp || cp.status !== 'decision' || t >= cp.decideUntilMs) fail('failed-precondition', 'Bekleyen bir karar yok.');
    // rütbesi düşmüş olsa da karar darbeyi yapanındır
    if (!uid || uid !== (await leaderUidOf(cp.id))) fail('permission-denied', 'Bu kararı sadece darbeyi yapan Emniyet Genel Müdürü verir.');
    return applyDecision(cp, choice, uid, t);
  }

  async function applyDecision(cp, choice, uid, t) {
    const day = polDayKey(t);
    if (choice === 'rule') {
      const u = (await userRef(uid).get()).data() || {};
      // önce polislikten ayrılır (belediyede başka devlet görevi olmaz), sonra başkan olur
      await resignPolice(uid, { force: true }).catch((err) => console.error('darbe: polislikten ayrılma', err?.message || err));
      await belediye.installElected(uid, { key: `coup_${cp.id}`, source: 'coup', name: u.displayName });
      if (u.isImam) await db.runTransaction(async (tx) => {
        const im = await tx.get(db.doc('imamState/current'));
        if (im.data()?.uid === uid) tx.delete(db.doc('imamState/current'));
        tx.set(userRef(uid), { isImam: false }, { merge: true });
      });
    }
    let done = false;
    const lu = uid || (await leaderUidOf(cp.id));
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data() || {};
      if (s.coup?.id !== cp.id || s.coup.status !== 'decision') return;
      const lus = lu ? await tx.get(userRef(lu)) : null;
      const patch = { coup: null, updatedAtMs: t, lastCoup: { ...(s.lastCoup || {}), id: cp.id, decision: choice, decisionDay: day, decisionTimeout: !uid || t === polMidnight(day), leaderCode: cp.leaderCode } };
      if (choice === 'rule') {
        const u = (await tx.get(userRef(uid))).data() || {};
        Object.assign(patch, { gov: { uid, name: u.displayName || 'Oyuncu', since: day, kind: 'coup', coup: cp.id }, nextSignupDay: termSignupDay(day), coupFreeFromMs: polMidnight(day) + POLITICS.COUP_GUARD_DAYS * D });
      } else if (!s.phase || s.phase === 'idle') {
        // erken seçim: bir sonraki Cuma (karar süresi bitip Cuma gecesine denk geldiyse o gece)
        patch.nextSignupDay = t === polMidnight(day) ? fridayOnOrAfter(day) : fridayAfter(day);
      }
      tx.update(stateRef, patch);
      if (lus?.exists) tx.update(userRef(lu), { coupDecide: null });
      tx.set(coupRef(cp.id), { status: choice === 'rule' ? 'ruled' : 'election', decidedAtMs: t, updatedAtMs: t }, { merge: true });
      if (uid) smsTo(tx, uid, choice === 'rule' ? '⚡ Devletin başına geçtin. Ekibini Belediye › Başkanlık sekmesinden kurabilirsin.' : "🗳️ Polislikte kaldın, erken seçim kararı verdin. Adaylık başvuruları Cuma 00:00'da başlayacak.");
      done = true;
    });
    return { ok: done, choice };
  }

  // ---------------------------------------------------------------------------
  // Gece geçişleri (politics.nightly içinden; maaş listesi alındıktan SONRA)
  // ---------------------------------------------------------------------------
  async function startVoting(day) {
    const p = (await planRef.get()).data();
    if (!p || p.status !== 'planned' || polMidnight(day) < p.voteStartMs) return null;
    const st = await readState();
    const w = await liveWorldId();
    if (w && !(await gangTickDone(w, day))) return { waitGang: true };
    let reason = null;
    if (!st.gov?.uid) reason = 'no_gov';
    else if (st.phase && st.phase !== 'idle') reason = 'election';
    let voters = [];
    let leaderUid = null;
    if (!reason && w) {
      const roster = await db.collection(`gangWorlds/${w}/intelRoster`).get();
      const lead = roster.docs.find((d) => d.id === p.leaderRid);
      if (!lead) reason = 'leader_left';
      else if (lead.data().rank !== 'baskan') reason = 'leader_rank'; // 00:00'da EGM değil
      voters = roster.docs.filter((d) => COUP.RANKED.includes(d.data().rank)).map((d) => d.id);
      if (!voters.includes(p.leaderRid) && !reason) voters.push(p.leaderRid);
      leaderUid = (await db.doc(`gangWorlds/${w}/intelRosterLinks/${p.leaderRid}`).get()).data()?.actorId || null;
    } else if (!w) reason = 'no_world';
    // oy hakkı olanların oyuncu kimlikleri (anasayfa butonu için kendi belgelerine)
    const uids = [];
    if (!reason) {
      for (const rid of voters) {
        const a = (await db.doc(`gangWorlds/${w}/intelRosterLinks/${rid}`).get()).data()?.actorId;
        if (a) uids.push(a);
      }
    }
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(planRef)).data();
      if (!cur || cur.status !== 'planned' || cur.decidedAtMs !== p.decidedAtMs) return;
      if (reason) {
        tx.update(planRef, { status: 'cancelled', cancelReason: reason, resolvedAtMs: now() });
        if (leaderUid && reason === 'leader_rank') smsTo(tx, leaderUid, '⚡ 00:00 itibarıyla Emniyet Genel Müdürü olmadığın için darbe oylaması başlamadı.');
        return;
      }
      tx.update(planRef, { status: 'voting', voters, startedAtMs: now() });
      tx.set(leaderRef, { id: p.id, uid: leaderUid, rid: p.leaderRid });
      for (const u of uids) tx.set(userRef(u), { coupPlanVote: { id: p.key || p.id, choice: null, endMs: p.voteEndMs } }, { merge: true });
    });
    return reason ? { cancelled: reason } : { voting: voters.length };
  }

  async function closeVoting(day) {
    const p = (await planRef.get()).data();
    if (!p || p.status !== 'voting' || polMidnight(day) < p.voteEndMs) return null;
    const st = await readState();
    const w = await liveWorldId();
    if (w && !(await gangTickDone(w, day))) return { waitGang: true };
    const passed = coupVotePassed(p.yes, p.no);
    // oylama sürerken istifa ettiyse / atıldıysa darbe başlamaz
    const leaderIn = w ? (await db.doc(`gangWorlds/${w}/intelRoster/${p.leaderRid}`).get()).exists : false;
    const blocked = !st.gov?.uid ? 'no_gov' : st.phase && st.phase !== 'idle' ? 'election' : !leaderIn ? 'leader_left' : null;
    const t = now();
    const startMs = polMidnight(day);
    const leaderUid = await leaderUidOf(p.id);
    let res = null;
    await db.runTransaction(async (tx) => {
      const [cur, s] = await Promise.all([tx.get(planRef), tx.get(stateRef)]);
      const c = cur.data();
      if (!c || c.status !== 'voting' || c.decidedAtMs !== p.decidedAtMs) return;
      if (!passed || blocked) {
        tx.update(planRef, { status: 'failed', result: { yes: c.yes || 0, no: c.no || 0, passed, blocked }, resolvedAtMs: t });
        if (leaderUid) smsTo(tx, leaderUid, `⚡ Darbe oylaması ${passed ? (blocked === 'leader_left' ? 'geçti ama teşkilattan ayrıldığın için darbe başlamadı' : 'geçti ama darbe başlatılamadı') : 'reddedildi'} (${c.yes || 0} evet · ${c.no || 0} hayır). Darbe yapılmadı.`);
        res = { failed: true };
        return;
      }
      const id = c.id;
      const coup = { id, status: 'active', leaderRid: c.leaderRid, leaderCode: c.leaderCode, startMs, endMs: startMs + D, govName: s.data()?.gov?.name || null };
      tx.update(planRef, { status: 'passed', result: { yes: c.yes || 0, no: c.no || 0, passed: true }, resolvedAtMs: t });
      tx.set(coupRef(id), { id, status: 'active', leaderCode: c.leaderCode, govName: coup.govName, startMs, endMs: coup.endMs, power: { coup: 0, gov: 0 }, count: { coup: 0, gov: 0 }, police: { coup: 0, gov: 0 }, leaderText: '', govText: '', createdAtMs: t, updatedAtMs: t });
      tx.update(stateRef, { coup, lastCoup: { id, day, outcome: 'started', leaderCode: c.leaderCode, govName: coup.govName }, updatedAtMs: t });
      if (leaderUid) smsTo(tx, leaderUid, '⚡ Darbe başladı! 24 saat sürecek. Açıklamanı Çeteler › Savaş sekmesinden yazabilirsin.');
      res = { started: id };
    });
    return res;
  }

  async function resolveCoup(day) {
    const st = await readState();
    const cp = st.coup;
    if (!cp || cp.status !== 'active' || polMidnight(day) < cp.endMs) return null;
    const doc = (await coupRef(cp.id).get()).data() || {};
    const power = { coup: Number(doc.power?.coup || 0), gov: Number(doc.power?.gov || 0) };
    const won = coupWon(power);
    const t = now();
    const leaderUid = await leaderUidOf(cp.id);
    if (won) {
      // belediye kadrosu anında görevden alınır (biten günün maaş listesi alındıktan sonra)
      if (belediye?.snapshotStaffAndImam) await belediye.snapshotStaffAndImam(day);
      await belediye.govFall({ key: `coup_${cp.id}`, reason: 'coup' });
    } else if (leaderUid) {
      await removePolice(leaderUid, { notifyText: '🚫 Darbe girişimin başarısız oldu — Emniyet Genel Müdürlüğünden ve polislikten alındın. Prestijin silindi.', chatText: '{code} başarısız darbe girişimi nedeniyle görevden alındı.' }).catch((err) => console.error('darbe: EGM görevden alma', err?.message || err));
    }
    let out = null;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data() || {};
      if (s.coup?.id !== cp.id || s.coup.status !== 'active') return;
      const lastCoup = { id: cp.id, day, outcome: won ? 'won' : 'lost', leaderCode: cp.leaderCode, govName: cp.govName || null, power, count: doc.count || {} };
      if (won) {
        tx.update(stateRef, { coup: { ...cp, status: 'decision', decideUntilMs: polMidnight(day) + D, power }, gov: null, govFell: { day, reason: 'coup', name: cp.govName || null }, lastCoup, updatedAtMs: t });
        if (leaderUid) tx.set(userRef(leaderUid), { coupDecide: { id: cp.id, untilMs: polMidnight(day) + D } }, { merge: true });
        if (leaderUid) smsTo(tx, leaderUid, '⚡ Darbe başarılı! 24 saat içinde karar ver: devletin başına geç ya da polislikte kal (erken seçim). Karar paneli: Çeteler › Polis Teşkilatı › Savaş. Karar verene kadar istifa edemezsin.');
      } else {
        tx.update(stateRef, { coup: null, lastCoup, updatedAtMs: t });
      }
      tx.set(coupRef(cp.id), { status: won ? 'won' : 'lost', resolvedAtMs: t, finalPower: power, updatedAtMs: t }, { merge: true });
      out = { won, power };
    });
    return out;
  }

  // Karar hatırlatması: son 12 saat kala bir SMS daha (politics.clock — dakikada bir;
  // state zaten okunmuş — ek okuma sadece hatırlatma anında)
  async function remindTick(st, t) {
    const cp = st?.coup;
    if (!cp || cp.status !== 'decision' || cp.remind12 || t < Number(cp.decideUntilMs) - 12 * H || t >= Number(cp.decideUntilMs)) return null;
    const leaderUid = await leaderUidOf(cp.id);
    let sent = false;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data() || {};
      if (s.coup?.id !== cp.id || s.coup.status !== 'decision' || s.coup.remind12) return;
      tx.update(stateRef, { coup: { ...s.coup, remind12: true } });
      if (leaderUid) smsTo(tx, leaderUid, '⏰ Darbe kararı için son 12 saat! Devletin başına geç ya da polislikte kal (Çeteler › Polis Teşkilatı › Savaş). Karar vermezsen erken seçim olur.');
      sent = true;
    });
    return sent ? { reminded: true } : null;
  }

  async function decisionTimeout(day) {
    const st = await readState();
    const cp = st.coup;
    if (!cp || cp.status !== 'decision' || polMidnight(day) < cp.decideUntilMs) return null;
    return applyDecision(cp, 'election', await leaderUidOf(cp.id), polMidnight(day)).then((r) => ({ ...r, timeout: true }));
  }

  // politics.nightly içinden: sıra önemli (karar zaman aşımı → darbe sonucu → oylama
  // kapanışı → oylama başlangıcı); her biri idempotent
  async function nightly(day) {
    const log = [];
    const a = await decisionTimeout(day);
    if (a) log.push(['decision-timeout', a]);
    const b = await resolveCoup(day);
    if (b) log.push(['resolve', b]);
    const c = await closeVoting(day);
    if (c) log.push(['close-vote', c]);
    const d = await startVoting(day);
    if (d) log.push(['start-vote', d]);
    return log;
  }

  const OPS = {
    coupPlan: (uid) => plan(uid),
    coupCancel: (uid) => cancel(uid),
    coupPoliceVote: (uid, d) => policeVote(uid, d),
    coupJoin: (uid, d) => join(uid, d),
    coupText: (uid, d) => setText(uid, d),
    coupDecide: (uid, d) => decide(uid, d),
  };
  return { OPS, nightly, remindTick, startBlock, plan, cancel, policeVote, join, setText, decide, startVoting, closeVoting, resolveCoup, decisionTimeout };
}
