import { useAuth } from '../../contexts/AuthContext';
import { useMyActiveRaceRoom } from '../../hooks/useMyActiveRaceRoom';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import RaceLobby from './RaceLobby';
import RaceRoom from './RaceRoom';
import './RaceTrackScreen.css';

export default function RaceTrackScreen() {
  const { user } = useAuth();
  const { room, loading } = useMyActiveRaceRoom();

  if (!user) {
    return <SignInPrompt message="Yarış pistine girmek için giriş yapmalısın." />;
  }

  if (loading) {
    return <p className="race-hint">Yükleniyor…</p>;
  }

  if (room) {
    return <RaceRoom room={room} myUid={user.uid} />;
  }

  return <RaceLobby myUid={user.uid} />;
}
