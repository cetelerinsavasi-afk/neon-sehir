import { useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import {
  buildFutbolAcademy,
  buyFutbolYouthPlayer,
  startFutbolTraining,
  cancelFutbolTraining,
} from '../../services/gameActions';
import './FutbolAltyapi.css';

const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };

export default function FutbolAltyapi({ team }) {
  const { players } = useFutbolTeamPlayers(team.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleBuild = async () => {
    setBusy(true);
    setError('');
    try {
      await buildFutbolAcademy(team.id);
    } catch (err) {
      setError(err?.message || 'Kurulamadı.');
    } finally {
      setBusy(false);
    }
  };

  if (!team.hasAcademy) {
    return (
      <div className="futbol-altyapi">
        <p className="futbol-placeholder">
          Altyapı tesisin yok. 100.000 altın karşılığında kurarsan genç
          yetenekler (16 yaş / 50.0 güç) satın alıp antrenmanla
          geliştirebilirsin.
        </p>
        {error && <p className="futbol-admin-error">{error}</p>}
        <button className="futbol-admin-submit" disabled={busy} onClick={handleBuild}>
          {busy ? '...' : 'Altyapı Tesisi Kur (100.000 altın)'}
        </button>
      </div>
    );
  }

  return (
    <div className="futbol-altyapi">
      <YouthBuySection teamId={team.id} />
      <TrainingSection teamId={team.id} players={players} trainingPlayerId={team.trainingPlayerId} />
    </div>
  );
}

function YouthBuySection({ teamId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleBuy = async (position) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await buyFutbolYouthPlayer(teamId, position);
      setMessage('Genç yetenek kadrona katıldı ✓');
    } catch (err) {
      setError(err?.message || 'Satın alınamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="futbol-kadro-section-title">Genç Yetenek Satın Al (25.000 altın)</p>
      <div className="futbol-kadro-chip-row">
        {Object.entries(POSITION_LABELS).map(([pos, label]) => (
          <button key={pos} className="futbol-kadro-chip" disabled={busy} onClick={() => handleBuy(pos)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-placeholder">{message}</p>}
    </div>
  );
}

function TrainingSection({ teamId, players, trainingPlayerId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = async (playerId) => {
    setBusy(true);
    setError('');
    try {
      await startFutbolTraining(teamId, playerId);
    } catch (err) {
      setError(err?.message || 'Seçilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    setError('');
    try {
      await cancelFutbolTraining(teamId);
    } catch (err) {
      setError(err?.message || 'İptal edilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="futbol-training">
      <p className="futbol-kadro-section-title">Bugünkü Antrenman (18:00&apos;de uygulanır)</p>
      {error && <p className="futbol-admin-error">{error}</p>}
      {trainingPlayerId && (
        <button className="futbol-admin-reset" disabled={busy} onClick={handleCancel}>
          Antrenmanı İptal Et
        </button>
      )}
      <div className="futbol-training-list">
        {players.map((p) => (
          <button
            key={p.id}
            className={`futbol-kadro-player ${trainingPlayerId === p.id ? 'selected' : ''}`}
            disabled={busy}
            onClick={() => handleSelect(p.id)}
          >
            <span>
              {p.name} <span className="futbol-transfer-pos">({POSITION_LABELS[p.position]})</span>
            </span>
            <span className="futbol-kadro-player-power">
              {p.power.toFixed(1)} güç · {p.age} yaş
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
