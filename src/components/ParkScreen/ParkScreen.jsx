import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useInventory } from '../../hooks/useInventory';
import { sellContrabandAtPark } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import './ParkScreen.css';

const PARK_SELL_PRICE = 5000;

export default function ParkScreen() {
  const { user } = useAuth();
  const { inventory } = useInventory();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Park'ta satış yapmak için giriş yapmalısın." />;
  }

  const contrabandQty = inventory.yasakliMadde || 0;

  const handleSell = async () => {
    const qty = Number(amount);
    if (!qty || qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await sellContrabandAtPark(qty);
      setAmount('');
    } catch (err) {
      setError(err.message || 'Satış başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="park-screen">
      <p className="park-hint">
        Sahip olduğun kaçak mal: <strong>{contrabandQty} adet</strong> · Satış fiyatı{' '}
        {PARK_SELL_PRICE.toLocaleString('tr-TR')} altın/adet
        <InfoIcon text="Park'ta yasaklı madde satışı yüksek kazançlıdır ama her satış şüpheni +5 artırır." />
      </p>
      <div className="park-row">
        <input
          type="number"
          min="1"
          max={contrabandQty}
          placeholder="Adet"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="park-input"
        />
        <button className="park-btn" disabled={busy || !amount} onClick={handleSell}>
          {busy ? '…' : 'Sokakta Sat'}
        </button>
      </div>
      {error && <p className="park-error">{error}</p>}
    </div>
  );
}
