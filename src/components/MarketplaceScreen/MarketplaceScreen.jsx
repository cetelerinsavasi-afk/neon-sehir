import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { useProductionMachines } from '../../hooks/useProductionMachines';
import { useMarketplaceListings } from '../../hooks/useMarketplaceListings';
import { createListing, cancelListing, buyListing } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { weaponCatalog } from '../../data/weaponCatalog';
import './MarketplaceScreen.css';

const MATERIAL_LABELS = {
  depoUpgrade: 'Depo Geliştirme Malzemesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
};
const MACHINE_LABELS = {
  depoUpgrade: 'Depo Geliştirme Makinesi',
  vitesUpgrade: 'Vites Geliştirme Makinesi',
  silahUpgrade: 'Silah Geliştirme Makinesi',
  yasakliMadde: 'Yasaklı Madde Üretim Makinesi',
};
const MATERIAL_EMOJIS = {
  depoUpgrade: '📦',
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

function vehicleImage(catalogId) {
  return vehicleCatalog.find((v) => v.id === catalogId)?.image;
}
function weaponImage(catalogId) {
  return weaponCatalog.find((w) => w.id === catalogId)?.image;
}

function listingLabel(listing) {
  if (listing.itemType === 'vehicle') {
    const upgrades = [];
    if (listing.vehicleGearUpgraded) upgrades.push(`Vites ${listing.vehicleGearLevel}`);
    if (listing.vehicleTankUpgraded) upgrades.push(`Depo ${listing.vehicleTank}L`);
    return upgrades.length > 0
      ? `${listing.vehicleModel} (${upgrades.join(', ')} — geliştirilmiş)`
      : listing.vehicleModel;
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
  const { machines } = useProductionMachines();

  const [itemType, setItemType] = useState('vehicle');
  const [selectedId, setSelectedId] = useState('');
  const [materialType, setMaterialType] = useState('depoUpgrade');
  const [quantity, setQuantity] = useState('');
  const [machineType, setMachineType] = useState('depoUpgrade');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sellableVehicles = vehicles.filter((v) => !v.mortgaged && !v.seizedByBank && !v.listed);
  const sellableWeapons = weapons.filter((w) => !w.listed);

  const handleSubmit = async () => {
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return;
    setBusy(true);
    setError(null);
    try {
      if (itemType === 'vehicle') {
        if (!selectedId) return;
        await createListing({ itemType, itemId: selectedId, price: priceNum });
      } else if (itemType === 'weapon') {
        if (!selectedId) return;
        await createListing({ itemType, itemId: selectedId, price: priceNum });
      } else if (itemType === 'material') {
        const qty = Number(quantity);
        if (!qty || qty <= 0) return;
        await createListing({ itemType, materialType, quantity: qty, price: priceNum });
      } else if (itemType === 'machine') {
        await createListing({ itemType, machineType, price: priceNum });
      }
      setSelectedId('');
      setQuantity('');
      setPrice('');
      onCreated?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'İlan oluşturulamadı.');
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
          <select className="market-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Araç seç…</option>
            {sellableVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.model} (Vites {v.gearLevel}, Depo {v.baseTank + (v.tankBonus || 0)}L
                {v.turboCount > 0 ? `, Turbo ×${v.turboCount}` : ''})
              </option>
            ))}
          </select>
        )}

        {itemType === 'weapon' && (
          <select className="market-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Silah seç…</option>
            {sellableWeapons.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} (Sv. {w.level}, Güç {w.power.toLocaleString('tr-TR')})
              </option>
            ))}
          </select>
        )}

        {itemType === 'material' && (
          <div className="market-material-form">
            <select
              className="market-select"
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
            >
              {Object.entries(MATERIAL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label} (elinde: {inventory[key] || 0})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max={inventory[materialType] || 0}
              placeholder="Kaç adet satmak istiyorsun?"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="market-input market-input-wide"
            />
          </div>
        )}

        {itemType === 'machine' && (
          <select className="market-select" value={machineType} onChange={(e) => setMachineType(e.target.value)}>
            {Object.entries(MACHINE_LABELS).map(([key, label]) => (
              <option key={key} value={key} disabled={!machines[key]?.owned}>
                {label} {machines[key]?.owned ? '' : '(sahip değilsin)'}
              </option>
            ))}
          </select>
        )}

        <div className="market-row">
          <input
            type="number"
            min="1"
            placeholder="Satış fiyatı (altın)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="market-input"
          />
          <button className="market-btn primary" disabled={busy || !price} onClick={handleSubmit}>
            İlan Ver
          </button>
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
