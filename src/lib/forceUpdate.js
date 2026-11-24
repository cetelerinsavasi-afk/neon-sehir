// =============================================================================
// v188 — ZORUNLU GÜNCELLEME
//
// Her sürümde BUILD bir artırılır (v188 → 188, v189 → 189 ...). public/neon-flags.json
// içindeki "minBuild" bundan büyükse bu istemci eskidir: sayfa, oyuncu bir işin ortasında
// DEĞİLKEN kendiliğinden yenilenir (index.html önbelleğe alınmadığı için yeni sürüm gelir).
//
// Ne zaman yenilenir?
//  • Açılışta: eski olduğu anlaşılırsa ve oyuncu henüz hiçbir şeye dokunmadıysa (ilk 30 sn) hemen.
//  • Uygulama arka plana alınınca (oyuncu başka uygulamaya geçti / ekranı kapattı).
//  • Açık ekranda: oyuncu 3 dakikadır hiçbir şeye dokunmuyorsa VE meşgul değilse.
//    Meşgul = araç sürüyor / yolcu, iş (kurye vb.) yapıyor, yarışta, arcade / slot / mini oyunda,
//    yayında, soygun ekranında, video izliyor ya da bir yazı alanına yazıyor (BUSY_SELECTOR).
// Döngü koruması: 10 dakikada en fazla 1 yenileme (CDN bir süre eski dosyayı verirse sayfa
// sürekli yenilenmesin).
// Kontrol: açılışta + açıkken 5 dakikada bir neon-flags.json (küçük statik dosya; Firestore /
// RTDB okuması YOK). Dosya yoksa / bozuksa / minBuild yoksa hiçbir şey yapılmaz.
// =============================================================================
export const BUILD = 202; // v197 (v196e dahil)
export const CHECK_MS = 5 * 60 * 1000;
export const IDLE_MS = 3 * 60 * 1000;
export const FIRST_TOUCH_MS = 30 * 1000;
export const RELOAD_GAP_MS = 10 * 60 * 1000;
export const RELOAD_KEY = 'ns.updReloadAt';
export const BUSY_SELECTOR = [
  '.ns-busy',
  '.cs-drive', // araç sürüyor
  '.cs-job.on', // iş (kurye, taksi...) sürüyor
  '.race-fullscreen',
  '.ta-root',
  '.gs-runner',
  '.arc-console',
  '.slot-screen',
  '.flappy-screen',
  '.gy-game',
  '.fsg-wrap',
  '.st-hostfs',
  '.cs-heist-wait',
  '.hx-result',
  'video',
  'input:focus',
  'textarea:focus',
  '[contenteditable="true"]:focus',
].join(', ');

export function isOutdated(flags, build = BUILD) {
  const min = Number(flags?.minBuild);
  return Number.isFinite(min) && min > build;
}

// Saf mantık: tarayıcı bağımlılıkları dışarıdan verilir (test edilebilir).
export function createForceUpdate({ now, fetchFlags, reload, isBusy, isHidden, storage, build = BUILD, startedAt = now() }) {
  let pending = false;
  let lastInput = 0; // hiç dokunulmadıysa 0
  let checking = false;

  const canReload = () => {
    let last = 0;
    try {
      last = Number(storage?.getItem(RELOAD_KEY)) || 0;
    } catch {
      last = 0;
    }
    return now() - last >= RELOAD_GAP_MS || last > now();
  };
  const doReload = (why) => {
    if (!canReload()) return false;
    try {
      storage?.setItem(RELOAD_KEY, String(now()));
    } catch {
      /* yoksay */
    }
    reload(why);
    return true;
  };
  const idleNow = () => {
    if (isHidden()) return true;
    const quiet = lastInput ? now() - lastInput >= IDLE_MS : now() - startedAt >= IDLE_MS;
    return quiet && !isBusy();
  };
  // Eski sürümse ve uygun anse yenile. Dönüş: yenilendi mi
  const tryNow = (why) => {
    if (!pending) return false;
    if (why === 'start' && !lastInput && now() - startedAt <= FIRST_TOUCH_MS && !isBusy()) return doReload('start');
    if (idleNow()) return doReload(why);
    return false;
  };
  const check = async (why = 'check') => {
    if (checking) return pending;
    checking = true;
    try {
      const flags = await fetchFlags();
      if (isOutdated(flags, build)) pending = true;
    } catch {
      /* ağ yok: sonra tekrar */
    } finally {
      checking = false;
    }
    if (pending) tryNow(why);
    return pending;
  };
  return {
    check,
    tryNow,
    input: () => {
      lastInput = now();
    },
    hidden: () => tryNow('hidden'),
    tick: () => tryNow('idle'),
    _state: () => ({ pending, lastInput }),
  };
}

export function installForceUpdate(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.document || win.__nsForceUpdate) return null;
  const doc = win.document;
  const fu = createForceUpdate({
    now: () => Date.now(),
    fetchFlags: () => win.fetch(`/neon-flags.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
    reload: () => win.location.reload(),
    isBusy: () => {
      try {
        return Boolean(doc.querySelector(BUSY_SELECTOR) || doc.fullscreenElement);
      } catch {
        return true;
      }
    },
    isHidden: () => doc.visibilityState === 'hidden',
    storage: (() => {
      try {
        return win.localStorage;
      } catch {
        return null;
      }
    })(),
  });
  win.__nsForceUpdate = fu;
  const onInput = () => fu.input();
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) win.addEventListener(t, onInput, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') fu.hidden();
    else fu.check('visible');
  });
  win.setTimeout(() => fu.check('start'), 1500);
  win.setInterval(() => {
    if (doc.visibilityState !== 'hidden') fu.check('check');
  }, CHECK_MS);
  win.setInterval(() => fu.tick(), 15_000);
  return fu;
}
