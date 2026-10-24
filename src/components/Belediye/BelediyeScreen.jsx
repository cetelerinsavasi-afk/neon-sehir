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
import Sikayet from './Sikayet';
import { useBelediyeChatUnread } from '../../hooks/useBelediyeChatUnread';
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

const mineOf = (uid) => (m) => Boolean(uid) && m.uid === uid;
function useChatDots() {
  const { uid, seat } = useBelediye();
  const genel = useBelediyeChatUnread(uid, 'genel', Boolean(seat), mineOf(uid));
  const koord = useBelediyeChatUnread(uid, 'koord', Boolean(seat), mineOf(uid));
  return { genel, koord };
}

function ChatView({ dots }) {
  const { uid } = useBelediye();
  const [ch, setCh] = useState('genel');
  return (
    <div className="gx-page">
      <Chips
        options={[
          { id: 'genel', label: 'Belediye', icon: '🏛️', dot: dots.genel && ch !== 'genel' },
          { id: 'koord', label: 'Teşkilat', icon: '🚓', dot: dots.koord && ch !== 'koord' },
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
  const dots = useChatDots();
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
          <ChatView dots={dots} />
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
                {t.id === 'sohbet' && !locked && active !== 'sohbet' && (dots.genel || dots.koord) && <span className="gx-subnav-dot" />}
              </span>
              <span className="gx-subnav-label">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Top({ onClose }) {
  const [sk, setSk] = useState(false);
  return (
    <>
      <div className="gx-full-top">
        <span className="gx-full-title">🏛️ Belediye</span>
        <span className="bd-top-actions">
          <button className="bd-top-btn" onClick={() => setSk(true)}>
            📣 Şikâyet
          </button>
          <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </span>
      </div>
      {sk && (
        <div className="gx-root bd-root">
          <Sikayet onClose={() => setSk(false)} />
        </div>
      )}
    </>
  );
}

export default function BelediyeScreen({ onClose }) {
  useBackClose(true, onClose);
  return createPortal(
    <div className="gx-full bd-full bd-root" role="dialog" aria-label="Belediye">
      <BelediyeProvider>
        <Top onClose={onClose} />
        <div className="gx-full-body">
          <div className="gx-root bd-root">
            <Shell />
          </div>
        </div>
      </BelediyeProvider>
    </div>,
    document.body
  );
}
