// v72 — Sixtagram çizimlerini tuvale çizer (editör ve gönderi aynı kodu kullanır).
import { DRAW_BGS, DRAW_COLORS, DRAW_SIZE, DRAW_WIDTHS } from '../../functions/drawingData.js';

export * from '../../functions/drawingData.js';

// Tek bir fırça darbesi (noktalar arası yumuşak eğri; tek nokta → yuvarlak nokta)
export function drawStroke(ctx, stroke, k) {
  const p = stroke.p;
  if (!p || p.length < 2) return;
  ctx.strokeStyle = DRAW_COLORS[stroke.c] || '#111';
  ctx.fillStyle = ctx.strokeStyle;
  const w = (DRAW_WIDTHS[stroke.s] || 10) * k;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0] * k, p[1] * k, w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0] * k, p[1] * k);
  if (p.length === 4) {
    ctx.lineTo(p[2] * k, p[3] * k);
  } else {
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = ((p[i] + p[i + 2]) / 2) * k;
      const my = ((p[i + 1] + p[i + 3]) / 2) * k;
      ctx.quadraticCurveTo(p[i] * k, p[i + 1] * k, mx, my);
    }
    ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * k);
  }
  ctx.stroke();
}

// Tüm çizimi (zemin + darbeler) px×px tuvale çizer.
export function renderDrawing(ctx, drawing, px) {
  const k = px / DRAW_SIZE;
  ctx.fillStyle = DRAW_BGS[drawing?.bg] || DRAW_BGS[0];
  ctx.fillRect(0, 0, px, px);
  (drawing?.strokes || []).forEach((s) => drawStroke(ctx, s, k));
}

export const strokePointCount = (strokes) => (strokes || []).reduce((a, s) => a + s.p.length / 2, 0);
