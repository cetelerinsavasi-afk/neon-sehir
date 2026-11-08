// v145 — seyyar satıcılar: 3D mekân verisi, menü, devlet geliri (Ticaret Bakanlığı)
import test from 'node:test';
import assert from 'node:assert/strict';
import { VENUES } from '../venueLayouts.js';
import { VENDORS, VENDOR_IDS, VENDOR_COST, vendorVenueKey } from '../vendorData.js';
import { HOUSE_PRODUCTS, HOUSE_TAKEABLES, ITEM_PRICES, VENUE_FREE_TAKE_KEYS } from '../houseCatalogData.js';
import { STATE_IN, stateWrite } from '../stateTreasury.js';
import { ministryOfCat } from '../belediyeRates.js';
import { ministryReport } from '../belediye.js';
import { HEIST_STAT_TARGETS, heistTargetKey } from '../policeRules.js';

test('v145: dört seyyar satıcının her biri kendi 3D mekânına bağlı (harita kimliği ↔ mekân)', () => {
  assert.deepEqual(VENDOR_IDS.sort(), ['seyyar_satici_1', 'seyyar_satici_2', 'seyyar_satici_3', 'seyyar_satici_4']);
  const keys = new Set();
  for (const id of VENDOR_IDS) {
    const key = vendorVenueKey(id);
    const v = VENUES[key];
    assert.ok(v, `${id} mekânı yok`);
    assert.equal(v.vendor, id);
    assert.equal(v.outdoor, true);
    assert.equal(v.light, true, 'eski 2D konum kaydı tutulmaz (ek Firestore yok)');
    assert.ok(/^game_/.test(v.houseId));
    keys.add(key);
    // arabanın önünde 3 buton: alışveriş · haraç · menü; satıcı NPC'si arabaya bağlı
    const st = Object.entries(v.stations);
    assert.equal(st.length, 1);
    assert.deepEqual(st[0][1].map((a) => a.act).sort(), ['buy', 'harac', 'menu']);
    const npc = v.npcs.find((n) => n.station === st[0][0]);
    assert.ok(npc && npc.act === 'vendor' && npc.lines.length >= 3);
    // satıcının arabası eşyadan ücretsiz ürün vermez (mekânda ücretli)
    const cart = v.items.find((x) => x.i === st[0][0]);
    assert.ok(!VENUE_FREE_TAKE_KEYS.includes(cart.k));
    assert.ok(v.items.every((x) => x.k !== 'caysemaver' && x.k !== 'watercooler'), 'mekânda bedava çay/su olmasın');
  }
  assert.equal(keys.size, 4, 'her satıcının tasarımı ayrı');
});

test('v145: menü ürünleri gerçek ürün (elde çizimi/etiketi var), fiyatlar pozitif; günlük alışveriş 1.000', () => {
  assert.equal(VENDOR_COST, 1000);
  for (const id of VENDOR_IDS) {
    const v = VENDORS[id];
    assert.ok(HOUSE_PRODUCTS[v.product], `${v.product} ürünü yok`);
    assert.ok(Object.prototype.hasOwnProperty.call(v.menu, v.product), 'satıcının kendi ürünü menüde');
    for (const [k, p] of Object.entries(v.menu)) {
      assert.ok(HOUSE_PRODUCTS[k], `${k} ürünü yok`);
      assert.ok(Number.isInteger(p) && p > 0 && p < VENDOR_COST);
    }
    assert.ok(Object.keys(v.menu).includes('ayran') || Object.keys(v.menu).includes('cay'));
  }
});

test('v145: yeni arabalar mağazada fiyatlı, ürünleri alınabilir; mekân şeritleri satılmaz', () => {
  for (const k of ['kokorecarabasi', 'donerarabasi', 'simittezgahi', 'koftearabasi', 'plastikmasa', 'plastiktabure', 'korkuluk', 'neon_kokorec', 'neon_doner', 'neon_simit', 'neon_kofte']) assert.ok(ITEM_PRICES[k], `${k} fiyatsız`);
  for (const k of ['vz_yol', 'vz_yaya', 'vz_deniz']) assert.equal(ITEM_PRICES[k], undefined);
  assert.deepEqual(HOUSE_TAKEABLES.kokorecarabasi, ['kokorec', 'ayran']);
  assert.deepEqual(HOUSE_TAKEABLES.koftearabasi, ['kofte', 'ayran']);
});

test('v145: seyyar satıcı geliri devlet defterine "seyyar_satis" (Ticaret Bakanlığı) olarak yazılır', () => {
  assert.ok(STATE_IN.seyyar_satis);
  assert.equal(ministryOfCat('in', 'seyyar_satis'), 'ticaret');
  const writes = [];
  const writer = { set: (ref, data) => writes.push({ path: ref.path, data }) };
  const db = { collection: (c) => ({ doc: (d) => ({ path: `${c}/${d}` }) }), doc: (p) => ({ path: p }) };
  const FieldValue = { increment: (n) => ({ inc: n }) };
  const n = stateWrite(writer, db, FieldValue, { kind: 'in', cat: 'seyyar_satis', amount: 1000, dayKey: '2026-11-08', shard: 3, stat: { sy_n: 1, sy_kk_n: 1, sy_kk_ciro: 1000 } });
  assert.equal(n, 1000);
  assert.equal(writes.length, 1, 'gelir yazması kasa sayacına dokunmaz (sadece gider)');
  assert.equal(writes[0].path, 'stateLedger/2026-11-08_s3');
  assert.deepEqual(writes[0].data.in, { seyyar_satis: { inc: 1000 } });
  assert.deepEqual(writes[0].data.stat.sy_kk_ciro, { inc: 1000 });
  const rep = ministryReport({ in: { seyyar_satis: 1250, vergi_fabrika: 10 }, out: {} });
  assert.equal(rep.ministries.ticaret.in, 1250);
  assert.equal(rep.ministries.ticaret.lines[0].label, 'Seyyar satıcı satışları');
});

test('v145: haraç istatistiği değişmedi (seyyar satıcılar tek kalem)', () => {
  assert.ok(HEIST_STAT_TARGETS.includes('seyyar'));
  for (const id of VENDOR_IDS) assert.equal(heistTargetKey(id), 'seyyar');
});
