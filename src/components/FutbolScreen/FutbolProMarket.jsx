import { useState } from 'react';
import { useProList, useTeamContracts, useTeamProOffers } from '../../hooks/useFutbolPro';
import { futbolProAction } from '../../services/gameActions';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import HoldButton from '../HoldButton/HoldButton';
import { POS_META, PRO_SALARY, fmt, pw, hoursLeft, proErrText } from './futbolProMeta';
import './FutbolPro.css';

// =============================================================================
// v77 Faz 5 — gerçek (maaşlı) futbolcular
//   ProContracts  (Takımım › Takımın): sözleşmeliler — maaş, zam, fesih.
//                 Hiç sözleşmeli yoksa görünmez.
//   ProPlayersList (Takımım › Transfer › "Maaşlı futbolcular"): oyundaki 200+
//                 güçlü tüm futbolcular (takımlı/takımsız). İlandaysa imzala,
//                 değilse teklif gönder (24 saat geçerli).
//   Maaş her 19:00'da: menajerli takımda kasadan, başkan yönetiyorsa başkanın
//   altınından. Transfer desteği kullanılmaz.
// =============================================================================
const SALARY_STEPS = [100, 1000, 10000];

function useProRun() {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const run = async (key, payload, okText) => {
    setBusy(key);
    setMsg(null);
    try {
      await futbolProAction(payload);
      if (okText) setMsg({ ok: true, text: okText });
      return true;
    } catch (err) {
      setMsg({ ok: false, text: proErrText(err) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, run };
}

// Sözleşmeli futbolcular — hiç yoksa hiçbir şey göstermez
export function ProContracts({ team, readOnly }) {
  const { contracts } = useTeamContracts(team.id);
  const { busy, msg, run } = useProRun();
  const [raiseFor, setRaiseFor] = useState(null);
  const [raise, setRaise] = useState(0);
  const debts = Object.entries(team.playerDebts || {}).filter(([, v]) => Number(v) > 0);
  const debtTotal = debts.reduce((a, [, v]) => a + Number(v), 0);
  if (!contracts.length) return null;
  return (
    <fieldset className="fp-market" disabled={readOnly}>
      {msg && <p className={`fp-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</p>}
      <div className="fp-card">
        <p className="fp-title">
          👤 Sözleşmeli futbolcular <em className="fp-count">{contracts.length}</em>
        </p>
        <p className="fp-hint">Maaş 19:00&apos;da {team.managerUid ? 'kasadan' : 'altınından'} ödenir.</p>
        {debtTotal > 0 && <p className="fp-pending">⚠️ Eski futbolculara borç: {fmt(debtTotal)}</p>}
        {contracts.map((c) => {
          const pos = POS_META[c.position] || {};
          return (
            <div key={c.id} className="fp-prow">
              <span className="fp-prow-pos" title={pos.name}>
                {pos.icon}
              </span>
              <div className="fp-prow-main">
                <b>{c.name}</b>
                <span>
                  ⚡ {pw(c.power)} · 💰 {fmt(c.salary)}/gün{c.salaryDebt > 0 && <em className="fp-debt"> · borç {fmt(c.salaryDebt)}</em>}
                </span>
                {c.raiseRequest && (
                  <span className="fp-pending">
                    💸 Zam isteği: {fmt(c.raiseRequest.salary)}
                    <button className="fp-mini" disabled={Boolean(busy)} onClick={() => run(`rr_${c.id}`, { op: 'raiseRespond', uid: c.realUid, accept: false })}>
                      ✕
                    </button>
                    <button className="fp-mini ok" disabled={Boolean(busy)} onClick={() => run(`ra_${c.id}`, { op: 'raiseRespond', uid: c.realUid, accept: true }, 'Zam onaylandı.')}>
                      ✓
                    </button>
                  </span>
                )}
                {raiseFor === c.id && (
                  <div className="fp-raise">
                    <QuantityStepper value={raise} onChange={(v) => setRaise(Math.max(Number(c.salary) + 1, Math.min(PRO_SALARY.max, v)))} min={Number(c.salary) + 1} max={PRO_SALARY.max} step={100} steps={SALARY_STEPS} />
                    <button
                      className="futbol-admin-submit fp-wide"
                      disabled={Boolean(busy)}
                      onClick={async () => {
                        if (await run(`rs_${c.id}`, { op: 'raiseSet', uid: c.realUid, salary: raise }, 'Maaş artırıldı.')) setRaiseFor(null);
                      }}
                    >
                      💸 {fmt(raise)}/gün yap
                    </button>
                  </div>
                )}
              </div>
              <div className="fp-prow-acts">
                <button
                  className="futbol-admin-reset"
                  onClick={() => {
                    setRaiseFor(raiseFor === c.id ? null : c.id);
                    setRaise(Number(c.salary) + 1000);
                  }}
                >
                  💸 Zam
                </button>
                <HoldButton className="futbol-admin-reset fp-danger" ms={1400} disabled={Boolean(busy)} onDone={() => run(`t_${c.id}`, { op: 'terminate', uid: c.realUid }, `${c.name} ile yollar ayrıldı.`)}>
                  ✂️ Feshet
                </HoldButton>
              </div>
            </div>
          );
        })}
      </div>

    </fieldset>
  );
}

// Oyundaki 200+ güçlü futbolcular (takımlı ya da takımsız): teklif / imza
export function ProPlayersList({ team, readOnly }) {
  const { pros: allPros } = useProList(true);
  // kendi takımımızdakiler hariç; önce ilandakiler, sonra takımsızlar, sonra takımlılar
  const pros = allPros
    .filter((p) => p.teamId !== team.id)
    .sort((a, b) => Number(Boolean(a.teamId)) - Number(Boolean(b.teamId)) || Number(Boolean(b.listed && !b.teamId)) - Number(Boolean(a.listed && !a.teamId)) || b.power - a.power);
  const { offers } = useTeamProOffers(team.id);
  const { busy, msg, run } = useProRun();
  const [offerFor, setOfferFor] = useState(null);
  const [salary, setSalary] = useState(5000);
  const offerByUid = Object.fromEntries(offers.map((o) => [o.uid, o]));
  return (
    <fieldset className="fp-market" disabled={readOnly}>
      {msg && <p className={`fp-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</p>}
      <div className="fp-card">
        <p className="fp-title">
          💰 Maaşlı futbolcular <em className="fp-count">{pros.length}</em>
        </p>
        <p className="fp-hint">200+ güç · teklifler 24 saat geçerli</p>
        {pros.length === 0 && <p className="fp-hint">Şu an yok.</p>}
        {pros.map((p) => {
          const pos = POS_META[p.position] || {};
          const sent = offerByUid[p.uid];
          const listed = p.listed && !p.teamId;
          return (
            <div key={p.id} className={`fp-prow${listed ? ' listed' : ''}`}>
              <span className="fp-prow-pos" title={pos.name}>
                {pos.icon}
              </span>
              <div className="fp-prow-main">
                <b>{p.name}</b>
                <span>
                  ⚡ {pw(p.power)} · {pos.name}
                  {listed && <em className="fp-ask"> · 📢 {fmt(p.askSalary)}/gün</em>}
                  {p.teamId && <em className="fp-inteam"> · 👕 {p.teamName}</em>}
                </span>
                {sent && (
                  <span className="fp-pending">
                    📨 {fmt(sent.salary)}/gün · ⏳ {hoursLeft(sent.expiresAtMs)}
                    <button className="fp-mini" disabled={Boolean(busy)} onClick={() => run(`oc_${p.id}`, { op: 'offerCancel', offerId: sent.id })}>
                      ✕
                    </button>
                  </span>
                )}
                {offerFor === p.id && (
                  <div className="fp-raise">
                    <QuantityStepper value={salary} onChange={(v) => setSalary(Math.max(PRO_SALARY.min, Math.min(PRO_SALARY.max, v)))} min={PRO_SALARY.min} max={PRO_SALARY.max} step={100} steps={SALARY_STEPS} />
                    <button
                      className="futbol-admin-submit fp-wide"
                      disabled={Boolean(busy)}
                      onClick={async () => {
                        if (await run(`os_${p.id}`, { op: 'offerSend', teamId: team.id, uid: p.uid, salary }, `📨 ${p.name} için teklif gönderildi.`)) setOfferFor(null);
                      }}
                    >
                      📨 {fmt(salary)}/gün teklif et
                    </button>
                  </div>
                )}
              </div>
              <div className="fp-prow-acts">
                {listed ? (
                  <HoldButton className="futbol-admin-submit" disabled={Boolean(busy)} onDone={() => run(`s_${p.id}`, { op: 'sign', teamId: team.id, uid: p.uid, expect: p.askSalary }, `🤝 ${p.name} takımda!`)}>
                    ✍️ İmzala
                  </HoldButton>
                ) : (
                  <button className="futbol-admin-submit" onClick={() => setOfferFor(offerFor === p.id ? null : p.id)}>
                    {sent ? '↻ Teklifi güncelle' : '📨 Teklif ver'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
