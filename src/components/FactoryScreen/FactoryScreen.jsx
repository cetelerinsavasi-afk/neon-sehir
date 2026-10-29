import { useEffect, useState } from 'react';
import { factoryTaxRate } from '../../../functions/tax.js';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useMyFactory } from '../../hooks/useMyFactory';
import { useOpenFactories, MACHINE_LABELS } from '../../hooks/useOpenFactories';
import { useEmployerFactory } from '../../hooks/useEmployerFactory';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import FactoryMiniGame from './FactoryMiniGame';
import {
  createFactory,
  buyFactoryMachine,
  setFactorySalary,
  setFactoryName,
  joinFactoryMachine,
  autoJoinFactory,
  produceAtFactory,
  resignFromFactory,
  runFactoryMachines,
  fireEmployee,
  reassignEmployee,
  ensureFactoryMigrationsV38,
} from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import FactoryBadge from './FactoryBadge';
import FactoryLogoDesigner from './FactoryLogoDesigner';
import { MagazaOverlay } from '../Magaza/Magaza';
import FactoryShareBuyModal from './FactoryShareBuyModal';
import FactorySponsorModal from './FactorySponsorModal';
import NotificationBell from '../NotificationBell/NotificationBell';
import { factoryDisplayName, computeFactoryValue, rankFactoriesForList } from './factoryHelpers';
import './FactoryScreen.css';
import { machineTax, withMachineTax } from '../../../functions/tax.js';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { fmtRate, MACHINE_RATE_KEY } from '../../../functions/belediyeRates.js';

const FACTORY_CREATE_COST = 100000;
const MACHINE_PRICES = { tamirMalzemesi: 50000, silahUpgrade: 50000, arabaGelistirme: 50000, yasakliMadde: 100000 };
const MACHINE_EMOJI = {
  mining: '⛏️',
  tamirMalzemesi: '🔧',
  silahUpgrade: '🔫',
  arabaGelistirme: '🚗',
  yasakliMadde: '💊',
};

// Kullanıcı revizesi: "fabrikama girdiğimde tüm makineler alt alta
// sıralanıyor, makine sayısı arttıkça karışık oluyor" — mining hariç diğer
// 4 makine türü artık ana ekranda tek tek listelenmiyor, bunun yerine 2x2
// kategori butonu olarak gösteriliyor (bkz. OwnerView).
// v38: yasaklı madde makineleri kaldırıldı (yasaklı madde ticareti artık çetelerde).
const MACHINE_CATEGORY_TYPES = ['tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme'];

// v124 — fabrika hisseleri artık satılmıyor (mevcut hisselerin ödemeleri sürer)
const NO_LISTED_SHARES = Object.freeze({});

// v126: makine fiyatı + vergi (sunucudaki machineTax ile aynı — functions/tax.js)
// v127: oran makine türüne göre, Sanayi Bakanlığı belirler (günün oranı)
function MachineCost({ price, type, rates }) {
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  return (
    <span className="factory-machine-tax">
      {fmt(price)} + {fmtRate(rates[MACHINE_RATE_KEY[type]], '%')} vergi ({fmt(machineTax(price, type, rates))})
    </span>
  );
}

function machinePrice(type, cryptoPrice, ownedMiningCount = 0) {
  if (type !== 'mining') return MACHINE_PRICES[type];
  // Sunucudaki miningMachinePrice ile AYNI kademeli formül: her 10
  // makinede +0.2x (0-9: 2.0x, 10-19: 2.2x, 20-29: 2.4x, ...). Eskiden
  // burada her 100 makinede +2x olan eski formül vardı — sunucu
  // güncellenirken burası unutulmuş, buton yanlış fiyat gösteriyordu.
  const multiplier = 2 + 0.2 * Math.floor((ownedMiningCount || 0) / 10);
  return Math.ceil(multiplier * cryptoPrice);
}

function machineProductionRangeLabel(type) {
  if (type === 'yasakliMadde') return '1-10';
  if (type === 'silahUpgrade') return '1-200';
  if (type === 'tamirMalzemesi') return '1-2000';
  return '1-40';
}

// ---------------------------------------------------------------------------
// Fabrika kurma modalı
// ---------------------------------------------------------------------------
// v77 — fabrika her makineden 1'er tane ile kurulur; bedel kripto fiyatıyla
// saatlik değişir (sunucudaki factoryStarterCost ile aynı formül).
const FACTORY_STARTER_MACHINES = ['mining', 'tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme'];
function factoryStarterCost(cryptoPrice, rates) {
  // v126: her makine fiyatı + vergi; kuruluş ücretine vergi yok · v127: oran türüne göre (belediye)
  return FACTORY_CREATE_COST + FACTORY_STARTER_MACHINES.reduce((a, t) => a + withMachineTax(machinePrice(t, cryptoPrice || 0), t, rates), 0);
}

function CreateFactoryModal({ onClose, isEmployed }) {
  const { prices, loading } = useInvestmentPrices();
  const rates = useBelediyeRates();
  const { player } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const total = factoryStarterCost(prices.cryptoPrice, rates);
  const gold = Number(player?.gold || 0);
  const poor = gold < total;
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createFactory(total);
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
        <p className="factory-hint">Fabrikan her makineden 1 tane ile kurulur. Kurduğun anda 4 makinen hazır olur.</p>
        {isEmployed && <p className="factory-hint">Kurduğunda şu anki işinden otomatik ayrılırsın.</p>}

        <p className="factory-step-label">Fabrikayla birlikte gelenler</p>
        <div className="factory-machine-list">
          <div className="factory-machine-buy-card">
            <span className="factory-machine-emoji">🏭</span>
            <div className="factory-machine-buy-info">
              <span className="factory-machine-buy-title">Fabrika binası</span>
              <span className="factory-machine-buy-desc">Kuruluş ücreti</span>
            </div>
            <span className="factory-machine-buy-price">{fmt(FACTORY_CREATE_COST)} altın</span>
          </div>
          {FACTORY_STARTER_MACHINES.map((type) => (
            <div key={type} className="factory-machine-buy-card">
              <span className="factory-machine-emoji">{MACHINE_EMOJI[type]}</span>
              <div className="factory-machine-buy-info">
                <span className="factory-machine-buy-title">1 × {MACHINE_LABELS[type]}</span>
                <span className="factory-machine-buy-desc">
                  {type === 'mining' ? `2 × kripto fiyatı · işçi gerekmez` : `İşçi gerekir · günde ${machineProductionRangeLabel(type)} adet`}
                </span>
                <MachineCost price={machinePrice(type, prices.cryptoPrice)} type={type} rates={rates} />
              </div>
              <span className="factory-machine-buy-price">{fmt(withMachineTax(machinePrice(type, prices.cryptoPrice), type, rates))} altın</span>
            </div>
          ))}
        </div>

        <div className="factory-create-total">
          <span>Toplam</span>
          <b>{loading ? '…' : `${fmt(total)} altın`}</b>
        </div>
        <p className="factory-hint factory-create-note">Fiyat kripto fiyatına göre saatlik değişir.</p>
        <div className="factory-create-wallet">
          <span>Cebindeki altın</span>
          <b className={poor ? 'bad' : ''}>{fmt(gold)}</b>
        </div>
        {poor && !loading && <p className="factory-error">{fmt(total - gold)} altın eksik.</p>}

        {error && <p className="factory-error">{error}</p>}
        <button className="factory-btn primary" disabled={busy || loading || poor} onClick={handleCreate}>
          {busy ? 'Kuruluyor…' : `Fabrika Kur — ${fmt(total)} altın`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Makine satın alma modalı (sadece fabrika sahibi)
// ---------------------------------------------------------------------------
function BuyMachineModal({ onClose, ownedMiningCount }) {
  const { prices } = useInvestmentPrices();
  const rates = useBelediyeRates();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  // v58: pencere her alımdan sonra kapanmıyor — art arda istenen kadar alınabilir
  const [bought, setBought] = useState({});

  const types = ['mining', 'tamirMalzemesi', 'silahUpgrade', 'arabaGelistirme'];
  const boughtTotal = Object.values(bought).reduce((a, b) => a + b, 0);

  const handleBuy = async (type) => {
    setBusy(type);
    setError(null);
    try {
      await buyFactoryMachine(type);
      setBought((prev) => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
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
            const price = machinePrice(type, prices.cryptoPrice, ownedMiningCount);
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
                  <MachineCost price={price} type={type} rates={rates} />
                  {bought[type] > 0 && (
                    <span className="factory-machine-buy-desc factory-machine-bought">✅ {bought[type]} adet alındı</span>
                  )}
                </div>
                <button
                  className="factory-btn primary small"
                  disabled={busy !== null}
                  onClick={() => handleBuy(type)}
                >
                  {busy === type ? '…' : `${withMachineTax(price, type, rates).toLocaleString('tr-TR')} altın`}
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="factory-error">{error}</p>}
        {boughtTotal > 0 && (
          <button className="factory-btn primary factory-buy-done" onClick={onClose}>
            Tamam ({boughtTotal} makine alındı)
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diğer fabrikaları gezinme (◀ Fabrikalar) — hem işçiler hem patronlar
// işten ayrılmadan/rekabeti görmek için kullanır.
// ---------------------------------------------------------------------------
function BrowseFactoriesModal({ onClose, onJoin, joinBusy, myUid, canJoin }) {
  const { factories: allFactories } = useOpenFactories();
  const { prices } = useInvestmentPrices();
  // v57: değere göre sıralı; 30 gündür hareketsiz fabrikalar gizli (kendi fabrikan hep görünür)
  const factories = rankFactoriesForList(allFactories, prices.cryptoPrice, { keepIds: [myUid] });
  // DÜZELTME (madde 3): "hisse alma butonunu göremiyorum" — bu sorgu
  // collectionGroup('shares') üzerinde çalışıyor ve Firestore indeksi
  // deploy edilmemişse SESSİZCE boş dönüyordu (sadece console.error), bu
  // yüzden `error` de dışa alınıp aşağıda kullanıcıya gösteriliyor.
  // v124: hisse satışı kaldırıldı — "📈 Hisseler" butonu gösterilmez, ilanlar okunmaz
  const byFactoryId = NO_LISTED_SHARES;
  const shareError = null;
  const [shareBuyFactory, setShareBuyFactory] = useState(null);

  return (
    <>
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Fabrikalar</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="factory-browse-list">
          {factories.length === 0 && (
            <p className="factory-hint">
              {allFactories.length === 0 ? 'Henüz kurulmuş bir fabrika yok.' : 'Şu an listede aktif fabrika yok.'}
            </p>
          )}
          {factories.map((f) => (
            <div key={f.id} className="factory-browse-card">
              <div className="factory-browse-top">
                <div className="factory-browse-owner-row">
                  <FactoryBadge logo={f.logo} name={factoryDisplayName(f)} size={32} />
                  <span className="factory-browse-owner">{factoryDisplayName(f)}</span>
                </div>
                <span className="factory-browse-salary">
                  Maaş: {(f.salary || 0).toLocaleString('tr-TR')} altın
                </span>
              </div>
              <p className="factory-browse-value">
                Fabrika değeri:{' '}
                <strong>{f.value.toLocaleString('tr-TR')} altın</strong>
              </p>
              <p className="factory-browse-meta">
                {f.machineCount} makine ·{' '}
                {f.openSlots > 0 ? (
                  <strong className="factory-browse-open">{f.openSlots} işçi aranıyor</strong>
                ) : (
                  'boş yer yok'
                )}
              </p>
              <div className="factory-browse-join-row">
                {canJoin && f.id !== myUid && f.openSlots > 0 && (
                  <button
                    className="factory-btn primary small"
                    disabled={joinBusy === f.id}
                    onClick={() => onJoin(f.id)}
                  >
                    {joinBusy === f.id ? '…' : 'İşe Gir'}
                  </button>
                )}
                {f.id !== myUid && byFactoryId[f.id]?.length > 0 && (
                  <button className="factory-btn small" onClick={() => setShareBuyFactory(f)}>
                    📈 Hisseler
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {shareError && (
          <p className="factory-hint small factory-share-error-hint">
            ⚠️ Hisse verileri şu an yüklenemedi. Firestore indekslerinin deploy edildiğinden emin ol
            (firebase deploy --only firestore:indexes) ve tekrar dene.
          </p>
        )}
      </div>
    </div>
    {shareBuyFactory && (
      <FactoryShareBuyModal
        factory={shareBuyFactory}
        shares={byFactoryId[shareBuyFactory.id]}
        onClose={() => setShareBuyFactory(null)}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// v128 — "Yönetim" paneli kaldırıldı; işlevleri yerinde:
//   ✏️ fabrika adının yanında → ad + logo · ✏️ maaşın yanında → maaş
//   makine kartında (işçi varsa) → Kov / Taşı
// ---------------------------------------------------------------------------
function FactoryModalShell({ title, onClose, children }) {
  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">{title}</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FactoryNameModal({ factory, onClose }) {
  const [name, setName] = useState(factory.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showLogoDesigner, setShowLogoDesigner] = useState(false);
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Fabrika adı boş olamaz.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setFactoryName(trimmed);
      onClose();
    } catch (err) {
      setError(err.message || 'Fabrika adı güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };
  if (showLogoDesigner) return <FactoryLogoDesigner factory={factory} onClose={() => setShowLogoDesigner(false)} />;
  return (
    <FactoryModalShell title="Fabrika Adı ve Logosu" onClose={onClose}>
      <div className="factory-name-section">
        <button type="button" className="factory-logo-edit" onClick={() => setShowLogoDesigner(true)} aria-label="Logoyu değiştir">
          <FactoryBadge logo={factory.logo} name={factoryDisplayName(factory)} size={64} />
          <span className="factory-logo-edit-pen" aria-hidden="true">🎨</span>
        </button>
        <div className="factory-name-row">
          <input
            className="factory-name-input"
            type="text"
            maxLength={22}
            value={name}
            placeholder={`${factory.ownerName}'in Fabrikası`}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="factory-btn primary small" disabled={busy} onClick={save}>
            {busy ? '…' : 'Kaydet'}
          </button>
        </div>
        {error && <p className="factory-error">{error}</p>}
      </div>
    </FactoryModalShell>
  );
}

function FactorySalaryModal({ factory, onClose }) {
  const [salary, setSalary] = useState(factory.salary || 1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setFactorySalary(salary);
      onClose();
    } catch (err) {
      setError(err.message || 'Maaş güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <FactoryModalShell title="İşçi Maaşı" onClose={onClose}>
      <p className="factory-step-label">1.000 – 5.000 altın</p>
      <p className="factory-price-label">
        <strong>{salary.toLocaleString('tr-TR')} altın</strong>
      </p>
      <QuantityStepper value={salary} onChange={setSalary} max={5000} quickAmounts={[100, 500, 1000]} />
      <button className="factory-btn primary small" disabled={busy} onClick={save}>
        {busy ? '…' : 'Maaşı Güncelle'}
      </button>
      {error && <p className="factory-error">{error}</p>}
    </FactoryModalShell>
  );
}

// Makine kartındaki işçi işlemleri (sadece sahip). Bugün üreten işçi kovulamaz/taşınamaz.
function WorkerActions({ m, machines, dateKey }) {
  const [mode, setMode] = useState(null); // null | 'fire' | 'move'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (m.workerLeftDateKey) {
    return <span className="factory-machine-status">🏭 Kendi fabrikasını kurdu · makine 00:00'da boşalacak</span>;
  }
  const workedToday = m.lastProducedDateKey === dateKey;
  const targets = MACHINE_CATEGORY_TYPES.filter((t) => t !== m.type).map((t) => ({
    type: t,
    free: machines.find((x) => x.type === t && !x.workerId && x.id !== m.id) || null,
  }));
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode(null);
    } catch (err) {
      setError(err.message || 'İşlem yapılamadı.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fw-actions">
      {mode === null && (
        <div className="fw-row">
          <button className="fw-btn fire" disabled={workedToday} onClick={() => setMode('fire')}>
            ✖ Kov
          </button>
          <button className="fw-btn move" disabled={workedToday} onClick={() => setMode('move')}>
            ⇄ Taşı
          </button>
        </div>
      )}
      {workedToday && mode === null && <span className="fw-note">🔒 Bugün çalıştı · 00:00'dan sonra</span>}
      {mode === 'fire' && (
        <div className="fw-confirm">
          <span>
            <b>{m.workerName}</b> işten atılsın mı?
          </span>
          <div className="fw-row">
            <button className="fw-btn" disabled={busy} onClick={() => setMode(null)}>
              Vazgeç
            </button>
            <button className="fw-btn fire solid" disabled={busy} onClick={() => run(() => fireEmployee(m.id))}>
              {busy ? '…' : 'Evet, kov'}
            </button>
          </div>
        </div>
      )}
      {mode === 'move' && (
        <div className="fw-confirm">
          <div className="fw-row">
            {targets.map((t) => (
              <button
                key={t.type}
                className="fw-target"
                disabled={busy || !t.free}
                onClick={() => run(() => reassignEmployee(m.id, t.free.id))}
              >
                <span className="fw-target-emoji">{MACHINE_EMOJI[t.type]}</span>
                <span>{MACHINE_LABELS[t.type].replace(/ Makinesi$/, '')}</span>
                {!t.free && <em>boş makine yok</em>}
              </button>
            ))}
          </div>
          <button className="fw-btn" disabled={busy} onClick={() => setMode(null)}>
            Vazgeç
          </button>
        </div>
      )}
      {error && <p className="factory-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fabrika sahibi ekranı
// ---------------------------------------------------------------------------
function OwnerView({ factory, machines, player, myUid }) {
  const { prices } = useInvestmentPrices();
  const [showBuy, setShowBuy] = useState(false);
  const [showNameEdit, setShowNameEdit] = useState(false); // v128
  const [showSalaryEdit, setShowSalaryEdit] = useState(false); // v128
  const [showMagaza, setShowMagaza] = useState(false); // v128: Envanter → Mağaza
  const [showBrowse, setShowBrowse] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showSponsor, setShowSponsor] = useState(false);
  const [selfBusy, setSelfBusy] = useState(null);
  const [selfError, setSelfError] = useState(null);
  // showShiftGame — yeni istek: "fabrika sahipleri de kendisi bi makinede
  // görevliyse bu kutu oyununu oynasın üretim yapmak için" — sahibin kendi
  // çalıştığı makine için de artık "Üretim Yap" direkt üretmiyor, önce
  // FactoryMiniGame açılıyor (WorkerView'daki AYNI akış, bkz.
  // handleShiftGameComplete) — 3 mini oyundan (koli yakalama/altın avı/bant
  // senkronu) biri rastgele seçilir, bkz. FactoryMiniGame.jsx.
  const [showShiftGame, setShowShiftGame] = useState(false);
  const [produceResult, setProduceResult] = useState(null);
  const [resignBusy, setResignBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  // Kullanıcı revizesi: makineler artık kategoriye göre gruplanıyor —
  // null iken ana görünüm (mining + kendi çalıştığın makine + 4 kategori
  // butonu), bir tür seçiliyken o türün makine listesi gösteriliyor.
  const [activeCategory, setActiveCategory] = useState(null);
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now()));

  const hasAnyEmployment = !!player?.employment;
  const miningMachines = machines.filter((m) => m.type === 'mining');
  const otherMachines = machines.filter((m) => m.type !== 'mining');
  const miningTriggeredCount = miningMachines.filter((m) => m.miningTriggeredDateKey === dateKey).length;
  const miningAllTriggeredToday = miningMachines.length > 0 && miningTriggeredCount === miningMachines.length;
  const allMiningHandledToday = miningMachines.length === 0 || miningAllTriggeredToday;
  const allWorkerMachinesHandledToday =
    otherMachines.length === 0 ||
    otherMachines.every((m) => m.lastProducedDateKey === dateKey || m.ownerTriggeredDateKey === dateKey);
  const machinesAlreadyRunToday = machines.length > 0 && allMiningHandledToday && allWorkerMachinesHandledToday;
  // Kullanıcı revizesi: sahibin kendi çalıştığı makine (varsa) ana ekranda
  // mining'in hemen altında, kategori listesine girmeden gösterilsin.
  const myMachine = otherMachines.find((m) => m.workerId === myUid);

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

  const handleShiftGameComplete = async () => {
    setSelfError(null);
    const res = await produceAtFactory();
    setProduceResult(res.data);
    return res.data;
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

  const handleRunFactoryMachines = async () => {
    setRunBusy(true);
    setSelfError(null);
    try {
      await runFactoryMachines();
    } catch (err) {
      setSelfError(err.message || 'Makineler çalıştırılamadı.');
    } finally {
      setRunBusy(false);
    }
  };

  // Kullanıcı revizesi: makine kartı render mantığı hem "kendi çalıştığın
  // makine" (ana ekranda pinlenmiş) hem de kategori görünümündeki liste için
  // ORTAK — kod tekrarını önlemek adına tek fonksiyona çıkarıldı.
  const renderMachineCard = (m) => {
    const producedToday = m.lastProducedDateKey === dateKey;
    const ownerTriggeredToday = !producedToday && m.ownerTriggeredDateKey === dateKey;
    return (
      <div key={m.id} className={`factory-machine-card${producedToday ? ' produced' : ''}`}>
        <span className="factory-machine-emoji">{MACHINE_EMOJI[m.type]}</span>
        <span className="factory-machine-name">{MACHINE_LABELS[m.type]}</span>
        {ownerTriggeredToday && (
          <span className="factory-machine-status">
            ⏳ İşçi bugün gelmezse 00:00'da senin adına (2/10 verimle) üretilecek.
          </span>
        )}
        {m.workerId === myUid ? (
          <div className="factory-machine-self">
            <span className="factory-machine-status worker">
              👤 Sen çalışıyorsun
              {producedToday && ` · bugün ${m.lastProducedQty} adet`}
            </span>
            <div className="factory-machine-self-actions">
              <button
                className="factory-btn small"
                disabled={producedToday}
                onClick={() => setShowShiftGame(true)}
              >
                Üretim Yap
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
          <>
            <span className="factory-machine-status worker">
              👤 {m.workerName}
              {producedToday && ` · bugün ${m.lastProducedQty} adet`}
            </span>
            <WorkerActions m={m} machines={otherMachines} dateKey={dateKey} />
          </>
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
  };

  // v38: dolu (çalışanı olan) makineler üstte, boşlar altta
  const categoryMachines = activeCategory
    ? otherMachines.filter((m) => m.type === activeCategory).sort((a, b) => Number(Boolean(b.workerId)) - Number(Boolean(a.workerId)))
    : [];

  return (
    <div className="factory-owner-screen">
      <div className="factory-top-row">
        <button className="factory-nav-btn" onClick={() => setShowBrowse(true)}>
          ◀ Fabrikalar
        </button>
        <div className="factory-top-row-right">
          <button className="factory-nav-btn" onClick={() => setShowMagaza(true)}>
            🏬 Mağaza
          </button>
          <button className="factory-nav-btn primary" onClick={() => setShowBuy(true)}>
            Makine Al +
          </button>
        </div>
      </div>

      <div className="factory-owner-header">
        <div className="factory-owner-heading">
          <FactoryBadge logo={factory.logo} name={factoryDisplayName(factory)} size={40} />
          <p className="factory-owner-title">{factoryDisplayName(factory)}</p>
          <button type="button" className="factory-pen" onClick={() => setShowNameEdit(true)} aria-label="Fabrika adını ve logosunu değiştir">
            ✏️
          </button>
        </div>
        <div className="factory-owner-header-actions">
          <div className="factory-owner-header-actions-row">
            <button className="factory-manage-btn" onClick={() => setShowReport(true)}>
              📊 Günlük Rapor
            </button>
          </div>
          <button className="factory-manage-btn" onClick={() => setShowSponsor(true)}>
            🤝 Sponsor
          </button>
        </div>
      </div>
      <p className="factory-hint factory-salary-line">
        Maaş: <strong>{(factory.salary || 0).toLocaleString('tr-TR')} altın</strong>
        <button type="button" className="factory-pen small" onClick={() => setShowSalaryEdit(true)} aria-label="Maaşı değiştir">
          ✏️
        </button>
      </p>
      <div className="factory-hint factory-value-row">
        <span>
          Fabrika değeri:{' '}
          <strong>{computeFactoryValue(machines, prices.cryptoPrice).toLocaleString('tr-TR')} altın</strong>
        </span>
        <NotificationBell kind="factory" id={factory.id} unread={Boolean(factory.notifUnread)} />
      </div>

      <div className="factory-run-machines-row">
        <button
          className="factory-btn primary"
          disabled={runBusy || machines.length === 0 || machinesAlreadyRunToday}
          onClick={handleRunFactoryMachines}
        >
          {runBusy ? '…' : machinesAlreadyRunToday ? 'Bugün Çalıştırıldı' : 'Makineleri Çalıştır'}
        </button>
        <p className="factory-hint small">
          Bugün henüz çalışan bir işçisi olmayan makineleri sen çalıştırmış olursun (2/10 verimle);
          işçi gün içinde gelip üretirse işçinin üretimi geçerli olur.
        </p>
      </div>

      {activeCategory === null ? (
        <>
          <div className="factory-machine-grid">
            {machines.length === 0 && <p className="factory-hint">Henüz bir makinen yok.</p>}
            {miningMachines.length > 0 && (
              <div className={`factory-machine-card${miningAllTriggeredToday ? ' produced' : ''}`}>
                <span className="factory-machine-emoji">{MACHINE_EMOJI.mining}</span>
                <span className="factory-machine-name">
                  {MACHINE_LABELS.mining} ×{miningMachines.length}
                </span>
                <div className="factory-machine-self">
                  <span className="factory-machine-status">
                    {miningAllTriggeredToday
                      ? "✅ Üretim başladı — 00:00'da kripto bakiyene eklenecek."
                      : miningTriggeredCount > 0
                        ? `${miningTriggeredCount}/${miningMachines.length} için üretim başladı — "Makineleri Çalıştır" ile kalanları da başlat.`
                        : '"Makineleri Çalıştır" butonuyla üretimi başlatabilirsin.'}
                  </span>
                </div>
              </div>
            )}
            {myMachine && renderMachineCard(myMachine)}
          </div>

          {/* Kullanıcı revizesi: mining dışındaki 4 makine türü artık burada
              tek tek listelenmiyor, 2x2 kategori butonu olarak gösteriliyor —
              butona basınca o türün makineleri ve çalışanları görülüyor. */}
          <div className="factory-machine-category-grid">
            {MACHINE_CATEGORY_TYPES.map((type) => {
              const count = otherMachines.filter((m) => m.type === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  className="factory-machine-category-btn"
                  onClick={() => setActiveCategory(type)}
                >
                  <span className="factory-machine-category-count">{count} adet</span>
                  <span className="factory-machine-category-emoji">{MACHINE_EMOJI[type]}</span>
                  <span className="factory-machine-category-label">
                    {MACHINE_LABELS[type].replace(/ Makinesi$/, '')}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="factory-top-row">
            <button className="factory-nav-btn" onClick={() => setActiveCategory(null)}>
              ◀ Makineler
            </button>
            <p className="factory-section-title">
              {MACHINE_EMOJI[activeCategory]} {MACHINE_LABELS[activeCategory]}
            </p>
          </div>
          <div className="factory-machine-grid">
            {categoryMachines.length === 0 && (
              <p className="factory-hint">Bu kategoride hiç makinen yok.</p>
            )}
            {categoryMachines.map(renderMachineCard)}
          </div>
        </>
      )}
      {produceResult && (
        <p className="factory-result">
          {produceResult.isSelfEmployed
            ? `Üretim yapıldı: ${produceResult.qty.toLocaleString('tr-TR')} adet ürün stoğuna eklendi.`
            : `+${(produceResult.netSalary ?? produceResult.salary).toLocaleString('tr-TR')} altın maaş kazandın${produceResult.salaryTax ? ` (vergi: ${produceResult.salaryTax.toLocaleString('tr-TR')})` : ''}`}
        </p>
      )}
      {selfError && <p className="factory-error">{selfError}</p>}

      {showBuy && (
        <BuyMachineModal
          onClose={() => setShowBuy(false)}
          ownedMiningCount={machines.filter((m) => m.type === 'mining').length}
        />
      )}
      {showNameEdit && <FactoryNameModal factory={factory} onClose={() => setShowNameEdit(false)} />}
      {showSalaryEdit && <FactorySalaryModal factory={factory} onClose={() => setShowSalaryEdit(false)} />}
      {showBrowse && (
        <BrowseFactoriesModal onClose={() => setShowBrowse(false)} canJoin={false} myUid={factory.id} />
      )}
      {showMagaza && <MagazaOverlay onClose={() => setShowMagaza(false)} />}
      {showReport && <DailyReportModal factory={factory} onClose={() => setShowReport(false)} />}
      {showSponsor && <FactorySponsorModal onClose={() => setShowSponsor(false)} />}
      {showShiftGame && (
        <FactoryMiniGame
          onComplete={handleShiftGameComplete}
          onClose={() => setShowShiftGame(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Günlük Rapor — yeni istek: "fabrika sahipleri için yönetim panelinin
// yanında günlük rapor olsun, bu raporda günlük makinelerden ne kadar
// kazandık, kâr ne kadar, masraf ne kadar hepsi raporlansın". Rakamlar
// dailyReset'in -0.35 bloğunda her gece hesaplanıp factories/{ownerId}
// dokümanına yazılıyor (bkz. functions/index.js): dailyGrossIncome (dün
// makinelerin ürettiği malın toplam anlık nakit değeri), dailySalaryExpense
// (dün çalışan işçilere ödenen toplam maaş) ve dailyIncome (net kâr =
// brüt − maaş masrafı, kasıtlı olarak eksi de olabilir). Son 10 günün
// geçmişi (*History dizileri) de aynı yerde persist ediliyor, burada basit
// bir tablo olarak gösteriliyor.
//
// Kullanıcı revizesi: "hisse pay giderleri ve sponsorluk giderleri de
// cirodan düşülecek ve kâr hesaplanırken etken olacak, kâr en altta
// yazacak, masraflar ve kazançlar kâr'ın üstünde". dailyIncome artık
// backend'de (bkz. functions/index.js dailyReset Part A + dividend bloğu +
// processFutbolSponsorshipsNightly) grossIncome - salaryPaid -
// electricityBill - shareDividendExpense - sponsorshipExpense olarak
// hesaplanıyor — burada AYRICA bir hesap YAPILMIYOR, sadece factory.dailyIncome
// doğrudan okunuyor. Panelin sırası da buna göre: TÜM gelir/gider kalemleri
// üstte, "Net kâr" en altta gösteriliyor.
// ---------------------------------------------------------------------------
function DailyReportModal({ factory, onClose }) {
  const grossToday = factory.dailyGrossIncome || 0;
  const expenseToday = factory.dailySalaryExpense || 0;
  const netToday = factory.dailyIncome || 0;
  // electricityToday — elektrik faturası artık "Net kâr" formülüne DAHİL
  // (bkz. functions/index.js dailyReset Part A.5: dailyIncome = gross -
  // salaryPaid - electricityBill). Yine de ayrı bir kalem olarak da
  // gösteriliyor ki sahip kârın neye gittiğini görebilsin.
  const electricityToday = factory.dailyElectricityExpense || 0;
  // v87 — vergi: günlük brüt kazanca göre kademeli (%1 / %10 / %20 / %40; net kâra dahil)
  const taxToday = factory.dailyTaxExpense || 0;
  // v127: dilim oranı belediyenin — gösterilen oran gerçekten kesilen vergiden
  const rates = useBelediyeRates();
  const taxRatePct = grossToday > 0 && taxToday > 0 ? Math.round((taxToday / grossToday) * 100) : Math.round(factoryTaxRate(grossToday, rates) * 100);
  // Yeni kalemler — sadece "varsa" (0'dan büyükse) gösterilir: hisse satışı
  // geliri, hisse kâr payı gideri, sponsorluk gideri (bkz. functions/index.js
  // dailyReset — Part A + dividend bloğu + processFutbolSponsorshipsNightly).
  // Kullanıcı revizesi: hisse pay (temettü) gideri VE sponsorluk gideri de
  // artık netToday'e (factory.dailyIncome) DAHİL — hisse satışı geliri
  // hâlâ HARİÇ (peşin/tek seferlik bir bedel olduğu için üretim kâr/zarar
  // hesabını bozmasın diye, bkz. functions/index.js'teki ilgili not).
  const shareSaleIncomeToday = factory.dailyShareSaleIncome || 0;
  const shareDividendExpenseToday = factory.dailyShareDividendExpense || 0;
  const sponsorshipExpenseToday = factory.dailySponsorshipExpense || 0;
  const grossHistory = Array.isArray(factory.dailyGrossIncomeHistory) ? factory.dailyGrossIncomeHistory : [];
  const expenseHistory = Array.isArray(factory.dailySalaryExpenseHistory) ? factory.dailySalaryExpenseHistory : [];
  const electricityHistory = Array.isArray(factory.dailyElectricityExpenseHistory)
    ? factory.dailyElectricityExpenseHistory
    : [];
  const netHistory = Array.isArray(factory.dailyIncomeHistory) ? factory.dailyIncomeHistory : [];
  const taxHistory = Array.isArray(factory.dailyTaxExpenseHistory) ? factory.dailyTaxExpenseHistory : [];
  const rowCount = Math.max(grossHistory.length, expenseHistory.length, electricityHistory.length, netHistory.length);
  // Tabloyu en yeni gün en üstte olacak şekilde göster.
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const idx = rowCount - 1 - i;
    return {
      key: idx,
      gross: grossHistory[idx] ?? null,
      expense: expenseHistory[idx] ?? null,
      electricity: electricityHistory[idx] ?? null,
      // vergi geçmişi yeni; eski günler için hizalanır (sondan)
      tax: taxHistory[idx - (rowCount - taxHistory.length)] ?? 0,
      net: netHistory[idx] ?? null,
    };
  });

  // Yeni istek: "günlük raporda kaç adet hangi malzemeden üretildiği de
  // yazsın" — dailyProducedByType, { [makineTürü]: adet } şeklinde.
  const producedByType = factory.dailyProducedByType || {};
  const producedEntries = Object.entries(producedByType).filter(([, qty]) => qty > 0);

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">📊 Günlük Rapor</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="factory-step-label">
          Dün {factory.dailyIncomeDateKey ? `(${factory.dailyIncomeDateKey})` : ''}
        </p>
        <div className="factory-report-summary">
          <div className="factory-report-stat">
            <span className="factory-report-stat-label">💰 Kazanç (brüt)</span>
            <span className="factory-report-stat-value">{grossToday.toLocaleString('tr-TR')} altın</span>
          </div>
          {shareSaleIncomeToday > 0 && (
            <div className="factory-report-stat">
              <span className="factory-report-stat-label">🧾 Hisse satışı geliri</span>
              <span className="factory-report-stat-value positive">
                +{shareSaleIncomeToday.toLocaleString('tr-TR')} altın
              </span>
            </div>
          )}
          <div className="factory-report-stat">
            <span className="factory-report-stat-label">👷 Maaş masrafı</span>
            <span className="factory-report-stat-value expense">
              −{expenseToday.toLocaleString('tr-TR')} altın
            </span>
          </div>
          <div className="factory-report-stat">
            <span className="factory-report-stat-label">⚡ Elektrik faturası</span>
            <span className="factory-report-stat-value expense">
              −{electricityToday.toLocaleString('tr-TR')} altın
            </span>
          </div>
          <div className="factory-report-stat">
            <span className="factory-report-stat-label" title={`Günlük brüt gelire göre: 100.000'e kadar %${rates.f1} · 1 milyona kadar %${rates.f2} · 10 milyona kadar %${rates.f3} · üzeri %${rates.f4}`}>
              🏛️ Vergi (%{taxRatePct})
            </span>
            <span className="factory-report-stat-value expense">
              −{taxToday.toLocaleString('tr-TR')} altın
            </span>
          </div>
          {shareDividendExpenseToday > 0 && (
            <div className="factory-report-stat">
              <span className="factory-report-stat-label">🪙 Hisse pay giderleri</span>
              <span className="factory-report-stat-value expense">
                −{shareDividendExpenseToday.toLocaleString('tr-TR')} altın
              </span>
            </div>
          )}
          {sponsorshipExpenseToday > 0 && (
            <div className="factory-report-stat">
              <span className="factory-report-stat-label">🤝 Sponsorluk giderleri</span>
              <span className="factory-report-stat-value expense">
                −{sponsorshipExpenseToday.toLocaleString('tr-TR')} altın
              </span>
            </div>
          )}
          <div className="factory-report-stat factory-report-stat-profit">
            <span className="factory-report-stat-label">📈 Net kâr</span>
            <span className={`factory-report-stat-value ${netToday < 0 ? 'negative' : 'positive'}`}>
              {netToday.toLocaleString('tr-TR')} altın
            </span>
          </div>
        </div>

        <p className="factory-step-label">Dün Üretilen Malzemeler</p>
        {producedEntries.length === 0 && <p className="factory-hint">Dün hiç üretim yapılmadı.</p>}
        {producedEntries.length > 0 && (
          <div className="factory-report-materials">
            {producedEntries.map(([type, qty]) => (
              <div key={type} className="factory-report-material-row">
                <span className="factory-report-material-name">
                  {MACHINE_EMOJI[type] || '📦'} {MACHINE_LABELS[type] || type}
                </span>
                <span className="factory-report-material-qty">{qty.toLocaleString('tr-TR')} adet</span>
              </div>
            ))}
          </div>
        )}

        <p className="factory-step-label">Son {rows.length} Gün</p>
        {rows.length === 0 && <p className="factory-hint">Henüz rapor geçmişi yok.</p>}
        {rows.length > 0 && (
          <div className="factory-report-table">
            <div className="factory-report-row factory-report-row-head factory-report-row-5col">
              <span>Kazanç</span>
              <span>Maaş</span>
              <span>Elektrik</span>
              <span>Vergi</span>
              <span>Net</span>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="factory-report-row factory-report-row-5col">
                <span>{(r.gross ?? 0).toLocaleString('tr-TR')}</span>
                <span>−{(r.expense ?? 0).toLocaleString('tr-TR')}</span>
                <span>−{(r.electricity ?? 0).toLocaleString('tr-TR')}</span>
                <span>−{(r.tax ?? 0).toLocaleString('tr-TR')}</span>
                <span className={(r.net ?? 0) < 0 ? 'negative' : 'positive'}>
                  {(r.net ?? 0).toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// İşçi ekranı
// ---------------------------------------------------------------------------
function WorkerView({ player, myUid }) {
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [resignBusy, setResignBusy] = useState(false);
  const [showCreateFactory, setShowCreateFactory] = useState(false);
  // Yeni istek: "fabrika işçileri için yeni özellik, basit bi oyun görevi
  // ekleyeceğiz, oyuncu fabrikaya girdiğinde 'üretim yap' butonu yerine bu
  // oyunla karşılaşacak ve bu mini oyunu tamamladığında üretimi yapmış
  // sayılıp maaşını alabilecek." — "Üretim Yap" artık DOĞRUDAN sunucuyu
  // çağırmıyor, önce FactoryMiniGame'i açıyor (3 mini oyundan biri rastgele
  // seçilir); sunucu çağrısı (produceAtFactory) SADECE seçilen oyun
  // tamamlanınca yapılır (bkz. handleShiftGameComplete).
  const [showShiftGame, setShowShiftGame] = useState(false);

  const employment = player.employment;
  const { factory: employerFactory } = useEmployerFactory(employment?.factoryId);
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now()));
  const producedToday = player.employmentProducedDateKey === dateKey;

  // handleShiftGameComplete — FactoryShiftGame'e `onComplete` olarak
  // geçiriliyor: oyun 10/10 kasa yakalanınca çağrılır, gerçek sunucu
  // işlemini (produceAtFactory) yapar ve sonucu (maaş) modale döner —
  // hata olursa modal kendi hata ekranını gösterir (throw edilir).
  const handleShiftGameComplete = async () => {
    setError(null);
    const res = await produceAtFactory();
    setResult(res.data);
    return res.data;
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
          <div className="factory-job-employer-row">
            {employerFactory && (
              <FactoryBadge logo={employerFactory.logo} name={factoryDisplayName(employerFactory)} size={28} />
            )}
            <span className="factory-job-employer">
              {employerFactory ? factoryDisplayName(employerFactory) : '…'}
            </span>
          </div>
        </div>
        <button className="factory-produce-btn" disabled={producedToday} onClick={() => setShowShiftGame(true)}>
          Üretim Yap
        </button>
        {producedToday && (
          <p className="factory-produced-warning">
            Bugün zaten üretim yaptın. 00:00'dan sonra tekrar üretim yapabilirsin.
          </p>
        )}
        {result && (
          <p className="factory-result">
            +{(result.netSalary ?? result.salary).toLocaleString('tr-TR')} altın maaş kazandın{result.salaryTax ? ` (vergi: ${result.salaryTax.toLocaleString('tr-TR')})` : ''}
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
      {showShiftGame && (
        <FactoryMiniGame
          onComplete={handleShiftGameComplete}
          onClose={() => setShowShiftGame(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fabrika seçmemiş/çalışmayan oyuncu — gezinme ekranı
// ---------------------------------------------------------------------------
function BrowseView({ myUid }) {
  const { factories: allFactories } = useOpenFactories();
  const { prices } = useInvestmentPrices();
  // v57: değere göre sıralı; 30 gündür hareketsiz fabrikalar gizli (kendi fabrikan hep görünür)
  const factories = rankFactoriesForList(allFactories, prices.cryptoPrice, { keepIds: [myUid] });
  // v124: hisse satışı kaldırıldı — "📈 Hisseler" butonu gösterilmez, ilanlar okunmaz
  const byFactoryId = NO_LISTED_SHARES;
  const shareError = null;
  const [showCreate, setShowCreate] = useState(false);
  const [joinBusy, setJoinBusy] = useState(null);
  const [error, setError] = useState(null);
  const [shareBuyFactory, setShareBuyFactory] = useState(null);

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

      {factories.length === 0 && (
            <p className="factory-hint">
              {allFactories.length === 0 ? 'Henüz kurulmuş bir fabrika yok.' : 'Şu an listede aktif fabrika yok.'}
            </p>
          )}
      <div className="factory-browse-list">
        {factories.map((f) => (
          <div key={f.id} className="factory-browse-card">
            <div className="factory-browse-top">
              <div className="factory-browse-owner-row">
                <FactoryBadge logo={f.logo} name={factoryDisplayName(f)} size={32} />
                <span className="factory-browse-owner">{factoryDisplayName(f)}</span>
              </div>
              <span className="factory-browse-salary">
                Maaş: {(f.salary || 0).toLocaleString('tr-TR')} altın
              </span>
            </div>
            <p className="factory-browse-value">
              Fabrika değeri:{' '}
              <strong>{f.value.toLocaleString('tr-TR')} altın</strong>
            </p>
            <p className="factory-browse-meta">
              {f.machineCount} makine ·{' '}
              {f.openSlots > 0 ? (
                <strong className="factory-browse-open">{f.openSlots} işçi aranıyor</strong>
              ) : (
                'boş yer yok'
              )}
            </p>
            {(f.id !== myUid && f.openSlots > 0) || (f.id !== myUid && byFactoryId[f.id]?.length > 0) ? (
              <div className="factory-browse-join-row">
                {f.id !== myUid && f.openSlots > 0 && (
                  <button
                    className="factory-btn primary small"
                    disabled={joinBusy === f.id}
                    onClick={() => handleJoin(f.id)}
                  >
                    {joinBusy === f.id ? '…' : 'İşe Gir'}
                  </button>
                )}
                {f.id !== myUid && byFactoryId[f.id]?.length > 0 && (
                  <button className="factory-btn small" onClick={() => setShareBuyFactory(f)}>
                    📈 Hisseler
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {shareError && (
        <p className="factory-hint small factory-share-error-hint">
          ⚠️ Hisse verileri şu an yüklenemedi. Firestore indekslerinin deploy edildiğinden emin ol
          (firebase deploy --only firestore:indexes) ve tekrar dene.
        </p>
      )}
      {error && <p className="factory-error">{error}</p>}

      {showCreate && <CreateFactoryModal onClose={() => setShowCreate(false)} />}
      {shareBuyFactory && (
        <FactoryShareBuyModal
          factory={shareBuyFactory}
          shares={byFactoryId[shareBuyFactory.id]}
          onClose={() => setShareBuyFactory(null)}
        />
      )}
    </div>
  );
}

export default function FactoryScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { factory, machines } = useMyFactory();
  // v38: yasaklı madde makinesi göçü (sunucuda idempotent; bir kez çalışır)
  useEffect(() => {
    if (user) ensureFactoryMigrationsV38().catch(() => {});
  }, [user]);

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
