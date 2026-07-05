import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useInventory } from '../../hooks/useInventory';
import { buyFromAmazor } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './AmazorScreen.css';

const ITEMS = [
  { id: 'yasakliMadde', label: 'Yasaklı Madde', price: 4000, emoji: '💊' },
  { id: 'vitesUpgrade', label: 'Vites Geliştirme Malzemesi', price: 500, emoji: '⚙️' },
  { id: 'depoUpgrade', label: 'Depo Geliştirme Malzemesi', price: 500, emoji: '🛢️' },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 100, emoji: '🔧' },
];

export default function AmazorScreen() {
  const { user } = useAuth();
  const { inventory } = useInventory();
  const [amounts, setAmounts] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Amazor Market'i kullanmak için giriş yapmalısın." />;
  }

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setAmounts((prev) => ({ ...prev, [key]: 0 }));
    } catch (err) {
      setError(err.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="amazor-screen">
      <p className="amazor-hint">📦 Anında teslimat — sipariş verince malzeme direkt envanterine eklenir.</p>
      {ITEMS.map((item) => {
        const qty = amounts[item.id] || 0;
        return (
          <div key={item.id} className="amazor-item">
            <div className="amazor-item-top">
              <span className="amazor-item-emoji">{item.emoji}</span>
              <div className="amazor-item-info">
                <span className="amazor-item-name">{item.label}</span>
                <span className="amazor-item-meta">
                  {item.price.toLocaleString('tr-TR')} altın/adet · Elinde: {inventory[item.id] || 0}
                </span>
              </div>
            </div>
            <QuantityStepper
              value={qty}
              onChange={(v) => setAmounts((prev) => ({ ...prev, [item.id]: v }))}
              quickAmounts={[1, 5, 10, 100]}
            />
            <button
              className="amazor-btn"
              disabled={busy === item.id || !qty}
              onClick={() => run(item.id, () => buyFromAmazor(item.id, qty))}
            >
              {qty > 0 ? `Satın Al — ${(item.price * qty).toLocaleString('tr-TR')} altın` : 'Satın Al'}
            </button>
          </div>
        );
      })}
      {error && <p className="amazor-error">{error}</p>}
    </div>
  );
}
