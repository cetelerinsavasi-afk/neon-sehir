import { useRaceRoomById } from '../../hooks/useRaceRoomById';
import { useAuth } from '../../contexts/AuthContext';
import './RaceBubble.css';

// RaceBubble — oda 'waiting'/'ready' durumundayken tüm ekranı kaplamak
// yerine sağ altta küçük, tıklanabilir bir yuvarlak gösterir. Böylece
// oyuncu rakip beklerken haritada gezinmeye devam edebilir.
export default function RaceBubble({ roomId, onExpand }) {
  const { room } = useRaceRoomById(roomId);
  const { user } = useAuth();

  // v78: bahisli zamana karşı yarışı bitirdim, rakibin sonucu bekleniyor
  const waitingResult = room?.engine === 'ta' && room.status === 'racing' && Boolean(room.players?.[user?.uid]?.finishMs);
  if (!room || (room.status !== 'waiting' && room.status !== 'ready' && !waitingResult)) return null;

  const isReady = room.status === 'ready' || waitingResult;

  return (
    <button className={`race-bubble${isReady ? ' ready' : ''}`} onClick={onExpand}>
      <span className="race-bubble-icon">🏁</span>
      <span className="race-bubble-text">{waitingResult ? 'Rakibin sonucu bekleniyor…' : room.status === 'ready' ? 'Rakip bulundu!' : 'Rakip bekleniyor…'}</span>
    </button>
  );
}
