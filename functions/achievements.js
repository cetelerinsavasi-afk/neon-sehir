// v67 — Başarılar sistemi. users/{uid}.achievements.{id} = kazanıldığı an (ms).
// grant() idempotenttir (transaction): aynı başarı ikinci kez ödül vermez.
// Ödül zümrüttür; kazanınca SMS gelir. Hata çağıranı ASLA bozmaz (best-effort).
import { ACHIEVEMENTS, ACHIEVEMENT_MAP, LEGACY_ACHIEVEMENT_REWARDS } from './achievementsData.js';

export function createAchievements({ db, FieldValue, now = () => Date.now() }) {
  async function grant(uid, id) {
    const a = ACHIEVEMENT_MAP[id];
    if (!a || !uid || typeof uid !== 'string') return false;
    try {
      const ref = db.collection('users').doc(uid);
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        if (snap.data()?.achievements?.[id]) return false;
        tx.update(ref, {
          [`achievements.${id}`]: now(),
          [`achievementRewards.${id}`]: a.reward, // v74: kazanılan ödül (ekranda gösterim için)
          emerald: FieldValue.increment(a.reward),
        });
        tx.set(ref.collection('messages').doc(), {
          from: 'Başarılar',
          text: `🏆 Başarı kazandın: ${a.emoji} ${a.title}! Ödülün ${a.reward} zümrüt hesabına yüklendi.`,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          type: 'achievement',
        });
        return true;
      });
    } catch (err) {
      console.error('achievement grant hata', uid, id, err?.message || err);
      return false;
    }
  }

  // v76 — ödüller artırılmadan ÖNCE kazanılmış başarılar için fark (yeni − eski
  // ödül) TEK SEFERLİK yüklenir. achievementRewards.{id} yazıldığı için ikinci
  // kez verilmez (idempotent transaction). Tek SMS'te toplanır.
  async function topupUser(uid) {
    if (!uid || typeof uid !== 'string') return 0;
    try {
      const ref = db.collection('users').doc(uid);
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return 0;
        const u = snap.data() || {};
        const done = u.achievements || {};
        const got = u.achievementRewards || {};
        const patch = {};
        let total = 0;
        const lines = [];
        for (const a of ACHIEVEMENTS) {
          if (!done[a.id] || got[a.id] != null) continue;
          const old = LEGACY_ACHIEVEMENT_REWARDS[a.id] ?? a.reward;
          patch[`achievementRewards.${a.id}`] = a.reward;
          const diff = a.reward - old;
          if (diff > 0) {
            total += diff;
            lines.push(`${a.emoji} ${a.title} +${diff}`);
          }
        }
        if (!Object.keys(patch).length) return 0;
        if (total > 0) patch.emerald = FieldValue.increment(total);
        tx.update(ref, patch);
        if (total > 0) {
          tx.set(ref.collection('messages').doc(), {
            from: 'Başarılar',
            text: `🏆 Başarı ödülleri arttı! Önceden kazandığın başarıların farkı hesabına yüklendi: ${lines.join(', ')} — toplam ${total} zümrüt.`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
            type: 'achievement',
          });
        }
        return total;
      });
    } catch (err) {
      console.error('achievement topup hata', uid, err?.message || err);
      return 0;
    }
  }

  // Tüm oyuncular için tek seferlik tarama (migrations/achievementsTopupV76 bayrağı).
  // Sadece ilgili başarıyı kazanmış oyuncular okunur (achievements.{id} alanı).
  async function topupAll() {
    const flagRef = db.collection('migrations').doc('achievementsTopupV76');
    if ((await flagRef.get()).exists) return { skipped: true };
    const seen = new Set();
    let users = 0;
    let emerald = 0;
    for (const a of ACHIEVEMENTS) {
      if (a.reward <= (LEGACY_ACHIEVEMENT_REWARDS[a.id] ?? a.reward)) continue;
      let last = null;
      for (let page = 0; page < 50; page++) {
        let q = db.collection('users').where(`achievements.${a.id}`, '>', 0).orderBy(`achievements.${a.id}`).limit(300);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;
        for (const d of snap.docs) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          const got = await topupUser(d.id);
          if (got > 0) {
            users += 1;
            emerald += got;
          }
        }
        last = snap.docs[snap.docs.length - 1];
        if (snap.size < 300) break;
      }
    }
    await flagRef.set({ doneAtMs: now(), users, emerald });
    return { users, emerald };
  }

  async function grantMany(uids, id) {
    const list = [...new Set((uids || []).filter(Boolean))];
    for (const uid of list) await grant(uid, id);
  }

  // Duruma bağlı başarılar (şu an imam / Mafya Babası / İstihbarat Başkanı
  // olanlar) — hem oyuncu Başarılar'ı açınca (tek kişi) hem saatlik taramada.
  async function liveWorldId() {
    const cfg = (await db.doc('gangSystem/config').get()).data() || {};
    return cfg.liveOpen && cfg.liveWorldId ? cfg.liveWorldId : null;
  }

  async function syncUser(uid) {
    const [userSnap, imamSnap, world] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('imamState').doc('current').get(),
      liveWorldId(),
    ]);
    if (!userSnap.exists) return;
    await topupUser(uid); // v76: eski başarıların farkı (bir kez)
    if (imamSnap.exists && imamSnap.data()?.uid === uid) await grant(uid, 'imam');
    if (world) {
      const m = (await db.doc(`gangWorlds/${world}/memberships/${uid}`).get()).data();
      if (m?.gangId && m.gangRank === 'baba') await grant(uid, 'mafyaBabasi');
      if (m?.intelRosterId) {
        const r = (await db.doc(`gangWorlds/${world}/intelRoster/${m.intelRosterId}`).get()).data();
        if (r?.rank === 'baskan') await grant(uid, 'istihbaratBaskani');
      }
    }
  }

  async function sweep() {
    await topupAll().catch((err) => console.error('achievements topupAll', err?.message || err));
    const imamSnap = await db.collection('imamState').doc('current').get();
    if (imamSnap.exists) await grant(imamSnap.data()?.uid, 'imam');
    const world = await liveWorldId();
    if (!world) return;
    const babas = await db.collection(`gangWorlds/${world}/memberships`).where('gangRank', '==', 'baba').limit(200).get();
    await grantMany(babas.docs.filter((d) => d.data()?.gangId).map((d) => d.id), 'mafyaBabasi');
    const baskan = await db.collection(`gangWorlds/${world}/intelRoster`).where('rank', '==', 'baskan').limit(5).get();
    for (const d of baskan.docs) {
      const link = (await db.doc(`gangWorlds/${world}/intelRosterLinks/${d.id}`).get()).data();
      if (link?.actorId) await grant(link.actorId, 'istihbaratBaskani');
    }
  }

  return { grant, grantMany, syncUser, sweep, topupUser, topupAll, ACHIEVEMENTS };
}
