import { useState } from 'react';
import { useShopListings } from '../../hooks/useShopListings';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { buyListing } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleImage } from '../VehicleCard/VehicleCard';
import HoldButton from '../HoldButton/HoldButton';
import { lifeCapOf, VEHICLE_WEAPON_MAX_REPAIRS } from '../../../functions/itemRules.js';
import '../../styles/bizui.css';
import './Shop.css';
import { listingRaceLine } from '../RaceTrackScreen/CarStats';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const weaponImage = (id) => weaponCatalog.find((w) => w.id === id)?.image;

// v77 — Müşteri: dükkânın vitrinindeki satılık silahlar / arabalar
export default function ShopShowcase({ houseId, kind, onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const listings = useShopListings(houseId);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [sold, setSold] = useState({});
  const gold = Number(player?.gold || 0);
  const isW = kind === 'weapon';

  const buy = async (l) => {
    setBusy(l.id);
    setMsg(null);
    try {
      await buyListing(l.id);
      setSold((s) => ({ ...s, [l.id]: true }));
      setMsg({ ok: true, text: `✓ Satın aldın: ${isW ? l.weaponName : l.vehicleModel}. ${isW ? 'Silahların' : 'Arabaların'} arasında.` });
    } catch (err) {
      setMsg({ ok: false, text: /satılmış|bulunamadı/i.test(err?.message || '') ? 'Bu ürün az önce satıldı.' : err?.message || 'Satın alınamadı.' });
    } finally {
      setBusy(null);
    }
  };

  const list = listings.filter((l) => l.itemType === kind).sort((a, b) => a.price - b.price);
  return (
    <div className="bz sh-root">
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>{isW ? '🔫 Satılık silahlar' : '🚗 Satılık arabalar'}</h3>
          <p>Almak için basılı tut.</p>
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
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(gold)}
        </b>
      </div>
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      {list.length === 0 && <p className="bz-note">Şu an satılık {isW ? 'silah' : 'araba'} yok.</p>}
      <div className="sh-grid">
        {list.map((l) => {
          const img = isW ? weaponImage(l.weaponCatalogId) : vehicleImage(l.vehicleCatalogId);
          const cap = lifeCapOf(l.itemType);
          const life = (isW ? l.weaponLifeDays : l.vehicleLifeDays) ?? cap;
          const repairsLeft = VEHICLE_WEAPON_MAX_REPAIRS - (isW ? l.weaponRepairsUsed || 0 : l.vehicleRepairsUsed || 0);
          const mine = l.sellerId === user?.uid;
          const gone = sold[l.id];
          const poor = gold < l.price;
          return (
            <div key={l.id} className={`sh-card${gone ? ' cue-sold' : ''}`}>
              <div className="sh-img">{img ? <img src={img} alt="" /> : <span>{isW ? '🔫' : '🚗'}</span>}</div>
              <b className="sh-name">{isW ? l.weaponName : l.vehicleModel}</b>
              <span className="sh-stat">
                {isW
                  ? `Seviye ${l.weaponLevel} · güç ${fmt(l.weaponPower)}`
                  : listingRaceLine(l)}
              </span>
              <span className="sh-stat">
                Ömür {life}/{cap} gün · tamir hakkı {repairsLeft}/{VEHICLE_WEAPON_MAX_REPAIRS}
              </span>
              <span className="sh-price">
                <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmt(l.price)} altın
              </span>
              {mine ? (
                <span className="bz-tag">Senin ilanın</span>
              ) : gone ? (
                <span className="bz-tag ok">Satın alındı</span>
              ) : poor ? (
                <span className="bz-tag bad">Altının yetmiyor</span>
              ) : (
                <HoldButton className="bz-btn gold sm" disabled={busy === l.id} onDone={() => buy(l)}>
                  {busy === l.id ? 'Alınıyor…' : 'Basılı tut: satın al'}
                </HoldButton>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
