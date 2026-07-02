import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useInventory } from '../../hooks/useInventory';
import { buyFromAmazor } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './AmazorScreen.css';

const ITEMS = [
  { id: 'yasakliMadde', label: 'Yasaklı Madde', price: 4000 },
  { id: 'vitesUpgrade', label: 'Vites Geliştirme Malzemesi', price: 500 },
  { id: 'depoUpgrade', label: 'Depo Geliştirme Malzemesi', price: 500 },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 100 },
];

export default function AmazorScreen() {
  const { user } = useAuth();
  const { inventory } = useInventory();
  const [amounts, setAmounts] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Amazor'u kullanmak için giriş yapmalısın." />;
  }

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setAmounts((prev) => ({ ...prev, [key]: '' }));
    } catch (err) {
      setError(err.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="amazor-screen">
      <p className="amazor-hint">Anında teslimat — sipariş verince malzeme direkt envanterine eklenir.</p>
      {ITEMS.map((item) => (
        <div key={item.id} className="amazor-item">
          <div className="amazor-item-info">
            <span className="amazor-item-name">{item.label}</span>
            <span className="amazor-item-meta">
              {item.price.toLocaleString('tr-TR')} altın/adet · Elinde: {inventory[item.id] || 0}
            </span>
          </div>
          <div className="amazor-item-row">
            <input
              type="number"
              min="1"
              placeholder="Adet"
              value={amounts[item.id] || ''}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
              className="amazor-input"
            />
            <button
              className="amazor-btn"
              disabled={busy === item.id || !amounts[item.id]}
              onClick={() => run(item.id, () => buyFromAmazor(item.id, Number(amounts[item.id])))}
            >
              Satın Al
            </button>
          </div>
        </div>
      ))}
      {error && <p className="amazor-error">{error}</p>}
    </div>
  );
}
