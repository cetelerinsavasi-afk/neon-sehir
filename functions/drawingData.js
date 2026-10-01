// =============================================================================
// v72 — Sixtagram "Resim Çiz" eki. Görsel YÜKLENMEZ: çizim fırça darbeleri
// (renk/kalınlık indeksi + 0–1000 aralığında nokta listesi) olarak saklanır ve
// her telefonda yeniden çizilir. Sunucu (functions/index.js
// buildSixtagramAttachment) ve istemci (src/lib/drawing.js) bu dosyayı paylaşır.
// =============================================================================
export const DRAW_SIZE = 1000; // tuval mantıksal boyutu (kare)
export const DRAW_COLORS = [
  '#111111', '#ffffff', '#9e9e9e', '#795548',
  '#e53935', '#fb8c00', '#fdd835', '#43a047',
  '#00bcd4', '#1e88e5', '#8e24aa', '#f06292',
];
export const DRAW_BGS = ['#ffffff', '#fdf6e3', '#fff3c4', '#ffe0e9', '#e3f2fd', '#e8f5e9', '#1e2a44', '#111111'];
export const DRAW_WIDTHS = [6, 14, 30];
export const DRAW_MAX_STROKES = 500;
export const DRAW_MAX_POINTS = 8000; // tüm darbelerdeki toplam nokta (x,y çifti)

const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

// Gelen çizimi doğrular/temizler. Geçersizse { error } döner.
export function sanitizeDrawing(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  if (!isIdx(d.bg, DRAW_BGS.length)) return { error: 'Geçersiz tuval rengi.' };
  const strokes = Array.isArray(d.strokes) ? d.strokes : null;
  if (!strokes || strokes.length === 0) return { error: 'Boş tuval paylaşılamaz — önce bir şeyler çiz.' };
  if (strokes.length > DRAW_MAX_STROKES) return { error: `En fazla ${DRAW_MAX_STROKES} fırça darbesi.` };
  let total = 0;
  const out = [];
  for (const s of strokes) {
    if (!s || typeof s !== 'object' || !isIdx(s.c, DRAW_COLORS.length) || !isIdx(s.s, DRAW_WIDTHS.length)) return { error: 'Geçersiz fırça darbesi.' };
    const p = Array.isArray(s.p) ? s.p : null;
    if (!p || p.length < 2 || p.length % 2 !== 0) return { error: 'Geçersiz fırça darbesi.' };
    total += p.length / 2;
    if (total > DRAW_MAX_POINTS) return { error: 'Çizim çok büyük.' };
    const pts = new Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > DRAW_SIZE) return { error: 'Geçersiz fırça darbesi.' };
      pts[i] = Math.round(v);
    }
    out.push({ c: s.c, s: s.s, p: pts });
  }
  return { drawing: { type: 'drawing', bg: d.bg, strokes: out } };
}
