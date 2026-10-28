import { useEffect, useState, useSyncExternalStore } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { shopAction } from '../services/gameActions';

// =============================================================================
// v135 — Sixtagram sosyal verisi (Firestore tasarrufu):
//   • sixtagramUserLikes/{uid} TEK belge: beğenilen gönderiler + takip edilenler +
//     takipçiler (sunucu yazar). Uygulama açıkken tek dinleyici.
//   • Takip et / bırak iyimser (anında) — sunucu yanıtı gelmeden ekranda değişir.
//   • Hikâye "izlendi" bilgisi: gönderideki viewers listesi + bu cihazdaki yerel
//     liste (izlenen hikâyeler kapanınca TEK istekle sunucuya bildirilir).
//   • Başka oyuncunun profil sayaçları bir kez okunur ve 2 dk önbellekte tutulur.
// =============================================================================

// ---- takip / beğeni belgesi ------------------------------------------------------------
const EMPTY = { likedIds: new Set(), following: {}, followers: {} };
let docState = EMPTY;
let docUid = null;
let unsub = null;
let refs = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
// iyimser takip değişiklikleri: { uid: true | false }
let pending = {};

function attach(uid) {
  if (docUid === uid && unsub) return;
  unsub?.();
  docUid = uid;
  docState = EMPTY;
  pending = {};
  unsub = onSnapshot(
    doc(db, 'sixtagramUserLikes', uid),
    (snap) => {
      const d = snap.exists() ? snap.data() : {};
      const ids = d.postIds || {};
      docState = { likedIds: new Set(Object.keys(ids).filter((k) => ids[k])), following: d.following || {}, followers: d.followers || {} };
      // sunucu onayladıysa iyimser kaydı sil
      Object.keys(pending).forEach((k) => {
        if (Boolean(docState.following[k]) === pending[k]) delete pending[k];
      });
      emit();
    },
    () => {}
  );
}
function detach() {
  unsub?.();
  unsub = null;
  docUid = null;
  docState = EMPTY;
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => docState;

export function useSixtagramSocial() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  useEffect(() => {
    if (!uid) return undefined;
    refs += 1;
    attach(uid);
    return () => {
      refs -= 1;
      if (refs <= 0) {
        refs = 0;
        detach();
        emit();
      }
    };
  }, [uid]);
  const st = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    pendingListeners.add(l);
    return () => pendingListeners.delete(l);
  }, []);
  const following = { ...st.following };
  Object.entries(pending).forEach(([k, on]) => {
    if (on) following[k] = following[k] || { n: pendingNames[k] || 'Oyuncu', ms: Date.now() };
    else delete following[k];
  });
  return { likedIds: st.likedIds, following, followers: st.followers, isFollowing: (u) => Boolean(following[u]) };
}

const pendingListeners = new Set();
const pendingNames = {};
export async function setFollow(targetUid, on, name = '') {
  pending = { ...pending, [targetUid]: on };
  if (name) pendingNames[targetUid] = name;
  pendingListeners.forEach((l) => l());
  bumpProfile(targetUid, on ? 1 : -1);
  try {
    return await shopAction({ op: 'sixFollow', targetUid, on });
  } catch (e) {
    const p = { ...pending };
    delete p[targetUid];
    pending = p;
    bumpProfile(targetUid, on ? -1 : 1);
    pendingListeners.forEach((l) => l());
    throw e;
  }
}

// ---- başka oyuncunun herkese açık profil sayaçları (önbellekli) -----------------------
const profCache = new Map(); // uid → { at, data }
const profListeners = new Set();
function bumpProfile(uid, d) {
  const c = profCache.get(uid);
  if (c?.data) {
    c.data = { ...c.data, followerCount: Math.max(0, Number(c.data.followerCount || 0) + d) };
    profListeners.forEach((l) => l());
  }
}
export function useSixtagramPublicProfile(uid) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    profListeners.add(l);
    return () => profListeners.delete(l);
  }, []);
  useEffect(() => {
    if (!uid) return;
    const c = profCache.get(uid);
    if (c && Date.now() - c.at < 120_000) return;
    profCache.set(uid, { at: Date.now(), data: c?.data || null });
    getDoc(doc(db, 'sixtagramProfiles', uid))
      .then((s) => {
        profCache.set(uid, { at: Date.now(), data: s.exists() ? s.data() : {} });
        profListeners.forEach((l) => l());
      })
      .catch(() => profCache.delete(uid));
  }, [uid]);
  return uid ? profCache.get(uid)?.data || null : null;
}

// ---- hikâye izlenme -------------------------------------------------------------------
const SEEN_KEY = 'sixSeen_v1';
let seen = null; // { postId: expiresAtMs }
function loadSeen() {
  if (seen) return seen;
  seen = {};
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    const t = Date.now();
    Object.entries(raw || {}).forEach(([k, v]) => {
      if (Number(v) > t) seen[k] = Number(v);
    });
  } catch {
    /* depolama kapalı */
  }
  return seen;
}
const seenListeners = new Set();
let seenTick = 0;
let queue = new Set();
export function markStorySeen(post, myUid) {
  const s = loadSeen();
  if (!post?.id || s[post.id]) return;
  s[post.id] = Number(post.expiresAtMs || Date.now() + 864e5);
  seenTick += 1;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch {
    /* depolama kapalı */
  }
  if (post.uid !== myUid && !(post.viewers || []).includes(myUid)) queue.add(post.id);
  seenListeners.forEach((l) => l());
}
export function flushStoryViews() {
  if (!queue.size) return;
  const ids = [...queue];
  queue = new Set();
  shopAction({ op: 'storyView', postIds: ids.slice(0, 40) }).catch(() => {});
}
export const isStorySeen = (post, myUid) => Boolean(loadSeen()[post?.id] || (myUid && (post?.viewers || []).includes(myUid)));
export function useStorySeenTick() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    seenListeners.add(l);
    return () => seenListeners.delete(l);
  }, []);
  return seenTick;
}
// sayfa kapanırken bekleyen görüntülenmeler gitsin
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushStoryViews);
  document.addEventListener('visibilitychange', () => document.hidden && flushStoryViews());
}
