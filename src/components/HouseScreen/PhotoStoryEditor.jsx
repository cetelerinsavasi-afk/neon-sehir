import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { usePlayer } from '../../hooks/usePlayer';
import {
  drawPhotoOverlay,
  ensureOverlayFonts,
  layoutText,
  PHOTO_W,
  PHOTO_H,
  OVERLAY_COLORS,
  OVERLAY_FONTS,
  OVERLAY_MAX_TEXTS,
  OVERLAY_TEXT_MAX,
  OVERLAY_MAX_STROKES,
  OVERLAY_MAX_POINTS,
  OVERLAY_Z_MIN,
  OVERLAY_Z_MAX,
  OVERLAY_W_MIN,
  OVERLAY_W_MAX,
  OVERLAY_WRAP_W,
  isLightColor,
} from '../../../functions/photoOverlay.js';
import './PhotoStoryEditor.css';

// =============================================================================
// v135 — Hikâye düzenleyici (Instagram hikâyesi gibi, dikey 9:16).
//   • Fotoğraf, sunucunun çekim anında imzaladığı ekten çizilmiş GERÇEK karedir:
//     paylaşılan hikâye birebir bu görüntü + buradaki yazı/çizim katmanıdır.
//   • Yazı: boş yere dokun ya da Aa → yazı tipi, boy (soldaki çubuk), renk, çerçeve
//     (yok / dolu / yarı saydam) ve çerçeve rengi, hizalama. Sürükle (ortada çizgiye
//     yapışır), iki parmakla büyüt/döndür, aşağıdaki çöpe sürükleyip sil.
//   • Çizim: kalem / fosforlu / neon / silgi, kalınlık (soldaki çubuk), renk, geri al.
// =============================================================================
const MIN_STEP = 5;
const SNAP = 22; // mantıksal birim
const CX = PHOTO_W / 2;
const CY = PHOTO_H / 2;
const halt = (e) => e.stopPropagation();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PALETTE = [1, 0, 12, 13, 14, 15, 16, 17, 18, 4, 5, 6, 7, 8, 9, 10, 11, 2, 3, 19];

const Ic = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  text: (
    <>
      <path d="M4 7V5h16v2M12 5v14M9 19h6" />
    </>
  ),
  draw: <path d="M3 17c3-6 5-9 7-9s1 6 3 6 3-5 5-5 2 3 3 4" />,
  undo: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" />,
  alignC: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignL: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  alignR: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6" />,
};
function I({ n, size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {Ic[n]}
    </svg>
  );
}
// Kutu (çerçeve) düğmesi: yok · dolu · yarı saydam
function BoxIcon({ b }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="2.5" y="3" width="19" height="18" rx="4" fill={b === 1 ? '#fff' : b === 2 ? 'rgba(255,255,255,.45)' : 'none'} stroke="#fff" strokeWidth="2" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontWeight="900" fill={b === 1 ? '#000' : '#fff'} fontFamily="system-ui">A</text>
    </svg>
  );
}
// Kalem ikonları
function PenIcon({ k, on }) {
  const col = on ? '#fff' : 'rgba(255,255,255,.55)';
  if (k === 3)
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round">
        <path d="M5 15l8-8 6 6-6 6H9z" />
        <path d="M9 19l-4-4" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round">
      {k === 0 && <path d="M7 20l1-4 9-9 3 3-9 9zM15 8l3 3" />}
      {k === 1 && <path d="M6 20h6M8 16l2-6h6l2 6zM10 10V5h6v5" />}
      {k === 2 && (
        <>
          <path d="M7 20l1-4 9-9 3 3-9 9z" />
          <path d="M3 4l2 2M12 2v2M3 11h2" />
        </>
      )}
    </svg>
  );
}

// Dikey kaydırıcı (Instagram'daki gibi solda)
function SideSlider({ value, min, max, onChange, preview }) {
  const ref = useRef(null);
  const set = (e) => {
    const r = ref.current.getBoundingClientRect();
    const f = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
    onChange(Math.round(min + f * (max - min)));
  };
  const f = (value - min) / (max - min);
  return (
    <div
      className="pse-slider"
      ref={ref}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <svg viewBox="0 0 20 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M4 2 L16 2 L11 198 L9 198 Z" fill="rgba(255,255,255,.35)" />
      </svg>
      <span className="pse-knob" style={{ top: `${(1 - f) * 100}%` }}>
        {preview}
      </span>
    </div>
  );
}

function ColorRow({ value, onPick }) {
  return (
    <div className="pse-colors">
      {PALETTE.map((i) => (
        <button key={i} className={`pse-sw${value === i ? ' on' : ''}`} style={{ background: OVERLAY_COLORS[i] }} onClick={() => onPick(i)} aria-label={`Renk ${i + 1}`} />
      ))}
    </div>
  );
}

export default function PhotoStoryEditor({ img, loading, error, busy, onShare, onClose }) {
  const { player } = usePlayer();
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [texts, setTexts] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [mode, setMode] = useState('view'); // view | text | draw
  const [edit, setEdit] = useState(null); // düzenlenen yazı { i, t, c, z, f, b, bc, a, r, x, y }
  const [colorFor, setColorFor] = useState('text'); // çerçeve açıkken renk: 'text' | 'box'
  const [pen, setPen] = useState({ c: 1, k: 0, w: 14 }); // k: 0 kalem · 1 fosforlu · 2 neon · 3 silgi
  const [guide, setGuide] = useState({ v: false, h: false });
  const [trash, setTrash] = useState(null); // null | { hot }
  const [, setFontTick] = useState(0);
  const curRef = useRef(null);
  const ptrs = useRef(new Map());
  const gest = useRef(null);
  const textsRef = useRef(texts);
  textsRef.current = texts;

  useEffect(() => {
    ensureOverlayFonts().then(() => setFontTick((n) => n + 1));
  }, []);

  // 9:16 kutuyu ekrana sığdır
  useEffect(() => {
    const el = stageRef.current;
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
    // düzenlenen yazı modal içinde gösterilir; tuvalde gizli
    const ts = mode === 'text' && edit?.i >= 0 ? texts.filter((_, k) => k !== edit.i) : texts;
    drawPhotoOverlay(ctx, { texts: ts, strokes: curRef.current ? [...strokes, curRef.current] : strokes }, pw, ph);
  }, [texts, strokes, size, mode, edit]);
  useEffect(() => {
    redraw();
  });

  const kpx = size.w / PHOTO_W; // CSS px / mantıksal birim
  const toLogical = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * PHOTO_W, ((e.clientY - r.top) / r.height) * PHOTO_H];
  };
  const hitText = (x, y) => {
    const ctx = canvasRef.current.getContext('2d');
    const ts = textsRef.current;
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      const L = layoutText(ctx, t, 1);
      const a = (-(t.r || 0) * Math.PI) / 180;
      const dx = x - t.x;
      const dy = y - t.y;
      const rx = dx * Math.cos(a) - dy * Math.sin(a);
      const ry = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(rx) <= L.w / 2 + 24 && Math.abs(ry) <= L.h / 2 + 24) return i;
    }
    return -1;
  };
  const pointCount = () => strokes.reduce((a, s) => a + s.p.length / 2, 0);
  const patchText = (i, p) => setTexts((arr) => arr.map((t, k) => (k === i ? { ...t, ...p } : t)));

  const openText = (i) => {
    if (i >= 0) {
      setEdit({ i, ...textsRef.current[i] });
      setColorFor(textsRef.current[i].b ? 'box' : 'text');
    } else {
      if (textsRef.current.length >= OVERLAY_MAX_TEXTS) return;
      setEdit({ i: -1, t: '', c: 1, z: 72, f: 0, b: 0, bc: 1, a: 0, r: 0, x: CX, y: Math.round(PHOTO_H * 0.42) });
      setColorFor('text');
    }
    setMode('text');
  };
  const saveText = () => {
    const t = String(edit.t || '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, OVERLAY_TEXT_MAX);
    const { i, ...rest } = edit;
    const item = { ...rest, t };
    if (i >= 0) setTexts((arr) => (t ? arr.map((x, k) => (k === i ? item : x)) : arr.filter((_, k) => k !== i)));
    else if (t) setTexts((arr) => [...arr, item]);
    setEdit(null);
    setMode('view');
  };

  // ---- dokunma hareketleri -------------------------------------------------------------
  const onDown = (e) => {
    if (loading || !img || mode === 'text') return;
    e.preventDefault();
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* yoksay */
    }
    const [x, y] = toLogical(e);
    ptrs.current.set(e.pointerId, { x, y, cx: e.clientX, cy: e.clientY });
    if (mode === 'draw') {
      if (ptrs.current.size > 1) return;
      if (pen.k === 3) {
        curRef.current = { erase: true, id: e.pointerId };
        eraseAt(x, y);
        return;
      }
      if (strokes.length >= OVERLAY_MAX_STROKES || pointCount() >= OVERLAY_MAX_POINTS) return;
      curRef.current = { c: pen.c, k: pen.k, w: pen.w, p: [Math.round(x), Math.round(y)], id: e.pointerId };
      redraw();
      return;
    }
    // görünüm: tek parmak → yazıyı sürükle · iki parmak → büyüt/döndür
    if (ptrs.current.size === 1) {
      const i = hitText(x, y);
      gest.current = { i, sx: x, sy: y, t0: Date.now(), moved: false, ox: i >= 0 ? textsRef.current[i].x : 0, oy: i >= 0 ? textsRef.current[i].y : 0 };
      if (i >= 0) setTrash({ hot: false });
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      let i = gest.current?.i ?? -1;
      if (i < 0) i = hitText((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (i >= 0) {
        const t = textsRef.current[i];
        gest.current = { i, pinch: true, d0: Math.hypot(b.cx - a.cx, b.cy - a.cy), a0: Math.atan2(b.cy - a.cy, b.cx - a.cx), z0: t.z, r0: t.r || 0, moved: true };
        setTrash(null);
      }
    }
  };
  const eraseAt = (x, y) => {
    const rad = pen.w * 0.8 + 6;
    setStrokes((arr) => arr.filter((s) => !s.p.some((v, j) => j % 2 === 0 && Math.hypot(v - x, s.p[j + 1] - y) < rad + s.w / 2)));
  };
  const onMove = (e) => {
    const P = ptrs.current.get(e.pointerId);
    if (!P) return;
    const [x, y] = toLogical(e);
    ptrs.current.set(e.pointerId, { x, y, cx: e.clientX, cy: e.clientY });
    if (mode === 'draw') {
      const cur = curRef.current;
      if (!cur || cur.id !== e.pointerId) return;
      if (cur.erase) {
        eraseAt(x, y);
        return;
      }
      if (pointCount() + cur.p.length / 2 >= OVERLAY_MAX_POINTS) return;
      const lx = cur.p[cur.p.length - 2];
      const ly = cur.p[cur.p.length - 1];
      if (Math.hypot(x - lx, y - ly) < MIN_STEP) return;
      cur.p.push(Math.round(clamp(x, 0, PHOTO_W)), Math.round(clamp(y, 0, PHOTO_H)));
      redraw();
      return;
    }
    const g = gest.current;
    if (!g || g.i < 0) return;
    if (g.pinch && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      const ang = Math.atan2(b.cy - a.cy, b.cx - a.cx);
      let r = g.r0 + ((ang - g.a0) * 180) / Math.PI;
      r = ((r + 540) % 360) - 180;
      if (Math.abs(r) < 4) r = 0; // düz hizaya yapışır
      patchText(g.i, { z: Math.round(clamp((g.z0 * d) / Math.max(10, g.d0), OVERLAY_Z_MIN, OVERLAY_Z_MAX)), r: Math.round(r) });
      return;
    }
    if (g.pinch) return;
    const dx = x - g.sx;
    const dy = y - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 10) return;
    g.moved = true;
    let nx = clamp(g.ox + dx, 0, PHOTO_W);
    let ny = clamp(g.oy + dy, 0, PHOTO_H);
    const v = Math.abs(nx - CX) < SNAP;
    const hz = Math.abs(ny - CY) < SNAP;
    if (v) nx = CX;
    if (hz) ny = CY;
    if ((v && !guide.v) || (hz && !guide.h)) navigator.vibrate?.(6);
    if (v !== guide.v || hz !== guide.h) setGuide({ v, h: hz });
    patchText(g.i, { x: Math.round(nx), y: Math.round(ny) });
    // çöp kutusu: parmak alt ortadaysa
    const r = canvasRef.current.getBoundingClientRect();
    const hot = e.clientY > r.bottom - 110 && Math.abs(e.clientX - (r.left + r.width / 2)) < 70;
    if (hot !== trash?.hot) {
      if (hot) navigator.vibrate?.(12);
      setTrash({ hot });
    }
  };
  const onUp = (e) => {
    ptrs.current.delete(e.pointerId);
    if (mode === 'draw') {
      const cur = curRef.current;
      if (cur && cur.id === e.pointerId) {
        curRef.current = null;
        if (!cur.erase) setStrokes((s) => [...s, { c: cur.c, k: cur.k, w: cur.w, p: cur.p }]);
        else redraw();
      }
      return;
    }
    const g = gest.current;
    if (ptrs.current.size > 0) {
      if (g?.pinch) gest.current = { ...g, pinch: false, i: g.i, done: true };
      return;
    }
    gest.current = null;
    setGuide({ v: false, h: false });
    const wasTrash = trash?.hot;
    setTrash(null);
    if (!g || g.done) return;
    if (g.i >= 0 && wasTrash) {
      setTexts((arr) => arr.filter((_, k) => k !== g.i));
      return;
    }
    if (!g.moved && Date.now() - g.t0 < 400) openText(g.i); // dokunma: yazıyı düzenle / yeni yazı
  };
  const onWheel = (e) => {
    if (mode !== 'view') return;
    const [x, y] = toLogical(e);
    const i = hitText(x, y);
    if (i < 0) return;
    const t = textsRef.current[i];
    patchText(i, { z: Math.round(clamp(t.z * (e.deltaY < 0 ? 1.08 : 0.93), OVERLAY_Z_MIN, OVERLAY_Z_MAX)) });
  };

  const share = () => onShare(texts.length || strokes.length ? { texts, strokes } : null);

  // ---- yazı düzenleme önizlemesi (DOM — aynı yazı tipi/renk) --------------------------
  const ef = edit ? OVERLAY_FONTS[edit.f] || OVERLAY_FONTS[0] : null;
  const ecol = edit ? OVERLAY_COLORS[edit.c] : '#fff';
  const ebox = edit ? OVERLAY_COLORS[edit.bc] : '#fff';
  const editStyle = edit
    ? {
        font: ef.css(Math.max(12, edit.z * (ef.k || 1) * kpx)),
        color: ecol,
        textAlign: ['center', 'left', 'right'][edit.a],
        textTransform: ef.upper ? 'uppercase' : 'none',
        letterSpacing: ef.ls ? `${ef.ls}em` : undefined,
        textShadow: ef.neon ? `0 0 ${edit.z * kpx * 0.35}px ${ecol}, 0 0 ${edit.z * kpx * 0.12}px ${ecol}` : edit.b ? 'none' : '0 1px 4px rgba(0,0,0,.35)',
      }
    : null;
  const spanStyle = edit && edit.b ? { background: edit.b === 2 ? `${ebox}9e` : ebox, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: '0.06em 0.3em', borderRadius: '0.3em' } : null;

  return createPortal(
    <div className="pse-root" onClick={halt} onPointerDown={halt} role="dialog" aria-label="Hikâye fotoğrafı">
      <div className="pse-stage" ref={stageRef}>
        <div className="pse-photo" style={{ width: size.w, height: size.h }}>
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
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
          />
          {guide.v && <i className="pse-guide v" />}
          {guide.h && <i className="pse-guide h" />}
          {trash && (
            <div className={`pse-trash${trash.hot ? ' hot' : ''}`}>
              <I n="trash" size={trash.hot ? 30 : 24} />
            </div>
          )}

          {/* ÜST ÇUBUK */}
          {mode === 'view' && !trash && (
            <div className="pse-top">
              <button className="pse-ic" onClick={onClose} aria-label="Kapat">
                <I n="close" />
              </button>
              <span className="pse-sp" />
              <button className="pse-ic" disabled={!img || texts.length >= OVERLAY_MAX_TEXTS} onClick={() => openText(-1)} aria-label="Yazı ekle">
                <span className="pse-aa">Aa</span>
              </button>
              <button className="pse-ic" disabled={!img} onClick={() => setMode('draw')} aria-label="Çiz">
                <I n="draw" />
              </button>
            </div>
          )}
          {mode === 'draw' && (
            <>
              <div className="pse-top">
                <button className="pse-ic" disabled={!strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))} aria-label="Geri al">
                  <I n="undo" />
                </button>
                <span className="pse-sp" />
                {[0, 1, 2, 3].map((k) => (
                  <button key={k} className={`pse-pen${pen.k === k ? ' on' : ''}`} onClick={() => setPen((p) => ({ ...p, k }))} aria-label={['Kalem', 'Fosforlu kalem', 'Neon', 'Silgi'][k]}>
                    <PenIcon k={k} on={pen.k === k} />
                  </button>
                ))}
                <span className="pse-sp" />
                <button className="pse-done" onClick={() => setMode('view')}>
                  Bitti
                </button>
              </div>
              <SideSlider value={pen.w} min={OVERLAY_W_MIN} max={OVERLAY_W_MAX} onChange={(w) => setPen((p) => ({ ...p, w }))} preview={<i className="pse-dot" style={{ width: clamp(pen.w * kpx, 6, 34), height: clamp(pen.w * kpx, 6, 34), background: pen.k === 3 ? '#fff' : OVERLAY_COLORS[pen.c] }} />} />
              {pen.k !== 3 && (
                <div className="pse-bottom-tools">
                  <ColorRow value={pen.c} onPick={(c) => setPen((p) => ({ ...p, c }))} />
                </div>
              )}
            </>
          )}

          {/* YAZI DÜZENLEME */}
          {mode === 'text' && edit && (
            <div className="pse-textmode" onPointerDown={(e) => e.target === e.currentTarget && saveText()}>
              <div className="pse-top">
                <button className="pse-ic" onClick={() => setEdit((x) => ({ ...x, a: (x.a + 1) % 3 }))} aria-label="Hizalama">
                  <I n={['alignC', 'alignL', 'alignR'][edit.a]} />
                </button>
                <button
                  className="pse-ic"
                  onClick={() =>
                    setEdit((x) => {
                      const b = (x.b + 1) % 3;
                      // çerçeve ilk açılınca: çerçeve seçili renk, yazı okunur renk
                      if (x.b === 0 && b === 1) {
                        const bc = x.c;
                        setColorFor('box');
                        return { ...x, b, bc, c: isLightColor(OVERLAY_COLORS[bc]) ? 0 : 1 };
                      }
                      if (b === 0) setColorFor('text');
                      return { ...x, b };
                    })
                  }
                  aria-label="Çerçeve"
                >
                  <BoxIcon b={edit.b} />
                </button>
                {edit.b > 0 && (
                  <div className="pse-seg">
                    <button className={colorFor === 'text' ? 'on' : ''} onClick={() => setColorFor('text')}>
                      Yazı
                    </button>
                    <button className={colorFor === 'box' ? 'on' : ''} onClick={() => setColorFor('box')}>
                      Çerçeve
                    </button>
                  </div>
                )}
                <span className="pse-sp" />
                <button className="pse-done" onClick={saveText}>
                  Bitti
                </button>
              </div>
              <SideSlider value={edit.z} min={OVERLAY_Z_MIN} max={OVERLAY_Z_MAX} onChange={(z) => setEdit((x) => ({ ...x, z }))} preview={<b className="pse-knob-a">A</b>} />
              <div className="pse-editwrap">
                <div className="pse-editbox" lang="tr" style={{ ...editStyle, width: OVERLAY_WRAP_W * kpx }}>
                  {/* görünen katman (çerçeve satır satır) + üstte saydam yazı alanı */}
                  <div className="pse-editshow" aria-hidden="true">
                    <span style={spanStyle}>{edit.t || ' '}</span>
                  </div>
                  <textarea
                    autoFocus
                    maxLength={OVERLAY_TEXT_MAX}
                    value={edit.t}
                    onChange={(e) => setEdit((x) => ({ ...x, t: e.target.value }))}
                    style={{ caretColor: edit.b ? (isLightColor(ebox) ? '#000' : '#fff') : ecol }}
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="pse-bottom-tools">
                <div className="pse-fonts">
                  {OVERLAY_FONTS.map((f, i) => (
                    <button key={f.n} className={edit.f === i ? 'on' : ''} style={{ font: f.css(15 * (f.k || 1)), textTransform: f.upper ? 'uppercase' : 'none' }} onClick={() => setEdit((x) => ({ ...x, f: i }))}>
                      {f.n}
                    </button>
                  ))}
                </div>
                <ColorRow value={colorFor === 'box' && edit.b ? edit.bc : edit.c} onPick={(i) => setEdit((x) => (colorFor === 'box' && x.b ? { ...x, bc: i } : { ...x, c: i }))} />
              </div>
            </div>
          )}

          {/* ALT: paylaş */}
          {mode === 'view' && !trash && (
            <div className="pse-bottom">
              <button className="pse-story" disabled={!img || busy} onClick={share}>
                <span className="pse-story-av">
                  <AvatarSvg avatar={player?.avatar} size={30} rounded />
                </span>
                {busy ? 'Paylaşılıyor…' : 'Hikâyen'}
              </button>
              <button className="pse-send" disabled={!img || busy} onClick={share} aria-label="Paylaş">
                <I n="arrow" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
