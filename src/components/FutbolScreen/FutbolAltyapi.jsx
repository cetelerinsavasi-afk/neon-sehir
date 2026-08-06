import { useEffect, useMemo, useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { buyFutbolYouthPlayer, setFutbolTraining } from '../../services/gameActions';
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
      <button className="futbol-admin-submit" disabled={busy || !selected} onClick={handleBuy}>
        {busy ? '...' : 'Satın Al'}
      </button>
    </div>
  );
}

function TrainingSection({ teamId, players, trainingPlayerIds }) {
  const [selected, setSelected] = useState(trainingPlayerIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSelected(trainingPlayerIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, trainingPlayerIds.join(',')]);

  const toggle = (playerId) => {
    setMessage('');
    setSelected((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId);
      if (prev.length >= TRAINING_SLOTS) return prev;
      return [...prev, playerId];
    });
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await setFutbolTraining(teamId, selected);
      setMessage('Antrenman programı kaydedildi ✓');
    } catch (err) {
      setError(err?.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="futbol-training">
      <p className="futbol-kadro-section-title">
        Bugünkü Antrenman ({selected.length}/{TRAINING_SLOTS}) — 18:00&apos;de uygulanır
      </p>
      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-placeholder">{message}</p>}
      <div className="futbol-training-list">
        {players.map((p) => (
          <button
            key={p.id}
            className={`futbol-kadro-player ${selected.includes(p.id) ? 'selected' : ''}`}
            disabled={busy || (!selected.includes(p.id) && selected.length >= TRAINING_SLOTS)}
            onClick={() => toggle(p.id)}
          >
            <FutbolPlayerAvatar playerId={p.id} position={p.position} size={30} />
            <span>
              {p.name} <span className="futbol-transfer-pos">({POSITION_LABELS[p.position]})</span>
            </span>
            <span className="futbol-kadro-player-power">
              {p.power.toFixed(1)} güç · {p.age} yaş
            </span>
          </button>
        ))}
      </div>
      <button className="futbol-admin-submit" disabled={busy} onClick={handleSave}>
        {busy ? '...' : 'Antrenman Programını Kaydet'}
      </button>
    </div>
  );
}
