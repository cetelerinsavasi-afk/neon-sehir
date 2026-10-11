import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFootballer } from '../../hooks/useGym';
import { useRealContract, useMyProOffers, useCurrentFutbolSeason, usePlayerSeasonStats, useStatBoard } from '../../hooks/useFutbolPro';
import { futbolProAction, shopAction } from '../../services/gameActions';
import { futbolDayKey } from '../../../functions/businessCatalogData.js';
import { bizErrText } from '../../lib/bizErrors';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import HoldButton from '../HoldButton/HoldButton';
import { POS_META, PRO_MIN_POWER, proSalaryBand, fmt, pw, hoursLeft, proErrText } from './futbolProMeta';
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
      return true;
    } catch (err) {
      setMsg({ ok: false, text: proErrText(err) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="futbol-placeholder">Yükleniyor…</p>;
  if (!fb || !fb.position) {
    return (
      <div className="fp-wrap">
        <div className="fp-empty">
          <span className="fp-empty-ico">⚽</span>
          <b>Futbolcu ol: önce mevkini seç</b>
          <p>Sonra spor salonunda antrenman yap. {PRO_MIN_POWER} güçte takımlar seni görür.</p>
        </div>
        <PositionCard fb={fb} />
        <HowCard pro={false} />
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

      <PositionCard fb={fb} power={power} />

      <DayCard day={fb.lastDay} season={season} playerId={playerId} />

      {!pro && (
        <div className="fp-card fp-dim">
          🏋️ {PRO_MIN_POWER} güce {pw(Math.max(0, PRO_MIN_POWER - power))} kaldı. Salonda günde 1–16 güç kazanırsın.
        </div>
      )}

      {pro && !fb.teamId && <FreeAgentPanel fb={fb} busy={busy} run={run} />}
      {pro && <OffersCard offers={offers} inTeam={Boolean(fb.teamId)} busy={busy} run={run} />}
      {contract && <ContractPanel contract={contract} busy={busy} run={run} />}

      <HowCard pro={pro} inTeam={Boolean(fb.teamId)} />

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

// Mevki: günde 1 kez değişir; 200 güçte ve takımdayken kilitli
function PositionCard({ fb, power = 0 }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const cur = fb?.position || null;
  const inTeam = Boolean(fb?.teamId);
  const pro = cur && Number(power || fb?.power || 0) >= PRO_MIN_POWER;
  const today = cur && fb?.positionDayKey === futbolDayKey(Date.now());
  const locked = inTeam || pro || today;
  const pick = async (k) => {
    if (k === cur || locked) return;
    setBusy(k);
    setMsg(null);
    try {
      await shopAction({ op: 'footballerPosition', position: k });
    } catch (e) {
      setMsg(bizErrText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="fp-card">
      <p className="fp-title">⚽ Mevki</p>
      <div className="fp-posgrid">
        {Object.entries(POS_META).map(([k, v]) => (
          <button key={k} className={`fp-posbtn${cur === k ? ' on' : ''}`} disabled={Boolean(busy) || (locked && cur !== k)} onClick={() => pick(k)}>
            <span>{v.icon}</span>
            <small>{busy === k ? '…' : v.name}</small>
          </button>
        ))}
      </div>
      <p className="fp-dim fp-small">
        {inTeam ? 'Takımdayken değişmez.' : pro ? '200 güçte mevki kalıcıdır.' : today ? 'Bugün değiştirdin. Yarın 19:00\'dan sonra.' : 'Günde 1 kez değişir. 200 güçte kalıcı olur.'}
      </p>
      {msg && <p className="fp-msg">{msg}</p>}
    </div>
  );
}

// v89 — oyuncu mantığı anlasın: kısa "nasıl çalışır" (açılır kapanır)
function HowCard({ pro, inTeam = false }) {
  return (
    <details className="fp-card fp-how" open={!pro}>
      <summary>❔ Futbolculuk nasıl çalışır?</summary>
      <ul>
        <li>
          <b>1. Mevki seç</b>, sonra <b>spor salonunda</b> antrenman yap: günde 1 kez, {PRO_MIN_POWER} güce kadar her gün 1–16 güç kazanırsın.
        </li>
        <li>
          <b>2. {PRO_MIN_POWER} güce ulaşınca</b> PRO olursun: mevkin kalıcı olur ve takımların “Maaşlı futbolcular” listesinde görünürsün.
        </li>
        <li>
          <b>3. Takım bul:</b> 📢 ilana çık (maaşını sen belirlersin, takım hemen imzalar) ya da gelen 📨 teklifleri bekle (24 saat geçerli).
        </li>
        <li>
          <b>4. Takımdayken:</b> maaşın her gün 19:00&apos;da yatar; aralığı gücüne bağlıdır (güç × 25 – güç × 50, ör. 200 güç → 5.000–10.000). Takıma girer girmez maaş almazsın: 18:00&apos;den önce imzaladıysan ilk maaşın aynı gün 19:00&apos;da, 18:00 ve sonrası imzaladıysan ertesi gün 19:00&apos;da gelir; takım ödeyemezse borç birikir ve sonra ödenir. Salonda değil, takım antrenmanı ve maçlarla güçlenirsin; maça çıkıp çıkmayacağına takımın yöneticisi karar verir.
        </li>
        <li>
          <b>5. Ayrılmak:</b> feshi istediğin an başlatabilirsin ama fesih (kim başlatırsa başlatsın) 19:00&apos;da olur ve o günün maaşını alırsın. Başka takımın teklifini kabul edersen transferin de 19:00&apos;da gerçekleşir. Feshettiğin takıma ertesi 19:00&apos;dan önce dönemezsin.
        </li>
        {inTeam && <li>💸 Zam: günde 1 kez isteyebilirsin; yönetici kabul ya da ret eder.</li>}
      </ul>
    </details>
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
  const band = proSalaryBand(fb.power);
  const [ask, setAsk] = useState(Math.max(band.min, Math.min(band.max, Number(fb.askSalary) || band.min)));
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
            <p className="fp-hint">
              Maaşını sen belirle ({fmt(band.min)}–{fmt(band.max)}, gücüne göre); takım doğrudan imzalar.
            </p>
            <QuantityStepper value={ask} onChange={(v) => setAsk(Math.max(band.min, Math.min(band.max, v)))} min={band.min} max={band.max} step={100} steps={SALARY_STEPS} />
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
        {inTeam && <p className="fp-warn">Kabul edersen transferin bugün 19:00&apos;da gerçekleşir: o günün maaşını eski takımın öder, birikmiş borcu da eski takımın borcu olarak sana ödenir.</p>}
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
            <HoldButton className="futbol-admin-submit" disabled={Boolean(busy)} onDone={() => run(`a_${o.id}`, { op: 'offerRespond', offerId: o.id, accept: true }, inTeam ? `🔁 ${o.teamName} ile anlaştın! Transferin bugün 19:00'da.` : `🤝 ${o.teamName} ile anlaştın!`)}>
              ✓ İmzala
            </HoldButton>
          </div>
        ))}
      </div>
  );
}

// Takımdaki futbolcu: sözleşme, zam, fesih
function ContractPanel({ contract, busy, run }) {
  const band = proSalaryBand(contract.power);
  const canRaise = Number(contract.salary || 0) < band.max;
  const [raise, setRaise] = useState(Math.min(band.max, Number(contract.salary || 0) + 1000));
  const [showRaise, setShowRaise] = useState(false);
  const pending = Boolean(contract.pendingEnd || contract.pendingTransfer);
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
      <p className="fp-hint">Maaş her gün 19:00&apos;da yatar. Ödenmeyen kısım borç olarak birikir.</p>
      {contract.pendingEnd && <p className="fp-pending">⏳ Sözleşmen bugün 19:00&apos;da bitiyor; bugünün maaşını alıp takımdan ayrılacaksın.</p>}
      {contract.pendingTransfer && <p className="fp-pending">🔁 Bugün 19:00&apos;da {contract.pendingTransfer.teamName} takımına transfer oluyorsun ({fmt(contract.pendingTransfer.salary)}/gün).</p>}
      {contract.raiseRequest ? (
        <p className="fp-pending">⏳ Zam isteğin bekliyor: {fmt(contract.raiseRequest.salary)}/gün</p>
      ) : !canRaise ? (
        <p className="fp-hint">Bu güçte maaş tavanındasın ({fmt(band.max)}/gün). Güçlendikçe tavan yükselir.</p>
      ) : showRaise ? (
        <div className="fp-raise">
          <QuantityStepper value={raise} onChange={(v) => setRaise(Math.max(Number(contract.salary) + 1, Math.min(band.max, v)))} min={Number(contract.salary) + 1} max={band.max} step={100} steps={SALARY_STEPS} />
          <button className="futbol-admin-submit fp-wide" disabled={busy === 'raise'} onClick={() => run('raise', { op: 'raiseRequest', salary: raise }, 'Zam isteğin gönderildi.').then((ok) => ok && setShowRaise(false))}>
            💸 {fmt(raise)}/gün iste
          </button>
        </div>
      ) : (
        <button className="futbol-admin-reset fp-wide" onClick={() => setShowRaise(true)}>
          💸 Zam iste
        </button>
      )}
      {!pending && (
        <HoldButton className="futbol-admin-reset fp-wide fp-danger" disabled={busy === 'term'} ms={1400} onDone={() => run('term', { op: 'terminate' }, 'Sözleşmen bugün 19:00\'da bitecek.')}>
          ✂️ 19:00&apos;da feshet
        </HoldButton>
      )}
    </div>
  );
}
