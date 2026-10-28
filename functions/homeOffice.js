// =============================================================================
// homeOffice.js — v93 Home Ofisler + stüdyo şarkı projeleri + Sixtagram şarkıları
// =============================================================================
// shopAction üzerinden çağrılır (ayrı fonksiyon yayını gerekmez).
//
// MESCİT (biz.type 'mescit')
//   op 'mescitDonate' { houseId, amount } — bağış kutusu. Bir oyuncu bir mescide
//   günde en fazla 10.000 altın bağışlar (bizSpend/{houseId}_{uid}_{gün}). %10
//   vergi düşülür, kalanı mescit sahibine. Sahip kendi mescidine bağış yapamaz.
//
// SİNEMA → venue.js menüsü (MENU_TYPES), fiyat 100–1.000, günde 10.000 sınır.
// MÜZİK STÜDYOSU → venue.js dakika ücreti (netStart/netTick/netLeave, mikser
//   konsolu tek kişi, 100–400). Şarkı aracı SADECE stüdyoda kullanılır.
//
// ŞARKI PROJELERİ (songProjects/{id} = { uid, title, song, createdAtMs, updatedAtMs })
//   op 'songSave'   { projectId?, song } — stüdyoda aktif (ya da az önce biten)
//                   mikser oturumu gerekir. Oyuncu başı en fazla 5 proje.
//   op 'songDelete' { projectId }
//   7 gün hiç değiştirilmeyen proje silinir (cleanup, saatlik).
//   Proje hangi stüdyoda yapılırsa yapılsın her stüdyoda açılır.
//
// SİXTAGRAM ŞARKILARI
//   Paylaşım: createSixtagramPost ek { type:'song', projectId } → buildSongAttachment
//   op 'songPlay' { postId } — dinlenme sayısı; bir hesap bir şarkıya en fazla 5
//                 (songPlays/{postId}_{uid}).
//   op 'songTip'  { postId, amount } — destek 10/100/1000; bir oyuncu bir sanatçıya
//                 günde en fazla 1.000 (songTips/{gün}_{bağışçı}_{sanatçı}). %10 vergi.
// =============================================================================

import { midnightDayKey } from './businessCatalogData.js';
import { bizTax, taxOf, taxLedgerWrite, socialTax } from './tax.js';
import { goldTag } from './moneyLog.js';
import { sanitizeSong, songToDoc } from './songData.js';
import {
  MESCIT_DAILY_LIMIT,
  MESCIT_MIN,
  STUDIO_SAVE_GRACE_MS,
  SONG_PROJECT_TTL_MS,
  SONG_PROJECT_MAX,
  SONG_PLAY_MAX_PER_USER,
  SONG_TIP_AMOUNTS,
  SONG_TIP_DAILY,
  SONG_TIP_PER_SONG,
  SONG_TIP_TAX_RATE,
  SONG_TIP_NOTE_MAX,
  INTERVIEW_MAX_TEXT,
} from './homeOfficeData.js';

const PRESENCE_ACTIVE_MS = 2 * 60 * 1000;
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

// Sixtagram ekini projeden kurar (createSixtagramPost içinden). Proje sahibine ait
// olmalı ve notası olmalı. Döner: { song } | { error }
// v99 — şarkı paylaşımı kayıtlı projeye bağlı değil: stüdyodaki son hâl doğrudan
// (attachment.song) gönderilir; sadece o stüdyoda yakın zamanda oturum olması
// gerekir. Proje kimliği de gelirse paylaşımdan sonra proje silinir (_deleteProjectId).
export const SONG_PUBLISH_GRACE_MS = 30 * 60 * 1000;
export async function buildSongAttachment(db, uid, attachment, now = Date.now()) {
  const projectId = String(attachment?.projectId || '');
  const houseId = String(attachment?.houseId || '');
  let proj = null;
  if (isId(projectId)) {
    const s = await db.collection('songProjects').doc(projectId).get();
    if (s.exists && s.data().uid === uid) proj = s.data();
  }
  let song = null;
  if (attachment?.song && typeof attachment.song === 'object') {
    if (!isId(houseId)) return { error: 'Şarkılar müzik stüdyolarında yapılıyor.' };
    const ss = await db.collection('netSessions').doc(`${houseId}_${uid}`).get();
    const sd = ss.exists ? ss.data() : null;
    const recent = sd && sd.deviceKey === 'mixer' && Number(sd.creditUntilMs || 0) + SONG_PUBLISH_GRACE_MS > now;
    if (!recent && !proj) return { error: 'Şarkılar müzik stüdyolarında yapılıyor. Stüdyoda projeni açıp oradan paylaş.' };
    const r = sanitizeSong(attachment.song);
    if (r.error) return r;
    song = r.song;
  } else if (proj) {
    const r = sanitizeSong(proj.song);
    if (r.error) return r;
    song = r.song;
  } else if (isId(projectId)) {
    return { error: 'Proje bulunamadı (7 gün dokunulmayan projeler silinir).' };
  } else {
    return { error: 'Şarkılar müzik stüdyolarında yapılıyor. Stüdyoda projeni açıp oradan paylaş.' };
  }
  const title = String(song.title || proj?.title || '').slice(0, 40);
  return { song: songToDoc({ ...song, title }), deleteProjectId: proj ? projectId : null };
}

// v135 — Haber Stüdyosu (röportaj) ve Tuval (resim) paylaşımı: o mekânda yakın
// zamanda (30 dk) ilgili mobilyada oturum olmalı (sahip kendi mobilyasında ücretsiz
// oturum açar; başkaları sadece mobilya ücretliyse). Arka plan / tuval sunucudan.
export const MINUTE_PUBLISH_GRACE_MS = 30 * 60 * 1000;
async function recentMinuteSession(db, uid, houseId, key, now) {
  if (!isId(houseId)) return null;
  const [ss, hs] = await Promise.all([db.collection('netSessions').doc(`${houseId}_${uid}`).get(), db.collection('houses').doc(houseId).get()]);
  if (!hs.exists) return null;
  const h = hs.data();
  if (!(h.items || []).some((it) => it.k === key && it.p === 1)) return null;
  const sd = ss.exists ? ss.data() : null;
  if (!sd || sd.deviceKey !== key || !(Number(sd.creditUntilMs || 0) + MINUTE_PUBLISH_GRACE_MS > now)) return null;
  return h;
}
export async function buildNewsInterviewAttachment(db, uid, attachment, now = Date.now()) {
  const houseId = String(attachment?.houseId || '');
  const text = typeof attachment?.text === 'string' ? attachment.text.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, INTERVIEW_MAX_TEXT) : '';
  if (!text) return { error: 'Röportaj için bir metin yazmalısın.' };
  const h = await recentMinuteSession(db, uid, houseId, 'newsdesk', now);
  if (!h) return { error: 'Röportajlar haber stüdyolarında yapılıyor. Bir haber masasına oturup oradan paylaş.' };
  const us = await db.collection('users').doc(uid).get();
  const u = us.data() || {};
  if (!u.avatar) return { error: 'Önce Profil > Avatar Oluştur ile bir avatar oluşturmalısın.' };
  return {
    type: 'interview',
    locationId: 'haber',
    text,
    avatar: u.avatar,
    displayName: String(u.displayName || 'Oyuncu').slice(0, 30),
    houseId,
    channel: String(h.name || 'Haber').slice(0, 30),
    channelEmoji: h.office?.emoji || null,
  };
}
export async function buildPaintingAttachment(db, uid, attachment, sanitize, now = Date.now()) {
  const houseId = String(attachment?.houseId || '');
  const h = await recentMinuteSession(db, uid, houseId, 'easel', now);
  if (!h) return { error: 'Resimler resim atölyelerinde çiziliyor. Bir tuvale yaklaşıp oradan paylaş.' };
  const r = sanitize(attachment);
  if (r.error) return r;
  return { drawing: { ...r.drawing, houseId, atelier: String(h.name || 'Atölye').slice(0, 30) } };
}
// v135 — destek (bağış) verilebilen Sixtagram içerikleri
export const TIP_TYPES = ['song', 'drawing', 'interview'];
const TIP_LABEL = { song: 'şarkına', drawing: 'resmine', interview: 'röportajına' };

export function createHomeOffice({ db, FieldValue, HttpsError, splitIncomeForDebt, business, assertCanSpeak = null, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const projRef = (id) => db.collection('songProjects').doc(id);

  async function txPresent(tx, uid, houseId) {
    const p = await tx.get(db.collection('housePresence').doc(uid));
    const d = p.exists ? p.data() : null;
    if (!d || d.houseId !== houseId) return false;
    const at = d.updatedAt?.toMillis?.() ?? Number(d.updatedAt || 0);
    return !(at && now() - at > PRESENCE_ACTIVE_MS);
  }

  // ---- MESCİT ----------------------------------------------------------------------
  async function mescitDonate(uid, p) {
    const houseId = String(p.houseId || '');
    const amount = Number(p.amount);
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz mekân.');
    if (!Number.isInteger(amount) || amount < MESCIT_MIN || amount > MESCIT_DAILY_LIMIT) fail('invalid-argument', 'Geçersiz bağış miktarı.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Mekân bulunamadı.');
      const h = hs.data();
      if (h.biz?.type !== 'mescit') fail('failed-precondition', 'biz-closed');
      if (!(h.items || []).some((it) => it.k === 'bagiskutusu' && it.p === 1)) fail('failed-precondition', 'Bağış kutusu yok.');
      if (h.ownerUid === uid) fail('failed-precondition', 'Kendi mescidine bağış yapamazsın.');
      if (!(await txPresent(tx, uid, houseId))) fail('failed-precondition', 'not-present');
      const t = now();
      const dayKey = midnightDayKey(t);
      const spendRef = db.collection('bizSpend').doc(`${houseId}_${uid}_${dayKey}`);
      const [us, os, ss] = await Promise.all([tx.get(userRef(uid)), tx.get(userRef(h.ownerUid)), tx.get(spendRef)]);
      const spent = Number(ss.exists ? ss.data().amount || 0 : 0);
      if (spent + amount > MESCIT_DAILY_LIMIT) fail('failed-precondition', `limit:${spent}`);
      if (Number(us.data()?.gold || 0) < amount) fail('failed-precondition', 'gold');
      const tax = bizTax(amount, 'mescit'); // v127: oran Ticaret Bakanlığı (Mescit bağışları)
      tx.update(userRef(uid), { gold: FieldValue.increment(-amount), goldTag: goldTag('mescit') });
      tx.set(spendRef, { houseId, uid, dayKey, amount: FieldValue.increment(amount), updatedAtMs: t }, { merge: true });
      if (os.exists) {
        const { goldDelta, debtDelta } = splitIncomeForDebt(os.data()?.debtToState, amount - tax);
        tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta), goldTag: goldTag('isletme') });
      }
      business?.recordIncomeTx(tx, { houseId, h, amount, kind: 'bagis', customerUid: uid, products: { bagis: 1 }, tax });
      result = { ok: true, amount, spent: spent + amount, limit: MESCIT_DAILY_LIMIT };
    });
    return result;
  }

  // ---- ŞARKI PROJELERİ ----------------------------------------------------------------
  // Aktif (ya da az önce biten) mikser oturumu var mı? Stüdyo sahibi kendi stüdyosunda da oturum açar.
  async function studioSessionOk(uid, houseId) {
    if (!isId(houseId)) return false;
    const [ss, hs] = await Promise.all([db.collection('netSessions').doc(`${houseId}_${uid}`).get(), houseRef(houseId).get()]);
    // v100: stüdyo artık işletme türü değil — mikser konsolu olan her ev
    if (!hs.exists || !(hs.data().items || []).some((it) => it.k === 'mixer' && it.p === 1)) return false;
    const s = ss.exists ? ss.data() : null;
    if (!s || s.deviceKey !== 'mixer') return false;
    return Number(s.creditUntilMs || 0) + STUDIO_SAVE_GRACE_MS > now();
  }

  async function songSave(uid, p) {
    const houseId = String(p.houseId || '');
    if (!(await studioSessionOk(uid, houseId))) fail('failed-precondition', 'studio-session');
    const r = sanitizeSong(p.song, true);
    if (r.error) fail('invalid-argument', r.error);
    const title = r.song.title || 'İsimsiz şarkı';
    const t = now();
    let projectId = String(p.projectId || '');
    if (projectId) {
      if (!isId(projectId)) fail('invalid-argument', 'Geçersiz proje.');
      const s = await projRef(projectId).get();
      if (!s.exists || s.data().uid !== uid) projectId = ''; // silinmiş (7 gün) → yeni proje olarak kaydet
    }
    if (!projectId) {
      const mine = await db.collection('songProjects').where('uid', '==', uid).limit(SONG_PROJECT_MAX + 1).get();
      if (mine.size >= SONG_PROJECT_MAX) fail('resource-exhausted', `project-max:${SONG_PROJECT_MAX}`);
      const ref = db.collection('songProjects').doc();
      await ref.set({ uid, title, song: songToDoc(r.song), createdAtMs: t, updatedAtMs: t, studioHouseId: houseId });
      return { ok: true, projectId: ref.id, created: true, updatedAtMs: t };
    }
    await projRef(projectId).update({ title, song: songToDoc(r.song), updatedAtMs: t, studioHouseId: houseId });
    return { ok: true, projectId, updatedAtMs: t };
  }

  async function songDelete(uid, p) {
    const projectId = String(p.projectId || '');
    if (!isId(projectId)) fail('invalid-argument', 'Geçersiz proje.');
    const s = await projRef(projectId).get();
    if (s.exists && s.data().uid === uid) await projRef(projectId).delete();
    return { ok: true };
  }

  // ---- SİXTAGRAM: DİNLENME / DESTEK ---------------------------------------------------
  async function songPlay(uid, p) {
    const postId = String(p.postId || '');
    if (!isId(postId)) fail('invalid-argument', 'Geçersiz gönderi.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const postRef = db.collection('sixtagramPosts').doc(postId);
      const playRef = db.collection('songPlays').doc(`${postId}_${uid}`);
      const [ps, pl] = await Promise.all([tx.get(postRef), tx.get(playRef)]);
      if (!ps.exists || ps.data().attachment?.type !== 'song') fail('not-found', 'Şarkı bulunamadı.');
      const n = Number(pl.exists ? pl.data().n || 0 : 0);
      const plays = Number(ps.data().plays || 0);
      if (n >= SONG_PLAY_MAX_PER_USER) {
        result = { ok: true, counted: false, plays };
        return;
      }
      tx.set(playRef, { postId, uid, n: n + 1, expiresAtMs: Number(ps.data().expiresAtMs || 0) || now() + 7 * 864e5, updatedAtMs: now() });
      tx.update(postRef, { plays: FieldValue.increment(1) });
      result = { ok: true, counted: true, plays: plays + 1 };
    });
    return result;
  }

  async function songTip(uid, p) {
    const postId = String(p.postId || '');
    const amount = Number(p.amount);
    if (!isId(postId)) fail('invalid-argument', 'Geçersiz gönderi.');
    if (!SONG_TIP_AMOUNTS.includes(amount)) fail('invalid-argument', 'Geçersiz destek miktarı.');
    // v99.2 — destek notu: yorum olarak (destek rozetiyle) gönderiye eklenir
    const note = String(typeof p.text === 'string' ? p.text : '')
      .replace(/[\u0000-\u001f]/g, ' ')
      .trim()
      .slice(0, SONG_TIP_NOTE_MAX);
    if (note && assertCanSpeak) await assertCanSpeak(uid, note);
    let result = null;
    await db.runTransaction(async (tx) => {
      const postRef = db.collection('sixtagramPosts').doc(postId);
      const ps = await tx.get(postRef);
      const atype = ps.data()?.attachment?.type;
      if (!ps.exists || !TIP_TYPES.includes(atype)) fail('not-found', 'Gönderi bulunamadı.');
      const artist = ps.data().uid;
      if (!artist || artist === uid) fail('failed-precondition', `Kendi ${TIP_LABEL[atype] || 'gönderine'} destek veremezsin.`);
      const t = now();
      const dayKey = midnightDayKey(t);
      const tipRef = db.collection('songTips').doc(`${dayKey}_${uid}_${artist}`);
      const songRef = db.collection('songTipPosts').doc(`${postId}_${uid}`);
      const [us, as, ts, ss] = await Promise.all([tx.get(userRef(uid)), tx.get(userRef(artist)), tx.get(tipRef), tx.get(songRef)]);
      const given = Number(ts.exists ? ts.data().amount || 0 : 0);
      const onSong = Number(ss.exists ? ss.data().amount || 0 : 0);
      if (onSong + amount > SONG_TIP_PER_SONG) fail('failed-precondition', `tip-song-limit:${onSong}`);
      if (given + amount > SONG_TIP_DAILY) fail('failed-precondition', `tip-limit:${given}`);
      if (Number(us.data()?.gold || 0) < amount) fail('failed-precondition', 'gold');
      if (!as.exists) fail('not-found', 'Sanatçı bulunamadı.');
      const tax = socialTax(amount); // v127: Sosyal Medya Vergisi (Kültür ve Spor Bakanlığı)
      tx.update(userRef(uid), { gold: FieldValue.increment(-amount), goldTag: goldTag('sanatciDestek') });
      const { goldDelta, debtDelta } = splitIncomeForDebt(as.data()?.debtToState, amount - tax);
      tx.update(userRef(artist), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta), goldTag: goldTag('sanatci') });
      taxLedgerWrite(tx, db, FieldValue, { amount: tax, source: 'sanatci', uid: artist, atMs: t, ref: postId, stat: { sosyal_sarki: amount, sosyal_sarki_n: 1 } });
      tx.set(tipRef, { dayKey, uid, artist, amount: FieldValue.increment(amount), updatedAtMs: t }, { merge: true });
      tx.set(songRef, { postId, uid, amount: FieldValue.increment(amount), expiresAtMs: Number(ps.data().expiresAtMs || 0) || t + 30 * 864e5, updatedAtMs: t }, { merge: true });
      tx.update(postRef, { tips: FieldValue.increment(amount), tipCount: FieldValue.increment(1), commentCount: FieldValue.increment(1) });
      tx.set(postRef.collection('comments').doc(), {
        uid,
        authorName: String(us.data()?.displayName || 'Oyuncu').slice(0, 30),
        authorAvatar: us.data()?.avatar || null,
        text: note,
        tip: amount,
        parentCommentId: null,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: t,
      });
      // v135 — SMS değil, Sixtagram bildirimi
      tx.set(userRef(artist).collection('sixtagramNotifications').doc(), {
        type: 'tip',
        postId,
        fromUid: uid,
        fromName: String(us.data()?.displayName || 'Bir oyuncu').slice(0, 30),
        fromAvatar: us.data()?.avatar || null,
        amount,
        what: TIP_LABEL[atype] || 'gönderine',
        textPreview: note ? note.slice(0, 80) : null,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: t,
      });
      result = { ok: true, amount, given: given + amount, limit: SONG_TIP_DAILY, onSong: onSong + amount, songLimit: SONG_TIP_PER_SONG };
    });
    return result;
  }

  // Saatlik bakım: 7 gündür değişmeyen projeler + eski sayaç kayıtları
  async function cleanup() {
    const t = now();
    const old = await db.collection('songProjects').where('updatedAtMs', '<', t - SONG_PROJECT_TTL_MS).limit(300).get();
    const plays = await db.collection('songPlays').where('expiresAtMs', '<', t).limit(300).get();
    const today = midnightDayKey(t);
    const tips = await db.collection('songTips').where('dayKey', '<', today).limit(300).get();
    const songTips = await db.collection('songTipPosts').where('expiresAtMs', '<', t).limit(300).get();
    const batch = db.batch();
    [...old.docs, ...plays.docs, ...tips.docs, ...songTips.docs].forEach((d) => batch.delete(d.ref));
    if (old.size || plays.size || tips.size || songTips.size) await batch.commit();
    return { projects: old.size, plays: plays.size, tips: tips.size };
  }

  const ops = { mescitDonate, songSave, songDelete, songPlay, songTip, postTip: songTip };
  return { ops, cleanup, studioSessionOk };
}
