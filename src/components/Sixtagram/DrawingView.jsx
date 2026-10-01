import { useEffect, useRef } from 'react';
import { renderDrawing } from '../../lib/drawing';

// v72 — Sixtagram'daki "Resim Çiz" gönderisi: fırça darbeleri kare tuvale çizilir.
export default function DrawingView({ drawing }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const paint = () => {
      const css = c.clientWidth || 300;
      const px = Math.max(200, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
      if (c.width !== px) {
        c.width = px;
        c.height = px;
      }
      renderDrawing(c.getContext('2d'), drawing, px);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
  }, [drawing]);
  return <canvas ref={ref} className="post-att-drawing-canvas" aria-label="Çizim" />;
}
