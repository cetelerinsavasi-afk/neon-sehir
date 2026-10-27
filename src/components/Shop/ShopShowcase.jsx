import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useShopStock } from '../../hooks/useShopStock';
import { shopAction } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { bizErrText } from '../../lib/bizErrors';
import { clampStockPrice, stockQty } from '../../../functions/shopStockRules.js';
import WeaponShopScreen from '../WeaponShopScreen/WeaponShopScreen';
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import '../../styles/bizui.css';
import './Shop.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// v130 — Müşteri: oyuncu silahçısı / galerisi. Oyunun mağazasıyla aynı ekran;
// sadece stokta olan ürünler, dükkânın fiyatıyla (stok adedi yazmaz).
export default function ShopShowcase({ houseId, kind, onClose }) {
  const { player } = usePlayer();
  const stock = useShopStock(houseId);
  const isW = kind === 'weapon';
  const catalog = isW ? weaponCatalog : vehicleCatalog;
  // son adet alınınca ürün hemen kaybolmasın — butonda "Satın Alındı ✓" görünsün
  const [recent, setRecent] = useState({});
  const timers = useRef({});
  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    []
  );
  const items = catalog
    .filter((c) => stockQty(stock, String(c.id)) > 0 || recent[c.id])
    .map((c) => ({ ...c, price: stockQty(stock, String(c.id)) > 0 ? clampStockPrice(c.price, stock?.prices?.[String(c.id)]) : recent[c.id] }));
  const onBuy = async (c) => {
    try {
      await shopAction({ op: 'stockBuy', houseId, catalogId: c.id, expect: c.price });
    } catch (e) {
      throw new Error(bizErrText(e));
    }
    setRecent((r) => ({ ...r, [c.id]: c.price }));
    clearTimeout(timers.current[c.id]);
    timers.current[c.id] = setTimeout(() => {
      setRecent((r) => {
        const next = { ...r };
        delete next[c.id];
        return next;
      });
    }, 2600);
  };
  const Screen = isW ? WeaponShopScreen : VehicleGalleryScreen;
  return (
    <div className="bz sh-root">
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>{isW ? '🔫 Silahlar' : '🚗 Arabalar'}</h3>
        </div>
        {onClose && (
          <button className="bz-x" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="bz-wallet">
        <span>Cebindeki altın</span>
        <b>
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(player?.gold)}
        </b>
      </div>
      {stock === null ? (
        <div className="hs-loading">
          <div className="hs-spinner" />
        </div>
      ) : items.length === 0 ? (
        <p className="bz-note sh-empty">{isW ? '🔫' : '🚗'} Tükendi</p>
      ) : (
        // v132: sahibi de kendi dükkânından alabilir
        <Screen items={items} onBuy={onBuy} />
      )}
    </div>
  );
}
