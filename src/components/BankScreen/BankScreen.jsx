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
  repayStateDebt,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import PriceChart from '../PriceChart/PriceChart';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
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

// PnlBadge — kullanıcı revizesi: "faize/yatırımlara koyduğumuz paranın
// bize ne kadar kâr/zarar ettirdiğini anlık görelim". currentValue ve
// costBasis'ten (anaparadan) hesaplanan kâr/zarar; costBasis 0 ise (hiç
// yatırım yok / tamamen çekilmiş) hiçbir şey göstermez.
function PnlBadge({ currentValue, costBasis }) {
  if (!costBasis || costBasis <= 0) return null;
  const diff = Math.round(currentValue - costBasis);
  const pct = costBasis > 0 ? (diff / costBasis) * 100 : 0;
  const positive = diff >= 0;
  return (
    <span className={`bank-pnl-badge ${positive ? 'up' : 'down'}`}>
      {positive ? '▲' : '▼'} {positive ? '+' : ''}
      {diff.toLocaleString('tr-TR')} altın ({positive ? '+' : ''}
      {pct.toFixed(1)}%)
    </span>
  );
}

// Al/Sat butonlu, tıklanınca altta ilgili işlemin girdi paneli açılan
// aksiyon bileşeni. Panel boş bir kutu yerine buton bazlı bir miktar
// seçiciyle (QuantityStepper) açılır. Oyuncular "Onayla" butonunu fark
// etmeyip tekrar Al/Sat'a basmayı daha mantıklı bulduğu için: panel zaten
// açıkken AYNI butona tekrar basmak artık paneli KAPATMIYOR, bir miktar
// girilmişse doğrudan İŞLEMİ ONAYLIYOR.
const DEFAULT_QUICK_AMOUNTS = [10, 100, 1000, 10000];
// Elmas/Hisse/Kripto Al-Sat panellerinde büyük miktarları tek tıkla eklemek için.
const INVESTMENT_QUICK_AMOUNTS = [
  10,
  100,
  1000,
  10000,
  { value: 100000, label: '100.000' },
  { value: 1000000, label: '1M' },
];

function TradeToggle({
  buyLabel,
  sellLabel,
  onBuy,
  onSell,
  unitPrice,
  busy,
  maxBuy,
  maxSell,
  quickAmounts = DEFAULT_QUICK_AMOUNTS,
  // sellCommissionRate — YENİ İSTEK (kripto satış komisyonu): sadece
  // kripto satışında %1 (0.01) — oyuncu satmayı onaylamadan ÖNCE
  // komisyon miktarını ve eline net geçecek tutarı görmeli (bkz. madde:
  // "Oyuncu satış işlemini onaylamadan önce ... ekranda açıkça
  // gösterilecek"). Diğer tüm Al/Sat panelleri (banka faizi, elmas, hisse
  // senedi) bu prop'u hiç geçmez, davranışları DEĞİŞMEDİ.
  sellCommissionRate = 0,
}) {
  const [mode, setMode] = useState(null); // 'buy' | 'sell' | null
  const [amount, setAmount] = useState(0);
  const preview = unitPrice && amount > 0 ? amount / unitPrice : null;
  const commissionPreview =
    mode === 'sell' && sellCommissionRate > 0 && amount > 0
      ? { commission: Math.round(amount * sellCommissionRate), net: amount - Math.round(amount * sellCommissionRate) }
      : null;

  const handleSubmit = async (m) => {
    if (!amount || amount <= 0) return;
    if (m === 'buy') await onBuy(amount);
    else await onSell(amount);
    setAmount(0);
    setMode(null);
  };

  const handleClick = (m) => {
    if (mode === m) {
      // Aynı butona ikinci kez basıldı — bir miktar seçilmişse onayla.
      if (amount > 0) handleSubmit(m);
      return;
    }
    setMode(m);
    setAmount(0);
  };

  return (
    <div className="bank-trade">
      <div className="bank-trade-buttons">
        <button
          className={`bank-trade-btn${mode === 'buy' ? ' active' : ''}`}
          onClick={() => handleClick('buy')}
        >
          {buyLabel}
        </button>
        <button
          className={`bank-trade-btn${mode === 'sell' ? ' active' : ''}`}
          onClick={() => handleClick('sell')}
        >
          {sellLabel}
        </button>
      </div>
      {mode && (
        <div className="bank-trade-panel">
          <QuantityStepper
            value={amount}
            onChange={setAmount}
            max={mode === 'buy' ? maxBuy : maxSell}
            quickAmounts={quickAmounts}
          />
          {preview !== null && (
            <span className="bank-amount-preview">≈ {formatUnits(preview)} adet</span>
          )}
          {commissionPreview && (
            <span className="bank-amount-preview bank-commission-preview">
              %{Math.round(sellCommissionRate * 100)} komisyon: {commissionPreview.commission.toLocaleString('tr-TR')} altın ·
              Eline geçecek: <strong>{commissionPreview.net.toLocaleString('tr-TR')} altın</strong>
            </span>
          )}
          <button
            className="bank-btn primary"
            disabled={busy || !amount}
            onClick={() => handleSubmit(mode)}
          >
            {busy ? '…' : `Onayla — ${amount.toLocaleString('tr-TR')} altın`}
          </button>
        </div>
      )}
    </div>
  );
}

// SellAllCryptoButton — YENİ İSTEK (madde 4): "tüm kriptoları sat
// butonunda da yüzde 1lik kesinti ücreti miktarı yazsın, çünkü o butona
// bastığımız an satılıyor, oyuncu kesintiyi farketmeyebilir." Bu buton
// (diğer varlıkların "Tümünü Sat" butonlarının aksine, bkz. yukarısı)
// artık TEK tıkla anında satmıyor — önce komisyon dahil net tutarı
// gösteren bir onay adımına geçiyor, satış sadece İKİNCİ tıkla olur.
const SELL_COMMISSION_RATE = 0.01;
function SellAllCryptoButton({ cryptoValue, busy, onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  const commission = Math.round(cryptoValue * SELL_COMMISSION_RATE);
  const net = cryptoValue - commission;

  if (!confirming) {
    return (
      <button className="bank-sell-all" disabled={busy} onClick={() => setConfirming(true)}>
        Tüm Kriptoları Sat
      </button>
    );
  }

  return (
    <div className="bank-sell-all-confirm">
      <p className="bank-hint small">
        Satılacak: {cryptoValue.toLocaleString('tr-TR')} altın · %1 komisyon:{' '}
        {commission.toLocaleString('tr-TR')} altın · Eline geçecek:{' '}
        <strong>{net.toLocaleString('tr-TR')} altın</strong>
      </p>
      <div className="bank-sell-all-confirm-row">
        <button className="bank-btn" disabled={busy} onClick={() => setConfirming(false)}>
          Vazgeç
        </button>
        <button
          className="bank-btn primary"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          {busy ? '…' : 'Onayla — Sat'}
        </button>
      </div>
    </div>
  );
}

function InvestmentsTab({ player, prices, busy, error, run }) {
  const bankBalance = player?.bankBalance ?? 0;
  const bankCostBasis = player?.bankCostBasis ?? 0;
  const diamondHoldings = player?.diamondHoldings ?? 0;
  const stockHoldings = player?.stockHoldings ?? 0;
  const cryptoHoldings = player?.cryptoHoldings ?? 0;
  const diamondCostBasis = player?.diamondCostBasis ?? 0;
  const stockCostBasis = player?.stockCostBasis ?? 0;
  const cryptoCostBasis = player?.cryptoCostBasis ?? 0;
  const { history } = useInvestmentHistory();
  const diamondPoints = history.map((h) => h.diamondPrice).filter((v) => v !== undefined);
  const stockPoints = history.map((h) => h.stockPrice).filter((v) => v !== undefined);
  const cryptoPoints = history.map((h) => h.cryptoPrice).filter((v) => v !== undefined);
  const diamondValue = Math.floor(diamondHoldings * (prices.diamondPrice ?? 0));
  const stockValue = Math.floor(stockHoldings * (prices.stockPrice ?? 0));
  const cryptoValue = Math.floor(cryptoHoldings * (prices.cryptoPrice ?? 0));
  const totalInvestments = bankBalance + diamondValue + stockValue + cryptoValue;

  return (
    <>
      <div className="bank-total-card">
        <span className="bank-total-label">Tüm Yatırımların</span>
        <span className="bank-total-value">{totalInvestments.toLocaleString('tr-TR')} altın</span>
        <span className="bank-total-breakdown">
          Faizdeki: {bankBalance.toLocaleString('tr-TR')} · Elmas: {diamondValue.toLocaleString('tr-TR')} · Hisse:{' '}
          {stockValue.toLocaleString('tr-TR')} · Kripto: {cryptoValue.toLocaleString('tr-TR')}
        </span>
      </div>

      <div className="bank-section">
        <div className="bank-section-row">
          <span>Faizdeki Altın</span>
          <strong className="bank-highlight">{bankBalance.toLocaleString('tr-TR')}</strong>
        </div>
        <p className="bank-hint">Faizdeki altının her gün %1 faiz kazandırır.</p>
        <PnlBadge currentValue={bankBalance} costBasis={bankCostBasis} />
        <TradeToggle
          buyLabel="Yatır"
          sellLabel="Çek"
          busy={busy === 'deposit' || busy === 'withdraw'}
          maxBuy={player?.gold ?? 0}
          maxSell={bankBalance}
          onBuy={(amount) => run('deposit', () => depositToBank(amount))}
          onSell={(amount) => run('withdraw', () => withdrawFromBank(amount))}
          quickAmounts={INVESTMENT_QUICK_AMOUNTS}
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
        <PnlBadge currentValue={diamondValue} costBasis={diamondCostBasis} />
        <TradeToggle
          buyLabel="Al"
          sellLabel="Sat"
          unitPrice={prices.diamondPrice}
          busy={busy === 'buy-diamond' || busy === 'sell-diamond'}
          maxBuy={player?.gold ?? 0}
          maxSell={diamondValue}
          onBuy={(amount) => run('buy-diamond', () => buyInvestment('diamond', amount))}
          onSell={(amount) => run('sell-diamond', () => sellInvestment('diamond', amount))}
          quickAmounts={INVESTMENT_QUICK_AMOUNTS}
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
          Hisse Senedi <ChangeBadge pct={prices.stockChangePct} />
        </p>
        <PriceChart points={stockPoints} color="#ffd23f" />
        <div className="bank-section-row">
          <span>Güncel fiyat</span>
          <strong>{(prices.stockPrice ?? 0).toLocaleString('tr-TR')} altın/adet</strong>
        </div>
        <div className="bank-section-row">
          <span>Sahip olduğun</span>
          <strong>
            {formatUnits(stockHoldings)} adet (
            {Math.floor(stockHoldings * (prices.stockPrice ?? 0)).toLocaleString('tr-TR')} altın
            değerinde)
          </strong>
        </div>
        <PnlBadge currentValue={stockValue} costBasis={stockCostBasis} />
        <TradeToggle
          buyLabel="Al"
          sellLabel="Sat"
          unitPrice={prices.stockPrice}
          busy={busy === 'buy-stock' || busy === 'sell-stock'}
          maxBuy={player?.gold ?? 0}
          maxSell={stockValue}
          onBuy={(amount) => run('buy-stock', () => buyInvestment('stock', amount))}
          onSell={(amount) => run('sell-stock', () => sellInvestment('stock', amount))}
          quickAmounts={INVESTMENT_QUICK_AMOUNTS}
        />
        {stockHoldings > 0 && (
          <button
            className="bank-sell-all"
            disabled={busy === 'sell-all-stock'}
            onClick={() => run('sell-all-stock', () => sellAllInvestment('stock'))}
          >
            Tüm Hisseleri Sat
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
        <PnlBadge currentValue={cryptoValue} costBasis={cryptoCostBasis} />
        <TradeToggle
          buyLabel="Al"
          sellLabel="Sat"
          unitPrice={prices.cryptoPrice}
          busy={busy === 'buy-crypto' || busy === 'sell-crypto'}
          maxBuy={player?.gold ?? 0}
          maxSell={cryptoValue}
          onBuy={(amount) => run('buy-crypto', () => buyInvestment('crypto', amount))}
          onSell={(amount) => run('sell-crypto', () => sellInvestment('crypto', amount))}
          quickAmounts={INVESTMENT_QUICK_AMOUNTS}
          sellCommissionRate={0.01}
        />
        {cryptoHoldings > 0 && (
          <SellAllCryptoButton
            cryptoValue={cryptoValue}
            busy={busy === 'sell-all-crypto'}
            onConfirm={() => run('sell-all-crypto', () => sellAllInvestment('crypto'))}
          />
        )}
      </div>
      {error && <p className="bank-error">{error}</p>}
    </>
  );
}

function PenaltiesTab({ player, busy, error, run }) {
  const debtToState = player?.debtToState ?? 0;
  const gold = player?.gold ?? 0;
  const [amount, setAmount] = useState(0);
  const maxPayable = Math.min(gold, debtToState);

  return (
    <div className="bank-section">
      <p className="bank-section-title">Devlete Borcun</p>
      <div className="bank-section-row">
        <span>Toplam borç</span>
        <strong className="bank-debt">{debtToState.toLocaleString('tr-TR')}</strong>
      </div>
      {debtToState > 0 ? (
        <>
          <p className="bank-hint bank-debt-hint">
            Bu borç, yakalandığın soygunlardan geliyor. Ödemesen bile kazandığın her paranın
            yarısı otomatik olarak buraya kesiliyor — ama istersen cebindeki altınla da elle
            kapatabilirsin.
          </p>
          <QuantityStepper
            value={amount}
            onChange={setAmount}
            max={maxPayable}
            quickAmounts={[100, 500, 1000]}
          />
          <button
            className="bank-btn primary"
            disabled={busy === 'repay-debt' || !amount}
            onClick={() => run('repay-debt', () => repayStateDebt(amount))}
          >
            {amount > 0 ? `Öde — ${amount.toLocaleString('tr-TR')} altın` : 'Öde'}
          </button>
          {error && <p className="bank-error">{error}</p>}
        </>
      ) : (
        <p className="bank-hint">Şu an devlete borcun yok.</p>
      )}
    </div>
  );
}

const CARDS = [
  { id: 'yatirimlar', label: 'Yatırımlar', emoji: '📈', desc: 'Elmas ve kripto al-sat, faize para yatır.' },
  { id: 'krediler', label: 'Krediler', emoji: '🚗', desc: 'Aracına kredi çek ya da borcunu öde.' },
  { id: 'cezalar', label: 'Cezalar', emoji: '⚖️', desc: 'Devlete olan borcunu gör ve öde.' },
];

export default function BankScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { prices } = useInvestmentPrices();
  const [tab, setTab] = useState(null);
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

  if (!tab) {
    return (
      <div className="bank-picker">
        {CARDS.map((c) => (
          <button key={c.id} className="bank-picker-card" onClick={() => setTab(c.id)}>
            <span className="bank-picker-emoji">{c.emoji}</span>
            <span className="bank-picker-title">{c.label}</span>
            <span className="bank-picker-desc">{c.desc}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="bank-screen">
      <button className="bank-back-btn" onClick={() => setTab(null)}>
        ← Geri
      </button>

      {tab === 'yatirimlar' && (
        <InvestmentsTab player={player} prices={prices} busy={busy} error={error} run={run} />
      )}
      {tab === 'krediler' && <VehicleLoanSection />}
      {tab === 'cezalar' && <PenaltiesTab player={player} busy={busy} error={error} run={run} />}
    </div>
  );
}
