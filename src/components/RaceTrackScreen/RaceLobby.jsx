import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { useOpenRaceRooms } from '../../hooks/useOpenRaceRooms';
import { createRaceRoom, joinRaceRoom } from '../../services/gameActions';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './RaceTrackScreen.css';

function VehiclePicker({ vehicles, value, onChange }) {
  if (vehicles.length === 0) {
    return (
      <p className="race-hint">
        Henüz bir araca sahip değilsin. Önce <strong>Araba Galerisi</strong>'nden bir araç al.
      </p>
    );
  }
  return (
    <select className="race-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Araç seç…</option>
      {vehicles.map((v) => (
        <option key={v.id} value={v.id}>
          {v.model} (Vites {v.gearLevel}, Depo {v.baseTank + (v.tankBonus || 0)}L)
        </option>
      ))}
    </select>
  );
}

export default function RaceLobby({ myUid, onEnterRoom }) {
  const { vehicles: allVehicles } = useVehicles();
  const vehicles = allVehicles.filter((v) => !v.seizedByBank);
  const { rooms } = useOpenRaceRooms();
  const [myVehicleId, setMyVehicleId] = useState('');
  const [betAmount, setBetAmount] = useState(0);
  const [joinVehicleByRoom, setJoinVehicleByRoom] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    const amount = Number(betAmount);
    if (!myVehicleId || !amount || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createRaceRoom(myVehicleId, amount);
      // Sorgunun bu yeni odayı "yakalamasını" beklemeden anında ona geç —
      // "oda kurduğumda kurduğum oda gözükmüyor" hatasının kaynağı buydu.
      if (res?.data?.roomId) onEnterRoom(res.data.roomId);
    } catch (err) {
      setError(err.message || 'Oda kurulamadı.');
    } finally {
      setBusy(false);
    }
  };

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
      <div className="race-section">
        <p className="race-section-title">Oda Kur</p>
        <VehiclePicker vehicles={vehicles} value={myVehicleId} onChange={setMyVehicleId} />
        <QuantityStepper value={betAmount} onChange={setBetAmount} quickAmounts={[1, 10, 100, 1000]} />
        <button
          className="race-btn primary"
          disabled={busy || !myVehicleId || !betAmount}
          onClick={handleCreate}
        >
          {betAmount > 0 ? `Oda Kur — ${betAmount.toLocaleString('tr-TR')} altın bahis` : 'Oda Kur'}
        </button>
      </div>

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
    </div>
  );
}
