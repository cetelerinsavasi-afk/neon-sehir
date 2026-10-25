// SADECE önizleme (v128): Şampiyona — arabalarım + ödül merdiveni + günün / tüm zamanlar listesi
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import ChampionshipScreen from '../src/components/RaceTrackScreen/ChampionshipScreen';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

const dk = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = dk(new Date());
fakeDb.doc('vehicles/v1').set({ ownerId: PREVIEW_UID, catalogId: 10, model: 'Üstün Cabrio', lifeDays: 20, raceLevel: 2 });
fakeDb.doc('vehicles/v2').set({ ownerId: PREVIEW_UID, catalogId: 1, model: 'Klasik Tur Arabası', lifeDays: 20 });
fakeDb.doc('vehicles/v3').set({ ownerId: PREVIEW_UID, catalogId: 1, model: 'Klasik Tur Arabası', customName: 'Gri Şimşek', lifeDays: 20 });
fakeDb.doc('vehicles/v4').set({ ownerId: PREVIEW_UID, catalogId: 6, model: 'Klasik Muscle Car', lifeDays: 20, champDay: today });
const names = ['Pouncher', 'Kara Murat', 'Ayşe', 'Ali', 'Cengo', 'Mert', 'Deniz', 'Zeynep', 'Hakan', 'Elif', 'Burak', 'Selin', 'Okan', 'Ece', 'Kaan', 'Mina', 'Tolga', 'Nil', 'Arda'];
const cars = ['Üstün Cabrio', 'GT Yarış Arabası', 'Track-Spec Süper Spor', 'Lüks GT Coupe', 'Klasik Muscle Car'];
const entries = {};
names.forEach((n, i) => {
  const timeMs = 26317 + i * 1650;
  entries[`u${i}`] = { name: n, vehicleModel: cars[i % cars.length], timeMs, prize: 0, at: i };
});
entries[PREVIEW_UID] = { name: 'Ben', vehicleModel: 'Klasik Tur Arabası', timeMs: 55345, prize: 0, at: 99 };
import('../functions/championshipPrizes.js').then(({ championshipTimePrize }) => {
  Object.values(entries).forEach((e) => (e.prize = championshipTimePrize(e.timeMs)));
  fakeDb.doc(`championshipBoard/${today}`).set({ dateKey: today, runs: 20, entries, paidBy: { [PREVIEW_UID]: 21000 } });
  fakeDb.doc('championshipBoard/allTime').set({
    top: names.slice(0, 10).map((n, i) => ({ uid: `a${i}`, name: n, vehicleModel: cars[i % cars.length], timeMs: 24810 + i * 700, prize: championshipTimePrize(24810 + i * 700), dateKey: '2026-10-25', at: i })),
  });
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <ChampionshipScreen onEnterRace={() => {}} />
      </div>
    </AuthProvider>
  );
});
