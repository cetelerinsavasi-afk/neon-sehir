import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 1; // taban ölçek: ekrana tam sığdırılmış hâl. Bunun altına inilemez (ekstra uzaklaştırma yok).
const MAX_SCALE = 2.5;
const TAP_THRESHOLD = 8; // px — bunun altındaki hareket "tıklama/dokunma" sayılır, üstü "sürükleme"

/**
 * useMapPanZoom — tek elle sürükleme, iki parmakla pinch-zoom (mobil),
 * fare tekerleğiyle zoom (masaüstü test için) ve çift tıkla sıfırlama sağlar.
 *
 * Harita varsayılan olarak ekrana tam sığacak şekilde ölçeklenir (letterbox).
 * Kullanıcı sadece İÇERİ yakınlaştırabilir (scale 1 → 2.5); bu taban ölçeğin
 * altına inilemez, böylece haritanın bir kısmı asla ekran dışına taşmaz.
 *
 * ÖNEMLİ #1: Sınır (clamp) hesaplamaları için harita ve ekran boyutu HER
 * SEFERİNDE canlı ölçülür (önbelleğe alınmaz) — mobil adres çubuğu
 * gizlenip/çıktığında dvh anlık değiştiği için önbellek eski kalıp haritayı
 * sınır dışına kaçırıyordu.
 *
 * ÖNEMLİ #2: Bölge tıklamaları native `click` event'ine DEĞİL, `onTap`
 * callback'ine dayanır. `setPointerCapture` kullanıldığında bazı
 * tarayıcılarda `click` event'i hiç tetiklenmeyebiliyor (pointer capture
 * sonraki tüm işaretçi olaylarını yakalayan elemente yönlendiriyor); bu
 * yüzden "bu bir dokunma mı sürükleme mi" kararını burada veriyoruz ve
 * gerçek DOM tıklamasına güvenmek yerine `onTap(clientX, clientY)` ile
 * dışarıya bildiriyoruz. CityMap bu koordinatla elementFromPoint kullanarak
 * hangi bölgeye dokunulduğunu kendisi buluyor.
 */
export function useMapPanZoom(viewportRef, wrapRef, onTap) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const pointers = useRef(new Map());
  const dragStart = useRef(null);
  const pinchStart = useRef(null);
  const movedDistance = useRef(0);
  const wasMultiTouch = useRef(false);

  const clampTransform = useCallback((next) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const vp = viewportRef.current;
    const wrap = wrapRef.current;
    const vw = vp?.clientWidth ?? 0;
    const vh = vp?.clientHeight ?? 0;
    const w = wrap?.offsetWidth ?? 0;
    const h = wrap?.offsetHeight ?? 0;
    const overflowX = Math.max(0, (w * scale - vw) / 2);
    const overflowY = Math.max(0, (h * scale - vh) / 2);
    return {
      scale,
      x: Math.min(overflowX, Math.max(-overflowX, next.x)),
      y: Math.min(overflowY, Math.max(-overflowY, next.y)),
    };
  }, [viewportRef, wrapRef]);

  const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = useCallback((e) => {
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      movedDistance.current = 0;
      wasMultiTouch.current = false;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transform.x,
        ty: transform.y,
      };
      setIsDragging(true);
    } else if (pointers.current.size === 2) {
      wasMultiTouch.current = true;
      const [p1, p2] = [...pointers.current.values()];
      pinchStart.current = {
        distance: getDistance(p1, p2),
        scale: transform.scale,
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
      setTransform((prev) => clampTransform({ ...prev, scale: nextScale }));
      return;
    }

    if (dragStart.current) {
      const { x: startX, y: startY, tx, ty } = dragStart.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      movedDistance.current = Math.max(movedDistance.current, Math.hypot(dx, dy));
      setTransform((prev) => clampTransform({ ...prev, x: tx + dx, y: ty + dy }));
    }
  }, [clampTransform]);

  const endPointer = useCallback((e) => {
    pointers.current.delete(e.pointerId);

    // Tek parmak/fare ile, ciddi bir hareket olmadan bırakıldıysa: bu bir
    // "dokunma/tıklama"dır — dışarıya bildir, CityMap hangi bölge olduğunu bulsun.
    if (
      !wasMultiTouch.current &&
      movedDistance.current <= TAP_THRESHOLD &&
      pointers.current.size === 0
    ) {
      onTap?.(e.clientX, e.clientY);
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
  }, [transform, onTap]);

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

  // Ekran boyutu değişince (adres çubuğu gizlenmesi, döndürme, klavye açılması vb.)
  // mevcut transform'u yeni sınırlara göre yeniden kelepçele — sınır dışında kalmasın.
  useEffect(() => {
    const revalidate = () => setTransform((prev) => clampTransform(prev));
    window.addEventListener('resize', revalidate);
    window.addEventListener('orientationchange', revalidate);
    let vv;
    if (window.visualViewport) {
      vv = window.visualViewport;
      vv.addEventListener('resize', revalidate);
    }
    return () => {
      window.removeEventListener('resize', revalidate);
      window.removeEventListener('orientationchange', revalidate);
      vv?.removeEventListener('resize', revalidate);
    };
  }, [clampTransform]);

  const reset = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

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
  };
}
