import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { weaponCatalog } from '../../data/weaponCatalog';
import { buyWeapon } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { useShopOffers, withOfferPrices } from '../../hooks/useShopOffers';
import { priceChangedText } from '../../lib/priceChanged';
import './WeaponShopScreen.css';

// Silah Mağazası SADECE silah SATIN ALMA yeri — geliştirme Profil'den
// yapılıyor.
// v130 — oyuncu silahçısı da aynı ekranı kullanır: items = [{ ...katalog, price }]
// (sadece stokta olanlar, dükkânın fiyatıyla) · onBuy(katalog) · disabledText
const BUY_FEEDBACK_MS = 2500; // satın alınca butonda bir süre "Satın Alındı ✓"

export default function WeaponShopScreen({ items = null, onBuy = null, disabledText = null }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [justBought, setJustBought] = useState(() => new Set());
  const timers = useRef({});
  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    []
  );
  // v132: oyunun mağazası — en ucuz oyuncu silahçısının fiyatı
  const best = useShopOffers('weapon', { enabled: !items && Boolean(user) });

  if (!user) {
    return <SignInPrompt message="Silah satın almak için giriş yapmalısın." />;
  }

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(priceChangedText(err) || err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  const gold = player?.gold ?? 0;
  const list = items || withOfferPrices(weaponCatalog, best);
  const rawBuy = onBuy || ((w) => buyWeapon(w.id, w.price));
  const buy = async (w) => {
    await rawBuy(w);
    setJustBought((prev) => new Set(prev).add(w.id));
    clearTimeout(timers.current[w.id]);
    timers.current[w.id] = setTimeout(() => {
      setJustBought((prev) => {
        const next = new Set(prev);
        next.delete(w.id);
        return next;
      });
    }, BUY_FEEDBACK_MS);
  };

  return (
    <div className="weapon-shop">
      {list.map((w) => (
        <div key={w.id} className="weapon-card">
          <img className="weapon-card-image" src={w.image} alt={w.name} />
          <div className="weapon-card-info">
            <span className="weapon-card-name">{w.name}</span>
            <span className="weapon-card-stats">
              Güç {w.power.toLocaleString('tr-TR')} · {w.price.toLocaleString('tr-TR')} altın
            </span>
          </div>
          <button
            className={`weapon-card-buy${justBought.has(w.id) ? ' bought' : ''}`}
            disabled={Boolean(disabledText) || busy === `buy-${w.id}` || justBought.has(w.id) || gold < w.price}
            onClick={() => run(`buy-${w.id}`, () => buy(w))}
          >
            {busy === `buy-${w.id}` ? '…' : justBought.has(w.id) ? 'Satın Alındı ✓' : disabledText || 'Satın Al'}
          </button>
        </div>
      ))}

      {error && <p className="weapon-shop-error">{error}</p>}
    </div>
  );
}
