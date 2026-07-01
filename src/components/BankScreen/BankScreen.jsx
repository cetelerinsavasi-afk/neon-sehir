import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import {
  depositToBank,
  withdrawFromBank,
  buyInvestment,
  sellInvestment,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './BankScreen.css';

function AmountAction({ label, max, onSubmit, busy, disabled }) {
  const [value, setValue] = useState('');

  const handleSubmit = async () => {
    const amount = Math.floor(Number(value));
    if (!amount || amount <= 0) return;
    await onSubmit(amount);
    setValue('');
  };

  return (
    <div className="bank-amount-action">
      <input
        type="number"
        min="1"
        max={max}
        placeholder="Miktar"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="bank-input"
      />
      <button className="bank-btn" disabled={busy || disabled || !value} onClick={handleSubmit}>
        {busy ? '…' : label}
      </button>
    </div>
  );
}

export default function BankScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { prices } = useInvestmentPrices();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Bankayı kullanmak için giriş yapmalısın." />;
  }

  const gold = player?.gold ?? 0;
  const bankBalance = player?.bankBalance ?? 0;
  const diamondHoldings = player?.diamondHoldings ?? 0;
  const cryptoHoldings = player?.cryptoHoldings ?? 0;

  const run = async (key, fn, amount) => {
    setBusy(key);
    setError(null);
    try {
      await fn(amount);
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bank-screen">
      <div className="bank-section">
        <div className="bank-section-row">
          <span>Cepteki altın</span>
          <strong>{gold.toLocaleString('tr-TR')}</strong>
        </div>
        <div className="bank-section-row">
          <span>Banka bakiyesi</span>
          <strong className="bank-highlight">{bankBalance.toLocaleString('tr-TR')}</strong>
        </div>
        <p className="bank-hint">Banka bakiyesi her gün %1 faiz kazanır.</p>
        <AmountAction
          label="Yatır"
          max={gold}
          busy={busy === 'deposit'}
          onSubmit={(amount) => run('deposit', depositToBank, amount)}
        />
        <AmountAction
          label="Çek"
          max={bankBalance}
          busy={busy === 'withdraw'}
          onSubmit={(amount) => run('withdraw', withdrawFromBank, amount)}
        />
      </div>

      <div className="bank-section">
        <p className="bank-section-title">Elmas</p>
        <div className="bank-section-row">
          <span>Güncel fiyat</span>
          <strong>{(prices.diamondPrice ?? 0).toLocaleString('tr-TR')} altın/adet</strong>
        </div>
        <div className="bank-section-row">
          <span>Sahip olduğun</span>
          <strong>{diamondHoldings.toLocaleString('tr-TR')} adet</strong>
        </div>
        <AmountAction
          label="Al"
          busy={busy === 'buy-diamond'}
          onSubmit={(qty) => run('buy-diamond', (q) => buyInvestment('diamond', q), qty)}
        />
        <AmountAction
          label="Sat"
          max={diamondHoldings}
          busy={busy === 'sell-diamond'}
          onSubmit={(qty) => run('sell-diamond', (q) => sellInvestment('diamond', q), qty)}
        />
      </div>

      <div className="bank-section">
        <p className="bank-section-title">Kripto</p>
        <div className="bank-section-row">
          <span>Güncel fiyat</span>
          <strong>{(prices.cryptoPrice ?? 0).toLocaleString('tr-TR')} altın/adet</strong>
        </div>
        <div className="bank-section-row">
          <span>Sahip olduğun</span>
          <strong>{cryptoHoldings.toLocaleString('tr-TR')} adet</strong>
        </div>
        <AmountAction
          label="Al"
          busy={busy === 'buy-crypto'}
          onSubmit={(qty) => run('buy-crypto', (q) => buyInvestment('crypto', q), qty)}
        />
        <AmountAction
          label="Sat"
          max={cryptoHoldings}
          busy={busy === 'sell-crypto'}
          onSubmit={(qty) => run('sell-crypto', (q) => sellInvestment('crypto', q), qty)}
        />
      </div>

      {error && <p className="bank-error">{error}</p>}
    </div>
  );
}
