import { useState } from 'react';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { useFutbolGrowthLog } from '../../hooks/useFutbolGrowthLog';
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
      <GrowthLogSection teamId={team.id} />
      <TrainingSection
        teamId={team.id}
        players={trainablePlayers}
        excludedCount={players.length - trainablePlayers.length}
        trainingPlayerIds={team.trainingPlayerIds || []}
      />
    </div>
  );
}

function GrowthLogSection({ teamId }) {
  const [open, setOpen] = useState(false);
  const { entries, loading } = useFutbolGrowthLog(teamId, open);

  return (
    <div className="futbol-growth-log">
      <button className="futbol-admin-reset futbol-growth-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Gelişimleri Gizle' : 'Gelişimler'}
      </button>
      {open && (
        <div className="futbol-growth-panel">
          {loading && <p className="futbol-placeholder">Yükleniyor...</p>}
          {!loading && entries.length === 0 && (
            <p className="futbol-placeholder">Henüz kaydedilmiş bir gelişim yok.</p>
          )}
          {!loading &&
            entries.map((e) => (
              <div key={e.id} className="futbol-growth-row">
                <span className="futbol-growth-name">{e.playerName}</span>
                <span className={`futbol-growth-type ${e.type}`}>
                  {e.type === 'mac' ? 'Maç' : 'Antrenman'}
                </span>
                <span className="futbol-growth-amount">+{e.amount.toFixed(1)} güç</span>
              </div>
            ))}
        </div>
      )}
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
