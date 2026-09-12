import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { useMyFactory } from '../../hooks/useMyFactory';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import { useMarketplaceListings } from '../../hooks/useMarketplaceListings';
import {
  createListing,
  instantSellListing,
  cancelListing,
  buyListing,
  advertiseListing,
  runMergeLegacyMaterialListings,
} from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { weaponCatalog } from '../../data/weaponCatalog';
import { MAX_REPAIRS } from '../VehicleCard/VehicleCard';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './MarketplaceScreen.css';

// Bu oturumda eski (deterministik ID sisteminden önce açılmış) malzeme
// ilanlarını birleştirme işlemi zaten tetiklendi mi? (Gereksiz tekrar
// çağrıyı önlemek için — işlem kendisi zararsız/idempotent olsa da.)
let legacyMaterialMergeTriggered = false;

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
  { id: 'material', label: 'Malzeme' },
  { id: 'machine', label: 'Makine' },
];

// CATEGORIES — pazar tasarımı yenilenirken eklendi (kullanıcı revizesi):
// eski üstteki sekme çubuğu kaldırıldı, yerine ana sayfada 2x2 dizilen 4
// kare kategori butonu geldi. TABS ile aynı id'leri paylaşıyor (SellForm
// zaten itemType olarak bunları kullanıyor), sadece görsel/etiket farklı.
const CATEGORIES = [
  { id: 'vehicle', label: 'Araçlar', emoji: '🚗' },
  { id: 'weapon', label: 'Silahlar', emoji: '🔫' },
  { id: 'material', label: 'Malzemeler', emoji: '📦' },
  { id: 'machine', label: 'Makineler', emoji: '⚙️' },
];

// AD_PRICE/AD_DURATION_MS — functions/index.js advertiseListing'teki
// SABİTLERLE BİREBİR AYNI (sadece bilgilendirme/önizleme amaçlı, gerçek
// doğrulama sunucuda yapılıyor).
const AD_PRICE = 1000;
const AD_DURATION_MS = 24 * 60 * 60 * 1000;

// Fiyat sınırları — hesaplar arası para aklamayı önlemek için backend'de
// de AYNI kurallarla doğrulanıyor (bkz. functions/index.js createListing).
// Burası sadece kullanıcıya yol göstermek için.
const AMAZOR_PRICES = { tamirMalzemesi: 10, silahUpgrade: 100, arabaGelistirme: 500, yasakliMadde: 2500 };
const MACHINE_PRICES = { tamirMalzemesi: 100000, silahUpgrade: 50000, arabaGelistirme: 50000, yasakliMadde: 100000 };

const INITIAL_LIFE_DAYS = 20;
const REPAIR_LIFE_BONUS_DAYS = 2;

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
function valueRatioFromLife(lifeDays, repairsUsed) {
  const remainingRepairs = Math.max(0, MAX_REPAIRS - (repairsUsed || 0));
  const life = Math.max(0, lifeDays ?? INITIAL_LIFE_DAYS);
  const combined = remainingRepairs * REPAIR_LIFE_BONUS_DAYS + life;
  const maxCombined = MAX_REPAIRS * REPAIR_LIFE_BONUS_DAYS + INITIAL_LIFE_DAYS;
  return Math.max(0, Math.min(1, combined / maxCombined));
}

function valueRatio(item) {
  return valueRatioFromLife(item?.lifeDays, item?.repairsUsed);
}

function vehiclePriceRange(vehicle) {
  const base = vehicleCatalog.find((v) => v.id === vehicle.catalogId)?.price || 0;
  const mult = vehicle.gearUpgraded && vehicle.tankUpgraded ? 3 : vehicle.gearUpgraded || vehicle.tankUpgraded ? 2 : 1;
  const max = Math.round(base * mult * valueRatio(vehicle));
  return { min: Math.floor(max / 2), max };
}

function weaponPriceRange(weapon) {
  const base = weaponCatalog.find((w) => w.id === weapon.catalogId)?.price || 0;
  const mult = weapon.level || 1;
  const max = Math.round(base * mult * valueRatio(weapon));
  return { min: Math.floor(max / 2), max };
}

function materialUnitPriceRange(materialType) {
  const max = AMAZOR_PRICES[materialType];
  return { min: Math.floor(max / 2), max };
}

function machinePriceRange(machineType, cryptoPrice) {
  const max = machineType === 'mining' ? Math.ceil(2 * cryptoPrice) : MACHINE_PRICES[machineType];
  return { min: Math.floor(max / 2), max };
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
    return Math.round(base * mult * valueRatioFromLife(listing.weaponLifeDays, listing.weaponRepairsUsed));
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
    const stats = `Vites ${listing.vehicleGearLevel} · Depo ${listing.vehicleTank}L`;
    const upgraded = listing.vehicleGearUpgraded || listing.vehicleTankUpgraded;
    return `${listing.vehicleModel} (${stats}${upgraded ? ' — geliştirilmiş' : ''})`;
  }
  if (listing.itemType === 'weapon') {
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
  const { inventory } = useInventory();
  const { machines: myMachines } = useMyFactory();
  const { prices } = useInvestmentPrices();

  const [itemType, setItemType] = useState(initialItemType || 'vehicle');
  const [selectedId, setSelectedId] = useState('');
  const [materialType, setMaterialType] = useState('tamirMalzemesi');
  const [quantity, setQuantity] = useState(0);
  const [machineId, setMachineId] = useState('');
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sellableVehicles = vehicles.filter((v) => !v.mortgaged && !v.seizedByBank && !v.listed);
  const sellableWeapons = weapons.filter((w) => !w.listed);
  const sellableMachines = myMachines.filter((m) => !m.workerId);

  // DÜZELTME (yeni istek): kripto (mining) makineleri artık 2. el listeye
  // ÇIKARILAMAZ — sadece sabit fiyata "Anında Sat" mümkün (bkz.
  // functions/index.js createListing'deki aynı kısıtlama). Az makineli
  // hesaplardan çok makineli hesaplara ucuza makine transferini önlemek
  // için — bkz. miningMachinePrice'taki kademeli fiyat.
  const selectedMachineType = itemType === 'machine' ? sellableMachines.find((x) => x.id === machineId)?.type : null;
  const isMiningSelected = selectedMachineType === 'mining';

  const priceRange = (() => {
    if (itemType === 'vehicle') {
      const v = sellableVehicles.find((x) => x.id === selectedId);
      return v ? vehiclePriceRange(v) : null;
    }
    if (itemType === 'weapon') {
      const w = sellableWeapons.find((x) => x.id === selectedId);
      return w ? weaponPriceRange(w) : null;
    }
    if (itemType === 'material') {
      return materialUnitPriceRange(materialType);
    }
    if (itemType === 'machine') {
      const m = sellableMachines.find((x) => x.id === machineId);
      return m ? machinePriceRange(m.type, prices.cryptoPrice) : null;
    }
    return null;
  })();

  // Malzemede "anında sat" tutarı adet başına min fiyat × miktar (toplam);
  // diğer türlerde priceRange.min zaten ürünün toplam min fiyatı.
  const instantSellTotal =
    itemType === 'material' && priceRange ? priceRange.min * quantity : priceRange?.min;

  // Fiyat, seçim değiştiğinde (araç/silah/malzeme/makine ya da min-max
  // aralığı) her zaman geçerli aralığın İÇİNDE kalsın — elle "0 altın"da
  // takılıp "geçersiz fiyat" hatası almayı önler. Seçim yokken sıfırlanır.
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
    if (!price || price <= 0) return;
    setBusy(true);
    setError(null);
    try {
      // Sunucu kesinlikle tam sayı bekliyor — QuantityStepper zaten integer
      // üretiyor ama son bir güvenlik için yuvarlanıyor.
      const safePrice = Math.round(price);
      if (itemType === 'machine' && isMiningSelected) return; // güvenlik ağı — bkz. yukarısı
      if (itemType === 'vehicle') {
        if (!selectedId) return;
        await createListing({ itemType, itemId: selectedId, price: safePrice });
      } else if (itemType === 'weapon') {
        if (!selectedId) return;
        await createListing({ itemType, itemId: selectedId, price: safePrice });
      } else if (itemType === 'material') {
        if (!quantity || quantity <= 0) return;
        await createListing({ itemType, materialType, quantity, unitPrice: safePrice });
      } else if (itemType === 'machine') {
        if (!machineId) return;
        await createListing({ itemType, machineId, price: safePrice });
      }
      setSelectedId('');
      setQuantity(0);
      setMachineId('');
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
    if (!priceRange) return;
    if (itemType === 'material' && (!quantity || quantity <= 0)) return;
    setBusy(true);
    setError(null);
    try {
      if (itemType === 'vehicle' || itemType === 'weapon') {
        if (!selectedId) return;
        await instantSellListing({ itemType, itemId: selectedId });
      } else if (itemType === 'material') {
        await instantSellListing({ itemType, materialType, quantity });
      } else if (itemType === 'machine') {
        if (!machineId) return;
        await instantSellListing({ itemType, machineId });
      }
      setSelectedId('');
      setQuantity(0);
      setMachineId('');
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
                    {img && <img className="market-item-photo" src={img} alt={v.model} />}
                    <span className="market-item-name">{v.model}</span>
                    <span className="market-item-stats">
                      Vites {v.gearLevel} · Depo {v.baseTank + (v.tankBonus || 0)}L
                      {v.turboCount > 0 ? ` · Turbo ×${v.turboCount}` : ''}
                    </span>
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

        {itemType === 'material' && (
          <>
            <p className="market-step-label">1. Malzeme Seç</p>
            <div className="market-item-picker compact">
              {Object.entries(MATERIAL_LABELS).map(([key, label]) => {
                const selected = materialType === key;
                return (
                  <button
                    key={key}
                    className={`market-item-card${selected ? ' selected' : ''}`}
                    onClick={() => setMaterialType(key)}
                  >
                    <span className="market-item-emoji-large">{MATERIAL_EMOJIS[key]}</span>
                    <span className="market-item-name">{label}</span>
                    <span className="market-item-stats">Elinde: {inventory[key] || 0} adet</span>
                  </button>
                );
              })}
            </div>
            <p className="market-step-label">2. Satılacak Miktarı Belirle</p>
            <p className="market-price-label">
              <strong>{quantity.toLocaleString('tr-TR')} adet</strong> satılacak
            </p>
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={inventory[materialType] || 0}
              quickAmounts={materialQuickAmountsFor(materialType)}
            />
          </>
        )}

        {itemType === 'machine' && (
          <>
            <p className="market-step-label">1. Makine Seç</p>
            <div className="market-item-picker">
              {sellableMachines.length === 0 && (
                <p className="market-hint">Satışa uygun (boşta, işçisiz) bir makinen yok.</p>
              )}
              {sellableMachines.map((m) => {
                const selected = machineId === m.id;
                return (
                  <button
                    key={m.id}
                    className={`market-item-card${selected ? ' selected' : ''}`}
                    onClick={() => setMachineId(m.id)}
                  >
                    <span className="market-item-emoji-large">{MATERIAL_EMOJIS[m.type]}</span>
                    <span className="market-item-name">{MACHINE_LABELS[m.type]}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {itemType === 'machine' && isMiningSelected ? (
          // DÜZELTME (yeni istek): kripto (mining) makinesi seçiliyken 2.
          // el ilan verme adımı TAMAMEN gizleniyor — sadece sabit fiyata
          // "Anında Sat" var. Fiyat kullanıcı tarafından belirlenmiyor
          // (miningMachinePrice() argümansız her zaman taban kademeyi
          // döner, /2 = sabit 1×KR fiyatı — bkz. functions/index.js).
          <div className="market-price-form">
            <p className="market-hint">
              Kripto (mining) makineleri artık 2. el satışa çıkarılamaz — sadece sabit fiyata anında
              satılabilir. Anında satılan makine oyundan tamamen silinir, kimse satın alamaz.
            </p>
            {priceRange && (
              <p className="market-price-range-hint">
                Anında satış fiyatı: <strong>{priceRange.min.toLocaleString('tr-TR')} altın</strong> (1×
                güncel KR fiyatı)
              </p>
            )}
            <button className="market-instant-sell-btn" disabled={busy || !priceRange} onClick={handleInstantSell}>
              {(instantSellTotal ?? 0).toLocaleString('tr-TR')} altına Anında Sat
            </button>
          </div>
        ) : (
          <>
            <p className="market-step-label">
              {itemType === 'material' ? '3. Adet Fiyatını Belirle' : '2. Satış Fiyatını Belirle'}
            </p>
            <div className="market-price-form">
              <p className="market-price-label">
                <strong>{price.toLocaleString('tr-TR')} altına</strong>
                {itemType === 'material' ? ' adedi satılacak' : ' satılacak'}
              </p>
              {itemType === 'material' && quantity > 0 && price > 0 && (
                <p className="market-price-range-hint">
                  Toplam: {(price * quantity).toLocaleString('tr-TR')} altın ({quantity} adet)
                </p>
              )}
              {priceRange && (
                <p className="market-price-range-hint">
                  İzin verilen aralık: {priceRange.min.toLocaleString('tr-TR')} -{' '}
                  {priceRange.max.toLocaleString('tr-TR')} altın
                  {itemType === 'material' ? ' (adet başına)' : ''}
                </p>
              )}
              <QuantityStepper
                value={price}
                onChange={setPrice}
                max={priceRange?.max}
                quickAmounts={
                  itemType === 'material' ? [1, 10, 50, 100] : [10, 100, 1000, 10000, 100000]
                }
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
                  price > priceRange.max ||
                  (itemType === 'material' && (!quantity || quantity <= 0))
                }
                onClick={handleSubmit}
              >
                İlan Ver
              </button>
              {priceRange && (itemType !== 'material' || quantity > 0) && (
                <button className="market-instant-sell-btn" disabled={busy} onClick={handleInstantSell}>
                  {(instantSellTotal ?? 0).toLocaleString('tr-TR')} altına Anında Sat
                </button>
              )}
            </div>
          </>
        )}
        {error && <p className="market-error">{error}</p>}
      </div>
    </div>
  );
}

function ListingCard({ listing, isMine, busy, onCancel, onBuy }) {
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
  const lifeDays = isLifeItem
    ? (listing.itemType === 'vehicle' ? listing.vehicleLifeDays : listing.weaponLifeDays) ??
      INITIAL_LIFE_DAYS
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
          {!isMine && <span className="market-seller"> · {listing.sellerName}</span>}
        </span>
        {lifeDays != null && (
          <div className="market-listing-life-row">
            <span className="market-listing-life-label">
              Ömür: {lifeDays} / {INITIAL_LIFE_DAYS} gün · Tamir hakkı: {MAX_REPAIRS - repairsUsed}/
              {MAX_REPAIRS}
            </span>
            <div className="market-listing-life-bar">
              <div
                className="market-listing-life-fill"
                style={{ width: `${Math.round(Math.max(0, Math.min(1, lifeDays / INITIAL_LIFE_DAYS)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <button className="market-btn small" disabled={busy} onClick={isMine ? onCancel : onBuy}>
        {isMine ? 'İptal Et' : 'Satın Al'}
      </button>
    </div>
  );
}

function BuyMaterialModal({ listing, onClose, onBought }) {
  const unitPrice = listing.unitPrice || Math.round(listing.price / (listing.quantity || 1));
  const [qty, setQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const total = qty * unitPrice;

  const handleBuy = async () => {
    if (!qty || qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await buyListing(listing.id, qty);
      onBought?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Satın alınamadı.');
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
          {listing.sellerName} · {unitPrice.toLocaleString('tr-TR')} altın / adet ·{' '}
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
        <button className="market-btn primary" disabled={busy || !qty || qty <= 0} onClick={handleBuy}>
          {busy ? '…' : `${total.toLocaleString('tr-TR')} altına Satın Al`}
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
function MyListingWithAd({ listing, busy, onCancel, advertising, onStartAdvertise, onCancelAdvertise, onConfirmAdvertise }) {
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
            <strong>{AD_PRICE.toLocaleString('tr-TR')} altın</strong>. Kabul ediyor musun?
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
  const { listings } = useMarketplaceListings();
  // view — 'home' (yeni ana sayfa: avantajlı/reklam panelleri + 4 kategori
  // butonu) ya da CATEGORIES id'lerinden biri (kategori içine girildiğinde).
  // Eski üstteki sekme çubuğu kaldırıldı (kullanıcı revizesi).
  const [view, setView] = useState('home');
  const [materialFilter, setMaterialFilter] = useState('all');
  const [showSellForm, setShowSellForm] = useState(false);
  const [buyModalListing, setBuyModalListing] = useState(null);
  const [advertisingId, setAdvertisingId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  const runAdvertise = async (listingId) => {
    setBusy(listingId);
    setError(null);
    try {
      await advertiseListing(listingId);
      setAdvertisingId(null);
    } catch (err) {
      setError(err.message || 'Reklam verilemedi.');
    } finally {
      setBusy(null);
    }
  };

  // Eski (adet-fiyatlı/birleştirme sisteminden önce açılmış) malzeme
  // ilanlarını, 24 saatlik otomatik temizliği beklemeden şimdi birleştir
  // — sessizce, sadece bir kez (oturum başına).
  useEffect(() => {
    if (!user || legacyMaterialMergeTriggered) return;
    legacyMaterialMergeTriggered = true;
    runMergeLegacyMaterialListings().catch((err) => {
      console.error('Eski ilanlar birleştirilemedi:', err);
    });
  }, [user]);

  // Avantajlı/Reklam panelleri TÜM kategorilerden besleniyor (ana sayfa),
  // en büyük indirim / en yeni reklam önde olacak şekilde sıralanıyor.
  const advantageousListings = listings
    .filter(isAdvantageousListing)
    .sort((a, b) => listingComparablePrice(a) / listingCeilingPrice(a) - listingComparablePrice(b) / listingCeilingPrice(b));
  const advertisedListings = listings
    .filter(isAdvertisedListing)
    .sort((a, b) => (b.adExpiresAt?.toMillis() || 0) - (a.adExpiresAt?.toMillis() || 0));

  const categoryListings =
    view === 'home'
      ? []
      : listings
          .filter((l) => l.itemType === view)
          .filter((l) => view !== 'material' || materialFilter === 'all' || l.materialType === materialFilter);
  const myListings = categoryListings.filter((l) => l.sellerId === user?.uid);
  const otherListings = categoryListings.filter((l) => l.sellerId !== user?.uid);

  const buyOrOpenModal = (l) =>
    l.itemType === 'material' ? setBuyModalListing(l) : run(l.id, () => buyListing(l.id));

  return (
    <div className="market-screen">
      {view === 'home' ? (
        <>
          <div className="market-header-row">
            <p className="market-screen-title">🏪 2. El Pazarı</p>
            <button className="market-btn primary" onClick={() => setShowSellForm(true)}>
              + İlan Ver
            </button>
          </div>

          {advantageousListings.length > 0 && (
            <div className="market-home-panel">
              <p className="market-section-title">🔥 Avantajlı Ürünler</p>
              {advantageousListings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  isMine={l.sellerId === user?.uid}
                  busy={busy === l.id}
                  onCancel={() => run(l.id, () => cancelListing(l.id))}
                  onBuy={() => buyOrOpenModal(l)}
                />
              ))}
            </div>
          )}

          {advertisedListings.length > 0 && (
            <div className="market-home-panel">
              <p className="market-section-title">📢 Reklam Verilen Ürünler</p>
              {advertisedListings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  isMine={l.sellerId === user?.uid}
                  busy={busy === l.id}
                  onCancel={() => run(l.id, () => cancelListing(l.id))}
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

          {view === 'material' && (
            <select
              className="market-material-filter"
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
            >
              <option value="all">Tüm malzemeler</option>
              {Object.entries(MATERIAL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          )}

          {myListings.length > 0 && (
            <>
              <p className="market-section-title">İlanlarım</p>
              {myListings.map((l) => (
                <MyListingWithAd
                  key={l.id}
                  listing={l}
                  busy={busy === l.id}
                  onCancel={() => run(l.id, () => cancelListing(l.id))}
                  advertising={advertisingId === l.id}
                  onStartAdvertise={() => setAdvertisingId(l.id)}
                  onCancelAdvertise={() => setAdvertisingId(null)}
                  onConfirmAdvertise={() => runAdvertise(l.id)}
                />
              ))}
            </>
          )}

          <p className="market-section-title">Diğer İlanlar</p>
          {otherListings.length === 0 && <p className="market-hint">Bu kategoride başka ilan yok.</p>}
          {otherListings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              isMine={false}
              busy={busy === l.id}
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
        <BuyMaterialModal listing={buyModalListing} onClose={() => setBuyModalListing(null)} />
      )}
    </div>
  );
}
