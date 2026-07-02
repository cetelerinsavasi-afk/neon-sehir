import { useAuth } from '../../contexts/AuthContext';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import RaceLobby from './RaceLobby';
import './RaceTrackScreen.css';

// Aktif bir yarışın (kurdum/katıldım/devam ediyor) tam ekran gösterimi
// artık App.jsx seviyesinde (RaceFullScreen ile) yönetiliyor — bu bileşen
// SADECE lobiyi gösterir. Oda kurulur/katılınır katılınmaz onEnterRace
// çağrılıp App.jsx'e devrediliyor.
export default function RaceTrackScreen({ onEnterRace }) {
  const { user } = useAuth();

  if (!user) {
    return <SignInPrompt message="Yarış pistine girmek için giriş yapmalısın." />;
  }

  return <RaceLobby myUid={user.uid} onEnterRoom={onEnterRace} />;
}
