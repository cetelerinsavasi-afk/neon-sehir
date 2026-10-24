// v127 — BELEDİYE (Belediye Binası › "Belediye"). Çeteler paneline benzer tam
// ekran; altta 5 sekme: Rapor · Sohbet · Bakanlıklar · Borçlar · Başkanlık.
// Belediyede görevi olmayan sadece Rapor'u görür (diğerleri kilitli).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Chips } from '../Gangs/ui';
import { useBackClose } from '../../lib/backStack';
import { BelediyeProvider, useBelediye } from './BelediyeContext';
import RaporTab from './RaporTab';
import BakanliklarTab from './BakanliklarTab';
import BorclarTab from './BorclarTab';
import BaskanlikTab from './BaskanlikTab';
import BelediyeChat from './BelediyeChat';
import { SEATS } from '../../../functions/belediye.js';
import '../Gangs/Gangs.css';
import './Belediye.css';

const TABS = [
  { id: 'rapor', icon: '📋', label: 'Rapor' },
  { id: 'sohbet', icon: '💬', label: 'Sohbet' },
  { id: 'bakanlik', icon: '🏢', label: 'Bakanlıklar' },
  { id: 'borc', icon: '💳', label: 'Borçlar' },
  { id: 'baskan', icon: '👑', label: 'Başkanlık' },
];

function ChatView() {
  const { uid } = useBelediye();
  const [ch, setCh] = useState('genel');
  return (
    <div className="gx-page">
      <Chips
        options={[
          { id: 'genel', label: 'Belediye', icon: '🏛️' },
          { id: 'koord', label: 'Teşkilat', icon: '🚓' },
        ]}
        value={ch}
        onChange={setCh}
      />
      <BelediyeChat key={ch} channel={ch} isMine={(m) => Boolean(uid) && m.uid === uid} />
    </div>
  );
}

function Shell() {
  const { seat, mainLoading } = useBelediye();
  const [tab, setTab] = useState('rapor');
  const active = seat ? tab : 'rapor';
  return (
    <div className="gx-shell">
      <div className="gx-shell-body">
        {seat && (
          <div className="bd-mybar">
            🏛️ {SEATS[seat].title}
          </div>
        )}
        {mainLoading ? (
          <div className="gx-loading">Yükleniyor…</div>
        ) : active === 'rapor' ? (
          <RaporTab />
        ) : active === 'sohbet' ? (
          <ChatView />
        ) : active === 'bakanlik' ? (
          <BakanliklarTab />
        ) : active === 'borc' ? (
          <BorclarTab />
        ) : (
          <BaskanlikTab />
        )}
      </div>
      <nav className="gx-subnav" role="tablist">
        {TABS.map((t) => {
          const locked = !seat && t.id !== 'rapor';
          return (
            <button key={t.id} role="tab" aria-selected={active === t.id} className={`gx-subnav-btn${active === t.id ? ' active' : ''}${locked ? ' locked' : ''}`} disabled={locked} onClick={() => setTab(t.id)}>
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

export default function BelediyeScreen({ onClose }) {
  useBackClose(true, onClose);
  return createPortal(
    <div className="gx-full bd-full" role="dialog" aria-label="Belediye">
      <div className="gx-full-top">
        <span className="gx-full-title">🏛️ Belediye</span>
        <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="gx-full-body">
        <div className="gx-root bd-root">
          <BelediyeProvider>
            <Shell />
          </BelediyeProvider>
        </div>
      </div>
    </div>,
    document.body
  );
}
