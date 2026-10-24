// SADECE önizleme (v124 Faz 7): yayında Casinolar — solda yayıncının paneli, sağda izleyicinin gördüğü.
// /pstream.html?g=rulet|slot  (kare yayın yerine doğrudan izleyici bileşenine verilir)
import { createRoot } from 'react-dom/client';
import { useCallback, useRef } from 'react';
import { AuthProvider } from '../src/contexts/AuthContext';
import { fakeDb } from './mocks/backend.js';
import { CasinoGamesSheet } from '../src/components/Casino/PlayerCasino';
import { StreamCasinoView } from '../src/components/Casino/StreamCasino';
import '../src/index.css';
import '../src/styles/theme.css';
import '../src/components/Stream/Stream.css';

const g = new URLSearchParams(location.search).get('g') || 'rulet';
fakeDb.doc('houses/g1').set({ ownerUid: 'patron', name: 'Altın Saray', biz: { type: 'gazino' }, bizType: 'gazino', bizPrices: { gazino: { slot: 1450, cut: 5 } } });
fakeDb.doc('casinoMachines/g1_slot').set({ casinoId: 'g1', ownerUid: 'patron', m: 'slot', gold: 50_000, yasakliMadde: 9 });
fakeDb.doc('casinoMachines/g1_rulet').set({ casinoId: 'g1', ownerUid: 'patron', m: 'rulet', gold: 90_000 });
function App() {
  const frameRef = useRef(null);
  const onState = useCallback((k, st) => {
    frameRef.current = { g: 'casino', s: JSON.stringify({ k, c: 'Altın Saray', p: 1450, st }) };
  }, []);
  const H = { ownerUid: 'patron', name: 'Altın Saray', biz: { type: 'gazino' }, bizType: 'gazino', bizPrices: { gazino: { slot: 1450, cut: 5 } } };
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div className="st-sheet" style={{ width: 380, maxHeight: 'none' }}>
        <CasinoGamesSheet casinoId="g1" houseDoc={H} initialGame={g} games={['onnumara', 'rulet', 'slot']} onState={onState} />
      </div>
      <div style={{ position: 'relative', width: 380, height: 840, background: '#111' }} id="viewer">
        <StreamCasinoView frameRef={frameRef} />
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
