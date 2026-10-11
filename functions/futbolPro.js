// =============================================================================
// futbolPro.js — v77 Faz 5: Gerçek futbolcular (oyuncular), sözleşme, maaş,
// teklifler, maç istatistikleri (gol / asist / maç puanı) ve gün sonu kartı.
// =============================================================================
// KİM FUTBOLCUDUR?
//   footballers/{uid} (Faz 4, spor salonu) gücü 200'e ulaşınca "maaşlı futbolcu"
//   sayılır ve Futbolcular listesinde görünür (ilana koymasa da, takımdayken de).
//   - Takımdaki futbolcuya da teklif gidebilir; kabul ederse TRANSFER olur (eski
//     sözleşme biter, borç eski takıma kalır). Takımdayken ilana çıkılamaz.
//   - İlana koyarsa (listed) maaşını kendisi belirler; takım yöneticisi
//     doğrudan o maaşla imzalar.
//   - İlanda değilse yöneticiler TEKLİF gönderir (maaş); futbolcu kabul/ret
//     eder. Teklif 24 saatte düşer.
//
// SÖZLEŞME (futbolPlayers/real_{uid}, real:true)
//   - Takıma katılınca oyuncu takımın futbolPlayers listesine girer (yaş sabit
//     24, değer 0 → takım değerine/satışa girmez). Satılamaz, ilana konamaz,
//     yaşlanmaz, silinmez, gençleştirilmez, minimum kadro sayımına GİRMEZ.
//   - Süre sınırı yok: bir taraf feshedene kadar sürer. v90: FESİH ve TRANSFER
//     her zaman 19:00'da gerçekleşir (o güne kadar oynar, 19:00'da bugünkü maaşı
//     ödenir, sonra ayrılır/geçer). Ayrıldığı takıma ertesi 19:00'dan önce dönemez.
//   - v90 İLK MAAŞ: 18:00'den önce imzalayan o gün 19:00'da maaş alır; 18:00 ve
//     sonrası imzalayan (transferle 19:00'da geçen dahil) ilk maaşını ertesi 19:00'da.
//   - v90: hesabını silen futbolcu 19:00'a kadar kadroda kalır; 19:00'da maaşı
//     takımdan düşülür (kimseye geçmez) ve kadrodan çıkar.
//   - Başkan/menajer kendi takımında da futbolcu olabilir (maaş aralığı güce bağlı: güç×25 – güç×50).
//   - Gelişim takım kurallarıyla (antrenman 0,1–4, maç 0,1–2); güç
//     footballers/{uid}'e de yansıtılır.
//
// MAAŞ (her 19:00, menajer maaşıyla aynı mantık)
//   - MANAGED → takım kasası · OWNER_ACTIVE → başkanın altını ·
//     OWNER_AUTO → kasa · BOT (takım sahipsiz kaldı) → kasadan SON maaş ve
//     sözleşme biter. Transfer desteğinden ÖDENMEZ.
//   - Ödenemeyen kısım borç olur (salaryDebt) ve bir sonraki 19:00'da
//     maaşla birlikte istenir.
//   - Fesihte kalan borç TAKIMIN borcu olur (futbolTeams.playerDebts[uid]);
//     takımın parası olunca (her 19:00 kapanışında) otomatik ödenir.
//   - Zam: futbolcu ister → yönetici kabul/ret; yönetici doğrudan da artırabilir.
//   - Kesinti yok (ileride belediye/vergi).
//
// İSTATİSTİK (futbolPlayerStats/{sezon}_{oyuncuId}) — SADECE LİG maçları
//   gol, asist, maç, puan toplamı/ortalaması, maçın yıldızı, gol yemeden biten
//   maç (kaleci/defans). Sezon anahtarlı → her sezon kendiliğinden sıfırlanır.
// =============================================================================

export const PRO_MIN_POWER = 200;
// v90.1: maaş aralığı GÜCE bağlı — oyuncu değerinin (güç × 1.000) 40'ta 1'i ile 20'de 1'i arası.
//   200 güç → 5.000–10.000, 300 güç → 7.500–15.000. (Sabit tavan yok.)
export const PRO_SALARY_PER_POWER = { min: 25, max: 50 };
export const proSalaryBand = (power) => {
  const pw = Math.max(PRO_MIN_POWER, Number(power) || 0);
  return { min: Math.ceil(pw * PRO_SALARY_PER_POWER.min), max: Math.floor(pw * PRO_SALARY_PER_POWER.max) };
};
// geri uyum: en düşük PRO (200 güç) için aralık
export const PRO_SALARY = proSalaryBand(200);
export const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
export const OFFER_RESEND_MS = 10 * 60 * 1000; // v89: aynı takım aynı futbolcuya 10 dk'da bir teklif (SMS seli olmasın)
export const RAISE_WAIT_MS = 24 * 60 * 60 * 1000; // v89: zam isteği günde 1
export const REAL_PLAYER_AGE = 24;
export const realPlayerDocId = (uid) => `real_${uid}`;
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

const r1 = (v) => Math.round(Number(v || 0) * 10) / 10;
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const validSalary = (v) => Number.isInteger(v) && v > 0;
// güce göre aralık dışındaysa hata kodu (salary-band:min:max), içindeyse null
const bandError = (salary, power) => {
  const b = proSalaryBand(power);
  return salary < b.min || salary > b.max ? `salary-band:${b.min}:${b.max}` : null;
};

// ---------------------------------------------------------------------------
// Gol / asist sahibi (skoru DEĞİŞTİRMEZ; sadece golü kimin attığını belirler)
// ---------------------------------------------------------------------------
const effPower = (p) => Math.max(1, Number(p.power || 0) * (Number(p.form ?? 100) / 100));
function weightedPick(cands, weightOf, rnd) {
  const list = cands.map((p) => [p, Math.max(0, weightOf(p))]).filter(([, w]) => w > 0);
  const total = list.reduce((a, [, w]) => a + w, 0);
  if (!total) return null;
  let x = rnd() * total;
  for (const [p, w] of list) {
    x -= w;
    if (x <= 0) return p;
  }
  return list[list.length - 1][0];
}
const SCORER_W = {
  fwd: { FWD: 1 },
  mid: { MID: 1 },
  free: { FWD: 5, MID: 3, DEF: 1.5, GK: 0.15 },
};
const ASSIST_W = {
  FWD: { MID: 3, FWD: 1, DEF: 0.6 },
  MID: { DEF: 2, MID: 2, FWD: 1 },
  DEF: { MID: 2, DEF: 1, FWD: 1 },
  GK: { DEF: 1, MID: 1 },
};
export function goalKindOf(label) {
  const l = String(label || '');
  if (l.startsWith('Forvet')) return 'fwd';
  if (l.startsWith('Orta saha')) return 'mid';
  return 'free';
}
// timeline olaylarını yerinde günceller: goal → scorerId/Name (+ %70 assistId/Name)
export function assignGoalCredits(timeline, homeSel, awaySel, rnd = Math.random) {
  (timeline || []).forEach((e) => {
    if (e.type !== 'goal') return;
    const side = e.team === 'home' ? homeSel : awaySel;
    if (!side?.length) return;
    const kind = goalKindOf(e.label);
    const w = SCORER_W[kind];
    let scorer = weightedPick(side, (p) => (w[p.position] || 0) * effPower(p), rnd);
    if (!scorer) scorer = weightedPick(side, (p) => (p.position === 'GK' ? 0.15 : 1) * effPower(p), rnd);
    if (!scorer) return;
    e.scorerId = scorer.id;
    e.scorerName = scorer.name || '';
    if (rnd() < 0.7) {
      const aw = ASSIST_W[scorer.position] || ASSIST_W.MID;
      const a = weightedPick(
        side.filter((p) => p.id !== scorer.id),
        (p) => (aw[p.position] || 0) * effPower(p),
        rnd
      );
      if (a) {
        e.assistId = a.id;
        e.assistName = a.name || '';
      }
    }
  });
  return timeline;
}

// ---------------------------------------------------------------------------
// Maç puanı (6,0'dan başlar, 3–10) + maçın yıldızı
// ---------------------------------------------------------------------------
export function computeMatchRatings({ timeline, homeSel, awaySel, homeScore, awayScore }) {
  const ratings = {};
  const info = {};
  const sideOf = {};
  const add = (id, v) => {
    if (ratings[id] !== undefined) ratings[id] += v;
  };
  [
    ['home', homeSel, homeScore, awayScore],
    ['away', awaySel, awayScore, homeScore],
  ].forEach(([side, sel, gf, ga]) => {
    (sel || []).forEach((p) => {
      sideOf[p.id] = side;
      info[p.id] = p;
      let r = 6 + (gf > ga ? 0.5 : gf === ga ? 0.1 : -0.3);
      if (ga === 0 && p.position === 'GK') r += 1;
      if (ga === 0 && p.position === 'DEF') r += 0.7;
      if (p.position === 'GK') r -= 0.4 * ga;
      if (p.position === 'DEF') r -= 0.2 * ga;
      ratings[p.id] = r;
    });
  });
  (timeline || []).forEach((e) => {
    if (e.type === 'goal') {
      if (e.scorerId) add(e.scorerId, 1);
      if (e.assistId) add(e.assistId, 0.6);
    } else if (e.type === 'shot_on') {
      // kaleyi bulan ama gol olmayan şut → rakip kaleciye +0,2
      const defSide = e.team === 'home' ? 'away' : 'home';
      Object.keys(ratings).forEach((id) => {
        if (sideOf[id] === defSide && info[id].position === 'GK') ratings[id] += 0.2;
      });
    }
  });
  Object.keys(ratings).forEach((id) => {
    ratings[id] = r1(Math.max(3, Math.min(10, ratings[id])));
  });
  const winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : null;
  let motmId = null;
  Object.keys(ratings).forEach((id) => {
    if (!motmId) {
      motmId = id;
      return;
    }
    const a = ratings[id];
    const b = ratings[motmId];
    if (a > b) motmId = id;
    else if (a === b) {
      const aw = sideOf[id] === winner ? 1 : 0;
      const bw = sideOf[motmId] === winner ? 1 : 0;
      if (aw > bw || (aw === bw && Number(info[id].power || 0) > Number(info[motmId].power || 0))) motmId = id;
    }
  });
  return { ratings, motmId };
}

// Maçtan oyuncu başına özet (gol/asist sayıları)
export function goalCounts(timeline) {
  const goals = {};
  const assists = {};
  (timeline || []).forEach((e) => {
    if (e.type !== 'goal') return;
    if (e.scorerId) goals[e.scorerId] = (goals[e.scorerId] || 0) + 1;
    if (e.assistId) assists[e.assistId] = (assists[e.assistId] || 0) + 1;
  });
  return { goals, assists };
}

// ---------------------------------------------------------------------------
export function createFutbolPro({
  db,
  FieldValue,
  HttpsError,
  now = () => Date.now(),
  futbolDayKey,
  getControlMode,
  controllerUidOf,
  isLockedHour: _isLockedHour = () => false, // v90: artık kullanılmıyor (fesih/transfer 19:00da)
  splitIncomeForDebt = (debt, amount) => ({ goldDelta: amount, debtDelta: 0 }),
}) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const checkBand = (salary, power) => {
    const be = bandError(salary, power);
    if (be) fail('invalid-argument', be);
  };

  const teamRef = (id) => db.collection('futbolTeams').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const fbRef = (uid) => db.collection('footballers').doc(uid);
  const playerRef = (uid) => db.collection('futbolPlayers').doc(realPlayerDocId(uid));
  const offerRef = (teamId, uid) => db.collection('futbolOffers').doc(`${teamId}_${uid}`);
  const statsRef = (season, playerId) => db.collection('futbolPlayerStats').doc(`${season}_${playerId}`);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

  function sms(w, uid, text, type) {
    if (!uid) return;
    w.set(userRef(uid).collection('messages').doc(), { text, type, createdAt: FieldValue.serverTimestamp(), read: false });
  }
  function teamNote(w, teamId, text, type) {
    w.set(teamRef(teamId).collection('notifications').doc(), { text, type, createdAt: FieldValue.serverTimestamp(), read: false });
    w.update(teamRef(teamId), { notifUnread: true });
  }
  function requireController(teamSnap, uid) {
    if (!teamSnap.exists) fail('not-found', 'Takım bulunamadı.');
    const team = teamSnap.data();
    if (controllerUidOf(team) !== uid) fail('permission-denied', 'Bu takım üzerinde işlem yapma yetkin yok.');
    return team;
  }
  // Takıma katılabilir mi? (YAZMAZ)
  // allowInTeam: takımdaki futbolcuya da teklif gidebilir (kabul ederse transfer olur)
  function assertJoinable(fb, teamId, { allowInTeam = false } = {}) {
    if (!fb) fail('failed-precondition', 'not-footballer');
    if (fb.teamId && fb.teamId === teamId) fail('failed-precondition', 'same-team');
    if (fb.teamId && !allowInTeam) fail('failed-precondition', 'in-team');
    if (!POSITIONS.includes(fb.position)) fail('failed-precondition', 'position-required');
    if (Number(fb.power || 0) < PRO_MIN_POWER) fail('failed-precondition', 'not-pro');
    if (fb.lastLeft?.teamId === teamId && fb.lastLeft?.dayKey === futbolDayKey(now())) fail('failed-precondition', 'rejoin-wait');
  }
  // Sözleşmeyi başlat (YAZMA). Bekleyen teklifler (pendingSnaps) düşer.
  function joinWrites(tx, { uid, fb, teamId, team, salary, pendingSnaps = [], lastLeft, carry = {} }) {
    const t = now();
    tx.set(playerRef(uid), {
      real: true,
      realUid: uid,
      teamId,
      name: String(fb.name || 'Oyuncu').slice(0, 40),
      position: fb.position,
      age: REAL_PLAYER_AGE,
      power: r1(fb.power),
      form: Number.isFinite(carry.form) ? carry.form : 100,
      value: 0,
      injuryDaysLeft: Number(carry.injuryDaysLeft || 0),
      forSale: false,
      salary,
      salaryDebt: 0,
      contractSince: t,
      raiseRequest: null,
    });
    tx.update(fbRef(uid), { teamId, teamName: String(team.name || '').slice(0, 40), playerDocId: realPlayerDocId(uid), listed: false, joinedAtMs: t, power: r1(fb.power), ...(lastLeft ? { lastLeft } : {}) });
    pendingSnaps.forEach((s) => {
      if (s.exists && s.data().status === 'pending') tx.update(s.ref, { status: 'void', closedAtMs: t });
    });
  }
  // Sözleşmeyi bitir (YAZMA): borç takıma geçer, oyuncu kadrodan çıkar.
  function endWrites(tx, { uid, p, team, teamId, reason, teamExists = true, userExists = true }) {
    const t = now();
    const debt = Math.max(0, Math.round(Number(p.salaryDebt || 0)));
    const patch = {};
    if (debt > 0) {
      patch[`playerDebts.${uid}`] = FieldValue.increment(debt);
      patch.hasPlayerDebts = true;
    }
    const id = realPlayerDocId(uid);
    if (Array.isArray(team.lineup) && team.lineup.includes(id)) patch.lineup = team.lineup.filter((x) => x !== id);
    if (Array.isArray(team.trainingPlayerIds) && team.trainingPlayerIds.includes(id)) patch.trainingPlayerIds = team.trainingPlayerIds.filter((x) => x !== id);
    // v89: takım belgesi silinmişse ona yazılmaz; oyuncu hesabı silinmişse borç da yazılmaz
    if (!userExists) {
      delete patch[`playerDebts.${uid}`];
      delete patch.hasPlayerDebts;
    }
    if (teamExists && Object.keys(patch).length) tx.update(teamRef(teamId), patch);
    tx.delete(playerRef(uid));
    if (userExists)
      tx.set(
        fbRef(uid),
        { teamId: null, teamName: null, playerDocId: null, power: r1(p.power), lastLeft: { teamId, dayKey: futbolDayKey(t), reason, atMs: t } },
        { merge: true }
      );
    else tx.delete(fbRef(uid)); // v90: silinmiş hesabın futbolcu profili de kalkar (listede görünmesin)
    return teamExists && userExists ? debt : 0;
  }

  // Transferde eski takımdan çıkış (YAZMA): borç eski takıma, kadro/antrenmandan düşer.
  // Oyuncu belgesi silinmez (yeni sözleşme üzerine yazar).
  function transferOutWrites(tx, { uid, p, team, teamId }) {
    const debt = Math.max(0, Math.round(Number(p.salaryDebt || 0)));
    const patch = {};
    if (debt > 0) {
      patch[`playerDebts.${uid}`] = FieldValue.increment(debt);
      patch.hasPlayerDebts = true;
    }
    const id = realPlayerDocId(uid);
    if (Array.isArray(team.lineup) && team.lineup.includes(id)) patch.lineup = team.lineup.filter((x) => x !== id);
    if (Array.isArray(team.trainingPlayerIds) && team.trainingPlayerIds.includes(id)) patch.trainingPlayerIds = team.trainingPlayerIds.filter((x) => x !== id);
    if (Object.keys(patch).length) tx.update(teamRef(teamId), patch);
    return debt;
  }

  // ---- futbolcu: ilana koy / kaldır ---------------------------------------
  async function proList(uid, d) {
    const listed = d.listed === true;
    const ask = Number(d.askSalary);
    if (listed && !validSalary(ask)) fail('invalid-argument', 'salary-band');
    await db.runTransaction(async (tx) => {
      const s = await tx.get(fbRef(uid));
      const fb = s.exists ? s.data() : null;
      if (!fb) fail('failed-precondition', 'not-footballer');
      if (fb.teamId) fail('failed-precondition', 'in-team');
      if (listed && Number(fb.power || 0) < PRO_MIN_POWER) fail('failed-precondition', 'not-pro');
      if (listed) checkBand(ask, fb.power);
      tx.update(fbRef(uid), listed ? { listed: true, askSalary: ask, listedAtMs: now() } : { listed: false });
    });
    return { ok: true, listed, askSalary: listed ? ask : null };
  }

  // ---- yönetici: teklif gönder / geri çek ----------------------------------
  async function offerSend(uid, d) {
    const teamId = String(d.teamId || '');
    const to = String(d.uid || '');
    const salary = Number(d.salary);
    if (!isId(teamId) || !isId(to)) fail('invalid-argument', 'Geçersiz.');
    if (!validSalary(salary)) fail('invalid-argument', 'salary-band');
    let result = null;
    await db.runTransaction(async (tx) => {
      const [ts, fs, prevSnap, curSnap] = await Promise.all([tx.get(teamRef(teamId)), tx.get(fbRef(to)), tx.get(offerRef(teamId, to)), tx.get(playerRef(to))]);
      const team = requireController(ts, uid);
      const fb = fs.exists ? fs.data() : null;
      assertJoinable(fb, teamId, { allowInTeam: true });
      // takımdaysa güncel güç takımdaki kayıtta (antrenman/maç orada artar)
      checkBand(salary, Math.max(Number(fb.power || 0), curSnap.exists ? Number(curSnap.data().power || 0) : 0));
      const t = now();
      const prev = prevSnap.exists ? prevSnap.data() : null;
      if (prev?.status === 'pending' && Number(prev.createdAtMs || 0) > t - OFFER_RESEND_MS) fail('failed-precondition', 'offer-wait');
      tx.set(offerRef(teamId, to), {
        teamId,
        teamName: String(team.name || '').slice(0, 40),
        teamLogo: team.logo || null,
        tier: team.tier || null,
        uid: to,
        playerName: String(fb.name || '').slice(0, 40),
        fromTeamId: fb.teamId || null,
        position: fb.position,
        power: r1(fb.power),
        salary,
        fromUid: uid,
        status: 'pending',
        createdAtMs: t,
        expiresAtMs: t + OFFER_TTL_MS,
      });
      sms(tx, to, `⚽ ${team.name} sana günlük ${fmt(salary)} altın maaş teklif etti. 24 saat içinde cevap ver.`, 'futbol_pro_offer');
      result = { ok: true, offerId: `${teamId}_${to}` };
    });
    return result;
  }
  async function offerCancel(uid, d) {
    const id = String(d.offerId || '');
    if (!isId(id)) fail('invalid-argument', 'Geçersiz.');
    await db.runTransaction(async (tx) => {
      const os = await tx.get(db.collection('futbolOffers').doc(id));
      if (!os.exists) fail('not-found', 'offer-gone');
      const o = os.data();
      const ts = await tx.get(teamRef(o.teamId));
      requireController(ts, uid);
      if (o.status !== 'pending') fail('failed-precondition', 'offer-closed');
      tx.update(os.ref, { status: 'cancelled', closedAtMs: now() });
    });
    return { ok: true };
  }

  // ---- futbolcu: teklife cevap ----------------------------------------------
  async function offerRespond(uid, d) {
    const id = String(d.offerId || '');
    const accept = d.accept === true;
    if (!isId(id)) fail('invalid-argument', 'Geçersiz.');
    const pendingQ = db.collection('futbolOffers').where('uid', '==', uid).where('status', '==', 'pending').limit(50);
    let result = null;
    await db.runTransaction(async (tx) => {
      const os = await tx.get(db.collection('futbolOffers').doc(id));
      if (!os.exists) fail('not-found', 'offer-gone');
      const o = os.data();
      if (o.uid !== uid) fail('permission-denied', 'Bu teklif sana değil.');
      if (o.status !== 'pending' || Number(o.expiresAtMs) <= now()) fail('failed-precondition', 'offer-closed');
      if (!accept) {
        tx.update(os.ref, { status: 'rejected', closedAtMs: now() });
        result = { ok: true, accepted: false };
        return;
      }
      const [ts, fs, pq, ops] = await Promise.all([tx.get(teamRef(o.teamId)), tx.get(fbRef(uid)), tx.get(pendingQ), tx.get(playerRef(uid))]);
      if (!ts.exists) fail('not-found', 'Takım bulunamadı.');
      const team = ts.data();
      if (!controllerUidOf(team)) fail('failed-precondition', 'team-bot');
      const fb = fs.exists ? fs.data() : null;
      assertJoinable(fb, o.teamId, { allowInTeam: true });
      // v90: takımdayken kabul → TRANSFER 19:00'da gerçekleşir. O zamana kadar eski
      // takımda oynar; 19:00'da eski takım bugünkü maaşını öder, sonra yeni takıma geçer.
      if (fb.teamId && ops.exists) {
        const cur = ops.data();
        if (cur.pendingTransfer) fail('failed-precondition', 'transfer-pending');
        const t = now();
        tx.update(ops.ref, { pendingTransfer: { teamId: o.teamId, teamName: String(team.name || '').slice(0, 40), salary: o.salary, offerId: id, atMs: t }, pendingEnd: null });
        tx.update(os.ref, { status: 'accepted', closedAtMs: t, scheduled: true });
        pq.docs.forEach((s2) => {
          if (s2.id !== id && s2.exists && s2.data().status === 'pending') tx.update(s2.ref, { status: 'void', closedAtMs: t });
        });
        teamNote(tx, fb.teamId, `🔁 ${fb.name} ${team.name} takımının teklifini kabul etti — bugün 19:00'da transfer olacak.`, 'futbol_pro_left');
        teamNote(tx, o.teamId, `🤝 ${fb.name} teklifini kabul etti — 19:00'da takıma katılacak · ${fmt(o.salary)}/gün`, 'futbol_pro_joined');
        result = { ok: true, accepted: true, teamId: o.teamId, transfer: true, at19: true };
        return;
      }
      joinWrites(tx, { uid, fb, teamId: o.teamId, team, salary: o.salary, pendingSnaps: pq.docs });
      tx.update(os.ref, { status: 'accepted', closedAtMs: now() });
      teamNote(tx, o.teamId, `🤝 ${fb.name} takıma katıldı · ${fmt(o.salary)}/gün`, 'futbol_pro_joined');
      result = { ok: true, accepted: true, teamId: o.teamId, transfer: false };
    });
    return result;
  }


  // ---- yönetici: ilandaki futbolcuyu istediği maaşla imzala -------------------
  async function sign(uid, d) {
    const teamId = String(d.teamId || '');
    const to = String(d.uid || '');
    if (!isId(teamId) || !isId(to)) fail('invalid-argument', 'Geçersiz.');
    const pendingQ = db.collection('futbolOffers').where('uid', '==', to).where('status', '==', 'pending').limit(50);
    let result = null;
    await db.runTransaction(async (tx) => {
      const [ts, fs, pq] = await Promise.all([tx.get(teamRef(teamId)), tx.get(fbRef(to)), tx.get(pendingQ)]);
      const team = requireController(ts, uid);
      const fb = fs.exists ? fs.data() : null;
      assertJoinable(fb, teamId);
      if (!fb.listed || !validSalary(Number(fb.askSalary))) fail('failed-precondition', 'not-listed');
      if (Number(d.expect) !== Number(fb.askSalary)) fail('aborted', `price-changed:${fb.askSalary}`);
      joinWrites(tx, { uid: to, fb, teamId, team, salary: Number(fb.askSalary), pendingSnaps: pq.docs });
      sms(tx, to, `⚽ ${team.name} seni ${fmt(fb.askSalary)} altın günlük maaşla kadrosuna kattı!`, 'futbol_pro_signed');
      result = { ok: true, salary: Number(fb.askSalary) };
    });
    return result;
  }

  // ---- zam ---------------------------------------------------------------------
  async function raiseRequest(uid, d) {
    const salary = Number(d.salary);
    if (!validSalary(salary)) fail('invalid-argument', 'salary-band');
    await db.runTransaction(async (tx) => {
      const ps = await tx.get(playerRef(uid));
      if (!ps.exists) fail('failed-precondition', 'no-contract');
      const p = ps.data();
      if (salary <= Number(p.salary || 0)) fail('failed-precondition', 'raise-low');
      checkBand(salary, p.power);
      if (Number(p.raiseAskedAtMs || 0) > now() - RAISE_WAIT_MS) fail('failed-precondition', 'raise-wait');
      tx.update(ps.ref, { raiseRequest: { salary, atMs: now() }, raiseAskedAtMs: now() });
      teamNote(tx, p.teamId, `💸 ${p.name} zam istiyor: ${fmt(p.salary)} → ${fmt(salary)}`, 'futbol_pro_raise');
    });
    return { ok: true };
  }
  async function raiseRespond(uid, d) {
    const to = String(d.uid || '');
    const accept = d.accept === true;
    if (!isId(to)) fail('invalid-argument', 'Geçersiz.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const ps = await tx.get(playerRef(to));
      if (!ps.exists) fail('failed-precondition', 'no-contract');
      const p = ps.data();
      const ts = await tx.get(teamRef(p.teamId));
      requireController(ts, uid);
      const req = p.raiseRequest;
      if (!req) fail('failed-precondition', 'no-request');
      if (accept) {
        tx.update(ps.ref, { salary: req.salary, raiseRequest: null });
        sms(tx, to, `💸 Zam isteğin kabul edildi: günlük ${fmt(req.salary)} altın.`, 'futbol_pro_raise');
      } else {
        tx.update(ps.ref, { raiseRequest: null });
        sms(tx, to, '💸 Zam isteğin reddedildi.', 'futbol_pro_raise');
      }
      result = { ok: true, salary: accept ? req.salary : p.salary };
    });
    return result;
  }
  async function raiseSet(uid, d) {
    const to = String(d.uid || '');
    const salary = Number(d.salary);
    if (!isId(to)) fail('invalid-argument', 'Geçersiz.');
    if (!validSalary(salary)) fail('invalid-argument', 'salary-band');
    await db.runTransaction(async (tx) => {
      const ps = await tx.get(playerRef(to));
      if (!ps.exists) fail('failed-precondition', 'no-contract');
      const p = ps.data();
      const ts = await tx.get(teamRef(p.teamId));
      requireController(ts, uid);
      if (salary <= Number(p.salary || 0)) fail('failed-precondition', 'raise-low');
      checkBand(salary, p.power);
      tx.update(ps.ref, { salary, raiseRequest: null });
      sms(tx, to, `💸 Takımın maaşını artırdı: günlük ${fmt(salary)} altın.`, 'futbol_pro_raise');
    });
    return { ok: true, salary };
  }

  // ---- fesih (futbolcu ya da yönetici) -----------------------------------------
  async function terminate(uid, d) {
    const to = d.uid ? String(d.uid) : uid;
    if (!isId(to)) fail('invalid-argument', 'Geçersiz.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const ps = await tx.get(playerRef(to));
      if (!ps.exists) fail('failed-precondition', 'no-contract');
      const p = ps.data();
      const ts = await tx.get(teamRef(p.teamId));
      const team = ts.exists ? ts.data() : {};
      const byPlayer = to === uid;
      if (!byPlayer) requireController(ts, uid);
      if (p.pendingEnd || p.pendingTransfer) fail('failed-precondition', 'end-pending');
      // v90: fesih HER ZAMAN 19:00'da olur — o güne kadar oynar, 19:00'da bugünkü
      // maaşı ödenir ve sözleşme biter (maaş ödemesi: paySalaries)
      tx.update(ps.ref, { pendingEnd: { by: byPlayer ? 'player' : 'team', atMs: now() } });
      if (byPlayer) {
        if (ts.exists) teamNote(tx, p.teamId, `✂️ ${p.name} sözleşmesini feshetti — bugün 19:00'da ayrılacak.`, 'futbol_pro_left');
      } else {
        sms(tx, to, `✂️ ${team.name || 'Takım'} sözleşmeni feshetti — bugün 19:00'da bugünkü maaşın ödenip sözleşmen bitecek.`, 'futbol_pro_left');
      }
      result = { ok: true, at19: true };
    });
    return result;
  }


  // ---- 19:00 maaş ödemesi ------------------------------------------------------
  // Her sözleşme ayrı transaction. BOT takımda son maaş ödenir, sözleşme biter.
  async function paySalaries() {
    const snap = await db.collection('futbolPlayers').where('real', '==', true).get();
    const out = { paid: 0, debt: 0, ended: 0, moved: 0, burned: 0 };
    // v90: İLK MAAŞ — bugün 18:00'den (maç başlangıcı) ÖNCE imzalayan bugün 19:00'da
    // maaş alır; 18:00 ve sonrası imzalayan ilk maaşını yarın 19:00'da alır.
    const t0 = now();
    const ist = new Date(t0 + 3 * 60 * 60 * 1000);
    const cutoffMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 15, 0, 0); // 18:00 İstanbul
    for (const doc of snap.docs) {
      const uid = doc.data().realUid;
      try {
        await db.runTransaction(async (tx) => {
          const ps = await tx.get(doc.ref);
          if (!ps.exists) return;
          const p = ps.data();
          const ts = await tx.get(teamRef(p.teamId));
          if (!ts.exists) return; // (takım silinmez; savunma amaçlı)
          const team = ts.data();
          const mode = getControlMode(team);
          const fromPresident = mode === 'OWNER_ACTIVE';
          const tr = p.pendingTransfer || null;
          const [presSnap, plSnap, newTs, pq] = await Promise.all([
            fromPresident ? tx.get(userRef(team.ownerUid)) : null,
            tx.get(userRef(uid)),
            tr ? tx.get(teamRef(tr.teamId)) : null,
            tr ? tx.get(db.collection('futbolOffers').where('uid', '==', uid).where('status', '==', 'pending').limit(50)) : null,
          ]);
          const userGone = !plSnap.exists;
          const available = Math.max(0, Math.floor(Number(fromPresident ? presSnap?.data()?.gold : team.treasury) || 0));
          const eligible = Number(p.contractSince || 0) < cutoffMs;
          const salary = eligible ? Math.max(0, Math.round(Number(p.salary || 0))) : 0;
          const owed = salary + Math.max(0, Math.round(Number(p.salaryDebt || 0)));
          const paid = Math.min(owed, available);
          const newDebt = owed - paid;
          if (paid > 0) {
            if (fromPresident) tx.update(userRef(team.ownerUid), { gold: FieldValue.increment(-paid) });
            else tx.update(teamRef(p.teamId), { treasury: FieldValue.increment(-paid) });
            if (!userGone) {
              const { goldDelta, debtDelta } = splitIncomeForDebt(plSnap.data()?.debtToState, paid);
              tx.update(userRef(uid), { gold: FieldValue.increment(goldDelta), ...(debtDelta ? { debtToState: FieldValue.increment(debtDelta) } : {}) });
            } else out.burned += paid; // v90: hesap silinmiş → ödenen maaş kimseye geçmez (yanar)
          }
          out.paid += paid;
          // v90: hesabı silinmiş futbolcu 19:00'a kadar oynar; maaşı ödenir (yanar) ve takımdan çıkar
          if (userGone) {
            endWrites(tx, { uid, p: { ...p, salaryDebt: 0 }, team, teamId: p.teamId, reason: 'player_gone', userExists: false });
            teamNote(tx, p.teamId, `👋 ${p.name} oyundan ayrıldı; son maaşı ödendi ve kadrodan çıktı.`, 'futbol_pro_left');
            out.ended += 1;
            return;
          }
          if (mode === 'BOT') {
            // takım sahipsiz kaldı: son maaş ödendi, sözleşme biter
            endWrites(tx, { uid, p: { ...p, salaryDebt: newDebt }, team, teamId: p.teamId, reason: 'team_bot' });
            sms(tx, uid, `⚽ ${team.name} sahipsiz kaldı; son maaşın (${fmt(paid)}) ödendi, sözleşmen bitti.`, 'futbol_pro_left');
            out.ended += 1;
            return;
          }
          // v90: 19:00 TRANSFERİ — eski takım bugünü ödedi; yeni takıma geçer
          if (tr) {
            const nt = newTs?.exists ? newTs.data() : null;
            if (nt && controllerUidOf(nt)) {
              transferOutWrites(tx, { uid, p: { ...p, salaryDebt: newDebt }, team, teamId: p.teamId });
              const fbData = { name: p.name, position: p.position, power: p.power };
              joinWrites(tx, { uid, fb: fbData, teamId: tr.teamId, team: nt, salary: tr.salary, pendingSnaps: pq?.docs || [], carry: { form: p.form, injuryDaysLeft: p.injuryDaysLeft }, lastLeft: { teamId: p.teamId, dayKey: futbolDayKey(now()), reason: 'transfer', atMs: now() } });
              teamNote(tx, p.teamId, `🔁 ${p.name} ${nt.name} takımına transfer oldu.${newDebt > 0 ? ` Borç: ${fmt(newDebt)}` : ''}`, 'futbol_pro_left');
              teamNote(tx, tr.teamId, `🤝 ${p.name} takıma katıldı · ${fmt(tr.salary)}/gün (ilk maaş yarın 19:00)`, 'futbol_pro_joined');
              sms(tx, uid, `🔁 ${nt.name} takımına transfer oldun! ${paid > 0 ? `Eski takımın son maaşını (${fmt(paid)}) ödedi. ` : ''}İlk maaşın yarın 19:00'da.`, 'futbol_pro_joined');
              out.moved += 1;
              return;
            }
            // yeni takım artık yöneticisiz → transfer iptal, oyuncu kalır
            tx.update(ps.ref, { pendingTransfer: null });
            sms(tx, uid, `⚠️ ${tr.teamName} takımının yöneticisi kalmadığı için transferin iptal oldu; ${team.name} takımında devam ediyorsun.`, 'futbol_pro_left');
          }
          // v90: 19:00 FESHİ — bugünkü maaş ödendi, sözleşme biter (kalan borç takımın borcu olur)
          if (p.pendingEnd) {
            const debt = endWrites(tx, { uid, p: { ...p, salaryDebt: newDebt }, team, teamId: p.teamId, reason: p.pendingEnd.by === 'team' ? 'team' : 'player' });
            sms(tx, uid, `✂️ ${team.name} ile sözleşmen bitti.${paid > 0 ? ` Son maaşın: ${fmt(paid)}.` : ''}${debt ? ` Kalan ${fmt(debt)} alacağın takımın borcu olarak sonra ödenecek.` : ''}`, 'futbol_pro_left');
            teamNote(tx, p.teamId, `✂️ ${p.name} ile sözleşme bitti.`, 'futbol_pro_left');
            out.ended += 1;
            return;
          }
          tx.update(ps.ref, { salaryDebt: newDebt, lastPaidAtMs: now() });
          out.debt += newDebt;
          if (!eligible && !(Number(p.salaryDebt) > 0)) return; // 18:00 sonrası imza: ilk maaş yarın
          if (newDebt > 0) sms(tx, uid, `💰 Maaş: ${fmt(paid)} ödendi · ${fmt(newDebt)} altın borç birikti (${team.name}).`, 'futbol_salary_debt');
          else sms(tx, uid, `💰 Maaşın yattı: ${fmt(paid)} altın (${team.name}).`, 'futbol_salary_paid');
        });
      } catch (err) {
        out.errors = (out.errors || 0) + 1;
        console.error('futbolPro.paySalaries', doc.id, err?.message || err);
      }
    }
    return out;
  }

  // ---- fesihten kalan takım borçları (kasaya/başkana para gelince) -------------
  async function settleTeamDebts() {
    const snap = await db.collection('futbolTeams').where('hasPlayerDebts', '==', true).limit(300).get();
    let paidTotal = 0;
    for (const doc of snap.docs) {
      await db.runTransaction(async (tx) => {
        const ts = await tx.get(doc.ref);
        const team = ts.data() || {};
        const debts = Object.entries(team.playerDebts || {}).filter(([, v]) => Number(v) > 0);
        if (!debts.length) {
          tx.update(doc.ref, { hasPlayerDebts: false });
          return;
        }
        const fromPresident = getControlMode(team) === 'OWNER_ACTIVE';
        const reads = await Promise.all([fromPresident ? tx.get(userRef(team.ownerUid)) : null, ...debts.map(([uid]) => tx.get(userRef(uid)))]);
        let available = Math.max(0, Math.floor(Number(fromPresident ? reads[0]?.data()?.gold : team.treasury) || 0));
        if (available <= 0) return;
        const patch = {};
        let left = 0;
        let spent = 0;
        debts.forEach(([uid, v], i) => {
          const owe = Math.round(Number(v));
          const pay = Math.min(owe, available);
          available -= pay;
          spent += pay;
          if (pay > 0) {
            const { goldDelta, debtDelta } = splitIncomeForDebt(reads[i + 1]?.data()?.debtToState, pay);
            tx.update(userRef(uid), { gold: FieldValue.increment(goldDelta), ...(debtDelta ? { debtToState: FieldValue.increment(debtDelta) } : {}) });
            sms(tx, uid, `💰 ${team.name} eski maaş borcundan ${fmt(pay)} altın ödedi.${owe - pay > 0 ? ` Kalan: ${fmt(owe - pay)}` : ''}`, 'futbol_salary_paid');
          }
          if (owe - pay > 0) {
            patch[`playerDebts.${uid}`] = owe - pay;
            left += owe - pay;
          } else patch[`playerDebts.${uid}`] = FieldValue.delete();
        });
        if (spent > 0) {
          if (fromPresident) tx.update(userRef(team.ownerUid), { gold: FieldValue.increment(-spent) });
          else patch.treasury = FieldValue.increment(-spent);
        }
        patch.hasPlayerDebts = left > 0;
        tx.update(doc.ref, patch);
        paidTotal += spent;
      });
    }
    return paidTotal;
  }

  // ---- süresi geçen teklifler (saatlik) -----------------------------------------
  async function expireOffers() {
    const snap = await db.collection('futbolOffers').where('expiresAtMs', '<=', now()).limit(400).get();
    const batch = db.batch();
    let n = 0;
    snap.docs.forEach((d) => {
      batch.delete(d.ref);
      n += 1;
    });
    if (n) await batch.commit();
    return n;
  }

  // ---- lig maçı istatistikleri + gün sonu kartı ----------------------------------
  // match: futbolMatches belgesi (timeline'da scorer/assist, ratings, motmId)
  // playersById: maçtaki oyuncuların ESKİ halleri (güç/form öncesi)
  // updatesById: { id: { power, form } } bu maçtan sonraki değerler
  async function recordLeagueMatch(batch, { match, season, homeTeam, awayTeam, homeTeamId, awayTeamId, playersById, updatesById, cup = false }) {
    const { goals, assists } = goalCounts(match.timeline);
    const ratings = match.ratings || {};
    const sides = [
      { ids: match.homeLineupIds || [], bench: match.homeBenchIds || [], teamId: homeTeamId, team: homeTeam, gf: match.homeScore, ga: match.awayScore, opp: awayTeam },
      { ids: match.awayLineupIds || [], bench: match.awayBenchIds || [], teamId: awayTeamId, team: awayTeam, gf: match.awayScore, ga: match.homeScore, opp: homeTeam },
    ];
    // istatistik: sadece lig
    if (!cup && season) {
      const allIds = sides.flatMap((s) => s.ids);
      const snaps = await Promise.all(allIds.map((id) => statsRef(season, id).get()));
      const prev = Object.fromEntries(allIds.map((id, i) => [id, snaps[i].exists ? snaps[i].data() : null]));
      sides.forEach((s) => {
        s.ids.forEach((id) => {
          const p = playersById[id];
          if (!p) return;
          const o = prev[id] || {};
          const apps = Number(o.apps || 0) + 1;
          const ratingSum = r1(Number(o.ratingSum || 0) + Number(ratings[id] || 6));
          const clean = s.ga === 0 && (p.position === 'GK' || p.position === 'DEF') ? 1 : 0;
          batch.set(statsRef(season, id), {
            season,
            playerId: id,
            name: String(p.name || '').slice(0, 40),
            position: p.position,
            real: Boolean(p.real),
            realUid: p.realUid || null,
            teamId: s.teamId,
            teamName: String(s.team?.name || '').slice(0, 40),
            teamLogo: s.team?.logo || null,
            goals: Number(o.goals || 0) + (goals[id] || 0),
            assists: Number(o.assists || 0) + (assists[id] || 0),
            apps,
            ratingSum,
            ratingAvg: r1(ratingSum / apps),
            motm: Number(o.motm || 0) + (match.motmId === id ? 1 : 0),
            cleanSheets: Number(o.cleanSheets || 0) + clean,
            updatedAtMs: now(),
          });
        });
      });
    }
    // gerçek futbolcuların gün sonu kartı
    sides.forEach((s) => {
      const write = (id, kind) => {
        const p = playersById[id];
        if (!p?.real || !p.realUid) return;
        const u = updatesById?.[id] || {};
        batch.set(
          fbRef(p.realUid),
          {
            power: r1(u.power ?? p.power),
            lastDay: {
              dayKey: futbolDayKey(now() - 60 * 1000),
              kind: kind === 'match' && cup ? 'cup' : kind,
              matchId: match.id || null,
              teamName: String(s.team?.name || '').slice(0, 40),
              oppName: String(s.opp?.name || '').slice(0, 40),
              gf: s.gf,
              ga: s.ga,
              goals: kind === 'match' ? goals[id] || 0 : 0,
              assists: kind === 'match' ? assists[id] || 0 : 0,
              rating: kind === 'match' ? Number(ratings[id] || 6) : null,
              motm: kind === 'match' && match.motmId === id,
              powerFrom: r1(p.power),
              powerTo: r1(u.power ?? p.power),
              form: Math.round(Number(u.form ?? p.form ?? 100)),
              atMs: now(),
            },
          },
          { merge: true }
        );
      };
      s.ids.forEach((id) => write(id, 'match'));
      s.bench.forEach((id) => write(id, 'bench'));
    });
  }

  // Antrenmandaki gerçek futbolcunun kartı + güç senkronu (YAZMA)
  function recordTraining(batch, { p, teamName, gain, bonus }) {
    if (!p?.real || !p.realUid) return;
    const to = r1(Number(p.power) + gain);
    batch.set(
      fbRef(p.realUid),
      {
        power: to,
        lastDay: { dayKey: futbolDayKey(now() - 60 * 1000), kind: 'training', teamName: String(teamName || '').slice(0, 40), powerFrom: r1(p.power), powerTo: to, gain, bonus: Boolean(bonus), form: Math.round(Number(p.form ?? 100)), atMs: now() },
      },
      { merge: true }
    );
  }

  // Sezon ödülleri (şampiyonluk kutlaması için)
  async function seasonAwards(season) {
    const top = async (field) => {
      const s = await db.collection('futbolPlayerStats').where('season', '==', season).orderBy(field, 'desc').limit(1).get();
      const d = s.docs[0]?.data();
      return d && Number(d[field]) > 0 ? { name: d.name, teamName: d.teamName, teamLogo: d.teamLogo || null, real: Boolean(d.real), value: d[field] } : null;
    };
    try {
      const [topScorer, topAssist, star] = await Promise.all([top('goals'), top('assists'), top('motm')]);
      return { topScorer, topAssist, star };
    } catch (e) {
      console.error('seasonAwards', e?.message || e);
      return null;
    }
  }

  const ops = { proList, offerSend, offerCancel, offerRespond, sign, raiseRequest, raiseRespond, raiseSet, terminate };
  async function action(uid, data) {
    const op = String(data?.op || '');
    if (!ops[op]) fail('invalid-argument', 'Bilinmeyen işlem.');
    return ops[op](uid, data || {});
  }
  return { action, ops, paySalaries, settleTeamDebts, expireOffers, recordLeagueMatch, recordTraining, seasonAwards, playerRef, fbRef };
}
