import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { useMyFactory } from '../../hooks/useMyFactory';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import { useMarketplaceListings } from '../../hooks/useMarketplaceListings';
import { createListing, instantSellListing, cancelListing, buyListing } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { weaponCatalog } from '../../data/weaponCatalog';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './MarketplaceScreen.css';

const MATERIAL_LABELS = {
  depoUpgrade: 'Depo Geliştirme Malzemesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
};
const MACHINE_LABELS = {
  mining: 'Mining Makinesi',
  depoUpgrade: 'Depo Geliştirme Malzemesi Makinesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi Makinesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi Makinesi',
  yasakliMadde: 'Yasaklı Madde Üretim Makinesi',
};
const MATERIAL_EMOJIS = {
  mining: '⛏️',
  depoUpgrade: '🛢️',
  vitesUpgrade: '⚙️',
  silahUpgrade: '🔧',
  yasakliMadde: '💊',
};

const TABS = [
  { id: 'vehicle', label: 'Araç' },
  { id: 'weapon', label: 'Silah' },
  { id: 'material', label: 'Malzeme' },
  { id: 'machine', label: 'Makine' },
];

// Fiyat sınırları — hesaplar arası para aklamayı önlemek için backend'de
// de AYNI kurallarla doğrulanıyor (bkz. functions/index.js createListing).
// Burası sadece kullanıcıya yol göstermek için.
const AMAZOR_PRICES = { yasakliMadde: 2500, vitesUpgrade: 500, depoUpgrade: 500, silahUpgrade: 100 };
const MACHINE_PRICES = { depoUpgrade: 50000, vitesUpgrade: 50000, silahUpgrade: 50000, yasakliMadde: 100000 };

function vehiclePriceRange(vehicle) {
  const base = vehicleCatalog.find((v) => v.id === vehicle.catalogId)?.price || 0;
  const mult = vehicle.gearUpgraded && vehicle.tankUpgraded ? 3 : vehicle.gearUpgraded || vehicle.tankUpgraded ? 2 : 1;
  const max = base * mult;
  return { min: Math.floor(max / 2), max };
}

function weaponPriceRange(weapon) {
  const base = weaponCatalog.find((w) => w.id === weapon.catalogId)?.price || 0;
  const mult = weapon.level || 1;
  const max = base * mult;
  return { min: Math.floor(max / 2), max };
}

function materialPriceRange(materialType, qty) {
  const max = AMAZOR_PRICES[materialType] * qty;
  return { min: Math.floor((AMAZOR_PRICES[materialType] / 2) * qty), max };
}

function machinePriceRange(machineType, cryptoPrice) {
  const max = machineType === 'mining' ? Math.ceil(2 * cryptoPrice) : MACHINE_PRICES[machineType];
  return { min: Math.floor(max / 2), max };
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
    return `${MATERIAL_LABELS[listing.materialType] || listing.materialType} × ${listing.quantity}`;
  if (listing.itemType === 'machine') return MACHINE_LABELS[listing.machineType] || listing.machineType;
  return 'Ürün';
}

function SellForm({ onCreated, onClose }) {
  const { vehicles } = useVehicles();
  const { weapons } = useWeapons();
  const { inventory } = useInventory();
  const { machines: myMachines } = useMyFactory();
  const { prices } = useInvestmentPrices();

  const [itemType, setItemType] = useState('vehicle');
  const [selectedId, setSelectedId] = useState('');
  const [materialType, setMaterialType] = useState('depoUpgrade');
  const [quantity, setQuantity] = useState(0);
  const [machineId, setMachineId] = useState('');
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sellableVehicles = vehicles.filter((v) => !v.mortgaged && !v.seizedByBank && !v.listed);
  const sellableWeapons = weapons.filter((w) => !w.listed);
  const sellableMachines = myMachines.filter((m) => !m.workerId);

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
      return quantity > 0 ? materialPriceRange(materialType, quantity) : null;
    }
    if (itemType === 'machine') {
      const m = sellableMachines.find((x) => x.id === machineId);
      return m ? machinePriceRange(m.type, prices.cryptoPrice) : null;
    }
    return null;
  })();

  const handleSubmit = async () => {
    if (!price || price <= 0) return;
    setBusy(true);
    setError(null);
    try {
      if (itemType === 'vehicle') {
        if (!selectedId) return;
        await createListing({ itemType, itemId: selectedId, price });
      } else if (itemType === 'weapon') {
        if (!selectedId) return;
        await createListing({ itemType, itemId: selectedId, price });
      } else if (itemType === 'material') {
        if (!quantity || quantity <= 0) return;
        await createListing({ itemType, materialType, quantity, price });
      } else if (itemType === 'machine') {
        if (!machineId) return;
        await createListing({ itemType, machineId, price });
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
    setBusy(true);
    setError(null);
    try {
      if (itemType === 'vehicle' || itemType === 'weapon') {
        if (!selectedId) return;
        await instantSellListing({ itemType, itemId: selectedId });
      } else if (itemType === 'material') {
        if (!quantity || quantity <= 0) return;
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
            <div className="market-item-picker">
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
              quickAmounts={[10, 100, 1000]}
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

        <p className="market-step-label">{itemType === 'material' ? '3' : '2'}. Satış Fiyatını Belirle</p>
        <div className="market-price-form">
          <p className="market-price-label">
            <strong>{price.toLocaleString('tr-TR')} altına</strong> satılacak
          </p>
          {priceRange && (
            <p className="market-price-range-hint">
              İzin verilen aralık: {priceRange.min.toLocaleString('tr-TR')} -{' '}
              {priceRange.max.toLocaleString('tr-TR')} altın
            </p>
          )}
          <QuantityStepper
            value={price}
            onChange={setPrice}
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
              busy || !price || !priceRange || price < priceRange.min || price > priceRange.max
            }
            onClick={handleSubmit}
          >
            İlan Ver
          </button>
          {priceRange && (
            <button className="market-instant-sell-btn" disabled={busy} onClick={handleInstantSell}>
              {priceRange.min.toLocaleString('tr-TR')} altına Anında Sat
            </button>
          )}
        </div>
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

  return (
    <div className="market-listing-card">
      {media}
      <div className="market-listing-info">
        <span className="market-listing-label">{listingLabel(listing)}</span>
        <span className="market-listing-price">
          {listing.price.toLocaleString('tr-TR')} altın
          {listing.itemType === 'material' && listing.quantity > 0 && (
            <span className="market-unit-price">
              {' '}
              (adet fiyatı: {Math.round(listing.price / listing.quantity).toLocaleString('tr-TR')} altın)
            </span>
          )}
          {!isMine && <span className="market-seller"> · {listing.sellerName}</span>}
        </span>
      </div>
      <button className="market-btn small" disabled={busy} onClick={isMine ? onCancel : onBuy}>
        {isMine ? 'İptal Et' : 'Satın Al'}
      </button>
    </div>
  );
}

export default function MarketplaceScreen() {
  const { user } = useAuth();
  const { listings } = useMarketplaceListings();
  const [tab, setTab] = useState('vehicle');
  const [materialFilter, setMaterialFilter] = useState('all');
  const [showSellForm, setShowSellForm] = useState(false);
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

  const tabListings = listings
    .filter((l) => l.itemType === tab)
    .filter((l) => tab !== 'material' || materialFilter === 'all' || l.materialType === materialFilter);
  const myListings = tabListings.filter((l) => l.sellerId === user?.uid);
  const otherListings = tabListings.filter((l) => l.sellerId !== user?.uid);

  return (
    <div className="market-screen">
      <div className="market-header-row">
        <div className="market-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`market-tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="market-btn primary" onClick={() => setShowSellForm(true)}>
          + İlan Ver
        </button>
      </div>

      {tab === 'material' && (
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
            <ListingCard
              key={l.id}
              listing={l}
              isMine
              busy={busy === l.id}
              onCancel={() => run(l.id, () => cancelListing(l.id))}
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
          onBuy={() => run(l.id, () => buyListing(l.id))}
        />
      ))}
      {error && <p className="market-error">{error}</p>}

      {showSellForm && <SellForm onClose={() => setShowSellForm(false)} />}
    </div>
  );
}
