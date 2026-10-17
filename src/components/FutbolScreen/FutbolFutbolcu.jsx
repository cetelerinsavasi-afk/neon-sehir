import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFootballer } from '../../hooks/useGym';
import { useRealContract, useMyProOffers, useCurrentFutbolSeason, usePlayerSeasonStats, useStatBoard, useFutbolTeamDoc } from '../../hooks/useFutbolPro';
import { futbolProAction, shopAction } from '../../services/gameActions';
import { futbolDayKey } from '../../../functions/businessCatalogData.js';
import { bizErrText } from '../../lib/bizErrors';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import ConfirmButton from '../ConfirmButton/ConfirmButton';
import { POS_META, PRO_MIN_POWER, proSalaryBand, fmt, pw, hoursLeft, proErrText } from './futbolProMeta';
import './FutbolPro.css';

// =============================================================================
// v97: üstte DURUM kartı — hangi takımdasın, ilk 11 / yedek, maaş ne zaman,
//      sıradaki adım. Basılı tutma yok: dokun → onay penceresi.
// v77 Faz 5 — Futbolcu sekmesi (gerçek oyuncunun kendi futbol kariyeri)
// =============================================================================
const SALARY_STEPS = [100, 1000, 10000];
const H = 60 * 60 * 1000;

// İstanbul saatiyle bir günün HH:00'ı (ms)
function istAt(ms, hour, addDays = 0) {
  const d = new Date(ms + 3 * H);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + addDays, hour - 3, 0, 0);
}
// Sıradaki maaş: her gün 19:00; 18:00 ve sonrası imzalayan ilk maaşını ertesi 19:00'da alır
function nextPayMs(contractSince, now = Date.now()) {
  let pay = istAt(now, 19);
  if (pay <= now) pay = istAt(now, 19, 1);
  while (Number(contractSince || 0) >= pay - H) pay += 24 * H;
  return pay;
}
function dayWord(ms, now = Date.now()) {
  const k = (x) => new Date(x + 3 * H).toISOString().slice(0, 10);
  if (k(ms) === k(now)) return 'bugün';
  if (k(ms) === k(now + 24 * H)) return 'yarın';
  return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export default function FutbolFutbolcu() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { fb, loading } = useFootballer(uid);
  const { data: contract } = useRealContract(uid);
  const { data: team } = useFutbolTeamDoc(contract?.teamId || null);
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
          <b>Mevkini seç</b>
          <p>🏋️ Spor salonunda güçlen · {PRO_MIN_POWER} güçte takımlar seni görür</p>
        </div>
        <PositionCard fb={fb} />
      </div>
    );
  }

  const power = Number(contract?.power ?? fb.power ?? 100);
  const pro = power >= PRO_MIN_POWER;
  const pos = POS_META[fb.position] || { icon: '⚽', name: fb.position };
  const inTeam = Boolean(contract);

  return (
    <div className="fp-wrap">
      <div className="fp-hero">
        <span className="fp-pos" title={pos.name}>
          {pos.icon}
        </span>
        <div className="fp-hero-main">
          <b className="fp-name">{fb.name}</b>
          <span className="fp-sub">{pos.name}</span>
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

      <StatusCard fb={fb} pro={pro} power={power} contract={contract} team={team} uid={uid} offers={offers.length} busy={busy} run={run} />

      {msg && <p className={`fp-msg${msg.ok ? ' ok' : ''}`}>{msg.text}</p>}

      {pro && <OffersCard offers={offers} inTeam={inTeam} busy={busy} run={run} />}
      {pro && !inTeam && <FreeAgentPanel fb={fb} busy={busy} run={run} />}
      {contract && <ContractPanel contract={contract} busy={busy} run={run} />}

      <DayCard day={fb.lastDay} season={season} playerId={playerId} />

      {!inTeam && <PositionCard fb={fb} offers={offers.length} />}

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

// v97 — DURUM: nerede oynuyorsun, maaş ne zaman, sıradaki adım
function StatusCard({ fb, pro, power, contract, team, uid, offers, busy, run }) {
  const now = Date.now();
  const rows = [];
  let tone = 'free';
  let icon = '🆓';
  let title = 'Takımsız';
  let sub = null;
  let action = null;

  if (contract) {
    tone = 'team';
    icon = '⚽';
    title = contract.teamName || fb.teamName || team?.name || 'Takım';
    const lineup = Array.isArray(team?.lineup) ? team.lineup : [];
    const injured = Number(contract.injuryDaysLeft || 0);
    sub = injured > 0 ? `🩹 Sakat · ${injured} gün` : lineup.length ? (lineup.includes(`real_${uid}`) ? '✅ İlk 11\'desin' : '🪑 Yedektesin') : null;
    const pay = nextPayMs(contract.contractSince, now);
    rows.push(['💰', `${fmt(contract.salary)}/gün`, `Sıradaki maaş ${dayWord(pay, now)} 19:00`]);
    rows.push(['🏟️', 'Maç her gün 18:00', 'Sonuç ve gelişim 19:00']);
    if (Number(contract.salaryDebt || 0) > 0) rows.push(['⚠️', `Takım sana ${fmt(contract.salaryDebt)} borçlu`, 'Kasaya para gelince ödenir']);
    const tr = contract.pendingTransfer;
    const fresh = futbolDayKey(Number(contract.contractSince || 0)) === futbolDayKey(now) && !contract.lastPaidAtMs && !contract.pendingEnd;
    if (tr) {
      tone = 'move';
      rows.unshift(['🔁', `Bugün 19:00'da ${tr.teamName}`, `${fmt(tr.salary)}/gün`]);
      action = (
        <ConfirmButton className="fp-st-btn" disabled={Boolean(busy)} title="Transferden vazgeçilsin mi?" lines={[`${title} takımında kalırsın.`]} confirmLabel="Vazgeç" danger onConfirm={() => run('cancel', { op: 'cancelSign' }, '↩️ Transferden vazgeçtin.')}>
          ↩️ Transferden vazgeç
        </ConfirmButton>
      );
    } else if (contract.pendingEnd) {
      tone = 'end';
      rows.unshift(['✂️', "Bugün 19:00'da ayrılıyorsun", 'Bugünkü maaşın ödenir']);
    } else if (fresh) {
      rows.unshift(['🆕', 'Yeni anlaşma', "19:00'a kadar vazgeçebilirsin"]);
      action = (
        <ConfirmButton className="fp-st-btn" disabled={Boolean(busy)} title={`${title} ile anlaşmadan vazgeçilsin mi?`} lines={['Hemen takımsız kalırsın, maaş almazsın.']} confirmLabel="Vazgeç" danger onConfirm={() => run('cancel', { op: 'cancelSign' }, '↩️ Anlaşmadan vazgeçtin.')}>
          ↩️ Anlaşmadan vazgeç
        </ConfirmButton>
      );
    }
  } else if (!pro) {
    tone = 'grow';
    icon = '🏋️';
    title = 'Gelişim dönemi';
    rows.push(['⚡', `${PRO_MIN_POWER} güce ${pw(Math.max(0, PRO_MIN_POWER - power))} kaldı`, 'Spor salonunda çalış']);
    rows.push(['📨', `${PRO_MIN_POWER} güçte`, 'Takımlar teklif gönderebilir']);
  } else {
    sub = 'Serbest futbolcu';
    if (fb.listed) rows.push(['📢', `İlandasın · ${fmt(fb.askSalary)}/gün`, 'Takım imzalarsa hemen kadroya girersin']);
    else rows.push(['📢', 'İlana çık', 'Ya da takımların teklifini bekle']);
    if (offers > 0) rows.push(['📨', `${offers} teklif var`, 'Aşağıdan bak']);
  }

  return (
    <div className={`fp-status ${tone}`}>
      <div className="fp-status-head">
        <span className="fp-status-ico">{icon}</span>
        <div className="fp-status-main">
          <b>{title}</b>
          {sub && <span>{sub}</span>}
        </div>
      </div>
      <div className="fp-status-rows">
        {rows.map(([ico, a, b], i) => (
          <div key={i} className="fp-status-row">
            <span className="fp-status-rico">{ico}</span>
            <span className="fp-status-txt">
              <b>{a}</b>
              {b && <small>{b}</small>}
            </span>
          </div>
        ))}
      </div>
      {action}
    </div>
  );
}

// Mevki: günde 1 kez değişir (v95: 200+ da); takımda, ilanda, teklif varken kilitli
function PositionCard({ fb, offers = 0 }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const cur = fb?.position || null;
  const inTeam = Boolean(fb?.teamId);
  const listed = Boolean(fb?.listed);
  const today = cur && fb?.positionDayKey === futbolDayKey(Date.now());
  const why = inTeam ? 'Takımdayken değişmez' : listed ? 'İlandayken değişmez' : offers > 0 ? 'Bekleyen teklif varken değişmez' : today ? 'Yarın tekrar değişebilir' : 'Günde 1 kez değişir';
  const locked = inTeam || listed || offers > 0 || today;
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
      <p className="fp-dim fp-small">{why}</p>
      {msg && <p className="fp-msg">{msg}</p>}
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
              {fmt(band.min)}–{fmt(band.max)}/gün
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
        {inTeam && <p className="fp-warn">Transfer 19:00&apos;da</p>}
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
            <ConfirmButton className="futbol-admin-submit" disabled={Boolean(busy)} title={`${o.teamName} ile anlaşılsın mı?`} lines={[`💰 ${fmt(o.salary)}/gün`, inTeam ? "🔁 Transfer bugün 19:00'da" : '⚽ Hemen takıma girersin', "↩️ 19:00'a kadar vazgeçebilirsin"]} confirmLabel="İmzala" onConfirm={() => run(`a_${o.id}`, { op: 'offerRespond', offerId: o.id, accept: true }, inTeam ? `🔁 ${o.teamName} ile anlaştın! Transferin bugün 19:00'da.` : `🤝 ${o.teamName} ile anlaştın!`)}>
              ✓ İmzala
            </ConfirmButton>
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
      <p className="fp-title">
        📝 Sözleşme
        <small className="fp-dim fp-small">· {new Date(contract.contractSince).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}&apos;den beri</small>
      </p>
      {contract.raiseRequest ? (
        <p className="fp-pending">⏳ Zam isteğin bekliyor: {fmt(contract.raiseRequest.salary)}/gün</p>
      ) : !canRaise ? (
        <p className="fp-hint">Maaş tavanı: {fmt(band.max)}/gün</p>
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
        <ConfirmButton className="futbol-admin-reset fp-wide fp-danger" disabled={busy === 'term'} danger title="Sözleşme feshedilsin mi?" lines={["Bugün 19:00'da maaşın ödenir ve takımdan ayrılırsın."]} confirmLabel="Feshet" onConfirm={() => run('term', { op: 'terminate' }, 'Sözleşmen bugün 19:00\'da bitecek.')}>
          ✂️ Sözleşmeyi feshet
        </ConfirmButton>
      )}
    </div>
  );
}
