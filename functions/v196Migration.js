// =============================================================================
// v196Migration.js — TEK SEFERLİK GEÇİŞ (Faz 1.2 + Faz 6)
// -----------------------------------------------------------------------------
// Oyuncu evleri, ofisleri ve işletmeleri kapanır (çeteler, karargahlar ve oyunun mekânları
// '__game__' / game_* hariç). Her şey iade edilir, malzeme makineleri elmas makinesine döner.
//
// ÇALIŞTIRMA (sadece index.js runV196MigrationNow — gizli anahtarlı adres; ASLA istemciden ya da
// girişte otomatik çağrılmaz, bkz. index.js runVehicleWeaponLifeCapMigration notu):
//   op=close     → kapanış modu (migrations/v196.closing, closingAtMs). Hediye hisse hakkı bu andaki
//                  duruma göre belirlenir.
//   op=dryRun    → HİÇBİR şeyi değiştirmeden plan çıkarır, migrations/v196Report'a yazar (toplamlar,
//                  en çok ödeme alan 50 oyuncu, sabit elmas / hisse senedi fiyatı). Rapor kimliği döner.
//   op=apply     → approve=<rapor kimliği> + yedek kaydı (migrations/v196.backup) şart. Raporun sabit
//                  fiyatlarıyla gerçek geçiş. Sayfalı: süre dolarsa {partial:true} döner, tekrar çağrılır.
//
// İADE DEFTERİ: migrations/v196/payouts/{uid} oyuncuya yapılan ödemeyle AYNI batch'te yazılır.
// Kayıt varsa oyuncu atlanır → yarıda kesilip yeniden çalışsa da kimse iki kez ödeme almaz.
// Çeteler için migrations/v196/gangPayouts/{world}_{gang} (aynı kural).
// Kaynak belgeler ancak defter yazıldıktan SONRA silinir (temizlik adımı, tekrar çalışması zararsız).
//
// MALİYET: tek seferlik. Okuma ≈ ilgili koleksiyonların belge sayısı (bir kez; yeniden çalışınca
// tarama tekrarlanır). Yazma ≈ ödeme alan oyuncu başına 3–6 (kullanıcı + defter + SMS + envanter /
// fabrika / hisse) + silinen belge sayısı. Batch'ler 400 yazmanın altında.
// =============================================================================

import { V196_ITEM_PRICES, V196_HOUSE_PRICE, V196_AMAZOR_PRICES, V196_MACHINE_BASE_PRICE, V196_MACHINE_PRICE_STEP, v196SurfacePrice } from './v196Prices.js';
import { V196_FLAG_DOC, VENUE_SHARE_TYPES, VENUE_CO_ID, VENUE_CO_NAME, GIFT_SHARES_PER_TYPE, REMOVED_DOOR_TYPES, DEFAULT_DOOR_TYPE, isRemovedKey, diamondMachinePriceOf, GANG_AUTO_SELL_CONTRABAND, GANG_AUTO_SELL_RATIO } from './v196Shared.js';

export const V196_REPORT_DOC = 'migrations/v196Report';
export const V196_PAYOUTS = 'migrations/v196/payouts';
export const V196_GANG_PAYOUTS = 'migrations/v196/gangPayouts';
export const MATERIAL_KEYS_V196 = ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme'];
export const MATERIAL_MACHINE_TYPES = ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme', 'yasakliMadde'];
const RETIRED_YASAKLI_MACHINE_VALUE = 100_000; // MACHINE_TYPES.yasakliMadde.price (v38'de emekli)
export const MATERIAL_BUYOUT_RATIO_V196 = 0.75;
const BORSA_UNITS = 1_000_000;
const BATCH_MAX = 380;
const TIME_BUDGET_MS = 470_000;
const GAME_OWNER = '__game__';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const cnt = (v) => Math.max(0, Math.floor(num(v)));
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// ---- SAF HESAPLAR -------------------------------------------------------------------------
export function tieredFleetValueV196(type, n) {
  const k = cnt(n);
  if (!k) return 0;
  if (type === 'yasakliMadde') return k * RETIRED_YASAKLI_MACHINE_VALUE;
  const base = V196_MACHINE_BASE_PRICE[type];
  if (!base) return 0;
  return k * base + (V196_MACHINE_PRICE_STEP * k * (k - 1)) / 2;
}
// Elmas makinesi fiyatı: (20 + 2 × ⌊sahip olunan/10⌋) × elmas fiyatı (v196Shared — kullanıcı kararı)
export const diamondMachinePrice = (owned, diamondPrice) => diamondMachinePriceOf(owned, diamondPrice);
// Faz 6.9: bütün malzeme makinelerinin değeri TEK havuzda; mevcut elmas makinesi sayısından başlanarak
// kademeli fiyatla yetebildiği kadar elmas makinesi, artan para iade. Vergi yok.
export function convertMachines(machinesByType, diamondPrice, ownedDiamond = 0) {
  let value = 0;
  for (const t of MATERIAL_MACHINE_TYPES) value += tieredFleetValueV196(t, machinesByType?.[t]);
  let left = value;
  let n = cnt(ownedDiamond);
  let given = 0;
  const D = num(diamondPrice);
  if (D > 0) {
    for (;;) {
      const p = diamondMachinePrice(n, D);
      if (!(p > 0) || p > left) break;
      left -= p;
      n += 1;
      given += 1;
    }
  }
  return { value, machines: given, refund: Math.round(left) };
}
export function materialBuyout(material, qty) {
  const p = num(V196_AMAZOR_PRICES[material]);
  return Math.floor(cnt(qty) * p * MATERIAL_BUYOUT_RATIO_V196);
}
const priceOfItem = (k) => V196_ITEM_PRICES[k] || null; // { t:'gold'|'gem', v }

// Ev / işletme sınıflandırması
export function houseClass(id, h) {
  if (!h) return 'none';
  if (String(id).startsWith('home_')) return 'home'; // v196 yeni kişisel ev
  if (h.hq?.gangId && h.hq?.worldId) return 'hq';
  const o = String(h.ownerUid || '');
  if (o.startsWith('gang_')) return 'hq';
  if (o === GAME_OWNER || h.bizGame || String(id).startsWith('game_')) return 'game';
  if (!o) return 'none';
  return 'player';
}

// ---- PLAN (saf): taranmış veri → oyuncu / çete ödemeleri ------------------------------------
// data: scan() çıktısı · cfg: { closingAtMs, diamondPrice, stockPrice, nowMs }
export function buildPlan(data, cfg) {
  const users = new Map();
  const gangs = new Map();
  const U = (uid) => {
    if (!users.has(uid)) users.set(uid, { uid, gold: 0, emerald: 0, contraband: 0, lines: {}, shares: {}, dm: 0, stock: null, houses: 0, notes: [], memberships: [] });
    return users.get(uid);
  };
  const add = (p, key, label, t, amt, n = 1) => {
    const v = Math.max(0, Math.round(num(amt)));
    if (!v && !n) return;
    const L = (p.lines[key] ||= { label, gold: 0, gem: 0, n: 0 });
    if (t === 'gem') {
      L.gem += v;
      p.emerald += v;
    } else {
      L.gold += v;
      p.gold += v;
    }
    L.n += n;
  };
  const G = (worldId, gangId) => {
    const k = `${worldId}_${gangId}`;
    if (!gangs.has(k)) gangs.set(k, { key: k, worldId, gangId, kasa: 0, gem: 0, lines: {}, hq: [], hqInv: null, depot: null, listings: [] });
    return gangs.get(k);
  };
  const gadd = (g, key, label, t, amt, n = 1) => {
    const v = Math.max(0, Math.round(num(amt)));
    const L = (g.lines[key] ||= { label, gold: 0, gem: 0, n: 0 });
    if (t === 'gem') {
      L.gem += v;
      g.gem += v;
    } else {
      L.gold += v;
      g.kasa += v;
    }
    L.n += n;
  };

  const playerHouses = new Map(); // id → h
  const ownedTypes = new Map(); // uid → Set(tür) — hediye hisse
  for (const { id, h } of data.houses || []) {
    const cls = houseClass(id, h);
    if (cls === 'player') {
      playerHouses.set(id, h);
      const p = U(h.ownerUid);
      p.houses += 1;
      add(p, 'ev', 'Ev / ofis / işletme', 'gold', V196_HOUSE_PRICE);
      // satın alınmış (p:1) eşyalar — deneme eşyaları sayılmaz
      for (const it of Array.isArray(h.items) ? h.items : []) {
        if (it?.p !== 1) continue;
        const pr = priceOfItem(it.k);
        if (pr) add(p, pr.t === 'gem' ? 'mobilyaGem' : 'mobilya', 'Mobilya', pr.t, pr.v);
      }
      const type = h.biz?.type;
      const opened = num(h.biz?.openedAtMs);
      if (VENUE_SHARE_TYPES.includes(type) && (!cfg.closingAtMs || !opened || opened <= cfg.closingAtMs)) {
        if (!ownedTypes.has(h.ownerUid)) ownedTypes.set(h.ownerUid, new Set());
        ownedTypes.get(h.ownerUid).add(type);
      }
    } else if (cls === 'hq') {
      const worldId = h.hq?.worldId;
      const gangId = h.hq?.gangId || String(h.ownerUid || '').replace(/^gang_/, '');
      if (!worldId || !gangId) continue;
      const g = G(worldId, gangId);
      const keep = [];
      let removed = 0;
      for (const it of Array.isArray(h.items) ? h.items : []) {
        if (it && isRemovedKey(it.k)) {
          removed += 1;
          if (it.p === 1) {
            const pr = priceOfItem(it.k);
            if (pr) gadd(g, pr.t === 'gem' ? 'hqMobilyaGem' : 'hqMobilya', 'Karargah mobilyası', pr.t, pr.v);
          }
          continue;
        }
        keep.push(it);
      }
      const door = h.door && typeof h.door === 'object' ? { ...h.door } : null;
      let doorFix = false;
      if (door && REMOVED_DOOR_TYPES.includes(door.t)) {
        door.t = DEFAULT_DOOR_TYPE;
        doorFix = true;
      }
      if (door?.main && !keep.some((x) => x.i === door.main)) {
        door.main = null;
        door.def = true;
        doorFix = true;
      }
      if (removed || doorFix) g.hq.push({ houseId: id, items: removed ? keep : null, door: doorFix ? door : null, removed });
    }
  }
  // hediye hisse: sahip olunan her tür için 10
  for (const [uid, set] of ownedTypes) {
    const p = U(uid);
    for (const t of set) p.shares[t] = GIFT_SHARES_PER_TYPE;
  }

  // envanter (oyuncu) + karargah envanteri (gang_*)
  for (const { id, d } of data.houseInventories || []) {
    if (String(id).startsWith('gang_')) {
      // karargah: sadece kaldırılan eşyalar
      const hqh = (data.houses || []).find((x) => houseClass(x.id, x.h) === 'hq' && x.h.ownerUid === id);
      if (!hqh) continue;
      const g = G(hqh.h.hq.worldId, hqh.h.hq.gangId);
      const items = { ...(d.items || {}) };
      let changed = false;
      for (const [k, n] of Object.entries(items)) {
        if (!isRemovedKey(k) || !(cnt(n) > 0)) continue;
        const pr = priceOfItem(k);
        if (pr) gadd(g, pr.t === 'gem' ? 'hqMobilyaGem' : 'hqMobilya', 'Karargah mobilyası', pr.t, pr.v * cnt(n), cnt(n));
        delete items[k];
        changed = true;
      }
      if (changed) g.hqInv = { path: `houseInventories/${id}`, items };
      continue;
    }
    const p = U(id);
    for (const [k, n] of Object.entries(d.items || {})) {
      const q = cnt(n);
      const pr = priceOfItem(k);
      if (q && pr) add(p, pr.t === 'gem' ? 'mobilyaGem' : 'mobilya', 'Mobilya', pr.t, pr.v * q, q);
    }
    for (const [type, field] of [['wall', 'walls'], ['floor', 'floors']]) {
      for (const k of Array.isArray(d[field]) ? d[field] : []) {
        const pr = v196SurfacePrice(type, k);
        if (pr) add(p, pr.t === 'gem' ? 'kaplamaGem' : 'kaplama', 'Duvar / zemin kaplaması', pr.t, pr.v);
      }
    }
  }
  // mobilya kasası
  for (const { id, d } of data.houseFunds || []) {
    const h = playerHouses.get(id);
    const owner = h?.ownerUid || d.ownerUid;
    if (!owner || String(owner).startsWith('gang_') || owner === GAME_OWNER) continue;
    if (!h && !d.ownerUid) continue;
    const p = U(owner);
    if (num(d.gold) > 0) add(p, 'kasa', 'Mobilya kasası', 'gold', d.gold);
    if (num(d.gem) > 0) add(p, 'kasaGem', 'Mobilya kasası', 'gem', d.gem);
  }
  // mobilya pazarı: açık ilan → mağaza fiyatı (ilan fiyatı DEĞİL)
  for (const { d } of data.furnListings || []) {
    if (d.status !== 'open' || !d.sellerUid) continue;
    const pr = priceOfItem(d.k);
    if (pr) add(U(d.sellerUid), pr.t === 'gem' ? 'pazarGem' : 'pazar', 'Mobilya pazarı ilanı', pr.t, pr.v);
  }
  // dükkân stokları: alış fiyatı (paid)
  for (const { id, d } of data.shopStocks || []) {
    const owner = playerHouses.get(id)?.ownerUid || d.ownerUid;
    if (!owner || owner === GAME_OWNER) continue;
    const paid = Object.values(d.paid || {}).reduce((a, n) => a + Math.max(0, Math.round(num(n))), 0);
    if (paid > 0) add(U(owner), 'stok', 'Dükkân stoğu', 'gold', paid, Object.values(d.items || {}).reduce((a, n) => a + cnt(n), 0));
  }
  // malzemeler (envanter) + açık malzeme ilanları — AMAZOR × %75
  for (const { uid, k, d } of data.materials || []) {
    const q = cnt(d.quantity);
    if (q && MATERIAL_KEYS_V196.includes(k)) add(U(uid), 'malzeme', 'Malzeme', 'gold', materialBuyout(k, q), q);
  }
  for (const { id, d } of data.businessInventories || []) {
    const owner = playerHouses.get(id)?.ownerUid || d?.ownerUid;
    if (!owner || owner === GAME_OWNER || String(owner).startsWith('gang_')) continue;
    for (const [k, n] of Object.entries(d?.materials || {})) {
      const q = cnt(typeof n === 'object' && n ? n.quantity ?? n.qty : n);
      if (q && MATERIAL_KEYS_V196.includes(k)) add(U(owner), 'malzeme', 'Malzeme', 'gold', materialBuyout(k, q), q);
    }
  }
  for (const { d } of data.materialListings || []) {
    if (d.sold || d.itemType !== 'material' || !d.sellerId) continue;
    const q = cnt(d.quantity);
    if (q && MATERIAL_KEYS_V196.includes(d.materialType)) add(U(d.sellerId), 'malzeme', 'Malzeme', 'gold', materialBuyout(d.materialType, q), q);
  }
  // gazino makine kasaları + depolar: altın + yasaklı madde
  for (const { id, d } of [...(data.casinoMachines || []), ...(data.depots || [])]) {
    const owner = d.ownerUid;
    if (!owner || owner === GAME_OWNER || String(id).startsWith('game_')) continue;
    const p = U(owner);
    if (num(d.gold) > 0) add(p, 'kasaMekan', 'Gazino / depo kasası', 'gold', d.gold);
    const ym = cnt(d.yasakliMadde);
    if (ym) {
      p.contraband += ym;
      (p.lines.ym ||= { label: 'Yasaklı madde', gold: 0, gem: 0, n: 0 }).n += ym;
    }
  }
  // oyuncu gazinosu piyangoları (çekilmemiş): biletler iade (kullanıcı kararı)
  for (const lot of data.casinoLotteries || []) {
    const total = cnt(lot.d.totalTickets);
    const money = Math.max(0, Math.round(num(lot.d.jackpot) + num(lot.d.ownerCut)));
    if (!total || !money) continue;
    let paid = 0;
    const ts = lot.tickets || [];
    ts.forEach((t, i) => {
      const c = cnt(t.count);
      const amt = i === ts.length - 1 ? money - paid : Math.floor((money * c) / total);
      paid += amt;
      if (t.uid && amt > 0) add(U(t.uid), 'piyango', 'Piyango bileti iadesi', 'gold', amt, c);
    });
  }
  // internet kafe / ofis dakika kredileri (kalan kredi)
  for (const { d } of data.netSessions || []) {
    const h = playerHouses.get(d.houseId);
    if (!h || !d.uid || d.uid === h.ownerUid) continue;
    const leftMs = num(d.creditUntilMs) - num(cfg.nowMs);
    const amt = Math.floor((Math.max(0, leftMs) / 60_000) * num(d.lastPrice));
    if (amt > 0) add(U(d.uid), 'kredi', 'Dakika kredisi', 'gold', amt);
  }
  // makineler → elmas makinesi
  for (const [uid, byType] of Object.entries(data.machines || {})) {
    const c = convertMachines(byType, cfg.diamondPrice, data.diamondOwned?.[uid] || 0);
    if (!c.value) continue;
    const p = U(uid);
    p.dm = c.machines;
    p.machineValue = c.value;
    p.machineCounts = byType;
    if (c.refund > 0) add(p, 'makine', 'Makine değeri (artan)', 'gold', c.refund);
    else (p.lines.makine ||= { label: 'Makine değeri (artan)', gold: 0, gem: 0, n: 0 });
  }
  // yatırımlardaki hisse senedi: o anki fiyattan, komisyonsuz
  for (const { uid, d } of data.stockHolders || []) {
    const units = num(d.stockHoldings);
    if (!(units > 1e-9)) continue;
    const gold = Math.floor(units * num(cfg.stockPrice));
    const p = U(uid);
    p.stock = { units, gold };
    if (gold > 0) add(p, 'hisseSenedi', 'Hisse senedi satışı', 'gold', gold);
  }
  // spor üyelikleri (oyuncu salonu): oyunun salonunda tamamlanır, ödeme eski sahibe (eski kural)
  for (const { id, d } of data.gymMemberships || []) {
    if (d.status !== 'active' || !playerHouses.has(d.gymId)) continue;
    U(d.uid).memberships.push(id);
  }
  // çete: depo kapasitesi iadesi + depodaki mallar ve 2. el ilanları otomatik satılır
  for (const gd of data.gangDepots || []) {
    const g = G(gd.worldId, gd.gangId);
    const cap = cnt(gd.d.capacity);
    if (cap > 0) gadd(g, 'depoKapasite', 'Depo kapasitesi iadesi', 'gold', Math.floor(cap / 100) * 100_000, Math.floor(cap / 100));
    const items = gd.d.items || {};
    let sale = 0;
    let units = 0;
    for (const [k, q] of Object.entries(items)) {
      const n = cnt(q);
      if (!n) continue;
      const v = gangAutoSellValue(k, data.catalogs);
      sale += v * n;
      units += n;
    }
    if (sale > 0) gadd(g, 'depoSatis', 'Depodaki mallar (otomatik satış)', 'gold', sale, units);
    g.depot = { path: gd.path };
  }
  for (const gl of data.gangListings || []) {
    const g = G(gl.worldId, gl.d.gangId);
    g.listings.push(gl.path);
    // mal zaten depoda sayıldı (listed ⊂ items) — burada ayrıca satılmaz
  }
  // sonuçta 0 olanlar ve hiçbir şeyi olmayanlar elenir
  for (const [uid, p] of users) {
    const has = p.gold > 0 || p.emerald > 0 || p.contraband > 0 || p.dm > 0 || Object.keys(p.shares).length || p.houses || p.memberships.length || p.stock;
    if (!has) users.delete(uid);
  }
  return { users, gangs, playerHouses };
}

export function gangAutoSellValue(itemKey, catalogs) {
  const s = String(itemKey);
  if (s === 'yasakliMadde') return GANG_AUTO_SELL_CONTRABAND;
  if (s.startsWith('silah:')) return Math.floor(num(catalogs?.WEAPON_CATALOG?.[Number(s.slice(6))]?.price) * GANG_AUTO_SELL_RATIO);
  if (s.startsWith('araba:')) return Math.floor(num(catalogs?.VEHICLE_CATALOG?.[Number(s.slice(6))]?.price) * GANG_AUTO_SELL_RATIO);
  return 0;
}

// Tek özet SMS (kalem başına ayrı mesaj YOK)
export function summarySms(p) {
  const parts = [];
  const lines = Object.values(p.lines).filter((l) => l.gold > 0 || l.gem > 0 || (l.label === 'Yasaklı madde' && l.n > 0));
  const merged = new Map();
  for (const l of lines) {
    const m = merged.get(l.label) || { gold: 0, gem: 0, n: 0 };
    m.gold += l.gold;
    m.gem += l.gem;
    m.n += l.n;
    merged.set(l.label, m);
  }
  for (const [label, m] of merged) {
    if (label === 'Yasaklı madde') parts.push(`• ${label}: ${fmt(m.n)} adet`);
    else parts.push(`• ${label}: ${[m.gold ? `${fmt(m.gold)} altın` : null, m.gem ? `${fmt(m.gem)} zümrüt` : null].filter(Boolean).join(' + ')}`);
  }
  if (p.dm > 0) parts.push(`• Malzeme makinelerin ${fmt(p.dm)} elmas makinesine dönüştü`);
  const sh = Object.entries(p.shares);
  if (sh.length) parts.push(`• Hediye hisse: ${sh.map(([t, n]) => `${n} ${VENUE_CO_NAME[t]}`).join(', ')}`);
  if (p.memberships.length) parts.push('• Bugünkü spor üyeliğin Oyunun Spor Salonu\'nda tamamlanır');
  const total = [p.gold ? `${fmt(p.gold)} altın` : null, p.emerald ? `${fmt(p.emerald)} zümrüt` : null].filter(Boolean).join(' + ');
  return (
    '🏙️ Neon Şehir büyük güncellemesi: oyuncu evleri, ofisleri ve işletmeleri kapandı; malzeme pazarı, işçi sistemi ve yatırımlardaki hisse senedi kalktı. Haritadaki bütün mekânlar artık oyunun, herkese 3 katlı ev verildi.\n' +
    (parts.length ? `İadelerin:\n${parts.join('\n')}` : '') +
    (total ? `\nToplam: ${total} hesabına yattı.` : '')
  );
}

export function planTotals(plan, cfg) {
  const t = { players: 0, gold: 0, emerald: 0, contraband: 0, diamondMachines: 0, shares: {}, stockUnits: 0, stockGold: 0, machineRefund: 0, houses: 0, gangs: 0, gangKasa: 0, gangGem: 0, byLine: {} };
  const top = [];
  for (const p of plan.users.values()) {
    t.players += 1;
    t.gold += p.gold;
    t.emerald += p.emerald;
    t.contraband += p.contraband;
    t.diamondMachines += p.dm;
    t.houses += p.houses;
    for (const [k, n] of Object.entries(p.shares)) t.shares[k] = (t.shares[k] || 0) + n;
    if (p.stock) {
      t.stockUnits += p.stock.units;
      t.stockGold += p.stock.gold;
    }
    t.machineRefund += p.lines.makine?.gold || 0;
    for (const [k, l] of Object.entries(p.lines)) {
      const b = (t.byLine[k] ||= { label: l.label, gold: 0, gem: 0, n: 0 });
      b.gold += l.gold;
      b.gem += l.gem;
      b.n += l.n;
    }
    top.push({
      uid: p.uid,
      gold: p.gold,
      emerald: p.emerald,
      stockUnits: p.stock?.units || 0,
      diamondMachines: p.dm,
      machineRefund: p.lines.makine?.gold || 0,
      shares: p.shares,
      houses: p.houses,
    });
  }
  for (const g of plan.gangs.values()) {
    if (!(g.kasa || g.gem || g.hq.length || g.hqInv || g.depot || g.listings.length)) continue;
    t.gangs += 1;
    t.gangKasa += g.kasa;
    t.gangGem += g.gem;
  }
  top.sort((a, b) => b.gold - a.gold || b.emerald - a.emerald);
  return { totals: { ...t, moneyIn: t.gold + t.gangKasa, diamondPrice: cfg.diamondPrice, stockPrice: cfg.stockPrice }, top50: top.slice(0, 50) };
}

// ---- FIRESTORE ---------------------------------------------------------------------------
export function createV196Migration({ db, FieldValue, catalogs, log = console, now = () => Date.now(), timeBudgetMs = TIME_BUDGET_MS, recursiveDelete = null, batchMax = BATCH_MAX }) {
  const flagRef = () => db.doc(V196_FLAG_DOC);
  const reportRef = () => db.doc(V196_REPORT_DOC);
  const rdel = recursiveDelete || ((ref) => db.recursiveDelete(ref));

  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, path: d.ref.path, ref: d.ref, d: d.data() || {} }));
  async function all(q) {
    return rows(await q.get());
  }
  // Büyük koleksiyonu belge kimliğine göre sayfa sayfa okur
  async function paged(col, size = 1000) {
    const out = [];
    let last = null;
    for (;;) {
      let q = col.orderBy('__name__').limit(size);
      if (last) q = q.startAfter(last);
      const s = await q.get();
      out.push(...rows(s));
      if (s.size < size) break;
      last = s.docs[s.docs.length - 1].id;
    }
    return out;
  }

  async function scan() {
    const t0 = now();
    const [houses, houseInventories, houseFunds, furnListings, shopStocks, casinoMachines, depots, netSessions, gymMemberships] = await Promise.all([
      paged(db.collection('houses')),
      paged(db.collection('houseInventories')),
      paged(db.collection('houseFunds')),
      all(db.collection('furnListings').where('status', '==', 'open')),
      paged(db.collection('shopStocks')),
      paged(db.collection('casinoMachines')),
      paged(db.collection('depots')),
      paged(db.collection('netSessions')),
      all(db.collection('gymMemberships').where('status', '==', 'active')),
    ]);
    // v124 öncesi dükkân malzemeleri (businessInventories/{evId}.materials) — %75 ile alınır
    const businessInventories = await paged(db.collection('businessInventories'));
    const lotDocs = await all(db.collection('casinoLottery').where('drawnAt', '==', null));
    const casinoLotteries = [];
    for (const l of lotDocs) casinoLotteries.push({ ...l, tickets: (await all(l.ref.collection('tickets'))).map((t) => t.d) });
    // malzemeler: users/{uid}/inventory/{malzeme}
    const inv = await all(db.collectionGroup('inventory'));
    const materials = inv
      .filter((r) => MATERIAL_KEYS_V196.includes(r.id) && r.path.split('/')[0] === 'users' && r.path.split('/').length === 4)
      .map((r) => ({ uid: r.path.split('/')[1], k: r.id, d: r.d, path: r.path }));
    const materialListings = await all(db.collection('marketplaceListings').where('sold', '==', false).where('itemType', '==', 'material'));
    const shopListings = (await all(db.collection('marketplaceListings').where('sold', '==', false))).filter((r) => r.d.shopHouseId);
    // fabrika makineleri (malzeme türleri)
    const machineRows = await all(db.collectionGroup('machines').where('type', 'in', MATERIAL_MACHINE_TYPES));
    const machines = {};
    const machinePaths = [];
    for (const m of machineRows) {
      const parts = m.path.split('/');
      if (parts[0] !== 'factories' || parts.length !== 4) continue;
      const uid = parts[1];
      (machines[uid] ||= {})[m.d.type] = ((machines[uid] ||= {})[m.d.type] || 0) + 1;
      machinePaths.push({ uid, path: m.path });
    }
    const factories = await all(db.collection('factories').where('dm.n', '>', 0));
    const diamondOwned = Object.fromEntries(factories.map((f) => [f.id, cnt(f.d.dm?.n)]));
    const stockHolders = (await all(db.collection('users').where('stockHoldings', '>', 0))).map((r) => ({ uid: r.id, d: r.d }));
    // vitrin (eski): dükkândaki oyuncu silah / araçları
    const vitrin = [...(await all(db.collection('weapons').orderBy('shopHouseId'))), ...(await all(db.collection('vehicles').orderBy('shopHouseId')))];
    // açık yayınlar
    const streams = await all(db.collection('streams').where('status', '==', 'live'));
    // çeteler: depo + 2. el ilanları
    const priv = await all(db.collectionGroup('private'));
    const gangDepots = priv
      .filter((r) => r.id === 'depot' && /^gangWorlds\/[^/]+\/gangs\/[^/]+\/private\/depot$/.test(r.path))
      .map((r) => ({ worldId: r.path.split('/')[1], gangId: r.path.split('/')[3], path: r.path, d: r.d }));
    const mk = await all(db.collectionGroup('market').where('status', '==', 'open'));
    const gangListings = mk.filter((r) => /^gangWorlds\/[^/]+\/market\/[^/]+$/.test(r.path)).map((r) => ({ worldId: r.path.split('/')[1], path: r.path, d: r.d }));
    return {
      scanMs: now() - t0,
      houses: houses.map((r) => ({ id: r.id, h: r.d })),
      houseInventories,
      houseFunds,
      furnListings,
      shopStocks,
      casinoMachines,
      depots,
      netSessions,
      gymMemberships,
      casinoLotteries,
      materials,
      businessInventories,
      materialListings,
      shopListings,
      machines,
      machinePaths,
      diamondOwned,
      stockHolders,
      vitrin,
      streams,
      gangDepots,
      gangListings,
      catalogs,
    };
  }

  async function readFlag() {
    const s = await flagRef().get();
    return s.exists ? s.data() : {};
  }

  async function close() {
    const f = await readFlag();
    if (f.closing && f.closingAtMs) return { ok: true, already: true, closingAtMs: f.closingAtMs };
    const at = now();
    await flagRef().set({ closing: true, closingAtMs: at }, { merge: true });
    return { ok: true, closingAtMs: at };
  }

  async function recordBackup({ path, operation = null, manual = false }) {
    const at = now();
    await flagRef().set({ backup: { path: String(path || ''), operation, manual: Boolean(manual), atMs: at, ok: Boolean(manual) } }, { merge: true });
    return { ok: true, atMs: at };
  }
  async function markBackupDone(ok, error = null) {
    await flagRef().set({ backup: { ok: Boolean(ok), doneAtMs: now(), error } }, { merge: true });
  }

  async function dryRun({ prices }) {
    const f = await readFlag();
    if (!f.closingAtMs) return { ok: false, error: 'Önce kapanış modu açılmalı (op=close).' };
    const data = await scan();
    const cfg = { closingAtMs: f.closingAtMs, diamondPrice: num(prices.diamondPrice), stockPrice: num(prices.stockPrice), nowMs: now() };
    const plan = buildPlan(data, cfg);
    const { totals, top50 } = planTotals(plan, cfg);
    const reportId = `r${now().toString(36)}`;
    const counts = {
      houses: data.houses.length,
      playerHouses: plan.playerHouses.size,
      houseInventories: data.houseInventories.length,
      furnListings: data.furnListings.length,
      shopStocks: data.shopStocks.length,
      materials: data.materials.length,
      materialListings: data.materialListings.length,
      machines: data.machinePaths.length,
      stockHolders: data.stockHolders.length,
      casinoLotteries: data.casinoLotteries.length,
      netSessions: data.netSessions.length,
      gangDepots: data.gangDepots.length,
      gangListings: data.gangListings.length,
      streams: data.streams.length,
      vitrin: data.vitrin.length,
    };
    const gangTop = [...plan.gangs.values()].sort((a, b) => b.kasa - a.kasa).slice(0, 20).map((g) => ({ key: g.key, kasa: g.kasa, gem: g.gem, hqFix: g.hq.length }));
    const report = { reportId, createdAtMs: now(), closingAtMs: f.closingAtMs, cfg, totals, top50, gangTop, counts, scanMs: data.scanMs };
    await reportRef().set(report); // dryRun'ın TEK yazması (oyuncu verisine dokunulmaz)
    return { ok: true, reportId, totals, counts };
  }

  // ---- APPLY -----------------------------------------------------------------------------
  async function apply({ approve }) {
    const started = now();
    const f = await readFlag();
    if (!f.closingAtMs) return { ok: false, error: 'Kapanış modu açık değil.' };
    if (!f.backup?.ok) return { ok: false, error: 'Yedek alınmadı ya da yedek bitmedi (op=backup / op=backupStatus).' };
    const rep = (await reportRef().get()).data();
    if (!rep || !approve || rep.reportId !== approve) return { ok: false, error: 'Onaylanan rapor kimliği (approve) son dryRun raporuyla eşleşmiyor. Önce dryRun çalıştır, raporu onayla.' };
    if (f.appliedAtMs) return { ok: true, done: true, already: true };
    const cfg = { ...rep.cfg, nowMs: now() };
    const data = await scan();
    const plan = buildPlan(data, cfg);
    const outOfTime = () => now() - started > timeBudgetMs;
    await flagRef().set({ applying: true, applyStartedAtMs: f.applyStartedAtMs || started, reportId: rep.reportId }, { merge: true });

    // 1) oyuncu ödemeleri — defterde olan atlanır
    const doneIds = new Set((await db.collection(V196_PAYOUTS).listDocuments()).map((r) => r.id));
    const piyasa = (await db.doc('borsa/piyasa').get()).data() || {};
    const userIds = [...plan.users.keys()].sort();
    const userExists = new Map();
    let paidNow = 0;
    let batch = db.batch();
    let ops = 0;
    let coInc = {};
    const flush = async () => {
      if (!ops) return;
      for (const [co, inc] of Object.entries(coInc)) {
        batch.set(db.doc('borsa/piyasa'), { co: { [co]: { u: FieldValue.increment(inc.u), h: FieldValue.increment(inc.h) } } }, { merge: true });
      }
      await batch.commit();
      batch = db.batch();
      ops = 0;
      coInc = {};
    };
    for (const uid of userIds) {
      if (doneIds.has(uid)) continue;
      if (outOfTime()) {
        await flush();
        return { ok: true, partial: true, paidNow, phase: 'payouts' };
      }
      const p = plan.users.get(uid);
      if (!userExists.has(uid)) userExists.set(uid, (await db.collection('users').doc(uid).get()).exists);
      const exists = userExists.get(uid);
      const need = 6 + Object.keys(p.shares).length + p.memberships.length;
      if (ops + need > batchMax) await flush();
      const ledger = {
        uid,
        atMs: now(),
        reportId: rep.reportId,
        gold: p.gold,
        emerald: p.emerald,
        contraband: p.contraband,
        lines: p.lines,
        shares: p.shares,
        diamondMachines: p.dm,
        machineValue: p.machineValue || 0,
        machineCounts: p.machineCounts || null,
        stock: p.stock,
        houses: p.houses,
        memberships: p.memberships,
        orphan: !exists,
      };
      batch.set(db.collection(V196_PAYOUTS).doc(uid), ledger);
      ops += 1;
      if (exists) {
        const userPatch = { houseCount: 0, bizPassive: FieldValue.delete() };
        if (p.gold > 0) {
          userPatch.gold = FieldValue.increment(p.gold);
          userPatch.goldTag = `v196|${now().toString(36)}${uid.slice(0, 4)}`;
        }
        if (p.emerald > 0) userPatch.emerald = FieldValue.increment(p.emerald);
        if (p.stock) {
          userPatch.stockHoldings = 0;
          userPatch.stockCostBasis = 0;
          userPatch['investCost.stock'] = 0;
        }
        for (const [t, n] of Object.entries(p.shares)) {
          const co = VENUE_CO_ID[t];
          const A = String(piyasa.co?.[co]?.A || '0');
          userPatch[`borsa.${co}`] = { u: n * BORSA_UNITS, a: A, pq: '0', b: 0, bd: null, c: 0, gift: true };
          const inc = (coInc[co] ||= { u: 0, h: 0 });
          inc.u += n * BORSA_UNITS;
          inc.h += 1;
        }
        batch.update(db.collection('users').doc(uid), userPatch);
        ops += 1;
        if (p.contraband > 0) {
          batch.set(db.doc(`users/${uid}/inventory/yasakliMadde`), { quantity: FieldValue.increment(p.contraband) }, { merge: true });
          ops += 1;
        }
        if (p.dm > 0) {
          batch.set(db.doc(`factories/${uid}`), { dm: { n: FieldValue.increment(p.dm) } }, { merge: true });
          ops += 1;
        }
        batch.set(db.collection('users').doc(uid).collection('messages').doc(`v196_${uid}`), { text: summarySms(p), createdAt: FieldValue.serverTimestamp(), read: false, type: 'v196' });
        ops += 1;
        for (const mid of p.memberships) {
          batch.update(db.collection('gymMemberships').doc(mid), { gymId: 'game_spor', gymName: 'Oyunun Spor Salonu', v196: true });
          ops += 1;
        }
      }
      paidNow += 1;
    }
    await flush();

    // 2) çeteler
    const gDone = new Set((await db.collection(V196_GANG_PAYOUTS).listDocuments()).map((r) => r.id));
    for (const g of plan.gangs.values()) {
      if (gDone.has(g.key)) continue;
      if (!(g.kasa || g.gem || g.hq.length || g.hqInv || g.depot || g.listings.length)) continue;
      if (outOfTime()) return { ok: true, partial: true, paidNow, phase: 'gangs' };
      const b = db.batch();
      const stateRef = db.doc(`gangWorlds/${g.worldId}/gangs/${g.gangId}/private/state`);
      const st = await stateRef.get();
      b.set(db.collection(V196_GANG_PAYOUTS).doc(g.key), { ...g, atMs: now(), reportId: rep.reportId });
      if (st.exists && (g.kasa || g.gem)) {
        b.update(stateRef, { ...(g.kasa ? { kasa: FieldValue.increment(g.kasa) } : {}), ...(g.gem ? { gem: FieldValue.increment(g.gem) } : {}) });
        const before = num(st.data()?.kasa);
        for (const [k, l] of Object.entries(g.lines)) {
          if (!(l.gold > 0)) continue;
          b.set(db.collection(`gangWorlds/${g.worldId}/ledger`).doc(), { type: `v196_${k}`, amount: l.gold, from: { kind: 'state', id: 'main' }, to: { kind: 'gang', id: g.gangId }, refId: 'v196', before, actorId: 'system', atMs: now(), dateKey: null });
        }
        const txt = `🔄 v196 güncellemesi: ${Object.values(g.lines).filter((l) => l.gold > 0 || l.gem > 0).map((l) => `${l.label} ${[l.gold ? `${fmt(l.gold)} altın` : null, l.gem ? `${fmt(l.gem)} zümrüt` : null].filter(Boolean).join(' + ')}`).join(' · ')} çete kasasına yattı.`;
        b.set(db.collection(`gangWorlds/${g.worldId}/gangs/${g.gangId}/chat_genel`).doc(), { system: true, authorId: 'system', authorName: 'Sistem', text: txt, createdAtMs: now() });
      }
      for (const hq of g.hq) {
        const patch = {};
        if (hq.items) patch.items = hq.items;
        if (hq.door) patch.door = hq.door;
        if (Object.keys(patch).length) b.update(db.doc(`houses/${hq.houseId}`), patch);
      }
      if (g.hqInv) b.update(db.doc(g.hqInv.path), { items: g.hqInv.items });
      if (g.depot) b.set(db.doc(g.depot.path), { items: {}, listed: {}, capacity: 0, usedUnits: 0, reservedUnits: 0, v196: true }, { merge: true });
      for (const lp of g.listings) b.update(db.doc(lp), { status: 'cancelled', cancelledAtMs: now(), cancelReason: 'v196' });
      await b.commit();
    }

    // 3) temizlik (defterden SONRA) — tekrar çalışması zararsız
    const cleanup = await cleanupSources(data, plan, outOfTime);
    if (cleanup.partial) return { ok: true, partial: true, paidNow, phase: 'cleanup' };

    await flagRef().set({ applying: false, appliedAtMs: now() }, { merge: true });
    const actual = planTotals(plan, cfg).totals;
    await reportRef().set({ applied: { atMs: now(), totals: actual } }, { merge: true });
    return { ok: true, done: true, paidNow, totals: actual };
  }

  async function deletePaths(paths, outOfTime) {
    let b = db.batch();
    let n = 0;
    for (const p of paths) {
      if (outOfTime()) {
        if (n) await b.commit();
        return { partial: true };
      }
      b.delete(db.doc(p));
      n += 1;
      if (n >= BATCH_MAX) {
        await b.commit();
        b = db.batch();
        n = 0;
      }
    }
    if (n) await b.commit();
    return { partial: false };
  }

  async function cleanupSources(data, plan, outOfTime) {
    const ph = plan.playerHouses;
    const paths = [];
    // oyuncu evlerinin yan belgeleri
    for (const id of ph.keys()) paths.push(`houseFunds/${id}`, `shopStocks/${id}`, `depots/${id}`, `depotView/${id}`, `businessInventories/${id}`, `venueWaiters/${id}`, ...['slot', 'rulet', 'kart'].map((m) => `casinoMachines/${id}_${m}`));
    data.houseInventories.filter((r) => !String(r.id).startsWith('gang_')).forEach((r) => paths.push(r.path));
    data.furnListings.forEach((r) => paths.push(r.path));
    data.materials.forEach((r) => paths.push(r.path));
    data.machinePaths.forEach((m) => paths.push(m.path));
    data.netSessions.filter((r) => ph.has(r.d.houseId)).forEach((r) => paths.push(r.path));
    paths.push('furnMarket/main');
    // tüm kalkan koleksiyonlar (oyuncu kısmı)
    for (const col of ['shopOffers', 'bizSpend', 'officeSpend', 'officeDaily', 'bizIdle']) (await db.collection(col).listDocuments()).forEach((r) => paths.push(r.path));
    for (const col of ['businessDaily', 'businessRollups']) (await db.collection(col).listDocuments()).filter((r) => !r.id.startsWith('game_') && !/^(silahci|galeri|motogaleri|modifiye|spor|cafe|bar|internet|gazino|depo)_game/.test(r.id)).forEach((r) => {
      // businessDaily/{houseId}_{gün}: oyuncu evine ait olanlar
      const hid = r.id.replace(/_\d{4}-\d{2}-\d{2}$/, '');
      if (col === 'businessDaily' ? ph.has(hid) : !r.id.includes('game')) paths.push(r.path);
    });
    const presence = await db.collection('housePresence').listDocuments();
    for (const r of presence) {
      const s = await r.get();
      if (ph.has(s.data()?.houseId)) paths.push(r.path);
    }
    if ((await deletePaths([...new Set(paths)], outOfTime)).partial) return { partial: true };
    // ilanlar: malzeme + dükkân ilanları kapanır, vitrin ürünleri sahibine döner (cezasız)
    let b = db.batch();
    let n = 0;
    const put = async (fn) => {
      fn(b);
      n += 1;
      if (n >= BATCH_MAX) {
        await b.commit();
        b = db.batch();
        n = 0;
      }
    };
    for (const r of [...data.materialListings, ...data.shopListings]) await put((x) => x.update(r.ref, { sold: true, cancelled: true, expireAtMs: FieldValue.delete() }));
    for (const r of data.vitrin) await put((x) => x.update(r.ref, { listed: false, shopHouseId: FieldValue.delete(), shopListingId: FieldValue.delete(), shopAddedDayKey: FieldValue.delete() }));
    for (const r of data.streams) if (ph.has(r.d.houseId)) await put((x) => x.update(r.ref, { v196End: true }));
    if (n) await b.commit();
    // evler + piyangolar (alt koleksiyonlarıyla)
    for (const id of ph.keys()) {
      if (outOfTime()) return { partial: true };
      await rdel(db.doc(`houses/${id}`));
    }
    for (const l of data.casinoLotteries) {
      if (outOfTime()) return { partial: true };
      await rdel(l.ref);
    }
    return { partial: false };
  }

  async function status() {
    const f = await readFlag();
    const rep = (await reportRef().get()).data() || null;
    const payouts = (await db.collection(V196_PAYOUTS).listDocuments()).length;
    return { ok: true, flag: f, report: rep ? { reportId: rep.reportId, createdAtMs: rep.createdAtMs, totals: rep.totals, applied: rep.applied || null } : null, payouts };
  }

  return { scan, close, dryRun, apply, status, recordBackup, markBackupDone };
}
