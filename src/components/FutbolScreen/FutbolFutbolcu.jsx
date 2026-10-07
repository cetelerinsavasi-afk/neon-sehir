import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFootballer } from '../../hooks/useGym';
import { useRealContract, useMyProOffers, useCurrentFutbolSeason, usePlayerSeasonStats, useStatBoard } from '../../hooks/useFutbolPro';
import { futbolProAction } from '../../services/gameActions';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import HoldButton from '../HoldButton/HoldButton';
import { POS_META, PRO_SALARY, PRO_MIN_POWER, fmt, pw, hoursLeft, proErrText } from './futbolProMeta';
import './FutbolPro.css';

// =============================================================================
// v77 Faz 5 — Futbolcu sekmesi (gerçek oyuncunun kendi futbol kariyeri)
//   · güç / mevki · 200'e kadar ilerleme
//   · takımsızsa: ilan (maaşını sen koy) + gelen teklifler (24 sa)
//   · takımdaysa: sözleşme, zam iste, feshet
//   · gün sonu kartı: maç/antrenman/yedek, gol-asist, puan, güç ve form
//   · sezon: gol/asist/yıldız/form sıralamasındaki yerin
// =============================================================================
const SALARY_STEPS = [100, 1000, 10000];

export default function FutbolFutbolcu() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { fb, loading } = useFootballer(uid);
  const { data: contract } = useRealContract(uid);
  const { offers } = useMyProOffers(fb ? uid : null);
  const season = useCurrentFutbolSeason();
  const playerId = uid ? `real_${uid}` : null;
  const { data: stats } = usePlayerSeasonStats(season, playerId);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const run = async (key, payload, okText) => {
    setBusy(key);
    setMsg(null);
    try {
      await futbolProAction(payload);
      if (okText) setMsg({ ok: true, text: okText });
    } catch (err) {
      setMsg({ ok: false, text: proErrText(err) });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="futbol-placeholder">…</p>;
  if (!fb || !fb.position) {
    return (
      <div className="fp-wrap">
        <div className="fp-empty">
          <span className="fp-empty-ico">🏋️</span>
          <b>Futbolcu olmak için spor salonuna git</b>
          <p>Mevkini seç, her gün antrenman yap. {PRO_MIN_POWER} güce ulaşınca takımlar seni görür.</p>
        </div>
      </div>
    );
  }

  const power = Number(contract?.power ?? fb.power ?? 100);
  const pro = power >= PRO_MIN_POWER;
  const pos = POS_META[fb.position] || { icon: '⚽', name: fb.position };

  return (
    <div className="fp-wrap">
      <div className="fp-hero">
        <span className="fp-pos" title={pos.name}>
          {pos.icon}
        </span>
        <div className="fp-hero-main">
          <b className="fp-name">{fb.name}</b>
          <span className="fp-sub">
            {pos.name}
            {fb.teamName ? ` · ${fb.teamName}` : ' · Takımsız'}
          </span>
          {!pro && (
            <i className="fp-bar" title={`${pw(power)} / ${PRO_MIN_POWER}`}>
              <i style={{ width: `${Math.min(100, (power / PRO_MIN_POWER) * 100)}%` }} />
            </i>
          )}
        </div>
        <div className="fp-power">
          <span>⚡</span>
          <b>{pw(power)}</b>
          {pro && <em className="fp-pro">PRO</em>}
        </div>
      </div>

      {msg && <p className={`fp-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</p>}

      <DayCard day={fb.lastDay} season={season} playerId={playerId} />

      {!pro && (
        <div className="fp-card fp-dim">
          🏋️ {PRO_MIN_POWER} güce {pw(Math.max(0, PRO_MIN_POWER - power))} kaldı. Salonda günde 1–16 güç kazanırsın.
        </div>
      )}

      {pro && !fb.teamId && <FreeAgentPanel fb={fb} busy={busy} run={run} />}
      {pro && <OffersCard offers={offers} inTeam={Boolean(fb.teamId)} busy={busy} run={run} />}
      {contract && <ContractPanel contract={contract} busy={busy} run={run} />}

      {stats && (
        <div className="fp-card">
          <p className="fp-title">📊 Sezon {season}</p>
          <div className="fp-stats">
            <Stat icon="👕" v={stats.apps} label="maç" />
            <Stat icon="⚽" v={stats.goals} label="gol" />
            <Stat icon="🎯" v={stats.assists} label="asist" />
            <Stat icon="⭐" v={stats.motm} label="yıldız" />
            <Stat icon="📈" v={Number(stats.ratingAvg || 0).toFixed(1)} label="ort." />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, v, label }) {
  return (
    <div className="fp-stat">
      <span>{icon}</span>
      <b>{v ?? 0}</b>
      <small>{label}</small>
    </div>
  );
}

// Gün sonu kartı (19:00'da yazılır)
function DayCard({ day, season, playerId }) {
  const goals = useStatBoard(day ? season : null, 'goals');
  const assists = useStatBoard(day ? season : null, 'assists');
  const stars = useStatBoard(day ? season : null, 'motm');
  if (!day) return null;
  const isMatch = day.kind === 'match' || day.kind === 'cup';
  const kindIco = { match: '⚽', cup: '🏆', training: '🏋️', bench: '🪑' }[day.kind] || '📅';
  const kindTxt = { match: 'Lig maçı', cup: 'Kupa maçı', training: 'Antrenman', bench: 'Yedek' }[day.kind] || '';
  const diff = Math.round((Number(day.powerTo) - Number(day.powerFrom)) * 10) / 10;
  let line = '';
  if (isMatch) {
    const g = day.goals || 0;
    const a = day.assists || 0;
    if (g && a) line = `${g} gol attın, ${a} asist yaptın.`;
    else if (g) line = g > 2 ? `Hat-trick! ${g} gol attın.` : `${g} gol attın.`;
    else if (a) line = `${a} asist yaptın.`;
    else line = Number(day.rating) >= 7 ? 'Golsüz ama iyi bir maç çıkardın.' : 'Bugün sessiz geçti.';
    if (day.motm) line += ' Maçın yıldızı sensin!';
  } else if (day.kind === 'training') line = day.bonus ? '🔥 Bonuslu salonda çalıştın.' : 'Antrenmanda ter döktün.';
  else if (day.kind === 'bench') line = 'Yedekteydin, dinlendin.';
  const rankOf = (board, unit) => {
    const i = board.rows.findIndex((r) => r.playerId === playerId);
    if (i < 0) return null;
    return `#${i + 1} · ${fmt(board.rows[i][unit.field])} ${unit.unit}`;
  };
  const ranks = isMatch
    ? [
        ['⚽', rankOf(goals, { field: 'goals', unit: 'gol' })],
        ['🎯', rankOf(assists, { field: 'assists', unit: 'asist' })],
        ['⭐', rankOf(stars, { field: 'motm', unit: 'yıldız' })],
      ].filter(([, v]) => v)
    : [];
  return (
    <div className={`fp-card fp-day${day.motm ? ' star' : ''}`}>
      <div className="fp-day-head">
        <span className="fp-day-ico">{kindIco}</span>
        <b>{kindTxt}</b>
        <small>{day.dayKey}</small>
      </div>
      {isMatch && (
        <div className="fp-score">
          <span>{day.teamName}</span>
          <b>
            {day.gf} - {day.ga}
          </b>
          <span>{day.oppName}</span>
        </div>
      )}
      <p className="fp-line">{line}</p>
      <div className="fp-day-grid">
        {isMatch && (
          <div className={`fp-rating${Number(day.rating) >= 7.5 ? ' hi' : Number(day.rating) < 6 ? ' lo' : ''}`} title="Maç puanı">
            <b>{Number(day.rating || 0).toFixed(1)}</b>
            <small>puan</small>
          </div>
        )}
        {isMatch && (day.goals > 0 || day.assists > 0) && (
          <div className="fp-chipcol">
            {day.goals > 0 && <span>⚽ ×{day.goals}</span>}
            {day.assists > 0 && <span>🎯 ×{day.assists}</span>}
          </div>
        )}
        <div className="fp-chipcol">
          <span>
            ⚡ {pw(day.powerFrom)} → <b>{pw(day.powerTo)}</b> {diff > 0 && <em className="fp-up">+{pw(diff)}</em>}
          </span>
          <span>💪 Form %{day.form ?? 100}</span>
        </div>
      </div>
      {ranks.length > 0 && (
        <div className="fp-ranks">
          {ranks.map(([ico, v]) => (
            <span key={ico}>
              {ico} {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Takımsız PRO: ilan + teklifler
function FreeAgentPanel({ fb, busy, run }) {
  const [ask, setAsk] = useState(Number(fb.askSalary) || 5000);
  return (
    <>
      <div className={`fp-card${fb.listed ? ' fp-listed' : ''}`}>
        <p className="fp-title">📢 Transfer ilanı</p>
        {fb.listed ? (
          <div className="fp-row">
            <span>
              Günlük <b>{fmt(fb.askSalary)}</b> altına imza atmaya hazırsın.
            </span>
            <button className="futbol-admin-reset" disabled={busy === 'list'} onClick={() => run('list', { op: 'proList', listed: false }, 'İlan kaldırıldı.')}>
              Kaldır
            </button>
          </div>
        ) : (
          <>
            <p className="fp-hint">İlanda değilsen de takımlar seni görür ve teklif gönderebilir. İlana koyarsan maaşını sen belirlersin, takım doğrudan imzalar.</p>
            <QuantityStepper value={ask} onChange={(v) => setAsk(Math.max(PRO_SALARY.min, Math.min(PRO_SALARY.max, v)))} min={PRO_SALARY.min} max={PRO_SALARY.max} step={100} steps={SALARY_STEPS} />
            <button className="futbol-admin-submit fp-wide" disabled={busy === 'list'} onClick={() => run('list', { op: 'proList', listed: true, askSalary: ask }, 'İlana çıktın.')}>
              📢 {fmt(ask)}/gün ile ilana çık
            </button>
          </>
        )}
      </div>
    </>
  );
}

// Gelen teklifler — takımsızken imza, takımdayken TRANSFER (mevcut sözleşme biter)
function OffersCard({ offers, inTeam, busy, run }) {
  if (inTeam && offers.length === 0) return null;
  return (
      <div className="fp-card">
        <p className="fp-title">📨 {inTeam ? 'Transfer teklifleri' : 'Teklifler'} {offers.length > 0 && <em className="fp-count">{offers.length}</em>}</p>
        {inTeam && <p className="fp-warn">Kabul edersen mevcut sözleşmen biter; birikmiş maaş borcun eski takımın borcu olarak sana ödenir.</p>}
        {offers.length === 0 && <p className="fp-hint">Henüz teklif yok.</p>}
        {offers.map((o) => (
          <div key={o.id} className="fp-offer">
            <div className="fp-offer-main">
              <b>{o.teamName}</b>
              <span>
                💰 {fmt(o.salary)}/gün · ⏳ {hoursLeft(o.expiresAtMs)}
              </span>
            </div>
            <button className="futbol-admin-reset" disabled={Boolean(busy)} onClick={() => run(`r_${o.id}`, { op: 'offerRespond', offerId: o.id, accept: false })}>
              ✕
            </button>
            <HoldButton className="futbol-admin-submit" disabled={Boolean(busy)} onDone={() => run(`a_${o.id}`, { op: 'offerRespond', offerId: o.id, accept: true }, inTeam ? `🔁 ${o.teamName} takımına transfer oldun!` : `🤝 ${o.teamName} ile anlaştın!`)}>
              ✓ İmzala
            </HoldButton>
          </div>
        ))}
      </div>
  );
}

// Takımdaki futbolcu: sözleşme, zam, fesih
function ContractPanel({ contract, busy, run }) {
  const [raise, setRaise] = useState(Number(contract.salary || 0) + 1000);
  const [showRaise, setShowRaise] = useState(false);
  const locked = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }) === '18';
  return (
    <div className="fp-card">
      <p className="fp-title">📝 Sözleşme</p>
      <div className="fp-contract">
        <div>
          <small>Maaş</small>
          <b>💰 {fmt(contract.salary)}/gün</b>
        </div>
        <div>
          <small>Borç</small>
          <b className={contract.salaryDebt > 0 ? 'fp-debt' : ''}>{fmt(contract.salaryDebt)}</b>
        </div>
        <div>
          <small>Başlangıç</small>
          <b>{new Date(contract.contractSince).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</b>
        </div>
      </div>
      <p className="fp-hint">Maaş her gün 19:00'da yatar. Ödenmeyen kısım borç olarak birikir.</p>
      {contract.raiseRequest ? (
        <p className="fp-pending">⏳ Zam isteğin bekliyor: {fmt(contract.raiseRequest.salary)}/gün</p>
      ) : showRaise ? (
        <div className="fp-raise">
          <QuantityStepper value={raise} onChange={(v) => setRaise(Math.max(Number(contract.salary) + 1, Math.min(PRO_SALARY.max, v)))} min={Number(contract.salary) + 1} max={PRO_SALARY.max} step={100} steps={SALARY_STEPS} />
          <button className="futbol-admin-submit fp-wide" disabled={busy === 'raise'} onClick={() => run('raise', { op: 'raiseRequest', salary: raise }, 'Zam isteğin gönderildi.').then(() => setShowRaise(false))}>
            💸 {fmt(raise)}/gün iste
          </button>
        </div>
      ) : (
        <button className="futbol-admin-reset fp-wide" onClick={() => setShowRaise(true)}>
          💸 Zam iste
        </button>
      )}
      <HoldButton className={`futbol-admin-reset fp-wide fp-danger${locked ? ' cue-dim cue-lock' : ''}`} disabled={locked || busy === 'term'} ms={1400} onDone={() => run('term', { op: 'terminate' }, 'Sözleşmeni feshettin.')}>
        ✂️ Sözleşmeyi feshet {locked && '· 18:00–19:00 🔒'}
      </HoldButton>
    </div>
  );
}
