// =============================================================================
// playerCard.js — v53 Oyuncu Kartı (herkese açık, güvenli özet)
// =============================================================================
// ChatsApp, çete sohbeti, Sixtagram ve mekanlarda bir oyuncunun avatarına /
// adına dokununca açılan karttaki bilgiler. users/{uid} belgesi başkalarına
// kapalı olduğu için (altın, borç, şüphe vb. içerir) istemci bu bilgileri
// doğrudan okuyamaz; bu callable YALNIZCA aşağıdaki herkese açık alanları döner:
//   ad, avatar, çete (canlı dünyada; adı + logosu + rütbesi), fabrika adı,
//   sahibi olduğu / menajeri olduğu futbol takımı, Sixtagram toplam beğeni.
// GİZLİ KALANLAR: İstihbarat üyeliği ve kod adı (hiçbir şekilde dönülmez),
// polislik, altın/banka, şüphe, borç, meslek.
// Ekstra yazma yok; okuma: users + (varsa) çete üyeliği + çete + fabrika +
// 2 takım sorgusu + Sixtagram profili ≈ 7 okuma.
// =============================================================================

const GANG_RANK_LABELS = { baba: 'Mafya Babası', sagkol: 'Sağ Kol', kidemli: 'Kıdemli', tetikci: 'Tetikçi', comez: 'Çömez' };
const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

// deps: { db, HttpsError, requireAuth, onCall, factoryDisplayName }
export function createPlayerCard({ db, HttpsError, requireAuth, onCall, factoryDisplayName }) {
  async function liveGangOf(uid) {
    const cfg = (await db.doc('gangSystem/config').get()).data();
    if (!cfg?.liveOpen || !cfg.liveWorldId) return null;
    const w = cfg.liveWorldId;
    const ms = (await db.doc(`gangWorlds/${w}/memberships/${uid}`).get()).data();
    if (!ms?.gangId) return null; // yalnızca İstihbarattaysa çete bilgisi boş kalır
    const gang = (await db.doc(`gangWorlds/${w}/gangs/${ms.gangId}`).get()).data();
    if (!gang || gang.status !== 'active') return null;
    return { name: gang.name || 'Çete', logo: gang.logo || null, rank: ms.gangRank || null, rankLabel: GANG_RANK_LABELS[ms.gangRank] || null };
  }

  async function teamsOf(uid) {
    const [owned, managed] = await Promise.all([
      db.collection('futbolTeams').where('ownerUid', '==', uid).limit(3).get(),
      db.collection('futbolTeams').where('managerUid', '==', uid).limit(3).get(),
    ]);
    const out = [];
    const seen = new Set();
    for (const [snap, role] of [
      [owned, 'owner'],
      [managed, 'manager'],
    ]) {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const t = d.data();
        out.push({ id: d.id, name: t.name || 'Takım', logo: t.logo || null, role: t.ownerUid === uid ? 'owner' : role });
      }
    }
    return out;
  }

  async function getPlayerCardImpl(viewerUid, data) {
    const uid = data?.uid;
    if (!isUid(uid)) throw new HttpsError('invalid-argument', 'Geçersiz oyuncu.');
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'Oyuncu bulunamadı.');
    const u = userSnap.data() || {};
    const [gang, factorySnap, teams, six] = await Promise.all([
      liveGangOf(uid).catch(() => null),
      db.collection('factories').doc(uid).get(),
      teamsOf(uid).catch(() => []),
      db.collection('sixtagramProfiles').doc(uid).get(),
    ]);
    return {
      uid,
      name: u.displayName || 'Oyuncu',
      avatar: u.avatar || null,
      gang,
      factory: factorySnap.exists ? { name: factoryDisplayName(factorySnap.data()) } : null,
      teams,
      sixtagramLikes: Number(six.data()?.totalLikes || 0),
      isSelf: viewerUid === uid,
    };
  }

  return {
    getPlayerCard: onCall(async (request) => getPlayerCardImpl(requireAuth(request), request.data || {})),
    _impl: { getPlayerCardImpl },
  };
}
