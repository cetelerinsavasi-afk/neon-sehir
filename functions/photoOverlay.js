// =============================================================================
// photoOverlay.js — v135 Sixtagram hikâye fotoğrafı: üstüne yazı + çizim
// (TEK DOĞRULUK KAYNAĞI — sunucu doğrular, istemci aynı kurallarla çizer)
// =============================================================================
// Fotoğraf dikey (9:16). Koordinatlar genişliğe göre: x 0–1000, y 0–1778.
// overlay = {
//   texts: [{ t, x, y, c: yazı rengi, z: boy (24–240), f: yazı tipi, b: çerçeve
//             (0 yok · 1 dolu · 2 yarı saydam), bc: çerçeve rengi, a: hizalama
//             (0 orta · 1 sol · 2 sağ), r: açı (derece) }]  (en fazla 8)
//   strokes: [{ c, k: kalem (0 kalem · 1 fosforlu · 2 neon), w: kalınlık (3–80), p: [x0, y0, …] }]
// }
// Eski kayıtlar (v135 ilk sürüm): yazıda s (boy 0–2), çizgide s (kalınlık 0–2) — hâlâ okunur.
// Görsel YÜKLENMEZ: fotoğraf sahnesi + bu katman her cihazda yeniden çizilir.
// =============================================================================
import { DRAW_COLORS, DRAW_WIDTHS } from './drawingData.js';

export const PHOTO_W = 1000;
export const PHOTO_H = 1778; // 9:16
export const PHOTO_ASPECT = 9 / 16;
export const OVERLAY_MAX_TEXTS = 8;
export const OVERLAY_TEXT_MAX = 120;
export const OVERLAY_MAX_STROKES = 150;
export const OVERLAY_MAX_POINTS = 4000;
export const OVERLAY_Z_MIN = 24;
export const OVERLAY_Z_MAX = 240;
export const OVERLAY_W_MIN = 3;
export const OVERLAY_W_MAX = 80;
const LEGACY_SIZES = [46, 66, 96];
// ilk 12 renk çizim paletiyle aynı (eski kayıtlar), sonrası Instagram paleti
export const OVERLAY_COLORS = [...DRAW_COLORS, '#3897f0', '#70c050', '#fdcb5c', '#fd8d32', '#ed4956', '#d10869', '#a307ba', '#262626'];
// Instagram'daki gibi yazı tipleri (Google Fonts; yüklenemezse benzer sistem yazı tipi)
export const OVERLAY_FONTS = [
  { n: 'Klasik', css: (px) => `800 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` },
  { n: 'Modern', css: (px) => `500 ${px}px "Oswald", "Arial Narrow", sans-serif`, upper: true, ls: 0.04 },
  { n: 'Neon', css: (px) => `400 ${px}px "Pacifico", "Brush Script MT", cursive`, neon: true },
  { n: 'Daktilo', css: (px) => `700 ${px}px "Courier Prime", "Courier New", monospace` },
  { n: 'Güçlü', css: (px) => `italic 900 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, upper: true },
  { n: 'El yazısı', css: (px) => `700 ${px}px "Caveat", "Segoe Print", cursive`, k: 1.25 },
];
export const OVERLAY_FONT_URL = 'https://fonts.googleapis.com/css2?family=Oswald:wght@500&family=Pacifico&family=Courier+Prime:wght@700&family=Caveat:wght@700&family=Grand+Hotel&display=swap';

const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(min, Math.min(max, v))) : null);

// Döner: { overlay } (boşsa overlay: null) | { error }
export function sanitizeOverlay(raw) {
  if (raw == null) return { overlay: null };
  if (typeof raw !== 'object') return { error: 'Geçersiz fotoğraf düzenlemesi.' };
  const texts = [];
  for (const t of Array.isArray(raw.texts) ? raw.texts.slice(0, OVERLAY_MAX_TEXTS) : []) {
    if (!t || typeof t !== 'object') continue;
    const s = String(typeof t.t === 'string' ? t.t : '')
      .replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, OVERLAY_TEXT_MAX);
    const x = num(t.x, 0, PHOTO_W);
    const y = num(t.y, 0, PHOTO_H);
    if (!s || x === null || y === null) continue;
    const z = num(t.z, OVERLAY_Z_MIN, OVERLAY_Z_MAX) ?? (isIdx(t.s, 3) ? LEGACY_SIZES[t.s] : 66);
    const b = isIdx(t.b, 3) ? t.b : t.b ? 1 : 0;
    texts.push({
      t: s,
      x,
      y,
      c: isIdx(t.c, OVERLAY_COLORS.length) ? t.c : 1,
      z,
      f: isIdx(t.f, OVERLAY_FONTS.length) ? t.f : 0,
      b,
      bc: isIdx(t.bc, OVERLAY_COLORS.length) ? t.bc : 1,
      a: isIdx(t.a, 3) ? t.a : 0,
      r: num(t.r, -180, 180) ?? 0,
    });
  }
  const strokes = [];
  let total = 0;
  for (const st of Array.isArray(raw.strokes) ? raw.strokes.slice(0, OVERLAY_MAX_STROKES) : []) {
    if (!st || typeof st !== 'object' || !isIdx(st.c, OVERLAY_COLORS.length)) return { error: 'Geçersiz çizim.' };
    const w = num(st.w, OVERLAY_W_MIN, OVERLAY_W_MAX) ?? (isIdx(st.s, DRAW_WIDTHS.length) ? DRAW_WIDTHS[st.s] : null);
    if (w === null) return { error: 'Geçersiz çizim.' };
    const p = Array.isArray(st.p) ? st.p : null;
    if (!p || p.length < 2 || p.length % 2 !== 0) return { error: 'Geçersiz çizim.' };
    total += p.length / 2;
    if (total > OVERLAY_MAX_POINTS) return { error: 'Çizim çok büyük.' };
    const pts = new Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const v = num(p[i], 0, i % 2 === 0 ? PHOTO_W : PHOTO_H);
      if (v === null) return { error: 'Geçersiz çizim.' };
      pts[i] = v;
    }
    strokes.push({ c: st.c, k: isIdx(st.k, 3) ? st.k : 0, w, p: pts });
  }
  if (!texts.length && !strokes.length) return { overlay: null };
  return { overlay: { texts, strokes } };
}
// Sadece metinler (moderasyon kontrolü için)
export const overlayText = (o) => (o?.texts || []).map((t) => t.t).join(' · ');

// ---- çizim (istemci) -------------------------------------------------------------------
const zOf = (t) => (Number.isFinite(t.z) ? t.z : LEGACY_SIZES[t.s] || 66);
const strokeW = (st) => (Number.isFinite(st.w) ? st.w : DRAW_WIDTHS[st.s] || 14);
export function isLightColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 165;
}
function rgba(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '#000000');
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}
// Yazının satırları + ölçüsü (mantıksal birimlerde; k = piksel / mantıksal birim)
export function layoutText(ctx, t, k = 1) {
  const font = OVERLAY_FONTS[t.f] || OVERLAY_FONTS[0];
  const size = zOf(t) * (font.k || 1) * k;
  ctx.font = font.css(size);
  const raw = String(t.t).split(/\n/).slice(0, 6);
  const lines = font.upper ? raw.map((l) => l.toLocaleUpperCase('tr-TR')) : raw;
  const widths = lines.map((l) => ctx.measureText(l).width + (font.ls ? font.ls * size * l.length : 0));
  const lh = size * 1.22;
  const pad = t.b ? size * 0.32 : 0;
  const w = Math.max(...widths, size * 0.3) + pad * 2;
  const h = lines.length * lh + (t.b ? pad * 0.6 : 0);
  return { font, size, lines, widths, lh, pad, w, h };
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function drawOverlayText(ctx, t, k, ky = k) {
  const L = layoutText(ctx, t, k);
  const col = OVERLAY_COLORS[t.c] || '#fff';
  const boxCol = OVERLAY_COLORS[t.bc] || '#fff';
  ctx.save();
  ctx.translate(t.x * k, t.y * ky);
  if (t.r) ctx.rotate((t.r * Math.PI) / 180);
  ctx.textBaseline = 'middle';
  const top = -((L.lines.length - 1) * L.lh) / 2;
  const inner = L.w - L.pad * 2;
  const xOf = (i) => (t.a === 1 ? -inner / 2 : t.a === 2 ? inner / 2 - L.widths[i] : -L.widths[i] / 2);
  // çerçeve: Instagram gibi satır satır yuvarlak kutu
  if (t.b) {
    ctx.fillStyle = t.b === 2 ? rgba(boxCol, 0.62) : boxCol;
    L.lines.forEach((l, i) => {
      if (!l.trim()) return;
      const bx = xOf(i) - L.pad;
      const by = top + i * L.lh - L.lh / 2 - L.pad * 0.15;
      rr(ctx, bx, by, L.widths[i] + L.pad * 2, L.lh + L.pad * 0.3, Math.min(L.size * 0.32, L.lh / 2));
      ctx.fill();
    });
  }
  ctx.textAlign = 'left';
  if (L.font.ls) ctx.letterSpacing = `${L.font.ls * L.size}px`;
  L.lines.forEach((l, i) => {
    const x = xOf(i);
    const y = top + i * L.lh;
    if (L.font.neon) {
      // neon: renkli parıltı + açık çekirdek
      ctx.shadowColor = col;
      ctx.shadowBlur = L.size * 0.5;
      ctx.fillStyle = col;
      ctx.fillText(l, x, y);
      ctx.shadowBlur = L.size * 0.2;
      ctx.fillStyle = isLightColor(col) ? col : rgba('#ffffff', 0.92);
      ctx.fillText(l, x, y);
      ctx.shadowBlur = 0;
      return;
    }
    if (!t.b) {
      // çerçevesiz yazı okunabilsin diye hafif gölge (Instagram gibi)
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = L.size * 0.12;
      ctx.shadowOffsetY = L.size * 0.03;
    }
    ctx.fillStyle = col;
    ctx.fillText(l, x, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  ctx.restore();
  return L;
}
export function drawOverlayStroke(ctx, st, k, ky = k) {
  const p = st.p;
  if (!p || p.length < 2) return;
  const col = OVERLAY_COLORS[st.c] || '#fff';
  const lw = strokeW(st) * k;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(p[0] * k, p[1] * ky);
    if (p.length === 2) ctx.lineTo(p[0] * k + 0.01, p[1] * ky);
    for (let i = 2; i < p.length - 2; i += 2) {
      ctx.quadraticCurveTo(p[i] * k, p[i + 1] * ky, ((p[i] + p[i + 2]) / 2) * k, ((p[i + 1] + p[i + 3]) / 2) * ky);
    }
    if (p.length > 2) ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * ky);
  };
  if (st.k === 1) {
    // fosforlu kalem: yarı saydam, kalın
    ctx.globalAlpha = 0.5;
    ctx.lineCap = 'square';
    ctx.strokeStyle = col;
    ctx.lineWidth = lw * 1.6;
    path();
    ctx.stroke();
  } else if (st.k === 2) {
    // neon: renkli parıltı + beyaz çekirdek
    ctx.shadowColor = col;
    ctx.shadowBlur = lw * 1.4;
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    path();
    ctx.stroke();
    ctx.shadowBlur = lw * 0.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = lw * 0.42;
    path();
    ctx.stroke();
  } else {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    path();
    ctx.stroke();
  }
  ctx.restore();
}
// Katmanı w×h (9:16) tuvale çizer — editör ve gönderi aynı kodu kullanır.
export function drawPhotoOverlay(ctx, overlay, w, h) {
  if (!overlay) return;
  const k = w / PHOTO_W;
  const ky = h / PHOTO_H;
  (overlay.strokes || []).forEach((st) => drawOverlayStroke(ctx, st, k, ky));
  (overlay.texts || []).forEach((t) => drawOverlayText(ctx, t, k, ky));
}

// İstemci: yazı tiplerini yükle (bir kez) — çizimden önce beklenir
let fontsP = null;
export function ensureOverlayFonts() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontsP) return fontsP;
  if (!document.querySelector('link[data-overlay-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = OVERLAY_FONT_URL;
    l.dataset.overlayFonts = '1';
    document.head.appendChild(l);
  }
  const fams = ['500 40px "Oswald"', '400 40px "Pacifico"', '700 40px "Courier Prime"', '700 40px "Caveat"', '400 40px "Grand Hotel"'];
  const timeout = new Promise((r) => setTimeout(r, 2500));
  fontsP = Promise.race([Promise.all(fams.map((f) => document.fonts?.load?.(f, 'AaŞşĞğİı').catch(() => null))), timeout]).then(() => undefined);
  return fontsP;
}
