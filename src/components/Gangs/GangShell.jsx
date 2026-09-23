// Çeteler ekranının iskeleti: altta 5 iç sekme.
//   Çete:        Çeteler · Sohbet · Savaş · Ticaret · Çetem
//   İstihbarat:  Çeteler · Sohbet · Savaş · Operasyon · İstihbarat
// Çetesi/İstihbaratı olmayan sadece "Çeteler" listesini görür (diğerleri
// kilitli). Üye açınca Savaş sekmesine düşer; hem çetede hem İstihbarattaysa
// önce İstihbarat gösterilir. Çete ↔ İstihbarat geçişi "Çeteler" sekmesinden.
import { useEffect, useRef, useState } from 'react';
import { useGangData, useIntelData } from './data';
import { Gold, Logo, RankBadge } from './ui';
import { INTEL_LOGO, fmt } from './gangConstants';
import ListTab from './tabs/ListTab';
import ChatTab from './tabs/ChatTab';
import WarsTab from './tabs/WarsTab';
import TradeTab from './tabs/TradeTab';
import CetemTab from './tabs/CetemTab';
import OpsTab from './tabs/OpsTab';
import IntelTab from './tabs/IntelTab';

const GANG_TABS = [
  { id: 'ceteler', icon: '🏴', label: 'Çeteler' },
  { id: 'sohbet', icon: '💬', label: 'Sohbet' },
  { id: 'savas', icon: '⚔️', label: 'Savaş' },
  { id: 'ticaret', icon: '🚚', label: 'Ticaret' },
  { id: 'cetem', icon: '👥', label: 'Çetem' },
];
const INTEL_TABS = [
  { id: 'ceteler', icon: '🏴', label: 'Çeteler' },
  { id: 'sohbet', icon: '💬', label: 'Sohbet' },
  { id: 'savas', icon: '⚔️', label: 'Savaş' },
  { id: 'operasyon', icon: '🎯', label: 'Operasyon' },
  { id: 'istihbarat', icon: '🕵️', label: 'İstihbarat' },
];

export default function GangShell({ membership }) {
  const ms = membership || {};
  const inGang = Boolean(ms.gangId);
  const inIntel = Boolean(ms.intelRosterId);
  const [org, setOrg] = useState(inIntel ? 'intel' : 'gang');
  const [tab, setTab] = useState(inIntel || inGang ? 'savas' : 'ceteler');

  // Oyuncu henüz kendisi bir sekme seçmediyse üyelik bilgisi gelince varsayılana
  // geç (İstihbarat önce, sonra Savaş). Üyelik değişince (katıl/ayrıl/kur)
  // geçersiz kalan görünümü düzelt.
  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current) {
      setOrg(inIntel ? 'intel' : 'gang');
      setTab(inIntel || inGang ? 'savas' : 'ceteler');
      return;
    }
    setOrg((o) => (o === 'intel' && !inIntel ? 'gang' : o === 'gang' && !inGang && inIntel ? 'intel' : o));
  }, [inGang, inIntel]);
  const member = org === 'intel' ? inIntel : inGang;
  const activeTab = member ? tab : 'ceteler';

  const open = (o) => {
    picked.current = true;
    setOrg(o);
    setTab('savas');
  };
  const pick = (t) => {
    picked.current = true;
    setTab(t);
  };

  return (
    <div className="gx-shell">
      <div className="gx-shell-body">
        {org === 'gang' && inGang ? (
          <GangViews membership={ms} tab={activeTab} onOpen={open} />
        ) : org === 'intel' && inIntel ? (
          <IntelViews membership={ms} tab={activeTab} onOpen={open} />
        ) : (
          <ListTab membership={ms} onOpen={open} />
        )}
      </div>
      <nav className="gx-subnav" role="tablist">
        {(org === 'intel' ? INTEL_TABS : GANG_TABS).map((t) => {
          const locked = !member && t.id !== 'ceteler';
          return (
            <button key={t.id} role="tab" aria-selected={activeTab === t.id} className={`gx-subnav-btn${activeTab === t.id ? ' active' : ''}${locked ? ' locked' : ''}`} disabled={locked} onClick={() => pick(t.id)}>
              <span className="gx-subnav-icon" aria-hidden="true">
                {locked ? '🔒' : t.icon}
              </span>
              <span className="gx-subnav-label">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function OrgHeader({ logo, name, rank, prestige, kasa, intel = false, sub }) {
  return (
    <div className={`gx-header${intel ? ' intel' : ''}`} style={{ '--gx-accent': logo?.color || '#19e8ff' }}>
      <Logo logo={logo} size={46} />
      <div className="gx-header-main">
        <div className="gx-header-name">{name}</div>
        <div className="gx-header-row">
          <RankBadge rank={rank} small />
          <span className="gx-prestige">✦ {fmt(prestige)}</span>
          {sub}
        </div>
      </div>
      <div className="gx-header-kasa">
        <span className="dim">Kasa</span>
        <Gold value={kasa} />
      </div>
    </div>
  );
}

function GangViews({ membership, tab, onOpen }) {
  const d = useGangData(membership);
  if (tab === 'ceteler') return <ListTab membership={membership} onOpen={onOpen} />;
  if (!d.gang) return <div className="gx-loading">Yükleniyor…</div>;
  if (d.gang.status !== 'active') return <div className="gx-loading">Bu çete dağıldı.</div>;
  return (
    <div className="gx-page">
      <OrgHeader logo={d.gang.logo} name={d.gang.name} rank={d.rank} prestige={d.me?.prestige} kasa={d.state?.kasa} />
      {tab === 'sohbet' && <ChatTab org="gang" d={d} />}
      {tab === 'savas' && <WarsTab org="gang" d={d} />}
      {tab === 'ticaret' && <TradeTab d={d} />}
      {tab === 'cetem' && <CetemTab d={d} />}
    </div>
  );
}

function IntelViews({ membership, tab, onOpen }) {
  const d = useIntelData(membership);
  if (tab === 'ceteler') return <ListTab membership={membership} onOpen={onOpen} />;
  return (
    <div className="gx-page">
      <OrgHeader intel logo={INTEL_LOGO} name="İstihbarat Teşkilatı" rank={d.rank} prestige={d.me?.prestige} kasa={d.state?.kasa} sub={<span className="gx-codename">🕶️ {d.me?.codeName || membership.intelCodeName}</span>} />
      {tab === 'sohbet' && <ChatTab org="intel" d={d} />}
      {tab === 'savas' && <WarsTab org="intel" d={d} />}
      {tab === 'operasyon' && <OpsTab d={d} />}
      {tab === 'istihbarat' && <IntelTab d={d} />}
    </div>
  );
}
