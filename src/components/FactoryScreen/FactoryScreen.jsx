// =============================================================================
// v196 — FABRİKA (yönetim paneli; şehirdeki fabrika bölgesinin üstteki düğmesi)
//   • İşçi, maaş, malzeme makinesi, fabrika mağazası ve fabrika hissesi YOK.
//   • Fabrikaların ürettiği tek şey kripto ve elmas: üretim doğrudan bankaya.
//   • Kurulum: 100.000 + 2 kripto (mining) + 2 elmas makinesi (+ makine vergileri).
//   • Elmas makinesi: (20 + 2 × ⌊sahip olunan/10⌋) × elmas fiyatı · kripto: (2 + 0,2 × ⌊n/10⌋) × kripto fiyatı.
//   • "Çalış" butonu bu ekranda değil: şehirde fabrikaya girince alt ortada (FactoryWorkButton).
// =============================================================================
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useMyFactory } from '../../hooks/useMyFactory';
import { useOpenFactories } from '../../hooks/useOpenFactories';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { createFactory, buyFactoryMachine, runFactoryMachines, setFactoryName } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import FactoryBadge from './FactoryBadge';
import FactoryLogoDesigner from './FactoryLogoDesigner';
import FactorySponsorModal from './FactorySponsorModal';
import NotificationBell from '../NotificationBell/NotificationBell';
import { factoryDisplayName } from './factoryHelpers';
import { withMachineTax } from '../../../functions/tax.js';
import { diamondMachinePriceOf, diamondFleetValueOf, FACTORY_STARTER_V196 } from '../../../functions/v196Shared.js';
import './FactoryScreen.css';

const FACTORY_CREATE_COST = 100000;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
export const miningPriceOf = (owned, cryptoPrice) => Math.ceil((2 + 0.2 * Math.floor((owned || 0) / 10)) * (cryptoPrice || 0));
const miningFleetValue = (n, c) => {
  let t = 0;
  for (let i = 0; i < n; i++) t += miningPriceOf(i, c);
  return t;
};
export function starterCost(prices, rates) {
  let t = FACTORY_CREATE_COST;
  for (let i = 0; i < FACTORY_STARTER_V196.mining; i++) t += withMachineTax(miningPriceOf(i, prices.cryptoPrice), 'mining', rates);
  for (let i = 0; i < FACTORY_STARTER_V196.elmas; i++) t += withMachineTax(diamondMachinePriceOf(i, prices.diamondPrice), 'elmas', rates);
  return t;
}
const errText = (e) => e?.message || 'Olmadı, tekrar dene.';

function CreateCard({ gold }) {
  const prices = useInvestmentPrices().prices;
  const rates = useBelediyeRates();
  const cost = starterCost(prices, rates);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <div className="factory-machine-buy-card">
      <div className="factory-machine-buy-title">🏭 Fabrika kur</div>
      <div className="fv-row"><span>Kuruluş</span><b>{fmt(FACTORY_CREATE_COST)}</b></div>
      <div className="fv-row"><span>⛏️ 2 kripto makinesi</span><b>{fmt(withMachineTax(miningPriceOf(0, prices.cryptoPrice), 'mining', rates) + withMachineTax(miningPriceOf(1, prices.cryptoPrice), 'mining', rates))}</b></div>
      <div className="fv-row"><span>💎 2 elmas makinesi</span><b>{fmt(withMachineTax(diamondMachinePriceOf(0, prices.diamondPrice), 'elmas', rates) + withMachineTax(diamondMachinePriceOf(1, prices.diamondPrice), 'elmas', rates))}</b></div>
      <div className="fv-row"><span>Toplam (vergi dahil)</span><b>{fmt(cost)} altın</b></div>
      <p className="factory-hint">Makineler her gün çalıştırılır. Üretim gece 00:00'da doğrudan bankaya düşer.</p>
      {err && <p className="factory-error">{err}</p>}
      <button
        className="factory-btn primary"
        disabled={busy || gold < cost}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await createFactory(cost);
          } catch (e) {
            setErr(errText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {gold < cost ? 'Yetersiz altın' : busy ? 'Kuruluyor…' : 'Kur'}
      </button>
    </div>
  );
}

function OwnerView({ factory, machines, gold }) {
  const prices = useInvestmentPrices().prices;
  const rates = useBelediyeRates();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [rename, setRename] = useState(null);
  const [logo, setLogo] = useState(false);
  const [sponsor, setSponsor] = useState(false);
  const mining = machines.filter((m) => m.type === 'mining');
  const dm = Math.max(0, Math.floor(Number(factory.dm?.n) || 0));
  const day = today();
  const ranToday = (mining.length === 0 || mining.every((m) => m.miningTriggeredDateKey === day)) && (dm === 0 || factory.dm?.trig === day);
  const minPrice = withMachineTax(miningPriceOf(mining.length, prices.cryptoPrice), 'mining', rates);
  const dmPrice = withMachineTax(diamondMachinePriceOf(dm, prices.diamondPrice), 'elmas', rates);
  const value = FACTORY_CREATE_COST + miningFleetValue(mining.length, prices.cryptoPrice) + diamondFleetValueOf(dm, prices.diamondPrice);
  const run = async (key, fn) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(r);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(null);
    }
  };
  if (logo) return <FactoryLogoDesigner factory={factory} onClose={() => setLogo(false)} />;
  return (
    <div>
      <div className="factory-top-row">
        <button className="factory-btn small" onClick={() => setLogo(true)} title="Logo"><FactoryBadge logo={factory.logo} name={factoryDisplayName(factory)} size={44} /></button>
        <b style={{ flex: 1, fontSize: 18 }}>{factoryDisplayName(factory)}</b>
        <button className="factory-btn small" onClick={() => setRename(factory.name || '')}>✏️</button>
        <NotificationBell kind="factory" id={factory.id} unread={Boolean(factory.notifUnread)} />
      </div>
      {rename != null && (
        <div className="factory-top-row">
          <input className="hh-input" value={rename} maxLength={30} onChange={(e) => setRename(e.target.value)} />
          <button className="factory-btn primary small" onClick={() => run('name', async () => { await setFactoryName(rename); setRename(null); return '✅ Ad değişti.'; })}>Kaydet</button>
        </div>
      )}
      <div className="fv-stats">
        <div className="fv-stat"><b>{fmt(value)}</b><span>Fabrika değeri</span></div>
        <div className="fv-stat"><b>{fmt(factory.dailyIncomeAvg10 || 0)}</b><span>10 günlük ortalama gelir</span></div>
      </div>
      <div className="fv-machines">
        <div className="fv-machine">
          <div className="em">⛏️</div>
          <div className="n">{mining.length}</div>
          <div className="lb">Kripto makinesi</div>
          <button className="factory-btn primary small" disabled={busy || gold < minPrice} onClick={() => run('min', async () => { await buyFactoryMachine('mining', minPrice); return '⛏️ Kripto makinesi alındı.'; })}>
            + {fmt(minPrice)}
          </button>
        </div>
        <div className="fv-machine">
          <div className="em">💎</div>
          <div className="n">{dm}</div>
          <div className="lb">Elmas makinesi</div>
          <button className="factory-btn primary small" disabled={busy || gold < dmPrice} onClick={() => run('dm', async () => { await buyFactoryMachine('elmas', dmPrice); return '💎 Elmas makinesi alındı.'; })}>
            + {fmt(dmPrice)}
          </button>
        </div>
      </div>
      <button className="factory-btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy || ranToday} onClick={() => run('run', async () => { await runFactoryMachines(); return '⚙️ Makineler çalışıyor. Üretim 00:00\'da bankada.'; })}>
        {ranToday ? '✅ Makineler bugün çalışıyor' : '⚙️ Makineleri çalıştır'}
      </button>
      <p className="factory-hint">Elektrik: üretim değerinin %30'u. Fiyat yükseldikçe verim düşer.</p>
      <button className="factory-btn small" onClick={() => setSponsor(true)}>⚽ Kulüp sponsorluğu</button>
      {sponsor && <FactorySponsorModal onClose={() => setSponsor(false)} />}
      {(factory.dailyIncomeDateKey || factory.dailyElectricityExpense != null) && (
        <div className="factory-machine-buy-card">
          <div className="factory-section-title">📋 Dünkü rapor</div>
          <div className="fv-row"><span>Net kâr</span><b>{fmt(factory.dailyIncome || 0)}</b></div>
          <div className="fv-row"><span>Elektrik</span><b>{fmt(factory.dailyElectricityExpense || 0)}</b></div>
          <div className="fv-row"><span>Vergi</span><b>{fmt(factory.dailyTaxExpense || 0)}</b></div>
        </div>
      )}
      {msg && <p className={typeof msg === 'string' && /^[✅⛏️💎⚙️]/u.test(msg) ? 'factory-hint' : 'factory-error'}>{msg}</p>}
    </div>
  );
}

function FactoriesList() {
  const { factories, loading } = useOpenFactories();
  return (
    <div className="factory-browse-list">
      <div className="factory-section-title">🏭 Fabrikalar</div>
      {loading && <p className="factory-hint">Yükleniyor…</p>}
      {!loading && !factories.length && <p className="factory-hint">Kazanan fabrika yok. İlk sen ol.</p>}
      {factories.map((f, i) => (
        <div key={f.id} className="factory-browse-card">
          <div className="factory-browse-top">
            <FactoryBadge logo={f.logo} name={factoryDisplayName(f)} size={34} />
            <div className="factory-browse-owner-row">
              <b>{i + 1}. {factoryDisplayName(f)}</b>
              <span className="factory-browse-owner">{f.ownerName || 'Oyuncu'}</span>
            </div>
          </div>
          <div className="factory-browse-meta">Ortalama gelir: <b>{fmt(f.dailyIncomeAvg10)}</b> altın/gün · 💎 {fmt(f.dm?.n || 0)} elmas makinesi</div>
        </div>
      ))}
    </div>
  );
}

export default function FactoryScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { factory, machines } = useMyFactory();
  const [tab, setTab] = useState('mine');
  if (!user) return <SignInPrompt message="Fabrikaya girmek için giriş yapmalısın." />;
  if (!player) return null;
  const gold = Number(player.gold || 0);
  return (
    <div className="factory-screen">
      <div className="factory-top-row">
        <button className={`factory-nav-btn${tab === 'mine' ? ' primary' : ''}`} onClick={() => setTab('mine')}>Fabrikam</button>
        <button className={`factory-nav-btn${tab === 'list' ? ' primary' : ''}`} onClick={() => setTab('list')}>Fabrikalar</button>
      </div>
      {tab === 'list' ? <FactoriesList /> : factory ? <OwnerView factory={factory} machines={machines} gold={gold} /> : <CreateCard gold={gold} />}
    </div>
  );
}
