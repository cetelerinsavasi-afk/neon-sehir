import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyActiveRaceRoom } from '../../hooks/useMyActiveRaceRoom';
import { useRaceRoomById } from '../../hooks/useRaceRoomById';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import RaceLobby from './RaceLobby';
import RaceRoom from './RaceRoom';
import './RaceTrackScreen.css';

export default function RaceTrackScreen() {
  const { user } = useAuth();
  const { room: activeRoom, loading } = useMyActiveRaceRoom();
  const [viewingRoomId, setViewingRoomId] = useState(null);
  const { room: viewingRoom } = useRaceRoomById(viewingRoomId);

  // Bileşen (yeniden) monte olduğunda, henüz bir odaya bakmıyorsak ama
  // gerçekten aktif (waiting/ready/racing) bir odam varsa otomatik ona gir.
  // Bitmiş bir yarışı burada ASLA otomatik geri getirmiyoruz — bu, "her
  // seferinde Lobiye Dön'e basmam gerekiyor" hatasının kaynağıydı.
  useEffect(() => {
    if (!viewingRoomId && activeRoom) {
      setViewingRoomId(activeRoom.id);
    }
  }, [activeRoom, viewingRoomId]);

  if (!user) {
    return <SignInPrompt message="Yarış pistine girmek için giriş yapmalısın." />;
  }

  if (loading) {
    return <p className="race-hint">Yükleniyor…</p>;
  }

  if (viewingRoomId && viewingRoom) {
    return (
      <RaceRoom
        room={viewingRoom}
        myUid={user.uid}
        onDismissFinished={() => setViewingRoomId(null)}
      />
    );
  }

  // roomId doğrudan create/join'den gelir — array-contains sorgusunun
  // sonucunu beklemeden ANINDA o odaya geçiyoruz (kurduğun/katıldığın oda
  // hiç "gözükmeme" gecikmesi yaşamıyor).
  return <RaceLobby myUid={user.uid} onEnterRoom={setViewingRoomId} />;
}
