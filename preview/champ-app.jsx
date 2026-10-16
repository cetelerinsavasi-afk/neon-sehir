// SADECE önizleme (v96): Şampiyona — günün lideri paneli + ilk 3 ödülleri
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import ChampionshipScreen from '../src/components/RaceTrackScreen/ChampionshipScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const dk = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = dk(new Date());
const yest = dk(new Date(Date.now() - 86400000));
fakeDb.doc('vehicles/v1').set({ ownerId: PREVIEW_UID, catalogId: 10, model: 'Üstün Cabrio', lifeDays: 20 });
fakeDb.doc(`championshipDaily/10_${today}`).set({ catalogId: 10, dateKey: today, leaderUid: 'a', leaderName: 'Pouncher', leaderTimeMs: 26317, top: [
  { uid: 'a', name: 'Pouncher', timeMs: 26317 }, { uid: 'b', name: 'Kara Murat', timeMs: 27102 }, { uid: 'c', name: 'Ayşe', timeMs: 28440 }, { uid: 'd', name: 'Ali', timeMs: 30001 },
] });
fakeDb.doc(`championshipDaily/10_${yest}`).set({ catalogId: 10, dateKey: yest, finalized: true, winnerUid: 'x', winnerName: 'Cengo', winnerTimeMs: 25990, winners: [
  { uid: 'x', name: 'Cengo', timeMs: 25990, place: 1, reward: 250000 }, { uid: 'a', name: 'Pouncher', timeMs: 26500, place: 2, reward: 100000 }, { uid: 'y', name: 'Mert', timeMs: 27000, place: 3, reward: 50000 },
] });
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ChampionshipScreen onEnterRace={() => {}} />
  </AuthProvider>
);
