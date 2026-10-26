// =============================================================================
// furnMarket.js — v132 MOBİLYA PAZARI: oyuncular kullanmadıkları mobilyaları
// birbirine satar (Tasarla › Mağaza · Envanter · Pazar).
// -----------------------------------------------------------------------------
// Kurallar (kullanıcı isteği):
//   • Odadaki satın alınmış eşyada "Sat" → eşya envantere döner, envanterden 1 adet
//     ilana çıkar (ilandaki eşya odaya / işletmeye konamaz — envanterde değildir).
//   • Fiyat: kendi mağaza fiyatının en az yarısı (buçuklu ise yukarı yuvarlanır),
//     en çok 1 birim altı; mağazadaki para birimiyle (altın / zümrüt).
//     ör. 9 zümrütlük eşya → 5–8 zümrüt.
//   • Aynı eşyadan birden çok ilan varsa pazarda sadece EN UCUZU görünür; eşitse ilk
//     konan. O satılınca sıradaki gelir. Para (vergisiz) satıcıya yatar.
//   • Pazardaki eşya satın almadan odaya "deneme" olarak konabilir (items[].m =
//     ilan kimliği). Odadayken başkası alırsa ya da ilan iptal edilirse eşya odadan
//     kalkar (istemci ilanı dinler; sunucu satın almada ilanı yeniden doğrular).
//
// Belgeler (yazma SADECE sunucu):
//   furnListings/{id} — { sellerUid, sellerName, k, t:'gold'|'gem', v, status:'open'|'sold'|'cancelled',
//                         createdAtMs, buyerUid?, soldAtMs?, houseId? }
//   furnMarket/main   — { best: { k: { id, t, v, at, uid } }, updatedAtMs }  (pazar vitrini, tek belge)
// =============================================================================

import { ITEM_PRICES } from './houseCatalogData.js';

export const FURN_MAX_OPEN_PER_USER = 40;
const LISTING_ID_RE = /^[A-Za-z0-9]{1,40}$/;
export const isListingId = (v) => typeof v === 'string' && LISTING_ID_RE.test(v);

// Satış fiyat aralığı (mağaza fiyatıyla aynı birim). null → bu eşya satılamaz.
export function furnPriceBand(k) {
  const p = ITEM_PRICES[k];
  if (!p || !(p.v > 1)) return null;
  const min = Math.ceil(p.v / 2);
  const max = p.v - 1;
  if (max < min) return null;
  return { t: p.t === 'gem' ? 'gem' : 'gold', min, max, store: p.v };
}
export function validFurnPrice(k, v) {
  const b = furnPriceBand(k);
  return Boolean(b) && Number.isInteger(v) && v >= b.min && v <= b.max;
}
// En ucuz (eşitse ilk konan) açık ilan
export function pickBest(listings) {
  let best = null;
  for (const l of listings) {
    if (!l || l.status !== 'open') continue;
    if (!best || l.v < best.v || (l.v === best.v && (l.createdAtMs || 0) < (best.createdAtMs || 0)) || (l.v === best.v && (l.createdAtMs || 0) === (best.createdAtMs || 0) && String(l.id) < String(best.id))) best = l;
  }
  return best ? { id: best.id, t: best.t, v: best.v, at: best.createdAtMs || 0, uid: best.sellerUid } : null;
}

export function createFurnMarket({ db, FieldValue, HttpsError, now = () => Date.now() }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const col = () => db.collection('furnListings');
  const marketRef = () => db.collection('furnMarket').doc('main');
  const invRef = (uid) => db.collection('houseInventories').doc(uid);
  const userRef = (uid) => db.collection('users').doc(uid);

  // İşlem içinde: k için açık ilanlar (exclude: bu işlemde kapanacak ilanlar; extra: yeni ilan)
  async function readOpen(tx, k) {
    const s = await tx.get(col().where('k', '==', k).where('status', '==', 'open'));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  function writeBest(tx, perK) {
    const best = {};
    for (const [k, b] of Object.entries(perK)) best[k] = b || FieldValue.delete();
    if (Object.keys(best).length) tx.set(marketRef(), { best, updatedAtMs: now() }, { merge: true });
  }

  // Satıcı: envanterdeki 1 adedi ilana koy
  async function list(uid, p) {
    const k = String(p.k || '');
    const v = Number(p.v);
    const band = furnPriceBand(k);
    if (!band) fail('failed-precondition', 'Bu eşya pazarda satılamaz.');
    if (!validFurnPrice(k, v)) fail('invalid-argument', `furn-price:${band.min}:${band.max}`);
    let result = null;
    await db.runTransaction(async (tx) => {
      const [is, us, mine, open] = await Promise.all([
        tx.get(invRef(uid)),
        tx.get(userRef(uid)),
        tx.get(col().where('sellerUid', '==', uid).where('status', '==', 'open').limit(FURN_MAX_OPEN_PER_USER + 1)),
        readOpen(tx, k),
      ]);
      const inv = is.exists ? is.data() : {};
      const have = Number(inv.items?.[k] || 0);
      if (have < 1) fail('failed-precondition', 'Envanterinde bu eşyadan yok.');
      if (mine.size >= FURN_MAX_OPEN_PER_USER) fail('failed-precondition', `En fazla ${FURN_MAX_OPEN_PER_USER} ilanın olabilir.`);
      const items = { ...(inv.items || {}) };
      items[k] = have - 1;
      if (items[k] <= 0) delete items[k];
      tx.set(invRef(uid), { items, walls: inv.walls || [], floors: inv.floors || [], updatedAtMs: now() });
      const ref = col().doc();
      const row = { sellerUid: uid, sellerName: String(us.data()?.displayName || 'Oyuncu').slice(0, 40), k, t: band.t, v, status: 'open', createdAtMs: now() };
      tx.set(ref, row);
      writeBest(tx, { [k]: pickBest([...open, { id: ref.id, ...row }]) });
      result = { ok: true, id: ref.id, k, t: band.t, v };
    });
    return result;
  }

  // Satıcı: ilanı iptal et → eşya envantere döner
  async function cancel(uid, p) {
    const id = String(p.id || '');
    if (!isListingId(id)) fail('invalid-argument', 'Geçersiz ilan.');
    let result = null;
    await db.runTransaction(async (tx) => {
      const ls = await tx.get(col().doc(id));
      const l = ls.exists ? ls.data() : null;
      if (!l || l.sellerUid !== uid) fail('not-found', 'İlan bulunamadı.');
      if (l.status !== 'open') fail('failed-precondition', 'Bu ilan artık açık değil.');
      const [is, open] = await Promise.all([tx.get(invRef(uid)), readOpen(tx, l.k)]);
      const inv = is.exists ? is.data() : {};
      const items = { ...(inv.items || {}), [l.k]: Number(inv.items?.[l.k] || 0) + 1 };
      tx.set(invRef(uid), { items, walls: inv.walls || [], floors: inv.floors || [], updatedAtMs: now() });
      tx.update(col().doc(id), { status: 'cancelled', cancelledAtMs: now() });
      writeBest(tx, { [l.k]: pickBest(open.filter((x) => x.id !== id)) });
      result = { ok: true, k: l.k };
    });
    return result;
  }

  // ---- satın alma (houses.js checkout içinden) ----------------------------------------
  // OKUMA: tasarımdaki pazar eşyalarının (it.m) ilanları + etkilenen türlerin açık ilanları.
  // Dönen: { byId: { id: ilan }, openByK: { k: [ilan] }, sellers: { uid: snap } }
  async function readForCheckout(tx, items, buyerUid) {
    const ids = [...new Set((items || []).filter((it) => it.p !== 1 && isListingId(it.m)).map((it) => it.m))];
    if (!ids.length) return { byId: {}, openByK: {}, sellers: {} };
    const snaps = await Promise.all(ids.map((id) => tx.get(col().doc(id))));
    const byId = {};
    snaps.forEach((s, i) => {
      const l = s.exists ? s.data() : null;
      if (l && l.status === 'open' && l.sellerUid !== buyerUid) byId[ids[i]] = { id: ids[i], ...l };
    });
    const ks = [...new Set(Object.values(byId).map((l) => l.k))];
    const opens = await Promise.all(ks.map((k) => readOpen(tx, k)));
    const openByK = Object.fromEntries(ks.map((k, i) => [k, opens[i]]));
    const sellerIds = [...new Set(Object.values(byId).map((l) => l.sellerUid))];
    const sellerSnaps = await Promise.all(sellerIds.map((u) => tx.get(userRef(u))));
    const sellers = Object.fromEntries(sellerIds.map((u, i) => [u, sellerSnaps[i]]));
    return { byId, openByK, sellers };
  }
  // Tasarımdaki bir eşyanın pazar ilanı (geçerliyse) — fiyatı ilandan
  const marketOf = (pre, it) => (it.p !== 1 && isListingId(it.m) && pre.byId[it.m] && pre.byId[it.m].k === it.k ? pre.byId[it.m] : null);
  // YAZMA: alınan ilanlar kapanır, para satıcılara (vergisiz), pazar vitrini güncellenir
  function writeCheckout(tx, pre, boughtIds, { buyerUid, houseId }) {
    if (!boughtIds.length) return;
    const pay = {};
    const closed = new Set(boughtIds);
    for (const id of boughtIds) {
      const l = pre.byId[id];
      tx.update(col().doc(id), { status: 'sold', buyerUid, soldAtMs: now(), houseId: houseId || null });
      const cur = (pay[l.sellerUid] ||= { gold: 0, gem: 0, n: 0 });
      cur[l.t === 'gem' ? 'gem' : 'gold'] += l.v;
      cur.n += 1;
    }
    for (const [sid, v] of Object.entries(pay)) {
      if (!pre.sellers[sid]?.exists) continue;
      const patch = {};
      if (v.gold) patch.gold = FieldValue.increment(v.gold);
      if (v.gem) patch.emerald = FieldValue.increment(v.gem);
      tx.update(userRef(sid), patch);
      const parts = [v.gold ? `${v.gold.toLocaleString('tr-TR')} altın` : '', v.gem ? `${v.gem} zümrüt` : ''].filter(Boolean).join(' + ');
      tx.set(userRef(sid).collection('messages').doc(), { text: `🛋️ Pazardaki ${v.n > 1 ? `${v.n} mobilyan` : 'mobilyan'} satıldı: +${parts}.`, createdAt: FieldValue.serverTimestamp(), read: false, type: 'furn_sold' });
    }
    const perK = {};
    for (const [k, list] of Object.entries(pre.openByK)) if (list.some((l) => closed.has(l.id))) perK[k] = pickBest(list.filter((l) => !closed.has(l.id)));
    writeBest(tx, perK);
  }

  return { list, cancel, readForCheckout, marketOf, writeCheckout };
}
