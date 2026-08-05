import { useState } from 'react';
import FutbolLigler from './FutbolLigler';
import './FutbolFullScreen.css';

/**
 * FutbolShell — sadece futbolAdminUnlocked=true olan hesaplarda görünür.
 * Faz 2: Ligler sekmesi gerçek veriyle çalışıyor (lig/takım/oyuncu/fikstür
 * Firestore'dan geliyor). Takımım sekmesi hâlâ iskelet — kadro/transfer
 * sistemi bir sonraki fazda eklenecek.
 */
export default function FutbolShell({ onClose }) {
  const [tab, setTab] = useState('ligler');

  return (
    <div className="futbol-fullscreen">
      <div className="futbol-fullscreen-header">
        <span className="futbol-fullscreen-title">⚽ Futbol (admin önizleme)</span>
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
      </div>

      <div className="futbol-fullscreen-body">
        {tab === 'ligler' ? (
          <FutbolLigler />
        ) : (
          <div className="futbol-placeholder">
            <p>Takımım sekmesi burada olacak:</p>
            <ul>
              <li>Takımın yoksa: satın alınabilir kulüpler listesi</li>
              <li>Takımın varsa: Maçlar — Takımın — Transfer Listesi — Altyapı Tesisi</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
