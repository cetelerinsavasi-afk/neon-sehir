import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOpenOnNumaraTables } from '../../hooks/useOpenOnNumaraTables';
import { createOnNumaraTable, joinOnNumaraTable } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import './OnNumaraScreen.css';

const RULES_TEXT =
  'Amaç 10\'a en yakın (aşmadan) toplamı yapmak. Kartlar 1-5. 10\'u geçersen elenirsin. Hamlen için 10 saniyen var. Herkes bitince kurpiyer 8\'e kadar çeker. Kurpiyer de kazananlar arasındaysa pot kimseye ödenmez. 10 Numara kazancı asla otomatik borca gitmez.';

export default function OnNumaraScreen({ onEnterTable }) {
  const { user } = useAuth();
  const { tables } = useOpenOnNumaraTables();
  const [capacity, setCapacity] = useState(1);
  const [betAmount, setBetAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="10 Numara oynamak için giriş yapmalısın." />;
  }

  const handleCreate = async () => {
    const amount = Number(betAmount);
    if (!amount || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createOnNumaraTable(capacity, amount);
      if (res?.data?.tableId) onEnterTable(res.data.tableId);
    } catch (err) {
      setError(err.message || 'Masa kurulamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (tableId) => {
    setBusy(true);
    setError(null);
    try {
      await joinOnNumaraTable(tableId);
      onEnterTable(tableId);
    } catch (err) {
      setError(err.message || 'Masaya katılamadın.');
    } finally {
      setBusy(false);
    }
  };

  const openTables = tables.filter(
    (t) => t.seatOrder.length < t.capacity && !t.seatOrder.includes(user.uid)
  );

  return (
    <div className="onnumara-screen">
      <p className="onnumara-title">
        10 Numara
        <InfoIcon text={RULES_TEXT} />
      </p>

      <div className="onnumara-section">
        <p className="onnumara-section-title">Masa Kur</p>
        <div className="onnumara-capacity-row">
          {[1, 2, 3, 4].map((c) => (
            <button
              key={c}
              className={`onnumara-cap-btn${capacity === c ? ' active' : ''}`}
              onClick={() => setCapacity(c)}
            >
              {c} Kişilik
            </button>
          ))}
        </div>
        <div className="onnumara-row">
          <input
            type="number"
            min="1"
            placeholder="Bahis miktarı (altın)"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            className="onnumara-input"
          />
          <button className="onnumara-btn primary" disabled={busy || !betAmount} onClick={handleCreate}>
            Masa Kur
          </button>
        </div>
      </div>

      <div className="onnumara-section">
        <p className="onnumara-section-title">Açık Masalar</p>
        {openTables.length === 0 && <p className="onnumara-hint">Şu an açık masa yok.</p>}
        {openTables.map((t) => (
          <div key={t.id} className="onnumara-table-card">
            <span>
              {t.capacity} kişilik · Bahis {t.betAmount.toLocaleString('tr-TR')} altın ·{' '}
              {t.seatOrder.length}/{t.capacity} dolu
            </span>
            <button className="onnumara-btn" disabled={busy} onClick={() => handleJoin(t.id)}>
              Katıl
            </button>
          </div>
        ))}
      </div>

      {error && <p className="onnumara-error">{error}</p>}
    </div>
  );
}
