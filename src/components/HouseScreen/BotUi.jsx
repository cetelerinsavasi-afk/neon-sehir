import { useMemo, useState } from 'react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { houseAction } from '../../services/gameActions';
import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { BOT_JOBS, BOT_JOB_BY_ID, BOT_OUTFITS, BOT_OUTFIT_BY_ID, BOT_TYPES, BOT_SKINS, BOT_HAIRS, BOT_MOODS, BOT_MOVES, BOT_LINES, BOT_LINE_MAX, BOT_NAME_MAX, botAvatar, botDefaults, botLabel, cleanBotConfig } from '../../../functions/botData.js';
import '../Venue/Venue.css';
import './BotUi.css';

// =============================================================================
// v132 — Bot arayüzü: 🛎️ Garson butonu (sol üst) + Bot düzenleyici (Tasarla ›
// bot seçili › ✏️ Düzenle). Uzun açıklama yok; önizleme ve seçimler.
// =============================================================================

export function BotWaiterButton({ bots }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="vn-waiter-wrap">
        <button className="vn-waiter-btn" onClick={() => setOpen(true)}>
          🛎️ <b>Garson</b>
        </button>
      </div>
      {open && (
        <div className="wk-sheet-bg" onClick={() => setOpen(false)}>
          <div className="wk-sheet bt-order" onClick={(e) => e.stopPropagation()}>
            <div className="bt-order-head">
              <b>🛎️ {bots.waiterName}</b>
              <button className="bz-x" onClick={() => setOpen(false)} aria-label="Kapat">
                ✕
              </button>
            </div>
            <div className="bt-order-grid">
              {bots.products.map((p) => (
                <button
                  key={p.product}
                  className="bt-order-item"
                  onClick={() => {
                    if (bots.order(p.product)) setOpen(false);
                  }}
                >
                  <span className="bt-order-emoji">{HOUSE_PRODUCTS[p.product]?.emoji || '🍽️'}</span>
                  <span>{HOUSE_PRODUCTS[p.product]?.label || p.product}</span>
                  {p.price > 0 ? (
                    <span className="bt-order-price">
                      <span className="gold-coin-icon" style={{ width: 11, height: 11 }} />
                      {p.price.toLocaleString('tr-TR')}
                    </span>
                  ) : (
                    <span className="bt-order-free">Bedava</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const TABS = [
  ['job', '👔 Kıyafet'],
  ['look', '🧍 Görünüm'],
  ['talk', '💬 Sözler'],
  ['move', '🚶 Hareket'],
];

export function BotEditor({ houseId, itemId, cfg: initial, onClose, flash }) {
  const [c, setC] = useState(() => {
    const base = cleanBotConfig(initial);
    // hiç düzenlenmemiş bot: mesleğin adı ve sözleri hazır gelir
    if (!initial) return { ...base, n: botDefaults(base).name, l: [...BOT_JOB_BY_ID[BOT_OUTFIT_BY_ID[base.o].job].lines] };
    return { ...base, l: [...base.l] };
  });
  const [tab, setTab] = useState('job');
  const [job, setJob] = useState(() => BOT_OUTFIT_BY_ID[c.o].job);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setC((x) => ({ ...x, ...patch }));
  const av = useMemo(() => botAvatar(c), [c]);
  const outfits = BOT_OUTFITS.filter((o) => o.job === job);
  const lines = [0, 1, 2].map((i) => c.l[i] || '');
  const jobOf = BOT_JOB_BY_ID[BOT_OUTFIT_BY_ID[c.o].job];
  const pickOutfit = (o) => {
    const was = BOT_OUTFIT_BY_ID[c.o].job;
    const j = BOT_JOB_BY_ID[o.job];
    // meslek değişince ad / sözler o mesleğinkine geçer (kullanıcı değiştirmediyse)
    const oldJob = BOT_JOB_BY_ID[was];
    const nameIsDefault = !c.n || c.n === oldJob.names[c.g];
    const linesAreDefault = c.l.join('|') === oldJob.lines.join('|');
    set({ o: o.id, ...(was !== o.job && nameIsDefault ? { n: j.names[c.g] } : {}), ...(was !== o.job && linesAreDefault ? { l: [...j.lines] } : {}) });
  };
  const save = async () => {
    setBusy(true);
    try {
      await houseAction({ op: 'botSet', houseId, i: itemId, cfg: { ...c, l: lines } });
      flash?.(`🤖 ${botLabel(c.n || jobOf.names[c.g])} hazır.`);
      onClose();
    } catch (err) {
      const m = String(err?.message || '');
      flash?.(m === 'bot-unsaved' ? 'Bot henüz kaydedilmedi, birazdan tekrar dene.' : m === 'bot-trial' ? 'Önce botu satın al.' : m || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-modal-bg" onClick={() => !busy && onClose()}>
      <div className="bz-modal bz bt-ed" onClick={(e) => e.stopPropagation()}>
        <div className="bt-ed-stage" style={{ '--jc': jobOf.col }}>
          <div className="bt-ed-av">
            <AvatarSvg avatar={av} variant="full" />
          </div>
          <div className="bt-ed-plate">
            {jobOf.e} {botLabel(c.n || jobOf.names[c.g])}
            {c.w ? ' · 🛎️' : ''}
          </div>
          <button className="bz-x bt-ed-x" disabled={busy} onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div className="bt-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="bt-pane">
          {tab === 'job' && (
            <>
              <div className="bt-chips">
                {BOT_JOBS.map((j) => (
                  <button key={j.id} className={job === j.id ? 'on' : ''} onClick={() => setJob(j.id)}>
                    {j.e} {j.n}
                  </button>
                ))}
              </div>
              <div className="bt-outfits">
                {outfits.map((o) => (
                  <button key={o.id} className={`bt-of${c.o === o.id ? ' on' : ''}`} onClick={() => pickOutfit(o)}>
                    <span className="bt-of-av">
                      <AvatarSvg avatar={botAvatar({ ...c, o: o.id })} variant="bust" />
                    </span>
                    <b>
                      {o.e} {o.n}
                    </b>
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === 'look' && (
            <>
              <div className="bt-row">
                {[
                  ['erkek', '👨'],
                  ['kadin', '👩'],
                ].map(([g, e]) => (
                  <button key={g} className={c.g === g ? 'on' : ''} onClick={() => set({ g, t: 0, h: null, ...(c.n === BOT_JOB_BY_ID[BOT_OUTFIT_BY_ID[c.o].job].names[c.g] ? { n: BOT_JOB_BY_ID[BOT_OUTFIT_BY_ID[c.o].job].names[g] } : {}) })}>
                    {e}
                  </button>
                ))}
              </div>
              <div className="bt-types">
                {BOT_TYPES[c.g].map((ty, i) => (
                  <button key={ty.n} className={`bt-of${c.t === i ? ' on' : ''}`} onClick={() => set({ t: i, h: null })}>
                    <span className="bt-of-av small">
                      <AvatarSvg avatar={botAvatar({ ...c, t: i, h: null })} variant="bust" />
                    </span>
                    <b>{ty.n}</b>
                  </button>
                ))}
              </div>
              <div className="bt-sw">
                {BOT_SKINS.map((s) => (
                  <i key={s} className={c.s === s ? 'on' : ''} style={{ background: s }} onClick={() => set({ s })} />
                ))}
              </div>
              <div className="bt-sw">
                {BOT_HAIRS.map((h) => (
                  <i key={h} className={(c.h || BOT_TYPES[c.g][c.t].hc) === h ? 'on' : ''} style={{ background: h }} onClick={() => set({ h })} />
                ))}
              </div>
              <div className="bt-row">
                {BOT_MOODS.map(([m, e]) => (
                  <button key={m} className={c.md === m ? 'on' : ''} onClick={() => set({ md: m })}>
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === 'talk' && (
            <>
              <input className="bt-input" maxLength={BOT_NAME_MAX} value={c.n} placeholder={jobOf.names[c.g]} onChange={(e) => set({ n: e.target.value })} aria-label="Ad" />
              {Array.from({ length: BOT_LINES }, (_, i) => (
                <input
                  key={i}
                  className="bt-input"
                  maxLength={BOT_LINE_MAX}
                  value={lines[i]}
                  placeholder={`💬 ${i + 1}`}
                  onChange={(e) => {
                    const l = [...lines];
                    l[i] = e.target.value;
                    set({ l });
                  }}
                />
              ))}
            </>
          )}
          {tab === 'move' && (
            <>
              <div className="bt-moves">
                {BOT_MOVES.map((m) => (
                  <button key={m.id} className={c.mv === m.id ? 'on' : ''} onClick={() => set({ mv: m.id })}>
                    <span>{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>
              <button className={`bt-waiter${c.w ? ' on' : ''}`} onClick={() => set({ w: !c.w })} aria-pressed={c.w}>
                🛎️ Garson {c.w ? '✓' : ''}
              </button>
            </>
          )}
        </div>
        <button className="bz-btn gold wide" disabled={busy} onClick={save}>
          {busy ? '…' : '💾 Kaydet'}
        </button>
      </div>
    </div>
  );
}
