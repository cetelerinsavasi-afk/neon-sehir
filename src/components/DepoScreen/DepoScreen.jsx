import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useInventory } from '../../hooks/useInventory';
import {
  sellMaterial,
  sellSilahMaterial,
  sellContrabandToDepo,
  buyFromAmazor,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './DepoScreen.css';

const SELL_ITEMS = [
  { id: 'tamirMalzemesi', label: 'Tamir Malzemesi', price: 8, emoji: '🔧', sell: (qty) => sellMaterial('tamirMalzemesi', qty) },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 50, emoji: '🔫', sell: (qty) => sellSilahMaterial(qty) },
  { id: 'arabaGelistirme', label: 'Araba Geliştirme Malzemesi', price: 250, emoji: '🚗', sell: (qty) => sellMaterial('arabaGelistirme', qty) },
  { id: 'yasakliMadde', label: 'Yasaklı Madde', price: 2500, emoji: '💊', sell: (qty) => sellContrabandToDepo(qty) },
];

// Depo'da alım fiyatları Amazor ile BİREBİR AYNI (kullanıcı revizesi).
const BUY_ITEMS = [
  { id: 'tamirMalzemesi', label: 'Tamir Malzemesi', price: 10, emoji: '🔧' },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Malzemesi', price: 100, emoji: '🔫' },
  { id: 'arabaGelistirme', label: 'Araba Geliştirme Malzemesi', price: 500, emoji: '🚗' },
  { id: 'yasakliMadde', label: 'Yasaklı Madde', price: 2500, emoji: '💊' },
];

export default function DepoScreen() {
  const { user } = useAuth();
  const { inventory } = useInventory();
  const [mode, setMode] = useState('sell');
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
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  const items = mode === 'sell' ? SELL_ITEMS : BUY_ITEMS;

  return (
    <div className="depo-screen">
      <div className="depo-mode-row">
        <button
          className={`depo-mode-btn${mode === 'sell' ? ' active' : ''}`}
          onClick={() => setMode('sell')}
        >
          Sat
        </button>
        <button
          className={`depo-mode-btn${mode === 'buy' ? ' active' : ''}`}
          onClick={() => setMode('buy')}
        >
          Al
        </button>
      </div>
      <p className="depo-hint">
        {mode === 'sell'
          ? '💰 Elindeki malzemeyi anında satabilirsin.'
          : '📦 İstediğin malzemeyi anında satın alabilirsin (Amazor ile aynı fiyat).'}
      </p>
      {items.map((item) => {
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
              max={mode === 'sell' ? owned : undefined}
              quickAmounts={[1, 5, 10, 100]}
            />
            <button
              className="depo-btn"
              disabled={busy === item.id || !qty}
              onClick={() =>
                run(item.id, () => (mode === 'sell' ? item.sell(qty) : buyFromAmazor(item.id, qty)))
              }
            >
              {qty > 0
                ? `${mode === 'sell' ? 'Sat' : 'Satın Al'} — ${(item.price * qty).toLocaleString('tr-TR')} altın`
                : mode === 'sell'
                  ? 'Sat'
                  : 'Satın Al'}
            </button>
          </div>
        );
      })}
      {error && <p className="depo-error">{error}</p>}
    </div>
  );
}
