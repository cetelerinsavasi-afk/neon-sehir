// v195 — istemci: pasif mekân listelerde görünmez (ek okuma yok), ömür / tamir sabitleri tek
// kaynaktan (functions/itemRules.js), çete sipariş hakkı sunucuyla aynı, ekran yazıları güncel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBizPassive } from '../../functions/bizPassive.js';
import { GANG_RULES } from '../../src/components/Gangs/gangConstants.js';
import { GANG } from '../../functions/gang/config.js';

const src = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('pasif mekân: liste kancaları zaten okunan ev belgesindeki bayrakla süzer (mekân başına okuma yok)', () => {
  for (const f of ['hooks/useBusinessList.js', 'hooks/useOfficeList.js', 'components/Gangs/DepoSellSheet.jsx']) {
    const s = code(f);
    assert.match(s, /isBizPassive\(/, f);
    assert.doesNotMatch(s, /private\/meta|lastSeenAtMs/, `${f}: istemci giriş kaydı okumaz`);
  }
  // depo listesinde pasif depo görünümü (depotView) hiç okunmaz: süzme okumadan ÖNCE
  const d = code('components/Gangs/DepoSellSheet.jsx');
  assert.ok(d.indexOf('isBizPassive(') < d.indexOf("getDoc(doc(db, 'depotView'"));
  assert.equal(isBizPassive({ ownerUid: 'u', biz: { type: 'silahci', passive: true } }), true);
  assert.equal(isBizPassive({ ownerUid: 'u', kind: 'ofis', office: { passive: true } }), true);
  assert.equal(isBizPassive({ ownerUid: 'u', biz: { type: 'silahci' } }), false);
  assert.equal(isBizPassive({ ownerUid: '__game__', bizGame: true, biz: { type: 'spor', passive: true } }), false);
});

test('ömür / tamir: VehicleCard ikiz sabitleri kaldırıldı, itemRules\'tan gelir; ekranda "20 gün / +2" kalmadı', () => {
  const vc = code('components/VehicleCard/VehicleCard.jsx');
  assert.match(vc, /from '\.\.\/\.\.\/\.\.\/functions\/itemRules\.js'/);
  assert.doesNotMatch(vc, /INITIAL_LIFE_DAYS = 20|REPAIR_LIFE_BONUS_DAYS = 2/);
  const ws = code('components/Workshop/Workshop.jsx');
  assert.match(ws, /canRepairVehicle\(/);
  assert.match(ws, /canUpgradeVehicle\(/);
  assert.match(ws, /lifeCapOf\(itemType, item\)/);
  assert.doesNotMatch(ws, /ömrü 20 gün/);
  const mk = code('components/MarketplaceScreen/MarketplaceScreen.jsx');
  assert.match(mk, /canUpgradeVehicle\(catalogId\)/, 'ticaride seviye çarpanı yok');
  assert.match(mk, /lifeCapOf\('vehicle', l\.vehicleCatalogId\)/, 'sıfır ilan tavanı katalog no ile');
  const city = code('components/City/CityScreen.jsx');
  assert.doesNotMatch(city, /\/ 20 gün|lifeDays \?\? 20/);
  assert.match(city, /vehicleLifeCap\(f\.cid\)/);
});

test('çete yasaklı madde: istemci sabiti sunucudan (3.750 = üye başına 3 adet); rehber güncel', () => {
  assert.equal(GANG_RULES.CONTRABAND_ORDER_PER_MEMBER, GANG.CONTRABAND_ORDER_PER_MEMBER);
  assert.equal(GANG_RULES.CONTRABAND_ORDER_PER_MEMBER, 3000); // v196
  const g = src('components/GuideScreen/guideContent.js');
  assert.match(g, /her üye için 3 adet/);
  assert.doesNotMatch(g, /üye sayısı × 1\.250/);
});

test('gazete: genel duyuru (duyuru türü) haber metnine girer', () => {
  const s = code('components/NewspaperScreen/NewspaperScreen.jsx');
  assert.match(s, /e\.type === 'duyuru'/);
  assert.match(s, /Duyuru: \$\{e\.message\}/);
});
