import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import { useInvestmentHistory } from '../../hooks/useInvestmentHistory';
import {
  depositToBank,
  withdrawFromBank,
  buyInvestment,
  sellInvestment,
  sellAllInvestment,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import PriceChart from '../PriceChart/PriceChart';
import VehicleLoanSection from './VehicleLoanSection';
import './BankScreen.css';

function formatUnits(n) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 6 });
}

function ChangeBadge({ pct }) {
  if (pct === undefined || pct === null) return null;
  const positive = pct >= 0;
  return (
    <span className={`bank-change-badge ${positive ? 'up' : 'down'}`}>
      {positive ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

// Al/Sat butonlu, tıklanınca altta ilgili işlemin girdi paneli açılan
// aksiyon bileşeni — eskiden iki kutu alt alta duruyordu, artık tek
// butona basınca ihtiyacın olan panel açılıyor.
function TradeToggle({ buyLabel, sellLabel, onBuy, onSell, unitPrice, busy }) {
  const [mode, setMode] = useState(null); // 'buy' | 'sell' | null
  const [value, setValue] = useState('');
  const amount = Math.floor(Number(value));
  const preview = unitPrice && amount > 0 ? amount / unitPrice : null;

  const openMode = (m) => {
    setMode(mode === m ? null : m);
    setValue('');
  };

  const handleSubmit = async () => {
    if (!amount || amount <= 0) return;
    if (mode === 'buy') await onBuy(amount);
    else await onSell(amount);
    setValue('');
    setMode(null);
  };

  return (
    <div className="bank-trade">
      <div className="bank-trade-buttons">
        <button
          className={`bank-trade-btn${mode === 'buy' ? ' active' : ''}`}
          onClick={() => openMode('buy')}
        >
          {buyLabel}
        </button>
        <button
          className={`bank-trade-btn${mode === 'sell' ? ' active' : ''}`}
          onClick={() => openMode('sell')}
        >
          {sellLabel}
        </button>
      </div>
      {mode && (
        <div className="bank-trade-panel">
          <input
            type="number"
            min="1"
            placeholder="Altın miktarı"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bank-input"
            autoFocus
          />
          {preview !== null && (
            <span className="bank-amount-preview">≈ {formatUnits(preview)} adet</span>
          )}
          <button className="bank-btn primary" disabled={busy || !amount} onClick={handleSubmit}>
            {busy ? '…' : 'Onayla'}
          </button>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'yatirimlar', label: 'Yatırımlar' },
  { id: 'krediler', label: 'Krediler' },
  { id: 'cezalar', label: 'Cezalar' },
];

function InvestmentsTab({ player, prices, busy, error, run }) {
  const gold = player?.gold ?? 0;
  const bankBalance = player?.bankBalance ?? 0;
  const diamondHoldings = player?.diamondHoldings ?? 0;
  const cryptoHoldings = player?.cryptoHoldings ?? 0;
  const { history } = useInvestmentHistory();
  const diamondPoints = history.map((h) => h.diamondPrice).filter((v) => v !== undefined);
  const cryptoPoints = history.map((h) => h.cryptoPrice).filter((v) => v !== undefined);

  return (
    <>
      <div className="bank-section">
        <div className="bank-section-row">
          <span>Cepteki altın</span>
          <strong>{gold.toLocaleString('tr-TR')}</strong>
        </div>
        <div className="bank-section-row">
          <span>Faizdeki Altın</span>
          <strong className="bank-highlight">{bankBalance.toLocaleString('tr-TR')}</strong>
        </div>
        <p className="bank-hint">Faizdeki altının her gün %1 faiz kazandırır.</p>
        <TradeToggle
          buyLabel="Yatır"
          sellLabel="Çek"
          busy={busy === 'deposit' || busy === 'withdraw'}
          onBuy={(amount) => run('deposit', () => depositToBank(amount))}
          onSell={(amount) => run('withdraw', () => withdrawFromBank(amount))}
        />
      </div>

      <div className="bank-section">
        <p className="bank-section-title">
          Elmas <ChangeBadge pct={prices.diamondChangePct} />
        </p>
        <PriceChart points={diamondPoints} color="#19e8ff" />
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
        <TradeToggle
          buyLabel="Al"
          sellLabel="Sat"
          unitPrice={prices.diamondPrice}
          busy={busy === 'buy-diamond' || busy === 'sell-diamond'}
          onBuy={(amount) => run('buy-diamond', () => buyInvestment('diamond', amount))}
          onSell={(amount) => run('sell-diamond', () => sellInvestment('diamond', amount))}
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
        <p className="bank-section-title">
          Kripto <ChangeBadge pct={prices.cryptoChangePct} />
        </p>
        <PriceChart points={cryptoPoints} color="#ff2e8c" />
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
        <TradeToggle
          buyLabel="Al"
          sellLabel="Sat"
          unitPrice={prices.cryptoPrice}
          busy={busy === 'buy-crypto' || busy === 'sell-crypto'}
          onBuy={(amount) => run('buy-crypto', () => buyInvestment('crypto', amount))}
          onSell={(amount) => run('sell-crypto', () => sellInvestment('crypto', amount))}
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
    </>
  );
}

function PenaltiesTab({ player }) {
  const debtToState = player?.debtToState ?? 0;

  return (
    <div className="bank-section">
      <p className="bank-section-title">Devlete Borcun</p>
      <div className="bank-section-row">
        <span>Toplam borç</span>
        <strong className="bank-debt">{debtToState.toLocaleString('tr-TR')}</strong>
      </div>
      {debtToState > 0 ? (
        <p className="bank-hint bank-debt-hint">
          Bu borç, yakalandığın soygunlardan geliyor. Borç bitene kadar kazandığın her paranın
          yarısı otomatik olarak buraya kesiliyor — hiç ödemesen bile zamanla erir.
        </p>
      ) : (
        <p className="bank-hint">Şu an devlete borcun yok.</p>
      )}
    </div>
  );
}

export default function BankScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { prices } = useInvestmentPrices();
  const [tab, setTab] = useState('yatirimlar');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Bankayı kullanmak için giriş yapmalısın." />;
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

  return (
    <div className="bank-screen">
      <div className="bank-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`bank-tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'yatirimlar' && (
        <InvestmentsTab player={player} prices={prices} busy={busy} error={error} run={run} />
      )}
      {tab === 'krediler' && <VehicleLoanSection />}
      {tab === 'cezalar' && <PenaltiesTab player={player} />}
    </div>
  );
}
