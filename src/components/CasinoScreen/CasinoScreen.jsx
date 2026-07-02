import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import LotteryScreen from '../LotteryScreen/LotteryScreen';
import OnNumaraScreen from '../OnNumaraScreen/OnNumaraScreen';
import OnNumaraTable from '../OnNumaraScreen/OnNumaraTable';
import './CasinoScreen.css';

const TABS = [
  { id: 'onnumara', label: '10 Numara' },
  { id: 'piyango', label: 'Piyango' },
];

export default function CasinoScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState('onnumara');
  const [viewingTableId, setViewingTableId] = useState(null);

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

      {tab === 'onnumara' &&
        (viewingTableId ? (
          <OnNumaraTable
            tableId={viewingTableId}
            myUid={user?.uid}
            onLeave={() => setViewingTableId(null)}
          />
        ) : (
          <OnNumaraScreen onEnterTable={setViewingTableId} />
        ))}

      {tab === 'piyango' && <LotteryScreen />}
    </div>
  );
}
