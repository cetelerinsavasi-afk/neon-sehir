import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBizSpend } from '../../hooks/useVenueData';
import { shopAction } from '../../services/gameActions';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import HeldIcon from '../HouseScreen/HeldIcon';
import { menuOf, menuPriceOf, MENU_DAILY_LIMIT } from '../../../functions/venue.js';
import '../../styles/bizui.css';
import './Venue.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// v77 — Cafe / Bar menüsü: dokununca anında alınır (eldeki ürün, 2 dk, ısmarlanabilir).
// Günlük 10.000 sınırı oyuncuya önceden gösterilmez; aşılmak istenince uyarı çıkar.
export default function MenuPanel({ houseId, houseDoc, onClose, onBought }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const isOwner = houseDoc?.ownerUid === user?.uid;
  const spent = useBizSpend(houseId, !isOwner);
  const [busy, setBusy] = useState(null);
  const [cue, setCue] = useState(null);
  const [stale, setStale] = useState({});
  const gold = Number(player?.gold || 0);
  const menu = Object.keys(menuOf(houseDoc?.items));
  const left = MENU_DAILY_LIMIT - spent;

  const buy = async (k) => {
    const price = isOwner ? 0 : menuPriceOf(houseDoc, k);
    if (!isOwner && price > left) return setCue({ k, kind: 'limit', n: Date.now() });
    if (!isOwner && gold < price) return setCue({ k, kind: 'gold', n: Date.now() });
    setBusy(k);
    try {
      const r = await shopAction({ op: 'menuBuy', houseId, product: k, expect: price });
      setStale((s) => ({ ...s, [k]: false }));
      onBought?.(r);
    } catch (err) {
      const m = String(err?.message || '');
      if (m.startsWith('price-changed')) setStale((s) => ({ ...s, [k]: true }));
      setCue({ k, kind: m.startsWith('limit') ? 'limit' : m === 'gold' ? 'gold' : 'err', n: Date.now() });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="vn-panel bz" onClick={(e) => e.stopPropagation()}>
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>🍽️ Menü</h3>
          <p>{isOwner ? 'Kendi mekânın: ücretsiz.' : 'Ürüne dokun, satın al.'}</p>
        </div>
        <button className="bz-x" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className={`bz-wallet${cue?.kind === 'gold' ? ' cue-blink' : ''}`} key={cue?.kind === 'gold' ? cue.n : 'w'}>
        <span>Cebindeki altın</span>
        <b>
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(gold)}
        </b>
      </div>
      {cue?.kind === 'gold' && <p className="bz-warn">Altının yetmiyor.</p>}
      {cue?.kind === 'err' && <p className="bz-warn">Satın alınamadı, tekrar dene.</p>}
      {Object.values(stale).some(Boolean) && <p className="bz-note">Bazı fiyatlar az önce değişti; yeni fiyatlara bakıp tekrar dokun.</p>}
      {cue?.kind === 'limit' && (
        <div className="vn-limit-warn cue-shake" key={cue.n}>
          🔒 Bir mekânda günde en fazla {fmt(MENU_DAILY_LIMIT)} altın harcayabilirsin.
        </div>
      )}
      {menu.length === 0 && <p className="bz-note">Bu mekânın menüsü boş.</p>}
      <div className="vn-menu">
        {menu.map((k) => {
          const p = HOUSE_PRODUCTS[k];
          const price = isOwner ? 0 : menuPriceOf(houseDoc, k);
          const poor = !isOwner && gold < price;
          const hit = cue?.k === k;
          return (
            <button
              key={`${k}${hit ? cue.n : ''}`}
              className={`vn-item${poor ? ' poor' : ''}${hit && cue.kind !== 'err' ? ' cue-shake' : ''}`}
              disabled={busy === k}
              onClick={() => buy(k)}
            >
              <span className="vn-emoji">
                <HeldIcon product={k} size={30} />
              </span>
              <span className="vn-name">{p.label}</span>
              <span className={`vn-price${stale[k] ? ' cue-glow' : ''}`}>
                {isOwner ? 'Ücretsiz' : (
                  <>
                    <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {fmt(price)}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
