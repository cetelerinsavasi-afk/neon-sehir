import { useState } from 'react';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import { buyFactoryShare } from '../../services/gameActions';
import FactoryBadge from './FactoryBadge';
import { factoryDisplayName, computeFactoryValue } from './factoryHelpers';

// daysAgoLabel — share.createdAt (Firestore Timestamp) ile şimdiki zaman
// arasındaki farkı "X gün önce" gibi kısa bir metne çevirir.
function daysAgoLabel(createdAt) {
  if (!createdAt?.toDate) return '…';
  const ms = Date.now() - createdAt.toDate().getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Bugün listelendi';
  if (days === 1) return '1 gün önce listelendi';
  return `${days} gün önce listelendi`;
}

// FactoryShareBuyModal — "Fabrikalar" listesinde "📈 Hisseler" butonuna
// basınca açılır (yeni istek: hisse alınabilecek bi alan olsun, hisse ve
// fabrika detayları — günlük gelir, son 10 gün ortalaması, toplam gelir
// tahmini — burada gösteriliyor). `shares` — bu fabrikaya ait, henüz
// satılmamış ('listed') hisse ilanlarının dizisi (bkz. useListedFactoryShares).
export default function FactoryShareBuyModal({ factory, shares, onClose }) {
  const { prices } = useInvestmentPrices();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [bought, setBought] = useState(null);

  const factoryValue = computeFactoryValue(factory.machines, prices.cryptoPrice);
  const currentDailyIncome = factory.dailyIncome || 0;
  const hasIncomeHistory = Array.isArray(factory.dailyIncomeHistory) && factory.dailyIncomeHistory.length > 0;
  const dailyIncomeAvg10 = factory.dailyIncomeAvg10 || 0;

  const handleBuy = async (shareId) => {
    setBusy(shareId);
    setError(null);
    try {
      await buyFactoryShare(factory.id, shareId);
      setBought(shareId);
    } catch (err) {
      setError(err.message || 'Hisse satın alınamadı.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Hisseler</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="factory-name-badge-row">
          <FactoryBadge logo={factory.logo} name={factoryDisplayName(factory)} size={48} />
          <div>
            <p className="factory-owner-title" style={{ margin: 0 }}>
              {factoryDisplayName(factory)}
            </p>
            <p className="factory-hint small" style={{ margin: 0 }}>
              {factory.machineCount ?? (factory.machines || []).length} makine · Değeri:{' '}
              {factoryValue.toLocaleString('tr-TR')} altın
            </p>
          </div>
        </div>

        {/* DÜZELTME (madde 4): cümleler sadeleştirildi — "işçi maaşları
            düşülmüş" gibi teknik ayrıntılar kaldırıldı. */}
        <p className="factory-hint small">
          Fabrikanın Bugünkü Kârı: <strong>{currentDailyIncome.toLocaleString('tr-TR')} altın</strong>
        </p>
        <p className="factory-hint small">
          Son 10 Günlük Kâr Ortalaması:{' '}
          {hasIncomeHistory ? (
            <strong>{dailyIncomeAvg10.toLocaleString('tr-TR')} altın</strong>
          ) : (
            <strong>Henüz veri yok</strong>
          )}
        </p>

        {(!shares || shares.length === 0) && (
          <p className="factory-hint">Bu fabrikanın şu an satışta hissesi yok.</p>
        )}

        <div className="factory-share-list">
          {(shares || []).map((s) => {
            const estimatedTotal = Math.round((s.percent / 100) * (s.dailyIncomeAtListing || 0) * s.days);
            return (
              <div key={s.id} className="factory-share-buy-card">
                <div className="factory-share-row-info">
                  <span className="factory-share-row-title">
                    %{s.percent} hisse · {s.days} gün
                  </span>
                  <span className="factory-share-row-meta">{daysAgoLabel(s.createdAt)}</span>
                </div>
                <p className="factory-hint small">
                  İlan Anındaki Günlük Kâr: <strong>{(s.dailyIncomeAtListing || 0).toLocaleString('tr-TR')} altın</strong>
                </p>
                <p className="factory-hint small">
                  Tahmini Toplam Getiri ({s.days} gün): <strong>{estimatedTotal.toLocaleString('tr-TR')} altın</strong>
                </p>
                <div className="factory-share-buy-price-row">
                  <span className="factory-machine-buy-price">{(s.price || 0).toLocaleString('tr-TR')} altın</span>
                  <button
                    className="factory-btn primary small"
                    disabled={busy === s.id || bought === s.id}
                    onClick={() => handleBuy(s.id)}
                  >
                    {busy === s.id ? '…' : bought === s.id ? 'Alındı ✓' : 'Satın Al'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="factory-error">{error}</p>}
      </div>
    </div>
  );
}
