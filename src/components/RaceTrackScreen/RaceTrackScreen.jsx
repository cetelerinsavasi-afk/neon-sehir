import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import RaceLobby, { TrainingLobby } from './RaceLobby';
import ChampionshipScreen from './ChampionshipScreen';
import './RaceTrackScreen.css';

const CARDS = [
  { id: 'championship', label: 'Şampiyona', emoji: '🏆', desc: 'Aracınla tek başına yarış, en az turda bitir, günün ödülünü kap.' },
  { id: 'bet', label: 'Bahisli Yarış', emoji: '🏁', desc: 'Başka bir oyuncuya karşı altın bahsiyle yarış.' },
  { id: 'training', label: 'Antrenman', emoji: '🎓', desc: 'Botlara karşı ücretsiz pratik yap.' },
];

// Aktif bir yarışın (kurdum/katıldım/devam ediyor) tam ekran gösterimi
// artık App.jsx seviyesinde (RaceFullScreen ile) yönetiliyor — bu bileşen
// SADECE lobiyi gösterir. Oda kurulur/katılınır katılınmaz onEnterRace
// çağrılıp App.jsx'e devrediliyor.
export default function RaceTrackScreen({ onEnterRace }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);

  if (!user) {
    return <SignInPrompt message="Yarış pistine girmek için giriş yapmalısın." />;
  }

  if (selected) {
    return (
      <div className="race-detail">
        <button className="race-back-btn" onClick={() => setSelected(null)}>
          ← Geri
        </button>
        {selected === 'championship' && <ChampionshipScreen onEnterRace={onEnterRace} />}
        {selected === 'bet' && <RaceLobby myUid={user.uid} onEnterRoom={onEnterRace} />}
        {selected === 'training' && <TrainingLobby onEnterRoom={onEnterRace} />}
      </div>
    );
  }

  return (
    <div className="race-picker">
      {CARDS.map((c) => (
        <button key={c.id} className="race-picker-card" onClick={() => setSelected(c.id)}>
          <span className="race-picker-emoji">{c.emoji}</span>
          <span className="race-picker-title">{c.label}</span>
          <span className="race-picker-desc">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
