// =============================================================================
// v160.3 — ÇETELER PANELİ (5 sekme)
//   Çeteler · Sohbet · Savaş · Ticaret · Çete      (Polis Teşkilatı: … · Operasyon · Teşkilat)
//   • Ana sayfadaki Çeteler → Çeteler sekmesi. Kendi çetende "Aç" → Savaş; teşkilatta "Aç" →
//     panel kapanana kadar bütün sekmeler Polis Teşkilatını gösterir.
//   • Her çetenin yanında "Karargaha gir" (Polis Teşkilatında yok).
//   • Kendi karargahında Çete → Savaş sekmesi. Başka çetenin karargahında Çete → o çetenin
//     herkese açık bilgileri (Çete sekmesi); sadece Çeteler + Çete açık, diğerleri kilitli.
//   • Alttan açılan pencere; üstteki boşluğa dokununca kapanır.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GangProvider, useDocData, useGang } from './GangContext';
import { useLiveGangWorld, Maintenance } from './GangsScreen';
import { useGangAlertsCtx } from './alerts';
import { GangViews, IntelViews, useOfficialSeat } from './GangShell';
import { GangProfile } from './OrgPanelSheet';
import { HqNavContext } from './hqNav';
import ListTab from './tabs/ListTab';
import { WatchWarsButton } from './WatchWars';
import { Btn } from './ui';
import { useBelediyeChatUnread } from '../../hooks/useBelediyeChatUnread';
import './Gangs.css';

const TABS = {
  gang: [
    { id: 'ceteler', icon: '🏴', label: 'Çeteler' },
    { id: 'sohbet', icon: '💬', label: 'Sohbet' },
    { id: 'savas', icon: '⚔️', label: 'Savaş' },
    { id: 'ticaret', icon: '🚚', label: 'Ticaret' },
    { id: 'cetem', icon: '👥', label: 'Çete' },
  ],
  intel: [
    { id: 'ceteler', icon: '🏴', label: 'Çeteler' },
    { id: 'sohbet', icon: '💬', label: 'Sohbet' },
    { id: 'savas', icon: '⚔️', label: 'Savaş' },
    { id: 'operasyon', icon: '🎯', label: 'Operasyon' },
    { id: 'istihbarat', icon: '🚓', label: 'Teşkilat' },
  ],
};

function Body({ start, onEnterHq }) {
  const { path, actorId } = useGang();
  const { data: membership, loading } = useDocData(path(`memberships/${actorId}`));
  const ms = membership || {};
  const official = useOfficialSeat(ms);
  const inGang = Boolean(ms.gangId);
  const inIntel = Boolean(ms.intelRosterId) || Boolean(official);
  const [profile, setProfile] = useState(start.profile || null); // başka çetenin karargahında: o çete
  const [org, setOrg] = useState(start.org || null);
  const [tab, setTab] = useState(start.tab || 'ceteler');
  // üyelik gelince varsayılan teşkilat: çete > polis (bir kez)
  const effOrg = org || (inGang ? 'gang' : inIntel ? 'intel' : null);
  const alerts = useGangAlertsCtx();
  const cur = alerts ? (effOrg === 'intel' ? alerts.intel : alerts.gang) : {};
  const policeRanked = effOrg === 'intel' && ['baskan', 'sef', 'uzman'].includes(ms.intelRank);
  const bdUnread = useBelediyeChatUnread(actorId, 'koord', effOrg === 'intel' && (policeRanked || Boolean(official)), (m) => (official ? m.uid === actorId : m.authorKind === 'polis' && m.rosterId === ms.intelRosterId));
  useEffect(() => {
    // üyeliği olmayan bir teşkilat seçili kaldıysa (ör. çeteden atıldı) Çeteler'e dön
    if (loading || profile) return;
    if ((effOrg === 'gang' && !inGang) || (effOrg === 'intel' && !inIntel)) {
      setOrg(null);
      setTab('ceteler');
    }
  }, [loading, profile, effOrg, inGang, inIntel]);
  if (loading) return <div className="gx-loading">Yükleniyor…</div>;

  const member = profile ? false : effOrg === 'gang' ? inGang : effOrg === 'intel' ? inIntel : false;
  const tabs = profile ? TABS.gang.map((t) => (t.id === 'cetem' ? { ...t, id: 'profil' } : t)) : TABS[effOrg === 'intel' ? 'intel' : 'gang'];
  const enabled = (id) => id === 'ceteler' || (profile ? id === 'profil' : member);
  const open = (k) => {
    setProfile(null);
    setOrg(k);
    setTab('savas');
  };
  let content;
  if (tab === 'ceteler' || !enabled(tab)) {
    content = (
      <>
        <div className="gx-page gx-watch-row">
          <WatchWarsButton />
        </div>
        <ListTab membership={ms} official={official} onOpen={open} onEnterHq={onEnterHq} />
      </>
    );
  } else if (tab === 'profil') {
    content = <GangProfile gangId={profile.id} />;
  } else if (effOrg === 'intel') {
    content = <IntelViews membership={ms} official={official} tab={tab} />;
  } else {
    content = <GangViews membership={ms} official={official} tab={tab} />;
  }
  return (
    <>
      <div className="gx-hq-panel-body">{content}</div>
      <nav className="gx-hq-panel-nav gx-nav5" role="tablist">
        {tabs.map((t) => {
          const on = enabled(t.id);
          const sel = tab === t.id || (t.id === 'ceteler' && !enabled(tab));
          return (
            <button key={t.id} role="tab" aria-selected={sel} disabled={!on} className={`gx-subnav-btn${sel ? ' active' : ''}${on ? '' : ' locked'}`} onClick={() => on && setTab(t.id)}>
              <span className="gx-subnav-icon" aria-hidden="true">
                {on ? t.icon : '🔒'}
                {on && !sel && member && (Boolean(cur?.[t.id]) || (t.id === 'sohbet' && bdUnread)) && <span className="gx-subnav-dot" />}
              </span>
              <span className="gx-subnav-label">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// start: { tab, org: 'gang'|'intel'|null, profile: { id, name } | null }
// onEnterHq(gang): Çeteler'deki "Karargaha gir" (şehirde o çetenin karargahına)
export default function GangPanel({ start = {}, onClose, onEnterHq = null, hqNav = null }) {
  const { user, authLoading, config, hello, setHello, setRetry, liveWorldId, liveMode } = useLiveGangWorld();
  const closed = config?.autoOpened && !config.liveOpen;
  const title = start.profile ? `🏴 ${start.profile.name || 'Çete'}` : '🏴 Çeteler';
  const nav = useMemo(() => hqNav, [hqNav]);
  // v160.7 — panelin içinde bir pencere (savaş detayı, devam eden savaşlar, onay…) açıkken
  // üstteki boşluğa dokunmak o pencereyi kapatır (geri), paneli değil. iPhone'da pencerenin
  // karartması kaydırma kutusunun dışında dokunuş almıyordu: panel başlığının hizasına
  // (panelin hemen üstü) dokununca hiçbir şey olmuyordu, sadece en üst kapatıyordu.
  const closeTopSheet = (e) => {
    const root = e.currentTarget.closest('.gx-panel-back') || e.currentTarget;
    const list = root.querySelectorAll('.gx-sheet-backdrop');
    const top = list[list.length - 1];
    if (!top) return false;
    top.click();
    return true;
  };
  return createPortal(
    <div
      className="gx-panel-back"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (!closeTopSheet(e)) onClose?.();
      }}
    >
      <div
        className="gx-hq-panel gx-hq-sheet gx-panel5"
        role="dialog"
        aria-label="Çeteler"
        onClick={(e) => {
          e.stopPropagation();
          // pencere açıkken pencerenin dışına düşen dokunuş = karartmaya dokunuş
          // (portal ile body'ye açılan pencereler DOM'da panelin içinde değil → dokunulmaz)
          if (e.currentTarget.contains(e.target) && !e.target.closest?.('.gx-sheet-backdrop')) closeTopSheet(e);
        }}
      >
        <div className="gx-full-top">
          <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
          <span className="gx-full-title">{title}</span>
        </div>
        <div className="gx-root gx-hq-panel-root">
          {!user ? (
            <div className="gx-loading">{authLoading ? 'Yükleniyor…' : 'Giriş yapmalısın.'}</div>
          ) : liveWorldId ? (
            <GangProvider mode={liveMode}>
              <HqNavContext.Provider value={nav}>
                <Body start={start} onEnterHq={onEnterHq} />
              </HqNavContext.Provider>
            </GangProvider>
          ) : closed || hello?.liveOpen === false ? (
            <Maintenance />
          ) : hello?.error ? (
            <Maintenance icon="📡" title="Bağlanılamadı">
              <Btn
                small
                onClick={() => {
                  setHello(null);
                  setRetry((n) => n + 1);
                }}
              >
                Tekrar dene
              </Btn>
            </Maintenance>
          ) : (
            <div className="gx-loading">Yükleniyor…</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
