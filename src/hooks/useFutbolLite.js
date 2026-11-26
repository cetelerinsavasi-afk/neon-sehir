// =============================================================================
// v205 — FUTBOL, STADYUMA GİDENE KADAR HAFİF
//
// Ana sayfadaki 📋 hatırlatmaları futbolla ilgili iki şeye bakıyordu ve bunun için oyun
// açılır açılmaz 3 canlı dinleyici kuruluyordu (futbolTeams sahip + menajer sorguları,
// footballers/{uid}). Oyuncuların çoğunun takımı yok; bu dinleyiciler her oturumda boşuna
// okuma yapıyor ve açılışta iş yükü oluşturuyordu.
//
// Artık:
//   • "Takımım var mı / futbolcu olarak bir takımda mıyım?" bilgisi GÜNDE BİR KEZ okunur ve
//     cihazda saklanır (localStorage). Takımı olmayan oyuncu için hiç dinleyici yok.
//   • Takımın sahibi / menajeri ise sadece O TAKIMIN belgesi dinlenir (1 belge; eskiden 2 sorgu).
//   • Futbol ekranı açılınca (stadyum / telefon) bilgi tazelenir → takım alınca, menajer olunca,
//     takıma girince hatırlatmalar hemen doğru olur.
// =============================================================================
import { useEffect, useState, useSyncExternalStore } from 'react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const KEY = 'ns_fblite1:';
const DAY_MS = 24 * 3600_000;

let rev = 0;
const subs = new Set();
const bump = () => {
  rev += 1;
  subs.forEach((f) => f());
};
const useRev = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => rev,
    () => rev
  );

const read = (uid) => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + uid) || 'null');
    return v && Date.now() - v.at < DAY_MS ? v : null;
  } catch {
    return null;
  }
};
const write = (uid, v) => {
  try {
    localStorage.setItem(KEY + uid, JSON.stringify({ ...v, at: Date.now() }));
  } catch {
    /* depolama kapalı → oturum başına bir okuma */
  }
};
const mem = new Map(); // uid → bilgi (depolama kapalıysa da oturumda tekrar okunmasın)
const jobs = new Map();

async function load(uid) {
  const [owned, managed, fb] = await Promise.all([
    getDocs(query(collection(db, 'futbolTeams'), where('ownerUid', '==', uid), limit(1))),
    getDocs(query(collection(db, 'futbolTeams'), where('managerUid', '==', uid), limit(1))),
    getDoc(doc(db, 'footballers', uid)),
  ]);
  const v = {
    teamId: (managed.docs[0] || owned.docs[0])?.id || null,
    role: managed.docs[0] ? 'manager' : owned.docs[0] ? 'owner' : null,
    fbTeamId: fb.exists() ? fb.data()?.teamId || null : null,
  };
  write(uid, v);
  mem.set(uid, { ...v, at: Date.now() });
  return v;
}

// Futbol ekranı açılınca çağrılır: bir sonraki kullanımda bilgi sunucudan tazelenir.
export function refreshFutbolLite() {
  mem.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(KEY))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* yoksay */
  }
  bump();
}

// { teamId, role ('owner' | 'manager' | null), fbTeamId (futbolcu olarak takımı), loading }
function useFutbolInfo(enabled = true) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const r = useRev();
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!uid || !enabled) {
      setInfo(null);
      return undefined;
    }
    const cached = mem.get(uid) || read(uid);
    if (cached && Date.now() - cached.at < DAY_MS) {
      mem.set(uid, cached);
      setInfo(cached);
      return undefined;
    }
    let alive = true;
    let job = jobs.get(uid);
    if (!job) {
      job = load(uid).finally(() => jobs.delete(uid));
      jobs.set(uid, job);
    }
    job.then((v) => alive && setInfo(v)).catch(() => alive && setInfo({ teamId: null, role: null, fbTeamId: null }));
    return () => {
      alive = false;
    };
  }, [uid, enabled, r]);
  return { ...(info || { teamId: null, role: null, fbTeamId: null }), loading: Boolean(uid) && enabled && !info };
}

// Ana sayfa "⚽ Kadronu düzenle" hatırlatması için: sahibi / menajeri olduğum takım (canlı, 1 belge)
export function useMyFutbolTeamLite() {
  const { teamId, role } = useFutbolInfo();
  const [team, setTeam] = useState(null);
  useEffect(() => {
    if (!teamId) {
      setTeam(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'futbolTeams', teamId),
      (s) => setTeam(s.exists() ? { id: s.id, ...s.data() } : null),
      () => setTeam(null)
    );
  }, [teamId]);
  return { team, role: team ? role : null };
}

// Spor salonu hatırlatması için: futbolcu olarak bir takımda mıyım?
export function useMyFootballerTeamLite() {
  const { fbTeamId, loading } = useFutbolInfo();
  return { fbTeamId, loading };
}
