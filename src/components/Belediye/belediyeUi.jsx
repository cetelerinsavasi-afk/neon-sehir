/* eslint-disable react-refresh/only-export-components */
// v127 — Belediye ekranının küçük yapı taşları (gx- tasarım dili + bd- ekleri)
import { useEffect, useState } from 'react';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { Btn } from '../Gangs/ui';
import { RATE_GROUPS, RATE_BY_ID, boundsOf, validateNext, isGoodChange, fmtRate } from '../../../functions/belediyeRates.js';
import { canMinistry } from '../../../functions/belediye.js';
import { useBelediye } from './BelediyeContext';

export const nf = (v) => Math.round(Number(v) || 0).toLocaleString('tr-TR');
export const dayLabel = (k) => (k ? `${k.slice(8, 10)}.${k.slice(5, 7)}` : '');
export const hoursLeft = (untilMs, now = Date.now()) => Math.max(1, Math.ceil((Number(untilMs || 0) - now) / 3_600_000));
// Periyodik yeniden çizim için şimdiki zaman
export function useTick(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
export const MIN_ORDER = ['sanayi', 'ticaret', 'guvenlik', 'kultur', 'yonetim'];

export function Signed({ v, unit = true }) {
  const n = Math.round(Number(v) || 0);
  return (
    <span className={n > 0 ? 'bd-up' : n < 0 ? 'bd-dn' : ''}>
      {n > 0 ? '+' : n < 0 ? '−' : ''}
      {nf(Math.abs(n))}
      {unit ? ' 🪙' : ''}
    </span>
  );
}

export function Person({ name, avatar, sub, size = 40, right }) {
  return (
    <div className="bd-person">
      {avatar ? <AvatarSvg avatar={avatar} size={size} rounded /> : <span className="bd-ph" style={{ width: size, height: size }} aria-hidden="true" />}
      <div className="bd-person-main">
        <b>{name}</b>
        {sub && <small>{sub}</small>}
      </div>
      {right}
    </div>
  );
}

// Basit tablo: cols = [{ k, label, num }], rows = [obj], foot = obj
export function Table({ cols, rows, foot }) {
  return (
    <div className="bd-tbl-wrap">
      <table className="bd-tbl">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.k} className={c.num ? 'num' : ''}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key ?? i}>
              {cols.map((c) => (
                <td key={c.k} className={c.num ? 'num' : ''}>
                  {r[c.k]}
                </td>
              ))}
            </tr>
          ))}
          {foot && (
            <tr className="tot">
              {cols.map((c) => (
                <td key={c.k} className={c.num ? 'num' : ''}>
                  {foot[c.k]}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Kpis({ items }) {
  return (
    <div className="bd-kpis">
      {items.filter(Boolean).map((it) => (
        <div key={it.label} className="bd-kpi">
          <small>{it.label}</small>
          <b>{it.value}</b>
          {it.sub && <i>{it.sub}</i>}
        </div>
      ))}
    </div>
  );
}

// Gelir – gider defteri (bir bakanlığın satırları)
export function Ledger({ m }) {
  const lines = m?.lines || [];
  if (!lines.length) return <p className="dim bd-note">Kayıt yok.</p>;
  const rows = lines.map((l) => ({
    key: `${l.kind}_${l.cat}`,
    label: String(l.label || l.cat).replace(/^Vergi · /, ''),
    in: l.kind === 'in' ? <span className="bd-up">+{nf(l.amount)}</span> : '',
    out: l.kind === 'out' ? <span className="bd-dn">−{nf(l.amount)}</span> : '',
  }));
  return (
    <>
      <Table
        cols={[
          { k: 'label', label: 'Kalem' },
          { k: 'in', label: 'Gelir', num: true },
          { k: 'out', label: 'Gider', num: true },
        ]}
        rows={rows}
        foot={{ label: 'Toplam', in: m.in ? `+${nf(m.in)}` : '0', out: m.out ? `−${nf(m.out)}` : '0' }}
      />
      <p className="bd-eq">
        +{nf(m.in)} − {nf(m.out)} = <Signed v={m.in - m.out} />
      </p>
    </>
  );
}

// =============================================================================
// Fiyat ve vergi belirleme (−/+). Değer: panel.next · sınır: boundsOf(cur, next)
// =============================================================================
function RateRow({ it, panel, can }) {
  const { run, busy, patchNext } = useBelediye();
  const cur = panel.cur[it.id];
  const val = panel.next[it.id];
  const [lo, hi] = boundsOf(panel.cur, panel.next, it.id);
  const diff = val - cur;
  const by = panel.nextBy?.[it.id]?.name;
  const tryStep = (dir) => {
    const v = val + dir * it.step;
    return v >= lo && v <= hi && !validateNext(panel.cur, { ...panel.next, [it.id]: v }) ? v : null;
  };
  const down = tryStep(-1);
  const up = tryStep(1);
  const set = async (v) => {
    if (v == null) return;
    const r = await run('setRate', { id: it.id, value: v }, { key: `rate_${it.id}` });
    if (r?.ok) patchNext(it.id, v);
  };
  const mine = busy === `rate_${it.id}`;
  return (
    <div className="bd-rate">
      <div className="bd-rate-name">
        <span>{it.label}</span>
        {diff !== 0 && (
          <small className={isGoodChange(it.unit, it.id, diff) ? 'bd-up' : 'bd-dn'}>
            {fmtRate(cur, it.unit)} → {fmtRate(val, it.unit)}
            {by ? ` · ${by}` : ''}
          </small>
        )}
      </div>
      <div className="bd-rate-ctl">
        <button className="bd-step" disabled={!can || down == null || Boolean(busy)} onClick={() => set(down)} aria-label="Azalt">
          −
        </button>
        <span className={`bd-rate-val${mine ? ' busy' : ''}`}>{fmtRate(val, it.unit)}</span>
        <button className="bd-step" disabled={!can || up == null || Boolean(busy)} onClick={() => set(up)} aria-label="Artır">
          +
        </button>
      </div>
    </div>
  );
}

export function RateEditor({ m }) {
  const { panel, panelErr, loadPanel, main, seat } = useBelediye();
  const groups = RATE_GROUPS.filter((g) => g.m === m);
  if (!panel)
    return panelErr ? (
      <div className="bd-note">
        <span className="gx-err-text">{panelErr}</span>{' '}
        <Btn small kind="ghost" onClick={loadPanel}>
          Tekrar dene
        </Btn>
      </div>
    ) : (
      <div className="gx-loading">Yükleniyor…</div>
    );
  const can = canMinistry(main, seat, m);
  return (
    <div className="gx-stack">
      <p className="dim bd-note">{can ? "Günde 1 adım · yarın 00:00'da yürürlüğe girer" : '👁️ Sadece görüntüleme'}</p>
      {groups.map((g) => (
        <div key={g.id} className="gx-card bd-rate-card">
          <div className="bd-card-title">{g.title}</div>
          {g.items.map((it) => (
            <RateRow key={it.id} it={RATE_BY_ID[it.id]} panel={panel} can={can} />
          ))}
        </div>
      ))}
    </div>
  );
}
