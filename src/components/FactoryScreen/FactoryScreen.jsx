import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useMyFactory } from '../../hooks/useMyFactory';
import { useOpenFactories, MACHINE_LABELS } from '../../hooks/useOpenFactories';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import {
  createFactory,
  buyFactoryMachine,
  setFactorySalary,
  joinFactoryMachine,
  produceAtFactory,
  resignFromFactory,
  fireEmployee,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FactoryScreen.css';

const FACTORY_CREATE_COST = 100000;
const MACHINE_PRICES = { silahUpgrade: 50000, depoUpgrade: 50000, vitesUpgrade: 50000, yasakliMadde: 100000 };
const MACHINE_EMOJI = {
  mining: '⛏️',
  silahUpgrade: '🔧',
  depoUpgrade: '🛢️',
  vitesUpgrade: '⚙️',
  yasakliMadde: '💊',
};

function machinePrice(type, cryptoPrice) {
  return type === 'mining' ? Math.ceil(2 * cryptoPrice) : MACHINE_PRICES[type];
}

// ---------------------------------------------------------------------------
// Fabrika kurma modalı
// ---------------------------------------------------------------------------
function CreateFactoryModal({ onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createFactory();
      onClose();
    } catch (err) {
      setError(err.message || 'Fabrika kurulamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Fabrika Kur</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="factory-hint">
          {FACTORY_CREATE_COST.toLocaleString('tr-TR')} altına kendi fabrikanı kurarsın. Her
          oyuncu sadece 1 kez fabrika kurabilir, fabrika satılamaz. Kurduktan sonra istediğin
          kadar makine alabilirsin.
        </p>
        {error && <p className="factory-error">{error}</p>}
        <button className="factory-btn primary" disabled={busy} onClick={handleCreate}>
          {busy ? '…' : `Fabrika Kur (${FACTORY_CREATE_COST.toLocaleString('tr-TR')} altın)`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Makine satın alma modalı (sadece fabrika sahibi)
// ---------------------------------------------------------------------------
function BuyMachineModal({ onClose }) {
  const { prices } = useInvestmentPrices();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const types = ['mining', 'silahUpgrade', 'depoUpgrade', 'vitesUpgrade', 'yasakliMadde'];

  const handleBuy = async (type) => {
    setBusy(type);
    setError(null);
    try {
      await buyFactoryMachine(type);
      onClose();
    } catch (err) {
      setError(err.message || 'Makine alınamadı.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Makine Al</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="factory-machine-list">
          {types.map((type) => {
            const price = machinePrice(type, prices.cryptoPrice);
            return (
              <div key={type} className="factory-machine-buy-card">
                <span className="factory-machine-emoji">{MACHINE_EMOJI[type]}</span>
                <div className="factory-machine-buy-info">
                  <span className="factory-machine-buy-title">{MACHINE_LABELS[type]}</span>
                  <span className="factory-machine-buy-desc">
                    {type === 'mining'
                      ? 'İşçi gerekmez · günde 0.01-0.1 kripto üretir'
                      : `İşçi gerekir · günde ${type === 'yasakliMadde' ? '1-10' : type === 'silahUpgrade' ? '1-200' : '1-40'} adet üretir`}
                  </span>
                </div>
                <button
                  className="factory-btn primary small"
                  disabled={busy === type}
                  onClick={() => handleBuy(type)}
                >
                  {busy === type ? '…' : `${price.toLocaleString('tr-TR')} altın`}
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="factory-error">{error}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diğer fabrikaları gezinme (◀ Fabrikalar) — hem işçiler hem patronlar
// işten ayrılmadan/rekabeti görmek için kullanır.
// ---------------------------------------------------------------------------
function BrowseFactoriesModal({ onClose, onJoin, myUid, canJoin }) {
  const { factories } = useOpenFactories();

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Fabrikalar</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="factory-browse-list">
          {factories.length === 0 && <p className="factory-hint">Henüz kurulmuş bir fabrika yok.</p>}
          {factories.map((f) => (
            <div key={f.id} className="factory-browse-card">
              <div className="factory-browse-top">
                <span className="factory-browse-owner">{f.ownerName}'in Fabrikası</span>
                <span className="factory-browse-salary">
                  Maaş: {(f.salary || 0).toLocaleString('tr-TR')} altın
                </span>
              </div>
              <p className="factory-browse-meta">
                {f.machineCount} makine ·{' '}
                {f.openSlots > 0 ? (
                  <strong className="factory-browse-open">{f.openSlots} işçi aranıyor</strong>
                ) : (
                  'boş yer yok'
                )}
              </p>
              <div className="factory-browse-machines">
                {f.machines.map((m) => (
                  <span key={m.id} className="factory-browse-machine-chip">
                    {MACHINE_EMOJI[m.type]} {m.workerId ? '(dolu)' : m.type === 'mining' ? '' : '(boş)'}
                  </span>
                ))}
              </div>
              {canJoin && f.id !== myUid && f.openSlots > 0 && (
                <div className="factory-browse-join-row">
                  {f.machines
                    .filter((m) => m.type !== 'mining' && !m.workerId)
                    .map((m) => (
                      <button
                        key={m.id}
                        className="factory-btn small"
                        onClick={() => onJoin(f.id, m.id)}
                      >
                        {MACHINE_EMOJI[m.type]} {MACHINE_LABELS[m.type]}'de çalış
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yönetim paneli (sadece fabrika sahibi) — maaş belirleme + çalışan listesi
// ---------------------------------------------------------------------------
function ManagementModal({ factory, machines, onClose }) {
  const [salary, setSalary] = useState(factory.salary || 1000);
  const [salaryBusy, setSalaryBusy] = useState(false);
  const [salaryError, setSalaryError] = useState(null);
  const [fireBusy, setFireBusy] = useState(null);
  const [error, setError] = useState(null);
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const employees = machines.filter((m) => m.workerId);

  const handleSalary = async () => {
    setSalaryBusy(true);
    setSalaryError(null);
    try {
      await setFactorySalary(salary);
    } catch (err) {
      setSalaryError(err.message || 'Maaş güncellenemedi.');
    } finally {
      setSalaryBusy(false);
    }
  };

  const handleFire = async (machineId) => {
    setFireBusy(machineId);
    setError(null);
    try {
      await fireEmployee(machineId);
    } catch (err) {
      setError(err.message || 'İşten çıkarılamadı.');
    } finally {
      setFireBusy(null);
    }
  };

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Yönetim</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="factory-step-label">Maaş Belirle (1.000 - 5.000 altın)</p>
        <p className="factory-price-label">
          <strong>{salary.toLocaleString('tr-TR')} altın</strong>
        </p>
        <QuantityStepper
          value={salary}
          onChange={setSalary}
          max={5000}
          quickAmounts={[100, 500, 1000]}
        />
        <button className="factory-btn primary small" disabled={salaryBusy} onClick={handleSalary}>
          {salaryBusy ? '…' : 'Maaşı Güncelle'}
        </button>
        {salaryError && <p className="factory-error">{salaryError}</p>}

        <p className="factory-step-label">Çalışanlar ({employees.length})</p>
        {employees.length === 0 && <p className="factory-hint">Henüz çalışanın yok.</p>}
        <div className="factory-employee-list">
          {employees.map((m) => {
            const producedToday = m.lastProducedDateKey === dateKey;
            return (
              <div key={m.id} className="factory-employee-row">
                <div className="factory-employee-info">
                  <span className="factory-employee-name">{m.workerName}</span>
                  <span className="factory-employee-meta">
                    {MACHINE_EMOJI[m.type]} {MACHINE_LABELS[m.type]} ·{' '}
                    {producedToday ? `bugün ${m.lastProducedQty} adet üretti` : 'bugün henüz üretmedi'}
                  </span>
                </div>
                <button
                  className="factory-fire-btn"
                  disabled={producedToday || fireBusy === m.id}
                  onClick={() => handleFire(m.id)}
                  title={producedToday ? 'Bugün üretim yaptı, çıkaramazsın' : 'İşten çıkar'}
                >
                  {fireBusy === m.id ? '…' : 'Çıkar'}
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="factory-error">{error}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fabrika sahibi ekranı
// ---------------------------------------------------------------------------
function OwnerView({ factory, machines }) {
  const [showBuy, setShowBuy] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return (
    <div className="factory-owner-screen">
      <div className="factory-top-row">
        <button className="factory-nav-btn" onClick={() => setShowBrowse(true)}>
          ◀ Fabrikalar
        </button>
        <button className="factory-nav-btn primary" onClick={() => setShowBuy(true)}>
          Makine Al +
        </button>
      </div>

      <div className="factory-owner-header">
        <p className="factory-owner-title">{factory.ownerName}'in Fabrikası</p>
        <button className="factory-manage-btn" onClick={() => setShowManage(true)}>
          ⚙️ Yönetim
        </button>
      </div>
      <p className="factory-hint">
        Maaş: <strong>{(factory.salary || 0).toLocaleString('tr-TR')} altın</strong>
      </p>

      <div className="factory-machine-grid">
        {machines.length === 0 && <p className="factory-hint">Henüz bir makinen yok.</p>}
        {machines.map((m) => {
          const producedToday = m.lastProducedDateKey === dateKey;
          return (
            <div key={m.id} className={`factory-machine-card${producedToday ? ' produced' : ''}`}>
              <span className="factory-machine-emoji">{MACHINE_EMOJI[m.type]}</span>
              <span className="factory-machine-name">{MACHINE_LABELS[m.type]}</span>
              {m.type === 'mining' ? (
                <span className="factory-machine-status">Otomatik üretir</span>
              ) : m.workerId ? (
                <span className="factory-machine-status worker">
                  👤 {m.workerName}
                  {producedToday && ` · bugün ${m.lastProducedQty} adet`}
                </span>
              ) : (
                <span className="factory-machine-status empty">İşçi bekliyor</span>
              )}
            </div>
          );
        })}
      </div>

      {showBuy && <BuyMachineModal onClose={() => setShowBuy(false)} />}
      {showManage && (
        <ManagementModal factory={factory} machines={machines} onClose={() => setShowManage(false)} />
      )}
      {showBrowse && (
        <BrowseFactoriesModal onClose={() => setShowBrowse(false)} canJoin={false} myUid={factory.id} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// İşçi ekranı
// ---------------------------------------------------------------------------
function WorkerView({ player, myUid }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [resignBusy, setResignBusy] = useState(false);

  const employment = player.employment;
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const producedToday = player.employmentProducedDateKey === dateKey;

  const handleProduce = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await produceAtFactory();
      setResult(res.data);
    } catch (err) {
      setError(err.message || 'Üretim yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleResign = async () => {
    setResignBusy(true);
    setError(null);
    try {
      await resignFromFactory();
    } catch (err) {
      setError(err.message || 'İstifa edilemedi.');
    } finally {
      setResignBusy(false);
    }
  };

  return (
    <div className="factory-worker-screen">
      <div className="factory-top-row">
        <button className="factory-nav-btn" onClick={() => setShowBrowse(true)}>
          ◀ Fabrikalar
        </button>
      </div>

      <div className="factory-worker-center">
        <p className="factory-hint">Bir fabrikada çalışıyorsun.</p>
        <button className="factory-produce-btn" disabled={busy} onClick={handleProduce}>
          {busy ? '…' : 'Üretim Yap'}
        </button>
        {result && (
          <p className="factory-result">
            +{result.salary.toLocaleString('tr-TR')} altın maaş kazandın
            {result.shortfall > 0 && ' (patronun eksik kısmı ceza olarak devlete yazıldı)'}
          </p>
        )}
        {error && <p className="factory-error">{error}</p>}
      </div>

      <button
        className="factory-resign-btn"
        disabled={resignBusy}
        style={{ visibility: employment && !producedToday ? 'visible' : 'hidden' }}
        onClick={handleResign}
      >
        {resignBusy ? '…' : 'İstifa Et'}
      </button>

      {showBrowse && (
        <BrowseFactoriesModal onClose={() => setShowBrowse(false)} canJoin={false} myUid={myUid} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fabrika seçmemiş/çalışmayan oyuncu — gezinme ekranı
// ---------------------------------------------------------------------------
function BrowseView({ myUid }) {
  const { factories } = useOpenFactories();
  const [showCreate, setShowCreate] = useState(false);
  const [joinBusy, setJoinBusy] = useState(null);
  const [error, setError] = useState(null);

  const handleJoin = async (factoryId, machineId) => {
    setJoinBusy(machineId);
    setError(null);
    try {
      await joinFactoryMachine(factoryId, machineId);
    } catch (err) {
      setError(err.message || 'İşe girilemedi.');
    } finally {
      setJoinBusy(null);
    }
  };

  return (
    <div className="factory-browse-screen">
      <div className="factory-top-row">
        <p className="factory-section-title">Fabrikalar</p>
        <button className="factory-nav-btn primary" onClick={() => setShowCreate(true)}>
          Fabrika Kur +
        </button>
      </div>

      {factories.length === 0 && <p className="factory-hint">Henüz kurulmuş bir fabrika yok.</p>}
      <div className="factory-browse-list">
        {factories.map((f) => (
          <div key={f.id} className="factory-browse-card">
            <div className="factory-browse-top">
              <span className="factory-browse-owner">{f.ownerName}'in Fabrikası</span>
              <span className="factory-browse-salary">
                Maaş: {(f.salary || 0).toLocaleString('tr-TR')} altın
              </span>
            </div>
            <p className="factory-browse-meta">
              {f.machineCount} makine ·{' '}
              {f.openSlots > 0 ? (
                <strong className="factory-browse-open">{f.openSlots} işçi aranıyor</strong>
              ) : (
                'boş yer yok'
              )}
            </p>
            <div className="factory-browse-machines">
              {f.machines.map((m) => (
                <span key={m.id} className="factory-browse-machine-chip">
                  {MACHINE_EMOJI[m.type]} {m.workerId ? '(dolu)' : m.type === 'mining' ? '' : '(boş)'}
                </span>
              ))}
            </div>
            {f.id !== myUid && f.openSlots > 0 && (
              <div className="factory-browse-join-row">
                {f.machines
                  .filter((m) => m.type !== 'mining' && !m.workerId)
                  .map((m) => (
                    <button
                      key={m.id}
                      className="factory-btn small"
                      disabled={joinBusy === m.id}
                      onClick={() => handleJoin(f.id, m.id)}
                    >
                      {joinBusy === m.id
                        ? '…'
                        : `${MACHINE_EMOJI[m.type]} ${MACHINE_LABELS[m.type]}'de çalış`}
                    </button>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="factory-error">{error}</p>}

      {showCreate && <CreateFactoryModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export default function FactoryScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { factory, machines } = useMyFactory();

  if (!user) {
    return <SignInPrompt message="Fabrikaya girmek için giriş yapmalısın." />;
  }
  if (!player) return null;

  if (factory) {
    return <OwnerView factory={factory} machines={machines} />;
  }
  if (player.employment) {
    return <WorkerView player={player} myUid={user.uid} />;
  }
  return <BrowseView myUid={user.uid} />;
}
