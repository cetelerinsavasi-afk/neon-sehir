import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useInventory } from '../../hooks/useInventory';
import {
  sellMaterial,
  sellSilahMaterial,
  sellContrabandToDepo,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './DepoScreen.css';

const ITEMS = [
  { id: 'yasakliMadde', label: 'Yasaklı Madde', price: 2500, emoji: '💊', sell: (qty) => sellContrabandToDepo(qty) },
  { id: 'vitesUpgrade', label: 'Vites Geliştirme Malzemesi', price: 250, emoji: '⚙️', sell: (qty) => sellMaterial('vitesUpgrade', qty) },
  { id: 'depoUpgrade', label: 'Depo Geliştirme Malzemesi', price: 250, emoji: '📦', sell: (qty) => sellMaterial('depoUpgrade', qty) },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 50, emoji: '🔧', sell: (qty) => sellSilahMaterial(qty) },
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
      setAmounts((prev) => ({ ...prev, [key]: 0 }));
    } catch (err) {
      setError(err.message || 'Satış başarısız.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="depo-screen">
      <p className="depo-hint">💰 Elindeki malzemeyi anında satabilirsin.</p>
      {ITEMS.map((item) => {
        const owned = inventory[item.id] || 0;
        const qty = amounts[item.id] || 0;
        return (
          <div key={item.id} className="depo-item">
            <div className="depo-item-top">
              <span className="depo-item-emoji">{item.emoji}</span>
              <div className="depo-item-info">
                <span className="depo-item-name">{item.label}</span>
                <span className="depo-item-meta">
                  {item.price.toLocaleString('tr-TR')} altın/adet · Elinde: {owned}
                </span>
              </div>
            </div>
            <QuantityStepper
              value={qty}
              onChange={(v) => setAmounts((prev) => ({ ...prev, [item.id]: v }))}
              max={owned}
              quickAmounts={[1, 5]}
            />
            <button
              className="depo-btn"
              disabled={busy === item.id || !qty}
              onClick={() => run(item.id, () => item.sell(qty))}
            >
              {qty > 0 ? `Sat — ${(item.price * qty).toLocaleString('tr-TR')} altın` : 'Sat'}
            </button>
          </div>
        );
      })}
      {error && <p className="depo-error">{error}</p>}
    </div>
  );
}
