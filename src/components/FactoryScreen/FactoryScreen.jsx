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
import { withMachineTax, machineTax } from '../../../functions/tax.js';
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
  const minCost = withMachineTax(miningPriceOf(0, prices.cryptoPrice), 'mining', rates) + withMachineTax(miningPriceOf(1, prices.cryptoPrice), 'mining', rates);
  const dmCost = withMachineTax(diamondMachinePriceOf(0, prices.diamondPrice), 'elmas', rates) + withMachineTax(diamondMachinePriceOf(1, prices.diamondPrice), 'elmas', rates);
  // v197: makine fiyatlarındaki belediye vergisi ayrıca yazılır
  const minTax = machineTax(miningPriceOf(0, prices.cryptoPrice), 'mining', rates) + machineTax(miningPriceOf(1, prices.cryptoPrice), 'mining', rates);
  const dmTax = machineTax(diamondMachinePriceOf(0, prices.diamondPrice), 'elmas', rates) + machineTax(diamondMachinePriceOf(1, prices.diamondPrice), 'elmas', rates);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <div className="fx-create">
      <div className="fx-hero">
        <span className="fx-hero-ic">🏭</span>
        <b>Fabrikanı kur</b>
        <small>Baca senin, kâr senin.</small>
      </div>
      <div className="fx-kit">
        <div><i>🏗️</i><b>Kuruluş</b><span>{fmt(FACTORY_CREATE_COST)}</span></div>
        <div><i>⛏️</i><b>2 kripto makinesi</b><span>{fmt(minCost)}<small className="fx-tax">vergi dahil · vergi {fmt(minTax)}</small></span></div>
        <div><i>💎</i><b>2 elmas makinesi</b><span>{fmt(dmCost)}<small className="fx-tax">vergi dahil · vergi {fmt(dmTax)}</small></span></div>
        <div className="fx-kit-tax"><i>🏛️</i><b>Toplam vergi (belediye)</b><span>{fmt(minTax + dmTax)}</span></div>
      </div>
      <button
        className="fx-cta"
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
        {busy ? 'Kuruluyor…' : gold < cost ? `Yetersiz altın · ${fmt(cost)}` : `Kur · ${fmt(cost)} altın`}
      </button>
      {err && <p className="factory-error">{err}</p>}
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
  const [report, setReport] = useState(false);
  const mining = machines.filter((m) => m.type === 'mining');
  const dm = Math.max(0, Math.floor(Number(factory.dm?.n) || 0));
  const day = today();
  const ranToday = (mining.length === 0 || mining.every((m) => m.miningTriggeredDateKey === day)) && (dm === 0 || factory.dm?.trig === day);
  const minPrice = withMachineTax(miningPriceOf(mining.length, prices.cryptoPrice), 'mining', rates);
  const dmPrice = withMachineTax(diamondMachinePriceOf(dm, prices.diamondPrice), 'elmas', rates);
  const minTaxV = machineTax(miningPriceOf(mining.length, prices.cryptoPrice), 'mining', rates);
  const dmTaxV = machineTax(diamondMachinePriceOf(dm, prices.diamondPrice), 'elmas', rates);
  const gross = factory.dailyGrossIncome != null ? Number(factory.dailyGrossIncome) || 0 : (factory.dailyIncome || 0) + (factory.dailyElectricityExpense || 0) + (factory.dailyTaxExpense || 0);
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
        <b className="fx-name">{factoryDisplayName(factory)}</b>
        <button className={`factory-btn small${rename != null ? ' primary' : ''}`} onClick={() => setRename((r) => (r == null ? factory.name || '' : null))}>✏️</button>
        <NotificationBell kind="factory" id={factory.id} unread={Boolean(factory.notifUnread)} />
      </div>
      {rename != null && (
        <div className="factory-top-row">
          <input className="hh-input" value={rename} maxLength={30} onChange={(e) => setRename(e.target.value)} />
          <button className="factory-btn primary small" onClick={() => run('name', async () => { await setFactoryName(rename); setRename(null); return '✅ Ad değişti.'; })}>Kaydet</button>
        </div>
      )}
      <div className="fv-stats">
        <div className="fv-stat"><b>{fmt(value)}</b><span>Değer</span></div>
        <div className="fv-stat"><b>{fmt(factory.dailyIncomeAvg10 || 0)}</b><span>Ort. gelir / gün</span></div>
      </div>
      <div className="fv-machines">
        <div className="fv-machine">
          <div className="em">⛏️</div>
          <div className="n">{mining.length}</div>
          <div className="lb">Kripto</div>
          <button className="factory-btn primary small" disabled={busy || gold < minPrice} onClick={() => run('min', async () => { await buyFactoryMachine('mining', minPrice); return '⛏️ Kripto makinesi alındı.'; })}>
            + {fmt(minPrice)}
          </button>
          <div className="fx-tax">vergi dahil · vergi {fmt(minTaxV)}</div>
        </div>
        <div className="fv-machine">
          <div className="em">💎</div>
          <div className="n">{dm}</div>
          <div className="lb">Elmas</div>
          <button className="factory-btn primary small" disabled={busy || gold < dmPrice} onClick={() => run('dm', async () => { await buyFactoryMachine('elmas', dmPrice); return '💎 Elmas makinesi alındı.'; })}>
            + {fmt(dmPrice)}
          </button>
          <div className="fx-tax">vergi dahil · vergi {fmt(dmTaxV)}</div>
        </div>
      </div>
      <button className="factory-btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy || ranToday} onClick={() => run('run', async () => { await runFactoryMachines(); return '⚙️ Makineler çalışıyor. Üretim 00:00\'da bankada.'; })}>
        {ranToday ? '✅ Makineler bugün çalışıyor' : '⚙️ Makineleri çalıştır'}
      </button>
      <div className="fx-rep">
        <button className="fx-rep-head" onClick={() => setReport((v) => !v)}>
          <span>📋 Günlük rapor</span>
          <b className={(factory.dailyIncome || 0) < 0 ? 'neg' : ''}>{fmt(factory.dailyIncome || 0)}</b>
          <i>{report ? '▴' : '▾'}</i>
        </button>
        {report && (
          <div className="fx-rep-body">
            <div className="fv-row"><span>Toplam ciro</span><b>{fmt(gross)}</b></div>
            <div className="fv-row"><span>Elektrik</span><b>−{fmt(factory.dailyElectricityExpense || 0)}</b></div>
            <div className="fv-row"><span>Vergi</span><b>−{fmt(factory.dailyTaxExpense || 0)}</b></div>
          </div>
        )}
      </div>
      <button className="factory-btn small fx-sponsor" onClick={() => setSponsor(true)}>⚽ Kulüp sponsorluğu</button>
      {sponsor && <FactorySponsorModal onClose={() => setSponsor(false)} />}
      {msg && <p className={typeof msg === 'string' && /^[✅⛏️💎⚙️]/u.test(msg) ? 'factory-hint' : 'factory-error'}>{msg}</p>}
    </div>
  );
}

// v199 — Fabrikalar: sıralama tablosu (ilk 3 madalyalı, gelir sağda belirgin)
function FactoriesList() {
  const { factories, loading } = useOpenFactories();
  const top = Math.max(1, ...factories.map((f) => Number(f.dailyIncomeAvg10) || 0));
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div className="fx-lb">
      <div className="fx-lb-head">
        <span>🏭 Fabrikalar</span>
        <small>günlük ort. gelir</small>
      </div>
      {loading && <p className="factory-hint">Yükleniyor…</p>}
      {!loading && !factories.length && <p className="factory-hint">Henüz kazanan fabrika yok.</p>}
      {factories.map((f, i) => {
        const inc = Number(f.dailyIncomeAvg10) || 0;
        return (
          <div key={f.id} className={`fx-lb-row${i < 3 ? ` top top${i + 1}` : ''}`}>
            <div className="fx-lb-rank">{i < 3 ? medal[i] : i + 1}</div>
            <FactoryBadge logo={f.logo} name={factoryDisplayName(f)} size={i < 3 ? 42 : 36} />
            <div className="fx-lb-name">
              <b>{factoryDisplayName(f)}</b>
              <span>👤 {f.ownerName || 'Oyuncu'}</span>
              <i className="fx-lb-bar"><em style={{ width: `${Math.max(4, Math.round((inc / top) * 100))}%` }} /></i>
            </div>
            <div className="fx-lb-inc">
              <b>{fmt(inc)}</b>
              <small>🪙 / gün</small>
            </div>
          </div>
        );
      })}
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
