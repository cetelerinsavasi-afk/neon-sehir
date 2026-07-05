import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { takeVehicleLoan, repayVehicleLoan } from '../../services/gameActions';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './VehicleLoanSection.css';

const TERMS = [
  { days: 10, rate: 20 },
  { days: 20, rate: 40 },
];

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
                {v.model} (limit: {v.baseGalleryValue.toLocaleString('tr-TR')} altın)
              </option>
            ))}
          </select>
          <div className="loan-term-row">
            {TERMS.map((t) => (
              <button
                key={t.days}
                className={`loan-term-btn${term === t.days ? ' active' : ''}`}
                onClick={() => setTerm(t.days)}
              >
                {t.days} gün — %{t.rate} faiz
              </button>
            ))}
          </div>
          <button
            className="loan-btn primary"
            disabled={!selectedVehicleId || busy === 'take'}
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
