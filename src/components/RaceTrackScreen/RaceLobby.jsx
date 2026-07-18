import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { useOpenRaceRooms } from '../../hooks/useOpenRaceRooms';
import { useTrainingProgress } from '../../hooks/useTrainingProgress';
import { createRaceRoom, joinRaceRoom, createTrainingRace } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { INITIAL_LIFE_DAYS } from '../VehicleCard/VehicleCard';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './RaceTrackScreen.css';

const TRAINING_LEVELS = 10;

function raceable(v) {
  return !v.seizedByBank && (v.lifeDays ?? INITIAL_LIFE_DAYS) > 0;
}

function vehicleImage(catalogId) {
  return vehicleCatalog.find((v) => v.id === catalogId)?.image;
}

// Araçlar artık düz bir <select> değil, fotoğraflı, tıklanabilir kartlar
// olarak gösteriliyor (HTML <option> içine resim koyulamıyor).
function VehiclePicker({ vehicles, value, onChange }) {
  if (vehicles.length === 0) {
    return (
      <p className="race-hint">
        Henüz bir araca sahip değilsin. Önce <strong>Araba Galerisi</strong>'nden bir araç al.
      </p>
    );
  }
  return (
    <div className="race-vehicle-picker">
      {vehicles.map((v) => {
        const img = vehicleImage(v.catalogId);
        const selected = value === v.id;
        return (
          <button
            key={v.id}
            className={`race-vehicle-card${selected ? ' selected' : ''}`}
            onClick={() => onChange(v.id)}
          >
            {img && <img className="race-vehicle-photo" src={img} alt={v.model} />}
            <span className="race-vehicle-name">{v.model}</span>
            <span className="race-vehicle-stats">
              Vites {v.gearLevel} · Depo {v.baseTank + (v.tankBonus || 0)}L
              {v.turboCount > 0 ? ` · Turbo ×${v.turboCount}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TrainingStartModal({ level, vehicles, onClose, onCreated }) {
  const [myVehicleId, setMyVehicleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleStart = async () => {
    if (!myVehicleId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createTrainingRace(myVehicleId, level);
      if (res?.data?.roomId) onCreated(res.data.roomId);
    } catch (err) {
      setError(err.message || 'Antrenman başlatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="race-create-backdrop" onClick={onClose}>
      <div className="race-create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="race-create-header">
          <p className="race-section-title">{level}. Seviye</p>
          <button className="race-create-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="race-hint">Rakibin, {level}. vitesle sabit ilerleyen bir bot.</p>
        <VehiclePicker vehicles={vehicles} value={myVehicleId} onChange={setMyVehicleId} />
        <button className="race-btn primary" disabled={busy || !myVehicleId} onClick={handleStart}>
          {busy ? 'Başlatılıyor…' : 'Antrenmana Başla'}
        </button>
        {error && <p className="race-error">{error}</p>}
      </div>
    </div>
  );
}

export function TrainingLobby({ onEnterRoom }) {
  const { vehicles: allVehicles } = useVehicles();
  const vehicles = allVehicles.filter(raceable);
  return <TrainingSection vehicles={vehicles} onEnterRoom={onEnterRoom} />;
}

function TrainingSection({ vehicles, onEnterRoom }) {
  const { progress } = useTrainingProgress();
  const [selectedLevel, setSelectedLevel] = useState(null);
  const unlockedLevel = progress.unlockedLevel || 1;

  return (
    <div className="race-section">
      <p className="race-section-title">🎓 Antrenman Modu</p>
      <p className="race-hint">Botlara karşı ücretsiz pratik yap.</p>
      <div className="training-level-list">
        {Array.from({ length: TRAINING_LEVELS }, (_, i) => i + 1).map((lvl) => {
          const locked = lvl > unlockedLevel;
          const beaten = Boolean(progress.beatenLevels?.[lvl]);
          return (
            <button
              key={lvl}
              className={`training-level-row${locked ? ' locked' : ''}${beaten ? ' beaten' : ''}`}
              disabled={locked}
              onClick={() => setSelectedLevel(lvl)}
            >
              <span className="training-level-row-title">
                {locked ? '🔒 ' : ''}
                {lvl}. Seviye
              </span>
              <span className="training-level-row-reward">
                {(lvl * 1000).toLocaleString('tr-TR')} altın{beaten ? ' · ✓ Kazanıldı' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {selectedLevel && (
        <TrainingStartModal
          level={selectedLevel}
          vehicles={vehicles}
          onClose={() => setSelectedLevel(null)}
          onCreated={onEnterRoom}
        />
      )}
    </div>
  );
}

function CreateRoomModal({ vehicles, onClose, onCreated }) {
  const [myVehicleId, setMyVehicleId] = useState('');
  const [betAmount, setBetAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!myVehicleId || !betAmount) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createRaceRoom(myVehicleId, betAmount);
      if (res?.data?.roomId) onCreated(res.data.roomId);
    } catch (err) {
      setError(err.message || 'Oda kurulamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="race-create-backdrop" onClick={onClose}>
      <div className="race-create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="race-create-header">
          <p className="race-section-title">Oda Kur</p>
          <button className="race-create-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <VehiclePicker vehicles={vehicles} value={myVehicleId} onChange={setMyVehicleId} />
        <p className="race-bet-label">
          Bahsi Belirle: <strong>{betAmount.toLocaleString('tr-TR')} altın</strong>
        </p>
        <QuantityStepper value={betAmount} onChange={setBetAmount} quickAmounts={[10, 100, 1000]} />
        <button
          className="race-btn primary"
          disabled={busy || !myVehicleId || !betAmount}
          onClick={handleCreate}
        >
          {betAmount > 0 ? `Oda Kur — ${betAmount.toLocaleString('tr-TR')} altın bahis` : 'Oda Kur'}
        </button>
        {error && <p className="race-error">{error}</p>}
      </div>
    </div>
  );
}

export default function RaceLobby({ myUid, onEnterRoom }) {
  const { vehicles: allVehicles } = useVehicles();
  const vehicles = allVehicles.filter(raceable);
  const { rooms } = useOpenRaceRooms();
  const [showCreate, setShowCreate] = useState(false);
  const [joinVehicleByRoom, setJoinVehicleByRoom] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleJoin = async (roomId) => {
    const vehicleId = joinVehicleByRoom[roomId];
    if (!vehicleId) return;
    setBusy(true);
    setError(null);
    try {
      await joinRaceRoom(roomId, vehicleId);
      onEnterRoom(roomId);
    } catch (err) {
      setError(err.message || 'Odaya katılamadın.');
    } finally {
      setBusy(false);
    }
  };

  const otherRooms = rooms.filter((r) => r.creatorUid !== myUid);

  return (
    <div className="race-screen">
      <button className="race-btn primary race-create-open-btn" onClick={() => setShowCreate(true)}>
        + Oda Kur
      </button>

      <div className="race-section">
        <p className="race-section-title">Açık Odalar</p>
        {otherRooms.length === 0 && <p className="race-hint">Şu an açık oda yok.</p>}
        {otherRooms.map((r) => {
          const creatorInfo = r.players?.[r.creatorUid];
          return (
            <div key={r.id} className="race-room-card">
              <p className="race-room-meta">Bahis: {r.betAmount.toLocaleString('tr-TR')} altın</p>
              {creatorInfo && (
                <p className="race-room-creator">
                  {creatorInfo.displayName} — {creatorInfo.vehicleModel} (Vites{' '}
                  {creatorInfo.maxGear}, Depo {creatorInfo.maxFuel}L
                  {creatorInfo.turboTotal > 0 ? `, Turbo ×${creatorInfo.turboTotal}` : ''})
                </p>
              )}
              <VehiclePicker
                vehicles={vehicles}
                value={joinVehicleByRoom[r.id] || ''}
                onChange={(v) => setJoinVehicleByRoom((prev) => ({ ...prev, [r.id]: v }))}
              />
              <button
                className="race-btn"
                disabled={busy || !joinVehicleByRoom[r.id]}
                onClick={() => handleJoin(r.id)}
              >
                Katıl
              </button>
            </div>
          );
        })}
      </div>

      {error && <p className="race-error">{error}</p>}

      {showCreate && (
        <CreateRoomModal
          vehicles={vehicles}
          onClose={() => setShowCreate(false)}
          onCreated={onEnterRoom}
        />
      )}
    </div>
  );
}
