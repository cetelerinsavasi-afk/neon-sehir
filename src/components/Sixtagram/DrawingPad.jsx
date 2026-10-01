import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DRAW_BGS, DRAW_COLORS, DRAW_MAX_POINTS, DRAW_MAX_STROKES, DRAW_SIZE, DRAW_WIDTHS, drawStroke, renderDrawing, strokePointCount } from '../../lib/drawing';
import { useBackClose } from '../../lib/backStack';
import './DrawingPad.css';

// =============================================================================
// v72 — Sixtagram "🎨 Resim Çiz": boş tuval + renkler. Fırça darbeleri
// 0–1000 koordinatlarında tutulur (bkz. functions/drawingData.js); "Bitti"
// deyince çizim gönderinin eki olur ve paylaşınca fotoğraf gibi yayınlanır.
// =============================================================================
const MIN_STEP = 5; // ardışık iki nokta arası en az mesafe (mantıksal birim)

export default function DrawingPad({ initial, onDone, onCancel }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const strokesRef = useRef(initial?.strokes ? initial.strokes.map((s) => ({ ...s, p: [...s.p] })) : []);
  const curRef = useRef(null);
  const pxRef = useRef(0);
  const [bg, setBg] = useState(Number.isInteger(initial?.bg) ? initial.bg : 0);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const [showBg, setShowBg] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const bgRef = useRef(bg);
  bgRef.current = bg;

  useBackClose(true, onCancel);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !pxRef.current) return;
    const ctx = c.getContext('2d');
    renderDrawing(ctx, { bg: bgRef.current, strokes: strokesRef.current }, pxRef.current);
    if (curRef.current) drawStroke(ctx, curRef.current, pxRef.current / DRAW_SIZE);
  }, []);

  // tuval boyutu: kapsayıcı genişliği × cihaz piksel oranı
  useEffect(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return undefined;
    const fit = () => {
      const css = Math.floor(wrap.clientWidth);
      const px = Math.max(200, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
      c.style.width = `${css}px`;
      c.style.height = `${css}px`;
      c.width = px;
      c.height = px;
      pxRef.current = px;
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [bg, redraw]);

  const used = strokePointCount(strokesRef.current) + (curRef.current ? curRef.current.p.length / 2 : 0);
  const full = used >= DRAW_MAX_POINTS || strokesRef.current.length >= DRAW_MAX_STROKES;

  const toLogical = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * DRAW_SIZE);
    const y = Math.round(((e.clientY - r.top) / r.height) * DRAW_SIZE);
    return [Math.max(0, Math.min(DRAW_SIZE, x)), Math.max(0, Math.min(DRAW_SIZE, y))];
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (full || curRef.current) return;
    e.preventDefault();
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* yoksay */
    }
    setShowBg(false);
    setConfirmClear(false);
    const [x, y] = toLogical(e);
    curRef.current = { c: color, s: width, p: [x, y], id: e.pointerId };
    redraw();
  };
  const onMove = (e) => {
    const cur = curRef.current;
    if (!cur || cur.id !== e.pointerId) return;
    e.preventDefault();
    const total = strokePointCount(strokesRef.current) + cur.p.length / 2;
    if (total >= DRAW_MAX_POINTS) return;
    const [x, y] = toLogical(e);
    const lx = cur.p[cur.p.length - 2];
    const ly = cur.p[cur.p.length - 1];
    if (Math.hypot(x - lx, y - ly) < MIN_STEP) return;
    cur.p.push(x, y);
    redraw();
  };
  const onUp = (e) => {
    const cur = curRef.current;
    if (!cur || cur.id !== e.pointerId) return;
    curRef.current = null;
    strokesRef.current.push({ c: cur.c, s: cur.s, p: cur.p });
    redraw();
    bump();
  };

  const undo = () => {
    if (curRef.current) return;
    strokesRef.current.pop();
    setConfirmClear(false);
    redraw();
    bump();
  };
  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    strokesRef.current = [];
    setConfirmClear(false);
    redraw();
    bump();
  };
  const done = () => {
    if (!strokesRef.current.length) return;
    onDone({ type: 'drawing', bg, strokes: strokesRef.current.map((s) => ({ c: s.c, s: s.s, p: s.p })) });
  };

  const count = strokesRef.current.length;
  const pct = Math.min(100, Math.round((used / DRAW_MAX_POINTS) * 100));

  return createPortal(
    <div className="dp-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="dp-sheet" role="dialog" aria-label="Resim çiz">
        <div className="dp-head">
          <button className="dp-head-btn" onClick={onCancel}>
            Vazgeç
          </button>
          <span className="dp-title">🎨 Resim Çiz</span>
          <button className="dp-head-btn primary" disabled={!count} onClick={done}>
            Bitti
          </button>
        </div>

        <div className="dp-canvas-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="dp-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          {count === 0 && !curRef.current && <span className="dp-hint">Parmağınla çizmeye başla ✍️</span>}
        </div>

        <div className="dp-ink" title="Tuvalde kalan yer">
          <span className="dp-ink-bar" style={{ width: `${pct}%` }} />
        </div>
        {full && <p className="dp-full">Tuval doldu — birkaç darbeyi geri alarak yer açabilirsin.</p>}

        <div className="dp-tools">
          <button className="dp-tool" onClick={undo} disabled={!count}>
            ↩️ Geri al
          </button>
          <button className={`dp-tool${showBg ? ' on' : ''}`} onClick={() => setShowBg((v) => !v)}>
            <span className="dp-bg-dot" style={{ background: DRAW_BGS[bg] }} /> Tuval rengi
          </button>
          <button className={`dp-tool${confirmClear ? ' danger' : ''}`} onClick={clear} disabled={!count}>
            {confirmClear ? 'Emin misin?' : '🗑️ Temizle'}
          </button>
        </div>

        {showBg && (
          <div className="dp-row" aria-label="Tuval rengi">
            {DRAW_BGS.map((c, i) => (
              <button
                key={c}
                className={`dp-swatch bg${bg === i ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => setBg(i)}
                aria-label={`Tuval rengi ${i + 1}`}
              />
            ))}
          </div>
        )}

        <div className="dp-row" aria-label="Fırça kalınlığı">
          {DRAW_WIDTHS.map((w, i) => (
            <button key={w} className={`dp-size${width === i ? ' on' : ''}`} onClick={() => setWidth(i)} aria-label={['İnce', 'Orta', 'Kalın'][i]}>
              <span style={{ width: 4 + i * 6, height: 4 + i * 6, background: DRAW_COLORS[color] }} />
            </button>
          ))}
        </div>
        <div className="dp-row dp-colors" aria-label="Renkler">
          {DRAW_COLORS.map((c, i) => (
            <button key={c} className={`dp-swatch${color === i ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(i)} aria-label={`Renk ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
