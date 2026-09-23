// Çete ana paneli: üstte kimlik (logo, ad, kasa, rütbem, prestijim), altta
// sadece ANLAMLI kategoriler (boş kategoriler gizlenir, aktifler sayaçlı).
import { useMemo, useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { useDocData, useGang, useQueryData } from './GangContext';
import { Gold, Logo, RankBadge, Tabs } from './ui';
import { atLeast, fmt } from './gangConstants';
import GangOverview from './tabs/GangOverview';
import MembersTab from './tabs/MembersTab';
import ChatTab from './tabs/ChatTab';
import WarsTab, { useWarLists } from './tabs/WarsTab';
import TradeTab from './tabs/TradeTab';
import DiplomacyTab from './tabs/DiplomacyTab';
import VotesTab from './tabs/VotesTab';
import TreasuryTab from './tabs/TreasuryTab';

export default function GangPanel({ membership }) {
  const { path, actorId } = useGang();
  const gangId = membership.gangId;
  const { data: gang } = useDocData(path(`gangs/${gangId}`));
  const { data: me } = useDocData(path(`gangs/${gangId}/members/${actorId}`));
  const { data: state } = useDocData(path(`gangs/${gangId}/private/state`));
  const rank = me?.rank || membership.gangRank;
  const ranked = atLeast(rank, 'kidemli');
  const canSeeVotes = atLeast(rank, 'tetikci');

  const wars = useWarLists({ gangId });
  const { docs: alliances } = useQueryData(path('alliances'), () => [where('gangIds', 'array-contains', gangId), limit(30)], gangId);
  const { docs: votes } = useQueryData(canSeeVotes ? path(`gangs/${gangId}/votes`) : null, () => [where('status', '==', 'active'), limit(20)], `${gangId}_${canSeeVotes}`);
  const { docs: myPending } = useQueryData(path(`gangs/${gangId}/pending`), () => [where('initiatorId', '==', actorId), limit(10)], `${gangId}_${actorId}`);
  const { docs: dists } = useQueryData(path('distributions'), () => [where('orgType', '==', 'gang'), where('orgId', '==', gangId), where('status', '==', 'open'), limit(30)], gangId);

  const liveAlliances = alliances.filter((a) => ['requested', 'accepted', 'active', 'ending'].includes(a.status));
  const incomingAlliances = liveAlliances.filter((a) => a.status === 'requested' && a.requestedBy !== gangId);
  const betOffers = wars.mine.filter((w) => w.type === 'bet' && ['offered', 'accepted'].includes(w.status));
  const incomingBets = betOffers.filter((w) => w.status === 'offered' && w.targetGangId === gangId);
  const pendingVotes = myPending.filter((p) => p.status === 'pending');
  const myClaims = dists.filter((d) => d.recipients?.[actorId] && !d.recipients[actorId].claimed && d.recipients[actorId].stint === membership.gangStint);

  const [tab, setTab] = useState('genel');
  const tabs = useMemo(() => {
    const t = [
      { id: 'genel', icon: '🏠', label: 'Çete' },
      { id: 'uyeler', icon: '👥', label: 'Üyeler', count: 0 },
      { id: 'sohbet', icon: '💬', label: 'Sohbet' },
      { id: 'savas', icon: '⚔️', label: 'Savaş', count: wars.actionable.length, alert: wars.alert },
      { id: 'ticaret', icon: '🚚', label: 'Ticaret' },
    ];
    if (rank === 'baba' || liveAlliances.length || betOffers.length) t.push({ id: 'diplomasi', icon: '🤝', label: 'Diplomasi', count: incomingAlliances.length + incomingBets.length });
    if ((canSeeVotes && votes.length) || pendingVotes.length) t.push({ id: 'oylama', icon: '🗳️', label: 'Oylamalar', count: votes.length });
    t.push({ id: 'kasa', icon: '💰', label: 'Kasa', count: myClaims.length });
    return t;
  }, [wars.actionable.length, wars.alert, rank, liveAlliances.length, betOffers.length, incomingAlliances.length, incomingBets.length, canSeeVotes, votes.length, pendingVotes.length, myClaims.length]);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'genel';

  if (!gang) return <div className="gx-loading">Yükleniyor…</div>;
  if (gang.status !== 'active') return <div className="gx-loading">Bu çete dağıldı.</div>;

  const ctx = { gang: { id: gangId, ...gang }, me: me ? { id: actorId, ...me } : null, rank, state, membership, wars, alliances: liveAlliances, betOffers, votes, pendingVotes, dists, myClaims, ranked };

  return (
    <div className="gx-page">
      <div className="gx-header" style={{ '--gx-accent': gang.logo?.color || '#19e8ff' }}>
        <Logo logo={gang.logo} size={58} />
        <div className="gx-header-main">
          <div className="gx-header-name">{gang.name}</div>
          <div className="gx-header-row">
            <RankBadge rank={rank} />
            <span className="gx-prestige" title="Çete prestijin">
              ✦ {fmt(me?.prestige)}
            </span>
          </div>
        </div>
        <div className="gx-header-kasa" title="Çete Kasası">
          <span className="dim">Kasa</span>
          <Gold value={state?.kasa} />
        </div>
      </div>
      {membership.intelDecisionGangId === gangId && membership.intelRosterId && <IntelDecisionHint onOpen={() => setTab('genel')} />}
      <Tabs tabs={tabs} value={activeTab} onChange={setTab} />
      <div className="gx-tab-body">
        {activeTab === 'genel' && <GangOverview {...ctx} />}
        {activeTab === 'uyeler' && <MembersTab {...ctx} />}
        {activeTab === 'sohbet' && <ChatTab org="gang" gangId={gangId} ranked={ranked} joinedAtMs={membership.gangJoinedAtMs} />}
        {activeTab === 'savas' && <WarsTab org="gang" {...ctx} />}
        {activeTab === 'ticaret' && <TradeTab {...ctx} />}
        {activeTab === 'diplomasi' && <DiplomacyTab {...ctx} />}
        {activeTab === 'oylama' && <VotesTab {...ctx} />}
        {activeTab === 'kasa' && <TreasuryTab org="gang" {...ctx} />}
      </div>
    </div>
  );
}

function IntelDecisionHint({ onOpen }) {
  return (
    <button className="gx-intel-hint" onClick={onOpen}>
      🕵️ Gizli karar bekliyor — 00:00'a kadar
    </button>
  );
}

