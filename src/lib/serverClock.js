// v137 — ORTAK SAAT: oyunun saati telefonun saatine değil SUNUCUNUN saatine bağlı.
// Telefonun saati birkaç dakika ileri/geri ya da yanlış ayarlıysa (ya da oyuncu
// yurtdışındaysa) bile herkes aynı anı görür: 00:00 geçişleri, geri sayımlar,
// mekânlarda "şu an buradakiler" listesi vb.
//
// Nasıl: açılışta (ve uygulamaya geri dönülünce) sunucudan saat istenir
// (functions/index.js serverTime), fark (offset) hesaplanır ve Date.now() bu
// farkla düzeltilir. Bu dosya main.jsx'te diğer modüllerden ÖNCE yüklenir; son
// bilinen fark localStorage'da tutulur (açılışta hemen doğru saat).
// Zaman dilimi: oyunun tüm tarihleri İstanbul saatiyle hesaplanır (istDateKey,
// istanbulDateKey, timeZone: 'Europe/Istanbul') — telefonun saat dilimi önemsiz.

const realNow = Date.now.bind(Date);
const KEY = 'neon.srvClockOffset';
let offset = 0;
let lastSyncAt = 0;

try {
  const v = Number(window.localStorage.getItem(KEY));
  if (Number.isFinite(v) && Math.abs(v) < 30 * 86400_000) offset = v;
} catch {
  /* gizli sekme vb. */
}

if (!Date.now.__srvClock) {
  const patched = () => realNow() + offset;
  patched.__srvClock = true;
  Date.now = patched;
}

export function serverNow() {
  return realNow() + offset;
}
export function clockOffsetMs() {
  return offset;
}

function apply(next) {
  // küçük oynamalarda (ağ gecikmesi) saat zıplamasın
  if (Math.abs(next - offset) < 400) return;
  offset = next;
  try {
    window.localStorage.setItem(KEY, String(offset));
  } catch {
    /* yoksay */
  }
}

// call: () => Promise<{ data: { now } }> (Firebase callable). İki ölçüm; gidiş-dönüşü
// kısa olan (sıcak çağrı) kullanılır: sunucu anı ≈ istek ile yanıtın ortası.
let running = null;
export function syncServerClock(call, { force = false } = {}) {
  if (running) return running;
  if (!force && realNow() - lastSyncAt < 10 * 60_000) return Promise.resolve(offset);
  running = (async () => {
    let best = null;
    for (let i = 0; i < 2; i += 1) {
      try {
        const t0 = realNow();
        const r = await call();
        const t1 = realNow();
        const srv = Number(r?.data?.now);
        if (!srv || t1 < t0) continue;
        const rtt = t1 - t0;
        if (!best || rtt < best.rtt) best = { rtt, off: Math.round(srv - (t0 + t1) / 2) };
      } catch {
        /* çevrimdışı: son bilinen fark kalır */
      }
    }
    if (best && best.rtt < 15_000) {
      apply(best.off);
      lastSyncAt = realNow();
    }
    running = null;
    return offset;
  })();
  return running;
}
