import { useState } from 'react';
import { useRaceRoomById } from '../../hooks/useRaceRoomById';
import { forfeitRace } from '../../services/gameActions';
import RaceRoom from './RaceRoom';
import './RaceFullScreen.css';

// onCollapse: rakip beklenirken (henüz yarış başlamamışken) ekranı küçük
// bir yuvarlağa küçültür — oda hâlâ aktif kalır, harita gezilebilir.
// onExit: odadan TAMAMEN çıkar (yarış bittiğinde ya da forfeit sonrası).
export default function RaceFullScreen({ roomId, myUid, onCollapse, onExit }) {
  const { room } = useRaceRoomById(roomId);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!room) {
    return (
      <div className="race-fullscreen">
        <p className="race-hint">Yükleniyor…</p>
      </div>
    );
  }

  const handleCloseAttempt = () => {
    if (room.status === 'racing') {
      setConfirmingExit(true);
    } else if (room.status === 'waiting' || room.status === 'ready') {
      onCollapse();
    } else {
      onExit();
    }
  };

  const handleConfirmForfeit = async () => {
    setBusy(true);
    try {
      await forfeitRace(roomId);
    } catch {
      // yine de çıkışa izin ver
    } finally {
      setBusy(false);
      setConfirmingExit(false);
      onExit();
    }
  };

  return (
    <div className="race-fullscreen">
      <div className="race-fullscreen-header">
        <span className="race-fullscreen-title">🏁 Yarış Pisti</span>
        <button className="race-fullscreen-close" onClick={handleCloseAttempt}>
          {room.status === 'waiting' || room.status === 'ready' ? '⌄' : '✕'}
        </button>
      </div>
      <div className="race-fullscreen-body">
        <RaceRoom
          room={room}
          myUid={myUid}
          onDismissFinished={onExit}
        />
      </div>

      {confirmingExit && (
        <div className="race-exit-confirm-backdrop">
          <div className="race-exit-confirm">
            <p>Yarış bitmeden çıkmak istediğine emin misin?</p>
            <p className="race-hint">Çıkarsan yarışı kaybetmiş sayılırsın.</p>
            <div className="race-exit-confirm-actions">
              <button className="race-btn" disabled={busy} onClick={() => setConfirmingExit(false)}>
                Vazgeç
              </button>
              <button className="race-btn primary" disabled={busy} onClick={handleConfirmForfeit}>
                Evet, Çık
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
