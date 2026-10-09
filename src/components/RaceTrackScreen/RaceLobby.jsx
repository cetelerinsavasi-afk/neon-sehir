import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { useOpenRaceRooms } from '../../hooks/useOpenRaceRooms';
import { useTrainingProgress } from '../../hooks/useTrainingProgress';
import { createRaceRoom, joinRaceRoom, createTrainingRace } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { INITIAL_LIFE_DAYS, vehicleDisplayName } from '../VehicleCard/VehicleCard';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import { usePlayer } from '../../hooks/usePlayer';
import { CarStatBars, CarThumb, LevelPips, vehicleRaceLevel } from './CarStats';
import { trainingBot } from '../../../functions/raceSim.js';

// v67 — bahisli yarışta en yüksek bahis (sunucuda da aynı sınır: RACE_MAX_BET)
const RACE_MAX_BET = 100_000;
import './RaceTrackScreen.css';

const TRAINING_LEVELS = 10;

function raceable(v) {
  // Kullanıcı revizesi: "sattığım arabalarla şampiyonaya katılabiliyorum"
  // — 2. elde listelenmiş (satışa çıkarılmış) araçlar seçim listesinde
  // hiç görünmemeli (sunucu tarafında da aynı kontrol var, bkz.
  // functions/index.js getVehicleForRace).
  return !v.listed && !v.seizedByBank && (v.lifeDays ?? INITIAL_LIFE_DAYS) > 0;
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
            {img && <img className="race-vehicle-photo" src={img} alt={vehicleDisplayName(v)} />}
            <span className="race-vehicle-info">
              <span className="race-vehicle-name">
                {vehicleDisplayName(v)} <LevelPips level={vehicleRaceLevel(v)} />
              </span>
              <CarStatBars catalogId={v.catalogId} level={vehicleRaceLevel(v)} compact />
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
        <div className="race-bot-card">
          <CarThumb catalogId={trainingBot(level).catalogId} />
          <div>
            <p className="race-hint">
              Rakibin: <strong>{vehicleCatalog.find((c) => c.id === trainingBot(level).catalogId)?.name}</strong> süren bot
            </p>
            <CarStatBars catalogId={trainingBot(level).catalogId} level={1} compact />
          </div>
        </div>
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
      <p className="race-hint">Botlara karşı ücretsiz pratik yap. Her seviyede bot bir üst galeri aracını sürer: 1. seviye en ucuz araç, 10. seviye en pahalı araç.</p>
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
                <small className="training-level-car">{vehicleCatalog.find((c) => c.id === trainingBot(lvl).catalogId)?.name}</small>
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
  const { player } = usePlayer();
  const betMax = Math.max(0, Math.min(RACE_MAX_BET, Math.floor(Number(player?.gold || 0))));
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
        <QuantityStepper value={betAmount} onChange={setBetAmount} max={betMax} />
        <p className="race-hint">En fazla {RACE_MAX_BET.toLocaleString('tr-TR')} altın bahis.{betMax < RACE_MAX_BET ? ` Altının: ${Math.floor(Number(player?.gold || 0)).toLocaleString('tr-TR')}` : ''}</p>
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
  // v78: önce rakibin aracı görünür; "Yarışa Katıl"a basınca araç seçimi açılır
  const [joinRoom, setJoinRoom] = useState(null);
  const [joinVehicleId, setJoinVehicleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleJoin = async (roomId) => {
    const vehicleId = joinVehicleId;
    if (!vehicleId) return;
    setBusy(true);
    setError(null);
    try {
      await joinRaceRoom(roomId, vehicleId);
      setJoinRoom(null);
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
              <div className="race-room-top">
                {creatorInfo?.catalogId && <img className="race-room-thumb" src={vehicleImage(creatorInfo.catalogId)} alt={creatorInfo.vehicleModel} />}
                <div className="race-room-info">
                  <p className="race-room-creator">
                    <strong>{creatorInfo?.displayName || 'Oyuncu'}</strong>
                  </p>
                  <p className="race-room-car">
                    {creatorInfo?.vehicleModel}
                    {r.engine === 'ta' ? (
                      <>
                        {' '}
                        <LevelPips level={creatorInfo?.level || 1} />
                      </>
                    ) : (
                      ` (Vites ${creatorInfo?.maxGear}, Depo ${creatorInfo?.maxFuel}L)`
                    )}
                  </p>
                  <p className="race-room-meta">💰 Bahis: {r.betAmount.toLocaleString('tr-TR')} altın</p>
                </div>
              </div>
              {creatorInfo?.catalogId && <CarStatBars catalogId={creatorInfo.catalogId} level={creatorInfo.level || 1} compact />}
              <button
                className="race-btn primary"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setJoinVehicleId('');
                  setJoinRoom(r);
                }}
              >
                🏁 Yarışa Katıl
              </button>
            </div>
          );
        })}
      </div>

      {error && !joinRoom && <p className="race-error">{error}</p>}

      {joinRoom && (
        <div className="race-create-backdrop" onClick={() => !busy && setJoinRoom(null)}>
          <div className="race-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="race-create-header">
              <p className="race-section-title">Aracını Seç</p>
              <button className="race-create-close" onClick={() => setJoinRoom(null)}>
                ✕
              </button>
            </div>
            <p className="race-hint">
              Rakip: <strong>{joinRoom.players?.[joinRoom.creatorUid]?.displayName}</strong> · {joinRoom.players?.[joinRoom.creatorUid]?.vehicleModel} · Bahis{' '}
              {joinRoom.betAmount.toLocaleString('tr-TR')} altın
            </p>
            <VehiclePicker vehicles={vehicles} value={joinVehicleId} onChange={setJoinVehicleId} />
            <button className="race-btn primary" disabled={busy || !joinVehicleId} onClick={() => handleJoin(joinRoom.id)}>
              {busy ? 'Katılınıyor…' : `Katıl — ${joinRoom.betAmount.toLocaleString('tr-TR')} altın bahis`}
            </button>
            {error && <p className="race-error">{error}</p>}
          </div>
        </div>
      )}

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
