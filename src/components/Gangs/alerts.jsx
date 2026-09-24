/* eslint-disable react-refresh/only-export-components */
// Çete bildirim işaretleri (v33): alt çubuktaki "Çeteler" butonu ve çete
// içindeki sekmeler için "burada yapılacak bir şey var" noktaları.
//  - Sohbet: son açılıştan sonra başkasından gelen yeni mesaj
//  - Savaş: şu an katılabileceğin savaş + bu 6 saatlik pencerede hakkın var;
//           gelen bahis/ittifak teklifi (Baba/Sağ Kol); oy vermediğin oylama;
//           alabileceğin dağıtım
//  - Operasyon (İstihbarat): operasyon bekleyen ihbar (Başkan/Şef) ya da
//           ihbar edebileceğin çete tırı/bahsi
// Tamamen okuma: sunucuya yazmaz. Dinleyiciler limitlidir (çoğu limit 1).
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { istDateKey, istHour, nextMidnight, windowSlot } from './GangContext';

export const GangAlertsContext = createContext(null);
export const useGangAlertsCtx = () => useContext(GangAlertsContext);

// ---- "görüldü" kaydı (sohbet) — cihaz başına ----
const SEEN_EVENT = 'gx-chat-seen';
const seenKey = (uid, w, chan) => `gx-seen:${uid}:${w}:${chan}`;
function readSeen(uid, w, chan) {
  try {
    return Number(localStorage.getItem(seenKey(uid, w, chan)) || 0);
  } catch {
    return 0;
  }
}
export function markGangChatSeen(uid, worldId, chan, atMs) {
  if (!uid || !worldId || !chan) return;
  try {
    if (readSeen(uid, worldId, chan) >= atMs) return;
    localStorage.setItem(seenKey(uid, worldId, chan), String(atMs));
  } catch {
    /* depolama yoksa işaret bir sonraki mesaja kadar kalır */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function useNowTick(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Tek belge / sorgu dinleyicisi (anahtar değişince yeniden bağlanır)
function useDoc(path) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!path) {
      setData(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, path),
      (s) => setData(s.exists() ? s.data() : null),
      () => setData(null)
    );
  }, [path]);
  return data;
}
function useDocs(key, build) {
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    if (!key) {
      setDocs([]);
      return undefined;
    }
    const q = build();
    return onSnapshot(
      q,
      (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setDocs([])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return docs;
}

const EQ = { baskan: 'baba', sef: 'sagkol', uzman: 'kidemli', ajan: 'tetikci', muhbir: 'comez' };
const RANK_ORDER = ['comez', 'tetikci', 'kidemli', 'sagkol', 'baba'];
const atLeast = (r, min) => RANK_ORDER.indexOf(r) >= RANK_ORDER.indexOf(min);

export function claimable(dists, { rank, isIntel, myKey, joinedAtMs, now }) {
  const eq = (r) => (isIntel ? EQ[r] : r);
  const inGroup = (g) => g === 'hepsi' || (g === 'rutbeli' && ['baba', 'sagkol', 'kidemli'].includes(eq(rank))) || (g === 'tetikci' && eq(rank) === 'tetikci') || (g === 'comez' && eq(rank) === 'comez');
  return dists.filter(
    (d) => d.status === 'open' && now < d.expiresAtMs && !d.claims?.[myKey] && inGroup(d.group) && (d.claimedCount || 0) < d.slots && Number(joinedAtMs || 0) <= d.createdAtMs && !(isIntel && (rank === 'baskan' || d.creatorKey === myKey))
  );
}

// Oy verilmemiş oylamalar (ballot belgesi tek seferlik okunur)
function useUnvoted(votes, ballotPathOf, voterKey) {
  const [unvoted, setUnvoted] = useState(0);
  const ids = votes
    .filter((v) => (v.voterIds || []).includes(voterKey))
    .map((v) => v.id)
    .sort()
    .join(',');
  useEffect(() => {
    let alive = true;
    if (!ids) {
      setUnvoted(0);
      return undefined;
    }
    Promise.all(ids.split(',').map((id) => getDoc(doc(db, ballotPathOf(id))).then((s) => (s.exists() ? 0 : 1)).catch(() => 0))).then((r) => {
      if (alive) setUnvoted(r.reduce((a, b) => a + b, 0));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return unvoted;
}

export function useGangAlerts(uid) {
  const now = useNowTick();
  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => {
    const on = () => setSeenTick((n) => n + 1);
    window.addEventListener(SEEN_EVENT, on);
    return () => window.removeEventListener(SEEN_EVENT, on);
  }, []);

  const cfg = useDoc(uid ? 'gangSystem/config' : null);
  const w = cfg?.liveOpen ? cfg.liveWorldId : null;
  const base = w ? `gangWorlds/${w}` : null;
  const ms = useDoc(base && uid ? `${base}/memberships/${uid}` : null) || {};
  const gangId = ms.gangId || null;
  const rank = ms.gangRank || null;
  const rid = ms.intelRosterId || null;
  const irank = ms.intelRank || null;
  const gJoined = Number(ms.gangJoinedAtMs || 0);
  const iJoined = Number(ms.intelJoinedAtMs || 0);
  const today = istDateKey(now);
  const slotId = `${uid}_${today}_${windowSlot(now)}`;

  // --- sohbet: her kanalın son mesajı ---
  const last = (coll, since) => () => query(collection(db, coll), where('createdAtMs', '>=', since), orderBy('createdAtMs', 'desc'), limit(1));
  const gGen = useDocs(base && gangId ? `gg_${base}_${gangId}_${gJoined}` : null, last(`${base}/gangs/${gangId}/chat_genel`, gJoined))[0];
  const gYon = useDocs(base && gangId && atLeast(rank, 'kidemli') ? `gy_${base}_${gangId}_${gJoined}` : null, last(`${base}/gangs/${gangId}/chat_yonetim`, gJoined))[0];
  const iGen = useDocs(base && rid ? `ig_${base}_${rid}_${iJoined}` : null, last(`${base}/intelChat_genel`, iJoined))[0];
  const iYon = useDocs(base && rid && ['baskan', 'sef', 'uzman'].includes(irank) ? `iy_${base}_${rid}_${iJoined}` : null, last(`${base}/intelChat_yonetim`, iJoined))[0];

  // --- savaşlar ---
  const pub = useDocs(base ? `pub_${base}` : null, () => query(collection(db, `${base}/wars`), where('visibility', '==', 'public'), where('status', '==', 'active'), limit(20)));
  const mine = useDocs(base && gangId ? `mine_${base}_${gangId}` : null, () => query(collection(db, `${base}/wars`), where('activeGangIds', 'array-contains', gangId), limit(60)));
  const intelWars = useDocs(base && rid ? `iw_${base}` : null, () => query(collection(db, `${base}/wars`), where('intelInvolved', '==', true), where('status', '==', 'active'), limit(60)));
  const slot = useDoc(base && uid ? `${base}/slots/${slotId}` : null);

  // --- oylamalar, dağıtımlar, ittifak teklifleri ---
  const gVotes = useDocs(base && gangId && atLeast(rank, 'tetikci') ? `gv_${base}_${gangId}` : null, () => query(collection(db, `${base}/gangs/${gangId}/votes`), where('status', '==', 'active'), limit(20)));
  const iVotes = useDocs(base && rid && ['baskan', 'sef', 'uzman', 'ajan'].includes(irank) ? `iv_${base}_${rid}` : null, () => query(collection(db, `${base}/intel/main/votes`), where('status', '==', 'active'), limit(20)));
  const gDists = useDocs(base && gangId ? `gd_${base}_${gangId}` : null, () => query(collection(db, `${base}/distributions`), where('orgType', '==', 'gang'), where('orgId', '==', gangId), where('status', '==', 'open'), limit(30)));
  const iDists = useDocs(base && rid ? `id_${base}_${rid}` : null, () => query(collection(db, `${base}/distributions`), where('orgType', '==', 'intel'), where('status', '==', 'open'), limit(30)));
  const allianceIn = useDocs(base && gangId && ['baba', 'sagkol'].includes(rank) ? `al_${base}_${gangId}` : null, () => query(collection(db, `${base}/alliances`), where('gangIds', 'array-contains', gangId), limit(30)));
  const gUnvoted = useUnvoted(gVotes, (v) => `${base}/gangs/${gangId}/votes/${v}/ballots/${uid}`, uid);
  const iUnvoted = useUnvoted(iVotes, (v) => `${base}/intel/main/votes/${v}/ballots/${rid}`, rid);

  // --- operasyon (İstihbarat) ---
  const isLead = ['baskan', 'sef'].includes(irank);
  const tomorrow = istDateKey(nextMidnight(now) + 3600_000);
  const truckReps = useDocs(base && rid ? `tr_${base}_${today}` : null, () => query(collection(db, `${base}/intelReports`), where('departDateKey', '==', today), limit(100)));
  const betReps = useDocs(base && rid ? `br_${base}_${tomorrow}` : null, () => query(collection(db, `${base}/betReports`), where('dateKey', '==', tomorrow), limit(50)));
  const canReport = Boolean(rid && gangId && atLeast(rank, 'tetikci'));
  const myTrucks = useDocs(base && canReport ? `mt_${base}_${gangId}` : null, () => query(collection(db, `${base}/trucks`), where('gangId', '==', gangId), limit(50)));

  return useMemo(() => {
    const newer = (m, chan, meKey) => Boolean(m && !m.system && m.createdAtMs > readSeen(uid, w, chan) && m[meKey.field] !== meKey.value);
    const chans = {
      gang: { genel: Boolean(gangId) && newer(gGen, `g:${gangId}:genel`, { field: 'authorId', value: uid }), yonetim: Boolean(gangId) && newer(gYon, `g:${gangId}:yonetim`, { field: 'authorId', value: uid }) },
      intel: { genel: Boolean(rid) && newer(iGen, 'i:genel', { field: 'rosterId', value: rid }), yonetim: Boolean(rid) && newer(iYon, 'i:yonetim', { field: 'rosterId', value: rid }) },
    };
    const gangChat = chans.gang.genel || chans.gang.yonetim;
    const intelChat = chans.intel.genel || chans.intel.yonetim;

    const all = new Map();
    for (const x of [...pub, ...mine, ...intelWars]) all.set(x.id, x);
    const live = [...all.values()].filter((x) => x.status === 'active' && now >= (x.startsAtMs || 0) && now < (x.endsAtMs || 0));
    const gangCan = (x) =>
      (x.type === 'trade' && gangId) ||
      (x.type === 'bet' && (x.gangIds || []).includes(gangId)) ||
      (x.type === 'sabotage' && x.attackerGangId === gangId) ||
      (x.type === 'defense' && x.announced && (x.gangIds || []).includes(gangId));
    const intelCan = (x) => (x.type === 'trade' || x.type === 'intelop' || (x.type === 'bet' && x.sides?.intel)) && rid;
    const slotFree = !slot;
    const gangWar = slotFree && Boolean(gangId) && live.some(gangCan);
    const intelWar = slotFree && Boolean(rid) && live.some(intelCan);

    const offersIn =
      ['baba', 'sagkol'].includes(rank) &&
      ([...all.values()].some((x) => x.type === 'bet' && x.status === 'offered' && x.targetGangId === gangId) || allianceIn.some((a) => a.status === 'requested' && a.requestedBy !== gangId));
    const gClaim = claimable(gDists, { rank, isIntel: false, myKey: uid, joinedAtMs: gJoined, now }).length > 0;
    const iClaim = claimable(iDists, { rank: irank, isIntel: true, myKey: rid, joinedAtMs: iJoined, now }).length > 0;

    const reportedTrucks = new Set(truckReps.map((r) => r.truckId));
    const reportedBets = new Set(betReps.map((r) => r.id));
    const myRoad = myTrucks.filter((t) => t.status === 'in_transit' && t.departDateKey === today && !reportedTrucks.has(t.id));
    const myBets = [...all.values()].filter((x) => x.type === 'bet' && x.status === 'accepted' && x.dateKey === tomorrow && (x.gangIds || []).includes(gangId) && !reportedBets.has(x.id));
    const ops =
      Boolean(rid) &&
      ((isLead && ((istHour(now) < 12 && truckReps.some((r) => !r.opWarId)) || betReps.some((r) => !r.opStarted))) || (canReport && (myRoad.length > 0 || myBets.length > 0)));

    const gang = { sohbet: gangChat, savas: gangWar || offersIn || gUnvoted > 0 || gClaim };
    const intel = { sohbet: intelChat, savas: intelWar || iUnvoted > 0 || iClaim, operasyon: ops };
    return { worldId: w, uid, gang, intel, chans, any: Object.values(gang).some(Boolean) || Object.values(intel).some(Boolean) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, seenTick, w, uid, gangId, rid, rank, irank, gGen, gYon, iGen, iYon, pub, mine, intelWars, slot, gVotes, iVotes, gDists, iDists, allianceIn, gUnvoted, iUnvoted, truckReps, betReps, myTrucks, today, tomorrow, gJoined, iJoined, canReport, isLead]);
}
