import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { takeVehicleLoan, repayVehicleLoan } from '../../services/gameActions';
import { vehicleLivePrice, INITIAL_LIFE_DAYS } from '../VehicleCard/VehicleCard';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './VehicleLoanSection.css';

// Kullanıcı revizesi: araç/silah azami ömrü 30 → 20 güne düşürüldüğü için
// 20 günlük vade seçeneği kaldırıldı (hiçbir araç bu vadeyi karşılayamazdı,
// çünkü ömür artık hiçbir zaman 20'yi aşamıyor). Sadece 10 günlük vade kaldı.
const TERMS = [{ days: 10, rate: 20 }];

function formatDate(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleDateString('tr-TR');
}

export default function VehicleLoanSection() {
  const { vehicles } = useVehicles();
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [term, setTerm] = useState(10);
  const [repayAmounts, setRepayAmounts] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

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

  const freeVehicles = vehicles.filter((v) => !v.mortgaged && !v.seizedByBank);
  const loanedVehicles = vehicles.filter((v) => v.mortgaged);
  const selectedVehicle = freeVehicles.find((v) => v.id === selectedVehicleId);
  const selectedVehicleLife = selectedVehicle?.lifeDays ?? INITIAL_LIFE_DAYS;
  const termValid = !selectedVehicle || selectedVehicleLife > term;

  return (
    <div className="loan-section">
      <p className="loan-section-title">Banka Kredisi — Araç İpoteği</p>

      {freeVehicles.length > 0 && (
        <div className="loan-take">
          <select
            className="loan-select"
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
          >
            <option value="">Araç seç…</option>
            {freeVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.model} (limit: {vehicleLivePrice(v).toLocaleString('tr-TR')} altın · ömür:{' '}
                {v.lifeDays ?? INITIAL_LIFE_DAYS} gün)
              </option>
            ))}
          </select>
          <div className="loan-term-row">
            {TERMS.map((t) => {
              const disabledForVehicle = Boolean(selectedVehicle) && selectedVehicleLife <= t.days;
              return (
                <button
                  key={t.days}
                  className={`loan-term-btn${term === t.days ? ' active' : ''}`}
                  disabled={disabledForVehicle}
                  onClick={() => setTerm(t.days)}
                  title={disabledForVehicle ? 'Aracın ömrü bu vadeden fazla olmalı' : undefined}
                >
                  {t.days} gün — %{t.rate} faiz
                </button>
              );
            })}
          </div>
          {selectedVehicle && !termValid && (
            <p className="loan-hint">
              Bu aracın ömrü ({selectedVehicleLife} gün) seçili vadeden ({term} gün) fazla değil —
              önce tamir ettirmen gerekir.
            </p>
          )}
          <button
            className="loan-btn primary"
            disabled={!selectedVehicleId || !termValid || busy === 'take'}
            onClick={() =>
              run('take', () => takeVehicleLoan(selectedVehicleId, term))
            }
          >
            Kredi Çek
          </button>
        </div>
      )}

      {loanedVehicles.length === 0 && freeVehicles.length === 0 && (
        <p className="loan-hint">Kredi çekebileceğin bir aracın yok.</p>
      )}

      {loanedVehicles.map((v) => {
        const remaining = v.loanTotalOwed - (v.loanPaid || 0);
        return (
          <div key={v.id} className="loan-active-card">
            <p className="loan-active-title">
              {v.model} {v.seizedByBank && <span className="loan-seized-tag">EL KONULDU</span>}
            </p>
            <p className="loan-hint">
              Kalan borç: {remaining.toLocaleString('tr-TR')} altın · Vade: {formatDate(v.loanDueAt)}
            </p>
            <QuantityStepper
              value={repayAmounts[v.id] || 0}
              onChange={(v2) => setRepayAmounts((prev) => ({ ...prev, [v.id]: v2 }))}
              max={remaining}
              quickAmounts={[100, 500, 1000]}
            />
            <button
              className="loan-btn"
              disabled={busy === `repay-${v.id}` || !repayAmounts[v.id]}
              onClick={() =>
                run(`repay-${v.id}`, () => repayVehicleLoan(v.id, Number(repayAmounts[v.id])))
              }
            >
              {repayAmounts[v.id] > 0 ? `Öde — ${Number(repayAmounts[v.id]).toLocaleString('tr-TR')} altın` : 'Öde'}
            </button>
          </div>
        );
      })}

      {error && <p className="loan-error">{error}</p>}
    </div>
  );
}
