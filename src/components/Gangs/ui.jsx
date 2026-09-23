/* eslint-disable react-refresh/only-export-components */
// Çete arayüzünün küçük yapı taşları: logo, rütbe rozeti, kart, sekme,
// alt sayfa (sheet), onay penceresi, ilerleme çubuğu, boş durum.
import { useState } from 'react';
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

export function Bar({ value, max, color = 'var(--neon-cyan)', label, height = 8 }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="gx-bar-wrap">
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

export function AmountInput({ value, onChange, max, placeholder = 'Miktar', quick = [] }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`gx-amount${focused ? ' focus' : ''}`}>
      <input
        inputMode="numeric"
        value={value ? fmt(value) : ''}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const n = Number(String(e.target.value).replace(/\D/g, '')) || 0;
          onChange(max != null ? Math.min(n, Math.max(0, max)) : n);
        }}
      />
      {max != null && (
        <button className="gx-amount-max" onClick={() => onChange(Math.max(0, max))} type="button">
          MAKS
        </button>
      )}
      {quick.length > 0 && (
        <div className="gx-amount-quick">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => onChange(max != null ? Math.min(q, max) : q)}>
              {q >= 1_000_000 ? `${q / 1_000_000}M` : q >= 1000 ? `${q / 1000}K` : q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
