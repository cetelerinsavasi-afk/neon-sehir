// v202 — fiyata eklenen vergi, kalkan vergiler, soygun ekibi güç şartı, saygı kaldırma
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { venueIncomeSplit, addonTaxOf, isAddonTaxVenue, VENUE_ADDON_TAX_TYPES } from '../v196Shared.js';
import { RATE_ITEMS, RATE_BY_ID, DEFAULT_RATES, resolveRates, validateNext } from '../belediyeRates.js';
import { fleetTaxOf, TICARI_TAX_RATE_ID } from '../fleet.js';
import { collectTaxFrac, splitCollect } from '../borsa.js';

test('fiyata eklenen vergi: 100 → müşteri 110, devlete 10, masraf 50, hissedara 50', () => {
  assert.equal(addonTaxOf(100, 0.1), 10);
  const sp = venueIncomeSplit(100, 0.1, { addon: true });
  assert.deepEqual([sp.gross, sp.tax, sp.expense, sp.share], [100, 10, 50, 50]);
  // eski sistem (kafe / bar / internet): 100 → 10 vergi + 50 masraf + 40 hissedar
  const old = venueIncomeSplit(100, 0.1);
  assert.deepEqual([old.tax, old.expense, old.share], [10, 50, 40]);
  assert.deepEqual([...VENUE_ADDON_TAX_TYPES].sort(), ['galeri', 'modifiye', 'motogaleri', 'silahci', 'spor', 'tamirci']);
  for (const t of ['cafe', 'bar', 'internet']) assert.equal(isAddonTaxVenue(t), false, t);
  // oran %50 ile sınırlı, negatif yok
  assert.equal(addonTaxOf(1000, 0.9), 500);
  assert.equal(addonTaxOf(1000, -1), 0);
});

test('belediye: yeni adlar aynı kimliklerle; Ticari Araç Vergisi yeni; Hisse ve Şirket vergisi kalktı', () => {
  assert.equal(RATE_BY_ID.isGaleri.label, 'Araba Vergisi');
  assert.equal(RATE_BY_ID.isSilahci.label, 'Silah Vergisi');
  assert.equal(RATE_BY_ID.isModifiye.label, 'Modifiye Vergisi');
  assert.equal(RATE_BY_ID.isSpor.label, 'Spor Salonu Vergisi');
  assert.equal(RATE_BY_ID.isTamirci.label, 'Tamirci Vergisi');
  assert.equal(RATE_BY_ID.isMotoGaleri.label, 'Motor Vergisi');
  assert.equal(RATE_BY_ID[TICARI_TAX_RATE_ID].label, 'Ticari Araç Vergisi');
  assert.equal(DEFAULT_RATES.ticariArac, 10);
  assert.equal(RATE_ITEMS.some((x) => x.id === 'hisse' || x.id === 'sirket'), false);
  // eski kayıtlı oran seti (hisse / sirket içerir, ticariArac yok) sorunsuz çözülür ve doğrulanır
  const stored = { byDay: { '2026-11-01': { ...DEFAULT_RATES, isGaleri: 12, hisse: 15, sirket: 9, ticariArac: undefined } } };
  const r = resolveRates(stored, '2026-11-25');
  assert.equal(r.isGaleri, 12);
  assert.equal(r.ticariArac, 10);
  assert.equal(r.hisse, undefined);
  assert.equal(validateNext(r, r), null);
});

test('ticari araç vergisi alıcıya; hisse geliri toplarken vergi yok', () => {
  assert.equal(fleetTaxOf(100_000, 0.1), 10_000);
  assert.equal(collectTaxFrac({ kofteci: 100 }, 0.2), 0);
  const c = splitCollect(10_000, collectTaxFrac({ kofteci: 1 }, 0.1), 0);
  assert.equal(c.tax, 0);
  assert.equal(c.pay, 10_000);
});

test('soygun ekibi: kurmak / katılmak için hedef gücün 1/10\'u; sonradan atma yok; saygı işlemi yok', () => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.ok(src.includes('const heistTeamMinPower = (target) => Math.ceil((HEIST_CONFIG[target]?.requiredPower || 0) / 10);'));
  assert.ok(src.includes('assertHeistTeamPower(target, myPower); // v202'), 'kurarken');
  assert.ok(src.includes('if (plan.creatorUid !== uid) assertHeistTeamPower(plan.target, myPower);'), 'katılırken');
  const sys = readFileSync(new URL('../gang/system.js', import.meta.url), 'utf8');
  assert.equal(sys.includes('giveRespect'), false);
});
