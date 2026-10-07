import { useState } from 'react';
import { useStatBoard, STAT_BOARDS } from '../../hooks/useFutbolPro';
import FutbolCrest from './FutbolCrest';
import { POS_META } from './futbolProMeta';
import './FutbolPro.css';

// v77 Faz 5 — Ligler › Oyuncular: sezonun gol kralı, asist, yıldızlar, form,
// kale bekçisi, duvar. Sadece LİG maçları sayılır (kupa hariç); her sezon sıfırlanır.
const ORDER = ['goals', 'assists', 'motm', 'form', 'gk', 'def'];
const initials = (n) =>
  String(n || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3);

export default function FutbolOyuncular({ season }) {
  const [board, setBoard] = useState('goals');
  const b = STAT_BOARDS[board];
  const { rows, loading } = useStatBoard(season, board, 30);
  return (
    <div className="fp-boards">
      <div className="fp-board-tabs">
        {ORDER.map((id) => (
          <button key={id} className={`fp-board-tab${board === id ? ' on' : ''}`} onClick={() => setBoard(id)}>
            <span>{STAT_BOARDS[id].icon}</span>
            {STAT_BOARDS[id].label}
          </button>
        ))}
      </div>
      {b.minApps && <p className="fp-hint">En az {b.minApps} maç oynayanlar · maç puanı ortalaması</p>}
      {loading && <p className="futbol-placeholder">Yükleniyor…</p>}
      {!loading && rows.length === 0 && <p className="futbol-placeholder">Bu sezon henüz kayıt yok.</p>}
      <div className="fp-board">
        {rows.map((r, i) => (
          <div key={r.id} className={`fp-board-row${i < 3 ? ` top${i + 1}` : ''}${r.real ? ' real' : ''}`}>
            <span className="fp-board-rank">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
            <FutbolCrest logo={r.teamLogo} initials={initials(r.teamName)} size={30} />
            <div className="fp-board-main">
              <b>
                {r.name}
                {r.real && <em className="fp-real" title="Gerçek oyuncu">👤</em>}
              </b>
              <span>
                {POS_META[r.position]?.icon} {r.teamName} · {r.apps} maç
              </span>
            </div>
            <b className="fp-board-val">{b.field === 'ratingAvg' ? Number(r.ratingAvg).toFixed(2) : r[b.field]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
