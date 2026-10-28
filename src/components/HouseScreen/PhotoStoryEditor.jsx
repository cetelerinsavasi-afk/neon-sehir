import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DRAW_COLORS, DRAW_WIDTHS } from '../../../functions/drawingData.js';
import { drawPhotoOverlay, PHOTO_W, PHOTO_H, OVERLAY_MAX_TEXTS, OVERLAY_TEXT_MAX, OVERLAY_TEXT_SIZES, OVERLAY_MAX_STROKES, OVERLAY_MAX_POINTS } from '../../../functions/photoOverlay.js';
import './PhotoStoryEditor.css';

// =============================================================================
// v135 — Hikâye fotoğrafı düzenleyici (telefon ekranı gibi dikey 9:16).
//   • Fotoğraf, sunucunun çekim anında imzaladığı ekten çizilmiş GERÇEK karedir:
//     paylaşılan hikâye birebir bu görüntüdür (+ buradaki yazı/çizim katmanı).
//   • Aa: yazı ekle (renk, boy, kutulu) — sürükleyerek yerini seç, dokunarak düzenle.
//   • ✏️: fotoğrafın üstüne çiz (renk, kalınlık) · ↩️ geri al.
// =============================================================================
const MIN_STEP = 6;
const halt = (e) => e.stopPropagation();

export default function PhotoStoryEditor({ img, loading, error, busy, onShare, onClose }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [texts, setTexts] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [mode, setMode] = useState('move'); // move | draw
  const [color, setColor] = useState(1);
  const [width, setWidth] = useState(1);
  const [editing, setEditing] = useState(null); // { i (-1 yeni), t, c, s, b }
  const curRef = useRef(null);
  const dragRef = useRef(null);
  const [, setTick] = useState(0);

  // 9:16 kutuyu ekrana sığdır
  useEffect(() => {
    const el = boxRef.current?.parentElement;
    if (!el) return undefined;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      let w = W;
      let h = (W * 16) / 9;
      if (h > H) {
        h = H;
        w = (H * 9) / 16;
      }
      setSize({ w: Math.floor(w), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const overlay = useCallback(() => ({ texts, strokes: curRef.current ? [...strokes, curRef.current] : strokes }), [texts, strokes]);
  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(size.w * dpr);
    const ph = Math.round(size.h * dpr);
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, pw, ph);
    drawPhotoOverlay(ctx, overlay(), pw, ph);
  }, [overlay, size]);
  useEffect(() => {
    redraw();
  }, [redraw]);

  const toLogical = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [Math.max(0, Math.min(PHOTO_W, ((e.clientX - r.left) / r.width) * PHOTO_W)), Math.max(0, Math.min(PHOTO_H, ((e.clientY - r.top) / r.height) * PHOTO_H))];
  };
  // yazının yaklaşık kutusu (mantıksal birimler)
  const textBox = (t) => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    const size0 = OVERLAY_TEXT_SIZES[t.s] || 66;
    ctx.font = `800 ${size0}px system-ui, sans-serif`;
    const lines = String(t.t).split(/\n/);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size0 * 0.7;
    const h = lines.length * size0 * 1.18 + size0 * 0.4;
    return { x0: t.x - w / 2, x1: t.x + w / 2, y0: t.y - h / 2, y1: t.y + h / 2 };
  };
  const hitText = (x, y) => {
    for (let i = texts.length - 1; i >= 0; i--) {
      const b = textBox(texts[i]);
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return i;
    }
    return -1;
  };
  const pointCount = () => strokes.reduce((a, s) => a + s.p.length / 2, 0);

  const onDown = (e) => {
    if (loading || !img) return;
    e.preventDefault();
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* yoksay */
    }
    const [x, y] = toLogical(e);
    if (mode === 'draw') {
      if (strokes.length >= OVERLAY_MAX_STROKES || pointCount() >= OVERLAY_MAX_POINTS) return;
      curRef.current = { c: color, s: width, p: [Math.round(x), Math.round(y)], id: e.pointerId };
      redraw();
      return;
    }
    const i = hitText(x, y);
    if (i >= 0) dragRef.current = { i, dx: texts[i].x - x, dy: texts[i].y - y, id: e.pointerId, moved: false, sx: x, sy: y };
  };
  const onMove = (e) => {
    const cur = curRef.current;
    if (cur && cur.id === e.pointerId) {
      if (pointCount() + cur.p.length / 2 >= OVERLAY_MAX_POINTS) return;
      const [x, y] = toLogical(e);
      const lx = cur.p[cur.p.length - 2];
      const ly = cur.p[cur.p.length - 1];
      if (Math.hypot(x - lx, y - ly) < MIN_STEP) return;
      cur.p.push(Math.round(x), Math.round(y));
      redraw();
      return;
    }
    const d = dragRef.current;
    if (d && d.id === e.pointerId) {
      const [x, y] = toLogical(e);
      if (Math.hypot(x - d.sx, y - d.sy) > 12) d.moved = true;
      setTexts((arr) => arr.map((t, k) => (k === d.i ? { ...t, x: Math.round(Math.max(0, Math.min(PHOTO_W, x + d.dx))), y: Math.round(Math.max(0, Math.min(PHOTO_H, y + d.dy))) } : t)));
    }
  };
  const onUp = (e) => {
    const cur = curRef.current;
    if (cur && cur.id === e.pointerId) {
      curRef.current = null;
      setStrokes((s) => [...s, { c: cur.c, s: cur.s, p: cur.p }]);
      return;
    }
    const d = dragRef.current;
    if (d && d.id === e.pointerId) {
      dragRef.current = null;
      if (!d.moved) setEditing({ i: d.i, ...texts[d.i] });
    }
    setTick((n) => n + 1);
  };

  const saveText = () => {
    const t = String(editing.t || '').trim().slice(0, OVERLAY_TEXT_MAX);
    if (editing.i >= 0) {
      setTexts((arr) => (t ? arr.map((x, k) => (k === editing.i ? { ...x, t, c: editing.c, s: editing.s, b: editing.b } : x)) : arr.filter((_, k) => k !== editing.i)));
    } else if (t) {
      setTexts((arr) => [...arr, { t, x: PHOTO_W / 2, y: Math.round(PHOTO_H * (0.3 + arr.length * 0.09)), c: editing.c, s: editing.s, b: editing.b }]);
    }
    setEditing(null);
    setMode('move');
  };

  const share = () => {
    const o = { texts, strokes };
    onShare(o.texts.length || o.strokes.length ? o : null);
  };

  return createPortal(
    <div className="pse-root" onClick={halt} onPointerDown={halt} role="dialog" aria-label="Hikâye fotoğrafı">
      <div className="pse-top">
        <button className="pse-ic" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
        <span className="pse-sp" />
        {mode === 'draw' && strokes.length > 0 && (
          <button className="pse-ic" onClick={() => setStrokes((s) => s.slice(0, -1))} aria-label="Geri al">
            ↩️
          </button>
        )}
        <button className={`pse-ic${mode === 'draw' ? ' on' : ''}`} disabled={!img} onClick={() => setMode((m) => (m === 'draw' ? 'move' : 'draw'))} aria-label="Çiz">
          ✏️
        </button>
        <button className="pse-ic pse-aa" disabled={!img || texts.length >= OVERLAY_MAX_TEXTS} onClick={() => setEditing({ i: -1, t: '', c: 1, s: 1, b: 0 })} aria-label="Yazı ekle">
          Aa
        </button>
      </div>
      <div className="pse-stage">
        <div className="pse-photo" ref={boxRef} style={{ width: size.w, height: size.h }}>
          {img && <img src={img} alt="" draggable={false} />}
          {loading && <div className="pse-loading">📸</div>}
          {error && !loading && <div className="pse-loading pse-err">{error}</div>}
          <canvas
            ref={canvasRef}
            className={`pse-canvas ${mode}`}
            style={{ width: size.w, height: size.h }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>
      {mode === 'draw' && (
        <div className="pse-tools">
          <div className="pse-row">
            {DRAW_WIDTHS.map((w, i) => (
              <button key={w} className={`pse-size${width === i ? ' on' : ''}`} onClick={() => setWidth(i)} aria-label={['İnce', 'Orta', 'Kalın'][i]}>
                <span style={{ width: 4 + i * 6, height: 4 + i * 6, background: DRAW_COLORS[color] }} />
              </button>
            ))}
          </div>
          <div className="pse-row">
            {DRAW_COLORS.map((c, i) => (
              <button key={c} className={`pse-sw${color === i ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(i)} aria-label={`Renk ${i + 1}`} />
            ))}
          </div>
        </div>
      )}
      <div className="pse-bottom">
        <button className="pse-share" disabled={!img || busy} onClick={share}>
          {busy ? 'Paylaşılıyor…' : '＋ Hikâyene ekle'}
        </button>
      </div>
      {editing && (
        <div className="pse-text-bg" onClick={saveText}>
          <div className="pse-text" onClick={halt}>
            <textarea
              autoFocus
              maxLength={OVERLAY_TEXT_MAX}
              rows={2}
              value={editing.t}
              placeholder="Yaz…"
              style={{ color: editing.b ? undefined : DRAW_COLORS[editing.c], background: editing.b ? DRAW_COLORS[editing.c] : 'transparent', fontSize: [20, 28, 38][editing.s] }}
              onChange={(e) => setEditing((x) => ({ ...x, t: e.target.value }))}
            />
            <div className="pse-row">
              {[0, 1, 2].map((s) => (
                <button key={s} className={`pse-chip${editing.s === s ? ' on' : ''}`} onClick={() => setEditing((x) => ({ ...x, s }))}>
                  <span style={{ fontSize: 11 + s * 4 }}>A</span>
                </button>
              ))}
              <button className={`pse-chip${editing.b ? ' on' : ''}`} onClick={() => setEditing((x) => ({ ...x, b: x.b ? 0 : 1 }))} aria-label="Kutulu">
                ▣
              </button>
              {editing.i >= 0 && (
                <button className="pse-chip" onClick={() => setEditing((x) => ({ ...x, t: '' }))} aria-label="Sil">
                  🗑️
                </button>
              )}
              <button className="pse-chip done" onClick={saveText}>
                Bitti
              </button>
            </div>
            <div className="pse-row">
              {DRAW_COLORS.map((c, i) => (
                <button key={c} className={`pse-sw${editing.c === i ? ' on' : ''}`} style={{ background: c }} onClick={() => setEditing((x) => ({ ...x, c: i }))} aria-label={`Renk ${i + 1}`} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
