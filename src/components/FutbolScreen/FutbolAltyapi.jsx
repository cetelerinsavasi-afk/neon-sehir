import { useMemo, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { buyFutbolYouthPlayer, addFutbolTraining, removeFutbolTraining } from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import './FutbolAltyapi.css';

const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const TRAINING_SLOTS = 3;

// Altyapı artık her takımda hazır kurulu — ayrı bir "tesis kur" adımı yok.
export default function FutbolAltyapi({ team }) {
  const { players } = useFutbolTeamPlayers(team.id);

  return (
    <div className="futbol-altyapi">
      <YouthBuySection teamId={team.id} />
      <TrainingSection teamId={team.id} players={players} trainingPlayerIds={team.trainingPlayerIds || []} />
    </div>
  );
}

function YouthBuySection({ teamId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);

  // Sadece önizleme için rastgele bir avatar üretiyoruz — gerçek oyuncu
  // satın alınınca sunucuda (aynı yaş/güç kurallarıyla) oluşuyor.
  const candidates = useMemo(
    () =>
      POSITIONS.map((pos) => ({
        position: pos,
        previewId: `${teamId}-${pos}-${Math.random().toString(36).slice(2, 8)}`,
      })),
    [teamId, message]
  );

  const handleBuy = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await buyFutbolYouthPlayer(teamId, selected);
      setMessage('Genç yetenek kadrona katıldı ✓');
      setSelected(null);
    } catch (err) {
      setError(err?.message || 'Satın alınamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="futbol-kadro-section-title">Genç Yetenek Satın Al (30.000 altın)</p>
      <div className="futbol-youth-grid">
        {candidates.map((c) => (
          <button
            key={c.position}
            className={`futbol-youth-card ${selected === c.position ? 'selected' : ''}`}
            onClick={() => setSelected(c.position)}
          >
            <FutbolPlayerAvatar playerId={c.previewId} position={c.position} size={52} />
            <span className="futbol-youth-card-pos">{POSITION_LABELS[c.position]}</span>
            <span className="futbol-youth-card-meta">16 yaş · 50.0 güç</span>
          </button>
        ))}
      </div>
      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-placeholder">{message}</p>}
      <p className="futbol-buy-meta">Fiyat: 30.000 altın</p>
      <button className="futbol-admin-submit" disabled={busy || !selected} onClick={handleBuy}>
        {busy ? '...' : 'Satın Al'}
      </button>
    </div>
  );
}

function TrainingSection({ teamId, players, trainingPlayerIds }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const handleStart = async (playerId) => {
    setBusyId(playerId);
    setError('');
    try {
      await addFutbolTraining(teamId, playerId);
    } catch (err) {
      setError(err?.message || 'Başlatılamadı.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (playerId) => {
    setBusyId(playerId);
    setError('');
    try {
      await removeFutbolTraining(teamId, playerId);
    } catch (err) {
      setError(err?.message || 'İptal edilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const slotsFull = trainingPlayerIds.length >= TRAINING_SLOTS;

  return (
    <div className="futbol-training">
      <p className="futbol-kadro-section-title">
        Antrenman ({trainingPlayerIds.length}/{TRAINING_SLOTS}) — 18:00-19:00 arası, antrenmandaki
        oyuncu o günkü maça çıkamaz
      </p>
      {error && <p className="futbol-admin-error">{error}</p>}
      <div className="futbol-training-list">
        {players.map((p) => {
          const inTraining = trainingPlayerIds.includes(p.id);
          return (
            <div key={p.id} className="futbol-training-row">
              <FutbolPlayerAvatar playerId={p.id} position={p.position} size={34} />
              <div className="futbol-training-info">
                <p className="futbol-transfer-name">
                  {p.name} <span className="futbol-transfer-pos">({POSITION_LABELS[p.position]})</span>
                </p>
                <p className="futbol-buy-meta">
                  {p.age} yaş · {p.power.toFixed(1)} güç · {Math.round(p.form)}% form
                </p>
              </div>
              {inTraining ? (
                <button className="futbol-admin-reset" disabled={busyId === p.id} onClick={() => handleCancel(p.id)}>
                  İptal Et
                </button>
              ) : (
                <button
                  className="futbol-admin-submit"
                  disabled={busyId === p.id || slotsFull}
                  onClick={() => handleStart(p.id)}
                >
                  Antrenmanı Başlat
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
