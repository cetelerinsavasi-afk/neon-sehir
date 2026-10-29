// v136 — SEÇİM EKRANI (anasayfadaki 🗳️ butonu · Belediye binasındaki İmza / Seçimler).
// Evreye göre tek ekran:
//   İmza (Cuma–Pazar 00:00): Aday ol · imza bekleyen adaylar · 10 imzayı toplayanlar
//   Oylama (Pazar 00:00–21:00): sandıktaki adaylar + Oy ver (oylar gizli)
//   Sayım (21:00–24:00) ve Sonuç (Pazartesi): pasta grafiği + yüzdeler
// Yazmalar sunucuda (politicsAction); bu ekran sadece dinler.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Av, Countdown, TextPreview, nf, pc, useRun } from './politicsUi';
import { createPortal } from 'react-dom';
import { useBackClose } from '../../lib/backStack';
import { usePlayer } from '../../hooks/usePlayer';
import { useAuth } from '../../contexts/AuthContext';
import { Btn, Confirm, Sheet } from '../Gangs/ui';
import { usePoliticsState, useLiveDoc, polOfPlayer } from '../../hooks/usePolitics';
import { POLITICS, cycleTimes, splitCandidates } from '../../../functions/politicsRules.js';
import '../Gangs/Gangs.css';
import './Politics.css';

// Pasta renkleri (koyu zemin için doğrulanmış sıra — aday sırası sabit: sandıktaki sıra)
const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OTHER = '#5d6478';

// =============================================================================
// İMZA DÖNEMİ
// =============================================================================
function SignupView({ cycle, cands, me, player, run, busy, openText }) {
  const [ask, setAsk] = useState(null); // { kind:'apply' } | { kind:'sign', c }
  const [draft, setDraft] = useState('');
  const { full, pending } = splitCandidates(cands);
  const eligible = Boolean(player?.onboardingRewardClaimed);
  const t = cycleTimes(cycle);
  const gold = Number(player?.gold || 0);
  const mine = me.cand ? cands?.[player?.uid] : null;
  const applyState = me.cand
    ? { title: 'Adaysın', sub: 'İmza durumunu aşağıdan takip et', dis: true }
    : me.sign
      ? { title: 'Bir adayı destekliyorsun', sub: 'İmza verdiğin için aday olamazsın', dis: true }
      : !eligible
        ? { title: 'Aday ol', sub: 'Önce başlangıç görevlerini (📋) bitir', dis: true }
        : { title: 'Aday ol', sub: `${nf(POLITICS.FEE)} altın · ${POLITICS.NEED} imza gerekir`, dis: false };

  const row = (c, done) => {
    const isMe = c.uid === player?.uid;
    const pct = Math.min(100, (c.sigs / POLITICS.NEED) * 100);
    let btn = null;
    if (!done) {
      if (isMe) btn = null;
      else if (me.sign === c.uid) btn = <span className="pl-tag ok">✓ İmzan</span>;
      else btn = (
        <Btn small disabled={!eligible || me.cand || Boolean(me.sign) || Boolean(busy)} onClick={() => setAsk({ kind: 'sign', c })}>
          İmza at
        </Btn>
      );
    } else if (me.sign === c.uid) btn = <span className="pl-tag ok">✓ İmzan</span>;
    return (
      <div key={c.uid} className={`pl-row${done ? ' done' : ''}${isMe ? ' me' : ''}`}>
        <Av avatar={c.avatar} />
        <div className="pl-info">
          <div className="pl-name">
            {c.name}
            {isMe && <i> (sen)</i>}
          </div>
          <div className="pl-track">
            <div style={{ width: `${pct}%` }} />
          </div>
          <TextPreview text={c.text} name={c.name} onOpen={openText} />
        </div>
        <div className="pl-cnt">
          {Math.min(c.sigs, POLITICS.NEED)}/{POLITICS.NEED}
        </div>
        {btn}
      </div>
    );
  };

  return (
    <div className="pl-page">
      <Countdown untilMs={t.signupEnd} label="İmzaların bitmesine" />
      <div className="pl-bal">
        Bakiyen: <b>{nf(gold)}</b> altın
      </div>
      <button
        type="button"
        className="pl-apply"
        disabled={applyState.dis}
        onClick={() => {
          setDraft('');
          setAsk({ kind: 'apply' });
        }}
      >
        <span className="pl-apply-ic">🏛️</span>
        <span>
          <strong>{applyState.title}</strong>
          <span>{applyState.sub}</span>
        </span>
      </button>
      {mine && <MyText text={mine.text} run={run} busy={busy} />}
      {!eligible && <p className="pl-note">🔒 Seçimlere katılmak için başlangıç görevlerini tamamla.</p>}

      <h2 className="pl-h2">
        İmza bekleyen adaylar <small>{pending.length} aday</small>
      </h2>
      {pending.length ? pending.map((c) => row(c, false)) : <div className="pl-empty">Şu an imza bekleyen aday yok.</div>}

      <h2 className="pl-h2">
        Adaylar <small>{full.length} aday</small>
      </h2>
      {full.length ? full.map((c) => row(c, true)) : <div className="pl-empty">Henüz {POLITICS.NEED} imzaya ulaşan aday yok.</div>}

      {ask?.kind === 'apply' && (
        <Confirm
          icon="🏛️"
          title="Aday ol"
          lines={[`💰 Başvuru ücreti: ${nf(POLITICS.FEE)} altın (iade yok)`, `✍️ Gereken imza: ${POLITICS.NEED}`, '🔒 Adaylık geri alınamaz']}
          confirmLabel="Onayla"
          busy={busy === 'apply'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await run('apply', { text: draft }, { success: 'Başvurun onaylandı. İmza toplamaya başla!' });
            if (r) setAsk(null);
          }}
        >
          <textarea className="pl-textarea" maxLength={POLITICS.TEXT_MAX} placeholder="Seçmenlere ne söylemek istersin? (isteğe bağlı)" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
          <small className="pl-count">
            {draft.length}/{POLITICS.TEXT_MAX}
          </small>
        </Confirm>
      )}
      {ask?.kind === 'sign' && (
        <Confirm
          icon="✍️"
          title={`${ask.c.name} adayına imza ver`}
          lines={['🔒 İmzan geri alınamaz', '🚫 İmza atarsan bu seçimde aday olamazsın']}
          confirmLabel="İmza at"
          busy={busy === 'sign'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await run('sign', { cand: ask.c.uid }, { success: `${ask.c.name} adayına imza attın.` });
            if (r) setAsk(null);
          }}
        />
      )}
    </div>
  );
}

function MyText({ text, run, busy }) {
  const [v, setV] = useState(text || '');
  const [open, setOpen] = useState(false);
  useEffect(() => setV(text || ''), [text]);
  const changed = (v || '').trim() !== (text || '').trim();
  return (
    <div className="pl-mytext">
      <button type="button" className="pl-mytext-head" onClick={() => setOpen((o) => !o)}>
        📝 Seçim yazın {text ? '' : '· boş'} <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <textarea className="pl-textarea" maxLength={POLITICS.TEXT_MAX} placeholder="Vaatlerini, planlarını yaz…" value={v} onChange={(e) => setV(e.target.value)} rows={5} />
          <div className="pl-mytext-foot">
            <small className="pl-count">
              {v.length}/{POLITICS.TEXT_MAX}
            </small>
            <Btn small disabled={!changed} busy={busy === 'setText'} onClick={() => run('setText', { text: v }, { success: 'Yazın güncellendi.' })}>
              Kaydet
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// OYLAMA
// =============================================================================
function ElectionView({ cycle, cy, me, player, run, busy, openText }) {
  const [ask, setAsk] = useState(null);
  const eligible = Boolean(player?.onboardingRewardClaimed);
  const fin = (cy?.finalists || []).map((uid) => ({ uid, ...(cy?.cands?.[uid] || {}) }));
  const t = cycleTimes(cycle);
  const mine = cy?.cands?.[player?.uid] && (cy?.finalists || []).includes(player?.uid);
  return (
    <div className="pl-page">
      <Countdown untilMs={t.voteEnd} label="Oylamanın bitmesine" />
      {me.voted ? (
        <div className="pl-status">✅ {me.vote && cy?.cands?.[me.vote] ? `${cy.cands[me.vote].name} adayına oy verdin.` : 'Oyunu kullandın.'} Sayım 21:00'de başlar.</div>
      ) : eligible ? (
        <p className="pl-note">Oyunu bir adaya ver. Oylar gizli; verdikten sonra değiştiremezsin.</p>
      ) : (
        <p className="pl-note">🔒 Oy vermek için başlangıç görevlerini tamamla.</p>
      )}
      {mine && <MyText text={cy.cands[player.uid].text} run={run} busy={busy} />}
      {fin.map((c, i) => (
        <div key={c.uid} className={`pl-row${me.vote === c.uid ? ' mine' : ''}`}>
          <Av avatar={c.avatar} color={COLORS[i] || OTHER} />
          <div className="pl-info">
            <div className="pl-name">
              {c.name}
              {c.uid === player?.uid && <i> (sen)</i>}
            </div>
            <TextPreview text={c.text} name={c.name} onOpen={openText} />
          </div>
          {me.vote === c.uid ? (
            <span className="pl-tag ok">Oyun</span>
          ) : (
            !me.voted && (
              <Btn small disabled={!eligible || Boolean(busy)} onClick={() => setAsk(c)}>
                Oy ver
              </Btn>
            )
          )}
        </div>
      ))}
      {ask && (
        <Confirm
          icon="🗳️"
          title={`${ask.name} adayına oy ver`}
          lines={['🔒 Oyunu onaylarsan geri alamazsın', '🤫 Oylar gizli']}
          confirmLabel="Oy ver"
          busy={busy === 'vote'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await run('vote', { cand: ask.uid }, { success: 'Oyun sandıkta!' });
            if (r) setAsk(null);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// SAYIM / SONUÇ
// =============================================================================
function pt(a, r) {
  return [100 + r * Math.sin(a), 100 - r * Math.cos(a)];
}
function Pie({ rows, total }) {
  const [hover, setHover] = useState(null);
  if (!total)
    return (
      <svg viewBox="0 0 200 200" className="pl-pie" role="img" aria-label="Henüz oy sayılmadı">
        <circle cx="100" cy="100" r="95" fill="#1b2335" />
        <text x="100" y="106" textAnchor="middle" fontSize="13" className="pl-pie-empty">
          Sayım başlıyor…
        </text>
      </svg>
    );
  let a0 = 0;
  const parts = [];
  const labels = [];
  for (const x of rows) {
    if (!x.v) continue;
    const f = x.v / total;
    const a1 = a0 + f * Math.PI * 2;
    const tip = `${x.name}: %${pc(f * 100)} · ${nf(x.v)} oy`;
    const on = hover === x.uid;
    if (f >= 0.9999) parts.push(<circle key={x.uid} cx="100" cy="100" r="95" fill={x.color} stroke="#0e1320" strokeWidth="2"><title>{tip}</title></circle>);
    else {
      const p0 = pt(a0, 95);
      const p1 = pt(a1, 95);
      parts.push(
        <path
          key={x.uid}
          className={`pl-slice${on ? ' on' : ''}`}
          d={`M100 100 L${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A95 95 0 ${f > 0.5 ? 1 : 0} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} Z`}
          fill={x.color}
          stroke="#0e1320"
          strokeWidth="2"
          onMouseEnter={() => setHover(x.uid)}
          onMouseLeave={() => setHover(null)}
        >
          <title>{tip}</title>
        </path>
      );
    }
    if (f >= 0.08) {
      const m = f >= 0.9999 ? [100, 100] : pt((a0 + a1) / 2, 60);
      labels.push(
        <text key={`t${x.uid}`} x={m[0].toFixed(1)} y={m[1].toFixed(1)} textAnchor="middle" className="pl-pie-lbl">
          <tspan x={m[0].toFixed(1)} dy="-1" fontSize="12">
            %{pc(f * 100)}
          </tspan>
          <tspan x={m[0].toFixed(1)} dy="13" fontSize="10" fontWeight="400">
            {nf(x.v)} oy
          </tspan>
        </text>
      );
    }
    a0 = a1;
  }
  return (
    <svg viewBox="0 0 200 200" className="pl-pie" role="img" aria-label={rows.map((x) => `${x.name} %${pc(total ? (x.v / total) * 100 : 0)}`).join(', ')}>
      {parts}
      {labels}
    </svg>
  );
}

function CountView({ cycle, cy, count, phase, openText }) {
  const fin = cy?.finalists || [];
  const counts = count?.counts || {};
  const total = Number(count?.total || 0);
  const rows = fin
    .map((uid, i) => ({ uid, name: cy?.cands?.[uid]?.name || 'Aday', avatar: cy?.cands?.[uid]?.avatar, text: cy?.cands?.[uid]?.text, v: Number(counts[uid] || 0), color: COLORS[i] || OTHER, i }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const done = phase === 'results' || count?.done;
  const winner = done ? rows.find((r) => r.uid === (count?.winner || cy?.result?.winner)) : rows[0]?.v ? rows[0] : null;
  const t = cycleTimes(cycle);
  return (
    <div className="pl-page">
      {!done && <Countdown untilMs={t.countEnd} label="Sayımın bitmesine" />}
      {winner && (
        <div className={`pl-win${done ? ' final' : ''}`}>
          <span className="pl-crown">{done ? '🏆' : '📈'}</span>
          <div>
            <div className="pl-win-t">{done ? 'Seçimi kazanan' : 'Şu an önde'}</div>
            <div className="pl-win-n">{winner.name}</div>
            <div className="pl-win-d">
              %{pc(total ? (winner.v / total) * 100 : 0)} · {nf(winner.v)} oy
              {done && (count?.tie || cy?.result?.tie) ? ' · eşitlik kurayla bozuldu' : ''}
            </div>
          </div>
        </div>
      )}
      <div className="pl-chart">
        <Pie rows={rows} total={total} />
        <div className="pl-total">{done ? `Toplam ${nf(total)} geçerli oy` : `${nf(total)} oy sayıldı`}</div>
      </div>
      {rows.map((x) => (
        <div key={x.uid} className="pl-row pl-res" style={{ borderLeftColor: x.color }}>
          <Av avatar={x.avatar} />
          <div className="pl-info">
            <div className="pl-name">{x.name}</div>
            <div className="pl-sub">{nf(x.v)} oy</div>
            <TextPreview text={x.text} name={x.name} onOpen={openText} />
          </div>
          <div className="pl-pct">%{pc(total ? (x.v / total) * 100 : 0)}</div>
        </div>
      ))}
      {done && <p className="pl-note">Yeni başkan bu gece 00:00'da göreve başladı.</p>}
    </div>
  );
}

// =============================================================================
export default function PoliticsScreen({ onClose }) {
  useBackClose(true, onClose);
  const { player } = usePlayer();
  const { user } = useAuth();
  const pl = useMemo(() => ({ ...(player || {}), uid: user?.uid || null }), [player, user?.uid]);
  const { state, phase, cycle } = usePoliticsState();
  const cy = useLiveDoc(cycle ? `politicsCycles/${cycle}` : null);
  const count = useLiveDoc(cycle && (phase === 'counting' || phase === 'results') ? `politicsCycles/${cycle}/live/count` : null);
  const me = useMemo(() => polOfPlayer(player, cycle), [player, cycle]);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const showToast = (text, kind) => {
    setToast({ text, kind, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), kind === 'err' ? 4200 : 2600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const { run, busy } = useRun(showToast);
  const [text, setText] = useState(null);

  const title = phase === 'signup' ? 'Adaylık ve İmza' : phase === 'election' ? 'Oylama' : phase === 'counting' ? 'Sayım' : phase === 'results' ? 'Sonuçlar' : 'Seçim';
  let body;
  if (state === undefined || (cycle && cy === undefined)) body = <div className="gx-loading">Yükleniyor…</div>;
  else if (phase === 'wait') body = <div className="pl-empty big">⏳ Seçim takvimi güncelleniyor… birkaç dakika sonra tekrar bak.</div>;
  else if (phase === 'signup') body = <SignupView cycle={cycle} cands={cy?.cands || {}} me={me} player={pl} run={run} busy={busy} openText={setText} />;
  else if (phase === 'election') body = <ElectionView cycle={cycle} cy={cy} me={me} player={pl} run={run} busy={busy} openText={setText} />;
  else if (phase === 'counting' || phase === 'results') body = <CountView cycle={cycle} cy={cy} count={count} phase={phase} openText={setText} />;
  else
    body = (
      <div className="pl-empty big">
        🗳️ Şu an seçim yok.
        {state?.nextSignupDay ? (
          <small>
            Sonraki adaylık dönemi: {state.nextSignupDay.slice(8, 10)}.{state.nextSignupDay.slice(5, 7)} Cuma 00:00
          </small>
        ) : null}
      </div>
    );

  return createPortal(
    <div className="gx-full pl-full" role="dialog" aria-label="Belediye Başkanlığı Seçimi">
      <div className="gx-full-top">
        <span className="gx-full-title">🗳️ Başkanlık Seçimi · {title}</span>
        <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="gx-full-body">
        <div className="gx-root pl-root">{body}</div>
      </div>
      {text && (
        <div className="gx-root pl-root pl-sheet-layer">
          <Sheet title={text.name} icon="📜" onClose={() => setText(null)}>
            <p className="pl-fulltext">{text.text}</p>
          </Sheet>
        </div>
      )}
      {toast && (
        <div key={toast.id} className={`gx-toast gx-toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </div>,
    document.body
  );
}
