// =============================================================================
// business.js — v77 İşletmeler: günlük rapor + kazanç sıralaması
// =============================================================================
// Koleksiyonlar (yazma SADECE sunucudan):
//   businessDaily/{houseId}_{dayKey} — gizli günlük rapor (sadece sahibi okur)
//     { houseId, ownerUid, type, dayKey, revenue, byKind:{k:altın}, customers,
//       cust:{uid:true}, products:{k:adet}, materialsIn:{k:adet}, materialsUsed:{k:adet},
//       updatedAtMs }
//     byKind: 'service' (hizmet/üyelik/dakika) · 'sale' (silah/araç satışı) ·
//             'material' (atölyede satılan malzeme) · 'labor' (işçilik) · 'menu' (cafe/bar)
//   houses/{id}.bizRank — dünkü kazanç sırası (1 = en çok). Kazanç tutarı herkese
//     açık ev belgesine YAZILMAZ; liste sadece sırayı bilir.
//   businessRollups/{type}_{dayKey} — o günün kapanış özeti (sunucu içi; spor
//     salonu bonusu için en yüksek kazanç burada saklanır — Faz 4).
//
// Günlük gider/vergi YOK; rapor sadece kayıt tutar (ileride belediye/vergi).
// Gün sınırı türe göre: spor salonu 19:00 (futbol günü), diğerleri 00:00.
//
// v195 — PASİF MEKÂN (20 gün oyuna girmeyen sahibin işletmeleri + ofisleri):
//   houses/{id}.biz.passive = true (ofiste office.passive) — listelerde görünmez, hiçbir yoldan
//     para kazanmaz (recordIncomeTx / ofis ücreti işlemi iptal eder), stok / eşya / para olduğu gibi kalır.
//   Silahçı / galeri / motor galerisi / depo teklifleri shopOffers'tan kaldırılır (oyunun mağazası görmez).
//   users/{sahip}.bizPassive = true — giriş (initializePlayer) bu belgeyi ZATEN okuyor: bayrak varsa
//     mekânlar açılır, teklifler stoktan geri yazılır. Bayrağı olmayan oyuncuya giriş başına ek okuma yok.
//   Gece kontrolü mevcut gün kapanışında (rollover — işletmeler zaten okunuyor) yapılır. Kimin ne zaman
//   yeniden kontrol edileceği sunucuya özel bizIdle/{tür} belgesinde tutulur (herkese açık ev belgesine
//   giriş zamanı yazılmaz): { next: { houseId: kontrolMs } }. Ofisler için bizIdle/ofis aynı + own (sahip).
//   Kontrol zamanı gelmiş evin sahibinin giriş kaydı (users/{uid}/private/meta.lastSeenAtMs) 1 kez okunur;
//   girmişse sonraki kontrol giriş + 20 gün → aktif oyuncu için ~20 günde 1 okuma.
// =============================================================================

import { ownListingStock } from './autoSupply.js'; // v186
import { BIZ_TYPES, ALL_BIZ_KEYS, bizDayKey, prevDayKey, bizOpenAllDay } from './businessCatalogData.js';
import { taxLedgerWrite } from './tax.js';
import { STOCK_KIND, clampStockPrice, stockQty } from './shopStockRules.js'; // v195 pasif → teklifler
import { VEHICLE_CATALOG, WEAPON_CATALOG } from './catalogData.js';
import { vehicleShopOf } from './fleet.js';
import { DEPO_OFFERS_KIND, CONTRABAND, depoPricesOf } from './depo.js';
import { BIZ_IDLE_DAYS, BIZ_PASSIVE_TEXT, isBizPassive } from './bizPassive.js';

export const BIZ_INCOME_KINDS = ['service', 'sale', 'material', 'labor', 'menu', 'team', 'bagis'];
// Oyunun kendi işletmeleri de kazancına göre sıralanır (en üstte durmak zorunda
// değil). Gelirleri businessDaily/game_{tür}_{gün} altında tutulur; sıra
// gameVenues/{tür}.bizRank'e yazılır (spor için ayrıca houses/game_spor).
export const GAME_VENUE_TYPES = ['silahci', 'galeri', 'motogaleri', 'modifiye', 'spor']; // v177 motor galerisi
export const gameVenueId = (type) => `game_${type}`;
export const GAME_VENUE_OWNER = '__game__';

// ---- v195 PASİF MEKÂN (saf kurallar functions/bizPassive.js — istemci de kullanır) --------
const DAY_MS = 86_400_000;
export const bizIdleCutoff = (t) => t - BIZ_IDLE_DAYS * DAY_MS;
export const BIZ_PASSIVE_CODE = 'biz-passive';
export { BIZ_IDLE_DAYS, BIZ_PASSIVE_TEXT, isBizPassive };
// Bir stok dükkânının (silahçı / galeri / motor galerisi) satabileceği katalog numaraları
export function stockCidsOf(type) {
  const kind = STOCK_KIND[type];
  if (kind === 'weapon') return Object.keys(WEAPON_CATALOG);
  if (kind === 'vehicle') return Object.keys(VEHICLE_CATALOG).filter((cid) => vehicleShopOf(cid) === type);
  return [];
}

export function createBusiness({ db, FieldValue, HttpsError = null, now = () => Date.now(), log = console }) {
  const dailyRef = (houseId, dayKey) => db.collection('businessDaily').doc(`${houseId}_${dayKey}`);
  // v195: pasif mekân geliri — işlem (transaction) iptal edilir, hiçbir yazma işlenmez
  const passiveFail = () => {
    if (HttpsError) throw new HttpsError('failed-precondition', BIZ_PASSIVE_TEXT);
    const e = new Error(BIZ_PASSIVE_TEXT);
    e.code = 'failed-precondition';
    throw e;
  };
  const assertBizOpen = (h) => {
    if (isBizPassive(h)) passiveFail();
  };

  // Sadece YAZMA (transaction'ın en sonunda çağrılabilir). Sahibin kendi
  // alışverişi müşteri sayılmaz ve rapora yazılmaz.
  // v77 vergi: `tax` → rapora (günlük `tax`) ve vergi defterine (functions/tax.js)
  // v92 — `salary`: garsona ödenen maaş (cafe/bar) → rapordaki gider satırı
  // v195 — allowPassive: pasiflikten ÖNCE ödenmiş, sonra tamamlanan iş (spor üyeliği, eski garson siparişi)
  //   — kullanıcı kararı: para eskisi gibi sahibe gider. Diğer bütün yollarda pasif mekânın geliri
  //   işlemi iptal eder (para kimseden çıkmaz, kimseye girmez).
  function recordIncomeTx(tx, { houseId, h, amount, kind, customerUid, products, materialsUsed, materialsIn, atMs, tax = 0, taxSource = 'isletme', salary = 0, stat = null, allowPassive = false }) {
    const type = h?.biz?.type;
    if (!type || !houseId) return null;
    if (!allowPassive && isBizPassive(h)) passiveFail();
    if (customerUid && customerUid === h.ownerUid) return null;
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    const k = BIZ_INCOME_KINDS.includes(kind) ? kind : 'service';
    const dayKey = bizDayKey(type, atMs ?? now());
    const patch = {
      houseId,
      ownerUid: h.ownerUid,
      type,
      dayKey,
      revenue: FieldValue.increment(amt),
      byKind: { [k]: FieldValue.increment(amt) },
      updatedAtMs: now(),
    };
    if (customerUid) patch.cust = { [customerUid]: true };
    const tx10 = Math.max(0, Math.round(Number(tax) || 0));
    // v127 — Belediye › Ticaret analizi: oyuncu işletmelerinin türe göre cirosu
    const st = stat || (taxSource === 'isletme' && h.ownerUid !== GAME_VENUE_OWNER && amt > 0 ? { [`isl_${type}_ciro`]: amt, [`isl_${type}_n`]: 1 } : null);
    if (tx10 > 0) {
      patch.tax = FieldValue.increment(tx10);
      patch.taxByKind = { [k]: FieldValue.increment(tx10) };
      taxLedgerWrite(tx, db, FieldValue, { amount: tx10, source: taxSource, uid: h.ownerUid, atMs: atMs ?? now(), ref: houseId, bizType: type, stat: st });
    }
    const sal = Math.max(0, Math.round(Number(salary) || 0));
    if (sal > 0) {
      patch.salary = FieldValue.increment(sal);
      patch.salaryOrders = FieldValue.increment(1);
    }
    const addMap = (field, m) => {
      if (!m) return;
      const out = {};
      Object.entries(m).forEach(([key, n]) => {
        const q = Math.round(Number(n) || 0);
        if (q) out[key] = FieldValue.increment(q);
      });
      if (Object.keys(out).length) patch[field] = out;
    };
    addMap('products', products);
    addMap('materialsUsed', materialsUsed);
    addMap('materialsIn', materialsIn);
    tx.set(dailyRef(houseId, dayKey), patch, { merge: true });
    // v77 — "yeni satışlar var" SMS'i: işletme başına TEK mesaj (sabit kimlik).
    // Okunmamışken yeni satış olursa aynı mesaj güncellenir (yeni SMS
    // yığılmaz); okunduktan sonraki ilk satış onu tekrar okunmamış yapar.
    if (amt > 0 && h.ownerUid && h.ownerUid !== GAME_VENUE_OWNER) {
      tx.set(db.collection('users').doc(h.ownerUid).collection('messages').doc(`bizsale_${houseId}`), {
        text: `${BIZ_TYPES[type]?.icon || '🏪'} ${h.name || BIZ_TYPES[type]?.label || 'İşletme'} işletmende yeni satışlar var.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'biz_sale',
        houseId,
      });
    }
    return dayKey;
  }
  // Oyunun dükkânının geliri (sadece sıralama için). YAZMA.
  // v130: taxSource / stat — oyunun silahçısı / galerisinin kâr vergisi ('sifir')
  function recordGameIncomeTx(tx, { type, amount, kind, customerUid, products, materialsUsed, atMs, tax = 0, taxSource = 'isletme', stat = null }) {
    if (!GAME_VENUE_TYPES.includes(type)) return null;
    return recordIncomeTx(tx, { houseId: gameVenueId(type), h: { biz: { type }, ownerUid: GAME_VENUE_OWNER }, amount, kind, customerUid, products, materialsUsed, atMs, tax, taxSource, stat });
  }

  // Gün kapanışı: türün gün sınırı geçtiyse dünkü kazanca göre sıra yazılır.
  // Saatlik ya da 00:05 / 19:05'te çağrılabilir; aynı gün için tekrar yazmaz.
  async function rollover(types = ALL_BIZ_KEYS) {
    const t = now();
    const done = [];
    const seenCache = new Map(); // v195: bu turda okunan giriş kayıtları (aynı sahip bir kez okunur)
    const idleStats = [];
    for (const type of types) {
      if (!BIZ_TYPES[type]) continue;
      const yKey = prevDayKey(bizDayKey(type, t));
      const rollRef = db.collection('businessRollups').doc(`${type}_${yKey}`);
      const rollSnap = await rollRef.get();
      if (rollSnap.exists) continue;
      const housesSnap = await db.collection('houses').where('bizType', '==', type).limit(500).get();
      const rows = [];
      // oyunun dükkânı: sıralamaya girer, bonusa/eşiğe girmez
      if (GAME_VENUE_TYPES.includes(type)) {
        const gid = gameVenueId(type);
        const gs = await dailyRef(gid, yKey).get();
        rows.push({ id: gid, game: true, ref: db.collection('gameVenues').doc(type), revenue: Number(gs.exists ? gs.data().revenue || 0 : 0), openedAtMs: 0 });
      }
      for (const d of housesSnap.docs) {
        if (d.data().bizGame) continue; // oyunun salonu yukarıda (gameVenues) sayıldı
        const ds = await dailyRef(d.id, yKey).get();
        const v = ds.exists ? ds.data() : {};
        rows.push({ id: d.id, ref: d.ref, ownerUid: d.data().ownerUid, revenue: Number(v.revenue || 0), customers: Object.keys(v.cust || {}).length, openedAtMs: Number(d.data().biz?.openedAtMs || 0) });
        // müşteri sayısını rapora sabitle (cust haritası gün içinde büyür)
        if (ds.exists) await ds.ref.set({ customers: Object.keys(v.cust || {}).length }, { merge: true });
      }
      // En çok kazanan en üstte; eşitlikte oyuncu dükkânı oyununkinden önce, sonra önce açılan
      rows.sort((a, b) => b.revenue - a.revenue || Number(Boolean(a.game)) - Number(Boolean(b.game)) || a.openedAtMs - b.openedAtMs);
      let batch = db.batch();
      let n = 0;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].game) {
          batch.set(rows[i].ref, { type, bizRank: i + 1, dayKey: yKey }, { merge: true });
          const gh = housesSnap.docs.find((d) => d.id === rows[i].id && d.data().bizGame);
          if (gh) batch.update(gh.ref, { bizRank: i + 1 });
        } else batch.update(rows[i].ref, { bizRank: i + 1 });
        n += 1;
        if (n % 400 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }
      const playerRows = rows.filter((r) => !r.game);
      // eşik: oyunun dükkânı DAHİL en çok kazananın yarısı (oyunun salonu bonus almaz)
      const topRevenue = rows.reduce((m, r) => Math.max(m, r.revenue), 0);
      // Spor salonu %10 bonusu: dünkü kazancı en çok kazananın yarısından az (ya da 0)
      // olan salon bugün bonuslu. Herkese açık ev belgesine sadece "bugün bonuslu"
      // işareti yazılır; eşik/kazanç sadece sahibin gizli günlük raporuna.
      // Yeni salon: dünün TAMAMINDA açık değilse (ilk 19:00) geliri ne olursa olsun
      // bonuslu olamaz; bir sonraki 19:00'da o tam günün gelirine bakılır.
      if (type === 'spor') {
        const today = bizDayKey(type, t);
        for (const r of playerRows) {
          const eligible = bizOpenAllDay(r.openedAtMs, type, yKey);
          const on = eligible && (r.revenue === 0 || r.revenue < topRevenue / 2);
          batch.update(r.ref, { gymBonusDay: on ? today : null });
          batch.set(
            dailyRef(r.id, today),
            { houseId: r.id, ownerUid: r.ownerUid, type, dayKey: today, bonusRef: { on, eligible, yesterday: r.revenue, top: topRevenue, threshold: Math.floor(topRevenue / 2) } },
            { merge: true }
          );
          n += 2;
          if (n % 400 === 0) {
            await batch.commit();
            batch = db.batch();
          }
        }
      }
      batch.set(rollRef, { type, dayKey: yKey, count: playerRows.length, topRevenue, createdAtMs: t });
      await batch.commit();
      // v195: 20 gün oyuna girmeyen sahiplerin bu türdeki işletmeleri pasif (ev listesi zaten okundu)
      const idle = await idleSweepType(type, housesSnap.docs, t, seenCache).catch((err) => {
        log.error?.(`pasif mekân taraması (${type})`, err);
        return null;
      });
      if (idle?.passive) idleStats.push({ type, ...idle });
      done.push({ type, dayKey: yKey, count: playerRows.length });
    }
    // v195: ofisler gün başında (00:00 kapanışı) bir kez kontrol edilir
    if (done.some((d) => BIZ_TYPES[d.type]?.day !== 'futbol')) {
      const idle = await idleSweepOffices(t, seenCache).catch((err) => {
        log.error?.('pasif ofis taraması', err);
        return null;
      });
      if (idle?.passive) idleStats.push({ type: 'ofis', ...idle });
    }
    if (idleStats.length) log.log?.(`v195 pasif mekân: ${JSON.stringify(idleStats)}`);
    return done;
  }

  // ---- v195 PASİF MEKÂN: gece kontrolü + girişte geri açma ------------------------------
  const userRef = (uid) => db.collection('users').doc(uid);
  const metaRef = (uid) => userRef(uid).collection('private').doc('meta');
  const idleRef = (key) => db.collection('bizIdle').doc(key); // sunucuya özel (kurallarda okuma yok)
  const offersDoc = (kind) => db.collection('shopOffers').doc(kind);
  async function getMany(refs) {
    if (!refs.length) return [];
    if (typeof db.getAll === 'function') {
      const out = [];
      for (let i = 0; i < refs.length; i += 100) out.push(...(await db.getAll(...refs.slice(i, i + 100))));
      return out;
    }
    return Promise.all(refs.map((r) => r.get()));
  }
  // Sahiplerin son giriş zamanı (users/{uid}/private/meta.lastSeenAtMs; kayıt yoksa 0)
  async function seenOfOwners(uids, cache) {
    const need = [...new Set(uids)].filter((u) => u && !cache.has(u));
    const snaps = await getMany(need.map(metaRef));
    need.forEach((u, i) => cache.set(u, Math.max(0, Number(snaps[i]?.exists ? snaps[i].data()?.lastSeenAtMs : 0) || 0)));
    return cache;
  }
  const sameMap = (a, b) => {
    const ka = Object.keys(a || {});
    if (ka.length !== Object.keys(b || {}).length) return false;
    return ka.every((k) => b[k] === a[k]);
  };
  // Pasif dükkânın oyunun mağazasındaki teklifleri (okumadan, birleştirerek silinir). YAZMA.
  function offersRemoveTx(tx, houseId, type) {
    const kind = STOCK_KIND[type];
    if (kind) {
      const offers = Object.fromEntries(stockCidsOf(type).map((cid) => [cid, { [houseId]: FieldValue.delete() }]));
      if (Object.keys(offers).length) tx.set(offersDoc(kind), { offers, updatedAtMs: now() }, { merge: true });
    } else if (type === 'depo') {
      tx.set(offersDoc(DEPO_OFFERS_KIND), { offers: { [houseId]: FieldValue.delete() }, updatedAtMs: now() }, { merge: true });
    }
  }
  // Tek bir evi pasif yapar. Döner: 'ok' | 'seen' (giriş yapmış) | 'stale' (artık o mekân değil) | 'skip'
  //   expect: { type } işletme · { office: true, ownerUid } ofis
  async function passivate(houseId, t, expect) {
    return db.runTransaction(async (tx) => {
      const hs = await tx.get(db.collection('houses').doc(houseId));
      const h = hs.exists ? hs.data() : null;
      if (!h || !h.ownerUid || h.bizGame || h.hq?.gangId || h.ownerUid === GAME_VENUE_OWNER) return 'stale';
      if (isBizPassive(h)) return 'skip';
      const isOffice = Boolean(expect.office);
      if (isOffice ? h.kind !== 'ofis' || h.ownerUid !== expect.ownerUid : h.biz?.type !== expect.type) return 'stale';
      // giriş kaydı işlem içinde yeniden okunur (az önce girmişse pasif yapılmaz)
      const ms = await tx.get(metaRef(h.ownerUid));
      if ((Number(ms.exists ? ms.data()?.lastSeenAtMs : 0) || 0) >= bizIdleCutoff(t)) return 'seen';
      const field = isOffice ? 'office' : 'biz';
      tx.update(hs.ref, { [`${field}.passive`]: true, [`${field}.passiveAtMs`]: t });
      tx.update(userRef(h.ownerUid), { bizPassive: true });
      if (!isOffice) offersRemoveTx(tx, houseId, h.biz.type);
      return 'ok';
    });
  }
  // Bir işletme türü: gün kapanışında (rollover) zaten okunan ev listesiyle
  async function idleSweepType(type, docs, t, cache) {
    const ref = idleRef(type);
    const s = await ref.get();
    const prev = (s.exists && s.data()?.next) || {};
    const next = {};
    const due = [];
    for (const d of docs) {
      const h = d.data();
      if (h.bizGame || !h.ownerUid || h.ownerUid === GAME_VENUE_OWNER || h.hq?.gangId || h.biz?.type !== type) continue;
      if (isBizPassive(h)) continue; // zaten pasif — sahibi girince açılır, sonra yeniden kontrol edilir
      const at = Number(prev[d.id]) || 0;
      if (at > t) next[d.id] = at;
      else due.push(d);
    }
    await seenOfOwners(due.map((d) => d.data().ownerUid), cache);
    const cutoff = bizIdleCutoff(t);
    let passive = 0;
    for (const d of due) {
      const seen = cache.get(d.data().ownerUid) || 0;
      if (seen >= cutoff) {
        next[d.id] = seen + BIZ_IDLE_DAYS * DAY_MS;
        continue;
      }
      const r = await passivate(d.id, t, { type }).catch((err) => {
        log.error?.(`pasif yapılamadı ${d.id}`, err);
        return 'err';
      });
      if (r === 'ok') passive += 1;
      else if (r === 'seen' || r === 'err') next[d.id] = 0; // yarın yeniden bakılır
    }
    if (!sameMap(prev, next)) await ref.set({ next, updatedAtMs: t });
    if (passive) log.log?.(`pasif mekân: ${type} — ${passive} işletme (20 gün oyuna girmeyen sahip)`);
    return { checked: due.length, passive };
  }
  // Ofisler: gün kapanışında ev listesi okunmadığı için bizIdle/ofis'te ofis → sahip dizini tutulur.
  // İlk çalışmada (v195 geçişi) mevcut ofisler BİR KEZ sorgulanır; sonra ofis açılınca office.js ekler.
  async function idleSweepOffices(t, cache) {
    const ref = idleRef('ofis');
    const s = await ref.get();
    const d0 = s.exists ? s.data() : null;
    let own = { ...(d0?.own || {}) };
    let prev = { ...(d0?.next || {}) };
    const first = !d0?.v;
    if (first) {
      const qs = await db.collection('houses').where('kind', '==', 'ofis').limit(1000).get();
      own = {};
      for (const d of qs.docs) {
        const h = d.data();
        if (h.ownerUid && !h.hq?.gangId && !isBizPassive(h)) own[d.id] = h.ownerUid;
      }
      prev = {};
    }
    const next = {};
    const due = [];
    for (const [id, uid] of Object.entries(own)) {
      const at = Number(prev[id]) || 0;
      if (at > t) next[id] = at;
      else due.push([id, uid]);
    }
    await seenOfOwners(due.map(([, uid]) => uid), cache);
    const cutoff = bizIdleCutoff(t);
    let passive = 0;
    for (const [id, uid] of due) {
      const seen = cache.get(uid) || 0;
      if (seen >= cutoff) {
        next[id] = seen + BIZ_IDLE_DAYS * DAY_MS;
        continue;
      }
      const r = await passivate(id, t, { office: true, ownerUid: uid }).catch((err) => {
        log.error?.(`pasif ofis yapılamadı ${id}`, err);
        return 'err';
      });
      if (r === 'ok') {
        passive += 1;
        delete own[id]; // pasif ofis dizinden çıkar; sahibi girince yeniden eklenir
      } else if (r === 'stale' || r === 'skip') delete own[id];
      else next[id] = 0;
    }
    if (first || !sameMap(prev, next) || !sameMap(d0?.own || {}, own)) await ref.set({ v: 1, own, next, updatedAtMs: t });
    if (passive) log.log?.(`pasif mekân: ofis — ${passive} ofis (20 gün oyuna girmeyen sahip)`);
    return { checked: due.length, passive, first };
  }
  // office.js: ev ofis olunca dizine eklenir (sahibi o an oyunda → ilk kontrol 20 gün sonra). YAZMA.
  function registerOfficeTx(tx, houseId, ownerUid) {
    tx.set(idleRef('ofis'), { own: { [houseId]: ownerUid }, next: { [houseId]: now() + BIZ_IDLE_DAYS * DAY_MS } }, { merge: true });
  }

  // Giriş: users/{uid}.bizPassive varsa (initializePlayer bu belgeyi zaten okuyor) mekânları aç.
  // Okuma: sahibin evleri (1 sorgu) + her pasif stok dükkânı / depo için stok belgesi.
  async function reactivateOwner(uid) {
    const qs = await db.collection('houses').where('ownerUid', '==', uid).limit(50).get();
    let opened = 0;
    for (const d of qs.docs) {
      if (!isBizPassive(d.data())) continue;
      const ok = await db.runTransaction(async (tx) => {
        const hs = await tx.get(d.ref);
        const h = hs.exists ? hs.data() : null;
        if (!h || h.ownerUid !== uid || !isBizPassive(h)) return false;
        const type = h.biz?.type || null;
        const kind = STOCK_KIND[type] || null;
        const [ss, ds] = await Promise.all([kind ? tx.get(db.collection('shopStocks').doc(d.id)) : null, type === 'depo' ? tx.get(db.collection('depots').doc(d.id)) : null]);
        const patch = {};
        if (h.biz?.passive) Object.assign(patch, { 'biz.passive': FieldValue.delete(), 'biz.passiveAtMs': FieldValue.delete() });
        if (h.office?.passive) Object.assign(patch, { 'office.passive': FieldValue.delete(), 'office.passiveAtMs': FieldValue.delete() });
        tx.update(d.ref, patch);
        // teklifler stoktan geri yazılır (shop.js offerWrite / depo.js offerWrite ile aynı biçim)
        if (kind && ss?.exists && ss.data()?.type === type) {
          const st = ss.data();
          const cat = kind === 'vehicle' ? VEHICLE_CATALOG : WEAPON_CATALOG;
          const offers = {};
          for (const cid of Object.keys(st.items || {})) {
            if (!cat[cid] || stockQty(st, cid) < 1 || (kind === 'vehicle' && vehicleShopOf(cid) !== type)) continue;
            offers[cid] = { [d.id]: clampStockPrice(cat[cid].price, st.prices?.[cid]) };
          }
          if (Object.keys(offers).length) tx.set(offersDoc(kind), { offers, updatedAtMs: now() }, { merge: true });
        }
        if (ds?.exists) {
          const stockN = Math.max(0, Math.floor(Number(ds.data()?.[CONTRABAND]) || 0));
          if (stockN > 0) tx.set(offersDoc(DEPO_OFFERS_KIND), { offers: { [d.id]: { p: depoPricesOf({ id: d.id, ...h }).sell, s: stockN, o: uid } }, updatedAtMs: now() }, { merge: true });
        }
        if (h.office?.passive && h.kind === 'ofis') registerOfficeTx(tx, d.id, uid);
        return true;
      });
      if (ok) opened += 1;
    }
    const batch = db.batch();
    batch.update(userRef(uid), { bizPassive: FieldValue.delete() });
    if (opened) {
      batch.set(userRef(uid).collection('messages').doc(), {
        text: `🏪 Tekrar hoş geldin! 20 gün oyuna girmediğin için kapanan ${opened} mekânın yeniden açıldı. Stoğun, eşyaların ve paran olduğu gibi duruyor.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'biz_reopen',
      });
    }
    await batch.commit();
    return opened;
  }

  // Atölyede stok bitince sahibe günde EN FAZLA bir kez, biriken eksikleri tek
  // mesajda içeren SMS (saatlik çalışır; shop.js bizShortage işaretini koyar,
  // sahip stok ekleyince işaret kalkar).
  const MATERIAL_NAMES = { tamirMalzemesi: '🔧 Tamir', silahUpgrade: '🔫 Silah geliştirme', arabaGelistirme: '🚗 Araba geliştirme' };
  async function sendShortageSms() {
    const today = bizDayKey('silahci', now());
    const snap = await db.collection('houses').where('bizShortagePending', '==', true).limit(300).get();
    let sent = 0;
    for (const d of snap.docs) {
      const h = d.data();
      const items = Object.keys(h.bizShortage?.items || {}).filter((k) => h.bizShortage.items[k]);
      if (!h.biz?.type || !items.length || !h.ownerUid) {
        await d.ref.update({ bizShortagePending: false });
        continue;
      }
      if (h.bizShortage?.smsDay === today) continue;
      // v124: stok sahibinin ortak envanterinde (Mağaza / fabrika) — dolan malzemenin işareti kalkar
      const invSnaps = await Promise.all(items.map((k) => db.collection('users').doc(h.ownerUid).collection('inventory').doc(k).get()));
      // v186: envanterde yoksa sahibin kendi Mağaza ilanına da bakılır (malzemesini satışa koyana hatırlatma gitmez)
      const have = await Promise.all(
        items.map(async (k, i) => {
          const inv = Number(invSnaps[i].exists ? invSnaps[i].data().quantity : 0) || 0;
          if (inv > 0) return inv;
          const ls = await db.collection('marketplaceListings').where('sellerId', '==', h.ownerUid).where('itemType', '==', 'material').where('materialType', '==', k).where('sold', '==', false).get();
          return ownListingStock(ls.docs.map((x) => ({ id: x.id, ...x.data() })), h.ownerUid);
        })
      );
      const still = items.filter((k, i) => !(have[i] > 0));
      if (!still.length) {
        await d.ref.update({ bizShortage: { items: {}, smsDay: h.bizShortage?.smsDay || null }, bizShortagePending: false });
        continue;
      }
      items.splice(0, items.length, ...still);
      const batch = db.batch();
      batch.set(db.collection('users').doc(h.ownerUid).collection('messages').doc(), {
        text: `${BIZ_TYPES[h.biz.type]?.icon || '🏪'} ${h.name || 'Dükkân'} — stok bitiyor: ${items.map((k) => MATERIAL_NAMES[k] || k).join(', ')}. Envanter › Mağaza’dan alabilirsin.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'biz_shortage',
        houseId: d.id,
      });
      batch.update(d.ref, { 'bizShortage.smsDay': today });
      await batch.commit();
      sent += 1;
    }
    return sent;
  }

  return { recordIncomeTx, recordGameIncomeTx, rollover, dailyRef, sendShortageSms, assertBizOpen, idleSweepType, idleSweepOffices, registerOfficeTx, reactivateOwner, passivate };
}
