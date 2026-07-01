import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { useShipSchedule } from '../../hooks/useShipSchedule';
import { usePendingLimanOrder } from '../../hooks/usePendingLimanOrder';
import {
  buyContrabandFromDepo,
  sellContrabandToDepo,
  placeLimanOrder,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './LimanDepoScreen.css';

const DEPO_BUY_PRICE = 4000;
const DEPO_SELL_PRICE = 2500;

const LIMAN_MATERIALS = [
  { id: 'depoUpgrade', label: 'Depo Geliştirme Malzemesi', price: 400, max: 10 },
  { id: 'vitesUpgrade', label: 'Vites Geliştirme Malzemesi', price: 400, max: 10 },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 80, max: 50 },
];

export default function LimanDepoScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { inventory } = useInventory();
  const { statusLabel, schedule } = useShipSchedule();
  const { order } = usePendingLimanOrder();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [amounts, setAmounts] = useState({});

  if (!user) {
    return <SignInPrompt message="Liman ve Depo'yu kullanmak için giriş yapmalısın." />;
  }

  const gold = player?.gold ?? 0;
  const contrabandQty = inventory.yasakliMadde || 0;

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

  const setAmount = (key, value) => setAmounts((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="liman-depo-screen">
      <div className="liman-depo-section">
        <p className="liman-depo-section-title">Gemi Durumu</p>
        <p className="liman-depo-ship-status">
          {statusLabel || 'Bilinmiyor'}
          {schedule?.dayInCycle ? ` (${schedule.dayInCycle}. gün)` : ''}
        </p>
      </div>

      <div className="liman-depo-section">
        <p className="liman-depo-section-title">Depo — Kaçak Mal</p>
        <p className="liman-depo-hint">
          Sahip olduğun: <strong>{contrabandQty} adet</strong>
        </p>
        <div className="liman-depo-row">
          <input
            type="number"
            min="1"
            placeholder="Adet"
            value={amounts.buyDepo || ''}
            onChange={(e) => setAmount('buyDepo', e.target.value)}
            className="liman-depo-input"
          />
          <button
            className="liman-depo-btn"
            disabled={busy === 'buyDepo' || !amounts.buyDepo}
            onClick={() =>
              run('buyDepo', () => buyContrabandFromDepo(Number(amounts.buyDepo)))
            }
          >
            Al ({DEPO_BUY_PRICE.toLocaleString('tr-TR')}/adet)
          </button>
        </div>
        <div className="liman-depo-row">
          <input
            type="number"
            min="1"
            max={contrabandQty}
            placeholder="Adet"
            value={amounts.sellDepo || ''}
            onChange={(e) => setAmount('sellDepo', e.target.value)}
            className="liman-depo-input"
          />
          <button
            className="liman-depo-btn"
            disabled={busy === 'sellDepo' || !amounts.sellDepo}
            onClick={() =>
              run('sellDepo', () => sellContrabandToDepo(Number(amounts.sellDepo)))
            }
          >
            Sat ({DEPO_SELL_PRICE.toLocaleString('tr-TR')}/adet, şüphe yok)
          </button>
        </div>
      </div>

      <div className="liman-depo-section">
        <p className="liman-depo-section-title">Liman — Toplu Sipariş</p>
        <p className="liman-depo-hint">
          Bu tur için verdiğin siparişler, gemi şehre döndüğünde envanterine eklenir.
        </p>
        {LIMAN_MATERIALS.map((m) => {
          const ordered = order[m.id] || 0;
          const remaining = m.max - ordered;
          return (
            <div key={m.id} className="liman-order-row">
              <div className="liman-order-info">
                <span className="liman-order-label">{m.label}</span>
                <span className="liman-order-meta">
                  {m.price} altın/adet · Bu tur sipariş: {ordered}/{m.max}
                </span>
              </div>
              <div className="liman-depo-row">
                <input
                  type="number"
                  min="1"
                  max={remaining}
                  placeholder="Adet"
                  value={amounts[m.id] || ''}
                  onChange={(e) => setAmount(m.id, e.target.value)}
                  className="liman-depo-input"
                  disabled={remaining <= 0}
                />
                <button
                  className="liman-depo-btn"
                  disabled={busy === m.id || !amounts[m.id] || remaining <= 0}
                  onClick={() =>
                    run(m.id, () => placeLimanOrder(m.id, Number(amounts[m.id])))
                  }
                >
                  {remaining <= 0 ? 'Bu tur doldu' : 'Sipariş Ver'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {gold < DEPO_BUY_PRICE && <p className="liman-depo-hint">Cepteki altın: {gold.toLocaleString('tr-TR')}</p>}
      {error && <p className="liman-depo-error">{error}</p>}
    </div>
  );
}
