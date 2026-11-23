import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
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
import { useBackClose } from '../../lib/backStack';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import CreditSection from './CreditSection';
import { useBorsaMarket } from '../../hooks/useBorsaMarket';
import { retryImport } from '../../lib/lazyRetry';
import { BORSA_CO_IDS, holdState, coState, sellAllValue, pendingAll } from '../../../functions/borsa.js';
import './BankScreen.css';

const BorsaApp = lazy(retryImport(() => import('../Phone/borsa/BorsaApp'))); // v185: Neon Borsa bankada

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

// v176 — Parara yeni tasarım: büyük, degrade dolgulu fiyat grafiği (gerçek piksel boyutunda)
function BankChart({ points, color }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 96;
  const gid = `bank-g-${color.replace('#', '')}`;
  let svg = null;
  if (points && points.length >= 2 && w > 0) {
    const mx = Math.max(...points);
    const mn = Math.min(...points);
    const r = mx - mn || 1;
    const xy = points.map((v, i) => [4 + (i / (points.length - 1)) * (w - 8), H - 6 - ((v - mn) / r) * (H - 14)]);
    const d = `M${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
    const last = xy[xy.length - 1];
    svg = (
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${w - 4},${H} L4,${H} Z`} fill={`url(#${gid})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="4" fill={color} stroke="#0b1220" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <div className="bank-chart" ref={ref} style={{ height: H }}>
      {svg || <p className="bank-hint">Henüz yeterli veri yok.</p>}
    </div>
  );
}

const ICON_P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };
function BankIcon({ id }) {
  const c = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true, ...ICON_P };
  if (id === 'faiz')
    return (
      <svg {...c}>
        <rect x="3.5" y="5" width="17" height="14" rx="3" />
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 8.8v-1M12 16.2v-1M15.2 12h1M7.8 12h1" />
      </svg>
    );
  if (id === 'elmas')
    return (
      <svg {...c}>
        <path d="M7 4h10l4 5-9 11L3 9z" />
        <path d="M3 9h18M9.5 4L8 9l4 11 4-11-1.5-5" />
      </svg>
    );
  if (id === 'hisse')
    return (
      <svg {...c}>
        <path d="M4 20V10M10 20V5M16 20v-7M21 20H3" />
      </svg>
    );
  if (id === 'kripto')
    return (
      <svg {...c}>
        <path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" />
        <path d="M9.5 8.5h3.6a1.8 1.8 0 010 3.5H9.5h4a1.8 1.8 0 010 3.5H9.5zM11 7v1.5M11 15.5V17" />
      </svg>
    );
  if (id === 'yatirimlar')
    return (
      <svg {...c}>
        <path d="M3.5 17.5l5.2-5.6 3.8 3.3 7.8-8.4" />
        <path d="M15.2 6.8h5.1v5.1" />
      </svg>
    );
  if (id === 'borsa')
    return (
      <svg {...c}>
        <path d="M7 4v3M7 15v5M17 3v4M17 13v5" />
        <rect x="4.6" y="7" width="4.8" height="8" rx="1.2" />
        <rect x="14.6" y="7" width="4.8" height="6" rx="1.2" />
      </svg>
    );
  if (id === 'krediler')
    return (
      <svg {...c}>
        <rect x="2.8" y="5.5" width="18.4" height="13" rx="2.5" />
        <path d="M2.8 10h18.4M6.5 15h4" />
      </svg>
    );
  if (id === 'cezalar')
    return (
      <svg {...c}>
        <path d="M12 3v18M7 21h10M5 7h14" />
        <path d="M5 7l-2.5 6a2.5 2.5 0 005 0zM19 7l-2.5 6a2.5 2.5 0 005 0z" />
      </svg>
    );
  return null;
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
  // sellCommissionRate — kullanıcı revizesi: "kriptoda olduğu gibi
  // hisse senedi ve elmas satarken de %1lik bir işlem ücreti olsun,
  // sistem kripto ile birebir aynı olsun istiyorum" — elmas/hisse
  // senedi/kripto satışında %1 (0.01), faiz/banka gibi komisyonsuz
  // panellerde bu prop hiç geçilmiyor (0 kalır).
  sellCommissionRate = 0,
}) {
  const [mode, setMode] = useState(null); // 'buy' | 'sell' | null
  const [amount, setAmount] = useState(0);
  // confirmingSell — YENİ İSTEK: "satarken bu kadar komisyon oranı var
  // emin misin diye sorsun, şu an param azalıyor sattıkça ama farkında
  // değilim." Komisyonlu satışlarda (sellCommissionRate > 0) "Onayla"
  // artık DOĞRUDAN satmıyor, önce komisyon tutarını ve eline net
  // geçecek miktarı açıkça gösteren bir "emin misin?" adımına geçiyor —
  // "Tümünü Sat" butonundaki (SellAllCryptoButton) desenle birebir aynı.
  // Komisyonsuz panellerde (banka faizi) davranış DEĞİŞMEDİ.
  const [confirmingSell, setConfirmingSell] = useState(false);
  const preview = unitPrice && amount > 0 ? amount / unitPrice : null;
  const commissionPreview =
    mode === 'sell' && sellCommissionRate > 0 && amount > 0
      ? { commission: Math.round(amount * sellCommissionRate), net: amount - Math.round(amount * sellCommissionRate) }
      : null;

  const executeSell = async () => {
    if (!amount || amount <= 0) return;
    await onSell(amount);
    setAmount(0);
    setMode(null);
    setConfirmingSell(false);
  };

  const handleSubmit = async (m) => {
    if (!amount || amount <= 0) return;
    if (m === 'buy') {
      await onBuy(amount);
      setAmount(0);
      setMode(null);
      return;
    }
    // Satış: komisyon varsa önce onay adımına geç, komisyon yoksa
    // (ör. banka faizi) eskisi gibi doğrudan gerçekleştir.
    if (sellCommissionRate > 0) {
      setConfirmingSell(true);
      return;
    }
    await executeSell();
  };

  const handleClick = (m) => {
    if (mode === m) {
      // Aynı butona ikinci kez basıldı — bir miktar seçilmişse onayla.
      if (amount > 0) handleSubmit(m);
      return;
    }
    setMode(m);
    setAmount(0);
    setConfirmingSell(false);
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
      {mode && !confirmingSell && (
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
            {busy
              ? '…'
              : mode === 'sell' && sellCommissionRate > 0
                ? `Sat — ${amount.toLocaleString('tr-TR')} altın`
                : `Onayla — ${amount.toLocaleString('tr-TR')} altın`}
          </button>
        </div>
      )}
      {mode === 'sell' && confirmingSell && commissionPreview && (
        <div className="bank-trade-panel bank-sell-confirm">
          <p className="bank-hint small">
            {amount.toLocaleString('tr-TR')} altınlık satış · %{Math.round(sellCommissionRate * 100)} komisyon:{' '}
            <strong>{commissionPreview.commission.toLocaleString('tr-TR')} altın</strong> · Eline geçecek:{' '}
            <strong>{commissionPreview.net.toLocaleString('tr-TR')} altın</strong>
          </p>
          <p className="bank-hint small">Bu kadar komisyon kesilecek, emin misin?</p>
          <div className="bank-sell-all-confirm-row">
            <button className="bank-btn" disabled={busy} onClick={() => setConfirmingSell(false)}>
              Vazgeç
            </button>
            <button className="bank-btn primary" disabled={busy} onClick={executeSell}>
              {busy ? '…' : 'Evet, Sat'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// SellAllButton — YENİ İSTEK (madde 4, sonra TÜM "hepsini sat" aksiyonlarına
// genelleştirildi): "tüm kriptoları/elmasları/hisseleri sat butonunda da
// yüzde 1lik kesinti ücreti miktarı yazsın, çünkü o butona bastığımız an
// satılıyor, oyuncu kesintiyi farketmeyebilir." Bu buton TEK tıkla anında
// satmıyor — önce komisyon dahil net tutarı gösteren bir onay adımına
// geçiyor, satış sadece İKİNCİ tıkla (Onayla) olur. Eskiden sadece kripto
// için vardı (SellAllCryptoButton); artık elmas ve hisse senedinin "Tümünü
// Sat" butonları da BİREBİR AYNI deseni kullanıyor.
const SELL_COMMISSION_RATE = 0.01;
function SellAllButton({ label, assetValue, commissionRate = SELL_COMMISSION_RATE, busy, onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  const commission = Math.round(assetValue * commissionRate);
  const net = assetValue - commission;

  if (!confirming) {
    return (
      <button className="bank-sell-all" disabled={busy} onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="bank-sell-all-confirm">
      <p className="bank-hint small">
        Satılacak: {assetValue.toLocaleString('tr-TR')} altın · %{Math.round(commissionRate * 100)} komisyon:{' '}
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

// Rejim eşikleri — functions/index.js hourlyInvestmentUpdate'teki
// DIAMOND_REGIME_THRESHOLD / STOCK_REGIME_THRESHOLD / CRYPTO_REGIME_
// THRESHOLD ile BİREBİR AYNI. "düşme eğiliminde ↓" uyarısı burada,
// GÜNCEL fiyattan doğrudan hesaplanıyor — sunucudaki diamondReversedRegime
// vb. alanlara bağlı kalınmıyor, çünkü o alanlar sadece saatlik
// hourlyInvestmentUpdate çalıştığında yazılıyor (deploy sonrası ilk
// saate kadar eksik/eski kalabilir). Fiyatı zaten anlık okuduğumuz için
// eşiği burada da uygulamak uyarının HER ZAMAN güncel olmasını sağlıyor.
const DIAMOND_REGIME_THRESHOLD = 20000;
const STOCK_REGIME_THRESHOLD = 200000000;
const CRYPTO_REGIME_THRESHOLD = 200000;

function InvestmentsTab({ player, prices, busy, error, run }) {
  const bankBalance = player?.bankBalance ?? 0;
  const diamondHoldings = player?.diamondHoldings ?? 0;
  const stockHoldings = player?.stockHoldings ?? 0;
  const cryptoHoldings = player?.cryptoHoldings ?? 0;
  const diamondCostBasis = player?.diamondCostBasis ?? 0;
  const stockCostBasis = player?.stockCostBasis ?? 0;
  const cryptoCostBasis = player?.cryptoCostBasis ?? 0;
  const diamondReversedRegime = (prices.diamondPrice ?? 0) >= DIAMOND_REGIME_THRESHOLD;
  const stockReversedRegime = (prices.stockPrice ?? 0) >= STOCK_REGIME_THRESHOLD;
  const cryptoReversedRegime = (prices.cryptoPrice ?? 0) >= CRYPTO_REGIME_THRESHOLD;
  const { history } = useInvestmentHistory();
  const diamondPoints = history.map((h) => h.diamondPrice).filter((v) => v !== undefined);
  const stockPoints = history.map((h) => h.stockPrice).filter((v) => v !== undefined);
  const cryptoPoints = history.map((h) => h.cryptoPrice).filter((v) => v !== undefined);
  const diamondValue = Math.floor(diamondHoldings * (prices.diamondPrice ?? 0));
  const stockValue = Math.floor(stockHoldings * (prices.stockPrice ?? 0));
  const cryptoValue = Math.floor(cryptoHoldings * (prices.cryptoPrice ?? 0));
  const totalInvestments = bankBalance + diamondValue + stockValue + cryptoValue;

  const assets = [
    { key: 'diamond', icon: 'elmas', name: 'Elmas', color: '#19e8ff', pct: prices.diamondChangePct, reversed: diamondReversedRegime, points: diamondPoints, price: prices.diamondPrice ?? 0, holdings: diamondHoldings, value: diamondValue, cost: diamondCostBasis, allLabel: 'Tüm Elmasları Sat' },
    { key: 'stock', icon: 'hisse', name: 'Hisse Senedi', color: '#ffd23f', pct: prices.stockChangePct, reversed: stockReversedRegime, points: stockPoints, price: prices.stockPrice ?? 0, holdings: stockHoldings, value: stockValue, cost: stockCostBasis, allLabel: 'Tüm Hisseleri Sat' },
    { key: 'crypto', icon: 'kripto', name: 'Kripto', color: '#ff2e8c', pct: prices.cryptoChangePct, reversed: cryptoReversedRegime, points: cryptoPoints, price: prices.cryptoPrice ?? 0, holdings: cryptoHoldings, value: cryptoValue, cost: cryptoCostBasis, allLabel: 'Tüm Kriptoları Sat' },
  ];
  const parts = [
    { k: 'Faiz', v: bankBalance, c: '#2fd47a' },
    { k: 'Elmas', v: diamondValue, c: '#19e8ff' },
    { k: 'Hisse', v: stockValue, c: '#ffd23f' },
    { k: 'Kripto', v: cryptoValue, c: '#ff2e8c' },
  ];

  return (
    <>
      <div className="bank-total-card">
        <span className="bank-total-label">Tüm yatırımların</span>
        <span className="bank-total-value">{totalInvestments.toLocaleString('tr-TR')}</span>
        <div className="bank-split" aria-hidden="true">
          {parts.map((x) => (totalInvestments > 0 && x.v > 0 ? <i key={x.k} style={{ flexGrow: x.v, background: x.c }} /> : null))}
        </div>
        <div className="bank-split-legend">
          {parts.map((x) => (
            <span key={x.k}>
              <i style={{ background: x.c }} />
              {x.k} <b>{x.v.toLocaleString('tr-TR')}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="bank-section">
        <div className="bank-asset-head">
          <span className="bank-asset-ic" style={{ color: '#2fd47a' }}>
            <BankIcon id="faiz" />
          </span>
          <span className="bank-asset-name">
            Faiz hesabı
            <small>Her gece %1 · en fazla 100.000</small>
          </span>
          <span className="bank-asset-price">
            <b>{bankBalance.toLocaleString('tr-TR')}</b>
            <small>
              günlük +{Math.min(100000, Math.floor(bankBalance * 0.01)).toLocaleString('tr-TR')}
              {Math.floor(bankBalance * 0.01) >= 100000 ? <strong className="bank-max-tag"> MAX</strong> : null}
            </small>
          </span>
        </div>
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

      {assets.map((a) => (
        <div className="bank-section" key={a.key}>
          <div className="bank-asset-head">
            <span className="bank-asset-ic" style={{ color: a.color }}>
              <BankIcon id={a.icon} />
            </span>
            <span className="bank-asset-name">
              {a.name}
              {a.reversed ? <small className="bank-regime-warning">düşme eğiliminde ↓</small> : <small>adet fiyatı</small>}
            </span>
            <span className="bank-asset-price">
              <b>{a.price.toLocaleString('tr-TR')}</b>
              <ChangeBadge pct={a.pct} />
            </span>
          </div>
          <BankChart points={a.points} color={a.color} />
          <div className="bank-hold">
            <span>
              <small>Sahip olduğun</small>
              <b>{formatUnits(a.holdings)} adet</b>
            </span>
            <span>
              <small>Değeri</small>
              <b>{a.value.toLocaleString('tr-TR')}</b>
            </span>
          </div>
          <PnlBadge currentValue={a.value} costBasis={a.cost} />
          <TradeToggle
            buyLabel="Al"
            sellLabel="Sat"
            unitPrice={a.price}
            busy={busy === `buy-${a.key}` || busy === `sell-${a.key}`}
            maxBuy={player?.gold ?? 0}
            maxSell={a.value}
            onBuy={(amount) => run(`buy-${a.key}`, () => buyInvestment(a.key, amount))}
            onSell={(amount) => run(`sell-${a.key}`, () => sellInvestment(a.key, amount))}
            quickAmounts={INVESTMENT_QUICK_AMOUNTS}
            sellCommissionRate={0.01}
          />
          {a.holdings > 0 && <SellAllButton label={a.allLabel} assetValue={a.value} busy={busy === `sell-all-${a.key}`} onConfirm={() => run(`sell-all-${a.key}`, () => sellAllInvestment(a.key))} />}
        </div>
      ))}
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
      <div className="bank-asset-head">
        <span className="bank-asset-ic" style={{ color: debtToState > 0 ? '#ff5a6e' : '#2fd47a' }}>
          <BankIcon id="cezalar" />
        </span>
        <span className="bank-asset-name">
          Devlete borcun
          <small>{debtToState > 0 ? 'Kazancının yarısı borca gider' : 'Borcun yok'}</small>
        </span>
        <span className="bank-asset-price">
          <b className={debtToState > 0 ? 'bank-debt' : ''}>{debtToState.toLocaleString('tr-TR')}</b>
        </span>
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

// v185: Neon Borsa bankanın içinde (ayrı uygulama kaldırıldı)
const CARDS = [
  { id: 'yatirimlar', label: 'Yatırımlar', desc: 'Faiz, elmas, hisse senedi, kripto' },
  { id: 'borsa', label: 'Borsa', desc: 'Mekân ve şirket hisseleri' },
  { id: 'krediler', label: 'Krediler', desc: 'Kredi puanınla kredi çek, öde' },
  { id: 'cezalar', label: 'Cezalar', desc: 'Devlete borcunu gör ve öde' },
];
const TAB_TITLE = { yatirimlar: 'Yatırımlar', borsa: 'Borsa', krediler: 'Krediler', cezalar: 'Cezalar' };
const hasBorsa = (p) => BORSA_CO_IDS.some((id) => { const h = holdState(p, id); return h.u > 0 || h.pq > 0n; }); // v189: birimler

// kart numarası: oyuncuya sabit 4 hane (süs)
const cardNo = (id) => String([...String(id || 'neon')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 10000, 7)).padStart(4, '0');

// v176 — Parara ana sayfa: banka kartı (toplam varlık) + hizmetler
function BankHome({ player, prices, onOpen }) {
  // v185: piyasa belgesi sadece hissesi olan oyuncu için okunur (olmayan için borsa değeri 0)
  const own = hasBorsa(player);
  const { data: market } = useBorsaMarket(own);
  const borsa = useMemo(() => {
    if (!own || !market) return { value: 0, pend: 0 };
    let value = 0;
    for (const id of BORSA_CO_IDS) {
      const u = holdState(player, id).u; // v189: birim (1 hisse = 1.000.000)
      if (u > 0) value += sellAllValue(u, coState(market, id).u);
    }
    return { value, pend: pendingAll(player, market).total };
  }, [own, player, market]);
  const gold = player?.gold ?? 0;
  const bank = player?.bankBalance ?? 0;
  const inv =
    Math.floor((player?.diamondHoldings ?? 0) * (prices.diamondPrice ?? 0)) +
    Math.floor((player?.stockHoldings ?? 0) * (prices.stockPrice ?? 0)) +
    Math.floor((player?.cryptoHoldings ?? 0) * (prices.cryptoPrice ?? 0));
  const debt = player?.debtToState ?? 0;
  const credit = player?.credit || null;
  const name = player?.displayName || 'Neon Şehir';
  return (
    <div className="bank-home">
      <div className="bank-card">
        <div className="bank-card-top">
          <span className="bank-card-brand">Parara</span>
          <span className="bank-card-chip" aria-hidden="true" />
        </div>
        <span className="bank-card-label">Toplam varlık</span>
        <span className="bank-card-total">{(gold + bank + inv + borsa.value).toLocaleString('tr-TR')}</span>
        <div className="bank-card-bottom">
          <span className="bank-card-name">{name}</span>
          <span className="bank-card-no" aria-hidden="true">•••• {cardNo(player?.id)}</span>
        </div>
      </div>
      <div className="bank-quick">
        <span>
          <small>Faiz</small>
          <b>{bank.toLocaleString('tr-TR')}</b>
        </span>
        <span>
          <small>Yatırım</small>
          <b>{inv.toLocaleString('tr-TR')}</b>
        </span>
        <span>
          <small>Borsa</small>
          <b>{borsa.value.toLocaleString('tr-TR')}</b>
        </span>
      </div>
      <p className="bank-h">Hizmetler</p>
      <div className="bank-list">
        {CARDS.map((c) => {
          const tag =
            c.id === 'cezalar' && debt > 0
              ? `${debt.toLocaleString('tr-TR')} borç`
              : c.id === 'krediler' && credit
                ? 'Aktif kredi'
                : c.id === 'borsa' && borsa.pend > 0
                  ? `+${borsa.pend.toLocaleString('tr-TR')}`
                  : null;
          return (
            <button key={c.id} className="bank-row" onClick={() => onOpen(c.id)}>
              <span className={`bank-row-ic ic-${c.id}`}>
                <BankIcon id={c.id} />
              </span>
              <span className="bank-row-mid">
                <b>{c.label}</b>
                <small>{c.desc}</small>
              </span>
              {tag && <span className={`bank-row-tag${c.id === 'cezalar' ? ' bad' : c.id === 'borsa' ? ' up' : ''}`}>{tag}</span>}
              <span className="bank-row-go" aria-hidden="true">
                ›
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BankScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { prices } = useInvestmentPrices();
  const [tab, setTab] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [borsaSel, setBorsaSel] = useState(null); // v185 — { id, name } (Borsa › mekân sayfası)
  // v176: Android geri tuşu önce bölümü kapatır (Parara ana sayfasına döner)
  useBackClose(Boolean(tab), () => {
    setTab(null);
    setBorsaSel(null);
  });
  useBackClose(Boolean(borsaSel), () => setBorsaSel(null));

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

  if (!tab) return <BankHome player={player} prices={prices} onOpen={setTab} />;

  return (
    <div className="bank-screen">
      <button className="bank-back-btn" onClick={() => (borsaSel ? setBorsaSel(null) : setTab(null))}>
        <span aria-hidden="true">‹</span> {tab === 'borsa' && borsaSel ? borsaSel.name : TAB_TITLE[tab]}
      </button>

      {tab === 'yatirimlar' && (
        <InvestmentsTab player={player} prices={prices} busy={busy} error={error} run={run} />
      )}
      {tab === 'borsa' && (
        <Suspense fallback={<p className="bank-loading">Yükleniyor…</p>}>
          <BorsaApp embed selected={borsaSel?.id || null} onSelect={(id, name) => setBorsaSel(id ? { id, name } : null)} />
        </Suspense>
      )}
      {tab === 'krediler' && <CreditSection />}
      {tab === 'cezalar' && <PenaltiesTab player={player} busy={busy} error={error} run={run} />}
    </div>
  );
}
