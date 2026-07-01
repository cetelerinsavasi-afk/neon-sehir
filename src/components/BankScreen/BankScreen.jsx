import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import {
  depositToBank,
  withdrawFromBank,
  buyInvestment,
  sellInvestment,
  sellAllInvestment,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './BankScreen.css';

function formatUnits(n) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 6 });
}

// Altın tutarı bazlı aksiyon: kullanıcı "kaç altınlık" işlem yapmak
// istediğini girer, adet değil. unitPrice verilirse kaç adet karşılığı
// geleceğini canlı önizleme olarak gösterir.
function GoldAmountAction({ label, onSubmit, busy, unitPrice }) {
  const [value, setValue] = useState('');
  const amount = Math.floor(Number(value));
  const preview = unitPrice && amount > 0 ? amount / unitPrice : null;

  const handleSubmit = async () => {
    if (!amount || amount <= 0) return;
    await onSubmit(amount);
    setValue('');
  };

  return (
    <div className="bank-amount-action">
      <div className="bank-amount-input-wrap">
        <input
          type="number"
          min="1"
          placeholder="Altın miktarı"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="bank-input"
        />
        {preview !== null && (
          <span className="bank-amount-preview">≈ {formatUnits(preview)} adet</span>
        )}
      </div>
      <button className="bank-btn" disabled={busy || !amount} onClick={handleSubmit}>
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
        <GoldAmountAction
          label="Yatır"
          busy={busy === 'deposit'}
          onSubmit={(amount) => run('deposit', () => depositToBank(amount))}
        />
        <GoldAmountAction
          label="Çek"
          busy={busy === 'withdraw'}
          onSubmit={(amount) => run('withdraw', () => withdrawFromBank(amount))}
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
          <strong>
            {formatUnits(diamondHoldings)} adet (
            {Math.floor(diamondHoldings * (prices.diamondPrice ?? 0)).toLocaleString('tr-TR')}{' '}
            altın değerinde)
          </strong>
        </div>
        <GoldAmountAction
          label="Al"
          unitPrice={prices.diamondPrice}
          busy={busy === 'buy-diamond'}
          onSubmit={(amount) => run('buy-diamond', () => buyInvestment('diamond', amount))}
        />
        <GoldAmountAction
          label="Sat"
          unitPrice={prices.diamondPrice}
          busy={busy === 'sell-diamond'}
          onSubmit={(amount) => run('sell-diamond', () => sellInvestment('diamond', amount))}
        />
        {diamondHoldings > 0 && (
          <button
            className="bank-sell-all"
            disabled={busy === 'sell-all-diamond'}
            onClick={() => run('sell-all-diamond', () => sellAllInvestment('diamond'))}
          >
            Tüm Elmasları Sat
          </button>
        )}
      </div>

      <div className="bank-section">
        <p className="bank-section-title">Kripto</p>
        <div className="bank-section-row">
          <span>Güncel fiyat</span>
          <strong>{(prices.cryptoPrice ?? 0).toLocaleString('tr-TR')} altın/adet</strong>
        </div>
        <div className="bank-section-row">
          <span>Sahip olduğun</span>
          <strong>
            {formatUnits(cryptoHoldings)} adet (
            {Math.floor(cryptoHoldings * (prices.cryptoPrice ?? 0)).toLocaleString('tr-TR')} altın
            değerinde)
          </strong>
        </div>
        <GoldAmountAction
          label="Al"
          unitPrice={prices.cryptoPrice}
          busy={busy === 'buy-crypto'}
          onSubmit={(amount) => run('buy-crypto', () => buyInvestment('crypto', amount))}
        />
        <GoldAmountAction
          label="Sat"
          unitPrice={prices.cryptoPrice}
          busy={busy === 'sell-crypto'}
          onSubmit={(amount) => run('sell-crypto', () => sellInvestment('crypto', amount))}
        />
        {cryptoHoldings > 0 && (
          <button
            className="bank-sell-all"
            disabled={busy === 'sell-all-crypto'}
            onClick={() => run('sell-all-crypto', () => sellAllInvestment('crypto'))}
          >
            Tüm Kriptoları Sat
          </button>
        )}
      </div>

      {error && <p className="bank-error">{error}</p>}
    </div>
  );
}
