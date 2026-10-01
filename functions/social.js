// =============================================================================
// social.js — v60 Arkadaşlık + Özel Sohbet (ChatsApp)
// =============================================================================
//
// Onaylı kararlar:
//   - Tüm yazmalar SUNUCUDA (tek callable: socialAction). İstemci hiçbir
//     koleksiyona yazamaz (firestore.rules → write: false).
//   - Yalnızca ARKADAŞLAR birbirine yazabilir. Susturulmuş/banlı oyuncu özel
//     mesaj da gönderemez (assertCanSpeak).
//   - Engelleme arkadaşlığı bitirir, sohbeti ve bekleyen istekleri siler;
//     engellenen / engelleyen istek gönderemez (onBlocked).
//   - Arkadaşlıktan çıkarınca sohbet İKİ TARAFTAN da silinir.
//   - Kabul edilmeyen istek 48 saatte, mesajlar 7 günde silinir (socialCleanup).
//
// Koleksiyonlar (yalnızca sunucu yazar):
//   friendships/{uid}            — { friends: { <uid>: { name, avatar, sinceMs } }, updatedAtMs }  (yalnızca sahibi okur)
//   friendRequests/{from}_{to}   — { fromUid, toUid, fromName, fromAvatar, toName, toAvatar, createdAtMs, expiresAtMs } (iki taraf okur)
//   dmChats/{a}__{b}             — { members:[a,b], names, avatars, lastText, lastSenderUid, lastAtMs, unread:{a,b}, createdAtMs } (üyeler okur)
//   dmChats/{id}/dmMessages/{m}  — { uid, text, createdAtMs, createdAt, hidden? } (üyeler okur)
//
// Tüm sorgular tek alanlıdır (array-contains / == / <) → yeni indeks gerekmez.
// =============================================================================

import { isMsgId, nextReaction, replyQuoteOf } from './chatExtras.js';

export const SOCIAL = {
  MAX_FRIENDS: 200,
  REQUESTS_PER_DAY: 30,
  REQUEST_TTL_MS: 48 * 60 * 60 * 1000,
  MESSAGE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  MESSAGE_MAX: 500,
  MIN_SEND_INTERVAL_MS: 800,
  DELETE_BATCH: 400,
};

const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
export const chatIdOf = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
const cleanText = (t) => String(t || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const nameOf = (u) => String(u?.displayName || 'Oyuncu').slice(0, 40);
const avatarOf = (u) => u?.avatar || null;

// deps: { db, FieldValue, HttpsError, requireAuth, onCall, assertCanSpeak, isBlockedBy, dateKey, now? }
export function createSocial({ db, FieldValue, HttpsError, requireAuth, onCall, assertCanSpeak, isBlockedBy, dateKey, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const friendsRef = (uid) => db.collection('friendships').doc(uid);
  const requestRef = (from, to) => db.collection('friendRequests').doc(`${from}_${to}`);
  const chatRef = (a, b) => db.collection('dmChats').doc(chatIdOf(a, b));
  const userRef = (uid) => db.collection('users').doc(uid);

  const friendsMapOf = (snap) => (snap?.exists ? snap.data()?.friends || {} : {});
  const liveRequest = (snap, t) => snap?.exists && Number(snap.data()?.expiresAtMs || 0) > t;

  // Bir sohbetin tüm mesajlarını ve kendisini siler (idempotent; parça parça).
  async function deleteChatById(chatId) {
    const ref = db.collection('dmChats').doc(chatId);
    for (let guard = 0; guard < 50; guard++) {
      const snap = await ref.collection('dmMessages').limit(SOCIAL.DELETE_BATCH).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (snap.size < SOCIAL.DELETE_BATCH) break;
    }
    await ref.delete();
  }

  // İki oyuncu arasındaki arkadaşlığı, sohbeti ve bekleyen istekleri kaldırır.
  async function severRelation(a, b) {
    await db.runTransaction(async (tx) => {
      const [fa, fb] = await Promise.all([tx.get(friendsRef(a)), tx.get(friendsRef(b))]);
      if (friendsMapOf(fa)[b]) tx.set(friendsRef(a), { friends: { [b]: FieldValue.delete() }, updatedAtMs: now() }, { merge: true });
      if (friendsMapOf(fb)[a]) tx.set(friendsRef(b), { friends: { [a]: FieldValue.delete() }, updatedAtMs: now() }, { merge: true });
      tx.delete(requestRef(a, b));
      tx.delete(requestRef(b, a));
    });
    await deleteChatById(chatIdOf(a, b));
  }

  // ---- İstekler ----------------------------------------------------------------
  async function sendFriendRequest(uid, p) {
    const target = p.targetUid;
    if (!isUid(target) || target === uid) fail('invalid-argument', 'Geçersiz oyuncu.');
    const [meSnap, targetSnap] = await Promise.all([userRef(uid).get(), userRef(target).get()]);
    if (!targetSnap.exists) fail('not-found', 'Oyuncu bulunamadı.');
    const [iBlocked, theyBlocked] = await Promise.all([isBlockedBy(uid, target), isBlockedBy(target, uid)]);
    if (iBlocked) fail('failed-precondition', 'Bu oyuncuyu engellemişsin; önce engeli kaldır.');
    if (theyBlocked) fail('failed-precondition', 'Bu oyuncuya arkadaşlık isteği gönderilemiyor.');
    const t = now();
    const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey()}`);
    let result = 'sent';
    await db.runTransaction(async (tx) => {
      const [myF, theirF, outReq, inReq, daily] = await Promise.all([
        tx.get(friendsRef(uid)),
        tx.get(friendsRef(target)),
        tx.get(requestRef(uid, target)),
        tx.get(requestRef(target, uid)),
        tx.get(dailyRef),
      ]);
      const mine = friendsMapOf(myF);
      const theirs = friendsMapOf(theirF);
      if (mine[target]) fail('already-exists', 'Zaten arkadaşsınız.');
      if (Object.keys(mine).length >= SOCIAL.MAX_FRIENDS) fail('resource-exhausted', `En fazla ${SOCIAL.MAX_FRIENDS} arkadaşın olabilir.`);
      // Karşı taraf zaten istek göndermişse: doğrudan arkadaş olun
      if (liveRequest(inReq, t)) {
        if (Object.keys(theirs).length >= SOCIAL.MAX_FRIENDS) fail('resource-exhausted', 'Bu oyuncunun arkadaş listesi dolu.');
        tx.set(friendsRef(uid), { friends: { [target]: { name: nameOf(targetSnap.data()), avatar: avatarOf(targetSnap.data()), sinceMs: t } }, updatedAtMs: t }, { merge: true });
        tx.set(friendsRef(target), { friends: { [uid]: { name: nameOf(meSnap.data()), avatar: avatarOf(meSnap.data()), sinceMs: t } }, updatedAtMs: t }, { merge: true });
        tx.delete(inReq.ref);
        tx.delete(outReq.ref);
        result = 'accepted';
        return;
      }
      if (liveRequest(outReq, t)) fail('already-exists', 'Arkadaşlık isteğin zaten gönderildi.');
      const count = Number(daily.data()?.friendRequestCount || 0);
      if (count >= SOCIAL.REQUESTS_PER_DAY) fail('resource-exhausted', 'Bugün yeterince arkadaşlık isteği gönderdin, yarın tekrar deneyebilirsin.');
      tx.set(outReq.ref, {
        fromUid: uid,
        toUid: target,
        fromName: nameOf(meSnap.data()),
        fromAvatar: avatarOf(meSnap.data()),
        toName: nameOf(targetSnap.data()),
        toAvatar: avatarOf(targetSnap.data()),
        createdAtMs: t,
        expiresAtMs: t + SOCIAL.REQUEST_TTL_MS,
      });
      tx.set(dailyRef, { friendRequestCount: count + 1 }, { merge: true });
    });
    return { ok: true, result };
  }

  async function cancelFriendRequest(uid, p) {
    if (!isUid(p.targetUid)) fail('invalid-argument', 'Geçersiz oyuncu.');
    await requestRef(uid, p.targetUid).delete();
    return { ok: true };
  }

  async function respondFriendRequest(uid, p) {
    const from = p.fromUid;
    if (!isUid(from) || from === uid) fail('invalid-argument', 'Geçersiz istek.');
    const accept = p.accept === true;
    const t = now();
    if (!accept) {
      await requestRef(from, uid).delete();
      return { ok: true, result: 'rejected' };
    }
    const [meSnap, fromSnap] = await Promise.all([userRef(uid).get(), userRef(from).get()]);
    if (!fromSnap.exists) {
      await requestRef(from, uid).delete();
      fail('not-found', 'Bu oyuncu artık yok.');
    }
    if (await isBlockedBy(uid, from)) fail('failed-precondition', 'Bu oyuncuyu engellemişsin; önce engeli kaldır.');
    await db.runTransaction(async (tx) => {
      const [req, myF, theirF] = await Promise.all([tx.get(requestRef(from, uid)), tx.get(friendsRef(uid)), tx.get(friendsRef(from))]);
      if (!liveRequest(req, t)) fail('not-found', 'Bu isteğin süresi dolmuş ya da geri çekilmiş.');
      if (Object.keys(friendsMapOf(myF)).length >= SOCIAL.MAX_FRIENDS) fail('resource-exhausted', `En fazla ${SOCIAL.MAX_FRIENDS} arkadaşın olabilir.`);
      if (Object.keys(friendsMapOf(theirF)).length >= SOCIAL.MAX_FRIENDS) fail('resource-exhausted', 'Bu oyuncunun arkadaş listesi dolu.');
      tx.set(friendsRef(uid), { friends: { [from]: { name: nameOf(fromSnap.data()), avatar: avatarOf(fromSnap.data()), sinceMs: t } }, updatedAtMs: t }, { merge: true });
      tx.set(friendsRef(from), { friends: { [uid]: { name: nameOf(meSnap.data()), avatar: avatarOf(meSnap.data()), sinceMs: t } }, updatedAtMs: t }, { merge: true });
      tx.delete(req.ref);
      tx.delete(requestRef(uid, from));
    });
    return { ok: true, result: 'accepted' };
  }

  async function removeFriend(uid, p) {
    if (!isUid(p.targetUid) || p.targetUid === uid) fail('invalid-argument', 'Geçersiz oyuncu.');
    await severRelation(uid, p.targetUid);
    return { ok: true };
  }

  // ---- Mesajlar ----------------------------------------------------------------
  async function sendDm(uid, p) {
    const target = p.targetUid;
    if (!isUid(target) || target === uid) fail('invalid-argument', 'Geçersiz oyuncu.');
    const text = cleanText(p.text);
    if (!text) fail('invalid-argument', 'Mesaj boş olamaz.');
    if (text.length > SOCIAL.MESSAGE_MAX) fail('invalid-argument', `Mesaj en fazla ${SOCIAL.MESSAGE_MAX} karakter olabilir.`);
    await assertCanSpeak(uid);
    const meSnap = await userRef(uid).get();
    const myName = nameOf(meSnap.data());
    const myAvatar = avatarOf(meSnap.data());
    const t = now();
    const cRef = chatRef(uid, target);
    const msgRef = cRef.collection('dmMessages').doc();
    // v72: yanıt (alıntı sunucuda yanıtlanan mesajdan okunur)
    const replyToId = p.replyToId;
    if (replyToId != null && !isMsgId(replyToId)) fail('invalid-argument', 'Geçersiz mesaj.');
    await db.runTransaction(async (tx) => {
      const [myF, chat, rSnap] = await Promise.all([
        tx.get(friendsRef(uid)),
        tx.get(cRef),
        replyToId != null ? tx.get(cRef.collection('dmMessages').doc(replyToId)) : Promise.resolve(null),
      ]);
      const friend = friendsMapOf(myF)[target];
      if (!friend) fail('permission-denied', 'Yalnızca arkadaşlarına mesaj gönderebilirsin.');
      const c = chat.exists ? chat.data() : null;
      const last = Number(c?.lastSentAtMs?.[uid] || 0);
      if (t - last < SOCIAL.MIN_SEND_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş — mesajlar arasında kısa bir süre bekle.');
      let replyTo = null;
      if (replyToId != null) {
        const rd = rSnap?.exists ? rSnap.data() : null;
        const rName = rd?.uid === uid ? myName : c?.names?.[rd?.uid] || friend.name;
        replyTo = rd ? replyQuoteOf(replyToId, rd, rName) : null;
        if (!replyTo) fail('failed-precondition', 'Yanıtlanan mesaj artık yok.');
      }
      tx.set(msgRef, { uid, text, ...(replyTo ? { replyTo } : {}), createdAtMs: t, createdAt: FieldValue.serverTimestamp() });
      const [a, b] = uid < target ? [uid, target] : [target, uid];
      tx.set(
        cRef,
        {
          members: [a, b],
          names: { [uid]: myName, [target]: c?.names?.[target] || friend.name || 'Oyuncu' },
          avatars: { [uid]: myAvatar, [target]: c?.avatars?.[target] ?? friend.avatar ?? null },
          lastText: text.slice(0, 120),
          lastSenderUid: uid,
          lastAtMs: t,
          lastSentAtMs: { [uid]: t },
          unread: { [target]: FieldValue.increment(1), [uid]: 0 },
          ...(c ? {} : { createdAtMs: t }),
        },
        { merge: true }
      );
      // Arkadaşın listesindeki adım/avatarım güncel kalsın (yalnızca değiştiyse)
      if (c && (c.names?.[uid] !== myName || JSON.stringify(c.avatars?.[uid] ?? null) !== JSON.stringify(myAvatar))) {
        tx.set(friendsRef(target), { friends: { [uid]: { name: myName, avatar: myAvatar } } }, { merge: true });
      }
    });
    // 7 günden eski mesajları bu sohbette buda (en iyi çaba; hata mesajı bozmaz)
    try {
      const old = await cRef.collection('dmMessages').where('createdAtMs', '<', t - SOCIAL.MESSAGE_TTL_MS).limit(100).get();
      if (!old.empty) {
        const batch = db.batch();
        old.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error('sendDm prune', err);
    }
    return { ok: true, id: msgRef.id };
  }

  // v72: özel sohbette mesaja emoji tepkisi (sadece sohbet üyeleri ve arkadaşlar)
  async function reactDm(uid, p) {
    const target = p.targetUid;
    if (!isUid(target) || target === uid) fail('invalid-argument', 'Geçersiz sohbet.');
    if (!isMsgId(p.msgId)) fail('invalid-argument', 'Geçersiz mesaj.');
    const cRef = chatRef(uid, target);
    const mRef = cRef.collection('dmMessages').doc(p.msgId);
    await db.runTransaction(async (tx) => {
      const [myF, chat, m] = await Promise.all([tx.get(friendsRef(uid)), tx.get(cRef), tx.get(mRef)]);
      if (!friendsMapOf(myF)[target]) fail('permission-denied', 'Yalnızca arkadaşlarınla yazışabilirsin.');
      if (!chat.exists || !(chat.data().members || []).includes(uid)) fail('not-found', 'Sohbet bulunamadı.');
      if (!m.exists || m.data()?.hidden) fail('failed-precondition', 'Mesaj artık yok.');
      const r = nextReaction(m.data()?.reactions?.[uid], p.emoji);
      if (r.error) fail('invalid-argument', r.error);
      tx.update(mRef, { [`reactions.${uid}`]: r.remove ? FieldValue.delete() : r.value });
    });
    return { ok: true };
  }

  async function markDmRead(uid, p) {
    const target = p.targetUid;
    if (!isUid(target) || target === uid) fail('invalid-argument', 'Geçersiz sohbet.');
    const cRef = chatRef(uid, target);
    await db.runTransaction(async (tx) => {
      const s = await tx.get(cRef);
      if (!s.exists || !(s.data().members || []).includes(uid)) return;
      if (Number(s.data().unread?.[uid] || 0) === 0) return;
      tx.set(cRef, { unread: { [uid]: 0 } }, { merge: true });
    });
    return { ok: true };
  }

  // ---- Engelleme kancası (moderation.blockUser çağırır) -------------------------------
  async function onBlocked(uid, targetUid) {
    if (!isUid(uid) || !isUid(targetUid) || uid === targetUid) return;
    await severRelation(uid, targetUid);
  }

  // ---- Saatlik temizlik ----------------------------------------------------------------
  // Süresi dolan istekler ve 7 gündür mesaj gelmeyen sohbetler (tüm mesajları
  // 7 günden eski) silinir. Aktif sohbetlerdeki eski mesajlar her gönderimde budanır.
  async function cleanup() {
    const t = now();
    let requests = 0;
    let chats = 0;
    const reqSnap = await db.collection('friendRequests').where('expiresAtMs', '<=', t).limit(500).get();
    if (!reqSnap.empty) {
      const batch = db.batch();
      reqSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      requests = reqSnap.size;
    }
    const chatSnap = await db.collection('dmChats').where('lastAtMs', '<', t - SOCIAL.MESSAGE_TTL_MS).limit(100).get();
    for (const d of chatSnap.docs) {
      try {
        await deleteChatById(d.id);
        chats += 1;
      } catch (err) {
        console.error('socialCleanup chat', d.id, err);
      }
    }
    return { requests, chats };
  }

  const ACTIONS = { sendFriendRequest, cancelFriendRequest, respondFriendRequest, removeFriend, sendDm, markDmRead, reactDm };
  async function handle(uid, data) {
    const fn = ACTIONS[data?.action];
    if (!fn) fail('invalid-argument', 'Geçersiz işlem.');
    return fn(uid, data.payload || {});
  }

  return {
    socialAction: onCall(async (request) => handle(requireAuth(request), request.data || {})),
    onBlocked,
    cleanup,
    _impl: { handle, deleteChatById, severRelation },
  };
}
