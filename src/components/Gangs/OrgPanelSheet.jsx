// =============================================================================
// v146 — Karargah / Polis Teşkilatı içinde sağ üstteki "Çete" / "Polis Teşkilatı"
// butonu bu paneli açar: eski alt sekmelerin aynısı (çete: sohbet · savaş ·
// ticaret · çetem — teşkilat: sohbet · savaş · operasyon · teşkilat), her açılışta
// SAVAŞ sekmesiyle. 3D mekânın üstünde tam ekran; kendi GangProvider'ını kurar
// (karargaha Ziyaret'ten girilse de çalışsın).
// =============================================================================
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { HqNavContext } from './hqNav';
import { useAuth } from '../../contexts/AuthContext';
import { GangProvider, useDocData, useGang } from './GangContext';
import { useGangAlertsCtx } from './alerts';
import { GangViews, IntelViews, useOfficialSeat } from './GangShell';
import { useBelediyeChatUnread } from '../../hooks/useBelediyeChatUnread';
import './Gangs.css';


const TABS = {
  gang: [
    { id: 'sohbet', icon: '💬', label: 'Sohbet' },
    { id: 'savas', icon: '⚔️', label: 'Savaş' },
    { id: 'ticaret', icon: '🚚', label: 'Ticaret' },
    { id: 'cetem', icon: '👥', label: 'Çetem' },
  ],
  intel: [
    { id: 'sohbet', icon: '💬', label: 'Sohbet' },
    { id: 'savas', icon: '⚔️', label: 'Savaş' },
    { id: 'operasyon', icon: '🎯', label: 'Operasyon' },
    { id: 'istihbarat', icon: '🚓', label: 'Teşkilat' },
  ],
};

function Inner({ org }) {
  const { path, actorId } = useGang();
  const { data: membership, loading } = useDocData(path(`memberships/${actorId}`));
  const ms = membership || {};
  const official = useOfficialSeat(ms);
  const [tab, setTab] = useState('savas');
  const alerts = useGangAlertsCtx();
  const cur = alerts ? (org === 'intel' ? alerts.intel : alerts.gang) : {};
  const policeRanked = org === 'intel' && ['baskan', 'sef', 'uzman'].includes(ms.intelRank);
  const bdUnread = useBelediyeChatUnread(actorId, 'koord', org === 'intel' && (policeRanked || Boolean(official)), (m) => (official ? m.uid === actorId : m.authorKind === 'polis' && m.rosterId === ms.intelRosterId));
  if (loading) return <div className="gx-loading">Yükleniyor…</div>;
  const member = org === 'intel' ? Boolean(ms.intelRosterId) || Boolean(official) : Boolean(ms.gangId);
  if (!member) return <div className="gx-loading">{org === 'intel' ? 'Polis Teşkilatında değilsin.' : 'Bir çetede değilsin.'}</div>;
  return (
    <>
      <div className="gx-hq-panel-body">{org === 'intel' ? <IntelViews membership={ms} official={official} tab={tab} /> : <GangViews membership={ms} official={official} tab={tab} />}</div>
      <nav className="gx-hq-panel-nav" role="tablist">
        {TABS[org].map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`gx-subnav-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="gx-subnav-icon" aria-hidden="true">
              {t.icon}
              {tab !== t.id && (Boolean(cur?.[t.id]) || (t.id === 'sohbet' && bdUnread)) && <span className="gx-subnav-dot" />}
            </span>
            <span className="gx-subnav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

export default function OrgPanelSheet({ org = 'gang', onClose, onEnterHq }) {
  const { user } = useAuth();
  const { data: config } = useDocData(user ? 'gangSystem/config' : null);
  const worldId = config?.liveOpen ? config.liveWorldId : null;
  const mode = useMemo(() => ({ world: 'live', worldId, actorId: user?.uid }), [worldId, user?.uid]);
  const nav = useMemo(() => (onEnterHq ? { enterHq: onEnterHq } : null), [onEnterHq]);
  // v146.1: body'ye taşınır — mekânın alt araç çubukları / dönüşümlü kapsayıcılar
  // paneli ya da sohbet kutusunu, bağış penceresini örtmesin.
  return createPortal(
    <div className="gx-hq-panel" role="dialog" aria-label={org === 'intel' ? 'Polis Teşkilatı' : 'Çete'} onPointerDown={(e) => e.stopPropagation()}>
      <div className="gx-full-top">
        <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
        <span className="gx-full-title">{org === 'intel' ? '🚓 Polis Teşkilatı' : '🏴 Çete'}</span>
      </div>
      <div className="gx-root gx-hq-panel-root">
        {worldId ? (
          <GangProvider mode={mode}>
            <HqNavContext.Provider value={nav}>
              <Inner org={org} />
            </HqNavContext.Provider>
          </GangProvider>
        ) : (
          <div className="gx-loading">Yükleniyor…</div>
        )}
      </div>
    </div>,
    document.body
  );
}
