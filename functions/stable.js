// =============================================================================
// v177 — BİNEKLER: at, deve, bisiklet (sunucu + istemci ortak kurallar + satın alma)
// -----------------------------------------------------------------------------
//   • At   → Çamlıca Köyü'nün çobanı / ahırı (köyün ağılında atlar dolaşır)
//   • Deve → Gölyaka Köyü'nün çobanı / ahırı (çöl köyü; ağılda develer)
//   • Bisiklet → kuzeydeki büyük parkın girişindeki seyyar bisikletçi (aşama 5)
//   Galeride satılmaz, modifiye edilmez, 2. elde satılmaz; renk satın alırken seçilir
//   (vehicles/{id}.mods.paint). Fiyat oyunun katalog fiyatı; para oyundan çıkar.
// =============================================================================
import { VEHICLE_CATALOG } from './catalogData.js';
import { compactMods } from './vehicleMods.js';

export const ANIMALS = {
  at: {
    cid: 26,
    icon: '🐎',
    label: 'At',
    seller: 'Çoban Yusuf',
    // doru, yağız, siyah, kır (beyaz), demir kırı, al, kula
    colors: ['#7a4a2a', '#4a2c1a', '#1c1714', '#e9e4da', '#9a9a96', '#b5692e', '#d9b98a'],
  },
  deve: {
    cid: 27,
    icon: '🐪',
    label: 'Deve',
    seller: 'Deveci Halil',
    colors: ['#c9a26b', '#e2c79a', '#a87a48', '#7a5634', '#efe6d6', '#5a4030'],
  },
  bisiklet: {
    cid: 25,
    icon: '🚲',
    label: 'Bisiklet',
    seller: 'Bisikletçi',
    colors: ['#1f8fe0', '#c8141e', '#121214', '#f4f4f2', '#3ad07a', '#f6c400', '#ff2e8c', '#8b5cf6', '#e9651c', '#19e8ff'],
  },
};
export const animalPrice = (kind) => VEHICLE_CATALOG[ANIMALS[kind]?.cid]?.price || 0;
// v177 — KİRALIK BİSİKLET (parktaki bisikletçi): internet kafe dakikası gibi — her dakika peşin
// (100 altın / 60 sn). Bisiklete binili olduğu sürece süre dolunca istemci bir dakika daha alır;
// inmişken süre dolarsa bisiklet kaybolur. Bisiklet Firestore'da araç olmaz (sadece şehirde).
//   users/{uid}.bikeRentUntil (ms) — en fazla 2 dakika ileriye ödenebilir
export const BIKE_RENT = { perMin: 100, slotMs: 60_000, maxAheadMs: 90_000, paint: '#2fb35a' };
// v219 — KAYKAY (aktivite parkındaki büfe): bisiklet gibi dakikalık kira ya da bir kez satın alma.
// users/{uid}.skate = true (sahip) · users/{uid}.skateRentUntil (ms). Araç belgesi yok (sadece şehirde).
// v221: satın alınan kaykayın 20 gün ömrü var (bisiklet gibi) — users/{uid}.skateUntil (ms). v219–v220'de
// alınmış kaykaylar (skate: true, skateUntil yok) için ömür LEGACY_UNTIL'de biter (yazma gerekmez).
export const SKATE = { price: 5000, rentPerMin: 100, slotMs: 60_000, maxAheadMs: 90_000, lifeMs: 20 * 86_400_000, legacyUntil: Date.UTC(2026, 11, 18, 21, 0, 0) };
// kaykayın ömrünün bittiği an (ms); 0 = kaykay yok
export const skateUntilOf = (u) => (u?.skate ? Number(u.skateUntil) || SKATE.legacyUntil : 0);

export function createStable({ db, FieldValue, HttpsError, goldTag, statWrite, newVehicleDoc, dayKey, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const userRef = (uid) => db.collection('users').doc(uid);
  // { kind: 'at' | 'deve' | 'bisiklet', paint, expect }
  async function animalBuy(uid, p) {
    const a = ANIMALS[p?.kind];
    if (!a) fail('invalid-argument', 'Geçersiz binek.');
    const paint = String(p.paint || '').toLowerCase();
    if (!a.colors.includes(paint)) fail('invalid-argument', 'Geçersiz renk.');
    const price = animalPrice(p.kind);
    if (p.expect != null && Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
    const t = now();
    let id = null;
    await db.runTransaction(async (tx) => {
      const us = await tx.get(userRef(uid));
      const u = us.data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if ((u.gold || 0) < price) fail('failed-precondition', 'Yetersiz altın.');
      tx.update(userRef(uid), { gold: FieldValue.increment(-price), goldTag: goldTag('arac') });
      const ref = db.collection('vehicles').doc();
      id = ref.id;
      const mods = compactMods(a.cid, { paint });
      tx.set(ref, { ...newVehicleDoc(uid, a.cid, FieldValue), source: p.kind === 'bisiklet' ? 'bisikletci' : 'ahir', ...(Object.keys(mods).length ? { mods } : {}) });
      statWrite(tx, db, FieldValue, { atMs: t, dayKey: dayKey(t), stat: { [`binek_${p.kind}_n`]: 1, [`binek_${p.kind}_ciro`]: price } });
    });
    return { ok: true, kind: p.kind, price, vehicleId: id };
  }
  async function bikeRent(uid) {
    const t = now();
    let until = 0;
    await db.runTransaction(async (tx) => {
      const us = await tx.get(userRef(uid));
      const u = us.data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      const cur = Math.max(t, Number(u.bikeRentUntil) || 0);
      if (cur - t > BIKE_RENT.maxAheadMs) fail('failed-precondition', 'already-paid');
      if ((u.gold || 0) < BIKE_RENT.perMin) fail('failed-precondition', 'Yetersiz altın.');
      until = cur + BIKE_RENT.slotMs;
      tx.update(userRef(uid), { gold: FieldValue.increment(-BIKE_RENT.perMin), goldTag: goldTag('bisikletKira'), bikeRentUntil: until });
    });
    return { ok: true, until, now: t, price: BIKE_RENT.perMin };
  }
  async function skateRent(uid) {
    const t = now();
    let until = 0;
    await db.runTransaction(async (tx) => {
      const u = (await tx.get(userRef(uid))).data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if (skateUntilOf(u) > t) {
        until = t + SKATE.slotMs; // kendi kaykayı var (ömrü bitmedi): ücret yok
        return;
      }
      const cur = Math.max(t, Number(u.skateRentUntil) || 0);
      if (cur - t > SKATE.maxAheadMs) fail('failed-precondition', 'already-paid');
      if ((u.gold || 0) < SKATE.rentPerMin) fail('failed-precondition', 'Yetersiz altın.');
      until = cur + SKATE.slotMs;
      tx.update(userRef(uid), { gold: FieldValue.increment(-SKATE.rentPerMin), goldTag: goldTag('kaykayKira'), skateRentUntil: until });
    });
    return { ok: true, until, now: t, price: SKATE.rentPerMin };
  }
  async function skateBuy(uid, p) {
    let until = 0;
    if (p?.expect != null && Number(p.expect) !== SKATE.price) fail('aborted', `price-changed:${SKATE.price}`);
    await db.runTransaction(async (tx) => {
      const u = (await tx.get(userRef(uid))).data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if (skateUntilOf(u) > now()) fail('failed-precondition', 'Zaten bir kaykayın var.');
      if ((u.gold || 0) < SKATE.price) fail('failed-precondition', 'Yetersiz altın.');
      until = now() + SKATE.lifeMs; // v221: 20 gün ömür
      tx.update(userRef(uid), { gold: FieldValue.increment(-SKATE.price), goldTag: goldTag('arac'), skate: true, skateUntil: until, skateRentUntil: FieldValue.delete() });
    });
    return { ok: true, price: SKATE.price, until };
  }
  return { animalBuy, bikeRent, skateRent, skateBuy, ops: { animalBuy, bikeRent, skateRent, skateBuy } };
}
