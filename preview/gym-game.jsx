// SADECE önizleme (v77): spor salonu mini oyunlarını 3D sahne olmadan dener.
// Adres: /gym-game.html  — kendi salonunu açar, içine girer, üyelik başlatır ve
// 3 görevi sırayla mini oyun olarak gösterir; sonunda sonuç ekranı.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import GymMiniGame from '../src/components/Gym/GymMiniGame';
import GymResult from '../src/components/Gym/GymResult';
import { fakeDb, houses, shop, PREVIEW_UID } from './mocks/backend.js';
import { BIZ_TYPES } from '../functions/businessCatalogData.js';
import '../src/index.css';
import '../src/styles/theme.css';
import '../src/styles/cues.css';

const call = (api, data) => api({ auth: { uid: PREVIEW_UID }, data });
window.__fakeDb = fakeDb;

function Harness() {
  const [m, setM] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const { houseId } = await call(houses.houseAction, { op: 'buy', bizIntent: 'spor' });
        const items = [];
        BIZ_TYPES.spor.groups.forEach((g, gi) => g.any.slice(0, 1).forEach((k) => { for (let n = 0; n < g.n; n++) items.push({ i: `g${gi}${n}`, k, x: gi, z: n, r: 0, c: 0, p: 1 }); }));
        const ref = fakeDb.doc(`houses/${houseId}`);
        await ref.set({ ...(await ref.get()).data(), items });
        await call(houses.houseAction, { op: 'bizOpen', houseId, type: 'spor' });
        await call(houses.houseAction, { op: 'enter', houseId });
        await call(shop.shopAction, { op: 'gymStart', houseId, expect: 0, position: 'DEF' });
        const snap = await fakeDb.collection('gymMemberships').where('uid', '==', PREVIEW_UID).get();
        setM(snap.docs[0].data());
        window.__ready = true;
      } catch (e) {
        setErr(String(e?.message || e));
      }
    })();
  }, []);
  if (err) return <p style={{ color: 'red' }}>{err}</p>;
  if (!m) return <p>…</p>;
  if (res?.done) return <GymResult result={res} onClose={() => {}} />;
  const eq = m.tasks[m.step];
  return (
    <div style={{ padding: 16 }}>
      <GymMiniGame
        key={m.step}
        equipment={eq}
        onDone={(r) => {
          if (r?.done) setRes(r);
          else setM((x) => ({ ...x, step: x.step + 1 }));
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <Harness />
  </AuthProvider>
);
