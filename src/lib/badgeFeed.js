// =============================================================================
// v188 — Bildirim rozetleri / üst bildirim şeridi: Realtime Database (badge)
//
// Eskiden ChatsApp rozeti ve üst şerit globalChat'in son mesajını (limit 1), Sixtagram rozeti
// stats/sixtagram belgesini Firestore'dan dinliyordu: her yeni mesaj / gönderi çevrimiçi HER
// oyuncuya 1 Firestore okuması. Artık sunucu (sendChatMessage, createSixtagramPost) RTDB'ye
// küçük bir özet yazar, burası onu dinler — uygulama genelinde TEK abonelik.
//   badge/chat = { id, uid, name, text, at } · badge/six = { uid, at }
// RTDB'ye ulaşılamazsa rozet / şerit gösterilmez (Firestore yedeği yok).
// Sohbet ekranının kendisi (GroupChat) Firestore'dan okumaya devam eder.
// =============================================================================
import { useEffect, useState } from 'react';
import { app } from '../firebase';

const DB_URL = (import.meta.env || {}).VITE_FIREBASE_DATABASE_URL; // (testte import.meta.env yok)
let modP = null;
const rt = () => {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
};

// state: 'loading' | 'ok' | 'off'
const shared = { state: 'loading', data: { chat: null, six: null }, subs: new Set(), off: null, timer: 0 };
const emit = () => shared.subs.forEach((f) => f(shared));

export function parseBadges(val) {
  const v = val && typeof val === 'object' ? val : {};
  const c = v.chat && typeof v.chat === 'object' ? v.chat : null;
  const s = v.six && typeof v.six === 'object' ? v.six : null;
  return {
    chat: c && c.id ? { id: String(c.id), uid: c.uid || null, name: c.name || 'Oyuncu', text: String(c.text || ''), at: Number(c.at) || 0 } : null,
    six: s ? { uid: s.uid || null, at: Number(s.at) || 0 } : null,
  };
}

function start() {
  if (shared.off) return;
  if (!DB_URL) {
    shared.state = 'off';
    emit();
    return;
  }
  let alive = true;
  let unsub = () => {};
  shared.off = () => {
    alive = false;
    unsub();
  };
  rt()
    .then(({ m, db }) => {
      if (!alive) return;
      unsub = m.onValue(
        m.ref(db, 'badge'),
        (snap) => {
          shared.state = 'ok';
          shared.data = parseBadges(snap.val());
          emit();
        },
        () => fail()
      );
    })
    .catch(() => fail());
  // izin hatası (oturum henüz açılmadı / yenilendi) ya da bağlantı sorunu: 20 sn sonra yeniden dene
  function fail() {
    if (!alive) return;
    alive = false;
    shared.off = null;
    shared.state = 'off';
    emit();
    setTimeout(() => shared.subs.size && !shared.off && start(), 20_000);
  }
}

export function subscribeBadges(fn) {
  shared.subs.add(fn);
  clearTimeout(shared.timer);
  start();
  fn(shared);
  return () => {
    shared.subs.delete(fn);
    if (!shared.subs.size) {
      shared.timer = setTimeout(() => {
        if (shared.subs.size || !shared.off) return;
        shared.off();
        shared.off = null;
        shared.state = 'loading';
        shared.data = { chat: null, six: null };
      }, 60_000);
    }
  };
}

// { state, chat, six } — chat/six null olabilir (henüz mesaj yok / RTDB yok)
export function useBadges(enabled = true) {
  const [s, setS] = useState(() => ({ state: 'loading', chat: null, six: null }));
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeBadges((x) => setS({ state: x.state, chat: x.data.chat, six: x.data.six }));
  }, [enabled]);
  return s;
}
