// =============================================================================
// v177 — TİCARİ ARAÇLAR (sunucu + istemci ortak saf kurallar + sunucu işlemleri)
// -----------------------------------------------------------------------------
// Kullanıcı kararları:
//   • Ticari araçlar artık galeriden ALINMAZ:
//       taksi    → Taksi Durağı'nın içinde (sol üst "🚕 Taksi")
//       otobüs   → Otogarların içinde ("🚌 Otobüs")
//       ambulans → Hastanede ("🚑 Ambulans")
//       tır      → Liman yükleme alanı / teslimat depolarında ("🚛 Tır")
//     Fiyat oyunun galeri fiyatı. Satış bedelinin yarısı ilgili şirketin (Neon Borsa)
//     o günkü gelirine yazılır, yarısı oyundan çıkar. 2. elden alınanlarda şirket payı yok.
//   • Bir oyuncu her ticari türden EN FAZLA 1 araç tutar (2. elden de alamaz). Ömrü bitmiş
//     (hurda) ya da bankaya el konmuş araç sayılmaz; 2. elde ilanda olan sayılır.
//   • Polis arabası oyundan kalktı (polislik mesleği değil, sadece para kazandıran araç görevi).
//   • Şoförlük gelir vergisi (Ticaret Bakanlığı, %10, %1–%20) + gelirin %10'u şirkete.
//     v199: motokurye de şoförlük vergisi öder; %10'u sipariş parası olarak seyyar satıcıya gider.
//   • Tek seferlik geçiş (migrateV177): polis arabaları ve aynı türden fazla ticari araçlar
//     (ömrü az olan) kalan ömre göre en yüksek 2. el değeri ödenerek kaldırılır; oyuncu
//     galerilerindeki ticari araç stoğunun ödenen bedeli iade edilir. Hepsine SMS.
// =============================================================================
import { VEHICLE_CATALOG } from './catalogData.js';

export const FLEET = {
  taksi: { job: 'taksi', cid: 13, co: 'taksi', label: 'Taksi', icon: '🚕', place: 'Taksi Durağı' },
  otobus: { job: 'otobus', cid: 12, co: 'terminal', label: 'Otobüs', icon: '🚌', place: 'Otogar' },
  ambulans: { job: 'ambulans', cid: 15, co: 'hastane', label: 'Ambulans', icon: '🚑', place: 'Hastane' },
  tir: { job: 'tir', cid: 11, co: 'nakliye', label: 'Tır', icon: '🚛', place: 'Yükleme / teslimat alanı' },
};
export const FLEET_JOBS = Object.keys(FLEET);
export const FLEET_IDS = FLEET_JOBS.map((j) => FLEET[j].cid);
export const POLICE_CAR_ID = 14;
// satışı kapalı (oyundan kalkan) araçlar — katalogda durur (eski kayıtlar bozulmasın)
export const RETIRED_VEHICLE_IDS = [POLICE_CAR_ID];
export const FLEET_SALE_SHARE = 0.5; // satış bedelinin şirkete giden payı
export const FLEET_DRIVER_SHARE = 0.1; // şoför gelirinin şirkete giden payı
export const SOFOR_TAX_RATE_ID = 'sofor';
export const fleetOfCid = (cid) => FLEET_JOBS.map((j) => FLEET[j]).find((f) => f.cid === Number(cid)) || null;
export const fleetOfJob = (job) => FLEET[job] || null;
export const isFleetId = (cid) => FLEET_IDS.includes(Number(cid));
export const isRetiredVehicle = (cid) => RETIRED_VEHICLE_IDS.includes(Number(cid));
// v177 — hangi araç hangi dükkânda satılır (oyunun + oyuncuların):
//   galeri     → arabalar (1–10)
//   motogaleri → 4 motor (Scooter, Cross, Chopper, Spor)
//   null       → dükkânda satılmaz: ticari (durak / otogar / hastane / yükleme alanı), bisiklet
//                (bisikletçi), at / deve (köy ahırları)
export const MOTOR_SHOP_IDS = [21, 22, 23, 24];
export const vehicleShopOf = (cid) => {
  const e = VEHICLE_CATALOG[Number(cid)];
  if (!e) return null;
  if (!e.kind || e.kind === 'araba') return 'galeri';
  if (MOTOR_SHOP_IDS.includes(Number(cid))) return 'motogaleri';
  return null;
};
export const galeriSells = (cid) => vehicleShopOf(cid) === 'galeri';
// v177 — 2. elde (ilan + hemen sat) satılamayanlar: bisiklet, at, deve (27) ve kalkan polis arabası
export const DEVE_ID = 27;
export const NO_RESALE_IDS = [25, 26, DEVE_ID, POLICE_CAR_ID];
export const canResell = (cid) => !NO_RESALE_IDS.includes(Number(cid));
export const NO_RESALE_TEXT = 'Bisiklet, at ve deve 2. elde satılamaz.';
// v177 — bisiklet / at / deve modifiye edilmez (renk satın alırken seçilir)
export const NO_MOD_IDS = [25, 26, DEVE_ID];
export const canModify = (cid) => !NO_MOD_IDS.includes(Number(cid));
// "Türden 1 araç" sayımında sayılan araç: hurda (ömür 0) ve bankaya el konmuş sayılmaz
export const countsAsOwned = (v) => Boolean(v) && !v.seizedByBank && (v.lifeDays ?? 20) > 0;
// Kalan ömre göre 2. el en yüksek değeri (ticari: fiyat × kalan gün / 20)
export const lifeValue = (v) => {
  const price = VEHICLE_CATALOG[Number(v?.catalogId)]?.price || 0;
  const life = Math.max(0, Math.min(20, Number(v?.lifeDays ?? 20) || 0));
  return Math.round((price * life) / 20);
};
// v199 — MOTOKURYE: kazancın %10'u siparişin parası olarak malı aldığı seyyar satıcıya (o satıcının
// hissedarlarına), belediyenin şoförlük vergisi kesilir, kalan kuryenin.
export const KURYE_ORDER_SHARE = 0.1;
// Şoför geliri bölüşümü: brüt → vergi + şirket payı (kuryede: satıcının sipariş parası) + net
export function splitDriverIncome(job, gross, taxFrac) {
  const g = Math.max(0, Math.round(Number(gross) || 0));
  if (job === 'kurye') {
    const tax = Math.round(g * Math.max(0, Number(taxFrac) || 0));
    const share = Math.round(g * KURYE_ORDER_SHARE);
    return { gross: g, tax, share, net: Math.max(0, g - tax - share) };
  }
  if (!fleetOfJob(job)) return { gross: g, tax: 0, share: 0, net: g };
  const tax = Math.round(g * Math.max(0, Number(taxFrac) || 0));
  const share = Math.round(g * FLEET_DRIVER_SHARE);
  return { gross: g, tax, share, net: Math.max(0, g - tax - share) };
}

// =============================================================================
// Sunucu
// =============================================================================
// deps: { db, FieldValue, HttpsError, goldTag, statWrite, newVehicleDoc, companyStatKey(coId),
//         dayKey(ms), now }
export function createFleet({ db, FieldValue, HttpsError, goldTag, statWrite, newVehicleDoc, companyStatKey, dayKey, now = () => Date.now(), log = console }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const userRef = (uid) => db.collection('users').doc(uid);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

  // Oyuncunun bu türden sayılan aracı (işlem içinde de çalışır: get = tx.get)
  async function ownedOfType(get, uid, cid) {
    const snap = await get(db.collection('vehicles').where('ownerId', '==', uid).where('catalogId', '==', Number(cid)));
    return snap.docs.filter((d) => countsAsOwned(d.data()));
  }
  // 2. el / dükkân yoluyla ticari araç alınırken (index.js buyListing çağırır)
  async function assertCanOwn(tx, uid, cid) {
    if (!isFleetId(cid)) return;
    const own = await ownedOfType((q) => tx.get(q), uid, cid);
    if (own.length) fail('failed-precondition', `Zaten bir ${fleetOfCid(cid).label.toLocaleLowerCase('tr-TR')} aracın var. Her türden en fazla 1 ticari araç alabilirsin.`);
  }

  // { job } → durak / terminal / hastane / yükleme alanından yeni ticari araç
  async function fleetBuy(uid, p) {
    const f = fleetOfJob(p?.job);
    if (!f) fail('invalid-argument', 'Geçersiz araç.');
    const e = VEHICLE_CATALOG[f.cid];
    const price = e.price;
    if (p.expect != null && Number(p.expect) !== price) fail('aborted', `price-changed:${price}`);
    const t = now();
    let id = null;
    await db.runTransaction(async (tx) => {
      const [us, own] = await Promise.all([tx.get(userRef(uid)), ownedOfType((q) => tx.get(q), uid, f.cid)]);
      const u = us.data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if (own.length) fail('failed-precondition', `Zaten bir ${f.label.toLocaleLowerCase('tr-TR')} aracın var.`);
      if ((u.gold || 0) < price) fail('failed-precondition', 'Yetersiz altın.');
      tx.update(userRef(uid), { gold: FieldValue.increment(-price), goldTag: goldTag('arac') });
      const ref = db.collection('vehicles').doc();
      id = ref.id;
      tx.set(ref, { ...newVehicleDoc(uid, f.cid, FieldValue), source: 'filo' });
      // satış bedelinin yarısı şirketin bugünkü gelirine (gece hissedarlara dağıtılır)
      statWrite(tx, db, FieldValue, { atMs: t, dayKey: dayKey(t), stat: { [companyStatKey(f.co)]: Math.round(price * FLEET_SALE_SHARE), [`filo_${f.job}_n`]: 1, [`filo_${f.job}_ciro`]: price } });
    });
    return { ok: true, job: f.job, price, vehicleId: id };
  }

  // ---- tek seferlik geçiş ---------------------------------------------------
  const MIG = () => db.collection('migrations').doc('v177Fleet');
  async function migrateV177() {
    const m = await MIG().get();
    if (m.exists && m.data().doneAtMs) return { skipped: true };
    const pay = {}; // uid → [{ text, amount }]
    const addPay = (uid, amount, text) => (pay[uid] ||= []).push({ amount, text });
    let removed = 0;
    // 1) polis arabaları + aynı türden fazla ticari araçlar
    const snap = await db.collection('vehicles').where('catalogId', 'in', [POLICE_CAR_ID, ...FLEET_IDS]).get();
    const byOwnerType = new Map();
    const victims = [];
    for (const d of snap.docs) {
      const v = d.data();
      if (!v.ownerId || v.seizedByBank) continue;
      if (Number(v.catalogId) === POLICE_CAR_ID) {
        victims.push({ ref: d.ref, v, why: 'polis' });
        continue;
      }
      if (!countsAsOwned(v)) continue;
      const k = `${v.ownerId}|${v.catalogId}`;
      if (!byOwnerType.has(k)) byOwnerType.set(k, []);
      byOwnerType.get(k).push({ ref: d.ref, v });
    }
    for (const list of byOwnerType.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => Number(b.v.lifeDays ?? 20) - Number(a.v.lifeDays ?? 20) || (b.v.jobEarned || 0) - (a.v.jobEarned || 0));
      list.slice(1).forEach((x) => victims.push({ ...x, why: 'fazla' }));
    }
    let errs = 0;
    const safe = (fn) => fn().catch((e) => {
      errs += 1;
      log.error?.('v177 filo geçişi', e);
      return null;
    });
    for (const x of victims) {
      const r = await safe(() => db.runTransaction(async (tx) => {
        const s = await tx.get(x.ref);
        const v = s.exists ? s.data() : null;
        if (!v || v.ownerId !== x.v.ownerId) return null;
        const listing = v.listed ? await tx.get(db.collection('marketplaceListings').where('vehicleId', '==', x.ref.id).where('sold', '==', false)) : null;
        const amount = lifeValue(v);
        if (amount > 0) tx.update(userRef(v.ownerId), { gold: FieldValue.increment(amount), goldTag: goldTag('arac') });
        listing?.docs.forEach((l) => tx.delete(l.ref));
        tx.delete(x.ref);
        return { uid: v.ownerId, amount, name: v.customName || v.model || VEHICLE_CATALOG[v.catalogId]?.name || 'Araç', life: Number(v.lifeDays ?? 20) };
      }));
      if (!r) continue;
      removed += 1;
      addPay(r.uid, r.amount, x.why === 'polis' ? `🚓 Polis arabası oyundan kalktı: "${r.name}" (${r.life} gün ömür) için ${fmt(r.amount)} altın hesabına yattı.` : `🚚 Artık her ticari türden 1 araç tutulabiliyor: ömrü az olan "${r.name}" (${r.life} gün) ${fmt(r.amount)} altına geri alındı.`);
    }
    // 2) oyuncu galerilerindeki araba olmayan stok (ticari + motor + bisiklet / at) → ödenen bedel iade
    let refunds = 0;
    const stocks = await db.collection('shopStocks').where('type', '==', 'galeri').get();
    for (const d of stocks.docs) {
      const r = await safe(() => db.runTransaction(async (tx) => {
        const s = await tx.get(d.ref);
        const st = s.exists ? s.data() : null;
        if (!st) return null;
        const items = { ...(st.items || {}) };
        const paid = { ...(st.paid || {}) };
        const prices = { ...(st.prices || {}) };
        let back = 0;
        const parts = [];
        for (const cid of Object.keys(items)) {
          if (galeriSells(cid)) continue;
          const q = Math.max(0, Math.floor(Number(items[cid]) || 0));
          const amt = q > 0 ? Math.max(0, Math.round(Number(paid[cid]) || 0)) : 0;
          if (q > 0) parts.push(`${q} ${VEHICLE_CATALOG[cid]?.name || 'araç'}`);
          back += amt;
          delete items[cid];
          delete paid[cid];
          delete prices[cid];
        }
        if (!parts.length && back === 0 && Object.keys(items).length === Object.keys(st.items || {}).length) return null;
        tx.set(d.ref, { ...st, items, paid, prices, updatedAtMs: now() });
        // teklif dizininden de çıkar
        const off = {};
        for (const cid of Object.keys(st.items || {})) if (!galeriSells(cid)) off[cid] = { [d.id]: FieldValue.delete() };
        if (Object.keys(off).length) tx.set(db.collection('shopOffers').doc('vehicle'), { offers: off, updatedAtMs: now() }, { merge: true });
        if (back > 0 && st.ownerUid) tx.update(userRef(st.ownerUid), { gold: FieldValue.increment(back), goldTag: goldTag('stok') });
        return parts.length ? { uid: st.ownerUid, back, parts } : null;
      }));
      if (r?.uid) {
        refunds += 1;
        addPay(r.uid, r.back, `🚗 Galeriler artık sadece araba satıyor (motorlar Motor Galerisi'nde, ticari araçlar durak / otogar / hastane / yükleme alanında): galerindeki ${r.parts.join(', ')} stoktan kaldırıldı, ödediğin ${fmt(r.back)} altın hesabına iade edildi.`);
      }
    }
    // 3) 2. elde açık bisiklet / at ilanları kapanır, araç sahibine döner (ceza yok)
    // (tek alanlı sorgu: bileşik dizin gerekmez; satılmışlar kodda elenir)
    const nl = await db.collection('marketplaceListings').where('vehicleCatalogId', 'in', [25, 26]).get();
    for (const d of nl.docs.filter((x) => x.data().itemType === 'vehicle' && !x.data().sold)) {
      const r = await safe(() => db.runTransaction(async (tx) => {
        const ls = await tx.get(d.ref);
        const l = ls.exists ? ls.data() : null;
        if (!l || l.sold) return null;
        const vRef = db.collection('vehicles').doc(String(l.vehicleId || ''));
        const vs = await tx.get(vRef);
        tx.update(d.ref, { sold: true, cancelled: true, expireAtMs: FieldValue.delete() });
        if (vs.exists && vs.data().ownerId === l.sellerId) tx.update(vRef, { listed: false });
        return { uid: l.sellerId, name: l.vehicleModel || 'Araç' };
      }));
      if (r?.uid && r.uid !== 'system') addPay(r.uid, 0, `🚲 Bisiklet ve at artık 2. elde satılmıyor: "${r.name}" ilanın kapandı, aracın garajına döndü.`);
    }
    // SMS'ler (oyuncu başına tek mesaj)
    const entries = Object.entries(pay);
    for (let i = 0; i < entries.length; i += 400) {
      const b = db.batch();
      for (const [uid, list] of entries.slice(i, i + 400)) {
        b.set(userRef(uid).collection('messages').doc(), { text: list.map((x) => x.text).join('\n'), createdAt: FieldValue.serverTimestamp(), read: false, type: 'v177_filo' });
      }
      await b.commit();
    }
    // hata olduysa bayrak yazılmaz: sonraki saat yalnız kalanlar işlenir (işlenenler zaten silindi / iade edildi)
    if (errs) {
      log.error?.(`v177 filo geçişi: ${errs} kayıt hata verdi, sonraki saatte tekrar`);
      return { removed, refunds, players: entries.length, errs };
    }
    await MIG().set({ doneAtMs: now(), removed, refunds, players: entries.length });
    log.log?.(`v177 filo geçişi: ${removed} araç, ${refunds} galeri iadesi, ${entries.length} oyuncu`);
    return { removed, refunds, players: entries.length };
  }

  return { fleetBuy, assertCanOwn, ownedOfType, migrateV177, ops: { fleetBuy } };
}
