// =============================================================================
// photoOverlay.js — v135 Sixtagram hikâye fotoğrafı: üstüne yazı + çizim
// (TEK DOĞRULUK KAYNAĞI — sunucu doğrular, istemci aynı kurallarla çizer)
// =============================================================================
// Fotoğraf dikey (9:16). Koordinatlar genişliğe göre: x 0–1000, y 0–1778.
// overlay = {
//   texts: [{ t: 'yazı', x, y, c: renk, s: boy (0–2), b: 0 düz · 1 kutulu }] (en fazla 6)
//   strokes: [{ c, s, p: [x0, y0, x1, y1, …] }] (fırça; drawingData ile aynı renk/kalınlık)
// }
// Görsel YÜKLENMEZ: fotoğraf sahnesi + bu katman her cihazda yeniden çizilir.
// =============================================================================
import { DRAW_COLORS, DRAW_WIDTHS } from './drawingData.js';

export const PHOTO_W = 1000;
export const PHOTO_H = 1778; // 9:16
export const PHOTO_ASPECT = 9 / 16;
export const OVERLAY_MAX_TEXTS = 6;
export const OVERLAY_TEXT_MAX = 80;
export const OVERLAY_MAX_STROKES = 120;
export const OVERLAY_MAX_POINTS = 3000;
export const OVERLAY_TEXT_SIZES = [46, 66, 96];
export const OVERLAY_COLORS = DRAW_COLORS;

const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(max, v))) : null);

// Döner: { overlay } (boşsa overlay: null) | { error }
export function sanitizeOverlay(raw) {
  if (raw == null) return { overlay: null };
  if (typeof raw !== 'object') return { error: 'Geçersiz fotoğraf düzenlemesi.' };
  const texts = [];
  for (const t of Array.isArray(raw.texts) ? raw.texts.slice(0, OVERLAY_MAX_TEXTS) : []) {
    if (!t || typeof t !== 'object') continue;
    const s = String(typeof t.t === 'string' ? t.t : '')
      .replace(/[\u0000-\u001f]/g, ' ')
      .trim()
      .slice(0, OVERLAY_TEXT_MAX);
    const x = num(t.x, PHOTO_W);
    const y = num(t.y, PHOTO_H);
    if (!s || x === null || y === null) continue;
    texts.push({ t: s, x, y, c: isIdx(t.c, OVERLAY_COLORS.length) ? t.c : 0, s: isIdx(t.s, OVERLAY_TEXT_SIZES.length) ? t.s : 1, b: t.b ? 1 : 0 });
  }
  const strokes = [];
  let total = 0;
  for (const st of Array.isArray(raw.strokes) ? raw.strokes.slice(0, OVERLAY_MAX_STROKES) : []) {
    if (!st || typeof st !== 'object' || !isIdx(st.c, DRAW_COLORS.length) || !isIdx(st.s, DRAW_WIDTHS.length)) return { error: 'Geçersiz çizim.' };
    const p = Array.isArray(st.p) ? st.p : null;
    if (!p || p.length < 2 || p.length % 2 !== 0) return { error: 'Geçersiz çizim.' };
    total += p.length / 2;
    if (total > OVERLAY_MAX_POINTS) return { error: 'Çizim çok büyük.' };
    const pts = new Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const v = num(p[i], i % 2 === 0 ? PHOTO_W : PHOTO_H);
      if (v === null) return { error: 'Geçersiz çizim.' };
      pts[i] = v;
    }
    strokes.push({ c: st.c, s: st.s, p: pts });
  }
  if (!texts.length && !strokes.length) return { overlay: null };
  return { overlay: { texts, strokes } };
}
// Sadece metinler (moderasyon kontrolü için)
export const overlayText = (o) => (o?.texts || []).map((t) => t.t).join(' · ');

// Katmanı w×h (9:16) tuvale çizer — editör ve gönderi aynı kodu kullanır.
export function drawPhotoOverlay(ctx, overlay, w, h) {
  if (!overlay) return;
  const k = w / PHOTO_W;
  const ky = h / PHOTO_H;
  (overlay.strokes || []).forEach((st) => {
    const p = st.p;
    if (!p || p.length < 2) return;
    ctx.strokeStyle = DRAW_COLORS[st.c] || '#fff';
    ctx.fillStyle = ctx.strokeStyle;
    const lw = (DRAW_WIDTHS[st.s] || 10) * k;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0] * k, p[1] * ky, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0] * k, p[1] * ky);
    for (let i = 2; i < p.length - 2; i += 2) {
      ctx.quadraticCurveTo(p[i] * k, p[i + 1] * ky, ((p[i] + p[i + 2]) / 2) * k, ((p[i + 1] + p[i + 3]) / 2) * ky);
    }
    ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * ky);
    ctx.stroke();
  });
  (overlay.texts || []).forEach((t) => {
    const size = (OVERLAY_TEXT_SIZES[t.s] || 66) * k;
    ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const col = OVERLAY_COLORS[t.c] || '#fff';
    const x = t.x * k;
    const y = t.y * ky;
    const lines = String(t.t).split(/\n/).slice(0, 3);
    const lh = size * 1.18;
    const y0 = y - ((lines.length - 1) * lh) / 2;
    if (t.b) {
      const wmax = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const pad = size * 0.32;
      const bw = wmax + pad * 2;
      const bh = lines.length * lh + pad;
      ctx.fillStyle = col;
      const r = Math.min(bh / 2, size * 0.4);
      const bx = x - bw / 2;
      const by = y - bh / 2;
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.arcTo(bx, by, bx + bw, by, r);
      ctx.fill();
      ctx.fillStyle = isLight(col) ? '#111' : '#fff';
      lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lh));
      return;
    }
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    lines.forEach((l, i) => {
      ctx.strokeText(l, x, y0 + i * lh);
      ctx.fillStyle = col;
      ctx.fillText(l, x, y0 + i * lh);
    });
  });
}
function isLight(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 165;
}
