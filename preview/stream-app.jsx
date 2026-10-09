// SADECE önizleme (v80): Yayıncılık. ?s=host → sen yayıncısın (evinde set var,
// koltuğa otur → Yayın aç). ?s=viewer → Misafir Ali kafesinde yayında, sen izlersin.
// ?r=N → koltuğun yönü (test). ?cafe=1 → set bir internet kafede (dakika ücreti).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import HouseHub from '../src/components/HouseScreen/HouseHub';
import LiveStreamsButton from '../src/components/Stream/LiveStreamsButton';
import StreamViewer from '../src/components/Stream/StreamViewer';
import { fakeDb, houses, stream } from './mocks/backend.js';
import * as streamShared from '../src/components/Stream/streamShared';
import { ARCADE_BY_ID } from '../src/components/Arcade/games/index.js';
import '../src/index.css';
import '../src/styles/theme.css';

window.__streamShared = streamShared;
window.__games = ARCADE_BY_ID;
const q = new URLSearchParams(location.search);
const scenario = q.get('s') || 'viewer';
const rot = Number(q.get('r') ?? 4);
const cafe = q.get('cafe') === '1';
const act = (uid, data) => houses.houseAction({ auth: { uid }, data });
const SET = (extra = []) => [
  { i: 'pc1', k: 'pc', x: 0, z: -5.9, r: 0, c: 0, p: 1 },
  { i: 'ch1', k: 'gamer', x: 0, z: -5.0, r: rot, c: 0, p: 1 },
  { i: 'sofa1', k: 'chester', x: -3, z: 1, r: 0, c: 0, p: 1 },
  { i: 'plant1', k: 'armchair', x: 3.5, z: 2.5, r: 0, c: 0, p: 1 },
  { i: 'tv1', k: 'tvstand', x: 0, z: 6.2, r: 4, c: 0, p: 1 },
  ...extra,
];

function ViewerApp() {
  const [watch, setWatch] = useState(null);
  return (
    <div style={{ minHeight: '100vh', background: '#0b0d14', color: '#fff', padding: 12 }}>
      <p>Ana sayfa (önizleme)</p>
      <LiveStreamsButton className="map-live-btn" onWatch={setWatch} />
      {watch && <StreamViewer streamId={watch} onClose={() => setWatch(null)} />}
    </div>
  );
}

(async () => {
  fakeDb.doc('users/misafir2').set({ gold: 3_000_000, displayName: 'Demir' });
  if (scenario === 'host') {
    const { houseId } = await act('previewAdmin', { op: 'buy', name: 'Benim Stüdyom' });
    await fakeDb.doc(`houses/${houseId}`).set({ items: SET(q.get('wall') === '1' ? [{ i: 'w1', k: 'wall4', x: 0, z: 1, r: 0, c: 0, p: 1 }] : q.get('fridge') === '1' ? [{ i: 'fr1', k: 'drinkfridge', x: 3, z: -6.4, r: 0, c: 0, p: 1 }, { i: 'gc1', k: 'guncab', x: 5, z: -6.6, r: 0, c: 0, p: 1 }] : []), privacy: 'public', ...(cafe ? { biz: { type: 'internet' }, bizType: 'internet' } : {}) }, { merge: true });
    // misafir odada dolaşır → kamerada görünür
    await act('misafir1', { op: 'enter', houseId });
    let t = 0;
    setInterval(() => {
      t += 0.25;
      fakeDb.doc('housePresence/misafir1').set({ x: Math.sin(t / 3) * 3, z: 1 + Math.cos(t / 4) * 2, left: Math.cos(t / 3) < 0, updatedAt: Date.now() }, { merge: true });
    }, 250);
    window.__house = houseId;
    window.__ready = true;
    createRoot(document.getElementById('root')).render(
      <AuthProvider>
        <BlocksProvider>
          <SocialProvider>
            <HouseHub initialHouseId={houseId} onClose={() => console.log('closed')} />
          </SocialProvider>
        </BlocksProvider>
      </AuthProvider>
    );
    return;
  }
  // izleyici: Misafir Ali kendi kafesinde yayında
  const { houseId } = await act('misafir1', { op: 'buy', name: 'Ali’nin Kafesi' });
  await fakeDb.doc(`houses/${houseId}`).set({ items: SET(), privacy: 'public' }, { merge: true });
  await act('misafir1', { op: 'enter', houseId });
  await fakeDb.doc('housePresence/misafir1').set({ x: 0, z: -5.0, seat: { id: 'ch1', idx: 0 }, updatedAt: Date.now() }, { merge: true });
  await act('misafir2', { op: 'enter', houseId });
  let t = 0;
  setInterval(() => {
    t += 0.25;
    fakeDb.doc('housePresence/misafir1').set({ updatedAt: Date.now() }, { merge: true });
    fakeDb.doc('housePresence/misafir2').set({ x: Math.sin(t / 3) * 3, z: 0 + Math.cos(t / 4) * 2, left: Math.cos(t / 3) < 0, updatedAt: Date.now() }, { merge: true });
  }, 250);
  const { streamId } = await stream.action('misafir1', { op: 'start', houseId, chairId: 'ch1', title: 'Gece yayını 🌙 sohbet + oyun' });
  window.__streamId = streamId;
  if (q.get('two') === '1') {
    const h2 = (await act('misafir2', { op: 'buy', name: 'Demir Net' })).houseId;
    await fakeDb.doc(`houses/${h2}`).set({ items: SET(), privacy: 'public' }, { merge: true });
    await act('misafir2', { op: 'enter', houseId: h2 });
    await fakeDb.doc('housePresence/misafir2').set({ houseId: h2, x: 0, z: -5, seat: { id: 'ch1', idx: 0 } }, { merge: true });
    await stream.action('misafir2', { op: 'start', houseId: h2, chairId: 'ch1', title: '' });
  }
  setTimeout(() => stream.action('misafir2', { op: 'chat', streamId, text: 'Selam herkese 👋' }).catch(() => {}), 1500);
  setTimeout(() => stream.action('misafir1', { op: 'chat', streamId, text: 'Hoş geldiniz! Bugün yarış atacağız 🏎️' }).catch(() => {}), 3000);
  setTimeout(() => stream.action('misafir2', { op: 'donate', streamId, amount: 100, note: 'Efsane yayın!' }).catch((e) => console.error(e)), 4500);
  window.__ready = true;
  window.__house = houseId;
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <SocialProvider>
          {q.get('visit') === '1' ? <HouseHub initialHouseId={houseId} onClose={() => console.log('closed')} /> : <ViewerApp />}
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
})().catch((e) => {
  console.error('preview', e);
  document.body.innerHTML = `<pre style="color:#f66">${e.stack || e}</pre>`;
});
