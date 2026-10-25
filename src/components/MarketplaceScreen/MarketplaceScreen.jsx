import { resaleTax } from '../../../functions/tax.js';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { resaleRateFrac } from '../../../functions/belediyeRates.js';
import { useEffect, useRef, useState } from 'react';
import { buyGangListing, useAdPrice, useGangMarketListings } from '../Gangs/GangMarketSection';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { useMaterialHoldings } from '../../hooks/useMaterialHoldings';
import { useMarketplaceListings } from '../../hooks/useMarketplaceListings';
import { useSellerShopNames } from '../../hooks/useSellerShopNames';
import {
  createListing,
  instantSellListing,
  cancelListing,
  buyListing,
  advertiseListing,
} from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { weaponCatalog } from '../../data/weaponCatalog';
import { MAX_REPAIRS, vehicleDisplayName, lifeCapOf, repairBonusOf } from '../VehicleCard/VehicleCard';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './MarketplaceScreen.css';
import { ListingCarStats } from '../RaceTrackScreen/CarStats';
import { autoSellsAt, AUTO_SELL_HINT, itemCancelPenalty, ITEM_CANCEL_PENALTY_TEXT } from '../../lib/autoSell';
import ConfirmModal from '../ConfirmModal/ConfirmModal';

const MATERIAL_LABELS = {
  tamirMalzemesi: 'Tamir Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  arabaGelistirme: 'Araba Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
};
const MACHINE_LABELS = {
  mining: 'Mining Makinesi',
  tamirMalzemesi: 'Tamir Malzemesi Makinesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi Makinesi',
  arabaGelistirme: 'Araba Geliştirme Malzemesi Makinesi',
  yasakliMadde: 'Yasaklı Madde Üretim Makinesi',
};
const MATERIAL_EMOJIS = {
  mining: '⛏️',
  tamirMalzemesi: '🔧',
  silahUpgrade: '🔫',
  arabaGelistirme: '🚗',
  yasakliMadde: '💊',
};

const TABS = [
  { id: 'vehicle', label: 'Araç' },
  { id: 'weapon', label: 'Silah' },
];
// v124 — 2. el'de artık sadece araç + silah. Malzemeler "Mağaza"da (fabrika /
// silahçı / modifiyeci envanterinden açılır); makine ilanı yok.
const MARKET_TYPES = new Set(TABS.map((t) => t.id));

// CATEGORIES — pazar tasarımı yenilenirken eklendi (kullanıcı revizesi):
// eski üstteki sekme çubuğu kaldırıldı, yerine ana sayfada 2x2 dizilen 4
// kare kategori butonu geldi. TABS ile aynı id'leri paylaşıyor (SellForm
// zaten itemType olarak bunları kullanıyor), sadece görsel/etiket farklı.
// v124 — "Sıfır": ömrü tam dolu VE tamir hakkı hiç kullanılmamış araç / silah ilanı
function isBrandNewListing(l) {
  if (l.itemType === 'vehicle') return Number(l.vehicleLifeDays ?? -1) >= lifeCapOf('vehicle') && Number(l.vehicleRepairsUsed || 0) === 0;
  if (l.itemType === 'weapon') return Number(l.weaponLifeDays ?? -1) >= lifeCapOf('weapon') && Number(l.weaponRepairsUsed || 0) === 0;
  return false;
}

const CATEGORIES = [
  { id: 'vehicle', label: 'Araçlar', emoji: '🚗' },
  { id: 'weapon', label: 'Silahlar', emoji: '🔫' },
];

// AD_DURATION_MS — functions/index.js advertiseListing ile aynı. Ücret v96'dan
// beri değişken (useAdPrice, functions/marketAds.js).
const AD_DURATION_MS = 24 * 60 * 60 * 1000;

// Fiyat sınırları — hesaplar arası para aklamayı önlemek için backend'de
// de AYNI kurallarla doğrulanıyor (bkz. functions/index.js createListing).
// Burası sadece kullanıcıya yol göstermek için.
const AMAZOR_PRICES = { tamirMalzemesi: 10, silahUpgrade: 100, arabaGelistirme: 500, yasakliMadde: 2500 };
const MACHINE_PRICES = { tamirMalzemesi: 100000, silahUpgrade: 50000, arabaGelistirme: 50000, yasakliMadde: 100000 };

// v58: silahta tavan 10 gün / tamir +1, araçta 20 / +2 (bkz. VehicleCard lifeCapOf)

// MATERIAL_QUICK_AMOUNTS — KULLANICI REVİZESİ (Amazor/Liman/2. el sitesi
// hepsinde aynı): "1 ve 5 butonunu kaldıralım, 1000 butonu ekleyelim,
// sadece tamir malzemesi için 10.000 butonu da ekleyelim." Burada hem
// "Kaç Adet Alacaksın?" (BuyMaterialModal) hem "Satılacak Miktarı Belirle"
// (malzeme ilanı) adımlarında kullanılıyor.
const MATERIAL_QUICK_AMOUNTS_BASE = [10, 100, 1000];
const MATERIAL_QUICK_AMOUNTS_BY_TYPE = {
  tamirMalzemesi: [...MATERIAL_QUICK_AMOUNTS_BASE, 10000],
};
function materialQuickAmountsFor(materialType) {
  return MATERIAL_QUICK_AMOUNTS_BY_TYPE[materialType] || MATERIAL_QUICK_AMOUNTS_BASE;
}

// 2. el satış değeri artık hem ömür hem kalan tamir hakkı birlikte
// hesaplanıyor (bkz. functions/index.js valueRatioOf, 2. sürüm) — burası
// sadece kullanıcıya fiyat aralığı önermek için bir ayna, gerçek doğrulama
// backend'de yapılıyor.
// valueRatioFromLife — valueRatio(item)'ın gövdesi, ham lifeDays/repairsUsed
// değerlerini alacak şekilde ayrıştırıldı (kullanıcı revizesi — "Avantajlı
// Ürünler" paneli için: canlı araç/silah objesi değil, market ilanının
// KENDİ dondurulmuş alanlarından (vehicleLifeDays/vehicleRepairsUsed vb.)
// aynı oranı yeniden hesaplamamız gerekiyor, bkz. listingCeilingPrice).
function valueRatioFromLife(lifeDays, repairsUsed, kind = 'vehicle') {
  const cap = lifeCapOf(kind);
  const bonus = repairBonusOf(kind);
  const remainingRepairs = Math.max(0, MAX_REPAIRS - (repairsUsed || 0));
  const life = Math.max(0, lifeDays ?? cap);
  const combined = remainingRepairs * bonus + life;
  const maxCombined = MAX_REPAIRS * bonus + cap;
  return Math.max(0, Math.min(1, combined / maxCombined));
}

function valueRatio(item, kind = 'vehicle') {
  return valueRatioFromLife(item?.lifeDays, item?.repairsUsed, kind);
}

function vehiclePriceRange(vehicle) {
  const base = vehicleCatalog.find((v) => v.id === vehicle.catalogId)?.price || 0;
  // v86: sunucuyla aynı — araç seviyesi (raceLevel; eski vites/depo geliştirmeleri seviyeye sayılır)
  const mult = vehicleLevelOf(vehicle.raceLevel, vehicle.gearUpgraded, vehicle.tankUpgraded);
  const max = Math.round(base * mult * valueRatio(vehicle));
  return { min: Math.floor(max / 2), max };
}

function weaponPriceRange(weapon) {
  const base = weaponCatalog.find((w) => w.id === weapon.catalogId)?.price || 0;
  const mult = weapon.level || 1;
  const max = Math.round(base * mult * valueRatio(weapon, 'weapon'));
  return { min: Math.floor(max / 2), max };
}

function materialUnitPriceRange(materialType) {
  const max = AMAZOR_PRICES[materialType];
  return { min: Math.floor(max / 2), max };
}


// --- v86 — TAHMİNİ DEĞER (araç / silah): ÖMÜR + GELİŞİM ---
// Değer = mağaza fiyatı × seviye × (kalan ömür birimi / toplam ömür birimi).
// Kalan ömür birimi = kalan gün + kalan tamir hakkı × tamirin verdiği gün:
//   • Silah: 10 gün + 10 tamir × 1 gün = 20 birim → her gün değerin 1/20'si düşer
//   • Araç : 20 gün + 10 tamir × 2 gün = 40 birim → her gün değerin 1/40'ı düşer
// Ömrü ve tamir hakları tam bir ürün = mağaza fiyatı × seviye (100.000'lik
// silah seviye 1: 100.000 · seviye 2: 200.000 · seviye 3: 300.000; araç da aynı).
// İlan fiyat sınırı (en yüksek fiyat) da aynı formül (bkz. functions/itemRules.js
// itemListingBand) → tahmini değer = o ürünün satılabileceği en yüksek fiyat.
function estimateValue({ kind, catalogId, repairsUsed, lifeDays, level }) {
  const catalog = kind === 'vehicle' ? vehicleCatalog : weaponCatalog;
  const base = catalog.find((x) => x.id === catalogId)?.price || 0;
  const lvl = Math.max(1, Math.min(3, Number(level) || 1));
  const max = base * lvl;
  const cap = lifeCapOf(kind);
  const bonus = repairBonusOf(kind);
  const total = cap + MAX_REPAIRS * bonus;
  const life = Math.max(0, Math.min(cap, lifeDays ?? cap));
  const left = life + Math.max(0, MAX_REPAIRS - (repairsUsed || 0)) * bonus;
  const pct = Math.max(0, Math.min(1, left / total));
  return { value: Math.round(max * pct), pct, max, left, total, level: lvl };
}
const vehicleLevelOf = (raceLevel, gearUp, tankUp) => (Number.isInteger(raceLevel) && raceLevel >= 1 ? raceLevel : 1 + (gearUp ? 1 : 0) + (tankUp ? 1 : 0));
function estimateOfListing(l) {
  // çete ürünleri yeni ve değer kaybetmez → tahmini değer = en yüksek fiyat
  if (l.gang) {
    const est = l.itemType === 'vehicle' ? estimateValue({ kind: 'vehicle', catalogId: l.vehicleCatalogId }) : estimateValue({ kind: 'weapon', catalogId: l.weaponCatalogId });
    return { ...est, value: est.max, pct: 1 };
  }
  if (l.itemType === 'vehicle')
    return estimateValue({ kind: 'vehicle', catalogId: l.vehicleCatalogId, repairsUsed: l.vehicleRepairsUsed, lifeDays: l.vehicleLifeDays, level: vehicleLevelOf(l.vehicleRaceLevel, l.vehicleGearUpgraded, l.vehicleTankUpgraded) });
  if (l.itemType === 'weapon') return estimateValue({ kind: 'weapon', catalogId: l.weaponCatalogId, repairsUsed: l.weaponRepairsUsed, lifeDays: l.weaponLifeDays, level: l.weaponLevel });
  return null;
}
function EstimateLine({ est }) {
  if (!est || !est.max) return null;
  return (
    <span className="market-estimate">
      💡 Tahmini değer: <strong>{est.value.toLocaleString('tr-TR')} altın</strong>
      {est.total ? (
        <small className="market-estimate-why">
          {' '}
          · seviye {est.level} · ömür {est.left}/{est.total} (%{Math.round(est.pct * 100)})
        </small>
      ) : null}
    </span>
  );
}

// --- "Avantajlı Ürünler" paneli — kullanıcı revizesi ---
// "burada fiyatı tavan fiyatının %75'inin altında olan ürünler
// listelenecek" — tavan fiyat, o SPESİFİK ilanın (aracın/silahın ömrü,
// tamir hakkı, yükseltmesi dahil) kendi max fiyatı; malzeme/makinede ise
// sabit katalog tavanı. Sistem ilanları (Anında Sat ile oluşan) her
// zaman kendi tavanının ~%50-55'ine satıldığı için otomatik olarak bu
// listeye giriyor — ekstra bir kod gerekmedi, aynı formülü kullanmak
// yetiyor.
const ADVANTAGEOUS_THRESHOLD_RATIO = 0.75;

// v84 — "Yetersiz altın": paraya yetmeyen ürünün Satın Al butonunda gösterilir
// (eskiden hata en altta kalıyor, fark edilmiyordu). Sunucu yine doğrular.
const NO_GOLD_TEXT = 'Yetersiz altın';
const NO_GOLD_MS = 2600;
const isNoGoldError = (err) => /yetersiz altın|yeterli altın/i.test(String(err?.message || err || ''));
// Bu ilanı (malzemede: en az 1 adedini) almaya param yetmiyor mu?
function cannotAfford(listing, gold) {
  if (gold == null || !Number.isFinite(Number(gold))) return false;
  const cost = listing.itemType === 'material' ? listing.unitPrice || Math.round(listing.price / (listing.quantity || 1)) : listing.price;
  return Number(cost || 0) > Number(gold);
}

function listingCeilingPrice(listing) {
  if (listing.itemType === 'vehicle') {
    const base = vehicleCatalog.find((v) => v.id === listing.vehicleCatalogId)?.price || 0;
    const mult =
      listing.vehicleGearUpgraded && listing.vehicleTankUpgraded
        ? 3
        : listing.vehicleGearUpgraded || listing.vehicleTankUpgraded
          ? 2
          : 1;
    return Math.round(base * mult * valueRatioFromLife(listing.vehicleLifeDays, listing.vehicleRepairsUsed));
  }
  if (listing.itemType === 'weapon') {
    const base = weaponCatalog.find((w) => w.id === listing.weaponCatalogId)?.price || 0;
    const mult = listing.weaponLevel || 1;
    return Math.round(base * mult * valueRatioFromLife(listing.weaponLifeDays, listing.weaponRepairsUsed, 'weapon'));
  }
  if (listing.itemType === 'material') {
    return AMAZOR_PRICES[listing.materialType] || 0;
  }
  if (listing.itemType === 'machine') {
    return MACHINE_PRICES[listing.machineType] || 0;
  }
  return 0;
}

// Malzemede karşılaştırma ADET fiyatı üzerinden, diğerlerinde toplam
// ilan fiyatı üzerinden yapılıyor (bkz. ListingCard'daki aynı ayrım).
function listingComparablePrice(listing) {
  if (listing.itemType === 'material') {
    return listing.unitPrice || Math.round(listing.price / (listing.quantity || 1));
  }
  return listing.price || 0;
}

function isAdvantageousListing(listing) {
  const ceiling = listingCeilingPrice(listing);
  if (!ceiling) return false;
  return listingComparablePrice(listing) < ceiling * ADVANTAGEOUS_THRESHOLD_RATIO;
}

// --- "Reklam Verilen Ürünler" paneli ---
function isAdvertisedListing(listing) {
  return Boolean(listing.adExpiresAt) && listing.adExpiresAt.toMillis() > Date.now();
}

function adRemainingLabel(listing) {
  const remainingMs = (listing.adExpiresAt?.toMillis() || 0) - Date.now();
  const hours = Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));
  return hours <= 1 ? '1 saatten az kaldı' : `${hours} saat kaldı`;
}

function vehicleImage(catalogId) {
  return vehicleCatalog.find((v) => v.id === catalogId)?.image;
}
function weaponImage(catalogId) {
  return weaponCatalog.find((w) => w.id === catalogId)?.image;
}

function listingLabel(listing) {
  if (listing.itemType === 'vehicle') {
    return `${listing.vehicleModel}${listing.gang && listing.quantity > 1 ? ` · ${listing.quantity} adet` : ''}`;
  }
  if (listing.itemType === 'weapon') {
    if (listing.gang && listing.quantity > 1) return `${listing.weaponName} (Güç ${listing.weaponPower?.toLocaleString('tr-TR')}) · ${listing.quantity} adet`;
    return listing.weaponLevel > 1
      ? `${listing.weaponName} (Sv. ${listing.weaponLevel}, Güç ${listing.weaponPower?.toLocaleString('tr-TR')} — geliştirilmiş)`
      : `${listing.weaponName} (Güç ${listing.weaponPower?.toLocaleString('tr-TR')})`;
  }
  if (listing.itemType === 'material')
    return `${MATERIAL_LABELS[listing.materialType] || listing.materialType} · ${listing.quantity} adet mevcut`;
  if (listing.itemType === 'machine') return MACHINE_LABELS[listing.machineType] || listing.machineType;
  return 'Ürün';
}

function SellForm({ onCreated, onClose, initialItemType }) {
  const { vehicles } = useVehicles();
  const { weapons } = useWeapons();

  const [itemType, setItemType] = useState(MARKET_TYPES.has(initialItemType) ? initialItemType : 'vehicle');
  // v127: 2. el vergisi türe göre (Ticaret Bakanlığı) — sunucu resaleTax(…, itemType)
  const rates = useBelediyeRates();
  const rTax = (v) => resaleTax(v, itemType, rates);
  const [selectedId, setSelectedId] = useState('');
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sellableVehicles = vehicles.filter((v) => !v.mortgaged && !v.seizedByBank && !v.listed);
  const sellableWeapons = weapons.filter((w) => !w.listed);

  const priceRange = (() => {
    if (itemType === 'vehicle') {
      const v = sellableVehicles.find((x) => x.id === selectedId);
      return v ? vehiclePriceRange(v) : null;
    }
    if (itemType === 'weapon') {
      const w = sellableWeapons.find((x) => x.id === selectedId);
      return w ? weaponPriceRange(w) : null;
    }
    return null;
  })();

  // v67 — ilan verirken tahmini değer
  const sellEstimate = (() => {
    if (itemType === 'vehicle') {
      const v = sellableVehicles.find((x) => x.id === selectedId);
      return v ? estimateValue({ kind: 'vehicle', catalogId: v.catalogId, repairsUsed: v.repairsUsed, lifeDays: v.lifeDays, level: vehicleLevelOf(v.raceLevel, v.gearUpgraded, v.tankUpgraded) }) : null;
    }
    if (itemType === 'weapon') {
      const w = sellableWeapons.find((x) => x.id === selectedId);
      return w ? estimateValue({ kind: 'weapon', catalogId: w.catalogId, repairsUsed: w.repairsUsed, lifeDays: w.lifeDays, level: w.level }) : null;
    }
    return null;
  })();

  const instantSellTotal = priceRange?.min;

  // Fiyat, seçim değiştiğinde her zaman geçerli aralığın İÇİNDE kalsın —
  // elle "0 altın"da takılıp "geçersiz fiyat" hatası almayı önler.
  useEffect(() => {
    if (!priceRange) {
      if (price !== 0) setPrice(0);
      return;
    }
    if (price < priceRange.min || price > priceRange.max) {
      setPrice(priceRange.min);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceRange?.min, priceRange?.max]);

  const handleSubmit = async () => {
    if (!price || price <= 0 || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      // Sunucu kesinlikle tam sayı bekliyor
      await createListing({ itemType, itemId: selectedId, price: Math.round(price) });
      setSelectedId('');
      setPrice(0);
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'İlan oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleInstantSell = async () => {
    if (!priceRange || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await instantSellListing({ itemType, itemId: selectedId });
      setSelectedId('');
      setPrice(0);
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Anında satış başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="market-sell-backdrop" onClick={onClose}>
      <div className="market-sell-form" onClick={(e) => e.stopPropagation()}>
        <div className="market-sell-header">
          <p className="market-section-title">İlan Ver</p>
          <button className="market-sell-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="market-type-row">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`market-type-btn${itemType === t.id ? ' active' : ''}`}
              onClick={() => {
                setItemType(t.id);
                setSelectedId('');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {itemType === 'vehicle' && (
          <>
            <p className="market-step-label">1. Aracını Seç</p>
            <div className="market-item-picker">
              {sellableVehicles.length === 0 && (
                <p className="market-hint">Satışa uygun (ipoteksiz, el konulmamış) bir aracın yok.</p>
              )}
              {sellableVehicles.map((v) => {
                const img = vehicleImage(v.catalogId);
                const selected = selectedId === v.id;
                return (
                  <button
                    key={v.id}
                    className={`market-item-card${selected ? ' selected' : ''}`}
                    onClick={() => setSelectedId(v.id)}
                  >
                    {img && <img className="market-item-photo" src={img} alt={vehicleDisplayName(v)} />}
                    <span className="market-item-name">{vehicleDisplayName(v)}</span>
                    <ListingCarStats vehicle={v} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {itemType === 'weapon' && (
          <>
            <p className="market-step-label">1. Silahını Seç</p>
            <div className="market-item-picker">
              {sellableWeapons.length === 0 && (
                <p className="market-hint">Satışa çıkarılabilir bir silahın yok.</p>
              )}
              {sellableWeapons.map((w) => {
                const img = weaponImage(w.catalogId);
                const selected = selectedId === w.id;
                return (
                  <button
                    key={w.id}
                    className={`market-item-card${selected ? ' selected' : ''}`}
                    onClick={() => setSelectedId(w.id)}
                  >
                    {img && <img className="market-item-photo" src={img} alt={w.name} />}
                    <span className="market-item-name">{w.name}</span>
                    <span className="market-item-stats">
                      Sv. {w.level} · Güç {w.power.toLocaleString('tr-TR')}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <>
            <p className="market-step-label">2. Satış Fiyatını Belirle</p>
            <div className="market-price-form">
              <p className="market-price-label">
                <strong>{price.toLocaleString('tr-TR')} altına</strong>
                {' satılacak'}
              </p>
              {/* v115 — araç/silah: malzemelerdeki gibi, sadece ucuzken "7 gün içinde otomatik satılır" */}
              {(itemType === 'vehicle' || itemType === 'weapon') && priceRange && autoSellsAt(price, priceRange.min, priceRange.max) && (
                <p className="market-autosell-hint">{AUTO_SELL_HINT}</p>
              )}
              {price > 0 && resaleRateFrac(rates, itemType) > 0 && (
                <p className="market-price-range-hint">
                  🏛️ Vergi (%{Math.round(resaleRateFrac(rates, itemType) * 100)}): {rTax(price).toLocaleString('tr-TR')} altın · Satılınca eline geçen:{' '}
                  <strong>{(price - rTax(price)).toLocaleString('tr-TR')} altın</strong>
                </p>
              )}
              {priceRange && (
                <p className="market-price-range-hint">
                  İzin verilen aralık: {priceRange.min.toLocaleString('tr-TR')} -{' '}
                  {priceRange.max.toLocaleString('tr-TR')} altın
                </p>
              )}
              {sellEstimate && <EstimateLine est={sellEstimate} />}
              <QuantityStepper
                value={price}
                onChange={setPrice}
                min={priceRange?.min || 0}
                max={priceRange?.max}
                quickAmounts={[10, 100, 1000, 10000, 100000]}
              />
              {priceRange && price > 0 && (price < priceRange.min || price > priceRange.max) && (
                <p className="market-price-warning">
                  Fiyat izin verilen aralığın dışında, ilan verilemez.
                </p>
              )}
              <button
                className="market-btn primary"
                disabled={
                  busy ||
                  !price ||
                  !priceRange ||
                  price < priceRange.min ||
                  price > priceRange.max
                }
                onClick={handleSubmit}
              >
                İlan Ver
              </button>
              {priceRange && (
                <button className="market-instant-sell-btn" disabled={busy} onClick={handleInstantSell}>
                  {(instantSellTotal ?? 0).toLocaleString('tr-TR')} altına Anında Sat (eline geçen {((instantSellTotal ?? 0) - rTax(instantSellTotal ?? 0)).toLocaleString('tr-TR')})
                </button>
              )}
            </div>
        </>
        {error && <p className="market-error">{error}</p>}
      </div>
    </div>
  );
}

// sellerLabel: v125 — Mağaza'da satıcı adı yerine fabrika / işletme adı
function ListingCard({ listing, isMine, busy, onCancel, onBuy, noGold = false, sellerLabel = null }) {
  let media = null;
  if (listing.itemType === 'vehicle') {
    const img = vehicleImage(listing.vehicleCatalogId);
    media = img ? <img className="market-card-photo" src={img} alt={listing.vehicleModel} /> : null;
  } else if (listing.itemType === 'weapon') {
    const img = weaponImage(listing.weaponCatalogId);
    media = img ? <img className="market-card-photo" src={img} alt={listing.weaponName} /> : null;
  } else if (listing.itemType === 'material') {
    media = <span className="market-card-emoji">{MATERIAL_EMOJIS[listing.materialType] || '📦'}</span>;
  } else if (listing.itemType === 'machine') {
    media = <span className="market-card-emoji">{MATERIAL_EMOJIS[listing.machineType] || '🏭'}</span>;
  }

  const isQuantifiable = listing.itemType === 'material';
  const isLifeItem = listing.itemType === 'vehicle' || listing.itemType === 'weapon';
  // Eski (ömür sisteminden önce açılmış) ilanlarda vehicleLifeDays/
  // weaponLifeDays alanı olmayabilir — bu durumda tam ömür (INITIAL_LIFE_DAYS/
  // INITIAL_LIFE_DAYS) varsayıyoruz, böylece bar HER araç/silah ilanında görünür.
  const lifeCap = lifeCapOf(listing.itemType === 'weapon' ? 'weapon' : 'vehicle');
  const lifeDays = isLifeItem
    ? (listing.itemType === 'vehicle' ? listing.vehicleLifeDays : listing.weaponLifeDays) ?? lifeCap
    : null;
  // Aynı şekilde eski ilanlarda tamir hakkı alanı olmayabilir — bu durumda
  // hiç kullanılmamış (10/10) varsayıyoruz.
  const repairsUsed = isLifeItem
    ? (listing.itemType === 'vehicle' ? listing.vehicleRepairsUsed : listing.weaponRepairsUsed) ?? 0
    : null;

  return (
    <div className="market-listing-card">
      {media}
      <div className="market-listing-info">
        <span className="market-listing-label">{listingLabel(listing)}</span>
        {listing.itemType === 'vehicle' && <ListingCarStats listing={listing} />}
        <span className="market-listing-price">
          {isQuantifiable ? (
            <>
              {(listing.unitPrice || Math.round(listing.price / (listing.quantity || 1))).toLocaleString(
                'tr-TR'
              )}{' '}
              altın / adet · {listing.quantity} adet
            </>
          ) : (
            <>{listing.price.toLocaleString('tr-TR')} altın</>
          )}
          {!isMine && <span className="market-seller"> · {sellerLabel || listing.sellerName}</span>}
        </span>
        {isLifeItem && <EstimateLine est={estimateOfListing(listing)} />}
        {lifeDays != null && (
          <div className="market-listing-life-row">
            <span className="market-listing-life-label">
              Ömür: {lifeDays} / {lifeCap} gün · Tamir hakkı: {MAX_REPAIRS - repairsUsed}/
              {MAX_REPAIRS}
            </span>
            <div className="market-listing-life-bar">
              <div
                className="market-listing-life-fill"
                style={{ width: `${Math.round(Math.max(0, Math.min(1, lifeDays / lifeCap)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <button className={`market-btn small${!isMine && noGold ? ' no-gold' : ''}`} disabled={busy} onClick={isMine ? onCancel : onBuy} aria-live="polite">
        {isMine ? 'İptal Et' : noGold ? NO_GOLD_TEXT : 'Satın Al'}
      </button>
    </div>
  );
}

function BuyMaterialModal({ listing, onClose, onBought, gold, sellerLabel = null }) {
  const unitPrice = listing.unitPrice || Math.round(listing.price / (listing.quantity || 1));
  const [qty, setQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [noGold, setNoGold] = useState(false);

  const total = qty * unitPrice;
  useEffect(() => {
    if (!noGold) return undefined;
    const t = setTimeout(() => setNoGold(false), NO_GOLD_MS);
    return () => clearTimeout(t);
  }, [noGold]);

  const handleBuy = async () => {
    if (!qty || qty <= 0) return;
    if (gold != null && total > Number(gold)) {
      setNoGold(true);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (listing.gang) await buyGangListing(listing, qty);
      else await buyListing(listing.id, qty);
      onBought?.();
      onClose();
    } catch (err) {
      if (isNoGoldError(err)) setNoGold(true);
      else setError(err.message || 'Satın alınamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="market-sell-backdrop" onClick={onClose}>
      <div className="market-sell-form" onClick={(e) => e.stopPropagation()}>
        <div className="market-sell-header">
          <p className="market-section-title">
            {MATERIAL_LABELS[listing.materialType] || listing.materialType} Satın Al
          </p>
          <button className="market-sell-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="market-hint">
          {sellerLabel || listing.sellerName} · {unitPrice.toLocaleString('tr-TR')} altın / adet ·{' '}
          {listing.quantity} adet mevcut
        </p>
        <p className="market-step-label">Kaç Adet Alacaksın?</p>
        <p className="market-price-label">
          <strong>{qty.toLocaleString('tr-TR')} adet</strong>
        </p>
        <QuantityStepper
          value={qty}
          onChange={setQty}
          max={listing.quantity}
          quickAmounts={materialQuickAmountsFor(listing.materialType)}
        />
        <p className="market-price-range-hint">
          Toplam: <strong>{total.toLocaleString('tr-TR')} altın</strong>
        </p>
        <button className={`market-btn primary${noGold ? ' no-gold' : ''}`} disabled={busy || !qty || qty <= 0} onClick={handleBuy} aria-live="polite">
          {busy ? '…' : noGold ? `${NO_GOLD_TEXT} (${Number(gold || 0).toLocaleString('tr-TR')} altının var)` : `${total.toLocaleString('tr-TR')} altına Satın Al`}
        </button>
        {error && <p className="market-error">{error}</p>}
      </div>
    </div>
  );
}

// MyListingWithAd — "İlanlarım" satırındaki her kartın altına, kullanıcı
// revizesiyle eklenen "Reklam Ver" kontrolünü ekliyor: normal ListingCard
// DEĞİŞMEDEN kalıyor (Avantajlı/Reklam panellerinde başkalarının ilanları
// için de kullanılıyor, orada reklam kontrolü anlamsız), reklam sadece
// KENDİ ilanlarımızın altında, ayrı bir satır olarak gösteriliyor.
function MyListingWithAd({ listing, busy, onCancel, advertising, onStartAdvertise, onCancelAdvertise, onConfirmAdvertise, adPrice }) {
  const advertised = isAdvertisedListing(listing);
  return (
    <div className="market-my-listing-wrap">
      <ListingCard listing={listing} isMine busy={busy} onCancel={onCancel} />
      {advertised ? (
        <p className="market-ad-badge">📢 Reklamda — {adRemainingLabel(listing)}</p>
      ) : advertising ? (
        <div className="market-ad-confirm">
          <p className="market-hint small">
            {AD_DURATION_MS / (60 * 60 * 1000)} saatlik reklam:{' '}
            <strong>{adPrice.toLocaleString('tr-TR')} altın</strong>. Kabul ediyor musun?
          </p>
          <div className="market-ad-confirm-row">
            <button className="market-btn" disabled={busy} onClick={onCancelAdvertise}>
              Vazgeç
            </button>
            <button className="market-btn primary" disabled={busy} onClick={onConfirmAdvertise}>
              {busy ? '…' : 'Evet, Reklam Ver'}
            </button>
          </div>
        </div>
      ) : (
        <button className="market-ad-btn" disabled={busy} onClick={onStartAdvertise}>
          📢 Reklam Ver
        </button>
      )}
    </div>
  );
}

export default function MarketplaceScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const gold = player ? Number(player.gold || 0) : null;
  const { listings: allPlayerListings } = useMarketplaceListings();
  // v124 — 2. el: sadece araç + silah (malzeme Mağaza'da, makine ilanı yok)
  const playerListings = allPlayerListings.filter((l) => MARKET_TYPES.has(l.itemType));
  // v70: çete ilanları oyuncu ilanlarıyla aynı listede (aynı kart, avantajlı hesabı dahil)
  const gangListings = useGangMarketListings().filter((l) => MARKET_TYPES.has(l.itemType));
  const listings = [...playerListings, ...gangListings];
  const adPrice = useAdPrice(gangListings); // v96: reklamdaki ürün sayısına göre
  // view — 'home' (yeni ana sayfa: avantajlı/reklam panelleri + 4 kategori
  // butonu) ya da CATEGORIES id'lerinden biri (kategori içine girildiğinde).
  // Eski üstteki sekme çubuğu kaldırıldı (kullanıcı revizesi).
  const [view, setView] = useState('home');
  // v124: araç/silah kategorisinde "Sıfır" — sadece ömrü tam dolu ve hiç tamir görmemiş ürünler
  const [onlyNew, setOnlyNew] = useState(false);
  useEffect(() => setOnlyNew(false), [view]);
  const [showSellForm, setShowSellForm] = useState(false);
  const [buyModalListing, setBuyModalListing] = useState(null);
  const [advertisingId, setAdvertisingId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [noGoldId, setNoGoldId] = useState(null);
  // v93 — kategoriye girince / geri dönünce sayfa en üstten açılsın (avantajlı
  // ürünler üstte; aşağı kaymış açılınca yeni oyuncu göremiyordu)
  const rootRef = useRef(null);
  useEffect(() => {
    for (let el = rootRef.current; el && el !== document.body; el = el.parentElement) {
      if (el.scrollTop) el.scrollTop = 0;
    }
    if (window.scrollY) window.scrollTo(0, 0);
  }, [view]);
  useEffect(() => {
    if (!noGoldId) return undefined;
    const t = setTimeout(() => setNoGoldId(null), NO_GOLD_MS);
    return () => clearTimeout(t);
  }, [noGoldId]);

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (isNoGoldError(err)) setNoGoldId(key);
      else setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  // v115 — araç/silah ilanı: 00:00'dan önce direkt iptal; sonra onay penceresi
  const [cancelAsk, setCancelAsk] = useState(null);
  const requestCancel = (l) => {
    const isItem = (l.itemType === 'vehicle' || l.itemType === 'weapon') && !l.shopHouseId && !l.gang;
    if (isItem && itemCancelPenalty(l)) {
      setCancelAsk(l);
      return;
    }
    run(l.id, async () => {
      try {
        await cancelListing(l.id);
      } catch (err) {
        // gece yarısı geçtiyse sunucu onay ister
        if (String(err?.message || '').includes('cancel-penalty')) setCancelAsk(l);
        else throw err;
      }
    });
  };
  const confirmCancel = () => {
    const l = cancelAsk;
    setCancelAsk(null);
    if (l) run(l.id, () => cancelListing(l.id, { confirmPenalty: true }));
  };

  const runAdvertise = async (listingId) => {
    setBusy(listingId);
    setError(null);
    try {
      await advertiseListing(listingId, adPrice);
      setAdvertisingId(null);
    } catch (err) {
      setError(err.message || 'Reklam verilemedi.');
    } finally {
      setBusy(null);
    }
  };

  // v67 — Avantajlı ürünler artık ana sayfada değil, her KATEGORİNİN İÇİNDE
  // (o kategorinin en büyük indirimleri en üstte). Reklam paneli ana sayfada.
  const advertisedListings = listings
    .filter(isAdvertisedListing)
    .sort((a, b) => (b.adExpiresAt?.toMillis() || 0) - (a.adExpiresAt?.toMillis() || 0));

  const categoryListings =
    view === 'home'
      ? []
      : listings
          .filter((l) => l.itemType === view)
          .filter((l) => !onlyNew || isBrandNewListing(l));
  const myListings = categoryListings.filter((l) => l.sellerId === user?.uid);
  const advantageousListings = categoryListings
    .filter((l) => l.sellerId !== user?.uid && isAdvantageousListing(l))
    .sort((a, b) => listingComparablePrice(a) / listingCeilingPrice(a) - listingComparablePrice(b) / listingCeilingPrice(b));
  const advantageousIds = new Set(advantageousListings.map((l) => l.id));
  const otherListings = categoryListings.filter((l) => l.sellerId !== user?.uid && !advantageousIds.has(l.id));

  const buyOrOpenModal = (l) => {
    if (cannotAfford(l, gold)) {
      setError(null);
      setNoGoldId(l.id);
      return;
    }
    if (l.itemType === 'material') setBuyModalListing(l);
    else run(l.id, () => (l.gang ? buyGangListing(l, 1) : buyListing(l.id)));
  };

  return (
    <div className="market-screen" ref={rootRef}>
      {cancelAsk && (
        <ConfirmModal
          title="İlan iptal edilsin mi?"
          message={ITEM_CANCEL_PENALTY_TEXT}
          confirmLabel="İlanı İptal Et"
          onConfirm={confirmCancel}
          onCancel={() => setCancelAsk(null)}
        />
      )}
      {view === 'home' ? (
        <>
          <div className="market-header-row">
            <p className="market-screen-title">🏪 2. El Pazarı</p>
            <button className="market-btn primary" onClick={() => setShowSellForm(true)}>
              + İlan Ver
            </button>
          </div>

          {/* KULLANICI İSTEĞİ: reklamı verilen ürünler üstte, avantajlı
              ürünler altta gösterilsin — eski (avantajlı üstte) sıralamanın
              TAM TERSİ. */}
          {advertisedListings.length > 0 && (
            <div className="market-home-panel">
              <p className="market-section-title">📢 Reklam Verilen Ürünler</p>
              {advertisedListings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  isMine={l.sellerId === user?.uid}
                  busy={busy === l.id}
                  noGold={noGoldId === l.id}
                  onCancel={() => requestCancel(l)}
                  onBuy={() => buyOrOpenModal(l)}
                />
              ))}
            </div>
          )}

          <div className="market-category-grid">
            {CATEGORIES.map((c) => (
              <button key={c.id} className="market-category-btn" onClick={() => setView(c.id)}>
                <span className="market-category-emoji">{c.emoji}</span>
                <span className="market-category-label">{c.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="market-header-row">
            <button className="market-back-btn" onClick={() => setView('home')}>
              ‹ Geri
            </button>
            <p className="market-screen-title">{CATEGORIES.find((c) => c.id === view)?.label}</p>
            <button className="market-btn primary" onClick={() => setShowSellForm(true)}>
              + İlan Ver
            </button>
          </div>

          {(view === 'vehicle' || view === 'weapon') && (
            <div className="market-new-filter">
              <button className={`market-btn small ${onlyNew ? 'primary' : ''}`} aria-pressed={onlyNew} onClick={() => setOnlyNew((v) => !v)}>
                ✨ Sıfır
              </button>
              <span className="market-hint">{onlyNew ? 'Sadece ömrü ve tamir hakkı tam olanlar' : 'Tümü gösteriliyor'}</span>
            </div>
          )}

          {myListings.length > 0 && (
            <>
              <p className="market-section-title">İlanlarım</p>
              {myListings.map((l) => (
                <MyListingWithAd
                  key={l.id}
                  listing={l}
                  busy={busy === l.id}
                  onCancel={() => requestCancel(l)}
                  advertising={advertisingId === l.id}
                  onStartAdvertise={() => setAdvertisingId(l.id)}
                  onCancelAdvertise={() => setAdvertisingId(null)}
                  onConfirmAdvertise={() => runAdvertise(l.id)}
                  adPrice={adPrice}
                />
              ))}
            </>
          )}

          {advantageousListings.length > 0 && (
            <div className="market-home-panel">
              <p className="market-section-title">🔥 Avantajlı Ürünler</p>
              {advantageousListings.map((l) => (
                <ListingCard key={l.id} listing={l} isMine={false} busy={busy === l.id} noGold={noGoldId === l.id} onBuy={() => buyOrOpenModal(l)} />
              ))}
            </div>
          )}

          <p className="market-section-title">Diğer İlanlar</p>
          {otherListings.length === 0 && <p className="market-hint">{advantageousListings.length ? 'Bu kategoride başka ilan yok.' : 'Bu kategoride ilan yok.'}</p>}
          {otherListings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              isMine={false}
              busy={busy === l.id}
              noGold={noGoldId === l.id}
              onBuy={() => buyOrOpenModal(l)}
            />
          ))}
        </>
      )}

      {error && <p className="market-error">{error}</p>}

      {showSellForm && (
        <SellForm
          onClose={() => setShowSellForm(false)}
          initialItemType={view === 'home' ? 'vehicle' : view}
        />
      )}
      {buyModalListing && (
        <BuyMaterialModal listing={buyModalListing} gold={gold} onClose={() => setBuyModalListing(null)} />
      )}
    </div>
  );
}

// =============================================================================
// v124 — MAĞAZA: fabrika / silahçı / modifiyeci sahiplerinin malzeme pazarı.
// Kurallar sunucuda (functions/index.js createListing / buyListing /
// instantSellListing + functions/materials.js):
//   • Sadece kullanabildiğin malzemeleri görür ve alırsın (fabrika: hepsi ·
//     silahçı: tamir + silah · modifiye: tamir + araba).
//   • Alınan / satılan malzeme fabrika + işletmelerinin ORTAK envanterinden.
//   • Malzeme satışında vergi yok; anında satış yarı fiyatına (onaylı).
//   • 7 gün parti kuralı (ucuz ilan 7 günde oyuna satılır) aynen sürüyor.
// =============================================================================
const MAGAZA_MATERIALS = ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme'];
// v128 — Mağaza'nın üstünde ortak envanter (3 malzeme yan yana, adetleriyle)
const MAGAZA_MAT_ICON = { tamirMalzemesi: '🔧', silahUpgrade: '🔫', arabaGelistirme: '🚗' };
const MAGAZA_MAT_SHORT = { tamirMalzemesi: 'Tamir', silahUpgrade: 'Silah Gel.', arabaGelistirme: 'Araba Gel.' };
function MagazaInventoryStrip({ mats }) {
  const { inventory } = useInventory();
  return (
    <div className="mg-strip" aria-label="Envanterim">
      <span className="mg-strip-label">📦 Envanterin</span>
      <div className="mg-strip-row">
        {mats.map((k) => {
          const n = Math.max(0, Number(inventory[k] || 0));
          return (
            <div key={k} className={`mg-strip-cell${n === 0 ? ' zero' : ''}`} title={MATERIAL_LABELS[k]}>
              <span className="mg-strip-icon">{MAGAZA_MAT_ICON[k]}</span>
              <b>{n.toLocaleString('tr-TR')}</b>
              <em>{MAGAZA_MAT_SHORT[k]}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MagazaSellForm({ usable, initialMaterial, onClose }) {
  const { inventory } = useInventory();
  // Seçilebilenler: kullanabildiklerin + (eskiden kalmışsa) envanterde olan diğerleri
  const options = MAGAZA_MATERIALS.filter((k) => usable.has(k) || Number(inventory[k] || 0) > 0);
  const [materialType, setMaterialType] = useState(options.includes(initialMaterial) ? initialMaterial : options[0] || 'tamirMalzemesi');
  const [quantity, setQuantity] = useState(0);
  const range = materialUnitPriceRange(materialType);
  const [price, setPrice] = useState(range.max);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [askInstant, setAskInstant] = useState(false);
  const have = Math.max(0, Math.floor(Number(inventory[materialType] || 0)));
  const canList = usable.has(materialType);

  useEffect(() => {
    setPrice((p) => (p < range.min || p > range.max ? range.max : p));
    setQuantity((q) => Math.min(q, have));
  }, [materialType, range.min, range.max, have]);

  const instantTotal = range.min * quantity;

  const list = async () => {
    if (!quantity || quantity <= 0 || !price) return;
    setBusy(true);
    setError(null);
    try {
      await createListing({ itemType: 'material', materialType, quantity, unitPrice: Math.round(price) });
      onClose();
    } catch (err) {
      setError(err.message || 'İlan oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };
  const instant = async () => {
    setAskInstant(false);
    if (!quantity || quantity <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await instantSellListing({ itemType: 'material', materialType, quantity });
      onClose();
    } catch (err) {
      setError(err.message || 'Anında satış başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="market-sell-backdrop" onClick={onClose}>
      <div className="market-sell-form" onClick={(e) => e.stopPropagation()}>
        {askInstant && (
          <ConfirmModal
            title="Anında satılsın mı?"
            message={`${quantity.toLocaleString('tr-TR')} adet ${MATERIAL_LABELS[materialType]}, ${instantTotal.toLocaleString('tr-TR')} altına (adedi ${range.min.toLocaleString('tr-TR')}) oyuna satılacak. Bu işlem geri alınamaz.`}
            confirmLabel="Evet, Sat"
            onConfirm={instant}
            onCancel={() => setAskInstant(false)}
          />
        )}
        <div className="market-sell-header">
          <p className="market-section-title">İlan Ver</p>
          <button className="market-sell-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="market-step-label">1. Malzeme Seç</p>
        <div className="market-item-picker compact">
          {options.length === 0 && <p className="market-hint">Envanterinde satılacak malzeme yok.</p>}
          {options.map((key) => (
            <button key={key} className={`market-item-card${materialType === key ? ' selected' : ''}`} onClick={() => setMaterialType(key)}>
              <span className="market-item-emoji-large">{MATERIAL_EMOJIS[key]}</span>
              <span className="market-item-name">{MATERIAL_LABELS[key]}</span>
              <span className="market-item-stats">Envanterde: {Number(inventory[key] || 0).toLocaleString('tr-TR')} adet</span>
            </button>
          ))}
        </div>
        <p className="market-step-label">2. Satılacak Miktarı Belirle</p>
        <p className="market-price-label">
          <strong>{quantity.toLocaleString('tr-TR')} adet</strong> satılacak
        </p>
        <QuantityStepper value={quantity} onChange={setQuantity} max={have} quickAmounts={materialQuickAmountsFor(materialType)} />
        {canList && (
          <>
            <p className="market-step-label">3. Adet Fiyatını Belirle</p>
            <div className="market-price-form">
              <p className="market-price-label">
                <strong>{price.toLocaleString('tr-TR')} altına</strong> adedi satılacak
              </p>
              {autoSellsAt(price, range.min, range.max) && <p className="market-autosell-hint">{AUTO_SELL_HINT}</p>}
              {quantity > 0 && price > 0 && (
                <p className="market-price-range-hint">
                  Toplam: {(price * quantity).toLocaleString('tr-TR')} altın ({quantity.toLocaleString('tr-TR')} adet)
                </p>
              )}
              <QuantityStepper value={price} onChange={setPrice} min={range.min} max={range.max} quickAmounts={[1, 10, 50, 100]} />
              <button className="market-btn primary" disabled={busy || !price || price < range.min || price > range.max || !quantity} onClick={list}>
                İlan Ver
              </button>
            </div>
          </>
        )}
        {quantity > 0 && (
          <button className="market-instant-sell-btn" disabled={busy} onClick={() => setAskInstant(true)}>
            {instantTotal.toLocaleString('tr-TR')} altına Anında Sat
          </button>
        )}
        {error && <p className="market-error">{error}</p>}
      </div>
    </div>
  );
}

export function MagazaScreen({ onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const gold = player ? Number(player.gold || 0) : null;
  const { usable, loading } = useMaterialHoldings();
  const { listings: all } = useMarketplaceListings();
  const [filter, setFilter] = useState('all');
  const [showSell, setShowSell] = useState(false);
  const [buyModalListing, setBuyModalListing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [noGoldId, setNoGoldId] = useState(null);
  useEffect(() => {
    if (!noGoldId) return undefined;
    const t = setTimeout(() => setNoGoldId(null), NO_GOLD_MS);
    return () => clearTimeout(t);
  }, [noGoldId]);

  const visibleMats = MAGAZA_MATERIALS.filter((k) => usable.has(k));
  const materialListings = all.filter((l) => l.itemType === 'material' && MAGAZA_MATERIALS.includes(l.materialType) && !l.cancelled && Number(l.quantity || 0) > 0);
  const mine = materialListings.filter((l) => l.sellerId === user?.uid);
  const others = materialListings
    .filter((l) => l.sellerId !== user?.uid && usable.has(l.materialType))
    .filter((l) => filter === 'all' || l.materialType === filter);
  const advantageous = others
    .filter(isAdvantageousListing)
    .sort((a, b) => listingComparablePrice(a) / listingCeilingPrice(a) - listingComparablePrice(b) / listingCeilingPrice(b));
  const allSorted = [...others].sort((a, b) => listingComparablePrice(a) - listingComparablePrice(b));
  // v125: satıcı adı yerine fabrika (yoksa silahçı / modifiye) adı
  const shopName = useSellerShopNames(others.map((l) => l.sellerId));
  const labelOf = (l) => shopName(l.sellerId, l.sellerName);

  const cancel = async (l) => {
    setBusy(l.id);
    setError(null);
    try {
      await cancelListing(l.id);
    } catch (err) {
      setError(err.message || 'İlan iptal edilemedi.');
    } finally {
      setBusy(null);
    }
  };
  const openBuy = (l) => {
    if (cannotAfford(l, gold)) {
      setNoGoldId(l.id);
      return;
    }
    setBuyModalListing(l);
  };

  return (
    <div className="market-screen magaza-screen">
      <div className="market-header-row">
        <button className="market-back-btn" onClick={onClose}>
          ‹ Geri
        </button>
        <p className="market-screen-title">🏬 Mağaza</p>
        <button className="market-btn primary" onClick={() => setShowSell(true)}>
          + İlan Ver
        </button>
      </div>
      {!loading && visibleMats.length > 0 && <MagazaInventoryStrip mats={visibleMats} />}
      {loading ? (
        <p className="market-hint">Yükleniyor…</p>
      ) : visibleMats.length === 0 ? (
        <p className="market-hint">Mağazadan malzeme almak için bir fabrikan ya da silahçı / modifiye garajı işletmen olmalı.</p>
      ) : (
        <>
          <p className="market-hint">Aldığın malzemeler fabrika ve işletmelerinin ortak envanterine girer.</p>
          {visibleMats.length > 1 && (
            <select className="market-material-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Tüm malzemeler</option>
              {visibleMats.map((k) => (
                <option key={k} value={k}>
                  {MATERIAL_LABELS[k]}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {mine.length > 0 && (
        <>
          <p className="market-section-title">İlanlarım</p>
          {mine.map((l) => (
            <ListingCard key={l.id} listing={l} isMine busy={busy === l.id} onCancel={() => cancel(l)} />
          ))}
        </>
      )}

      {advantageous.length > 0 && (
        <div className="market-home-panel">
          <p className="market-section-title">🔥 Avantajlı Ürünler</p>
          {advantageous.map((l) => (
            <ListingCard key={l.id} listing={l} isMine={false} busy={busy === l.id} noGold={noGoldId === l.id} onBuy={() => openBuy(l)} sellerLabel={labelOf(l)} />
          ))}
        </div>
      )}

      {visibleMats.length > 0 && (
        <>
          <p className="market-section-title">Tüm Ürünler</p>
          {allSorted.length === 0 && <p className="market-hint">Şu an satışta malzeme yok.</p>}
          {allSorted.map((l) => (
            <ListingCard key={l.id} listing={l} isMine={false} busy={busy === l.id} noGold={noGoldId === l.id} onBuy={() => openBuy(l)} sellerLabel={labelOf(l)} />
          ))}
        </>
      )}

      {error && <p className="market-error">{error}</p>}
      {showSell && <MagazaSellForm usable={usable} initialMaterial={filter} onClose={() => setShowSell(false)} />}
      {buyModalListing && <BuyMaterialModal listing={buyModalListing} gold={gold} sellerLabel={labelOf(buyModalListing)} onClose={() => setBuyModalListing(null)} />}
    </div>
  );
}
