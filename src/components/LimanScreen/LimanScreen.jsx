import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useShipSchedule } from '../../hooks/useShipSchedule';
import { usePendingLimanOrder } from '../../hooks/usePendingLimanOrder';
import { placeLimanOrder, cancelLimanOrder } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './LimanScreen.css';

const LIMAN_MATERIALS = [
  { id: 'tamirMalzemesi', label: 'Tamir Malzemesi', price: 8, emoji: '🔧' },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 80, emoji: '🔫' },
  { id: 'arabaGelistirme', label: 'Araba Geliştirme Malzemesi', price: 400, emoji: '🚗' },
  { id: 'yasakliMadde', label: 'Yasaklı Madde', price: 2000, emoji: '💊' },
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

  const loaded = order.loaded || {};
  const pending = order.pending || {};
  const dayInCycle = schedule?.dayInCycle;
  const daysLeftLoaded = dayInCycle ? (5 - dayInCycle) % 4 : null;
  const daysLeftPending = daysLeftLoaded !== null ? daysLeftLoaded + 4 : null;

  const hasLoaded = LIMAN_MATERIALS.some((m) => (loaded[m.id] || 0) > 0);
  const hasPending = LIMAN_MATERIALS.some((m) => (pending[m.id] || 0) > 0);

  return (
    <div className="liman-screen">
      <div className="liman-section">
        <p className="liman-section-title">Gemi Durumu</p>
        <p className="liman-ship-status">{statusLabel || 'Bilinmiyor'}</p>
      </div>

      <div className="liman-section">
        <p className="liman-section-title">
          Toplu Sipariş
          <InfoIcon text='Gemi yolda ya da mal yüklüyorken ("mal yükleniyor" durumunda) verilen siparişler gemi şehre döndüğünde gelir. Gemi şehirdeyken ya da dönüş yolundayken verilen siparişler bir tur daha gecikir.' />
        </p>
        {LIMAN_MATERIALS.map((m) => {
          const ordered = (loaded[m.id] || 0) + (pending[m.id] || 0);
          const qty = amounts[m.id] || 0;
          return (
            <div key={m.id} className="liman-order-row">
              <div className="liman-order-top">
                <span className="liman-order-emoji">{m.emoji}</span>
                <div className="liman-order-info">
                  <span className="liman-order-label">{m.label}</span>
                  <span className="liman-order-meta">
                    {m.price} altın/adet · Bu tur sipariş verdiğin: {ordered}
                  </span>
                </div>
              </div>
              <QuantityStepper
                value={qty}
                onChange={(v) => setAmount(m.id, v)}
                quickAmounts={[1, 5, 10, 100]}
              />
              <button
                className="liman-btn"
                disabled={busy === m.id || !qty}
                onClick={() => run(m.id, () => placeLimanOrder(m.id, qty))}
              >
                {qty > 0 ? `Sipariş Ver — ${(m.price * qty).toLocaleString('tr-TR')} altın` : 'Sipariş Ver'}
              </button>
            </div>
          );
        })}
      </div>

      {error && <p className="liman-error">{error}</p>}

      <div className="liman-section">
        <p className="liman-section-title">Bekleyen Siparişlerin</p>
        {!hasLoaded && !hasPending && <p className="liman-hint">Bekleyen bir siparişin yok.</p>}

        {hasLoaded && (
          <>
            {LIMAN_MATERIALS.map((m) =>
              (loaded[m.id] || 0) > 0 ? (
                <div key={`loaded-${m.id}`} className="liman-pending-row">
                  <p className="liman-hint">
                    {m.label}: {loaded[m.id]} adet
                  </p>
                  <button
                    className="liman-btn small"
                    disabled={busy === `cancel-${m.id}`}
                    onClick={() => run(`cancel-${m.id}`, () => cancelLimanOrder(m.id))}
                  >
                    İptal Et
                  </button>
                </div>
              ) : null
            )}
            <p className="liman-hint liman-highlight">
              {daysLeftLoaded === 0
                ? 'Gemi bugün şehirde — bu siparişler envanterine eklendi.'
                : `Bu siparişler gemi şehre döndüğünde (${daysLeftLoaded} gün sonra) gelecek.`}
            </p>
          </>
        )}

        {hasPending && (
          <>
            {LIMAN_MATERIALS.map((m) =>
              (pending[m.id] || 0) > 0 ? (
                <div key={`pending-${m.id}`} className="liman-pending-row">
                  <p className="liman-hint">
                    {m.label}: {pending[m.id]} adet (ertelendi)
                  </p>
                  <button
                    className="liman-btn small"
                    disabled={busy === `cancel-${m.id}`}
                    onClick={() => run(`cancel-${m.id}`, () => cancelLimanOrder(m.id))}
                  >
                    İptal Et
                  </button>
                </div>
              ) : null
            )}
            <p className="liman-hint">
              Gemi bu turu kaçırdı — bu siparişler bir sonraki turda gelecek (
              {daysLeftPending} gün sonra).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
