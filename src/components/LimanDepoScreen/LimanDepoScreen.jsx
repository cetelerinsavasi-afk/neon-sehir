import { useState } from 'react';
import LimanScreen from '../LimanScreen/LimanScreen';
import DepoScreen from '../DepoScreen/DepoScreen';
import './LimanDepoScreen.css';

export default function LimanDepoScreen() {
  const [selected, setSelected] = useState(null);

  if (selected === 'liman') {
    return (
      <div className="liman-depo-detail">
        <button className="liman-depo-back" onClick={() => setSelected(null)}>
          ← Geri
        </button>
        <LimanScreen />
      </div>
    );
  }

  if (selected === 'depo') {
    return (
      <div className="liman-depo-detail">
        <button className="liman-depo-back" onClick={() => setSelected(null)}>
          ← Geri
        </button>
        <DepoScreen />
      </div>
    );
  }

  return (
    <div className="liman-depo-picker">
      <button className="liman-depo-card" onClick={() => setSelected('liman')}>
        <span className="liman-depo-card-emoji">🚢</span>
        <span className="liman-depo-card-title">Liman</span>
        <span className="liman-depo-card-desc">
          Siparişin gelmesi 2-4 gün sürebilir ama %20 daha ucuzdur.
        </span>
      </button>
      <button className="liman-depo-card" onClick={() => setSelected('depo')}>
        <span className="liman-depo-card-emoji">📦</span>
        <span className="liman-depo-card-title">Depo</span>
        <span className="liman-depo-card-desc">
          İstediğin ürünü anında alıp anında satabilirsin ama fiyatlar biraz tuzlu.
        </span>
      </button>
    </div>
  );
}
