/* eslint-disable react-refresh/only-export-components */
// Çete arayüzünün küçük yapı taşları: logo, rütbe rozeti, kart, sekme,
// alt sayfa (sheet), onay penceresi, ilerleme çubuğu, boş durum.
import InfoIcon from '../InfoIcon/InfoIcon';
import { RANK_ICONS, RANK_LABELS, fmt } from './gangConstants';

export function Logo({ logo, size = 44, className = '' }) {
  const l = logo || { emoji: '🏴', color: '#ffffff', bg: '#101318' };
  return (
    <span
      className={`gx-logo ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.55, background: l.bg, boxShadow: `0 0 0 2px ${l.color}, 0 0 14px ${l.color}55` }}
      aria-hidden="true"
    >
      {l.emoji}
    </span>
  );
}

export function RankBadge({ rank, small = false }) {
  if (!rank) return null;
  return (
    <span className={`gx-rank gx-rank-${rank}${small ? ' gx-rank-sm' : ''}`}>
      <span aria-hidden="true">{RANK_ICONS[rank]}</span> {RANK_LABELS[rank] || rank}
    </span>
  );
}

export function Gold({ value, big = false }) {
  return (
    <span className={`gx-gold${big ? ' gx-gold-big' : ''}`}>
      <span className="gold-coin-icon" style={{ width: big ? 20 : 13, height: big ? 20 : 13 }} />
      {fmt(value)}
    </span>
  );
}

export function Card({ children, className = '', onClick, accent }) {
  return (
    <div
      className={`gx-card ${onClick ? 'gx-card-click' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={accent ? { borderColor: accent } : undefined}
    >
      {children}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="gx-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`gx-tab${value === t.id ? ' active' : ''}${t.alert ? ' alert' : ''}`} onClick={() => onChange(t.id)}>
          <span aria-hidden="true">{t.icon}</span> {t.label}
          {t.count > 0 && <span className="gx-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="gx-chips">
      {options.map((o) => (
        <button key={o.id} className={`gx-chip${value === o.id ? ' active' : ''}`} onClick={() => onChange(o.id)} disabled={o.disabled}>
          {o.icon && <span aria-hidden="true">{o.icon} </span>}
          {o.label}
          {o.count > 0 && <span className="gx-tab-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Btn({ children, onClick, busy = false, disabled = false, kind = 'primary', small = false, block = false, title }) {
  return (
    <button
      className={`gx-btn gx-btn-${kind}${small ? ' gx-btn-sm' : ''}${block ? ' gx-btn-block' : ''}${busy ? ' busy' : ''}`}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
    >
      {busy ? <span className="gx-spinner" aria-label="Yükleniyor" /> : children}
    </button>
  );
}

export function Sheet({ title, onClose, children, icon }) {
  return (
    <div className="gx-sheet-backdrop" onClick={onClose}>
      <div className="gx-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="gx-sheet-head">
          <span className="gx-sheet-title">
            {icon && <span aria-hidden="true">{icon} </span>}
            {title}
          </span>
          <button className="gx-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div className="gx-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// Ciddi işlemler için net sonuç gösteren onay penceresi.
export function Confirm({ icon = '⚠️', title, lines = [], confirmLabel = 'Onayla', danger = false, onConfirm, onCancel, busy = false, children }) {
  return (
    <div className="gx-sheet-backdrop gx-center" onClick={onCancel}>
      <div className={`gx-confirm${danger ? ' danger' : ''}`} onClick={(e) => e.stopPropagation()} role="alertdialog">
        <div className="gx-confirm-icon" aria-hidden="true">
          {icon}
        </div>
        <p className="gx-confirm-title">{title}</p>
        {lines.length > 0 && (
          <ul className="gx-confirm-lines">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        {children}
        <div className="gx-confirm-actions">
          <Btn kind="ghost" onClick={onCancel} disabled={busy}>
            Vazgeç
          </Btn>
          <Btn kind={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Bar({ value, max, color = 'var(--neon-cyan)', label, height = 8, blocked = false }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`gx-bar-wrap${blocked ? ' blocked' : ''}`}>
      {label && <div className="gx-bar-label">{label}</div>}
      <div className="gx-bar" style={{ height }}>
        <div className="gx-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function Empty({ icon = '🌙', text, children }) {
  return (
    <div className="gx-empty">
      <div className="gx-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function Info({ text }) {
  return <InfoIcon text={text} />;
}

export function Stat({ icon, label, children }) {
  return (
    <div className="gx-stat">
      <span className="gx-stat-label">
        <span aria-hidden="true">{icon}</span> {label}
      </span>
      <span className="gx-stat-val">{children}</span>
    </div>
  );
}

// Sayı girişi — klavye YOK, oyunun geri kalanındaki gibi buton sistemi:
//   [ − ]  değer  [ + ]
//   hızlı ekleme: 10 · 100 · 1K · 10K · 100K · 1M · MAX · Sıfırla
// Hızlı butonlar değere EKLER (oyundaki QuantityStepper ile aynı davranış).
export const GOLD_QUICK = [10, 100, 1000, 10_000, 100_000, 1_000_000];
const shortNum = (q) => (q >= 1_000_000 ? `${q / 1_000_000}M` : q >= 1000 ? `${q / 1000}K` : String(q));

export function AmountInput({ value, onChange, max, min = 0, step = 1, quick = GOLD_QUICK }) {
  const num = Number(value) || 0;
  const hi = max != null ? Math.max(min, Math.floor(max)) : Infinity;
  const clamp = (v) => Math.min(hi, Math.max(min, Math.floor(v)));
  return (
    <div className="gx-amount">
      <div className="gx-amount-row">
        <button type="button" className="gx-amount-step" disabled={num <= min} onClick={() => onChange(clamp(num - step))} aria-label="Azalt">
          −
        </button>
        <span className="gx-amount-value">{fmt(num)}</span>
        <button type="button" className="gx-amount-step" disabled={num >= hi} onClick={() => onChange(clamp(num + step))} aria-label="Artır">
          +
        </button>
      </div>
      <div className="gx-amount-quick">
        {quick
          .filter((q) => q <= hi)
          .map((q) => (
            <button key={q} type="button" disabled={num >= hi} onClick={() => onChange(clamp(num + q))}>
              +{shortNum(q)}
            </button>
          ))}
        {max != null && hi > 0 && (
          <button type="button" className="max" disabled={num >= hi} onClick={() => onChange(hi)}>
            MAX
          </button>
        )}
        {num > min && (
          <button type="button" className="reset" onClick={() => onChange(min)}>
            Sıfırla
          </button>
        )}
      </div>
    </div>
  );
}
