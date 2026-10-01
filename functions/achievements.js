// v67 — Başarılar sistemi. users/{uid}.achievements.{id} = kazanıldığı an (ms).
// grant() idempotenttir (transaction): aynı başarı ikinci kez ödül vermez.
// Ödül zümrüttür; kazanınca SMS gelir. Hata çağıranı ASLA bozmaz (best-effort).
import { ACHIEVEMENTS, ACHIEVEMENT_MAP } from './achievementsData.js';

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

  return { grant, grantMany, syncUser, sweep, ACHIEVEMENTS };
}
