import { useCallback, useEffect, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { getCreditInfo, repayCredit, repayVehicleLoan, takeCredit } from '../../services/gameActions';
import { vehicleDisplayName } from '../VehicleCard/VehicleCard';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import './CreditSection.css';

// v67 — Banka › Krediler: kredi puanı sistemi.
// Kredi puanın = %20 × (araç + silah + malzeme anında satış değeri + fabrika
// değeri + futbol takımının değeri). Aynı anda tek kredi; 10 gün, %20 faiz.
// Asıl hesap sunucuda (functions/index.js computeCreditScore).
const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('tr-TR');
const PARTS = [
  { key: 'vehicles', icon: '🚗', label: 'Araçlar' },
  { key: 'weapons', icon: '🔫', label: 'Silahlar' },
  { key: 'materials', icon: '📦', label: 'Malzemeler' },
  { key: 'factory', icon: '🏭', label: 'Fabrika' },
  { key: 'team', icon: '⚽', label: 'Futbol takımı' },
];

function timeLeft(ms) {
  if (ms <= 0) return 'süre doldu';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d} gün ${h} sa`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} sa ${m} dk`;
}

export default function CreditSection() {
  const { player } = usePlayer();
  const { vehicles } = useVehicles();
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [amount, setAmount] = useState(0);
  const [repay, setRepay] = useState(0);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [legacyRepay, setLegacyRepay] = useState({});

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await getCreditInfo();
      setInfo(r.data);
    } catch (err) {
      setLoadErr(err?.message || 'Kredi bilgisi alınamadı.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const gold = Math.floor(Number(player?.gold || 0));
  const credit = player?.credit || null; // canlı (users/{uid}.credit)
  const legacy = vehicles.filter((v) => v.mortgaged);

  const run = async (key, fn, ok) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: typeof ok === 'function' ? ok(r?.data) : ok });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err?.message || 'İşlem başarısız.' });
    } finally {
      setBusy(null);
    }
  };

  const limit = info?.limit || 0;
  const interest = info?.interest ?? 0.2;
  const termDays = info?.termDays ?? 10;
  const minAmount = info?.minAmount ?? 1000;
  const owed = Math.round(amount * (1 + interest));
  const blockedReason = credit
    ? null
    : legacy.length
      ? 'Önce araç kredini kapatmalısın — aynı anda tek kredi olabilir.'
      : limit < minAmount
          ? `Kredi çekmek için kredi puanın en az ${fmt(minAmount)} olmalı.`
          : null;

  return (
    <div className="cr">
      {/* Kredi puanı kartı */}
      <div className="cr-score">
        <div className="cr-score-top">
          <span className="cr-score-label">Kredi Puanın</span>
          <span className="cr-score-value">{info ? fmt(limit) : '…'}</span>
          <span className="cr-score-unit">altına kadar kredi çekebilirsin</span>
        </div>
        {info && (
          <div className="cr-parts">
            {PARTS.map((p) => {
              const v = info[p.key] || 0;
              const pct = info.total > 0 ? Math.max(2, Math.round((v / info.total) * 100)) : 0;
              return (
                <div key={p.key} className={`cr-part${v ? '' : ' zero'}`}>
                  <span className="cr-part-name">
                    {p.icon} {p.label}
                  </span>
                  <span className="cr-part-bar">
                    <i style={{ width: v ? `${pct}%` : 0 }} />
                  </span>
                  <span className="cr-part-val">{fmt(v)}</span>
                </div>
              );
            })}
            <div className="cr-formula">
              Toplam varlık {fmt(info.total)} × %{Math.round((info.ratio || 0.2) * 100)} = <b>{fmt(limit)}</b>
            </div>
          </div>
        )}
        {loadErr && <p className="cr-err">{loadErr}</p>}
        <p className="cr-tip">💡 Kredi puanını yükselterek daha fazla kredi çekebilirsin: araç, silah, malzeme, fabrika ve futbol takımı puanını artırır.</p>
      </div>

      {/* Aktif kredi */}
      {credit ? (
        <div className="cr-active">
          <div className="cr-active-head">
            <b>🏦 Aktif Kredin</b>
            <span className={`cr-due${credit.dueAtMs - Date.now() < 86_400_000 ? ' hot' : ''}`}>⏳ {timeLeft(credit.dueAtMs - Date.now())}</span>
          </div>
          <div className="cr-progress">
            <i style={{ width: `${Math.min(100, Math.round(((credit.paid || 0) / credit.totalOwed) * 100))}%` }} />
          </div>
          <div className="cr-rows">
            <span>Çekilen</span>
            <b>{fmt(credit.principal)}</b>
            <span>Toplam geri ödeme</span>
            <b>{fmt(credit.totalOwed)}</b>
            <span>Ödenen</span>
            <b>{fmt(credit.paid)}</b>
            <span>Kalan</span>
            <b className="cr-remaining">{fmt(credit.totalOwed - (credit.paid || 0))}</b>
          </div>
          <QuantityStepper value={repay} onChange={setRepay} max={Math.min(gold, credit.totalOwed - (credit.paid || 0))} />
          <button
            className="cr-btn"
            disabled={!repay || busy === 'repay'}
            onClick={() =>
              run('repay', () => repayCredit(repay), (d) => (d?.closed ? '🎉 Kredin kapandı!' : `✅ ${fmt(d?.applied)} altın ödendi.`)).then(() => setRepay(0))
            }
          >
            {busy === 'repay' ? '…' : repay ? `Öde — ${fmt(repay)} altın` : 'Öde'}
          </button>
          <p className="cr-note">Vade dolduğunda ödenmeyen kısım devlete borç olarak yazılır; borç bitene kadar kazancının yarısı kesilir.</p>
        </div>
      ) : (
        <div className="cr-take">
          <b className="cr-take-title">Kredi Çek</b>
          <div className="cr-terms">
            <span>📅 {termDays} gün vade</span>
            <span>📈 %{Math.round(interest * 100)} faiz</span>
            <span>1️⃣ Aynı anda tek kredi</span>
          </div>
          {blockedReason ? (
            <p className="cr-err">{blockedReason}</p>
          ) : (
            <>
              <QuantityStepper value={amount} onChange={setAmount} max={limit} />
              {amount > 0 && (
                <div className="cr-rows">
                  <span>Hesabına yatacak</span>
                  <b>{fmt(amount)}</b>
                  <span>{termDays} günde geri ödeyeceğin</span>
                  <b>{fmt(owed)}</b>
                  <span>Son ödeme</span>
                  <b>{new Date(Date.now() + termDays * 86_400_000).toLocaleDateString('tr-TR')}</b>
                </div>
              )}
              <button
                className="cr-btn primary"
                disabled={amount < minAmount || amount > limit || busy === 'take'}
                onClick={() => run('take', () => takeCredit(amount), (d) => `✅ ${fmt(d?.principal)} altın hesabına aktarıldı.`).then(() => setAmount(0))}
              >
                {busy === 'take' ? '…' : amount >= minAmount ? `Kredi Çek — ${fmt(amount)} altın` : `En az ${fmt(minAmount)} altın seç`}
              </button>
            </>
          )}
        </div>
      )}

      {msg && <p className={msg.ok ? 'cr-ok' : 'cr-err'}>{msg.text}</p>}

      {/* Eski araç ipotekli krediler (ödenmeye devam eder) */}
      {legacy.length > 0 && (
        <div className="cr-legacy">
          <b>🚗 Eski araç kredilerin</b>
          {legacy.map((v) => {
            const remaining = (v.loanTotalOwed || 0) - (v.loanPaid || 0);
            return (
              <div key={v.id} className="cr-legacy-card">
                <span>
                  {vehicleDisplayName(v)} {v.seizedByBank && <em className="cr-seized">EL KONULDU</em>}
                </span>
                <span className="cr-note">
                  Kalan borç: {fmt(remaining)} · Vade: {v.loanDueAt?.toDate?.().toLocaleDateString('tr-TR') || '-'}
                </span>
                <QuantityStepper
                  value={legacyRepay[v.id] || 0}
                  onChange={(n) => setLegacyRepay((p) => ({ ...p, [v.id]: n }))}
                  max={Math.min(gold, remaining)}
                />
                <button
                  className="cr-btn"
                  disabled={!legacyRepay[v.id] || busy === `legacy-${v.id}`}
                  onClick={() =>
                    run(`legacy-${v.id}`, () => repayVehicleLoan(v.id, legacyRepay[v.id]), '✅ Ödendi.').then(() =>
                      setLegacyRepay((p) => ({ ...p, [v.id]: 0 }))
                    )
                  }
                >
                  {busy === `legacy-${v.id}` ? '…' : 'Öde'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
