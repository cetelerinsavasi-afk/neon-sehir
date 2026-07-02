import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useShipSchedule } from '../../hooks/useShipSchedule';
import { usePendingLimanOrder } from '../../hooks/usePendingLimanOrder';
import { placeLimanOrder } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './LimanScreen.css';

const LIMAN_MATERIALS = [
  { id: 'depoUpgrade', label: 'Depo Geliştirme Malzemesi', price: 400, max: 10 },
  { id: 'vitesUpgrade', label: 'Vites Geliştirme Malzemesi', price: 400, max: 10 },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 80, max: 50 },
];

export default function LimanScreen() {
  const { user } = useAuth();
  const { statusLabel, schedule } = useShipSchedule();
  const { order } = usePendingLimanOrder();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [amounts, setAmounts] = useState({});

  if (!user) {
    return <SignInPrompt message="Liman'ı kullanmak için giriş yapmalısın." />;
  }

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
    <div className="liman-screen">
      <div className="liman-section">
        <p className="liman-section-title">Gemi Durumu</p>
        <p className="liman-ship-status">{statusLabel || 'Bilinmiyor'}</p>
      </div>

      <div className="liman-section">
        <p className="liman-section-title">Toplu Sipariş</p>
        <p className="liman-hint">
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
              <div className="liman-input-row">
                <input
                  type="number"
                  min="1"
                  max={remaining}
                  placeholder="Adet"
                  value={amounts[m.id] || ''}
                  onChange={(e) => setAmount(m.id, e.target.value)}
                  className="liman-input"
                  disabled={remaining <= 0}
                />
                <button
                  className="liman-btn"
                  disabled={busy === m.id || !amounts[m.id] || remaining <= 0}
                  onClick={() => run(m.id, () => placeLimanOrder(m.id, Number(amounts[m.id])))}
                >
                  {remaining <= 0 ? 'Bu tur doldu' : 'Sipariş Ver'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="liman-error">{error}</p>}

      <div className="liman-section">
        <p className="liman-section-title">Bekleyen Siparişlerin</p>
        {(() => {
          const hasAny = LIMAN_MATERIALS.some((m) => (order[m.id] || 0) > 0);
          if (!hasAny) return <p className="liman-hint">Bekleyen bir siparişin yok.</p>;
          const dayInCycle = schedule?.dayInCycle;
          const daysLeft = dayInCycle ? (5 - dayInCycle) % 4 : null;
          return (
            <>
              {LIMAN_MATERIALS.map((m) =>
                (order[m.id] || 0) > 0 ? (
                  <p key={m.id} className="liman-hint">
                    {m.label}: {order[m.id]} adet
                  </p>
                ) : null
              )}
              <p className="liman-hint">
                {daysLeft === 0
                  ? 'Gemi bugün şehirde — siparişlerin envanterine eklendi.'
                  : `Gemi şehre dönmesine ${daysLeft} gün kaldı, o zaman teslim edilecek.`}
              </p>
            </>
          );
        })()}
      </div>
    </div>
  );
}
