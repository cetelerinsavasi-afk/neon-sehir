// =============================================================================
// v78 — ZAMANA KARŞI YARIŞ: sunucu tarafı (raceHubAction → taStart / taFinish /
// taTimeout). Fizik functions/raceSim.js'te (istemciyle AYNI kod).
//
//   taStart   { roomId }                 → bu oyuncunun bu odadaki TEK denemesi
//                                          başladı (yenileyip yeniden denemek yok)
//   taFinish  { roomId, runs, dnf? }     → tuş kaydı (RLE) sunucuda yeniden
//             oynatılır, süre SUNUCUDA hesaplanır. dnf: bitiremedi / rakibin
//             süresini geçti / vazgeçti.
//               antrenman  : bot süresinden kısaysa kazanır (ödül aynı)
//               şampiyona  : günün en hızlısı lider (championshipDaily)
//               bahisli    : iki süre de gelince kısa olan kazanır
//   taTimeout { roomId }                 → bahisli yarışta 4 dk doldu: bitiren
//                                          kazanır, ikisi de bitirmediyse iade
// =============================================================================
import { replayRun, trainingBotRun, gradeOf } from './raceSim.js';

export function decideTaWinner(room, players) {
  const [a, b] = room.participantUids;
  const pa = players[a];
  const pb = players[b];
  const done = (p) => Number.isFinite(p?.finishMs) && p.finishMs > 0 && !p.dnf;
  if (done(pa) && done(pb)) return pa.finishMs < pb.finishMs ? a : pb.finishMs < pa.finishMs ? b : 'draw';
  if (done(pa)) return a;
  if (done(pb)) return b;
  // ikisi de bitirmedi: vazgeçen kaybeder; ikisi de (ya da süre doldu) → berabere
  if (pa?.dnf && !pb?.dnf) return b;
  if (pb?.dnf && !pa?.dnf) return a;
  return 'draw';
}

export function createRaceTa({ db, FieldValue, HttpsError, requireAuth, finalizeRace, processTrainingReward, now = () => Date.now() }) {
  async function finalizeBetRoom(tx, roomRef, room, players) {
    const userRefs = {};
    const userSnaps = {};
    for (const u of room.participantUids) {
      userRefs[u] = db.collection('users').doc(u);
      userSnaps[u] = await tx.get(userRefs[u]);
    }
    const winnerUid = decideTaWinner(room, players);
    finalizeRace({ tx, roomRef, room, winnerUid, players, userRefs, userSnaps });
    return winnerUid;
  }

  async function start(request) {
    const uid = requireAuth(request);
    const { roomId } = request.data || {};
    const roomRef = db.collection('raceRooms').doc(String(roomId || ''));
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      const room = snap.data();
      if (!room || room.engine !== 'ta') throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
      const me = room.players?.[uid];
      if (!me) throw new HttpsError('failed-precondition', 'Bu odada değilsin.');
      if (room.status !== 'racing') throw new HttpsError('failed-precondition', 'Yarış aktif değil.');
      if (me.runStartedAtMs) throw new HttpsError('already-exists', 'Bu yarış zaten başlatıldı.');
      tx.update(roomRef, { [`players.${uid}.runStartedAtMs`]: now() });
      return { ok: true };
    });
  }

  async function finish(request) {
    const uid = requireAuth(request);
    const { roomId, runs, dnf } = request.data || {};
    if (!roomId || typeof roomId !== 'string') throw new HttpsError('invalid-argument', 'Geçersiz oda.');
    const roomRef = db.collection('raceRooms').doc(roomId);
    const pre = await roomRef.get();
    if (!pre.exists) throw new HttpsError('failed-precondition', 'Oda bulunamadı.');
    const room0 = pre.data();
    if (room0.engine !== 'ta') throw new HttpsError('failed-precondition', 'Bu oda eski yarış sisteminde.');
    const me0 = room0.players?.[uid];
    if (!me0) throw new HttpsError('failed-precondition', 'Bu odada değilsin.');
    if (room0.status !== 'racing') return { ok: true, alreadyFinished: true };
    if (me0.finishMs || me0.dnf) return { ok: true, already: true, finishMs: me0.finishMs || null };

    // Yarışı sunucuda oynat (istemcinin söylediği süreye güvenilmez)
    let finishMs = null;
    let hits = 0;
    if (!dnf) {
      if (!me0.runStartedAtMs) throw new HttpsError('failed-precondition', 'Yarış başlangıcı kaydedilmemiş.');
      const r = replayRun(me0.catalogId, me0.level, runs);
      if (!r.ok) {
        console.warn('taFinish replay failed', roomId, uid, r.reason, r.frames, r.idx);
        throw new HttpsError('failed-precondition', 'Yarış kaydı doğrulanamadı.');
      }
      // Hızlandırılmış oyun (speedhack) koruması: yarış süresi, deneme
      // başladığından bu yana geçen gerçek süreden uzun olamaz (+ ağ payı).
      const elapsed = now() - me0.runStartedAtMs;
      if (r.ms > elapsed + 6000) {
        console.warn('taFinish too fast', roomId, uid, r.ms, elapsed);
        throw new HttpsError('failed-precondition', 'Yarış süresi doğrulanamadı.');
      }
      finishMs = r.ms;
      hits = r.hits;
    }
    const grade = finishMs ? gradeOf(finishMs, me0.catalogId, me0.level) : null;
    const meDone = { ...me0, finishMs, dnf: !finishMs, hits, grade };

    // --- Antrenman ---
    if (room0.isTraining) {
      if (room0.creatorUid !== uid) throw new HttpsError('failed-precondition', 'Bu oda size ait değil.');
      const botMs = Number(room0.players?.bot?.finishMs) || trainingBotRun(room0.trainingLevel).ms;
      const winnerUid = finishMs && finishMs < botMs ? uid : 'bot';
      let changed = false;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(roomRef);
        if (snap.data()?.status !== 'racing') return;
        changed = true;
        tx.update(roomRef, { status: 'finished', winnerUid, finishedAt: FieldValue.serverTimestamp(), [`players.${uid}`]: meDone });
      });
      if (changed) await processTrainingReward(roomId);
      return { ok: true, finishMs, winnerUid };
    }

    // --- Şampiyona ---
    if (room0.isChampionship) {
      if (room0.creatorUid !== uid) throw new HttpsError('failed-precondition', 'Bu oda size ait değil.');
      const champDailyRef = db.collection('championshipDaily').doc(`${room0.championshipCatalogId}_${room0.championshipDateKey}`);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(roomRef);
        const champDailySnap = await tx.get(champDailyRef);
        if (snap.data()?.status !== 'racing') return;
        tx.update(roomRef, {
          status: 'finished',
          winnerUid: finishMs ? uid : null,
          championshipResult: finishMs ? 'completed' : 'dnf',
          championshipTimeMs: finishMs,
          finishedAt: FieldValue.serverTimestamp(),
          [`players.${uid}`]: meDone,
        });
        if (!finishMs) return;
        const champDaily = champDailySnap.exists ? champDailySnap.data() : null;
        const entry = { uid, name: me0.displayName, vehicleModel: me0.vehicleModel, timeMs: finishMs, level: me0.level };
        const best = Number(champDaily?.leaderTimeMs) || 0;
        if (!best || finishMs < best) {
          tx.set(
            champDailyRef,
            {
              catalogId: room0.championshipCatalogId,
              dateKey: room0.championshipDateKey,
              mode: 'time',
              leaderUid: uid,
              leaderName: me0.displayName,
              leaderVehicleModel: me0.vehicleModel,
              leaderTimeMs: finishMs,
              leaderTurns: FieldValue.delete(),
              leaders: [entry],
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } else if (finishMs === best) {
          const existing = Array.isArray(champDaily.leaders) ? champDaily.leaders : [];
          if (!existing.some((l) => l.uid === uid)) {
            tx.update(champDailyRef, { leaders: [...existing, entry], updatedAt: FieldValue.serverTimestamp() });
          }
        }
      });
      return { ok: true, finishMs };
    }

    // --- Bahisli (çevrimiçi) ---
    let out = { ok: true, finishMs, waiting: true };
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      const room = snap.data();
      if (!room || room.status !== 'racing') {
        out = { ok: true, alreadyFinished: true };
        return;
      }
      const cur = room.players?.[uid];
      if (!cur || cur.finishMs || cur.dnf) return;
      const otherUid = room.participantUids.find((u) => u !== uid);
      const other = room.players?.[otherUid];
      const players = { ...room.players, [uid]: meDone };
      const otherDone = Boolean(other && (other.finishMs || other.dnf));
      // vazgeçen/geride kalan hemen kaybeder; iki süre de geldiyse karar verilir
      if (otherDone || !finishMs) {
        const winnerUid = await finalizeBetRoom(tx, roomRef, room, players);
        out = { ok: true, finishMs, winnerUid };
        return;
      }
      tx.update(roomRef, { [`players.${uid}`]: meDone });
    });
    return out;
  }

  async function timeout(request) {
    const uid = requireAuth(request);
    const { roomId } = request.data || {};
    const roomRef = db.collection('raceRooms').doc(String(roomId || ''));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      const room = snap.data();
      if (!room || room.engine !== 'ta' || room.status !== 'racing' || room.isTraining || room.isChampionship) return;
      if (!room.participantUids?.includes(uid)) return;
      if (!room.deadlineMs || now() < room.deadlineMs) return;
      await finalizeBetRoom(tx, roomRef, room, { ...room.players });
    });
    return { ok: true };
  }

  return { start, finish, timeout, finalizeBetRoom };
}
