import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyActiveRaceRoom } from '../../hooks/useMyActiveRaceRoom';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import RaceLobby from './RaceLobby';
import RaceRoom from './RaceRoom';
import './RaceTrackScreen.css';

export default function RaceTrackScreen() {
  const { user } = useAuth();
  const { room, loading } = useMyActiveRaceRoom();
  const [dismissedRoomId, setDismissedRoomId] = useState(null);

  if (!user) {
    return <SignInPrompt message="Yarış pistine girmek için giriş yapmalısın." />;
  }

  if (loading) {
    return <p className="race-hint">Yükleniyor…</p>;
  }

  if (room && room.id !== dismissedRoomId) {
    return (
      <RaceRoom
        room={room}
        myUid={user.uid}
        onDismissFinished={() => setDismissedRoomId(room.id)}
      />
    );
  }

  return <RaceLobby myUid={user.uid} />;
}
