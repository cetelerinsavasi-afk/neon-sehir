import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useInventory } from '../../hooks/useInventory';
import {
  sellMaterial,
  sellSilahMaterial,
  sellContrabandToDepo,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './DepoScreen.css';

const ITEMS = [
  { id: 'yasakliMadde', label: 'Yasaklı Madde', price: 2500, sell: (qty) => sellContrabandToDepo(qty) },
  { id: 'vitesUpgrade', label: 'Vites Geliştirme Malzemesi', price: 250, sell: (qty) => sellMaterial('vitesUpgrade', qty) },
  { id: 'depoUpgrade', label: 'Depo Geliştirme Malzemesi', price: 250, sell: (qty) => sellMaterial('depoUpgrade', qty) },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 50, sell: () => sellSilahMaterial() },
];

export default function DepoScreen() {
  const { user } = useAuth();
  const { inventory } = useInventory();
  const [amounts, setAmounts] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Depo'yu kullanmak için giriş yapmalısın." />;
  }

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setAmounts((prev) => ({ ...prev, [key]: '' }));
    } catch (err) {
      setError(err.message || 'Satış başarısız.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="depo-screen">
      <p className="depo-hint">Elindeki malzemeyi anında satabilirsin.</p>
      {ITEMS.map((item) => {
        const owned = inventory[item.id] || 0;
        const isSilah = item.id === 'silahUpgrade';
        return (
          <div key={item.id} className="depo-item">
            <div className="depo-item-info">
              <span className="depo-item-name">{item.label}</span>
              <span className="depo-item-meta">
                {item.price.toLocaleString('tr-TR')} altın/adet · Elinde: {owned}
              </span>
            </div>
            {isSilah ? (
              <button
                className="depo-btn"
                disabled={busy === item.id || owned < 1}
                onClick={() => run(item.id, () => item.sell())}
              >
                1 Adet Sat
              </button>
            ) : (
              <div className="depo-item-row">
                <input
                  type="number"
                  min="1"
                  max={owned}
                  placeholder="Adet"
                  value={amounts[item.id] || ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  className="depo-input"
                />
                <button
                  className="depo-btn"
                  disabled={busy === item.id || !amounts[item.id] || Number(amounts[item.id]) > owned}
                  onClick={() => run(item.id, () => item.sell(Number(amounts[item.id])))}
                >
                  Sat
                </button>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="depo-error">{error}</p>}
    </div>
  );
}
