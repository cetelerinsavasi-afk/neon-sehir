// Çete / İstihbarat paneli için ortak veri kancaları (limitli dinleyiciler).
import { useMemo } from 'react';
import { limit, where } from 'firebase/firestore';
import { istDateKey, useDocData, useGang, useNow, useQueryData } from './GangContext';
import { atLeast } from './gangConstants';

export function useGangData(membership) {
  const { path, actorId } = useGang();
  const gangId = membership?.gangId || null;
  const now = useNow(30_000);
  const { data: gang } = useDocData(gangId ? path(`gangs/${gangId}`) : null);
  const { data: me } = useDocData(gangId ? path(`gangs/${gangId}/members/${actorId}`) : null);
  const rank = me?.rank || membership?.gangRank || null;
  // v38: anlık kasa sadece Tetikçi+; diğerleri çete belgesindeki 00:00 kasasını görür
  const kasaLive = atLeast(rank, 'tetikci');
  const { data: state } = useDocData(gangId && kasaLive ? path(`gangs/${gangId}/private/state`) : null);
  // v38: üye listesi 00:00 prestijiyle (public/roster); kendi satırın anlık
  const { data: rosterDoc } = useDocData(gangId ? path(`gangs/${gangId}/public/roster`) : null);
  const members = useMemo(() => {
    const list = Object.entries(rosterDoc?.members || {}).map(([id, v]) => ({ id, ...v, prestigeIsMidnight: true }));
    if (me && !list.some((m) => m.id === actorId)) list.push({ id: actorId, ...me, prestigeIsMidnight: false });
    return list.map((m) => (m.id === actorId && me ? { ...m, rank: me.rank || m.rank, prestige: Number(me.prestige || 0), prestigeIsMidnight: false } : m));
  }, [rosterDoc, me, actorId]);
  const canSeeVotes = atLeast(rank, 'tetikci');
  const wars = useWarLists({ gangId });
  const { docs: alliances } = useQueryData(gangId ? path('alliances') : null, () => [where('gangIds', 'array-contains', gangId), limit(30)], gangId);
  const { docs: votes } = useQueryData(gangId && canSeeVotes ? path(`gangs/${gangId}/votes`) : null, () => [where('status', '==', 'active'), limit(20)], `${gangId}_${canSeeVotes}`);
  const { docs: myPending } = useQueryData(gangId ? path(`gangs/${gangId}/pending`) : null, () => [where('initiatorId', '==', actorId), limit(10)], `${gangId}_${actorId}`);
  const { docs: dists } = useQueryData(gangId ? path('distributions') : null, () => [where('orgType', '==', 'gang'), where('orgId', '==', gangId), where('status', '==', 'open'), limit(30)], gangId);
  const today = istDateKey(now);
  return {
    gangId,
    gang: gang ? { id: gangId, ...gang } : null,
    me: me ? { id: actorId, ...me } : null,
    rank,
    state,
    stateToday: state?.midnightDateKey === today,
    kasaLive,
    // gösterilecek kasa: Tetikçi+ anlık, diğerleri 00:00
    kasaShown: kasaLive ? state?.kasa : gang?.kasaAtMidnight,
    members,
    wars,
    alliances: alliances.filter((a) => ['requested', 'accepted', 'active', 'ending'].includes(a.status)),
    votes,
    pending: myPending.filter((p) => p.status === 'pending'),
    dists,
    membership,
  };
}

export function useIntelData(membership) {
  const { path } = useGang();
  const rid = membership?.intelRosterId || null;
  const now = useNow(30_000);
  const { data: intel } = useDocData(path('intel/main'));
  const { data: state } = useDocData(path('intel/main/private/state'));
  const { data: me } = useDocData(rid ? path(`intelRoster/${rid}`) : null);
  // v38: kod adı listesi 00:00 prestijiyle; kendi satırın anlık
  const { data: rosterDoc } = useDocData(rid ? path('intel/main/public/roster') : null);
  const roster = useMemo(() => {
    const list = Object.entries(rosterDoc?.members || {}).map(([id, v]) => ({ id, ...v, prestigeIsMidnight: true }));
    if (me && !list.some((m) => m.id === rid)) list.push({ id: rid, ...me, prestigeIsMidnight: false });
    return list.map((m) => (m.id === rid && me ? { ...m, rank: me.rank || m.rank, codeName: me.codeName || m.codeName, prestige: Number(me.prestige || 0), prestigeIsMidnight: false } : m));
  }, [rosterDoc, me, rid]);
  const rank = me?.rank || membership?.intelRank || null;
  const canSeeVotes = ['baskan', 'sef', 'uzman', 'ajan'].includes(rank);
  const wars = useWarLists({ intel: Boolean(rid) });
  const { docs: votes } = useQueryData(rid && canSeeVotes ? path('intel/main/votes') : null, () => [where('status', '==', 'active'), limit(20)], `iv_${rid}_${canSeeVotes}`);
  const { docs: myPending } = useQueryData(rid ? path('intel/main/pending') : null, () => [where('initiatorRosterId', '==', rid), limit(10)], `ip_${rid}`);
  const { docs: dists } = useQueryData(rid ? path('distributions') : null, () => [where('orgType', '==', 'intel'), where('status', '==', 'open'), limit(30)], `idist_${rid}`);
  const today = istDateKey(now);
  return {
    rid,
    intel,
    state,
    stateToday: state?.midnightDateKey === today,
    kasaLive: true,
    kasaShown: state?.kasa,
    me: me ? { id: rid, ...me } : null,
    rank,
    roster,
    wars,
    votes,
    pending: myPending.filter((p) => p.status === 'pending'),
    dists,
    membership,
  };
}

// Savaş listeleri: herkese açık + çetemi ilgilendiren + (İstihbarat) operasyonlar
export function useWarLists({ gangId = null, intel = false }) {
  const { path } = useGang();
  const { docs: pub } = useQueryData(path('wars'), () => [where('visibility', '==', 'public'), where('status', '==', 'active'), limit(20)], 'public');
  const { docs: mine } = useQueryData(gangId ? path('wars') : null, () => [where('activeGangIds', 'array-contains', gangId), limit(60)], `mine_${gangId}`);
  const { docs: intelWars } = useQueryData(intel ? path('wars') : null, () => [where('intelInvolved', '==', true), where('status', '==', 'active'), limit(60)], `intel_${intel}`);
  return useMemo(() => {
    const map = new Map();
    for (const w of [...pub, ...mine, ...intelWars]) map.set(w.id, w);
    const all = [...map.values()];
    const active = all.filter((w) => w.status === 'active');
    return { all, active };
  }, [pub, mine, intelWars]);
}
