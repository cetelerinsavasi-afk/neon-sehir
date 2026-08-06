import { useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { addFutbolTraining, removeFutbolTraining } from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import './FutbolAltyapi.css';

const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };
const TRAINING_SLOTS = 3;

export default function FutbolAltyapi({ team }) {
  const { players } = useFutbolTeamPlayers(team.id);
  const lineup = team.lineup || [];
  // İlk 11'de olan oyuncular antrenman seçeneklerinde hiç gözükmez.
  const trainablePlayers = players.filter((p) => !lineup.includes(p.id));

  return (
    <div className="futbol-altyapi">
      <TrainingSection
        teamId={team.id}
        players={trainablePlayers}
        excludedCount={players.length - trainablePlayers.length}
        trainingPlayerIds={team.trainingPlayerIds || []}
      />
    </div>
  );
}

function TrainingSection({ teamId, players, excludedCount, trainingPlayerIds }) {
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
      <p className="futbol-placeholder">
        İlk 11'deki oyuncular antrenmana gönderilemez — önce kadrodan çıkar.
        {excludedCount > 0 ? ` (${excludedCount} oyuncu ilk 11'de olduğu için listede gizlendi.)` : ''}
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
        {players.length === 0 && <p className="futbol-placeholder">Kadronda oyuncu yok.</p>}
      </div>
    </div>
  );
}
