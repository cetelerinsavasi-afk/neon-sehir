import { useEffect, useState } from 'react';
import { useFactoryShares } from '../../hooks/useFactoryShares';
import { listFactoryShare, cancelFactoryShareListing } from '../../services/gameActions';
import QuantityStepper from '../QuantityStepper/QuantityStepper';

const SHARE_DAY_OPTIONS = [10, 20];

// istanbulDateKey — bu kod tabanındaki diğer hook'larla (bkz.
// useBeggars.js, usePoliceClaimPool.js) BİREBİR AYNI yerel yardımcı —
// "bugün" ödeme yapıldı mı (lastPayoutDateKey) kontrolü için gerekiyor.
function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// shareFairValue/shareMinPrice/shareMaxPrice — functions/index.js'deki
// sunucu tarafı ikizleriyle (listFactoryShare) BİREBİR AYNI formül. Sunucu
// nihai doğrulamayı zaten yapıyor; burası sadece oyuncuya canlı bir önizleme
// gösteriyor.
function shareFairValue(percent, days, dailyIncome) {
  return (percent / 100) * (dailyIncome || 0) * days;
}
function shareMinPrice(percent, days, dailyIncome) {
  return Math.floor(shareFairValue(percent, days, dailyIncome) / 2);
}
function shareMaxPrice(percent, days, dailyIncome) {
  return Math.round(shareFairValue(percent, days, dailyIncome));
}

// SharePieChart — kütüphane kullanmadan (bu kod tabanında zaten hiç
// charting kütüphanesi yok, bkz. src/components/PriceChart — düz SVG)
// basit bir SVG "donut" grafiği: sahip olunan / listede / satılmış %.
const PIE_SIZE = 120;
const PIE_STROKE = 18;
const PIE_RADIUS = (PIE_SIZE - PIE_STROKE) / 2;
const PIE_CIRC = 2 * Math.PI * PIE_RADIUS;

function SharePieChart({ ownedPercent, listedPercent, soldPercent }) {
  const slices = [
    { label: 'Sende', value: ownedPercent, color: '#19e8ff' },
    { label: 'Listede', value: listedPercent, color: '#ffd23f' },
    { label: 'Satıldı', value: soldPercent, color: '#ff2e8c' },
  ];
  let offset = 0;
  return (
    <div className="factory-share-pie-wrap">
      <svg viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`} className="factory-share-pie">
        <circle
          cx={PIE_SIZE / 2}
          cy={PIE_SIZE / 2}
          r={PIE_RADIUS}
          fill="none"
          stroke="#141824"
          strokeWidth={PIE_STROKE}
        />
        {slices.map((s) => {
          if (s.value <= 0) return null;
          const dash = (s.value / 100) * PIE_CIRC;
          const circle = (
            <circle
              key={s.label}
              cx={PIE_SIZE / 2}
              cy={PIE_SIZE / 2}
              r={PIE_RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth={PIE_STROKE}
              strokeDasharray={`${dash} ${PIE_CIRC - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${PIE_SIZE / 2} ${PIE_SIZE / 2})`}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div className="factory-share-pie-legend">
        {slices.map((s) => (
          <div key={s.label} className="factory-share-pie-legend-row">
            <span className="factory-share-pie-dot" style={{ background: s.color }} />
            <span>
              {s.label}: %{Math.round(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FactoryShareSellModal({ factory, onClose }) {
  const { listed, active, loading } = useFactoryShares(factory.id);
  const dailyIncome = factory.dailyIncome || 0;
  const hasIncomeHistory = Array.isArray(factory.dailyIncomeHistory) && factory.dailyIncomeHistory.length > 0;
  const dailyIncomeAvg10 = factory.dailyIncomeAvg10 || 0;

  const [percent, setPercent] = useState(1);
  const [days, setDays] = useState(10);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(null);

  const todayKey = istanbulDateKey();
  const listedTotal = listed.reduce((sum, s) => sum + (s.percent || 0), 0);
  const activeTotal = active.reduce((sum, s) => sum + (s.percent || 0), 0);
  const ownedPercent = Math.max(0, 100 - listedTotal - activeTotal);

  // Elde kalan yüzde azalınca (başka bir ilan oluşturunca vb.) seçili
  // yüzdeyi otomatik olarak sınıra çeker — aksi halde stepper görsel
  // olarak sınırın üstünde kalıp kafa karıştırabilir.
  useEffect(() => {
    setPercent((p) => Math.min(p, Math.max(0, ownedPercent)));
  }, [ownedPercent]);

  const minPrice = shareMinPrice(percent, days, dailyIncome);
  const maxPrice = shareMaxPrice(percent, days, dailyIncome);
  const numericPrice = Number(price);
  const priceValid = price !== '' && Number.isFinite(numericPrice) && numericPrice >= minPrice && numericPrice <= maxPrice;
  const percentValid = percent >= 1 && percent <= ownedPercent;

  const handleCreate = async () => {
    if (!percentValid || !priceValid) return;
    setBusy(true);
    setError(null);
    try {
      await listFactoryShare(percent, days, numericPrice);
      setPercent(1);
      setPrice('');
    } catch (err) {
      setError(err.message || 'Hisse ilanı oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (shareId) => {
    setCancelBusy(shareId);
    setError(null);
    try {
      await cancelFactoryShareListing(shareId);
    } catch (err) {
      setError(err.message || 'İlan kaldırılamadı.');
    } finally {
      setCancelBusy(null);
    }
  };

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Hisse Sat</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* DÜZELTME (madde 4): "cümleleri sadeleştirelim, işçi maaşları
            düşülmüş diye belirtmeye gerek yok" — uzun parantezli açıklamalar
            kaldırıldı, kısa ve net etiketler kullanılıyor. */}
        <p className="factory-hint">
          Fabrikanın Bugünkü Kârı: <strong>{dailyIncome.toLocaleString('tr-TR')} altın</strong>
        </p>
        <p className="factory-hint">
          Son 10 Günlük Kâr Ortalaması:{' '}
          {hasIncomeHistory ? (
            <strong>{dailyIncomeAvg10.toLocaleString('tr-TR')} altın</strong>
          ) : (
            <strong>Henüz veri yok</strong>
          )}
        </p>
        <p className="factory-hint small">
          Fabrikanın en fazla %100'ü satılabilir. Şu an %{ownedPercent} elinde, %{listedTotal} listede, %
          {activeTotal} satılmış.
        </p>

        <SharePieChart ownedPercent={ownedPercent} listedPercent={listedTotal} soldPercent={activeTotal} />

        <p className="factory-step-label">Yeni Hisse İlanı</p>
        <p className="factory-price-label">
          Yüzde: <strong>%{percent}</strong>
        </p>
        <QuantityStepper value={percent} onChange={setPercent} max={ownedPercent} quickAmounts={[1, 5, 10, 25]} />

        <div className="factory-share-days-toggle">
          {SHARE_DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`factory-btn small${days === d ? ' primary' : ''}`}
              onClick={() => setDays(d)}
            >
              {d} gün
            </button>
          ))}
        </div>

        <div className="factory-share-price-row">
          <input
            className="factory-name-input"
            type="number"
            placeholder="Fiyat (altın)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button type="button" className="factory-btn small" onClick={() => setPrice(String(minPrice))}>
            Min
          </button>
          <button type="button" className="factory-btn small" onClick={() => setPrice(String(maxPrice))}>
            Max
          </button>
        </div>
        <p className="factory-hint small">
          İzin verilen aralık: {minPrice.toLocaleString('tr-TR')} - {maxPrice.toLocaleString('tr-TR')} altın.
        </p>

        {error && <p className="factory-error">{error}</p>}
        <button
          className="factory-btn primary"
          disabled={busy || !percentValid || !priceValid || ownedPercent <= 0}
          onClick={handleCreate}
        >
          {busy ? '…' : 'İlanı Oluştur'}
        </button>

        <p className="factory-step-label">Listede Bekleyen Hisselerin ({listed.length})</p>
        {!loading && listed.length === 0 && <p className="factory-hint">Listede hisse ilanın yok.</p>}
        <div className="factory-share-list">
          {listed.map((s) => (
            <div key={s.id} className="factory-share-row">
              <div className="factory-share-row-info">
                <span className="factory-share-row-title">
                  %{s.percent} · {s.days} gün
                </span>
                <span className="factory-share-row-meta">{(s.price || 0).toLocaleString('tr-TR')} altın</span>
              </div>
              <button
                className="factory-fire-btn"
                disabled={cancelBusy === s.id}
                onClick={() => handleCancel(s.id)}
              >
                {cancelBusy === s.id ? '…' : 'Satıştan Kaldır'}
              </button>
            </div>
          ))}
        </div>

        <p className="factory-step-label">Satılmış (Aktif Ödeyen) Hisseler ({active.length})</p>
        {!loading && active.length === 0 && <p className="factory-hint">Henüz satılmış bir hissen yok.</p>}
        <div className="factory-share-list">
          {active.map((s) => {
            // DÜZELTME (madde 4): "yatırımcılar hisseyi kaç altına aldı, şu
            // ana kadar kaç altın kazandı, bugün kaç altın kazandı gibi
            // detayları da ekleyelim" — bu alanlar artık dailyReset'in
            // temettü bloğunda yazılıyor (bkz. functions/index.js
            // totalPaidOut/lastPayoutAmount/lastPayoutDateKey).
            const earnedToday = s.lastPayoutDateKey === todayKey ? s.lastPayoutAmount || 0 : 0;
            return (
              <div key={s.id} className="factory-share-buy-card">
                <div className="factory-share-row-info">
                  <span className="factory-share-row-title">
                    %{s.percent} · {s.buyerName || 'Alıcı'}
                  </span>
                  <span className="factory-share-row-meta">
                    {s.remainingDays ?? 0}/{s.totalDays ?? s.days} gün kaldı
                  </span>
                </div>
                <p className="factory-hint small">
                  Hisseyi {(s.price || 0).toLocaleString('tr-TR')} altına aldı.
                </p>
                <p className="factory-hint small">
                  Bugün kazandığı: <strong>{earnedToday.toLocaleString('tr-TR')} altın</strong> · Şimdiye kadar
                  kazandığı: <strong>{(s.totalPaidOut || 0).toLocaleString('tr-TR')} altın</strong>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
