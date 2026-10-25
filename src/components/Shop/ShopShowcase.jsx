import { useAuth } from '../../contexts/AuthContext';
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
  const { user } = useAuth();
  const { player } = usePlayer();
  const stock = useShopStock(houseId);
  const isW = kind === 'weapon';
  const catalog = isW ? weaponCatalog : vehicleCatalog;
  const items = catalog
    .filter((c) => stockQty(stock, String(c.id)) > 0)
    .map((c) => ({ ...c, price: clampStockPrice(c.price, stock?.prices?.[String(c.id)]) }));
  const mine = Boolean(stock?.ownerUid) && stock.ownerUid === user?.uid;
  const onBuy = async (c) => {
    try {
      await shopAction({ op: 'stockBuy', houseId, catalogId: c.id, expect: c.price });
    } catch (e) {
      throw new Error(bizErrText(e));
    }
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
        <Screen items={items} onBuy={onBuy} disabledText={mine ? 'Senin' : null} />
      )}
    </div>
  );
}
