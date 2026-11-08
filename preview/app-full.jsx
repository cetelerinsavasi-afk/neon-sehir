// SADECE önizleme: oyunun TAMAMI (App) sahte Firebase ile — şehir entegrasyonu testi.
// ?uid=xyz → ikinci oyuncu (aynı tarayıcıda iki sekme = çevrimiçi test)
import '../src/lib/serverClock.js';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import App from '../src/App.jsx';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';

const uid = new URLSearchParams(location.search).get('uid') || PREVIEW_UID;
const av = uid === PREVIEW_UID
  ? { gender: 'erkek', hairStyle: 'slick', hairColor: '#1a120c', clothing: 'leather', clothColor: '#14151a', neckAcc: 'chain', pet: { id: 'golden', leash: true, leashColor: '#22d3ee' }, acc: { aura: 'fire' } }
  : { gender: 'kadin', hairStyle: 'long', hairColor: '#7a1f2b', clothing: 'hawaii', clothColor: '#db2777', pet: { id: 'papagan' } };
fakeDb.doc(`users/${uid}`).set({ displayName: uid === PREVIEW_UID ? 'Haluk Levent' : `Oyuncu ${uid}`, avatar: av, gold: 250000 }, { merge: true });
[10, 1, 3, 8].forEach((c) => fakeDb.doc(`vehicles/${uid}_v${c}`).set({ ownerId: uid, catalogId: c, lifeDays: 30 }));
createRoot(document.getElementById('root')).render(<App />);
