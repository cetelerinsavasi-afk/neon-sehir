import { useRaceRoomById } from '../../hooks/useRaceRoomById';
import './RaceBubble.css';

// RaceBubble — oda 'waiting'/'ready' durumundayken tüm ekranı kaplamak
// yerine sağ altta küçük, tıklanabilir bir yuvarlak gösterir. Böylece
// oyuncu rakip beklerken haritada gezinmeye devam edebilir.
export default function RaceBubble({ roomId, onExpand }) {
  const { room } = useRaceRoomById(roomId);

  if (!room || (room.status !== 'waiting' && room.status !== 'ready')) return null;

  const isReady = room.status === 'ready';

  return (
    <button className={`race-bubble${isReady ? ' ready' : ''}`} onClick={onExpand}>
      <span className="race-bubble-icon">🏁</span>
      <span className="race-bubble-text">{isReady ? 'Rakip bulundu!' : 'Rakip bekleniyor…'}</span>
    </button>
  );
}
