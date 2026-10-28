// SADECE önizleme (v135): yeni Sixtagram — alt sekmeler, hikâyeler, takip, medya, profil
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import { SocialProvider } from '../src/contexts/SocialContext';
import PhoneScreen from '../src/components/Phone/PhoneScreen';
import { fakeDb, houses, shop } from './mocks/backend.js';
import { emptySong } from '../functions/songData.js';
import '../src/index.css';
import '../src/styles/theme.css';

const ME = 'previewAdmin';
const it = (i, k, x, z) => ({ i, k, x, z, r: 0, c: 0, p: 1 });
window.__db = fakeDb;
const now = Date.now();
const av = (o) => ({ gender: 'erkek', hairStyle: 'short', clothColor: '#1d3d5c', ...o });
const PEOPLE = [
  ['u1', 'Elif Yılmaz', av({ gender: 'kadin', hairStyle: 'long', clothColor: '#8a1d1d' }), 120],
  ['u2', 'Can Demir', av({ clothColor: '#2f8f4f' }), 40],
  ['u3', 'Zeynep Kaya', av({ gender: 'kadin', hairStyle: 'bun', clothColor: '#7a3fa0' }), 300],
  ['u4', 'Mert Aydın', av({ clothColor: '#e8742a' }), 5],
];
(async () => {
  for (const [uid, n, a, f] of PEOPLE) {
    await fakeDb.doc(`users/${uid}`).set({ displayName: n, avatar: a, gold: 2_000_000 });
    await fakeDb.doc(`sixtagramProfiles/${uid}`).set({ displayName: n, avatar: a, followerCount: f, followingCount: 3, totalLikes: f * 3 });
  }
  await fakeDb.doc(`users/${ME}`).set({ avatar: av({ clothColor: '#222', acc: { aura: 'fire' } }) }, { merge: true });
  await fakeDb.doc(`sixtagramProfiles/${ME}`).set({ displayName: 'Önizleme Admin', followerCount: 2, followingCount: 1, totalLikes: 57 });
  await fakeDb.doc(`sixtagramUserLikes/${ME}`).set({ postIds: {}, following: { u3: { n: 'Zeynep Kaya', ms: now - 5e5 } }, followers: { u1: { n: 'Elif Yılmaz', ms: now - 9e5 }, u2: { n: 'Can Demir', ms: now - 3e5 } } });
  // gerçek ev fotoğrafı (hikâye) için iki ev
  const mk = async (uid, name, items) => {
    const { houseId } = await houses.houseAction({ auth: { uid }, data: { op: 'buy', name } });
    await fakeDb.doc(`houses/${houseId}`).set({ items }, { merge: true });
    return houseId;
  };
  const h1 = await mk('u3', 'Zeynep Kafe', [it('a', 'cafetable', 0, 0), it('b', 'plantb', 1.5, -1), it('c', 'neon2', 0, -3)]);
  const h2 = await mk('u1', 'Elif Atölye', [it('a', 'easel', 0, -1), it('b', 'painttable', 1.5, 0), it('c', 'dropcloth', 0, 0)]);
  const photo = (houseId, name, people, overlay) => ({
    type: 'housePhoto', houseId, houseName: name, vert: true,
    design: { items: [], wall: null, floor: null },
    people,
    cam: { px: 0, py: 1.6, pz: 3.6, dx: 0, dy: -0.2, dz: -1, fov: 58, a: 0.5, cw: 400 },
    ...(overlay ? { overlay } : {}),
  });
  const des = async (h) => (await fakeDb.doc(`houses/${h}`).get()).data().items;
  const p1 = photo(h1, 'Zeynep Kafe', [{ uid: 'u3', displayName: 'Zeynep Kaya', avatar: PEOPLE[2][2], x: 0, z: 1 }], { texts: [{ t: 'Pazar kahvesi ☕', x: 500, y: 300, c: 1, s: 2, b: 1 }], strokes: [{ c: 5, s: 1, p: [200, 1400, 300, 1350, 400, 1420, 500, 1360] }] });
  p1.design.items = await des(h1);
  const p2 = photo(h2, 'Elif Atölye', [{ uid: 'u1', displayName: 'Elif Yılmaz', avatar: PEOPLE[0][2], x: 0.8, z: 1 }], { texts: [{ t: 'Yeni tablo yolda!', x: 500, y: 1500, c: 6, s: 1, b: 0 }], strokes: [] });
  p2.design.items = await des(h2);
  const post = (id, uid, n, a, extra) => fakeDb.doc(`sixtagramPosts/${id}`).set({ uid, authorName: n, authorAvatar: a, text: '', attachment: null, likeCount: 0, commentCount: 0, createdAtMs: now - 6e5, expiresAtMs: now + 8e7, ...extra });
  await post('s1', 'u3', 'Zeynep Kaya', PEOPLE[2][2], { attachment: p1, story: true, viewers: [], authorFollowers: 300 });
  await post('s2', 'u1', 'Elif Yılmaz', PEOPLE[0][2], { attachment: p2, story: true, viewers: [ME], authorFollowers: 120 });
  await post('s3', 'u2', 'Can Demir', PEOPLE[1][2], { attachment: { ...p1, overlay: null }, story: true, viewers: [], authorFollowers: 40 });
  await post('s4', ME, 'Önizleme Admin', null, { attachment: p2, story: true, viewers: ['u1', 'u2', 'u3'], authorFollowers: 2 });
  await post('t1', 'u4', 'Mert Aydın', PEOPLE[3][2], { text: 'Bugün limanda 3 konteyner indirdik, yorgunum ama mutluyum 😅', likeCount: 12 });
  await post('t2', 'u3', 'Zeynep Kaya', PEOPLE[2][2], { text: 'Borcumu kapattım!', attachment: { type: 'debt', amount: 0 }, likeCount: 31 });
  await post('t3', 'u2', 'Can Demir', PEOPLE[1][2], { text: 'Param hazır 💰', attachment: { type: 'gold', amount: 1250000 }, likeCount: 4 });
  const s = emptySong();
  s.title = 'Neon Gece';
  s.pats[0].d[0] = 0b0001000100010001;
  await post('m1', 'u1', 'Elif Yılmaz', PEOPLE[0][2], { attachment: s, plays: 4 });
  await post('m2', 'u3', 'Zeynep Kaya', PEOPLE[2][2], { text: 'Kanalımıza konuk oldum', attachment: { type: 'interview', locationId: 'haber', text: 'Merhaba Neon Şehir! Bugün liman ekonomisini konuşacağız. Konteyner fiyatları yükseliyor. Herkese iyi yayınlar.', avatar: PEOPLE[2][2], displayName: 'Zeynep Kaya', houseId: h1, channel: 'Zeynep TV', channelEmoji: '📺' }, tips: 500 });
  await post('m3', 'u1', 'Elif Yılmaz', PEOPLE[0][2], { attachment: { type: 'drawing', bg: 1, strokes: [{ c: 4, s: 2, p: [200, 200, 400, 400, 600, 300, 800, 700] }, { c: 9, s: 1, p: [100, 800, 900, 820] }], houseId: h2, atelier: 'Elif Atölye' } });
  await fakeDb.collection(`users/${ME}/sixtagramNotifications`).doc('n1').set({ type: 'follow', fromUid: 'u2', fromName: 'Can Demir', read: false, createdAtMs: now - 1e5 });
  await fakeDb.collection(`users/${ME}/sixtagramNotifications`).doc('n2').set({ type: 'tip', fromUid: 'u1', fromName: 'Elif Yılmaz', amount: 500, what: 'resmine', postId: 'm3', textPreview: 'Harika!', read: false, createdAtMs: now - 2e5 });
  window.__shop = shop;
  const W = new URLSearchParams(location.search).get('w') || 390;
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <SocialProvider>
          <div style={{ width: Number(W), height: '100vh', position: 'relative', background: '#000' }}>
            <PhoneScreen initialApp="sixtagram" onClose={() => {}} />
          </div>
        </SocialProvider>
      </BlocksProvider>
    </AuthProvider>
  );
})();
