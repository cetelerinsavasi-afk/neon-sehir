// SADECE önizleme (v78): Bahisli yarış lobisi (açık odalar)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import RaceLobby from '../src/components/RaceTrackScreen/RaceLobby';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';
import '../src/styles/theme.css';

fakeDb.doc('vehicles/v1').set({ ownerId: PREVIEW_UID, catalogId: 3, model: 'Pickup', lifeDays: 20, gearUpgraded: true });
fakeDb.doc('vehicles/v2').set({ ownerId: PREVIEW_UID, catalogId: 7, model: 'Lüks GT Coupe', lifeDays: 20 });
fakeDb.doc('raceRooms/r1').set({ status: 'waiting', engine: 'ta', betAmount: 5000, creatorUid: 'u1', players: { u1: { displayName: 'Kara Murat', vehicleModel: 'GT Yarış Arabası', catalogId: 9, level: 2 } } });
fakeDb.doc('raceRooms/r2').set({ status: 'waiting', engine: 'ta', betAmount: 1200, creatorUid: 'u2', players: { u2: { displayName: 'Ayşe', vehicleModel: 'Şehir Hatchback', catalogId: 2, level: 1 } } });
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <RaceLobby myUid={PREVIEW_UID} onEnterRoom={(id) => console.log('enter', id)} />
  </AuthProvider>
);
