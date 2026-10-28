// =============================================================================
// sixtagramSocial.js — v135 Sixtagram: takip sistemi + hikâye görüntülenmeleri
// shopAction üzerinden çağrılır (yeni fonksiyon yayını / Firestore kuralı gerekmez).
// =============================================================================
//   op 'sixFollow' { targetUid, on:true|false } — takip et / takibi bırak
//   op 'storyView' { postIds:[…] } — izlenen hikâyeler (en fazla 40; tek seferde)
//
// Veri (okuma maliyeti düşük kalsın diye):
//   sixtagramUserLikes/{uid}.following.{hedef} = { n: ad, ms }  (sahibi okur — zaten
//     beğeniler için dinlenen TEK belge; ekstra dinleyici yok)
//   sixtagramUserLikes/{uid}.followers.{takipçi} = { n: ad, ms }
//   sixtagramProfiles/{uid}.followerCount / followingCount (herkese açık sayaçlar)
//   sixtagramPosts/{id}.viewers = [uid…] (hikâyeyi görenler; görülme sayısı = uzunluk,
//     "izledim mi" = listede miyim → cihazlar arası da tutarlı)
//   users/{hedef}/sixtagramNotifications — 'follow' bildirimi (SMS değil)
// =============================================================================

export const SIX_STORY_VIEW_MAX = 40;
const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

export function createSixtagramSocial({ db, FieldValue, HttpsError, isBlockedBy = async () => false, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const likesRef = (uid) => db.collection('sixtagramUserLikes').doc(uid);
  const profRef = (uid) => db.collection('sixtagramProfiles').doc(uid);
  const userRef = (uid) => db.collection('users').doc(uid);

  async function sixFollow(uid, p) {
    const target = String(p.targetUid || '');
    const on = p.on === true;
    if (!isUid(target) || target === uid || target.startsWith('__')) fail('invalid-argument', 'Geçersiz oyuncu.');
    if (on && (await isBlockedBy(target, uid))) fail('permission-denied', 'Bu oyuncuyu takip edemezsin.');
    let result = null;
    let notify = null;
    await db.runTransaction(async (tx) => {
      const [mine, me, them] = await Promise.all([tx.get(likesRef(uid)), tx.get(userRef(uid)), tx.get(userRef(target))]);
      if (!them.exists) fail('not-found', 'Oyuncu bulunamadı.');
      const already = Boolean(mine.exists && mine.data()?.following?.[target]);
      const t = now();
      if (on === already) {
        result = { ok: true, following: already, changed: false };
        return;
      }
      const myName = String(me.data()?.displayName || 'Oyuncu').slice(0, 30);
      const theirName = String(them.data()?.displayName || 'Oyuncu').slice(0, 30);
      if (on) {
        tx.set(likesRef(uid), { following: { [target]: { n: theirName, ms: t } } }, { merge: true });
        tx.set(likesRef(target), { followers: { [uid]: { n: myName, ms: t } } }, { merge: true });
        tx.set(profRef(uid), { followingCount: FieldValue.increment(1) }, { merge: true });
        tx.set(profRef(target), { followerCount: FieldValue.increment(1) }, { merge: true });
        notify = { fromName: myName };
      } else {
        tx.set(likesRef(uid), { following: { [target]: FieldValue.delete() } }, { merge: true });
        tx.set(likesRef(target), { followers: { [uid]: FieldValue.delete() } }, { merge: true });
        tx.set(profRef(uid), { followingCount: FieldValue.increment(-1) }, { merge: true });
        tx.set(profRef(target), { followerCount: FieldValue.increment(-1) }, { merge: true });
      }
      result = { ok: true, following: on, changed: true };
    });
    // takip bildirimi — sadece takip edince (bırakınca değil); 6 saatte bir kez yığılmasın
    if (notify) {
      await userRef(target)
        .collection('sixtagramNotifications')
        .doc(`follow_${uid}`)
        .set({ type: 'follow', fromUid: uid, fromName: notify.fromName, postId: null, textPreview: null, read: false, createdAt: FieldValue.serverTimestamp(), createdAtMs: now() })
        .catch(() => {});
    }
    return result;
  }

  async function storyView(uid, p) {
    const ids = [...new Set((Array.isArray(p.postIds) ? p.postIds : []).filter(isUid))].slice(0, SIX_STORY_VIEW_MAX);
    if (!ids.length) return { ok: true, n: 0 };
    // sadece yazma (okuma yok): görülen hikâyeye görenler listesine eklenir
    const res = await Promise.all(
      ids.map((id) =>
        db
          .collection('sixtagramPosts')
          .doc(id)
          .update({ viewers: FieldValue.arrayUnion(uid) })
          .then(() => 1)
          .catch(() => 0)
      )
    );
    return { ok: true, n: res.reduce((a, b) => a + b, 0) };
  }

  return { ops: { sixFollow, storyView } };
}
