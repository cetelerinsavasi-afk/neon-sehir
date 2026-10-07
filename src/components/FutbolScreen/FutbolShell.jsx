import { useState } from 'react';
import FutbolLigler from './FutbolLigler';
import FutbolTakimim from './FutbolTakimim';
import FutbolFutbolcu from './FutbolFutbolcu';
import './FutbolFullScreen.css';

/**
 * FutbolShell — Futbol modülünün ana kabuğu. Ligler (lig/puan tablosu/
 * fikstür/kulüpler/iddaa) ve Takımım (kadro/transfer/antrenman/forma)
 * sekmeleri arasında geçiş sağlar.
 */
export default function FutbolShell({ onClose }) {
  const [tab, setTab] = useState('ligler');

  return (
    <div className="futbol-fullscreen">
      <div className="futbol-fullscreen-header">
        <span className="futbol-fullscreen-title">⚽ Futbol</span>
        <button className="futbol-fullscreen-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="futbol-subtabs">
        <button
          className={`futbol-subtab-btn ${tab === 'ligler' ? 'active' : ''}`}
          onClick={() => setTab('ligler')}
        >
          Ligler
        </button>
        <button
          className={`futbol-subtab-btn ${tab === 'takimim' ? 'active' : ''}`}
          onClick={() => setTab('takimim')}
        >
          Takımım
        </button>
        <button
          className={`futbol-subtab-btn ${tab === 'futbolcu' ? 'active' : ''}`}
          onClick={() => setTab('futbolcu')}
        >
          🏃 Futbolcu
        </button>
      </div>

      <div className="futbol-fullscreen-body">
        {tab === 'ligler' ? <FutbolLigler /> : tab === 'futbolcu' ? <FutbolFutbolcu /> : <FutbolTakimim />}
      </div>
    </div>
  );
}
