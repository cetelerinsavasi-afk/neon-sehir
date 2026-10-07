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
// =============================================================================

import { BIZ_TYPES, BIZ_TYPE_KEYS, bizDayKey, prevDayKey, bizOpenAllDay } from './businessCatalogData.js';

export const BIZ_INCOME_KINDS = ['service', 'sale', 'material', 'labor', 'menu', 'team'];
// Oyunun kendi işletmeleri de kazancına göre sıralanır (en üstte durmak zorunda
// değil). Gelirleri businessDaily/game_{tür}_{gün} altında tutulur; sıra
// gameVenues/{tür}.bizRank'e yazılır (spor için ayrıca houses/game_spor).
export const GAME_VENUE_TYPES = ['silahci', 'galeri', 'modifiye', 'spor'];
export const gameVenueId = (type) => `game_${type}`;
export const GAME_VENUE_OWNER = '__game__';

export function createBusiness({ db, FieldValue, now = () => Date.now() }) {
  const dailyRef = (houseId, dayKey) => db.collection('businessDaily').doc(`${houseId}_${dayKey}`);

  // Sadece YAZMA (transaction'ın en sonunda çağrılabilir). Sahibin kendi
  // alışverişi müşteri sayılmaz ve rapora yazılmaz.
  function recordIncomeTx(tx, { houseId, h, amount, kind, customerUid, products, materialsUsed, materialsIn, atMs }) {
    const type = h?.biz?.type;
    if (!type || !houseId) return null;
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
    return dayKey;
  }
  // Oyunun dükkânının geliri (sadece sıralama için). YAZMA.
  function recordGameIncomeTx(tx, { type, amount, kind, customerUid, products, materialsUsed, atMs }) {
    if (!GAME_VENUE_TYPES.includes(type)) return null;
    return recordIncomeTx(tx, { houseId: gameVenueId(type), h: { biz: { type }, ownerUid: GAME_VENUE_OWNER }, amount, kind, customerUid, products, materialsUsed, atMs });
  }

  // Gün kapanışı: türün gün sınırı geçtiyse dünkü kazanca göre sıra yazılır.
  // Saatlik ya da 00:05 / 19:05'te çağrılabilir; aynı gün için tekrar yazmaz.
  async function rollover(types = BIZ_TYPE_KEYS) {
    const t = now();
    const done = [];
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
      done.push({ type, dayKey: yKey, count: playerRows.length });
    }
    return done;
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
      if (!h.biz?.type || !items.length) {
        await d.ref.update({ bizShortagePending: false });
        continue;
      }
      if (h.bizShortage?.smsDay === today) continue;
      const batch = db.batch();
      batch.set(db.collection('users').doc(h.ownerUid).collection('messages').doc(), {
        text: `${BIZ_TYPES[h.biz.type]?.icon || '🏪'} ${h.name || 'Dükkân'} — stok bitiyor: ${items.map((k) => MATERIAL_NAMES[k] || k).join(', ')}`,
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

  return { recordIncomeTx, recordGameIncomeTx, rollover, dailyRef, sendShortageSms };
}
