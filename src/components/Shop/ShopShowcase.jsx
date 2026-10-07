import { useState } from 'react';
import { useShopListings } from '../../hooks/useShopListings';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { buyListing } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleImage } from '../VehicleCard/VehicleCard';
import { lifeCapOf } from '../../../functions/itemRules.js';
import './Shop.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const weaponImage = (id) => weaponCatalog.find((w) => w.id === id)?.image;

export function ListingCells({ life, cap, broken = false }) {
  return (
    <div className="sh-life" title={`${life}/${cap}`}>
      {Array.from({ length: cap }, (_, i) => (
        <i key={i} className={`${i < life ? 'on' : ''}${broken && i === life - 1 ? ' broken' : ''}`} />
      ))}
    </div>
  );
}

// v77 — Müşteri: "Satılık silahlar / araçlar" (vitrindeki ilanlar, fiyat listesi gibi)
export default function ShopShowcase({ houseId, kind, onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const listings = useShopListings(houseId);
  const [busy, setBusy] = useState(null);
  const [cue, setCue] = useState(null);
  const [sold, setSold] = useState({});
  const gold = Number(player?.gold || 0);

  const buy = async (l) => {
    if (gold < l.price) {
      setCue({ id: l.id, kind: 'gold', n: Date.now() });
      return;
    }
    setBusy(l.id);
    try {
      await buyListing(l.id);
      setSold((s) => ({ ...s, [l.id]: true }));
    } catch (err) {
      setCue({ id: l.id, kind: /satılmış|bulunamadı/i.test(err?.message || '') ? 'gone' : 'err', n: Date.now() });
    } finally {
      setBusy(null);
    }
  };

  const list = listings.filter((l) => l.itemType === kind).sort((a, b) => a.price - b.price);
  return (
    <div className="sh-root">
      <div className="sh-head">
        <b>{kind === 'weapon' ? '🔫' : '🚗'} Satılık</b>
        <span className={`sh-wallet${cue?.kind === 'gold' ? ' cue-blink' : ''}`} key={cue?.kind === 'gold' ? cue.n : 'w'}>
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(gold)}
        </span>
        {onClose && (
          <button className="wk-x" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      {list.length === 0 && (
        <div className="sh-empty">
          <span>{kind === 'weapon' ? '🔫' : '🚗'}</span>
          <b>0</b>
        </div>
      )}
      <div className="sh-grid">
        {list.map((l) => {
          const isW = l.itemType === 'weapon';
          const img = isW ? weaponImage(l.weaponCatalogId) : vehicleImage(l.vehicleCatalogId);
          const cap = lifeCapOf(l.itemType);
          const life = isW ? l.weaponLifeDays : l.vehicleLifeDays;
          const mine = l.sellerId === user?.uid;
          const gone = sold[l.id] || (cue?.id === l.id && cue.kind === 'gone');
          const poor = gold < l.price;
          return (
            <div key={l.id} className={`sh-card${gone ? ' cue-sold' : ''}`}>
              <div className="sh-img">{img ? <img src={img} alt="" /> : <span>{isW ? '🔫' : '🚗'}</span>}</div>
              <b className="sh-name">{isW ? l.weaponName : l.vehicleModel}</b>
              <span className="sh-stat">
                {isW ? `Sv.${l.weaponLevel} · ⚡ ${fmt(l.weaponPower)}` : `⚙️ ${l.vehicleGearLevel} · ⛽ ${l.vehicleTank}${l.vehicleGearUpgraded ? ' ⬆' : ''}${l.vehicleTankUpgraded ? ' ⬆' : ''}`}
              </span>
              <ListingCells life={life ?? cap} cap={cap} />
              <span className="sh-repairs">🔧 {10 - (isW ? l.weaponRepairsUsed || 0 : l.vehicleRepairsUsed || 0)}/10</span>
              <button
                className={`sh-buy${poor && !mine ? ' dim' : ''}${cue?.id === l.id && cue.kind === 'gold' ? ' cue-shake' : ''}`}
                key={cue?.id === l.id ? cue.n : l.id}
                disabled={mine || gone || busy === l.id}
                onClick={() => buy(l)}
              >
                {mine ? '★' : busy === l.id ? '…' : (
                  <>
                    <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmt(l.price)}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
