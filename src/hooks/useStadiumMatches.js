import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { istanbulDateKey, isFutbolLineupLockedIstanbul } from '../lib/istanbulTime';

// =============================================================================
// v149 — STADYUM VERİSİ (maliyet odaklı, dinleyici YOK)
//   • Reklam panoları: 1. Lig (Süper Lig) takımlarının sponsor fabrikaları.
//     Ligler + takımlar günde EN FAZLA BİR KEZ okunur (cihazda saklanır).
//   • Maçlar: sadece 18:00–19:00 arasında, oyuncu stadyumdayken, canlı lig + kupa
//     maçları tek seferlik okunur; maç belgesi bu bir saat boyunca değişmediği
//     için cihazda saklanır (maç henüz başlamadıysa birkaç dakikada bir tekrar bakılır).
//   • Maçın kendisi (oyuncular, top, goller) tamamen cihazda canlandırılır.
// =============================================================================
const INFO_KEY = 'ns_stad_info_v1';
const LIVE_KEY = 'ns_stad_live_v1';
const RETRY_MS = 3 * 60_000;
// geliştirme önizlemesinde maç saati taklit edilebilir (üretimde etkisiz)
const isMatchHour = () => (import.meta.env?.DEV && globalThis.__stadiumForceHour) || isFutbolLineupLockedIstanbul();

const ms = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === 'number' ? ts : ts ? Date.parse(ts) : null);
const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* depolama kapalı */
  }
};

// iki renk birbirine çok yakınsa deplasman ikinci rengini giyer
function hexDist(a, b) {
  const p = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = p(a);
  const y = p(b);
  if (!x || !y) return 999;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
function kitColors(homeLogo, awayLogo) {
  const home = homeLogo?.primary || '#ff3fa0';
  let away = awayLogo?.primary || '#19e8ff';
  if (hexDist(home, away) < 90) away = awayLogo?.secondary && hexDist(home, awayLogo.secondary) >= 90 ? awayLogo.secondary : home.toLowerCase() === '#ffffff' ? '#19e8ff' : '#ffffff';
  return { homeColor: home, awayColor: away };
}

let infoJob = null;
async function loadInfo() {
  const day = istanbulDateKey();
  const c = read(INFO_KEY);
  if (c && c.day === day && c.teams) return c;
  if (infoJob) return infoJob;
  infoJob = (async () => {
    const ls = await getDocs(collection(db, 'futbolLeagues'));
    const leagues = ls.docs.map((d) => ({ id: d.id, tier: Number(d.data().tier) || 9, name: d.data().name || '' }));
    const teams = {};
    let sponsors = [];
    await Promise.all(
      leagues.map(async (l) => {
        const ts = await getDocs(query(collection(db, 'futbolTeams'), where('leagueId', '==', l.id)));
        ts.docs.forEach((d) => {
          const t = d.data();
          teams[d.id] = { name: t.name || 'Takım', logo: t.logo ? { primary: t.logo.primary || null, secondary: t.logo.secondary || null } : null, tier: l.tier };
          if (l.tier === 1 && t.sponsorFactoryName) sponsors.push(String(t.sponsorFactoryName));
        });
      })
    );
    sponsors = [...new Set(sponsors)].slice(0, 8);
    const out = { day, teams, sponsors, tierOfLeague: Object.fromEntries(leagues.map((l) => [l.id, l.tier])) };
    write(INFO_KEY, out);
    return out;
  })().finally(() => {
    infoJob = null;
  });
  return infoJob;
}

let liveJob = null;
async function loadLive(info) {
  const day = istanbulDateKey();
  const c = read(LIVE_KEY);
  if (c && c.day === day && (c.list?.length || Date.now() - c.at < RETRY_MS)) return c.list || [];
  if (liveJob) return liveJob;
  liveJob = (async () => {
    const [lg, cup] = await Promise.all([
      getDocs(query(collection(db, 'futbolMatches'), where('status', '==', 'live'))),
      getDocs(query(collection(db, 'futbolCupMatches'), where('status', '==', 'live'))).catch(() => ({ docs: [] })),
    ]);
    const list = [];
    const add = (d, kind) => {
      const m = d.data();
      if (!Array.isArray(m.timeline)) return;
      const ht = info.teams[m.homeTeamId];
      const at = info.teams[m.awayTeamId];
      const homeName = m.homeTeamName || ht?.name || 'Ev Sahibi';
      const awayName = m.awayTeamName || at?.name || 'Deplasman';
      list.push({
        id: d.id,
        kind,
        tier: kind === 'kupa' ? 0 : info.tierOfLeague?.[m.leagueId] || ht?.tier || 9,
        status: 'live',
        homeName,
        awayName,
        ...kitColors(m.homeLogo || ht?.logo, m.awayLogo || at?.logo),
        timeline: m.timeline,
        possessionCheckpoints: m.possessionCheckpoints || [],
        matchStartAt: ms(m.matchStartAt),
        revealAt: ms(m.revealAt),
        playEndAt: ms(m.playEndAt),
      });
    };
    lg.docs.forEach((d) => add(d, 'lig'));
    cup.docs.forEach((d) => add(d, 'kupa'));
    // kupa önce, sonra Süper Lig, sonra alt lig
    list.sort((a, b) => a.tier - b.tier || a.homeName.localeCompare(b.homeName, 'tr'));
    write(LIVE_KEY, { day, at: Date.now(), list });
    return list;
  })().finally(() => {
    liveJob = null;
  });
  return liveJob;
}

// active: oyuncu (giriş yapmış) stadyumun içinde
export function useStadiumMatches(active) {
  const [sponsors, setSponsors] = useState(() => read(INFO_KEY)?.sponsors || []);
  const [matches, setMatches] = useState([]);
  const [matchHour, setMatchHour] = useState(() => isMatchHour());
  useEffect(() => {
    const iv = setInterval(() => setMatchHour(isMatchHour()), 20_000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    let retry = 0;
    const run = async () => {
      try {
        const info = await loadInfo();
        if (!alive) return;
        setSponsors(info.sponsors || []);
        if (!matchHour) {
          setMatches([]);
          return;
        }
        const list = await loadLive(info);
        if (!alive) return;
        setMatches(list);
        // maç dakikalar içinde başlayacaksa (18:00'ı yeni geçtiyse) biraz sonra tekrar bak
        if (!list.length) retry = setTimeout(run, RETRY_MS + 2000);
      } catch (e) {
        console.warn('Stadyum verisi okunamadı:', e?.message || e);
      }
    };
    run();
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [active, matchHour]);
  return { sponsors, matches: matchHour ? matches : [], matchHour };
}
