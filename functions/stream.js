// =============================================================================
// v80 — YAYINCILIK (streamAction)
// Evinde/dükkânında (ya da internet kafede) Oyuncu Koltuğu + yakınında Oyuncu
// Bilgisayarı (v81: sadece bu; İnternet Kafe İstasyonu değil) olan herkes koltuğa oturup canlı
// yayın açabilir. İzleyiciler odayı bilgisayarın üstündeki kameradan canlı görür
// (sahne istemcide yeniden kurulur — bkz. src/components/Stream), sohbet eder,
// bağış atar. Yayın bitince bağışların %10'u vergi olarak kesilir, kalanı
// yayıncının cebine geçer.
//
//   op 'start'  { houseId, chairId, title, expect? } → yayını açar
//   op 'tick'   { streamId, viewers, seen }          → ~20 sn'de bir nabız (kafe: dakika ücreti)
//   op 'stop'   { streamId, viewers?, seen? }        → kapatır, özet döner, bağışlar ödenir
//   op 'donate' { streamId, amount, note }           → 10 / 100 / 1000; kişi başı yayıncıya günde 10.000
//   op 'chat'   { streamId, text }                   → yayın sohbeti
//   op 'price'  { houseId, price }                   → internet kafe sahibi: yayın seti dakika ücreti
//   op 'watch'  { streamId, on }                     → v81: izleyici katıldı/nabız (~30 sn) / ayrıldı;
//                                                       izleyici sayısı SUNUCUDA sayılır (streams/{id}.viewers)
//
// Belgeler:
//   streams/{id}                 — yayın (herkes okur)
//   streams/{id}/chat/{msg}      — sohbet
//   streamSeats/{evId}_{koltuk}  — koltuk kilidi (aynı koltukta iki yayın olmaz)
//   streamDonations/{gün}_{bağışçı}_{yayıncı} — günlük bağış sınırı
//   stats/streams                — ana sayfadaki "canlı yayınlar" listesi (sadece aç/kapa'da yazılır)
//   users/{uid}.streamId         — kullanıcının açık yayını
// İnternet kafede (işletme türü 'internet') sahibi dışındaki yayıncı dakika ücreti
// öder (houses.bizPrices.stream); ücret kafe sahibine (%10 vergi düşülerek) yazılır.
// Kafe dışındaki her yerde yayın ücretsizdir. v81: kafe dışında sadece mekânın
// SAHİBİ yayın açabilir (başkasının evindeki/dükkânındaki setle yayın yok).
// =============================================================================
import { midnightDayKey } from './businessCatalogData.js';
import { bizTax, taxOf, taxLedgerWrite } from './tax.js';

export const STREAM_CHAIRS = ['gamer'];
export const STREAM_PCS = ['pc']; // v81: sadece Oyuncu Bilgisayarı (İnternet Kafe İstasyonu yayın seti değil)
export const STREAM_SET_RANGE = 3.2; // bilgisayar koltuğa en fazla bu kadar uzak (m)
export const STREAM_PRICE = { def: 200, min: 50, max: 1000 }; // kafe: dakika ücreti
export const STREAM_SLOT_MS = 60_000;
export const STREAM_STALE_MS = 90_000; // nabız gelmezse yayın düşmüş sayılır
export const DONATION_AMOUNTS = [10, 100, 1000];
export const DONATION_DAILY_CAP = 10_000;
export const DONATION_TAX_RATE = 0.1;
export const STREAM_TITLE_MAX = 60;
export const STREAM_NOTE_MAX = 80;
export const STREAM_CHAT_MAX = 140;
export const STREAM_ROOM_MAX = 24;
const CHAT_MIN_MS = 1200;
export const WATCH_BEAT_MS = 30_000; // izleyici nabzı
export const WATCH_TTL_MS = 75_000; // bu kadar nabız gelmeyen izleyici sayılmaz
const PRESENCE_ACTIVE_MS = 2 * 60 * 1000;
const FX_KEEP = 6;
const LIST_MAX = 30;

export function streamPriceOf(h) {
  const v = Number(h?.bizPrices?.stream);
  return Number.isInteger(v) && v >= STREAM_PRICE.min && v <= STREAM_PRICE.max ? v : STREAM_PRICE.def;
}
// Koltuğa en yakın (menzildeki) yayın bilgisayarı
export function streamSetOf(items, chairId) {
  const list = Array.isArray(items) ? items : [];
  const chair = list.find((it) => it?.i === chairId && it.p === 1 && STREAM_CHAIRS.includes(it.k));
  if (!chair) return null;
  let pc = null;
  let best = STREAM_SET_RANGE;
  list.forEach((it) => {
    if (it?.p !== 1 || !STREAM_PCS.includes(it.k)) return;
    const d = Math.hypot(Number(it.x) - Number(chair.x), Number(it.z) - Number(chair.z));
    if (d <= best) {
      best = d;
      pc = it;
    }
  });
  return pc ? { chair, pc } : null;
}
const cleanText = (s, max) =>
  String(s || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function createStream({ db, FieldValue, HttpsError, splitIncomeForDebt, business, assertCanSpeak = async () => {}, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
  const userRef = (uid) => db.collection('users').doc(uid);
  const houseRef = (id) => db.collection('houses').doc(id);
  const streamRef = (id) => db.collection('streams').doc(id);
  const seatRef = (houseId, chairId) => db.collection('streamSeats').doc(`${houseId}_${chairId}`);
  const listRef = () => db.collection('stats').doc('streams');
  // v81: yayın olan mekân — izleyiciler bu sürece odanın sohbetini (konuşma
  // balonları) okuyabilir (firestore.rules: houses/{id}/chat)
  const liveHouseRef = (houseId) => db.collection('streamHouses').doc(houseId);
  const nameOf = (u) => String(u?.displayName || 'Oyuncu').slice(0, 40);
  const fresh = (s, t) => s && s.status === 'live' && t - Number(s.lastBeatMs || 0) < STREAM_STALE_MS;
  // v81 — izleyiciler: streams/{id}/watchers/{uid} = { atMs, name } (ayrılınca atMs: 0)
  const watchersRef = (id) => streamRef(id).collection('watchers');
  async function countOf(q) {
    try {
      if (typeof q.count === 'function') {
        const a = await q.count().get();
        return Number(a.data().count) || 0;
      }
    } catch {
      /* sayım desteklenmiyorsa aşağıda belge sayılır */
    }
    const snap = await q.get();
    return snap.size;
  }
  async function viewerCounts(id, t) {
    const [viewers, seen] = await Promise.all([countOf(watchersRef(id).where('atMs', '>', t - WATCH_TTL_MS)), countOf(watchersRef(id))]);
    return { viewers, seen };
  }

  async function txPresent(tx, uid, houseId) {
    const p = await tx.get(db.collection('housePresence').doc(uid));
    const d = p.exists ? p.data() : null;
    if (!d || d.houseId !== houseId) return false;
    const at = d.updatedAt?.toMillis?.() ?? Number(d.updatedAt || 0);
    return !(at && now() - at > PRESENCE_ACTIVE_MS);
  }

  // dakika ücreti (kafe). YAZMA — okumalar önceden yapılmış olmalı.
  function chargeTx(tx, { houseId, h, uid, os, price }) {
    tx.update(userRef(uid), { gold: FieldValue.increment(-price) });
    const tax = bizTax(price);
    const { goldDelta, debtDelta } = splitIncomeForDebt(os.data()?.debtToState, price - tax);
    tx.update(userRef(h.ownerUid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta) });
    business?.recordIncomeTx?.(tx, { houseId, h, amount: price, kind: 'service', customerUid: uid, products: { yayin: 1 }, tax });
  }

  // Yayını kapat + bağışları öde. YAZMA (okumalar: stream, liste, yayıncı).
  function finalizeTx(tx, { id, s, us, list, t, viewers, seen, reason = 'stop' }) {
    const donated = Math.max(0, Math.round(Number(s.donated || 0)));
    const tax = taxOf(donated, DONATION_TAX_RATE);
    const net = donated - tax;
    if (net > 0) {
      const { goldDelta, debtDelta } = splitIncomeForDebt(us?.data()?.debtToState, net);
      tx.update(userRef(s.uid), { gold: FieldValue.increment(goldDelta), debtToState: FieldValue.increment(debtDelta) });
    }
    if (tax > 0) taxLedgerWrite(tx, db, FieldValue, { amount: tax, source: 'yayin', uid: s.uid, atMs: t, ref: `yayin:${id}` });
    const peak = Math.max(Number(s.peak || 0), Number(viewers) || 0);
    const seenN = Math.max(Number(s.seen || 0), Number(seen) || 0);
    const endAt = reason === 'stale' ? Number(s.lastBeatMs || t) : t;
    const summary = { durationMs: Math.max(0, endAt - Number(s.startedAtMs || endAt)), donated, tax, net, donationCount: Number(s.donationCount || 0), peak, seen: seenN, paidTotal: Number(s.paidTotal || 0) };
    tx.update(streamRef(id), { status: 'ended', endedAtMs: endAt, endReason: reason, peak, seen: seenN, summary });
    tx.delete(seatRef(s.houseId, s.chairId));
    if (us?.exists && us.data()?.streamId === id) tx.update(userRef(s.uid), { streamId: FieldValue.delete() });
    const items = (list?.exists ? list.data().items : null) || [];
    tx.set(listRef(), { items: items.filter((x) => x.id !== id), updatedAtMs: t });
    return summary;
  }

  async function start(uid, p) {
    const houseId = String(p.houseId || '');
    const chairId = String(p.chairId || '');
    if (!isId(houseId) || !isId(chairId)) fail('invalid-argument', 'Geçersiz koltuk.');
    const title = cleanText(p.title, STREAM_TITLE_MAX);
    if (title) await assertCanSpeak(uid);
    let result = null;
    await db.runTransaction(async (tx) => {
      const t = now();
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Mekân bulunamadı.');
      const h = hs.data();
      const set = streamSetOf(h.items, chairId);
      if (!set) fail('failed-precondition', 'no-set');
      // v81: sadece kendi evinde/dükkânında (ücretsiz) ya da internet kafede (ücretli)
      // yayın açılır — başkasının setiyle yayın yok (orada sadece oyun oynanır)
      if (h.ownerUid !== uid && h.biz?.type !== 'internet') fail('failed-precondition', 'not-owner');
      if (!(await txPresent(tx, uid, houseId))) fail('failed-precondition', 'not-present');
      const cafe = h.biz?.type === 'internet' && h.ownerUid !== uid;
      const [us, seat, list, os] = await Promise.all([tx.get(userRef(uid)), tx.get(seatRef(houseId, chairId)), tx.get(listRef()), cafe ? tx.get(userRef(h.ownerUid)) : Promise.resolve(null)]);
      const user = us.data() || {};
      // koltukta başka canlı yayın var mı
      if (seat.exists && seat.data().uid !== uid && t - Number(seat.data().lastBeatMs || 0) < STREAM_STALE_MS) fail('failed-precondition', 'seat-busy');
      // açık kalmış eski yayın: aynı kişiyse önce kapat (bağışları öde)
      let old = null;
      if (user.streamId && isId(user.streamId)) {
        const os2 = await tx.get(streamRef(user.streamId));
        if (os2.exists && os2.data().status === 'live') old = { id: user.streamId, s: os2.data() };
      }
      if (old && fresh(old.s, t) && old.s.houseId === houseId && old.s.chairId === chairId) {
        result = { ok: true, streamId: old.id, resumed: true, paidUntilMs: Number(old.s.paidUntilMs || 0), price: Number(old.s.price || 0) };
        return;
      }
      let price = 0;
      let charged = 0;
      let paidUntilMs = 0;
      if (cafe) {
        price = streamPriceOf(h);
        if (Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
        if (Number(user.gold || 0) < price) fail('failed-precondition', 'gold');
      }
      // --- yazmalar ---
      if (old) finalizeTx(tx, { id: old.id, s: old.s, us, list, t, reason: 'replaced' });
      if (cafe) {
        chargeTx(tx, { houseId, h, uid, os, price });
        charged = price;
        paidUntilMs = t + STREAM_SLOT_MS;
      }
      const ref = db.collection('streams').doc();
      const doc = {
        uid,
        name: nameOf(user),
        houseId,
        houseName: (h.biz?.type === 'internet' && h.streamRoom ? `${String(h.name || 'Kafe').slice(0, 24)} · ${String(h.streamRoom).slice(0, 24)}` : String(h.name || 'Ev')).slice(0, 50),
        bizType: h.biz?.type || null,
        chairId,
        pcId: set.pc.i,
        title: title || `${nameOf(user)} canlı yayında`,
        status: 'live',
        startedAtMs: t,
        lastBeatMs: t,
        cafe,
        price,
        paidUntilMs,
        paidTotal: charged,
        donated: 0,
        donationCount: 0,
        fx: [],
        viewers: 0,
        peak: 0,
        seen: 0,
      };
      tx.set(ref, doc);
      tx.set(seatRef(houseId, chairId), { streamId: ref.id, uid, lastBeatMs: t });
      tx.set(liveHouseRef(houseId), { streamId: ref.id, uid, beatMs: t });
      tx.update(userRef(uid), { streamId: ref.id });
      const prevItems = ((list?.exists ? list.data().items : null) || []).filter((x) => x.id !== old?.id && x.uid !== uid);
      tx.set(listRef(), { items: [{ id: ref.id, uid, name: doc.name, title: doc.title, houseId, houseName: doc.houseName, startedAtMs: t }, ...prevItems].slice(0, LIST_MAX), updatedAtMs: t });
      result = { ok: true, streamId: ref.id, paidUntilMs, price, charged };
    });
    return result;
  }

  async function tick(uid, p) {
    const id = String(p.streamId || '');
    if (!isId(id)) fail('invalid-argument', 'Geçersiz yayın.');
    // v81: izleyici sayısı istemciden değil, sunucudaki izleyici kayıtlarından
    let counted = null;
    try {
      counted = await viewerCounts(id, now());
    } catch {
      counted = null;
    }
    let result = null;
    await db.runTransaction(async (tx) => {
      const t = now();
      const ss = await tx.get(streamRef(id));
      if (!ss.exists) fail('not-found', 'Yayın bulunamadı.');
      const s = ss.data();
      if (s.uid !== uid) fail('permission-denied', 'Bu yayın senin değil.');
      if (s.status !== 'live') {
        result = { ok: true, stopped: 'ended', summary: s.summary || null };
        return;
      }
      const viewers = counted ? counted.viewers : Math.max(0, Math.min(100000, Math.floor(Number(p.viewers) || 0)));
      const seen = counted ? counted.seen : Math.max(0, Math.min(1000000, Math.floor(Number(p.seen) || 0)));
      const needCharge = s.cafe && Number(s.paidUntilMs || 0) - t <= 3000;
      const present = await txPresent(tx, uid, s.houseId);
      const reads = [tx.get(userRef(uid)), tx.get(listRef())];
      let hs = null;
      let os = null;
      if (needCharge && present) {
        hs = await tx.get(houseRef(s.houseId));
        if (hs.exists) os = await tx.get(userRef(hs.data().ownerUid));
      }
      const [us, list] = await Promise.all(reads);
      if (!present) {
        result = { ok: true, stopped: 'left', summary: finalizeTx(tx, { id, s, us, list, t, viewers, seen, reason: 'left' }) };
        return;
      }
      const patch = { lastBeatMs: t, viewers, peak: Math.max(Number(s.peak || 0), viewers), seen: Math.max(Number(s.seen || 0), seen) };
      if (needCharge) {
        const h = hs?.exists ? hs.data() : null;
        const price = h ? streamPriceOf(h) : 0;
        if (!h || !streamSetOf(h.items, s.chairId)) {
          result = { ok: true, stopped: 'set', summary: finalizeTx(tx, { id, s, us, list, t, viewers, seen, reason: 'set' }) };
          return;
        }
        if (Number(us.data()?.gold || 0) < price) {
          result = { ok: true, stopped: 'gold', summary: finalizeTx(tx, { id, s, us, list, t, viewers, seen, reason: 'gold' }) };
          return;
        }
        chargeTx(tx, { houseId: s.houseId, h, uid, os, price });
        patch.paidUntilMs = Math.max(t, Number(s.paidUntilMs || 0)) + STREAM_SLOT_MS;
        patch.paidTotal = FieldValue.increment(price);
        patch.price = price;
        result = { ok: true, charged: price, paidUntilMs: patch.paidUntilMs, price };
      } else result = { ok: true, paidUntilMs: Number(s.paidUntilMs || 0) };
      result.viewers = viewers;
      result.seen = Math.max(Number(s.seen || 0), seen);
      tx.update(streamRef(id), patch);
      tx.set(seatRef(s.houseId, s.chairId), { streamId: id, uid, lastBeatMs: t });
      tx.set(liveHouseRef(s.houseId), { streamId: id, uid, beatMs: t });
    });
    return result;
  }

  async function stop(uid, p) {
    const id = String(p.streamId || '');
    if (!isId(id)) fail('invalid-argument', 'Geçersiz yayın.');
    let counted = null;
    try {
      counted = await viewerCounts(id, now());
    } catch {
      counted = null;
    }
    let result = null;
    await db.runTransaction(async (tx) => {
      const t = now();
      const ss = await tx.get(streamRef(id));
      if (!ss.exists) fail('not-found', 'Yayın bulunamadı.');
      const s = ss.data();
      if (s.uid !== uid) fail('permission-denied', 'Bu yayın senin değil.');
      if (s.status !== 'live') {
        result = { ok: true, summary: s.summary || null, already: true };
        return;
      }
      const [us, list] = await Promise.all([tx.get(userRef(uid)), tx.get(listRef())]);
      result = { ok: true, summary: finalizeTx(tx, { id, s, us, list, t, viewers: counted ? counted.viewers : p.viewers, seen: counted ? counted.seen : p.seen, reason: 'stop' }) };
    });
    return result;
  }

  async function donate(uid, p) {
    const id = String(p.streamId || '');
    const amount = Math.floor(Number(p.amount) || 0);
    if (!isId(id)) fail('invalid-argument', 'Geçersiz yayın.');
    if (!DONATION_AMOUNTS.includes(amount)) fail('invalid-argument', 'Geçersiz miktar.');
    const note = cleanText(p.note, STREAM_NOTE_MAX);
    if (note) await assertCanSpeak(uid);
    let result = null;
    await db.runTransaction(async (tx) => {
      const t = now();
      const ss = await tx.get(streamRef(id));
      if (!ss.exists) fail('not-found', 'Yayın bulunamadı.');
      const s = ss.data();
      if (!fresh(s, t)) fail('failed-precondition', 'ended');
      if (s.uid === uid) fail('failed-precondition', 'self');
      const capRef = db.collection('streamDonations').doc(`${midnightDayKey(t)}_${uid}_${s.uid}`);
      const [us, cap] = await Promise.all([tx.get(userRef(uid)), tx.get(capRef)]);
      const used = Number(cap.exists ? cap.data().amount || 0 : 0);
      if (used + amount > DONATION_DAILY_CAP) fail('failed-precondition', `cap:${DONATION_DAILY_CAP - used}`);
      if (Number(us.data()?.gold || 0) < amount) fail('failed-precondition', 'gold');
      const fx = [...(Array.isArray(s.fx) ? s.fx : []), { n: nameOf(us.data()), a: amount, m: note, at: t, u: uid }].slice(-FX_KEEP);
      tx.update(userRef(uid), { gold: FieldValue.increment(-amount) });
      tx.set(capRef, { amount: used + amount, donor: uid, streamer: s.uid, dayKey: midnightDayKey(t), updatedAtMs: t }, { merge: true });
      tx.update(streamRef(id), { donated: FieldValue.increment(amount), donationCount: FieldValue.increment(1), fx });
      result = { ok: true, left: DONATION_DAILY_CAP - used - amount };
    });
    return result;
  }

  async function chat(uid, p) {
    const id = String(p.streamId || '');
    if (!isId(id)) fail('invalid-argument', 'Geçersiz yayın.');
    const text = cleanText(p.text, STREAM_CHAT_MAX);
    if (!text) fail('invalid-argument', 'Boş mesaj.');
    await assertCanSpeak(uid);
    const t = now();
    const [ss, us] = await Promise.all([streamRef(id).get(), userRef(uid).get()]);
    if (!ss.exists || !fresh(ss.data(), t)) fail('failed-precondition', 'ended');
    const u = us.data() || {};
    if (t - Number(u.lastStreamChatMs || 0) < CHAT_MIN_MS) fail('resource-exhausted', 'Biraz yavaş 🙂');
    const batch = db.batch();
    batch.set(streamRef(id).collection('chat').doc(), { uid, name: nameOf(u), text, createdAtMs: t, host: ss.data().uid === uid });
    batch.update(userRef(uid), { lastStreamChatMs: t });
    await batch.commit();
    return { ok: true };
  }

  // v81 — izleyici katıldı / nabız / ayrıldı. Sayı değiştiyse yayın belgesine
  // yazılır (yayıncı ve izleyiciler oradan okur — RTDB kuralına bağlı değil).
  async function watch(uid, p) {
    const id = String(p.streamId || '');
    if (!isId(id)) fail('invalid-argument', 'Geçersiz yayın.');
    const on = p.on !== false;
    const t = now();
    const ss = await streamRef(id).get();
    if (!ss.exists) return { ok: true, ended: true, viewers: 0 };
    const s = ss.data();
    if (!fresh(s, t)) return { ok: true, ended: true, viewers: Number(s.viewers || 0) };
    if (s.uid === uid) return { ok: true, self: true, viewers: Number(s.viewers || 0) };
    await watchersRef(id).doc(uid).set({ atMs: on ? t : 0, uid }, { merge: true });
    const { viewers, seen } = await viewerCounts(id, t);
    const patch = {};
    if (viewers !== Number(s.viewers || 0)) patch.viewers = viewers;
    if (viewers > Number(s.peak || 0)) patch.peak = viewers;
    if (seen > Number(s.seen || 0)) patch.seen = seen;
    if (Object.keys(patch).length) await streamRef(id).update(patch).catch(() => {});
    return { ok: true, viewers, seen, beatMs: WATCH_BEAT_MS };
  }

  async function price(uid, p) {
    const houseId = String(p.houseId || '');
    if (!isId(houseId)) fail('invalid-argument', 'Geçersiz mekân.');
    const v = Math.floor(Number(p.price) || 0);
    if (v < STREAM_PRICE.min || v > STREAM_PRICE.max) fail('invalid-argument', `price-band:${STREAM_PRICE.min}-${STREAM_PRICE.max}`);
    const room = typeof p.room === 'string' ? p.room.replace(/\s+/g, ' ').trim().slice(0, STREAM_ROOM_MAX) : null;
    if (room) await assertCanSpeak(uid);
    await db.runTransaction(async (tx) => {
      const hs = await tx.get(houseRef(houseId));
      if (!hs.exists) fail('not-found', 'Mekân bulunamadı.');
      const h = hs.data();
      if (h.ownerUid !== uid) fail('permission-denied', 'Bu mekân senin değil.');
      if (h.biz?.type !== 'internet') fail('failed-precondition', 'Sadece internet kafede.');
      const upd = { 'bizPrices.stream': v, bizPricesAtMs: now() };
      if (room !== null) upd.streamRoom = room;
      tx.update(houseRef(houseId), upd);
    });
    return { ok: true, price: v, room };
  }

  // Nabzı kesilen (uygulaması kapanan) yayınları kapatır ve bağışlarını öder (5 dk'da bir)
  async function sweep() {
    const t = now();
    const snap = await db.collection('streams').where('status', '==', 'live').limit(200).get();
    let n = 0;
    for (const d of snap.docs) {
      if (t - Number(d.data().lastBeatMs || 0) < STREAM_STALE_MS) continue;
      await db.runTransaction(async (tx) => {
        const ss = await tx.get(d.ref);
        const s = ss.data();
        if (!s || s.status !== 'live' || now() - Number(s.lastBeatMs || 0) < STREAM_STALE_MS) return;
        const [us, list] = await Promise.all([tx.get(userRef(s.uid)), tx.get(listRef())]);
        finalizeTx(tx, { id: d.id, s, us, list, t: now(), reason: 'stale' });
        n += 1;
      });
    }
    return { closed: n };
  }

  async function action(uid, p = {}) {
    if (!uid) fail('unauthenticated', 'Giriş yapmalısın.');
    switch (String(p.op || '')) {
      case 'start':
        return start(uid, p);
      case 'tick':
        return tick(uid, p);
      case 'stop':
        return stop(uid, p);
      case 'donate':
        return donate(uid, p);
      case 'chat':
        return chat(uid, p);
      case 'price':
        return price(uid, p);
      case 'watch':
        return watch(uid, p);
      default:
        fail('invalid-argument', 'Geçersiz işlem.');
    }
    return null;
  }
  return { action, sweep };
}
