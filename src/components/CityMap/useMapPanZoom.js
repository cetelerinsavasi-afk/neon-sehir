import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MIN_SCALE = 1; // taban ölçek: ekrana tam sığdırılmış hâl. Bunun altına inilemez (ekstra uzaklaştırma yok).
const MAX_SCALE = 2.5;
const TAP_THRESHOLD = 20; // px — bunun altındaki hareket "tıklama/dokunma" sayılır, üstü "sürükleme".
// Not: Bu değer önceden 8px'ti ama bazı Android cihaz/tarayıcı kombinasyonları
// kısa bir dokunuşta bile iOS'a göre belirgin şekilde daha fazla koordinat
// titreşimi (jitter) raporluyor — eşik çok dar olunca gerçek bir tıklama
// yanlışlıkla "sürükleme" sanılıp yok sayılıyor, kullanıcı parmağını
// kıpırdatmadan basılı tutmak zorunda kalıyormuş gibi hissediyordu. 20px,
// gerçek harita sürüklemesini (tipik olarak 30px+) hâlâ net ayırt ederken
// dokunma hassasiyetindeki cihaz farklarını tolere ediyor.
//
// EK DÜZELTME: 20px'e çıkarmak bile bazı Android/Chrome sürümlerinde
// yetersiz kaldı — raporlara göre kullanıcı parmağını hiç kıpırdatmadan
// bıraktığı hâlde "basılı tutmak" gerekiyormuş gibi hissediliyordu. Kök
// neden: Android'in dokunma sensörü, basılı tutulan parmağın temas
// alanı/basıncı değiştikçe (ki bu her zaman olur) sahte küçük hareketler
// üretiyor VE bu üretim ilk birkaç on milisaniyede daha yoğun. Sadece
// mesafeye bakmak yerine artık SÜRE de dikkate alınıyor: dokunuş çok kısa
// sürdüyse (gerçek bir sürükleme insan reflekleriyle bu kadar hızlı
// tamamlanamaz), daha gevşek bir mesafe toleransıyla yine de "dokunma"
// sayılıyor. Bu, gerçek hızlı sürüklemeleri (genelde daha uzun mesafeli)
// yanlışlıkla tıklama saymaz ama Android'in sensör gürültüsünü tolere eder.
const TAP_TIME_THRESHOLD_MS = 250; // bu sürenin altında biten dokunuşlar süre bazlı toleranstan yararlanır.
const TAP_TIME_DISTANCE_CAP = 40; // süre bazlı toleranstaki üst mesafe sınırı (px).

/**
 * useMapPanZoom — tek elle sürükleme, iki parmakla pinch-zoom (mobil),
 * fare tekerleğiyle zoom (masaüstü test için) ve çift tıkla sıfırlama sağlar.
 *
 * GENİŞLETİLMİŞ (kare) HARİTA: harita ekran YÜKSEKLİĞİNE sığdırılır
 * (scale 1), genişliği ekrandan fazla olduğu için oyun açıldığında SOLA
 * YASLI (x = 0) gösterilir; oyuncu sağa kaydırarak kalan kısmı görür.
 * Transform orijini SOL-ÜST köşedir (CSS: transform-origin: 0 0), bu yüzden
 * x = 0 her zaman haritanın en solu demektir ve ekran boyutu değişse de
 * (adres çubuğu, döndürme) sol kenar yerinde kalır.
 * Kullanıcı sadece İÇERİ yakınlaştırabilir (scale 1 → 2.5); yakınlaştırma
 * parmakların/imlecin altındaki noktaya doğru yapılır.
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
  const singlePointerDownAt = useRef(0);

  // Sınır hesabı (orijin sol-üst): harita ekrandan genişse x ∈ [vw - w*scale, 0];
  // ekrandan dar kalırsa (çok geniş masaüstü pencere) ortalanır.
  const clampTransform = useCallback((next) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const vp = viewportRef.current;
    const wrap = wrapRef.current;
    const vw = vp?.clientWidth ?? 0;
    const vh = vp?.clientHeight ?? 0;
    const cw = (wrap?.offsetWidth ?? 0) * scale;
    const ch = (wrap?.offsetHeight ?? 0) * scale;
    const fit = (pos, view, content) =>
      content <= view ? (view - content) / 2 : Math.min(0, Math.max(view - content, pos));
    return { scale, x: fit(next.x, vw, cw), y: fit(next.y, vh, ch) };
  }, [viewportRef, wrapRef]);

  // (cx, cy) viewport içi noktası sabit kalacak şekilde ölçeği değiştirir.
  const zoomAround = useCallback((prev, nextScale, cx, cy) => {
    const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const k = ns / prev.scale;
    return clampTransform({ scale: ns, x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k });
  }, [clampTransform]);

  const localPoint = useCallback((clientX, clientY) => {
    const r = viewportRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, [viewportRef]);

  const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = useCallback((e) => {
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      movedDistance.current = 0;
      wasMultiTouch.current = false;
      singlePointerDownAt.current = Date.now();
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
        x: transform.x,
        y: transform.y,
        mid: localPoint((p1.x + p2.x) / 2, (p1.y + p2.y) / 2),
      };
      dragStart.current = null;
    }
  }, [transform, viewportRef, localPoint]);

  const onPointerMove = useCallback((e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [p1, p2] = [...pointers.current.values()];
      const newDistance = getDistance(p1, p2);
      const ratio = newDistance / (pinchStart.current.distance || 1);
      const ps = pinchStart.current;
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, ps.scale * ratio));
      const k = ns / ps.scale;
      const mid = localPoint((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      // Pinch başladığında parmakların ortasındaki harita noktası, parmaklar
      // hareket ettikçe yeni orta noktanın altında kalır (zoom + pan birlikte).
      setTransform(clampTransform({
        scale: ns,
        x: mid.x - (ps.mid.x - ps.x) * k,
        y: mid.y - (ps.mid.y - ps.y) * k,
      }));
      return;
    }

    if (dragStart.current) {
      const { x: startX, y: startY, tx, ty } = dragStart.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      movedDistance.current = Math.max(movedDistance.current, Math.hypot(dx, dy));
      setTransform((prev) => clampTransform({ ...prev, x: tx + dx, y: ty + dy }));
    }
  }, [clampTransform, localPoint]);

  const endPointer = useCallback((e) => {
    // Android'de kısa/hızlı dokunuşlarda tarayıcı bazen `pointerup` yerine
    // `pointercancel` gönderiyor (native sürükleme/kaydırma algılayıcısı
    // hızlı dokunuşu belirsiz bulup iptal ediyor). `pointercancel`
    // event'inin clientX/clientY'si spesifikasyon gereği GÜVENİLİR DEĞİL —
    // pratikte çoğu Android/Chrome sürümünde 0,0 geliyor. Bu yüzden
    // koordinat için event'in kendisine değil, pointerdown/pointermove'da
    // sürekli güncellenen son GERÇEK parmak konumuna güveniyoruz. Bu, kısa
    // bir dokunuşun "hiçbir şey olmamış gibi" kaybolmasını (ve kullanıcının
    // parmağını basılı tutmak zorunda kalmasını) önlüyor.
    const lastKnown = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);

    // Tek parmak/fare ile, ciddi bir hareket olmadan bırakıldıysa: bu bir
    // "dokunma/tıklama"dır — dışarıya bildir, CityMap hangi bölge olduğunu bulsun.
    // Ayrıca dokunuş çok kısa sürdüyse (TAP_TIME_THRESHOLD_MS altında), daha
    // gevşek bir mesafe toleransıyla da tıklama sayılır — bkz. TAP_THRESHOLD
    // üstündeki not (Android sensör gürültüsü).
    const elapsed = Date.now() - singlePointerDownAt.current;
    const isTap =
      movedDistance.current <= TAP_THRESHOLD ||
      (elapsed <= TAP_TIME_THRESHOLD_MS && movedDistance.current <= TAP_TIME_DISTANCE_CAP);
    if (!wasMultiTouch.current && isTap && pointers.current.size === 0) {
      const x = lastKnown?.x ?? e.clientX;
      const y = lastKnown?.y ?? e.clientY;
      onTap?.(x, y);
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
      const pt = localPoint(e.clientX, e.clientY);
      setTransform((prev) => zoomAround(prev, prev.scale + delta, pt.x, pt.y));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [viewportRef, zoomAround, localPoint]);

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

  // İlk açılışta (ve reset'te) harita SOLA YASLI başlar: x = 0.
  useLayoutEffect(() => {
    setTransform((prev) => clampTransform({ ...prev, x: 0, y: 0 }));
  }, [clampTransform]);

  const reset = useCallback(() => {
    setTransform(clampTransform({ scale: 1, x: 0, y: 0 }));
  }, [clampTransform]);

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