// v136 — SEÇİM durumu (istemci). politics/state için TEK paylaşımlı dinleyici
// (anasayfa butonu + belediye + seçim ekranı aynı aboneliği kullanır; belge
// haftada birkaç kez değişir). Aday listesi ve sayım sadece ekran açıkken dinlenir.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { phaseAt } from '../../functions/politicsRules.js';

let snapState; // undefined = henüz gelmedi · null = belge yok
let unsub = null;
let refs = 0;
let stopTimer = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

function subscribe(cb) {
  subs.add(cb);
  refs += 1;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (!unsub) {
    unsub = onSnapshot(
      doc(db, 'politics', 'state'),
      (s) => {
        snapState = s.exists() ? s.data() : null;
        emit();
      },
      (err) => console.warn('politics/state', err?.code || err)
    );
  }
  return () => {
    subs.delete(cb);
    refs -= 1;
    if (refs <= 0 && !stopTimer) {
      stopTimer = setTimeout(() => {
        stopTimer = null;
        if (refs <= 0 && unsub) {
          unsub();
          unsub = null;
          snapState = undefined;
        }
      }, 60_000);
    }
  };
}
const noop = () => () => {};
const getSnap = () => snapState;
const getNone = () => undefined;

// Dakikalık saat (evre sınırları için)
export function useMinuteNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * { state, phase, cycle, live } — phase: kayıtlı evre saatle uyuşuyorsa o evre,
 * uyuşmuyorsa (00:00 ile gece işi arası) 'wait'. live: işlem yapılabilir evrede mi.
 */
export function usePoliticsState() {
  const { user } = useAuth();
  const state = useSyncExternalStore(user ? subscribe : noop, user ? getSnap : getNone, getNone);
  const now = useMinuteNow();
  if (!state) return { state, phase: 'idle', cycle: null, now };
  const at = phaseAt(state.cycle, now);
  let phase = state.phase || 'idle';
  if (state.cycle && at !== phase) phase = phase === 'election' && at === 'counting' ? 'counting' : 'wait';
  if (!state.cycle && phase !== 'idle') phase = 'idle';
  return { state, phase, cycle: state.cycle || null, now };
}

// Tek belge dinleyicisi (ekran açıkken)
export function useLiveDoc(path) {
  const [v, setV] = useState({ data: undefined, path: null });
  useEffect(() => {
    if (!path) return undefined;
    return onSnapshot(
      doc(db, path),
      (s) => setV({ data: s.exists() ? s.data() : null, path }),
      (err) => {
        console.warn('politics doc', path, err?.code || err);
        setV({ data: null, path });
      }
    );
  }, [path]);
  return v.path === path ? v.data : undefined;
}

/** Oyuncunun bu döngüdeki durumu (users.pol) */
export function polOfPlayer(player, cycle) {
  const p = player?.pol;
  return p && p.c === cycle ? { cand: Boolean(p.cand), sign: p.sign || null, voted: Boolean(p.voted), vote: p.vote || null } : { cand: false, sign: null, voted: false, vote: null };
}

/** Anasayfa butonu: 'coupVote' | 'coup' | 'signup' | 'vote' | 'count' | null */
export function politicsNeed({ phase, cycle, player, state = null, now = Date.now() }) {
  // v136 darbe: rütbeli polisin gizli oylaması (sunucu oy hakkı olanların belgesine yazar)
  const pv = player?.coupPlanVote;
  if (pv && !pv.choice && Number(pv.endMs || 0) > now) return 'coupVote';
  const cp = state?.coup;
  if (cp?.status === 'active' && now >= cp.startMs && now < cp.endMs && player?.onboardingRewardClaimed && player?.coupSide?.id !== cp.id) return 'coup';
  if (phase === 'counting') return 'count';
  if (!player?.onboardingRewardClaimed) return null;
  const p = polOfPlayer(player, cycle);
  if (phase === 'signup' && !p.cand && !p.sign) return 'signup';
  if (phase === 'election' && !p.voted) return 'vote';
  return null;
}
