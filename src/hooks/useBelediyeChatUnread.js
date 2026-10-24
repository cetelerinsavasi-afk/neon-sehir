// v127 — Belediye sohbetleri için "yeni mesaj" noktası (çete sohbetlerindeki gibi).
// Kanal başına tek hafif dinleyici (son 1 mesaj); görülme zamanı tarayıcıda
// (localStorage, oyuncu başına). BelediyeChat açıkken markBelediyeChatSeen çağrılır.
import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const KEY = (uid, ch) => `bd_chat_seen_${uid}_${ch}`;
const listeners = new Set();
const readSeen = (uid, ch) => {
  try {
    return Number(localStorage.getItem(KEY(uid, ch)) || 0);
  } catch {
    return 0;
  }
};

export function markBelediyeChatSeen(uid, ch, ms) {
  if (!uid || !ms) return;
  if (readSeen(uid, ch) >= ms) return;
  try {
    localStorage.setItem(KEY(uid, ch), String(ms));
  } catch {
    /* tarayıcı depolaması kapalı */
  }
  listeners.forEach((f) => f());
}

// isMine(m): kendi mesajım nokta yakmaz
export function useBelediyeChatUnread(uid, ch, enabled, isMine) {
  const [latest, setLatest] = useState(null);
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  useEffect(() => {
    if (!enabled || !uid) {
      setLatest(null);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, `belediyeChat_${ch}`), orderBy('createdAtMs', 'desc'), limit(1)),
      (s) => setLatest(s.docs[0] ? s.docs[0].data() : null),
      () => setLatest(null)
    );
  }, [uid, ch, enabled]);
  if (!enabled || !latest) return false;
  if (isMine?.(latest)) return false;
  return Number(latest.createdAtMs || 0) > readSeen(uid, ch);
}
