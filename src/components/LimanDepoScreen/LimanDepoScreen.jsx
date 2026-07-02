import { useState } from 'react';
import LimanScreen from '../LimanScreen/LimanScreen';
import DepoScreen from '../DepoScreen/DepoScreen';
import './LimanDepoScreen.css';

const TABS = [
  { id: 'liman', label: 'Liman' },
  { id: 'depo', label: 'Depo' },
];

export default function LimanDepoScreen() {
  const [tab, setTab] = useState('liman');

  return (
    <div className="liman-depo-tabs-screen">
      <div className="liman-depo-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`liman-depo-tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'liman' ? <LimanScreen /> : <DepoScreen />}
    </div>
  );
}
