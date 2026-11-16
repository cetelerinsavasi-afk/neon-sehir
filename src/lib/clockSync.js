// =============================================================================
// v165 — ORTAK SAATİN KAYNAĞI (saf mantık; Firebase'e doğrudan bağlı değil → testlenebilir)
//
// Eskiden: açılışta + uygulamaya geri dönünce (en fazla 10 dk'da bir) `serverTime`
// fonksiyonu 2 kez çağrılırdı. Haftada ~14 bin çağrı, ~1.600'ü soğuk başlatma (≈2,5 sn);
// tüm fonksiyon CPU'sunun ~%11'i.
// Şimdi: Realtime Database'e bağlanırken sunucu zaten saatini gönderir; SDK farkı
// `.info/serverTimeOffset` olarak verir (okuma/indirme ücreti yok, kural gerektirmez).
// Bağlantı her kopup yeniden kurulduğunda (uygulama arka plandan dönünce vb.) fark
// kendiliğinden tazelenir.
// Güvenlik ağı: RTDB adresi yoksa, `neon.clockViaFn`='1' bayrağı varsa ya da RTDB
// RTDB_WAIT_MS içinde bağlanamazsa ESKİ YOL (serverTime fonksiyonu) aynen çalışır.
// =============================================================================
export const RTDB_WAIT_MS = 8000;

/**
 * @param {object} o
 * @param {boolean} o.useRtdb               false → doğrudan eski yol
 * @param {(cb:(connected:boolean, offset?:number)=>void)=>Promise<void>} o.connectRtdb
 * @param {(force:boolean)=>Promise<any>} o.syncViaFn   eski yol (serverTime fonksiyonu)
 * @param {(offset:number)=>void} o.applyOffset
 */
export function createClockSync({ useRtdb, connectRtdb, syncViaFn, applyOffset, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let rtdb = Boolean(useRtdb);
  let rtConnected = false;
  let rtOffsets = 0;
  let fbTimer = null;
  let fnCalls = 0;

  const viaFn = (force) => {
    fnCalls += 1;
    return Promise.resolve()
      .then(() => syncViaFn(force))
      .catch(() => {});
  };
  // RTDB kısa sürede bağlanmazsa eski yol (çevrimdışı/engelli ağ vb.)
  const armFallback = (force) => {
    if (fbTimer) return;
    fbTimer = setTimer(() => {
      fbTimer = null;
      if (!rtConnected) viaFn(force);
    }, RTDB_WAIT_MS);
  };
  const onRtdb = (connected, offset) => {
    rtConnected = Boolean(connected);
    if (!rtConnected) return;
    const n = Number(offset);
    if (!Number.isFinite(n)) return;
    rtOffsets += 1;
    if (fbTimer) {
      clearTimer(fbTimer);
      fbTimer = null;
    }
    applyOffset(n);
  };

  return {
    start() {
      if (!rtdb) {
        viaFn(true);
        return 'fn';
      }
      armFallback(true);
      Promise.resolve()
        .then(() => connectRtdb(onRtdb))
        .catch(() => {
          // RTDB modülü yüklenemedi / adres hatalı → tamamen eski yola dön
          rtdb = false;
          if (fbTimer) {
            clearTimer(fbTimer);
            fbTimer = null;
          }
          viaFn(true);
        });
      return 'rtdb';
    },
    // uygulama öne gelince: eski yolda eskisi gibi (10 dk sınırı serverClock'ta);
    // RTDB yolunda bağlantı zaten yeniden kurulup farkı tazeler — kurulamazsa eski yol.
    onVisible() {
      if (!rtdb) return viaFn(false);
      if (!rtConnected) armFallback(false);
      return undefined;
    },
    onOnline() {
      if (!rtdb) return viaFn(true);
      if (!rtConnected) armFallback(true);
      return undefined;
    },
    _state: () => ({ rtdb, rtConnected, rtOffsets, fnCalls, fallbackArmed: Boolean(fbTimer) }),
  };
}
