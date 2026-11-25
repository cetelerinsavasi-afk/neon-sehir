import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, startAfter } from 'firebase/firestore';
import { db } from '../firebase';

// v204 MALİYET + AÇILIŞ HIZI: "Neon Şehir" grubu artık son 10 mesajla açılır (eskiden 100).
// Oyuncu yukarı kaydırınca (ya da "Önceki mesajlar"a basınca) 20'şer eski mesaj TEK SEFERLİK
// okunur ve cihazın belleğinde tutulur: aynı oturumda sohbet kapatılıp açılınca eski mesajlar
// yeniden okunmaz. Canlı dinleyici sadece son 10 mesajı izler.
export const FIRST_PAGE = 10;
export const OLDER_PAGE = 20;

const tsOf = (m) => {
  const t = m?.createdAt;
  if (!t) return Number.MAX_SAFE_INTEGER; // henüz sunucu saati yok (gönderiliyor) → en yeni
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return Number(t) || 0;
};

// Oturum boyunca cihazda tutulan eski mesajlar (canlı pencereden düşenler + "önceki" sayfalar).
// Sadece tam sohbet (max > 1) kullanır; rozet dinleyicisi (max 1) dokunmaz.
const older = new Map(); // id → mesaj
let olderExhausted = false;

export function mergeChat(live, olderList) {
  const byId = new Map();
  for (const m of olderList) byId.set(m.id, m);
  for (const m of live) byId.set(m.id, m); // canlı olan güncel sürümdür (tepkiler vb.)
  return [...byId.values()].sort((a, b) => tsOf(a) - tsOf(b));
}

/**
 * useGlobalChat — globalChat'in son `max` mesajını canlı dinler (en yeni sonda).
 * max > 1 iken `loadOlder()` ile daha eski mesajlar tek seferlik yüklenir.
 */
export function useGlobalChat({ max = FIRST_PAGE } = {}) {
  const [live, setLive] = useState([]);
  const [olderList, setOlderList] = useState(() => (max > 1 ? [...older.values()] : []));
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(() => !olderExhausted);

  useEffect(() => {
    const q = query(collection(db, 'globalChat'), orderBy('createdAt', 'desc'), limit(max));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        if (max > 1) {
          // Canlı pencereden düşen (yeni mesaj gelince) mesajlar kaybolmasın: cihazda kalsın
          setLive((prev) => {
            const keep = new Set(msgs.map((m) => m.id));
            let moved = false;
            for (const m of prev) {
              if (!keep.has(m.id) && !older.has(m.id)) {
                older.set(m.id, m);
                moved = true;
              }
            }
            if (moved) setOlderList([...older.values()]);
            return msgs;
          });
        } else {
          setLive(msgs);
        }
        setLoading(false);
      },
      (err) => {
        console.error('useGlobalChat dinleme hatası:', err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [max]);

  const loadOlder = useCallback(async () => {
    if (max <= 1 || loadingOlder || olderExhausted) return 0;
    const all = mergeChat(live, [...older.values()]);
    const oldest = all.find((m) => m.createdAt);
    if (!oldest) return 0;
    setLoadingOlder(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'globalChat'), orderBy('createdAt', 'desc'), startAfter(oldest.createdAt), limit(OLDER_PAGE))
      );
      snap.docs.forEach((d) => older.set(d.id, { id: d.id, ...d.data() }));
      if (snap.size < OLDER_PAGE) {
        olderExhausted = true;
        setHasMore(false);
      }
      setOlderList([...older.values()]);
      return snap.size;
    } catch (err) {
      console.error('useGlobalChat eski mesajlar:', err);
      return 0;
    } finally {
      setLoadingOlder(false);
    }
  }, [max, live, loadingOlder]);

  const messages = useMemo(() => (max > 1 ? mergeChat(live, olderList) : live), [max, live, olderList]);
  return { messages, loading, loadOlder, loadingOlder, hasMore: max > 1 && hasMore };
}
