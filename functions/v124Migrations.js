// =============================================================================
// v124Migrations.js — v124 TEK SEFERLİK GEÇİŞLER (idempotent)
// =============================================================================
// Her adım iki kez çalışsa bile iki kez ödeme / iade YAPMAZ:
//   • her kayıt kendi transaction'ında okunur ve aynı transaction'da
//     "işlendi" yapılır (sıfırlanır / iptal edilir); ikinci çalışmada
//     işlenecek bir şey kalmaz;
//   • adımın tamamı bitince migrations/{ad} bayrağı yazılır, sonraki
//     çağrılar tek bir belge okuyup çıkar (Firebase maliyeti ≈ 0).
// Çağıran: saatlik iş (index.js v124Migrate) + gece 00:00 (dailyReset).
//
//   liman  — bekleyen liman siparişlerinin (loaded + pending) parası iade, SMS
//   contraband2el — 2. eldeki yasaklı madde ilanları iptal → ürün sahibine (oyuncu
//            envanteri / çete deposu), SMS
//   materialListings — 2. eldeki malzeme ilanları iptal → satıcının envanterine
//   machineListings  — 2. eldeki makine ilanları iptal → makine satıcının fabrikasına
//            (fabrikası yoksa makinenin değeri ödenir)
//   bizInventories — işletme envanterlerindeki malzemeler sahibinin ortak envanterine
//   materialsBuyout — kullanabileceği fabrika/işletmesi olmayan malzemeler AMAZOR
//            fiyatının %75'i ödenip silinir + SMS (sayfa sayfa; cursor ile devam eder)
// Sıra önemli: buyout en sonda (iade edilen malzemeler de değerlendirilsin);
// bir adım hata verirse sonrakiler o turda çalışmaz.
// =============================================================================
import { MATERIAL_KEYS, MATERIAL_LABELS, readHoldings, usableMaterials, buyoutValue } from './materials.js';

export const LIMAN_PRICES = { tamirMalzemesi: 8, silahUpgrade: 80, arabaGelistirme: 400, yasakliMadde: 2000 };
// eski (v78 öncesi) araba geliştirme anahtarları da araba geliştirme fiyatından
const LIMAN_LEGACY = { depoUpgrade: 'arabaGelistirme', vitesUpgrade: 'arabaGelistirme' };
const LABELS = { tamirMalzemesi: 'tamir malzemesi', silahUpgrade: 'silah geliştirme malzemesi', arabaGelistirme: 'araba geliştirme malzemesi', yasakliMadde: 'yasaklı madde' };
const CONTRABAND = 'yasakliMadde';

// Bir siparişin iade tutarı (saf fonksiyon — test edilir)
export function limanRefundOf(order) {
  let refund = 0;
  const lines = {};
  for (const bucket of ['loaded', 'pending']) {
    for (const [k, v] of Object.entries(order?.[bucket] || {})) {
      const q = Math.max(0, Math.floor(Number(v) || 0));
      if (!q) continue;
      const mat = LIMAN_PRICES[k] ? k : LIMAN_LEGACY[k];
      if (!mat) continue;
      refund += q * LIMAN_PRICES[mat];
      lines[mat] = (lines[mat] || 0) + q;
    }
  }
  return { refund, lines };
}

export function createV124Migrations({ db, FieldValue, goldTag, now = () => Date.now(), log = (o) => console.log(JSON.stringify(o)), machineRefund = () => 0, timeBudgetMs = 400_000 }) {
  const flagRef = (name) => db.collection('migrations').doc(`v124_${name}`);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const sms = (tx, uid, text, type) =>
    tx.set(db.collection('users').doc(uid).collection('messages').doc(), { text, type, createdAt: FieldValue.serverTimestamp(), read: false });

  async function done(name) {
    return (await flagRef(name).get()).exists;
  }
  async function markDone(name, info) {
    await flagRef(name).set({ doneAtMs: now(), ...info });
  }

  // ---- 1) Liman siparişleri iadesi ---------------------------------------------------
  async function refundLimanOrders() {
    if (await done('liman')) return { skipped: true };
    const snap = await db.collection('limanOrders').get();
    let refunded = 0;
    let gold = 0;
    for (const d of snap.docs) {
      const res = await db.runTransaction(async (tx) => {
        const os = await tx.get(d.ref);
        if (!os.exists) return null;
        const order = os.data();
        const { refund, lines } = limanRefundOf(order);
        if (refund <= 0) return null; // teslim edilmiş / boş sipariş — dokunma
        const uid = d.id;
        const us = await tx.get(db.collection('users').doc(uid));
        // merge YOK: kovalar tamamen sıfırlanır → ikinci çalışmada iade tutarı 0
        tx.set(d.ref, { loaded: {}, pending: {}, refundedV124: { gold: refund, lines, atMs: now() } });
        if (!us.exists) return { burned: refund }; // silinmiş hesap: iade edilecek kimse yok
        tx.update(us.ref, { gold: FieldValue.increment(refund), goldTag: goldTag('liman') });
        const what = Object.entries(lines)
          .map(([k, q]) => `${fmt(q)} ${LABELS[k] || k}`)
          .join(', ');
        sms(tx, uid, `🚢 Liman kapandı. Bekleyen siparişin (${what}) iptal edildi ve ${fmt(refund)} altın hesabına iade edildi. Yasaklı madde artık Liman & Depo'daki depolardan alınıp satılıyor.`, 'liman_refund');
        return { refund };
      });
      if (res?.refund) {
        refunded += 1;
        gold += res.refund;
      }
    }
    await markDone('liman', { refunded, gold, orders: snap.size });
    log({ v124: 'liman_refund', refunded, gold });
    return { refunded, gold };
  }

  // ---- 2) 2. eldeki yasaklı madde ilanları ------------------------------------------
  async function cancelContrabandListings({ liveWorldId = null } = {}) {
    if (await done('contraband2el')) return { skipped: true };
    let players = 0;
    let qtyBack = 0;
    // a) oyuncu ilanları (tek alanlı sorgu → ek indeks gerekmez)
    const snap = await db.collection('marketplaceListings').where('materialType', '==', CONTRABAND).get();
    for (const d of snap.docs) {
      const res = await db.runTransaction(async (tx) => {
        const ls = await tx.get(d.ref);
        if (!ls.exists) return null;
        const l = ls.data();
        if (l.sold || l.cancelled || l.itemType !== 'material') return null;
        const q = Math.max(0, Math.floor(Number(l.quantity) || 0));
        const seller = String(l.sellerId || '');
        const us = seller && seller !== 'system' ? await tx.get(db.collection('users').doc(seller)) : null;
        tx.update(d.ref, { sold: true, cancelled: true, cancelReason: 'v124_depo', expireAtMs: FieldValue.delete(), autoSellAtMs: FieldValue.delete() });
        if (!q || !us?.exists) return { q: 0 }; // sistem ilanı / silinmiş hesap: kapat yeter
        tx.set(us.ref.collection('inventory').doc(CONTRABAND), { quantity: FieldValue.increment(q) }, { merge: true });
        sms(tx, seller, `📦 2. el pazarında yasaklı madde satışı kalktı. İlandaki ${fmt(q)} yasaklı madde envanterine geri döndü. Artık Liman & Depo'daki depolara satabilirsin.`, 'contraband_listing_back');
        return { q };
      });
      if (res?.q) {
        players += 1;
        qtyBack += res.q;
      }
    }
    // b) çete ilanları (canlı dünya) → çete deposuna geri (ilan sayacı düşer)
    let gangs = 0;
    if (liveWorldId) {
      const base = db.collection('gangWorlds').doc(liveWorldId);
      const gs = await base.collection('market').where('itemKey', '==', CONTRABAND).get();
      for (const d of gs.docs) {
        const ok = await db.runTransaction(async (tx) => {
          const ls = await tx.get(d.ref);
          const l = ls.data();
          if (!l || l.status !== 'open') return false;
          tx.update(d.ref, { status: 'cancelled', cancelledAtMs: now(), cancelReason: 'v124_depo', ...(l.autoSellAtMs != null ? { autoSellAtMs: FieldValue.delete() } : {}) });
          tx.update(base.collection('gangs').doc(l.gangId).collection('private').doc('depot'), { [`listed.${l.itemKey}`]: FieldValue.increment(-Math.max(0, Number(l.quantity) || 0)) });
          return true;
        });
        if (ok) gangs += 1;
      }
    }
    await markDone('contraband2el', { players, qtyBack, gangs });
    log({ v124: 'contraband_2el', players, qtyBack, gangs });
    return { players, qtyBack, gangs };
  }

  // ---- 3) 2. eldeki malzeme ilanları → satıcının ortak envanterine -----------------
  async function cancelMaterialListings() {
    if (await done('materialListings')) return { skipped: true };
    const snap = await db.collection('marketplaceListings').where('itemType', '==', 'material').get();
    let n = 0;
    let qty = 0;
    for (const d of snap.docs) {
      if (!MATERIAL_KEYS.includes(d.data().materialType)) continue; // yasaklı madde ayrı adımda
      const res = await db.runTransaction(async (tx) => {
        const ls = await tx.get(d.ref);
        const l = ls.data();
        if (!l || l.sold || l.cancelled) return null;
        const q = Math.max(0, Math.floor(Number(l.quantity) || 0));
        const seller = String(l.sellerId || '');
        const us = seller && seller !== 'system' ? await tx.get(db.collection('users').doc(seller)) : null;
        tx.update(d.ref, { sold: true, cancelled: true, cancelReason: 'v124_magaza', expireAtMs: FieldValue.delete(), autoSellAtMs: FieldValue.delete() });
        if (!q || !us?.exists) return { q: 0 };
        tx.set(us.ref.collection('inventory').doc(l.materialType), { quantity: FieldValue.increment(q) }, { merge: true });
        return { q };
      });
      if (res?.q) {
        n += 1;
        qty += res.q;
      }
    }
    await markDone('materialListings', { listings: n, qty });
    log({ v124: 'material_listings', n, qty });
    return { listings: n, qty };
  }

  // ---- 4) 2. eldeki makine ilanları → fabrikaya ------------------------------------
  async function cancelMachineListings() {
    if (await done('machineListings')) return { skipped: true };
    const snap = await db.collection('marketplaceListings').where('itemType', '==', 'machine').get();
    let back = 0;
    let paid = 0;
    for (const d of snap.docs) {
      const res = await db.runTransaction(async (tx) => {
        const ls = await tx.get(d.ref);
        const l = ls.data();
        if (!l || l.sold || l.cancelled) return null;
        const seller = String(l.sellerId || '');
        const [us, fac] = seller && seller !== 'system' ? await Promise.all([tx.get(db.collection('users').doc(seller)), tx.get(db.collection('factories').doc(seller))]) : [null, null];
        tx.update(d.ref, { sold: true, cancelled: true, cancelReason: 'v124_makine', expireAtMs: FieldValue.delete() });
        if (!us?.exists) return { none: true };
        if (fac?.exists) {
          tx.set(fac.ref.collection('machines').doc(), { type: l.machineType, workerId: null, workerName: null, lastProducedDateKey: null, lastProducedQty: 0, purchasedAt: FieldValue.serverTimestamp() });
          sms(tx, seller, '⚙️ 2. elde makine satışı kalktı. İlandaki makinen fabrikana geri döndü (fabrikalar artık hep açık).', 'machine_listing_back');
          return { back: 1 };
        }
        const value = Math.max(0, Math.floor(Number(machineRefund(l)) || 0));
        if (value) tx.update(us.ref, { gold: FieldValue.increment(value), goldTag: goldTag('ikinciEl') });
        sms(tx, seller, `⚙️ 2. elde makine satışı kalktı. Fabrikan olmadığı için ilandaki makinenin karşılığı ${fmt(value)} altın hesabına yatırıldı.`, 'machine_listing_back');
        return { paid: value };
      });
      if (res?.back) back += 1;
      if (res?.paid) paid += res.paid;
    }
    await markDone('machineListings', { back, paid });
    log({ v124: 'machine_listings', back, paid });
    return { back, paid };
  }

  // ---- 5) işletme envanterleri → sahibinin ortak envanteri ------------------------
  async function moveBizInventories() {
    if (await done('bizInventories')) return { skipped: true };
    const snap = await db.collection('businessInventories').get();
    let moved = 0;
    for (const d of snap.docs) {
      const ok = await db.runTransaction(async (tx) => {
        const bs = await tx.get(d.ref);
        const b = bs.data();
        const owner = String(b?.ownerUid || '');
        const mats = Object.entries(b?.materials || {}).filter(([k, v]) => MATERIAL_KEYS.includes(k) && Math.floor(Number(v) || 0) > 0);
        if (!owner || !mats.length) return false;
        const us = await tx.get(db.collection('users').doc(owner));
        // merge YOK: işletme envanteri boşaltılır → ikinci çalışmada taşınacak bir şey kalmaz
        tx.set(d.ref, { ownerUid: owner, type: b.type || null, materials: {}, movedV124AtMs: now(), updatedAtMs: now() });
        if (!us.exists) return false;
        mats.forEach(([k, v]) => tx.set(us.ref.collection('inventory').doc(k), { quantity: FieldValue.increment(Math.floor(Number(v))) }, { merge: true }));
        return true;
      });
      if (ok) moved += 1;
    }
    await markDone('bizInventories', { moved });
    log({ v124: 'biz_inventories', moved });
    return { moved };
  }

  // ---- 6) yeri olmayan malzemeler: AMAZOR × %75 ödenip silinir ---------------------
  async function buyoutUnusableMaterials() {
    if (await done('materialsBuyout')) return { skipped: true };
    const t0 = now();
    const curRef = db.collection('migrations').doc('v124_materialsBuyout_cursor');
    const cursor = (await curRef.get()).data()?.lastUid || '';
    let q = db.collection('users');
    if (typeof q.select === 'function') q = q.select(); // canlı: sadece kimlikler (bellek / okuma hafif)
    const ids = (await q.get()).docs.map((d) => d.id).filter((id) => id > cursor).sort();
    let users = 0;
    let gold = 0;
    let last = cursor;
    for (const uid of ids) {
      if (now() - t0 > timeBudgetMs) break;
      const invSnaps = await Promise.all(MATERIAL_KEYS.map((k) => db.collection('users').doc(uid).collection('inventory').doc(k).get()));
      if (invSnaps.some((s) => Number(s.exists ? s.data().quantity : 0) > 0)) {
        const res = await db.runTransaction(async (tx) => {
          const holdings = await readHoldings(db, uid, { tx });
          const ok = usableMaterials(holdings);
          const refs = MATERIAL_KEYS.map((k) => db.collection('users').doc(uid).collection('inventory').doc(k));
          const snaps = await Promise.all(refs.map((r) => tx.get(r)));
          const us = await tx.get(db.collection('users').doc(uid));
          const sold = {};
          let pay = 0;
          snaps.forEach((s, i) => {
            const k = MATERIAL_KEYS[i];
            const n = Math.max(0, Math.floor(Number(s.exists ? s.data().quantity : 0) || 0));
            if (!n || ok.has(k)) return;
            sold[k] = n;
            pay += buyoutValue(k, n);
            tx.set(refs[i], { quantity: 0 }, { merge: true });
          });
          if (!Object.keys(sold).length || !us.exists) return null;
          if (pay > 0) tx.update(us.ref, { gold: FieldValue.increment(pay), goldTag: goldTag('malzeme') });
          const what = Object.entries(sold)
            .map(([k, n]) => `${fmt(n)} ${MATERIAL_LABELS[k] || k}`)
            .join(', ');
          sms(tx, uid, `🔧 Malzemeler artık oyuncuların elinde değil, fabrika ve işletmelerin (silahçı / modifiyeci) envanterinde duruyor. Bunları kullanabileceğin bir fabrikan ya da işletmen olmadığı için elindeki ${what} Amazor fiyatının %75'i ödenerek alındı: +${fmt(pay)} altın.`, 'materials_buyout');
          return { pay };
        });
        if (res) {
          users += 1;
          gold += res.pay;
        }
      }
      last = uid;
    }
    const finished = last === (ids[ids.length - 1] ?? last);
    await curRef.set({ lastUid: last, updatedAtMs: now() }, { merge: true });
    if (finished) await markDone('materialsBuyout', { lastUid: last });
    log({ v124: 'materials_buyout', users, gold, finished });
    return { users, gold, finished };
  }

  async function runAll({ liveWorldId = null } = {}) {
    const out = {};
    for (const [name, fn] of [
      ['liman', () => refundLimanOrders()],
      ['contraband2el', () => cancelContrabandListings({ liveWorldId })],
      ['materialListings', () => cancelMaterialListings()],
      ['machineListings', () => cancelMachineListings()],
      ['bizInventories', () => moveBizInventories()],
      ['materialsBuyout', () => buyoutUnusableMaterials()],
    ]) {
      try {
        out[name] = await fn();
      } catch (err) {
        out[name] = { error: String(err?.message || err) }; // bir sonraki turda tekrar denenir
        break; // sıra önemli: hata varsa sonraki adımlar bu turda çalışmaz
      }
    }
    return out;
  }

  return { refundLimanOrders, cancelContrabandListings, cancelMaterialListings, cancelMachineListings, moveBizInventories, buyoutUnusableMaterials, runAll };
}
