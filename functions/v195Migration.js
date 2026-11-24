// =============================================================================
// v195Migration.js — TEK SEFERLİK: araba + ticari ömür tavanı 20 → 10 gün
// -----------------------------------------------------------------------------
// Bayrak: migrations/vehicleLifeCap10 (doneAtMs). Bayrak varsa hiçbir şey okunmaz/yazılmaz.
// Kapsam (kullanıcı kuralı):
//   • Araba (1–10) ve ticari (11–15) araçlardan lifeDays > 10 olanların lifeDays'i 10 olur.
//     10 ve altına dokunulmaz. repairsUsed değişmez. Silah ve motorlara DOKUNULMAZ.
//   • Açık 2. el ilanında (sold:false) dondurulmuş vehicleLifeDays > 10 ise 10 olur.
//   • Yeni banda göre fiyatı tavanın (itemListingBand.max) üstünde kalan açık araç ilanının
//     fiyatı yeni tavana çekilir. İlan sahibine hiçbir şey kesilmez / ödenmez.
//   • Tek genel duyuru (gazete) — araç başına SMS yok.
// Okuma: vehicles koleksiyonu bir kez (N belge) + açık araç ilanları bir kez (L belge) + bayrak.
// Yazma: değişen araç + değişen ilan sayısı kadar (400'lük batch'ler) + bayrak + duyuru.
// Tekrar çalışması zararsız (idempotent): kurallar zaten 10'a inmiş / tavanda olanı değiştirmez.
// ASLA her girişte ya da App.jsx'ten çağrılmaz (bkz. index.js runVehicleWeaponLifeCapMigration
// notu) — sadece index.js runV195MigrationNow (gizli anahtarlı URL) çağırır.
// =============================================================================

import { VEHICLE_WEAPON_INITIAL_LIFE_DAYS, itemListingBand } from './itemRules.js';
import { isCarId, isTicariId } from './vehicleKinds.js';

export const V195_FLAG_ID = 'vehicleLifeCap10';
export const V195_CAP = VEHICLE_WEAPON_INITIAL_LIFE_DAYS; // 10
export const inV195Scope = (cid) => isCarId(cid) || isTicariId(cid);

// Saf: bir araç belgesinin yaması (null = değişmez)
export function vehiclePatchV195(v) {
  if (!v || !inV195Scope(v.catalogId)) return null;
  const life = v.lifeDays;
  if (typeof life !== 'number' || !(life > V195_CAP)) return null;
  return { lifeDays: V195_CAP };
}
// Saf: açık araç ilanının yaması. vehicle: ilandaki aracın (varsa) GÜNCEL belgesi (yaması uygulanmış).
export function listingPatchV195(l, vehicle = null) {
  if (!l || l.sold || l.itemType !== 'vehicle') return null;
  const cid = Number(l.vehicleCatalogId ?? vehicle?.catalogId);
  if (!inV195Scope(cid)) return null;
  const patch = {};
  const frozen = l.vehicleLifeDays;
  const life = typeof frozen === 'number' && frozen > V195_CAP ? V195_CAP : frozen;
  if (life !== frozen) patch.vehicleLifeDays = life;
  // bant: ilandaki dondurulmuş alanlar (2. el ilanı bu değerlerle açıldı) — yeni sabitlerle
  const band = itemListingBand('vehicle', {
    catalogId: cid,
    lifeDays: life ?? vehicle?.lifeDays,
    repairsUsed: l.vehicleRepairsUsed ?? vehicle?.repairsUsed ?? 0,
    raceLevel: l.vehicleRaceLevel ?? vehicle?.raceLevel,
    gearUpgraded: l.vehicleGearUpgraded ?? vehicle?.gearUpgraded,
    tankUpgraded: l.vehicleTankUpgraded ?? vehicle?.tankUpgraded,
  });
  const price = Math.floor(Number(l.price) || 0);
  if (band.max > 0 && price > band.max) patch.price = band.max;
  return Object.keys(patch).length ? patch : null;
}

export function createV195Migration({ db, FieldValue, log = console, announce = async () => {}, now = () => Date.now() }) {
  const flagRef = () => db.collection('migrations').doc(V195_FLAG_ID);

  // 400 işlemlik batch; batch düşerse (araç arada değişti) o parça tek tek işlemle yeniden denenir
  async function commitChunks(items, applyOne) {
    let ok = 0;
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach((x) => batch.update(x.ref, x.patch, ...(x.updateTime ? [{ lastUpdateTime: x.updateTime }] : [])));
      try {
        await batch.commit();
        ok += chunk.length;
      } catch (err) {
        log.warn?.('v195 geçiş: batch yeniden deneniyor (tek tek)', err?.message || err);
        for (const x of chunk) {
          try {
            if (await applyOne(x)) ok += 1;
          } catch (e) {
            log.error?.(`v195 geçiş: ${x.ref.path}`, e?.message || e);
          }
        }
      }
    }
    return ok;
  }

  async function run({ force = false } = {}) {
    const t = now();
    // bayrağı işin başında işlem içinde al (iki çağrı aynı anda çalışmasın)
    const claimed = await db.runTransaction(async (tx) => {
      const s = await tx.get(flagRef());
      const d = s.exists ? s.data() : null;
      if (d?.doneAtMs && !force) return false;
      if (d?.runningAtMs && t - d.runningAtMs < 9 * 60_000 && !force) return false;
      tx.set(flagRef(), { runningAtMs: t }, { merge: true });
      return true;
    });
    if (!claimed) return { ok: true, skipped: true };

    // --- 1) araçlar (tek tam tarama) ---
    const vs = await db.collection('vehicles').get();
    const vById = new Map();
    const vWork = [];
    vs.docs.forEach((d) => {
      const v = d.data();
      const patch = vehiclePatchV195(v);
      vById.set(d.id, patch ? { ...v, ...patch } : v);
      if (patch) vWork.push({ ref: d.ref, patch, updateTime: d.updateTime || null, id: d.id });
    });
    const vehiclesDone = await commitChunks(vWork, (x) =>
      db.runTransaction(async (tx) => {
        const s = await tx.get(x.ref);
        const p = s.exists ? vehiclePatchV195(s.data()) : null;
        if (p) tx.update(x.ref, p);
        return Boolean(p);
      })
    );

    // --- 2) açık araç ilanları (tek sorgu) ---
    const ls = await db.collection('marketplaceListings').where('itemType', '==', 'vehicle').where('sold', '==', false).get();
    const lWork = [];
    let lifeFixed = 0;
    let priceCapped = 0;
    ls.docs.forEach((d) => {
      const l = d.data();
      const patch = listingPatchV195(l, l.vehicleId ? vById.get(String(l.vehicleId)) : null);
      if (!patch) return;
      if ('vehicleLifeDays' in patch) lifeFixed += 1;
      if ('price' in patch) priceCapped += 1;
      lWork.push({ ref: d.ref, patch, updateTime: d.updateTime || null });
    });
    const listingsDone = await commitChunks(lWork, (x) =>
      db.runTransaction(async (tx) => {
        const s = await tx.get(x.ref);
        const p = s.exists ? listingPatchV195(s.data()) : null;
        if (p) tx.update(x.ref, p);
        return Boolean(p);
      })
    );

    const summary = {
      vehiclesRead: vs.size,
      listingsRead: ls.size,
      vehiclesCapped: vehiclesDone,
      listingsUpdated: listingsDone,
      listingLifeFixed: lifeFixed,
      listingPriceCapped: priceCapped,
    };
    log.log?.(`v195 geçiş (vehicleLifeCap10): ${JSON.stringify(summary)}`);
    const first = !(await flagRef().get()).data()?.announcedAtMs;
    if (first) {
      await announce(
        '🚗 Araç ömrü güncellendi: arabalar ve ticari araçlar artık 10 gün ömür + 10 tamir hakkıyla geliyor (her tamir +1 gün). Ticari araçlar da tamir edilebiliyor. Ömrü 10 günden fazla olan araba ve ticari araçların ömrü 10 güne çekildi; tamir hakların aynen duruyor. Motorlar ve silahlar değişmedi.'
      );
    }
    await flagRef().set({ doneAtMs: now(), runningAtMs: FieldValue.delete(), ...(first ? { announcedAtMs: now() } : {}), summary }, { merge: true });
    return { ok: true, ...summary };
  }

  return { run };
}
