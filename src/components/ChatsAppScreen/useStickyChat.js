import { useEffect, useLayoutEffect, useRef } from 'react';

// =============================================================================
// v217 — sohbet her zaman EN ALTTAN açılır (WhatsApp gibi).
// Eskiden sadece "son mesaj değişince" bir kez scrollIntoView yapılıyordu. Sohbet açılırken
// mesajlar parça parça geliyor (cihaz önbelleği → canlı veri), telefon açılma animasyonu ve
// yazı alanı da listenin boyunu sonradan değiştiriyor → ilk kaydırma boşa gidiyor, liste
// üstten görünüyordu.
// Şimdi: liste "alta yapışık" başlar. İçerik ya da kutu boyu her değiştiğinde (ResizeObserver)
// yapışıksa tekrar en alta iner. Oyuncu yukarı kaydırınca yapışma bırakılır (eski mesajları
// okurken ekran zıplamaz); en alta dönünce tekrar yapışır. Kendi gönderdiğin mesaj her zaman
// en alta indirir. Eski mesajlar üste eklenince bakılan yer sabit kalır (keepPos).
// =============================================================================
const NEAR_BOTTOM = 80; // px — bu kadar yakınsa "en altta" sayılır

export function useStickyChat({ listRef, innerRef, lastId, lastMine, count, onNearTop }) {
  const stick = useRef(true);
  const keepPos = useRef(null);
  const lastIdRef = useRef(null);

  const toBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // içerik / kutu boyu değişince (mesajlar geldi, animasyon bitti, klavye açıldı…) alta yapış
  useEffect(() => {
    const el = listRef.current;
    const inner = innerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (keepPos.current) return; // eski mesaj ekleniyor: yeri layout effect korur
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mesaj listesi değişti: ya eski mesajlar üste eklendi (yeri koru) ya da yeni mesaj geldi
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const k = keepPos.current;
    if (k) {
      el.scrollTop = el.scrollHeight - k.height + k.top;
      keepPos.current = null;
      return;
    }
    if (lastId && lastId !== lastIdRef.current) {
      const first = lastIdRef.current === null;
      lastIdRef.current = lastId;
      if (first || stick.current || lastMine) {
        stick.current = true;
        el.scrollTop = el.scrollHeight;
      }
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, count]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    // ilk açılış kaydırması bitmeden "önceki mesajlar" tetiklenmesin
    if (!stick.current && lastIdRef.current && el.scrollTop < 40 && el.scrollHeight > el.clientHeight) onNearTop?.();
  };

  // eski mesajları yüklemeden hemen önce çağır (yer sabit kalsın)
  const rememberPos = () => {
    const el = listRef.current;
    if (el) keepPos.current = { height: el.scrollHeight, top: el.scrollTop };
  };
  const forgetPos = () => {
    keepPos.current = null;
  };

  return { onScroll, rememberPos, forgetPos, toBottom };
}
