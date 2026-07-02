import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useVehicles } from '../../hooks/useVehicles';
import { useWeapons } from '../../hooks/useWeapons';
import { useInventory } from '../../hooks/useInventory';
import { useProductionMachines } from '../../hooks/useProductionMachines';
import { useMarketplaceListings } from '../../hooks/useMarketplaceListings';
import { createListing, cancelListing, buyListing } from '../../services/gameActions';
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
      : listing.weaponName;
  }
  if (listing.itemType === 'material')
    return `${MATERIAL_LABELS[listing.materialType] || listing.materialType} × ${listing.quantity}`;
  if (listing.itemType === 'machine') return MACHINE_LABELS[listing.machineType] || listing.machineType;
  return 'Ürün';
}

function SellForm({ onCreated }) {
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
    } catch (err) {
      setError(err.message || 'İlan oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="market-sell-form">
      <div className="market-type-row">
        {[
          ['vehicle', 'Araç'],
          ['weapon', 'Silah'],
          ['material', 'Malzeme'],
          ['machine', 'Makine'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`market-type-btn${itemType === key ? ' active' : ''}`}
            onClick={() => {
              setItemType(key);
              setSelectedId('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {itemType === 'vehicle' && (
        <select className="market-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Araç seç…</option>
          {sellableVehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.model}
            </option>
          ))}
        </select>
      )}

      {itemType === 'weapon' && (
        <select className="market-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Silah seç…</option>
          {sellableWeapons.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} (Sv. {w.level})
            </option>
          ))}
        </select>
      )}

      {itemType === 'material' && (
        <div className="market-row">
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
            placeholder="Adet"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="market-input"
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
  );
}

export default function MarketplaceScreen() {
  const { user } = useAuth();
  const { listings } = useMarketplaceListings();
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

  const myListings = listings.filter((l) => l.sellerId === user?.uid);
  const otherListings = listings.filter((l) => l.sellerId !== user?.uid);

  return (
    <div className="market-screen">
      <p className="market-section-title">İlan Ver</p>
      <SellForm />

      {myListings.length > 0 && (
        <>
          <p className="market-section-title">İlanlarım</p>
          {myListings.map((l) => (
            <div key={l.id} className="market-listing-card">
              <span>{listingLabel(l)} — {l.price.toLocaleString('tr-TR')} altın</span>
              <button
                className="market-btn small"
                disabled={busy === l.id}
                onClick={() => run(l.id, () => cancelListing(l.id))}
              >
                İptal Et
              </button>
            </div>
          ))}
        </>
      )}

      <p className="market-section-title">Diğer İlanlar</p>
      {otherListings.length === 0 && <p className="market-hint">Şu an başka ilan yok.</p>}
      {otherListings.map((l) => (
        <div key={l.id} className="market-listing-card">
          <span>
            {listingLabel(l)} — {l.price.toLocaleString('tr-TR')} altın
            <span className="market-seller"> · {l.sellerName}</span>
          </span>
          <button
            className="market-btn small"
            disabled={busy === l.id}
            onClick={() => run(l.id, () => buyListing(l.id))}
          >
            Satın Al
          </button>
        </div>
      ))}
      {error && <p className="market-error">{error}</p>}
    </div>
  );
}
