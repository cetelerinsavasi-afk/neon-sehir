import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './NeonBooklet.css';

// v197 — Polis / İmam kitapçıkları için ortak, yeni tasarım (oyunun güncel cam-panel görünümü):
// üstte rozet + başlık, sayfa noktaları, her sayfada ikonlu kısa maddeler, altta büyük gezinme düğmeleri.
// pages: [{ title, icon, body: [string] }] · theme: 'police' | 'imam'
export default function NeonBooklet({ pages, onClose, theme = 'police', badge, title }) {
  const [page, setPage] = useState(0);
  const cur = pages[page] || pages[0];
  const last = page >= pages.length - 1;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages.length - 1, p + 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pages.length]);
  return createPortal(
    <div className="nbk-bg" onClick={onClose}>
      <div className={`nbk nbk-${theme}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="nbk-head">
          <span className="nbk-badge" aria-hidden="true">{badge}</span>
          <div className="nbk-head-main">
            <small>{title}</small>
            <b>{cur.title}</b>
          </div>
          <button className="nbk-x" onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <div className="nbk-dots" role="tablist">
          {pages.map((p, i) => (
            <button key={p.title} className={i === page ? 'on' : i < page ? 'seen' : ''} onClick={() => setPage(i)} aria-label={p.title} />
          ))}
        </div>
        <ul className="nbk-body" key={page}>
          {cur.body.map((line, i) => (
            <li key={i} style={{ animationDelay: `${i * 40}ms` }}>
              <i aria-hidden="true">{cur.icon || '•'}</i>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="nbk-nav">
          <button className="nbk-btn ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Önceki</button>
          <span className="nbk-count">{page + 1} / {pages.length}</span>
          {last ? (
            <button className="nbk-btn go" onClick={onClose}>Anladım ✓</button>
          ) : (
            <button className="nbk-btn go" onClick={() => setPage((p) => p + 1)}>Sonraki →</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
