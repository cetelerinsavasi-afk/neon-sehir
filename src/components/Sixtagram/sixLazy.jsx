import { useEffect, useRef, useState } from 'react';

// =============================================================================
// v160.2 — Sixtagram TEMBEL YÜKLEME
// Akışta sadece ekrana YAKLAŞAN gönderilerin ağır kısmı (fotoğraf, mekân karesi, resim,
// röportaj) kurulur; uzaklaşınca kaldırılır (yerinde aynı yükseklikte boşluk kalır) →
// telefonda bellek sabit kalır, kaydırdıkça yaklaşılan gönderiler yüklenir.
// IntersectionObserver kökü gönderinin içinde durduğu kaydırma kutusudur (sayfa değil):
// eskiden kök verilmediği için "500 px önceden yükle" payı hiç çalışmıyordu.
// =============================================================================
export function scrollParent(el) {
  let p = el?.parentElement || null;
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
    p = p.parentElement;
  }
  return null;
}

// el ekrana `margin` px yaklaşınca true, uzaklaşınca false
export function useNear(ref, margin = 900) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver((ents) => setNear(ents[ents.length - 1].isIntersecting), { root: scrollParent(el), rootMargin: `${margin}px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return near;
}

// keep: bir kez kurulunca kaldırılmaz (çalan şarkı gibi)
export function LazyMount({ children, keep = false, minH = 280, margin = 900 }) {
  const ref = useRef(null);
  const near = useNear(ref, margin);
  const [ever, setEver] = useState(false);
  const hRef = useRef(0);
  useEffect(() => {
    if (near) setEver(true);
  }, [near]);
  const show = near || (keep && ever);
  useEffect(() => {
    const el = ref.current;
    if (!show || !el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (h > 20) hRef.current = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [show]);
  return (
    <div ref={ref} className="six-lazy" style={show ? undefined : { minHeight: hRef.current || minH }}>
      {show ? children : null}
    </div>
  );
}
