import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';

// =============================================================================
// "Mekanda/evde kaç kişi var" sayıları.
// v81 — sunucu biri mekâna girince/çıkınca sayıları HEMEN (en fazla ~8 sn'de bir)
// yeniden sayar; 2 dakikalık iş sadece nabzı kesilenleri düşürür.
// v79 — maliyet: sunucu 2 dakikada bir sayıları TEK belgeye yazar
// (stats/presence, bkz. functions/presenceSummary.js). Uygulamadaki bütün
// listeler bu tek belgeyi PAYLAŞIMLI dinler (sayfa başına 1 dinleyici, sadece
// sayılar değişince 1 okuma). Eskiden her liste 30 sn'de bir park/iç mekân/ev
// presence koleksiyonlarının tüm aktif kayıtlarını ayrı ayrı okuyordu.
// Özet belge yoksa ya da 15 dakikadır güncellenmediyse (sunucu işi henüz
// yüklenmemiş) eski yönteme (30 sn'de bir sorgu) geri döner.
// Dönen liste, eski kullanımla uyumlu "kişi başına bir kayıt" dizisidir:
//   parkPresence → [{ uid }], interiorPresence → [{ uid, locationId }],
//   housePresence → [{ uid, houseId }]
// =============================================================================
const POLL_MS = 30_000;
const ACTIVE_MS = 60_000;
const SUMMARY_FRESH_MS = 15 * 60_000;

// --- paylaşımlı özet aboneliği ------------------------------------------------------
const shared = { state: 'loading', data: null, subs: new Set(), unsub: null };
function emit() {
  shared.subs.forEach((f) => f({ state: shared.state, data: shared.data }));
}
function subscribeSummary(fn) {
  shared.subs.add(fn);
  fn({ state: shared.state, data: shared.data });
  if (!shared.unsub) {
    shared.unsub = onSnapshot(
      doc(db, 'stats', 'presence'),
      (s) => {
        const d = s.exists() ? s.data() : null;
        const fresh = d && Date.now() - Number(d.atMs || 0) < SUMMARY_FRESH_MS;
        shared.state = fresh ? 'ok' : 'missing';
        shared.data = fresh ? d : null;
        emit();
      },
      () => {
        shared.state = 'missing';
        shared.data = null;
        emit();
      }
    );
  }
  return () => {
    shared.subs.delete(fn);
    if (!shared.subs.size && shared.unsub) {
      shared.unsub();
      shared.unsub = null;
      shared.state = 'loading';
      shared.data = null;
    }
  };
}
function useSummary(enabled) {
  const [s, setS] = useState({ state: 'loading', data: null });
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeSummary(setS);
  }, [enabled]);
  return s;
}

function synth(collectionName, d, max) {
  const out = [];
  const push = (n, extra, prefix) => {
    for (let i = 0; i < n && out.length < max; i++) out.push({ uid: `${prefix}#${i}`, ...extra });
  };
  if (collectionName === 'parkPresence') push(Number(d.park || 0), {}, 'p');
  else if (collectionName === 'interiorPresence') Object.entries(d.int || {}).forEach(([locationId, n]) => push(Number(n || 0), { locationId }, locationId));
  else if (collectionName === 'housePresence') Object.entries(d.house || {}).forEach(([houseId, n]) => push(Number(n || 0), { houseId }, houseId));
  return out;
}

// --- eski yöntem (yedek) -----------------------------------------------------------
function useLegacyPoll(collectionName, enabled, max) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled) {
      setList([]);
      return undefined;
    }
    let alive = true;
    let busy = false;
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const since = Timestamp.fromMillis(Date.now() - ACTIVE_MS);
        const snap = await getDocs(query(collection(db, collectionName), where('updatedAt', '>', since), limit(max)));
        if (alive) setList(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      } catch (err) {
        console.warn(`usePolledPresence ${collectionName}:`, err?.code || err);
      } finally {
        busy = false;
      }
    };
    load();
    const iv = setInterval(load, POLL_MS);
    const onVis = () => !document.hidden && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [collectionName, enabled, max]);
  return list;
}

export function usePolledPresence(collectionName, { enabled = true, max = 300 } = {}) {
  const summary = useSummary(enabled);
  const legacy = useLegacyPoll(collectionName, enabled && summary.state === 'missing', max);
  const fromSummary = useMemo(() => (summary.state === 'ok' && summary.data ? synth(collectionName, summary.data, max) : null), [summary, collectionName, max]);
  if (!enabled) return EMPTY;
  return fromSummary || legacy;
}
const EMPTY = [];
