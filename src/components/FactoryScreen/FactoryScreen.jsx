import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useMyFactory } from '../../hooks/useMyFactory';
import { useOpenFactories, MACHINE_LABELS } from '../../hooks/useOpenFactories';
import { useEmployerFactory } from '../../hooks/useEmployerFactory';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import {
  createFactory,
  buyFactoryMachine,
  setFactorySalary,
  joinFactoryMachine,
  autoJoinFactory,
  produceAtFactory,
  resignFromFactory,
  fireEmployee,
  reassignEmployee,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './FactoryScreen.css';

const FACTORY_CREATE_COST = 100000;
const MACHINE_PRICES = { tamirMalzemesi: 100000, silahUpgrade: 50000, arabaGelistirme: 50000, yasakliMadde: 100000 };
const MACHINE_EMOJI = {
  mining: '⛏️',
  tamirMalzemesi: '🔧',
  silahUpgrade: '🔫',
  arabaGelistirme: '🚗',
  yasakliMadde: '💊',
};

function machinePrice(type, cryptoPrice) {
  return type === 'mining' ? Math.ceil(2 * cryptoPrice) : MACHINE_PRICES[type];
}

function machineProductionRangeLabel(type) {
  if (type === 'yasakliMadde') return '1-10';
  if (type === 'silahUpgrade') return '1-200';
  if (type === 'tamirMalzemesi') return '1-4000';
  return '1-40';
}

// ---------------------------------------------------------------------------
// Fabrika kurma modalı
// ---------------------------------------------------------------------------
function CreateFactoryModal({ onClose, isEmployed }) {
  const { prices } = useInvestmentPrices();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const types = ['mining', 'tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme', 'yasakliMadde'];

  const handleCreate = async () => {
    if (isEmployed) {
      setError('Fabrika kurmak için önce işinden ayrılmalısın.');
      return;
    }
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

        <p className="factory-step-label">Fabrikanda Alabileceğin Makineler</p>
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
                      : `İşçi gerekir · günde ${machineProductionRangeLabel(type)} adet üretir`}
                  </span>
                </div>
                <span className="factory-machine-buy-price">{price.toLocaleString('tr-TR')} altın</span>
              </div>
            );
          })}
        </div>

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

  const types = ['mining', 'tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme', 'yasakliMadde'];

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
                      : `İşçi gerekir · günde ${machineProductionRangeLabel(type)} adet üretir`}
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
function BrowseFactoriesModal({ onClose, onJoin, joinBusy, myUid, canJoin }) {
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
              {canJoin && f.id !== myUid && f.openSlots > 0 && (
                <div className="factory-browse-join-row">
                  <button
                    className="factory-btn primary small"
                    disabled={joinBusy === f.id}
                    onClick={() => onJoin(f.id)}
                  >
                    {joinBusy === f.id ? '…' : 'İşe Gir'}
                  </button>
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
  const [showSalaryPanel, setShowSalaryPanel] = useState(false);
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
  const openMachines = machines.filter((m) => m.type !== 'mining' && !m.workerId);
  const [reassignTarget, setReassignTarget] = useState({});
  const [reassignBusy, setReassignBusy] = useState(null);

  const handleSalary = async () => {
    setSalaryBusy(true);
    setSalaryError(null);
    try {
      await setFactorySalary(salary);
      setShowSalaryPanel(false);
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

  const handleReassign = async (machineId) => {
    const targetMachineId = reassignTarget[machineId];
    if (!targetMachineId) return;
    setReassignBusy(machineId);
    setError(null);
    try {
      await reassignEmployee(machineId, targetMachineId);
    } catch (err) {
      setError(err.message || 'İşçi taşınamadı.');
    } finally {
      setReassignBusy(null);
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

        <div className="factory-salary-section">
          <div className="factory-salary-summary">
            <span className="factory-salary-current">
              Güncel maaş: <strong>{(factory.salary || 0).toLocaleString('tr-TR')} altın</strong>
            </span>
            <button
              className="factory-btn small"
              onClick={() => setShowSalaryPanel((v) => !v)}
            >
              {showSalaryPanel ? 'Kapat' : 'Maaş Belirle'}
            </button>
          </div>
          {showSalaryPanel && (
            <>
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
            </>
          )}
        </div>

        <p className="factory-step-label">Çalışanlar ({employees.length})</p>
        {employees.length === 0 && <p className="factory-hint">Henüz çalışanın yok.</p>}
        <div className="factory-employee-list">
          {employees.map((m) => {
            const producedToday = m.lastProducedDateKey === dateKey;
            const availableTargets = openMachines.filter((om) => om.id !== m.id);
            const canReassign = !producedToday && availableTargets.length > 0;
            return (
              <div key={m.id} className="factory-employee-row-wrap">
                <div className="factory-employee-row">
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
                    title={producedToday ? 'Bugün üretim yaptı, işten atamazsın' : 'İşten at'}
                  >
                    {fireBusy === m.id ? '…' : 'İşten At'}
                  </button>
                </div>
                {canReassign && (
                  <div className="factory-reassign-row">
                    <select
                      className="factory-reassign-select"
                      value={reassignTarget[m.id] || ''}
                      onChange={(e) =>
                        setReassignTarget((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                    >
                      <option value="">Başka makineye taşı…</option>
                      {availableTargets.map((om) => (
                        <option key={om.id} value={om.id}>
                          {MACHINE_EMOJI[om.type]} {MACHINE_LABELS[om.type]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="factory-btn small"
                      disabled={!reassignTarget[m.id] || reassignBusy === m.id}
                      onClick={() => handleReassign(m.id)}
                    >
                      {reassignBusy === m.id ? '…' : 'Taşı'}
                    </button>
                  </div>
                )}
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
function OwnerView({ factory, machines, player, myUid }) {
  const [showBuy, setShowBuy] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [selfBusy, setSelfBusy] = useState(null);
  const [selfError, setSelfError] = useState(null);
  const [produceBusy, setProduceBusy] = useState(false);
  const [produceResult, setProduceResult] = useState(null);
  const [resignBusy, setResignBusy] = useState(false);
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const hasAnyEmployment = !!player?.employment;

  const handleSelfJoin = async (machineId) => {
    setSelfBusy(machineId);
    setSelfError(null);
    try {
      await joinFactoryMachine(factory.id, machineId);
    } catch (err) {
      setSelfError(err.message || 'Makineye yerleşilemedi.');
    } finally {
      setSelfBusy(null);
    }
  };

  const handleSelfProduce = async () => {
    setProduceBusy(true);
    setSelfError(null);
    try {
      const res = await produceAtFactory();
      setProduceResult(res.data);
    } catch (err) {
      setSelfError(err.message || 'Üretim yapılamadı.');
    } finally {
      setProduceBusy(false);
    }
  };

  const handleSelfResign = async () => {
    setResignBusy(true);
    setSelfError(null);
    try {
      await resignFromFactory();
      setProduceResult(null);
    } catch (err) {
      setSelfError(err.message || 'İstifa edilemedi.');
    } finally {
      setResignBusy(false);
    }
  };

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
              ) : m.workerId === myUid ? (
                <div className="factory-machine-self">
                  <span className="factory-machine-status worker">
                    👤 Sen çalışıyorsun
                    {producedToday && ` · bugün ${m.lastProducedQty} adet`}
                  </span>
                  <div className="factory-machine-self-actions">
                    <button
                      className="factory-btn small"
                      disabled={producedToday || produceBusy}
                      onClick={handleSelfProduce}
                    >
                      {produceBusy ? '…' : 'Üretim Yap'}
                    </button>
                    <button
                      className="factory-btn small"
                      disabled={producedToday || resignBusy}
                      onClick={handleSelfResign}
                      title={producedToday ? 'Bugün üretim yaptın, bugün istifa edemezsin' : 'İstifa et'}
                    >
                      {resignBusy ? '…' : 'İstifa Et'}
                    </button>
                  </div>
                  {producedToday && (
                    <p className="factory-produced-warning small">
                      00:00'dan sonra tekrar üretim yapabilirsin.
                    </p>
                  )}
                </div>
              ) : m.workerId ? (
                <span className="factory-machine-status worker">
                  👤 {m.workerName}
                  {producedToday && ` · bugün ${m.lastProducedQty} adet`}
                </span>
              ) : hasAnyEmployment ? (
                <span className="factory-machine-status empty">İşçi bekliyor</span>
              ) : (
                <button
                  className="factory-btn small"
                  disabled={selfBusy === m.id}
                  onClick={() => handleSelfJoin(m.id)}
                >
                  {selfBusy === m.id ? '…' : 'Kendini Yerleştir'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {produceResult && (
        <p className="factory-result">
          {produceResult.isSelfEmployed
            ? `Üretim yapıldı: ${produceResult.qty.toLocaleString('tr-TR')} adet ürün stoğuna eklendi (kendi fabrikanda çalıştığın için maaş almadın).`
            : `+${produceResult.salary.toLocaleString('tr-TR')} altın maaş kazandın${
                produceResult.shortfall > 0 ? ' (eksik kısım ceza olarak devlete yazıldı)' : ''
              }`}
        </p>
      )}
      {selfError && <p className="factory-error">{selfError}</p>}

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
  const [showCreateFactory, setShowCreateFactory] = useState(false);

  const employment = player.employment;
  const { factory: employerFactory } = useEmployerFactory(employment?.factoryId);
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
        <button className="factory-nav-btn primary" onClick={() => setShowCreateFactory(true)}>
          Fabrika Kur +
        </button>
      </div>

      <div className="factory-worker-center">
        <p className="factory-hint">Bir fabrikada çalışıyorsun.</p>
        <div className="factory-job-info">
          <span className="factory-job-salary">
            {(employerFactory?.salary || 0).toLocaleString('tr-TR')} altın
          </span>
          <span className="factory-job-employer">
            {employerFactory ? `${employerFactory.ownerName}'in Fabrikası` : '…'}
          </span>
        </div>
        <button className="factory-produce-btn" disabled={busy || producedToday} onClick={handleProduce}>
          {busy ? '…' : 'Üretim Yap'}
        </button>
        {producedToday && (
          <p className="factory-produced-warning">
            Bugün zaten üretim yaptın. 00:00'dan sonra tekrar üretim yapabilirsin.
          </p>
        )}
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
      {showCreateFactory && (
        <CreateFactoryModal onClose={() => setShowCreateFactory(false)} isEmployed />
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

  const handleJoin = async (factoryId) => {
    setJoinBusy(factoryId);
    setError(null);
    try {
      await autoJoinFactory(factoryId);
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
            {f.id !== myUid && f.openSlots > 0 && (
              <div className="factory-browse-join-row">
                <button
                  className="factory-btn primary small"
                  disabled={joinBusy === f.id}
                  onClick={() => handleJoin(f.id)}
                >
                  {joinBusy === f.id ? '…' : 'İşe Gir'}
                </button>
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
    return <OwnerView factory={factory} machines={machines} player={player} myUid={user.uid} />;
  }
  if (player.employment) {
    return <WorkerView player={player} myUid={user.uid} />;
  }
  return <BrowseView myUid={user.uid} />;
}
