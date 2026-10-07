// =============================================================================
// gym.js — v77 İşletmeler Faz 4: Spor Salonu
// =============================================================================
// shopAction üzerinden çağrılır (op: gym*). Futbol takım antrenmanı da salon
// listesi / ödeme yardımcılarını buradan kullanır (index.js).
//
// SALON
//   - Oyuncu salonu: houses (biz.type 'spor'). Sahip günlük üyelik ücretini
//     belirler: 500–2.000 (varsayılan 1.000).
//   - Oyunun salonu: houses/game_spor (bizGame:true, ownerUid '__game__'),
//     her zaman açık, 2.000 sabit, bonus almaz, sıralamaya girmez. Herkes gibi
//     içine girilen online 3D mekân.
//
// ÜYELİK (gymMemberships/{uid}_{futbolGünü})
//   - Futbol günü 19:00'da başlar; hak ÖDEME anının gününe yazılır (18:59'da
//     ödeyip 19:05'te biten antrenman dünün hakkıdır, dünün bonusuyla).
//   - Günde 1 üyelik; açık (bitmemiş) üyelik varken yenisi alınamaz.
//   - Ödeme emanette tutulur: görev bitince salon sahibine geçer ve salonun o
//     günkü (ödeme günü) gelirine yazılır; süresinde bitmezse oyuncuya iade
//     edilir. SÜRE: bir sonraki 19:00'a kadar; son 1 saatte (18:00–18:59)
//     başlatılırsa başlangıçtan itibaren 1 saat (18:59 → 19:59). Bitmemiş üyelik varken salonun gerekli mobilyaları
//     kaldırılamaz (bizLockUntilMs).
//   - Üyelikten önce mevki seçilir (kaleci/defans/orta saha/forvet); takımda
//     değilken değiştirilebilir, değiştirince 7 gün değiştirilemez.
//   - Takımdaki oyuncu bireysel antrenman yapamaz.
//   - Salon sahibi kendi salonunda günde 1 kez ÜCRETSİZ antrenman yapar (gelir yok).
//   - Görev: salondaki aletlerden rastgele 3'ü sırayla; her biri en az 10 sn
//     (sunucuda doğrulanır), başarısızlık yok.
//
// GELİŞİM (footballers/{uid})
//   - Başlangıç gücü 100. Günlük artış: 200'ün altında 1–16, 200 ve üstü 1–4.
//     Güç tavanı yok. Bonuslu salonda ×1.1 (tek ondalık).
//
// %10 BONUS (kalabalık mekaniği, sadece bireysel)
//   - Dünkü (futbol günü) TOPLAM kazancı, en çok kazanan salonun (oyunun salonu dahil)
//     dünkü kazancının yarısından az olan (ya da hiç kazanmayan) salon bugün
//     bonusludur. Yeni salon ilk 19:00'da (dünün tamamında açık değil) geliri
//     ne olursa olsun bonuslu olamaz; ikinci 19:00'da o tam günün gelirine
//     bakılır. Gün başında donar (business.rollover gymBonusDay yazar; ödeme
//     anında da aynı kural).
// =============================================================================

import { futbolDayKey, prevDayKey, bizOpenAllDay, bizDayStartMs } from './businessCatalogData.js';

export const GAME_GYM_ID = 'game_spor';
export const GAME_OWNER = '__game__';
export const GYM_PRICE = { def: 1000, min: 500, max: 2000 };
export const GAME_GYM_PRICE = 2000;
export const GYM_EQUIPMENT = ['bag', 'treadmill', 'bench', 'dumbbells'];
export const GYM_STEP_MIN_MS = 10_000;
export const GYM_MIN_WINDOW_MS = 60 * 60 * 1000;
// Üyeliğin son anı: sonraki 19:00 ya da (son 1 saatte başladıysa) başlangıç + 1 sa
export function gymDeadlineMs(t) {
  const next19 = bizDayStartMs('spor', futbolDayKey(t)) + 24 * 60 * 60 * 1000;
  return Math.max(next19, t + GYM_MIN_WINDOW_MS);
}
export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
export const POSITION_LOCK_MS = 7 * 24 * 60 * 60 * 1000; // (eski kural; artık kullanılmıyor)
export const FOOTBALLER_START_POWER = 100;
export const PRO_POWER = 200;

export const isGameGym = (h) => Boolean(h?.bizGame);
export function gymPriceOf(h) {
  if (isGameGym(h)) return GAME_GYM_PRICE;
  const v = Number(h?.bizPrices?.gym);
  return Number.isInteger(v) && v >= GYM_PRICE.min && v <= GYM_PRICE.max ? v : GYM_PRICE.def;
}
// Günlük gelişim (bonussuz taban): 200 altı 1–16, üstü 1–4
export function rollGymGain(power, rnd = Math.random) {
  const max = Number(power || 0) < PRO_POWER ? 16 : 4;
  return 1 + Math.floor(rnd() * max);
}
export const withBonus = (gain, bonus) => (bonus ? Math.round(gain * 1.1 * 10) / 10 : gain);
export const roundPower = (v) => Math.round(Number(v || 0) * 10) / 10;

// Oyunun salonunun sabit yerleşimi (18×14 oda)
const it = (i, k, x, z, r = 0, c = 0) => ({ i, k, x, z, r, c, p: 1 });
export const GAME_GYM_LAYOUT = {
  items: [
    it('g1', 'bag', -6.5, -5),
    it('g2', 'bag', -3.5, -5),
    it('g3', 'treadmill', 1.5, -5),
    it('g4', 'treadmill', 4, -5),
    it('g5', 'bench', -6, 0.5, 2),
    it('g6', 'bench', -2.5, 0.5, 2),
    it('g7', 'dumbbells', 1.5, 0.5),
    it('g8', 'pullup', 7, -5),
    it('g9', 'bike', 7, -1.5),
    it('ga', 'yogamat', -6, 4.5),
    it('gb', 'yogamat', -3.5, 4.5),
    it('gc', 'watercooler', 8, 4.5),
    it('gd', 'speaker', -8.3, -6.2),
    it('ge', 'speaker', 8.3, -6.2),
    it('gf', 'plantb', -8.3, 6),
    it('gg', 'mirrorfull', 0, -6.4),
    it('gh', 'checkout', 1.5, 5.6, 4),
  ],
  wall: 'beton_duvar',
  floor: 'epoksi_siyah',
};

export function createGym({ db, FieldValue, HttpsError, splitIncomeForDebt, business, now = () => Date.now(), rnd = Math.random }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const userRef = (uid) => db.collection('users').doc(uid);
  const fbRef = (uid) => db.collection('footballers').doc(uid);
  const memRef = (uid, dayKey) => db.collection('gymMemberships').doc(`${uid}_${dayKey}`);
  const dailyRef = (houseId, dayKey) => db.collection('businessDaily').doc(`${houseId}_${dayKey}`);
  const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

  async function txGym(tx, gymId) {
    if (!isId(gymId)) fail('invalid-argument', 'Geçersiz salon.');
    const s = await tx.get(houseRef(gymId));
    if (!s.exists) fail('not-found', 'Salon bulunamadı.');
    const h = s.data();
    if (h.biz?.type !== 'spor') fail('failed-precondition', 'biz-closed');
    return h;
  }
  async function txPresent(tx, uid, houseId) {
    const p = await tx.get(db.collection('housePresence').doc(uid));
    const d = p.exists ? p.data() : null;
    if (!d || d.houseId !== houseId) return false;
    const at = d.updatedAt?.toMillis?.() ?? Number(d.updatedAt || 0);
    return !(at && now() - at > 2 * 60 * 1000);
  }

  // Salona ödeme (oyunun salonu → oyundan çıkar). YAZMA. ownerSnap önceden okunmalı.
  function payGymTx(tx, { gymId, h, ownerSnap, amount, customerUid, kind, atMs, products }) {
    if (amount <= 0) return;
    if (isGameGym(h)) {
      business?.recordGameIncomeTx?.(tx, { type: 'spor', amount, kind, customerUid, atMs, products });
      return;
    }
    const { goldDelta, debtDelta } = splitIncomeForDebt(ownerSnap?.data()?.debtToState, amount);
    tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta) });
    business?.recordIncomeTx(tx, { houseId: gymId, h, amount, kind, customerUid, atMs, products });
  }

  // Bonus: dünkü kazanç < en çok kazanan salonun (oyunun dahil) yarısı (ya da 0)
  async function gymBonus(gymId, h, dayKey) {
    if (isGameGym(h)) return false;
    const prev = prevDayKey(dayKey);
    // yeni salon: dünün tamamında açık değilse bonus yok (ilk 19:00 sayılmaz)
    if (!bizOpenAllDay(h.biz?.openedAtMs, 'spor', prev)) return false;
    const mine = await dailyRef(gymId, prev).get();
    const rev = Number(mine.exists ? mine.data().revenue || 0 : 0);
    if (rev === 0) return true;
    let top = null;
    const roll = await db.collection('businessRollups').doc(`spor_${prev}`).get();
    if (roll.exists) top = Number(roll.data().topRevenue || 0);
    else {
      // 19:00–19:05 arası (kapanış henüz yazılmadı): canlı hesapla
      const gyms = await db.collection('houses').where('bizType', '==', 'spor').limit(500).get();
      top = 0;
      for (const g of gyms.docs) {
        const d = await dailyRef(g.id, prev).get();
        top = Math.max(top, Number(d.exists ? d.data().revenue || 0 : 0));
      }
    }
    return rev < top / 2;
  }

  // ---- oyunun salonu (yoksa kurulur; herkes çağırabilir, idempotent) ----------
  async function gymEnsureGame() {
    const ref = houseRef(GAME_GYM_ID);
    const s = await ref.get();
    if (s.exists) return { ok: true, houseId: GAME_GYM_ID };
    await db.runTransaction(async (tx) => {
      const again = await tx.get(ref);
      if (again.exists) return;
      tx.set(ref, {
        ownerUid: GAME_OWNER,
        ownerName: 'Neon Şehir',
        ownerAvatar: null,
        name: 'Neon Spor Salonu',
        privacy: 'public',
        items: GAME_GYM_LAYOUT.items,
        wall: GAME_GYM_LAYOUT.wall,
        floor: GAME_GYM_LAYOUT.floor,
        music: null,
        kicked: {},
        invites: {},
        biz: { type: 'spor', openedAtMs: now() },
        bizType: 'spor',
        bizGame: true,
        createdAtMs: now(),
        updatedAtMs: now(),
      });
    });
    return { ok: true, houseId: GAME_GYM_ID };
  }

  // ---- fiyat (sahip) ---------------------------------------------------------------------
  async function gymPrice(uid, p) {
    const gymId = String(p.houseId || '');
    const price = Number(p.price);
    if (!Number.isInteger(price) || price < GYM_PRICE.min || price > GYM_PRICE.max) fail('invalid-argument', 'price-band:gym');
    await db.runTransaction(async (tx) => {
      const h = await txGym(tx, gymId);
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu salon senin değil.');
      tx.update(houseRef(gymId), { 'bizPrices.gym': price, bizPricesAtMs: now() });
    });
    return { ok: true, price };
  }

  // ---- futbolcu profili + mevki ------------------------------------------------------------
  function newFootballer(uid, user) {
    return { uid, name: String(user?.displayName || 'Oyuncu').slice(0, 40), position: null, power: FOOTBALLER_START_POWER, teamId: null, positionChangedAtMs: 0, createdAtMs: now() };
  }
  // Mevki değişikliği uygulanabilir mi? (YAZMAZ)
  function positionPatch(fb, position) {
    if (!POSITIONS.includes(position)) fail('invalid-argument', 'Geçersiz mevki.');
    if (fb.position === position) return null;
    if (fb.teamId) fail('failed-precondition', 'position-team');
    // v77: 200 güce ulaşan futbolcunun mevki kalıcıdır; altında günde 1 kez değişir (gün 19:00'da döner)
    if (fb.position && Number(fb.power || 0) >= PRO_POWER) fail('failed-precondition', 'position-pro');
    const day = futbolDayKey(now());
    if (fb.position && fb.positionDayKey === day) fail('failed-precondition', 'position-today');
    return { position, positionChangedAtMs: now(), positionDayKey: day };
  }
  async function footballerPosition(uid, p) {
    let result = null;
    await db.runTransaction(async (tx) => {
      const [fs, us] = await Promise.all([tx.get(fbRef(uid)), tx.get(userRef(uid))]);
      const fb = fs.exists ? fs.data() : newFootballer(uid, us.data());
      const patch = positionPatch(fb, String(p.position || ''));
      if (!fs.exists) tx.set(fbRef(uid), { ...fb, ...(patch || {}) });
      else if (patch) tx.update(fbRef(uid), patch);
      result = { ok: true, position: patch?.position || fb.position };
    });
    return result;
  }

  // Süresi dolmuş bitmemiş üyeliği iade et. YAZMA. (m okunmuş olmalı)
  function refundTx(tx, ref, m) {
    tx.update(ref, { status: 'refunded', refundedAtMs: now() });
    if (m.price > 0) tx.update(userRef(m.uid), { gold: FieldValue.increment(m.price) });
  }

  // ---- üyeliği başlat ----------------------------------------------------------------------
  async function gymStart(uid, p) {
    const gymId = String(p.houseId || '');
    const t = now();
    const dayKey = futbolDayKey(t);
    // açık üyelik var mı? (sorgu transaction dışında; içerde tekrar doğrulanır)
    const open = await db.collection('gymMemberships').where('uid', '==', uid).where('status', '==', 'active').limit(5).get();
    let result = null;
    await db.runTransaction(async (tx) => {
      const h = await txGym(tx, gymId);
      if (!(await txPresent(tx, uid, gymId))) fail('failed-precondition', 'not-present');
      const openSnaps = await Promise.all(open.docs.map((d) => tx.get(d.ref)));
      const [fs, us, ms, os] = await Promise.all([tx.get(fbRef(uid)), tx.get(userRef(uid)), tx.get(memRef(uid, dayKey)), isGameGym(h) ? null : tx.get(userRef(h.ownerUid))]);
      const user = us.data() || {};
      let fb = fs.exists ? fs.data() : newFootballer(uid, user);
      if (fb.teamId) fail('failed-precondition', 'in-team');
      let patch = null;
      if (p.position && p.position !== fb.position) patch = positionPatch(fb, String(p.position));
      if (patch) fb = { ...fb, ...patch };
      if (!fb.position) fail('failed-precondition', 'position-required');
      // bitmemiş üyelik: süresi dolduysa iade, dolmadıysa yeni alınamaz
      const expired = [];
      for (const s of openSnaps) {
        const m = s.exists ? s.data() : null;
        if (!m || m.status !== 'active') continue;
        if (Number(m.expiresAtMs) <= t) expired.push([s.ref, m]);
        else fail('failed-precondition', `membership-open:${m.gymId}`);
      }
      if (ms.exists && ms.data().status !== 'refunded') fail('failed-precondition', 'membership-today');
      const own = !isGameGym(h) && h.ownerUid === uid;
      const price = own ? 0 : gymPriceOf(h);
      if (!own && Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
      const refund = expired.reduce((a, [, m]) => a + Number(m.price || 0), 0);
      if (Number(user.gold || 0) + refund < price) fail('failed-precondition', 'gold');
      const bonus = await gymBonus(gymId, h, dayKey);
      // görevler: salondaki alet türlerinden rastgele 3 farklısı
      const kinds = GYM_EQUIPMENT.filter((k) => (h.items || []).some((x) => x.k === k && x.p === 1));
      const pool = [...kinds];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const tasks = pool.slice(0, 3);
      if (tasks.length < 3) fail('failed-precondition', 'gym-equipment');
      // --- yazmalar ---
      expired.forEach(([ref, m]) => refundTx(tx, ref, m));
      if (!fs.exists) tx.set(fbRef(uid), fb);
      else if (patch) tx.update(fbRef(uid), patch);
      if (price > 0) tx.update(userRef(uid), { gold: FieldValue.increment(-price) });
      const expiresAtMs = gymDeadlineMs(t);
      tx.set(memRef(uid, dayKey), {
        uid,
        gymId,
        gymName: String(h.name || 'Spor Salonu').slice(0, 40),
        game: isGameGym(h),
        own,
        ownerUid: isGameGym(h) ? null : h.ownerUid,
        dayKey,
        price,
        bonus,
        tasks,
        step: 0,
        stepStartedAtMs: null,
        paidAtMs: t,
        expiresAtMs,
        status: 'active',
      });
      if (!isGameGym(h) && Number(h.bizLockUntilMs || 0) < expiresAtMs) tx.update(houseRef(gymId), { bizLockUntilMs: expiresAtMs });
      void os;
      result = { ok: true, dayKey, tasks, bonus, price, position: fb.position, power: fb.power };
    });
    return result;
  }

  async function txActive(tx, uid) {
    const q = await tx.get(db.collection('gymMemberships').where('uid', '==', uid).where('status', '==', 'active').limit(5));
    const d = q.docs.find((x) => Number(x.data().expiresAtMs) > now());
    if (!d) fail('failed-precondition', 'no-membership');
    return { ref: d.ref, m: d.data() };
  }

  // Görev adımını başlat (aletin başında mini oyun açıldı)
  async function gymStep(uid, p) {
    let result = null;
    await db.runTransaction(async (tx) => {
      const { ref, m } = await txActive(tx, uid);
      if (!(await txPresent(tx, uid, m.gymId))) fail('failed-precondition', 'not-present');
      if (String(p.equipment || '') !== m.tasks[m.step]) fail('failed-precondition', 'wrong-equipment');
      tx.update(ref, { stepStartedAtMs: now() });
      result = { ok: true, step: m.step, equipment: m.tasks[m.step] };
    });
    return result;
  }

  // Görev adımı bitti (en az 10 sn). 3. adımda gelişim uygulanır, ödeme salona geçer.
  async function gymStepDone(uid) {
    let result = null;
    await db.runTransaction(async (tx) => {
      const { ref, m } = await txActive(tx, uid);
      const t = now();
      if (!m.stepStartedAtMs || t - Number(m.stepStartedAtMs) < GYM_STEP_MIN_MS) fail('failed-precondition', 'too-fast');
      if (!(await txPresent(tx, uid, m.gymId))) fail('failed-precondition', 'not-present');
      const step = m.step + 1;
      if (step < 3) {
        tx.update(ref, { step, stepStartedAtMs: null });
        result = { ok: true, step, done: false };
        return;
      }
      const [fs, hs, os, rps] = await Promise.all([
        tx.get(fbRef(uid)),
        tx.get(houseRef(m.gymId)),
        m.ownerUid ? tx.get(userRef(m.ownerUid)) : null,
        tx.get(db.collection('futbolPlayers').doc(`real_${uid}`)),
      ]);
      const fb = fs.exists ? fs.data() : newFootballer(uid, null);
      const from = roundPower(fb.power);
      const base = rollGymGain(from, rnd);
      const gain = withBonus(base, m.bonus);
      const to = roundPower(from + gain);
      const training = { dayKey: m.dayKey, gymId: m.gymId, gymName: m.gymName, from, to, base, gain, bonus: Boolean(m.bonus), atMs: t };
      if (fs.exists) tx.update(fbRef(uid), { power: to, lastTraining: training });
      else tx.set(fbRef(uid), { ...fb, power: to, lastTraining: training });
      // üyelik bitmeden bir takıma katıldıysa takımdaki kaydı da güncelle (Faz 5)
      if (rps?.exists) tx.update(rps.ref, { power: to });
      // emanetteki ödeme salona (ödeme gününün gelirine)
      if (hs.exists && hs.data().biz?.type === 'spor' && !isGameGym(hs.data()) && hs.data().ownerUid === m.ownerUid) {
        payGymTx(tx, { gymId: m.gymId, h: hs.data(), ownerSnap: os, amount: m.price, customerUid: uid, kind: 'service', atMs: m.paidAtMs, products: { üyelik: 1 } });
      } else if (m.game && m.price > 0) {
        business?.recordGameIncomeTx?.(tx, { type: 'spor', amount: m.price, kind: 'service', customerUid: uid, atMs: m.paidAtMs, products: { üyelik: 1 } });
      } else if (m.ownerUid && os && m.price > 0) {
        // salon kapanmış/sahibi değişmiş olsa da parası ödenmiş hizmet tamamlandı → sahibe
        const { goldDelta, debtDelta } = splitIncomeForDebt(os.data()?.debtToState, m.price);
        tx.update(userRef(m.ownerUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta) });
      }
      tx.update(ref, { step: 3, stepStartedAtMs: null, status: 'done', doneAtMs: t, result: training });
      result = { ok: true, step: 3, done: true, ...training };
    });
    return result;
  }

  // Süresi dolan bitmemiş üyelikleri iade et — saatlik
  async function expireMemberships() {
    const snap = await db.collection('gymMemberships').where('status', '==', 'active').limit(500).get();
    let n = 0;
    for (const d of snap.docs) {
      if (Number(d.data().expiresAtMs) > now()) continue;
      await db.runTransaction(async (tx) => {
        const s = await tx.get(d.ref);
        const m = s.data();
        if (m?.status !== 'active' || Number(m.expiresAtMs) > now()) return;
        refundTx(tx, d.ref, m);
      });
      n += 1;
    }
    return n;
  }

  const ops = {
    gymEnsureGame: () => gymEnsureGame(),
    gymPrice,
    gymStart,
    gymStep,
    gymStepDone,
    footballerPosition,
  };
  return { ops, gymEnsureGame, gymBonus, gymPriceOf, payGymTx, expireMemberships };
}
