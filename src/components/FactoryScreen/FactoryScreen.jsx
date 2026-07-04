import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useProductionMachines } from '../../hooks/useProductionMachines';
import { factoryWork, buyProductionMachine, collectProduction } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './FactoryScreen.css';

const MACHINES = [
  { id: 'depoUpgrade', label: 'Depo Geliştirme Makinesi', dailyOutput: 10 },
  { id: 'vitesUpgrade', label: 'Vites Geliştirme Makinesi', dailyOutput: 10 },
  { id: 'silahUpgrade', label: 'Silah Geliştirme Makinesi', dailyOutput: 50 },
  { id: 'yasakliMadde', label: 'Yasaklı Madde Üretim Makinesi', dailyOutput: 1 },
];
const MACHINE_PRICE = 100000;
const FACTORY_WAGE = 1000;

// Meslek seçimi kaldırıldı — işçilik (günlük 1000 altın) ve üretim
// makineleri herkese açık, aynı anda ikisi de kullanılabilir.
export default function FactoryScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const { machines } = useProductionMachines();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return (
      <SignInPrompt message="Fabrikada çalışmak veya üretim makinesi kurmak için giriş yapmalısın." />
    );
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

  const alreadyWorked = Boolean(actions.factoryWork);

  return (
    <div className="factory-screen">
      <p className="factory-hint">
        Günde 1 kez çalışıp <strong>{FACTORY_WAGE} altın</strong> kazanabilirsin.
      </p>
      <button
        className="factory-action"
        disabled={alreadyWorked || busy === 'work'}
        onClick={() => run('work', factoryWork)}
      >
        {alreadyWorked
          ? 'Bugün zaten çalıştın'
          : busy === 'work'
            ? 'Çalışılıyor…'
            : `Çalış (${FACTORY_WAGE} altın)`}
      </button>

      <p className="factory-hint">
        Üretim makinesi satın alıp günlük malzeme toplayabilirsin. Her makine{' '}
        <strong>{MACHINE_PRICE.toLocaleString('tr-TR')} altın</strong>.
      </p>
      {MACHINES.map((m) => {
        const owned = Boolean(machines[m.id]?.owned);
        const collected = Boolean(actions.machinesCollected?.[m.id]);
        return (
          <div key={m.id} className="factory-machine">
            <div className="factory-machine-info">
              <span className="factory-machine-label">{m.label}</span>
              <span className="factory-machine-desc">Günlük üretim: {m.dailyOutput} adet</span>
            </div>
            {!owned ? (
              <button
                className="factory-action small"
                disabled={busy === m.id || (player?.gold ?? 0) < MACHINE_PRICE}
                onClick={() => run(m.id, () => buyProductionMachine(m.id))}
              >
                {busy === m.id ? '…' : 'Satın Al'}
              </button>
            ) : (
              <button
                className="factory-action small"
                disabled={collected || busy === m.id}
                onClick={() => run(m.id, () => collectProduction(m.id))}
              >
                {collected ? 'Toplandı' : busy === m.id ? '…' : 'Üretimi Topla'}
              </button>
            )}
          </div>
        );
      })}

      {error && <p className="factory-error">{error}</p>}
    </div>
  );
}
