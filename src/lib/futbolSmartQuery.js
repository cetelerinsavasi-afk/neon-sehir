// =============================================================================
// v205 — FUTBOL: maç saati dışında okuma yok (veri cihazda)
//
// Lig fikstürü, kupa maçları ve sezon istatistikleri SADECE maç saatinde değişir
// (18:00 başlar, 19:00 sonuçlar açıklanır — resolveFutbolMatchday*). Eskiden bu listeler
// canlı dinleniyordu ve ekran 30 dk'dan uzun aradan sonra her açıldığında YÜZLERCE maç
// baştan faturalanıyordu (ölçüm: lig fikstürü okumalarının %99'u bu "yeniden açılış").
//
// Artık:
//   • maç penceresinde (17:55–19:30, İstanbul) → canlı dinleyici (skorlar anında akar),
//   • pencere dışında → sorgu bir kez sunucudan okunur, Firestore'un cihazdaki önbelleğine
//     (IndexedDB) yazılır; bir sonraki maç penceresine kadar (en fazla 3 saat) ekran her
//     açıldığında veriler CİHAZDAN gelir → 0 okuma, anında açılış.
//   • önbellek eksikse (temizlenmiş / gizli sekme) sessizce sunucudan okunur.
// Hiçbir yazma yok; oyuncu verisi etkilenmez.
// =============================================================================
import { useEffect, useState } from 'react';
import { getDocs, getDocsFromCache, onSnapshot } from 'firebase/firestore';

const LIVE_FROM = 17 * 60 + 55; // 17:55
const LIVE_TO = 19 * 60 + 30; // 19:30 (açıklama işi rahatça bitsin)
const MAX_VALID_MS = 3 * 3600_000;
const PREFIX = 'ns_fsq1:';

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });
function istanbulMinute(ms) {
  const [h, m] = fmt.format(new Date(ms)).split(':').map(Number);
  return (h % 24) * 60 + m;
}

export function isFutbolLiveWindow(now = Date.now()) {
  const m = istanbulMinute(now);
  return m >= LIVE_FROM && m < LIVE_TO;
}

// Bir sonraki maç penceresinin başlangıcına kalan süre (en fazla 3 saat)
export function futbolCacheValidMs(now = Date.now()) {
  const m = istanbulMinute(now);
  const toLive = m < LIVE_FROM ? LIVE_FROM - m : 24 * 60 - m + LIVE_FROM;
  return Math.max(0, Math.min(MAX_VALID_MS, toLive * 60_000 - 30_000));
}

const readMark = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(PREFIX + key) || 'null');
    return v && typeof v.until === 'number' ? v : null;
  } catch {
    return null;
  }
};
const writeMark = (key, n, now) => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ until: now + futbolCacheValidMs(now), n }));
  } catch {
    /* depolama kapalı → her açılışta sunucu (eski davranış) */
  }
};

const map = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// key: sorguyu tanımlayan sabit metin · build: () => Firestore sorgusu
export function useFutbolSmartQuery(key, build) {
  const [live, setLive] = useState(() => isFutbolLiveWindow());
  const [state, setState] = useState({ key: null, docs: [] });

  useEffect(() => {
    const iv = setInterval(() => setLive(isFutbolLiveWindow()), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!key) {
      setState({ key: null, docs: [] });
      return undefined;
    }
    let alive = true;
    const q = build();
    if (live) {
      return onSnapshot(
        q,
        (snap) => {
          writeMark(key, snap.size, Date.now());
          if (alive) setState({ key, docs: map(snap) });
        },
        (err) => {
          console.error('futbol canlı', key, err?.message || err);
          if (alive) setState({ key, docs: [] });
        }
      );
    }
    (async () => {
      const now = Date.now();
      const mark = readMark(key);
      if (mark && mark.until > now) {
        try {
          const c = await getDocsFromCache(q);
          if (c.size >= mark.n) {
            if (alive) setState({ key, docs: map(c) });
            return;
          }
        } catch {
          /* önbellek yok → sunucu */
        }
      }
      try {
        const s = await getDocs(q);
        writeMark(key, s.size, Date.now());
        if (alive) setState({ key, docs: map(s) });
      } catch (err) {
        console.error('futbol okuma', key, err?.message || err);
        if (alive) setState({ key, docs: [] });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, live]);

  const ready = state.key === key;
  return { docs: ready ? state.docs : EMPTY, loading: Boolean(key) && !ready };
}
const EMPTY = Object.freeze([]);
