import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { useOpenRaceRooms } from '../../hooks/useOpenRaceRooms';
import { createRaceRoom, joinRaceRoom } from '../../services/gameActions';
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

export default function RaceLobby({ myUid }) {
  const { vehicles: allVehicles } = useVehicles();
  const vehicles = allVehicles.filter((v) => !v.seizedByBank);
  const { rooms } = useOpenRaceRooms();
  const [myVehicleId, setMyVehicleId] = useState('');
  const [betAmount, setBetAmount] = useState('');
  const [joinVehicleByRoom, setJoinVehicleByRoom] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    const amount = Number(betAmount);
    if (!myVehicleId || !amount || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await createRaceRoom(myVehicleId, amount);
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
        <div className="race-row">
          <input
            type="number"
            min="1"
            placeholder="Bahis miktarı (altın)"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            className="race-input"
          />
          <button
            className="race-btn primary"
            disabled={busy || !myVehicleId || !betAmount}
            onClick={handleCreate}
          >
            Oda Kur
          </button>
        </div>
      </div>

      <div className="race-section">
        <p className="race-section-title">Açık Odalar</p>
        {otherRooms.length === 0 && <p className="race-hint">Şu an açık oda yok.</p>}
        {otherRooms.map((r) => (
          <div key={r.id} className="race-room-card">
            <p className="race-room-meta">
              Bahis: {r.betAmount.toLocaleString('tr-TR')} altın
            </p>
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
        ))}
      </div>

      {error && <p className="race-error">{error}</p>}
    </div>
  );
}
