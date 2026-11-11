// v147 — şehir fotoğrafı: RTDB ile doğrulama + imza + paylaşım
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityPhoto, cityCellOf } from '../cityPhoto.js';

class HttpsError extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
}
function setup({ rtdbData = {}, users = {}, t = 1_000_000 } = {}) {
  const store = new Map();
  const doc = (path) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (v) => store.set(path, v),
  });
  const db = {
    collection: (c) => ({ doc: (id) => doc(`${c}/${id}`) }),
    getAll: async (...refs) => refs.map((r) => ({ exists: Boolean(users[r.path.split('/')[1]]), data: () => users[r.path.split('/')[1]] })),
  };
  const get = (path) => path.split('/').reduce((o, k) => (o == null ? undefined : o[k]), rtdbData);
  const rtdb = async () => ({ ref: (p) => ({ get: async () => ({ val: () => get(p) ?? null }) }) });
  const spoken = [];
  const cp = createCityPhoto({
    db,
    rtdb,
    HttpsError,
    assertCanSpeak: async (uid, text) => {
      if (/küfür/.test(text)) throw new HttpsError('invalid-argument', 'x');
      spoken.push(text);
    },
    isProduct: (k) => k === 'cay',
    now: () => t,
  });
  return { cp, spoken };
}
const cam = { px: 10, py: 3, pz: 14, dx: 0, dy: -0.2, dz: -1, fov: 60, a: 0.5, cw: 400 };

test('v147 şehir fotoğrafı: sadece şehirdeki yakın oyuncular, ad/avatar sunucudan, balonlar doğrulanır', async () => {
  const t = 1_000_000;
  const cell = cityCellOf(10, 10);
  const { cp } = setup({
    t,
    rtdbData: {
      city: {
        p: { [cell]: { me: { x: 10, z: 10, t: t - 1000 }, ali: { x: 12, z: 9, t: t - 2000 }, eski: { x: 11, z: 11, t: t - 120_000 } } },
        c: { [cell]: { me: { v: 3, x: 8, z: 10, t: t - 5000 } } },
        m: { [cell]: { ali: { x: 'selam', t: t - 3000 } } },
      },
    },
    users: { me: { displayName: 'Ben', avatar: { skin: '#111' } }, ali: { displayName: 'Ali', avatar: { skin: '#222' } }, uzak: { displayName: 'Uzak' } },
  });
  const r = await cp.photoShot('me', {
    cam,
    people: [
      { uid: 'me', x: 10, z: 10, says: ['merhaba'], h: 'cay', c: 'me', k: 0 },
      { uid: 'ali', x: 12, z: 9, says: ['sahte söz', 'selam'], n: 'Sahte Ad', a: { skin: '#fff' } },
      { uid: 'eski', x: 11, z: 11 },
      { uid: 'uzak', x: 200, z: 200 },
    ],
    cars: [{ o: 'me', v: 3, x: 8, z: 10, r: 1 }, { o: 'ali', v: 5, x: 13, z: 9 }],
  });
  const ids = r.att.people.map((p) => p.uid);
  assert.deepEqual(ids, ['me', 'ali']);
  const ali = r.att.people[1];
  assert.equal(ali.n, 'Ali');
  assert.deepEqual(ali.a, { skin: '#222' });
  assert.deepEqual(ali.says, ['selam'], 'sadece gerçek son mesaj');
  assert.deepEqual(r.att.people[0].says, ['merhaba']);
  assert.equal(r.att.people[0].h, 'cay');
  assert.equal(r.att.people[0].c, 'me');
  assert.deepEqual(r.att.cars.map((c) => c.o), ['me'], 'RTDB kaydı olmayan araba girmez');
  // paylaşım: imza doğru → aynı ek; hikâye/gönderi
  const story = await cp.buildAttachment('me', { shot: r.shot, sig: r.sig });
  assert.deepEqual(story.people, r.att.people);
  const post = await cp.buildAttachment('me', { shot: r.shot, sig: r.sig, asPost: true });
  assert.equal(post.sq, true);
  // başkası paylaşamaz, değiştirilmiş kare reddedilir
  await assert.rejects(cp.buildAttachment('ali', { shot: r.shot, sig: r.sig }));
  await assert.rejects(cp.buildAttachment('me', { shot: r.shot.replace('Ali', 'Veli'), sig: r.sig }));
});

test('v147 şehir fotoğrafı: kaydın yoksa sadece sen, kendi uygunsuz balonun girmez', async () => {
  const t = 2_000_000;
  const { cp } = setup({ t, rtdbData: {}, users: { me: { displayName: 'Ben' } } });
  // v147.1: kaydın yoksa da çekilir (sadece sen)
  const solo = await cp.photoShot('me', { cam, people: [{ uid: 'me', x: 10, z: 10 }, { uid: 'ali', x: 11, z: 10 }] });
  assert.deepEqual(solo.att.people.map((p) => p.uid), ['me']);
  const cell = cityCellOf(10, 10);
  const s2 = setup({ t, rtdbData: { city: { p: { [cell]: { me: { x: 10, z: 10, t } } } } }, users: { me: { displayName: 'Ben' } } });
  const r = await s2.cp.photoShot('me', { cam, people: [{ uid: 'me', x: 10, z: 10, says: ['küfür'] }] });
  assert.equal(r.att.people[0].says, undefined);
  await assert.rejects(s2.cp.photoShot('me', { cam: { ...cam, px: 300 }, people: [{ uid: 'me', x: 10, z: 10 }] }), /kamera/);
});

test('v154 şehir fotoğrafı: giden arabada çekilen karede şoför + yolcu arabada kalır, yön sarılır', async () => {
  const t = 1_000_000;
  const cell = cityCellOf(10, 10);
  // RTDB'de kayıt 32 m geride (sunucu okuyana kadar araba ilerledi), hız 25 m/s
  const { cp } = setup({
    t,
    rtdbData: {
      city: {
        p: { [cell]: { me: { x: 10, z: -22, t: t - 300 }, ali: { x: 10, z: -22, t: t - 300 } } },
        c: { [cell]: { me: { v: 3, x: 10, z: -22, s: 25, t: t - 300 } } },
      },
    },
    users: { me: { displayName: 'Ben' }, ali: { displayName: 'Ali' } },
  });
  const r = await cp.photoShot('me', {
    cam,
    people: [{ uid: 'me', x: 10, z: 10, c: 'me', k: 0 }, { uid: 'ali', x: 10.6, z: 10, c: 'me', k: 1 }],
    cars: [{ o: 'me', v: 3, x: 10, z: 10, r: 63.2 }],
  });
  assert.deepEqual(r.att.cars.map((c) => c.o), ['me']);
  assert.ok(Math.abs(r.att.cars[0].r - Math.atan2(Math.sin(63.2), Math.cos(63.2))) < 0.002, 'sınırsız yön (-π, π] aralığına sarılır');
  assert.deepEqual(r.att.people.map((p) => [p.uid, p.c, p.k]), [['me', 'me', 0], ['ali', 'me', 1]]);
});

test('v154 şehir fotoğrafı: duran arabanın kaydı uzaktaysa yine reddedilir (hız payı yok)', async () => {
  const t = 1_000_000;
  const cell = cityCellOf(10, 10);
  const { cp } = setup({
    t,
    rtdbData: { city: { p: { [cell]: { me: { x: 10, z: 10, t: t - 300 } } }, c: { [cell]: { me: { v: 3, x: 10, z: -22, s: 0, t: t - 300 } } } } },
    users: { me: { displayName: 'Ben' } },
  });
  const r = await cp.photoShot('me', { cam, people: [{ uid: 'me', x: 10, z: 10, c: 'me' }], cars: [{ o: 'me', v: 3, x: 10, z: 10 }] });
  assert.deepEqual(r.att.cars, []);
  assert.equal(r.att.people[0].c, undefined);
});

test('v154 şehir fotoğrafı: maç anı (futbolcular + top) temizlenip ekte taşınır', async () => {
  const t = 1_000_000;
  const cell = cityCellOf(10, 10);
  const { cp } = setup({ t, rtdbData: { city: { p: { [cell]: { me: { x: 10, z: 10, t: t - 300 } } } } }, users: { me: { displayName: 'Ben' } } });
  const r = await cp.photoShot('me', {
    cam,
    people: [{ uid: 'me', x: 10, z: 10 }],
    fb: {
      hc: '#112233',
      ac: 'red; drop',
      p: [[0, 0, 12, 14, 1, 1, 0], [1, 3, 15, 16, 0, 0, 1], [1, 3, 15, 16], [0, 9, 1, 1], [0, 2, 400, 400], 'x'],
      r: [11, 12, 0, 1, 0],
      b: [12.5, 0.4, 13.123],
    },
  });
  assert.deepEqual(r.att.fb, { hc: '#112233', ac: '#19e8ff', p: [[0, 0, 12, 14, 1, 1, 0], [1, 3, 15, 16, 0, 0, 1]], r: [11, 12, 0, 1, 0], b: [12.5, 0.4, 13.12] });
  const r2 = await cp.photoShot('me', { cam, people: [{ uid: 'me', x: 10, z: 10 }], fb: { p: [] } });
  assert.equal(r2.att.fb, undefined);
});
