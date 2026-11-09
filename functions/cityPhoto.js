// =============================================================================
// v147 — Gezilebilir şehirde fotoğraf (Sixtagram 'cityPhoto' eki).
//
// Evlerdeki gibi GÖRSEL YÜKLENMEZ: deklanşöre basınca istemci o anki sahneyi
// (kamera + görünen oyuncular + arabalar) gönderir; sunucu bunu şehrin
// Realtime Database kayıtlarıyla doğrulayıp HMAC ile imzalar (cityPhotoShot).
// Paylaşımda imza doğrulanır → paylaşılan fotoğraf, çekilen kareyle BİREBİR aynı.
// Her cihaz sahneyi şehir motoruyla yeniden çizer.
//
// Güvenlik:
//   • Fotoğrafta sadece o an şehirde (RTDB city/p, son 60 sn) ve çekilen yere
//     yakın olan oyuncular bulunabilir — kimse başkasını sahte bir kareye koyamaz.
//   • Ad + avatar istemciden ALINMAZ; users/{uid} belgesinden okunur.
//   • Başkasının balonu sadece RTDB'deki gerçek son mesajıysa (city/m) görünür;
//     kendi balonun küfür süzgecinden geçer.
//   • Arabalar RTDB city/c kaydıyla (sahip + model + konum) eşleşmeli.
// Maliyet: çekim başına ≤ 12 Firestore okuması (users) + birkaç küçük RTDB okuması.
// =============================================================================
import { sanitizeOverlay, overlayText } from './photoOverlay.js';

export const CITY_CELL = 64;
const CELL_OFF = 192;
export const cityCellOf = (x, z) => `${Math.max(0, Math.floor((x + CELL_OFF) / CITY_CELL))}_${Math.max(0, Math.floor((z + CELL_OFF) / CITY_CELL))}`;
const MAX_PEOPLE = 12;
const MAX_CARS = 8;
const SHOT_MAX_AGO_MS = 10 * 60 * 1000;
const FRESH_P_MS = 60_000;
const FRESH_C_MS = 10 * 60_000;
const FRESH_M_MS = 30_000;
const NEAR_P = 20; // m — çekimdeki konum ile RTDB kaydı arası en fazla
const NEAR_C = 25;
const EMOTE_KEYS = ['dans', 'selam', 'alkis', 'zipla', 'kalp'];
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// v147.1: oyunun veritabanı adresi önce (FIREBASE_CONFIG'teki adres europe-west1
// örneği için yanlış olabiliyordu → kayıtlar bulunamıyor, "şehirde olmalısın" hatası)
export const CITY_RTDB_DEFAULT = 'https://neon-sehir-default-rtdb.europe-west1.firebasedatabase.app';
export function cityRtdbUrl() {
  return process.env.CITY_RTDB_URL || CITY_RTDB_DEFAULT;
}

// Kamera pozu (houses.js camOf ile aynı alanlar)
export function cleanCam(c) {
  if (!c || typeof c !== 'object') return null;
  const px = num(c.px, -450, 450);
  const py = num(c.py, -5, 400);
  const pz = num(c.pz, -450, 450);
  let dx = num(c.dx, -1, 1);
  let dy = num(c.dy, -1, 1);
  let dz = num(c.dz, -1, 1);
  if ([px, py, pz, dx, dy, dz].some((v) => v === null)) return null;
  const l = Math.hypot(dx, dy, dz);
  if (l < 0.2) return null;
  dx /= l;
  dy /= l;
  dz /= l;
  return { px: r2(px), py: r2(py), pz: r2(pz), dx: r3(dx), dy: r3(dy), dz: r3(dz), fov: r2(num(c.fov, 20, 100) ?? 60), a: r3(num(c.a, 0.4, 2.5) ?? 1), cw: Math.round(num(c.cw, 200, 2000) ?? 400), ...(c.td ? { td: 1 } : {}) };
}

// deps: { db, rtdb: () => Promise<Database>, HttpsError, assertCanSpeak, isProduct(key), now? }
export function createCityPhoto({ db, rtdb, HttpsError, assertCanSpeak, isProduct = () => false, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const cryptoP = () => import('node:crypto');
  let keyP = null;
  const shotKey = () =>
    (keyP ||= db
      .collection('serverKeys')
      .doc('cityPhoto')
      .get()
      .then(async (d) => {
        const k = d.exists && typeof d.data()?.k === 'string' ? d.data().k : null;
        if (k) return k;
        const nk = (await cryptoP()).randomBytes(32).toString('hex');
        await db.collection('serverKeys').doc('cityPhoto').set({ k: nk });
        return nk;
      })
      .catch((e) => {
        keyP = null;
        throw e;
      }));
  const sign = async (body) => (await cryptoP()).createHmac('sha256', await shotKey()).update(body).digest('hex');

  // 3×3 hücre komşuluğunun RTDB kayıtları (p: konum, c: araba, m: son mesaj)
  async function readCells(cx, cz) {
    const [a, b] = cityCellOf(cx, cz).split('_').map(Number);
    const cells = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (a + i >= 0 && b + j >= 0) cells.push(`${a + i}_${b + j}`);
    const d = await rtdb();
    const out = { p: new Map(), c: new Map(), m: new Map() };
    await Promise.all(
      ['p', 'c', 'm'].flatMap((k) =>
        cells.map(async (cell) => {
          const v = (await d.ref(`city/${k}/${cell}`).get()).val() || {};
          Object.entries(v).forEach(([id, rec]) => {
            if (!rec || typeof rec !== 'object') return;
            const cur = out[k].get(id);
            if (!cur || Number(rec.t || 0) > Number(cur.t || 0)) out[k].set(id, rec);
          });
        })
      )
    );
    return out;
  }

  // Deklanşör: sahneyi doğrula + imzala (Firestore'a YAZILMAZ)
  async function photoShot(uid, p) {
    const cam = cleanCam(p?.cam);
    if (!cam) fail('invalid-argument', 'Geçersiz kamera.');
    const t = now();
    const reqPeople = Array.isArray(p?.people) ? p.people.slice(0, 40) : [];
    const me = reqPeople.find((q) => q && q.uid === uid);
    const mx = num(me?.x, -450, 450);
    const mz = num(me?.z, -450, 450);
    if (mx === null || mz === null) fail('invalid-argument', 'Fotoğrafta sen yoksun.');
    let rt;
    try {
      rt = await readCells(mx, mz);
    } catch (e) {
      console.error('cityPhotoShot rtdb', e);
      rt = { p: new Map(), c: new Map(), m: new Map() };
    }
    const fresh = (rec, ms) => rec && typeof rec.x === 'number' && typeof rec.z === 'number' && t - Number(rec.t || 0) <= ms;
    if (Math.hypot(cam.px - mx, cam.pz - mz) > 60) fail('invalid-argument', 'Geçersiz kamera.');
    // v147.1: kendi kaydın bulunamasa da (bağlantı anlık koptu vb.) fotoğraf çekilir —
    // sadece sen + doğrulanabilen kişiler/arabalar görünür (başkası sahte kareye giremez)
    const myRec = rt.p.get(uid);
    if (!fresh(myRec, FRESH_P_MS) || Math.hypot(myRec.x - mx, myRec.z - mz) > NEAR_P) rt.p.set(uid, { x: mx, z: mz, t });

    // arabalar
    const cars = [];
    const carOwners = new Set();
    (Array.isArray(p?.cars) ? p.cars.slice(0, 20) : []).forEach((c) => {
      if (!c || typeof c.o !== 'string' || !UID_RE.test(c.o) || carOwners.has(c.o) || cars.length >= MAX_CARS) return;
      const x = num(c.x, -450, 450);
      const z = num(c.z, -450, 450);
      const v = Number(c.v);
      const rec = rt.c.get(c.o);
      if (x === null || z === null || !Number.isInteger(v) || v < 1 || v > 10) return;
      if (!fresh(rec, FRESH_C_MS) || Number(rec.v) !== v || Math.hypot(rec.x - x, rec.z - z) > NEAR_C) return;
      carOwners.add(c.o);
      cars.push({ o: c.o, v, x: r2(x), z: r2(z), y: r2(num(c.y, -2, 20) ?? 0), r: r3(num(c.r, -50, 50) ?? 0), st: r2(num(c.st, -1, 1) ?? 0) });
    });

    // kişiler
    const picked = [];
    const seen = new Set();
    for (const q of reqPeople) {
      if (picked.length >= MAX_PEOPLE) break;
      if (!q || typeof q.uid !== 'string' || !UID_RE.test(q.uid) || seen.has(q.uid)) continue;
      const rec = rt.p.get(q.uid);
      const x = num(q.x, -450, 450);
      const z = num(q.z, -450, 450);
      if (x === null || z === null || !fresh(rec, FRESH_P_MS) || Math.hypot(rec.x - x, rec.z - z) > NEAR_P) continue;
      seen.add(q.uid);
      const em = q.e && EMOTE_KEYS.includes(q.e.k) && num(q.e.at, 0, 3200) !== null ? { k: q.e.k, at: Math.round(q.e.at) } : null;
      const car = typeof q.c === 'string' && carOwners.has(q.c) ? { c: q.c, k: Math.round(num(q.k, 0, 3) ?? 0) } : {};
      const said = Array.isArray(q.says) ? q.says.filter((s) => typeof s === 'string').slice(-2) : [];
      picked.push({
        uid: q.uid,
        x: r2(x),
        z: r2(z),
        y: r2(num(q.y, -2, 20) ?? 0),
        l: q.l ? 1 : 0,
        m: q.m ? 1 : 0,
        wp: q.wp ? 1 : 0,
        ...(num(q.sy, -1, 5) !== null && !car.c ? { sy: r2(q.sy) } : {}),
        ...car,
        ...(em ? { e: em } : {}),
        ...(typeof q.h === 'string' && isProduct(q.h) ? { h: q.h } : {}),
        ...(num(q.px, -450, 450) !== null && num(q.pz, -450, 450) !== null && Math.hypot(q.px - x, q.pz - z) < 4 ? { px: r2(q.px), pz: r2(q.pz) } : {}),
        said,
      });
    }
    if (!seen.has(uid)) fail('invalid-argument', 'Fotoğraf çekilemedi, tekrar dene.');

    // balonlar: kendi sözün küfür süzgecinden; başkasınınki sadece gerçek son mesajıysa
    for (const q of picked) {
      const said = q.said.map((s) => s.trim().slice(0, 200)).filter(Boolean);
      delete q.said;
      if (!said.length) continue;
      if (q.uid === uid) {
        try {
          await assertCanSpeak(uid, said.join(' · '));
          q.says = said;
        } catch {
          /* uygunsuz söz fotoğrafa girmez */
        }
        continue;
      }
      const msg = rt.m.get(q.uid);
      if (msg && typeof msg.x === 'string' && t - Number(msg.t || 0) <= FRESH_M_MS && said.includes(msg.x.trim().slice(0, 200))) q.says = [msg.x.trim().slice(0, 200)];
    }

    // ad + avatar sunucudan (istemciden alınmaz)
    const snaps = await db.getAll(...picked.map((q) => db.collection('users').doc(q.uid)));
    snaps.forEach((s, i) => {
      const u = s.exists ? s.data() : {};
      picked[i].n = String(u.displayName || 'Oyuncu').slice(0, 40);
      picked[i].a = u.avatar || null;
    });

    const att = { type: 'cityPhoto', cam, people: picked, cars, vert: true };
    const body = JSON.stringify({ uid, at: t, att });
    if (body.length > 120_000) fail('resource-exhausted', 'Fotoğraf çok kalabalık.');
    return { shot: body, sig: await sign(body), att };
  }

  async function verify(uid, a) {
    if (typeof a?.shot !== 'string' || typeof a?.sig !== 'string' || a.shot.length > 130_000 || !/^[0-9a-f]{64}$/.test(a.sig)) return null;
    try {
      const { timingSafeEqual } = await cryptoP();
      const want = Buffer.from(await sign(a.shot), 'hex');
      const got = Buffer.from(a.sig, 'hex');
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      const s = JSON.parse(a.shot);
      if (s?.uid !== uid || s?.att?.type !== 'cityPhoto' || !(now() - Number(s.at) <= SHOT_MAX_AGO_MS)) return null;
      return s.att;
    } catch {
      return null;
    }
  }

  // Paylaşım (createSixtagramPost › buildSixtagramAttachment)
  async function buildAttachment(uid, a) {
    const att = await verify(uid, a);
    if (!att) fail('failed-precondition', 'Fotoğrafın süresi doldu, tekrar çek.');
    if (a?.asPost === true) return { ...att, sq: true };
    const ov = sanitizeOverlay(a?.overlay);
    if (ov.error) fail('invalid-argument', ov.error);
    const text = overlayText(ov.overlay);
    if (text) await assertCanSpeak(uid, text);
    return { ...att, ...(ov.overlay ? { overlay: ov.overlay } : {}) };
  }

  return { photoShot, buildAttachment, verify };
}
