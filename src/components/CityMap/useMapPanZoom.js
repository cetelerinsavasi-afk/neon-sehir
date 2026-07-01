import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 1; // taban ölçek: ekrana tam sığdırılmış hâl. Bunun altına inilemez (ekstra uzaklaştırma yok).
const MAX_SCALE = 2.5;
const DRAG_THRESHOLD = 8; // px — bunun altındaki hareket "tıklama" sayılır, üstü "sürükleme"

/**
 * useMapPanZoom — tek elle sürükleme, iki parmakla pinch-zoom (mobil),
 * fare tekerleğiyle zoom (masaüstü test için) ve çift tıkla sıfırlama sağlar.
 *
 * Harita varsayılan olarak ekrana tam sığacak şekilde ölçeklenir (letterbox).
 * Kullanıcı sadece İÇERİ yakınlaştırabilir (scale 1 → 2.5); bu taban ölçeğin
 * altına inilemez, böylece haritanın bir kısmı asla ekran dışına taşmaz.
 */
export function useMapPanZoom(viewportRef, wrapRef) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const baseSize = useRef({ w: 0, h: 0 });
  const pointers = useRef(new Map());
  const dragStart = useRef(null);
  const pinchStart = useRef(null);
  const movedDistance = useRef(0);
  const suppressNextClick = useRef(false);

  // Ölçek=1 anındaki gerçek piksel boyutunu ölç (resize'da yeniden ölç).
  useEffect(() => {
    const measure = () => {
      if (!wrapRef.current) return;
      baseSize.current = {
        w: wrapRef.current.offsetWidth,
        h: wrapRef.current.offsetHeight,
      };
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [wrapRef]);

  const clampTransform = useCallback((next) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const vp = viewportRef.current;
    const vw = vp?.clientWidth ?? 0;
    const vh = vp?.clientHeight ?? 0;
    const { w, h } = baseSize.current;
    const overflowX = Math.max(0, (w * scale - vw) / 2);
    const overflowY = Math.max(0, (h * scale - vh) / 2);
    return {
      scale,
      x: Math.min(overflowX, Math.max(-overflowX, next.x)),
      y: Math.min(overflowY, Math.max(-overflowY, next.y)),
    };
  }, [viewportRef]);

  const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const getMidpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const onPointerDown = useCallback((e) => {
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedDistance.current = 0;

    if (pointers.current.size === 1) {
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transform.x,
        ty: transform.y,
      };
      setIsDragging(true);
    } else if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinchStart.current = {
        distance: getDistance(p1, p2),
        scale: transform.scale,
        midpoint: getMidpoint(p1, p2),
        tx: transform.x,
        ty: transform.y,
      };
      dragStart.current = null;
    }
  }, [transform, viewportRef]);

  const onPointerMove = useCallback((e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [p1, p2] = [...pointers.current.values()];
      const newDistance = getDistance(p1, p2);
      const ratio = newDistance / (pinchStart.current.distance || 1);
      const nextScale = pinchStart.current.scale * ratio;
      setTransform((prev) =>
        clampTransform({ ...prev, scale: nextScale })
      );
      movedDistance.current += 100; // pinch = kesin sürükleme, tıklama sayılmasın
      return;
    }

    if (dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      movedDistance.current = Math.max(movedDistance.current, Math.hypot(dx, dy));
      setTransform((prev) =>
        clampTransform({
          ...prev,
          x: dragStart.current.tx + dx,
          y: dragStart.current.ty + dy,
        })
      );
    }
  }, [clampTransform]);

  const endPointer = useCallback((e) => {
    pointers.current.delete(e.pointerId);

    if (movedDistance.current > DRAG_THRESHOLD) {
      suppressNextClick.current = true;
      // Kısa bir gecikmeyle bayrağı geri al; bir sonraki gerçek tıklamayı etkilemesin.
      setTimeout(() => {
        suppressNextClick.current = false;
      }, 50);
    }

    if (pointers.current.size === 1) {
      // Pinch'ten tek parmağa geri dönüldü — sürüklemeyi mevcut pozisyondan yeniden başlat.
      const [remaining] = [...pointers.current.values()];
      dragStart.current = {
        x: remaining.x,
        y: remaining.y,
        tx: transform.x,
        ty: transform.y,
      };
      pinchStart.current = null;
    } else if (pointers.current.size === 0) {
      dragStart.current = null;
      pinchStart.current = null;
      setIsDragging(false);
    }
  }, [transform]);

  // Fare tekerleği ile zoom (masaüstünde test için). Pasif olmayan native listener gerekiyor.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setTransform((prev) => clampTransform({ ...prev, scale: prev.scale + delta }));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [viewportRef, clampTransform]);

  const reset = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  const shouldSuppressClick = useCallback(() => suppressNextClick.current, []);

  return {
    transform,
    isDragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onDoubleClick: reset,
    },
    shouldSuppressClick,
  };
}
