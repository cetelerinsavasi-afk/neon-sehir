import { useState } from 'react';
import LotteryScreen from '../LotteryScreen/LotteryScreen';
import OnNumaraScreen from '../OnNumaraScreen/OnNumaraScreen';
import './CasinoScreen.css';

const TABS = [
  { id: 'onnumara', label: '10 Numara' },
  { id: 'piyango', label: 'Piyango' },
];

// Aktif bir masaya girildiğinde tam ekran gösterim App.jsx seviyesinde
// (OnNumaraFullScreen ile) yönetiliyor — bu bileşen sadece lobiyi/sekmeleri
// gösterir.
export default function CasinoScreen({ onEnterTable }) {
  const [tab, setTab] = useState('onnumara');

  return (
    <div className="casino-tabs-screen">
      <div className="casino-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`casino-tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'onnumara' && <OnNumaraScreen onEnterTable={onEnterTable} />}
      {tab === 'piyango' && <LotteryScreen />}
    </div>
  );
}
