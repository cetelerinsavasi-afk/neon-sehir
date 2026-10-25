// =============================================================================
// v128 — ŞAMPİYONA (yeni sistem) — sunucu
// -----------------------------------------------------------------------------
//   - Giriş: her ARAÇ günde 1 kez (vehicles/{id}.champDay = gün). Araç satılsa
//     bile o gün tekrar yarışamaz (hesaplar arası araç gezdirip ödül toplanmasın).
//   - Ödül: yarış süresine göre (championshipPrizes.js → championshipTimePrize),
//     yarış biter bitmez hesaba yatar (borç varsa yarısı borca — her gelir gibi).
//   - championshipBoard/{gün}   = { dateKey, runs, paid, entries: { uid: kayıt } }
//       kayıt = { name, vehicleModel, catalogId, timeMs, prize, at } (oyuncunun o
//       günkü EN İYİ koşusu)
//   - championshipBoard/allTime = { top: [ …ilk 10, oyuncu başına en iyi… ] }
//       hiç sıfırlanmaz.
//   - Geçiş: yeni sistem yüklenmeden ÖNCE bugün (eski sistemle) koşulmuş
//     yarışlar migrateLegacyDay ile süresine göre ödüllendirilir ve listeye
//     eklenir; o günün eski "ilk 3" gece ödemesi yapılmaz (çift ödeme olmaz).
// =============================================================================
import {
  championshipTimePrize,
  isBetterRun,
  mergeChampionshipTop,
  rankChampionshipBoard,
  CHAMP_V2_START_DAY,
  CHAMP_V2_MIGRATE_UNTIL,
  earnsCabrioAchievement,
} from './championshipPrizes.js';

const fmtTr = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
export function fmtChampMs(ms) {
  const v = Math.max(0, Math.round(Number(ms) || 0));
  return `${String(Math.floor(v / 60000)).padStart(2, '0')}:${String(Math.floor(v / 1000) % 60).padStart(2, '0')}.${String(v % 1000).padStart(3, '0')}`;
}

export function createChampionshipV2({ db, FieldValue, splitIncomeForDebt, goldTag, catalog = {}, grantAchievement = async () => {}, now = () => Date.now() }) {
  const boardRef = (dayKey) => db.collection('championshipBoard').doc(dayKey);
  const allTimeRef = () => db.collection('championshipBoard').doc('allTime');
  const userRef = (uid) => db.collection('users').doc(uid);

  // Transaction içinde OKUMALAR (yazmalardan önce çağrılmalı)
  async function readRunTx(tx, { uid, dateKey }) {
    const [boardSnap, allSnap, userSnap] = await Promise.all([tx.get(boardRef(dateKey)), tx.get(allTimeRef()), tx.get(userRef(uid))]);
    return { boardSnap, allSnap, userSnap };
  }

  // Transaction içinde YAZMALAR — ödülü öder, listeleri günceller. Döner: { prize }
  // run = { uid, name, vehicleModel, catalogId, timeMs, dateKey, legacy? }
  function writeRunTx(tx, reads, run) {
    const { boardSnap, allSnap, userSnap } = reads;
    const timeMs = Math.round(Number(run.timeMs) || 0);
    if (!(timeMs > 0)) return { prize: 0 };
    const prize = championshipTimePrize(timeMs);
    const at = now();
    const carName = catalog[run.catalogId]?.name || run.vehicleModel || 'araban';
    const name = String(run.name || 'Oyuncu').slice(0, 40);
    const vehicleModel = String(run.vehicleModel || carName).slice(0, 40);
    const entry = { name, vehicleModel, catalogId: Number(run.catalogId) || null, timeMs, prize, at };

    // ödeme
    if (userSnap.exists && prize > 0) {
      const { goldDelta, debtDelta } = splitIncomeForDebt(userSnap.data()?.debtToState, prize);
      tx.update(userRef(run.uid), {
        gold: FieldValue.increment(goldDelta),
        goldTag: goldTag('sampiyona'),
        debtToState: FieldValue.increment(debtDelta),
      });
    }
    if (userSnap.exists) {
      tx.set(userRef(run.uid).collection('messages').doc(), {
        text: prize > 0
          ? `🏆 Şampiyona: ${carName} ile pisti ${fmtChampMs(timeMs)} sürede bitirdin. Ödülün ${fmtTr(prize)} altın hesabına yattı.${run.legacy ? ' (Yeni şampiyona sistemine geçiş)' : ''}`
          : `🏁 Şampiyona: ${carName} ile pisti ${fmtChampMs(timeMs)} sürede bitirdin. Ödül için 1 dakikanın altına inmelisin.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'championship_win',
        prize,
        timeMs,
      });
    }

    // günün listesi (oyuncu başına en iyi koşu)
    const board = boardSnap.exists ? boardSnap.data() : {};
    const patch = { dateKey: run.dateKey, runs: FieldValue.increment(1), paid: FieldValue.increment(prize), updatedAtMs: at };
    if (isBetterRun(board.entries?.[run.uid], timeMs)) patch.entries = { [run.uid]: entry };
    // v129: oyuncunun bugün şampiyonadan kazandığı toplam (ekranın sağ üstü)
    if (prize > 0) patch.paidBy = { [run.uid]: FieldValue.increment(prize) };
    tx.set(boardRef(run.dateKey), patch, { merge: true });

    // tüm zamanlar (ilk 10, oyuncu başına en iyi — hiç sıfırlanmaz)
    const allTop = allSnap.exists && Array.isArray(allSnap.data().top) ? allSnap.data().top : [];
    const nextTop = mergeChampionshipTop(allTop, { uid: run.uid, ...entry, dateKey: run.dateKey });
    if (JSON.stringify(nextTop) !== JSON.stringify(allTop)) tx.set(allTimeRef(), { top: nextTop, updatedAtMs: at }, { merge: true });

    // v130: başarı transaction bittikten sonra verilir (grantRunAchievements)
    return { prize, cabrio: earnsCabrioAchievement(run.catalogId, prize) };
  }

  // v130 — yarış sonrası (transaction DIŞINDA): Üstün Cabrio ile 250.000+ ödül → başarı
  async function grantRunAchievements(uid, r) {
    if (uid && r?.cabrio) await grantAchievement(uid, 'cabrioSampiyon').catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Geçiş: eski sistemle koşulmuş yarışlar (raceRooms.champV yok)
  // ---------------------------------------------------------------------------
  async function migrateLegacyDay(dayKey, { todayKey } = {}) {
    const out = { dayKey, rooms: 0, paid: 0, gold: 0, vehicles: 0, skipped: null };
    if (!dayKey || dayKey < CHAMP_V2_START_DAY || dayKey > CHAMP_V2_MIGRATE_UNTIL) {
      out.skipped = 'window';
      return out;
    }
    const catalogIds = Object.keys(catalog);
    const champRefs = catalogIds.map((id) => db.collection('championshipDaily').doc(`${id}_${dayKey}`));
    const champSnaps = await Promise.all(champRefs.map((r) => r.get()));
    const bSnap = await boardRef(dayKey).get();
    const owned = Boolean(bSnap.exists && bSnap.data().legacyOwned);
    // O gün eski sistemle (gece ilk 3) zaten ödendiyse dokunma — çift ödeme olmasın
    if (!owned && champSnaps.some((s) => s.exists && s.data().finalized && !s.data().legacyMigrated)) {
      out.skipped = 'old-paid';
      return out;
    }
    if (!owned) await boardRef(dayKey).set({ dateKey: dayKey, legacyOwned: true }, { merge: true });

    const roomsSnap = await db.collection('raceRooms').where('championshipDateKey', '==', dayKey).where('isChampionship', '==', true).get();
    for (const d of roomsSnap.docs) {
      const room0 = d.data();
      if (room0.champV === 2) continue;
      out.rooms += 1;
      const uid = room0.creatorUid;
      const me0 = room0.players?.[uid] || {};
      // aracın o günkü hakkı kullanıldı (yarış yarım kaldıysa bile)
      if (todayKey && dayKey === todayKey && me0.vehicleId) {
        const vRef = db.collection('vehicles').doc(String(me0.vehicleId));
        const marked = await db.runTransaction(async (tx) => {
          const v = await tx.get(vRef);
          if (!v.exists || String(v.data().champDay || '') >= dayKey) return false;
          tx.update(vRef, { champDay: dayKey });
          return true;
        });
        if (marked) out.vehicles += 1;
      }
      if (room0.champPrizePaid || room0.championshipResult !== 'completed' || !(Number(room0.championshipTimeMs) > 0) || !uid) continue;
      let cabrioUid = null;
      const prize = await db.runTransaction(async (tx) => {
        const rs = await tx.get(d.ref);
        const room = rs.data();
        if (!room || room.champPrizePaid || room.champV === 2 || room.championshipResult !== 'completed') return null;
        const me = room.players?.[uid] || {};
        const reads = await readRunTx(tx, { uid, dateKey: dayKey });
        const r = writeRunTx(tx, reads, {
          uid,
          name: me.displayName,
          vehicleModel: me.vehicleModel,
          catalogId: me.catalogId || room.championshipCatalogId,
          timeMs: room.championshipTimeMs,
          dateKey: dayKey,
          legacy: true,
        });
        tx.update(d.ref, { champPrizePaid: true, championshipPrize: r.prize });
        cabrioUid = r.cabrio ? uid : cabrioUid;
        return r.prize;
      });
      if (cabrioUid) await grantRunAchievements(cabrioUid, { cabrio: true });
      if (prize !== null) {
        out.paid += 1;
        out.gold += prize;
      }
    }
    // eski günlük "ilk 3" belgeleri: gece ödemesi bir daha yapılmasın
    for (const s of champSnaps) {
      if (s.exists && !s.data().legacyMigrated) await s.ref.set({ finalized: true, legacyMigrated: true }, { merge: true });
    }
    return out;
  }

  // Gece: biten günün listesi kesinleşir. v130: günün listesinde Üstün Cabrio ile
  // 250.000+ ödül alan herkese başarı (yarış anında verilemediyse yedek).
  async function finalizeDay(dayKey) {
    const ref = boardRef(dayKey);
    const s = await ref.get();
    if (!s.exists || s.data().finalized) return { skipped: true };
    const ranked = rankChampionshipBoard(s.data().entries);
    const first = ranked[0] || null;
    await ref.set({ finalized: true, winnerUid: first?.uid || null, winnerName: first?.name || null, winnerTimeMs: first?.timeMs || null }, { merge: true });
    for (const e of ranked) if (earnsCabrioAchievement(e.catalogId, e.prize)) await grantAchievement(e.uid, 'cabrioSampiyon').catch(() => {});
    return { ok: true, winnerUid: first?.uid || null };
  }

  // Eski günün "ilk 3" gece ödemesini bu sistem mi devraldı?
  async function ownsLegacyDay(dayKey) {
    if (!dayKey || dayKey < CHAMP_V2_START_DAY) return false;
    const s = await boardRef(dayKey).get();
    return Boolean(s.exists && s.data().legacyOwned);
  }

  return { readRunTx, writeRunTx, grantRunAchievements, migrateLegacyDay, finalizeDay, ownsLegacyDay, boardRef, allTimeRef };
}
