// =============================================================================
// v187 — "Dokunup vazgeçme": parmak butondan dışarı kayınca basış iptal olur.
//
// Telefonda bir butona parmağını koyup vazgeçince parmağını kaydırırsın; normal
// uygulamalarda parmak butonun dışında kalkınca basılmamış sayılır. Oyundaki arayüz
// butonları onClick kullanıyor ama tıklamanın sayılıp sayılmayacağına tarayıcı karar
// veriyordu (Chrome / WebView yalnızca küçük bir kayma eşiğine bakar, butonun
// sınırına bakmaz; kayma eşiği içinde kalan ya da eşik dışına çıkıp geri gelmeyen
// bazı durumlarda tıklama yine geliyordu).
//
// Kural (Android / iOS düğmeleriyle aynı): dokunmatik basışta parmak, butonun
// sınırından (+ SLOP piksel pay) bir kez dışarı çıkarsa o basış iptal; parmak geri
// gelse bile tıklama yutulur. Parmak butonun üstünde kalkarsa tıklama aynen geçer.
//
// Dokunmaz:
//  • fare ile tıklama, klavye (Enter/Boşluk → tıklama), ekran okuyucu
//  • yazı alanları (input/textarea/select — odaklanma bozulmasın)
//  • OYUN İÇİ KONTROLLER (GAME_AREAS): joystick, direksiyon, gaz/fren, korna, piyano /
//    davul, arcade, slot, yarış, mini oyunlar, 3D sahneler, basılı tutma butonları.
//    Bunlar zaten çoğunlukla pointerdown ile çalışır; onClick kullananlar da burada
//    hariç tutulur ki davranışları hiç değişmesin.
//  • bir öğe kendini muaf tutmak isterse: data-tap-instant
// Firestore / ağ ile hiçbir ilgisi yok; sadece DOM olayları.
// =============================================================================
export const SLOP = 12; // px — buton sınırının dışında bu kadar pay (titreyen parmak iptal etmesin)
export const CLICK_WINDOW_MS = 1000; // parmak kalktıktan sonra tıklamanın gelmesi beklenen süre

export const TAP_TARGETS = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], label, summary, .tappable';
export const GAME_AREAS = [
  '[data-tap-instant]',
  '[data-hold]',
  '.cue-hold',
  // 3D / tuval sahneleri
  'canvas',
  '.hs-stage',
  '.hs-gl',
  // şehir sürüşü: direksiyon, pedallar, korna, yuvarlak sürüş tuşları
  '.cs-drive',
  '.cs-pedal',
  '.cs-steer',
  // arcade / mini oyunlar
  '.gs-runner',
  '.gs-pad',
  '.gs-stick',
  '.gs-btn',
  '.arc-console',
  '.gy-game',
  '.flappy-screen',
  '.fsg-wrap',
  '.ta-root',
  '.ta-ctl',
  // müzik aletleri, şarkı yapıcı ızgarası
  '.pn-panel',
  '.bm-cells',
  // slot ve yarış kontrolleri
  '.slot-spin-btn',
  '.slot-reels',
  '.race-controls',
  '.race-gear-btn',
  '.race-roll-btn',
  '.race-nitro-btn',
].join(', ');
const TEXT_FIELDS = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

const elOf = (t) => (t && typeof t.closest === 'function' ? t : t?.parentElement || null);

// Basışın izleneceği buton (yoksa null)
export function guardTarget(target) {
  const el = elOf(target);
  if (!el) return null;
  if (el.closest(TEXT_FIELDS)) return null;
  if (el.closest(GAME_AREAS)) return null;
  return el.closest(TAP_TARGETS) || null;
}

export function outside(rect, x, y, slop = SLOP) {
  return x < rect.left - slop || x > rect.right + slop || y < rect.top - slop || y > rect.bottom + slop;
}

// Olay işleyicileri (test edilebilsin diye ayrı). now: ms veren saat.
export function createTapGuard({ now = () => Date.now() } = {}) {
  let press = null; // { id, el, rect, out }
  let ended = null; // { el, out, at }

  const onDown = (e) => {
    ended = null;
    if (e.pointerType === 'mouse' || e.isPrimary === false) {
      if (e.isPrimary === false && press) press.out = true; // ikinci parmak: basış iptal
      return;
    }
    const el = guardTarget(e.target);
    if (!el) {
      press = null;
      return;
    }
    let rect = null;
    try {
      rect = el.getBoundingClientRect();
    } catch {
      rect = null;
    }
    press = rect ? { id: e.pointerId, el, rect, out: false } : null;
  };
  const onMove = (e) => {
    if (!press || e.pointerId !== press.id || press.out) return;
    if (outside(press.rect, e.clientX, e.clientY)) press.out = true;
  };
  const onUp = (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.out && outside(press.rect, e.clientX, e.clientY)) press.out = true;
    ended = { el: press.el, out: press.out, at: now() };
    press = null;
  };
  const onCancel = (e) => {
    if (press && e.pointerId === press.id) press = null;
  };
  // true → bu tıklama yutulmalı
  const shouldSwallow = (e) => {
    const p = ended;
    if (!p) return false;
    if (now() - p.at > CLICK_WINDOW_MS) {
      ended = null;
      return false;
    }
    const t = elOf(e.target);
    const same = t && (t === p.el || p.el.contains?.(t) || t.contains?.(p.el));
    if (!same) return false;
    ended = null;
    return p.out;
  };
  const onClick = (e) => {
    if (e.detail === 0) return; // klavye / programla tıklama
    if (!shouldSwallow(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation?.();
    e.stopPropagation();
  };
  return { onDown, onMove, onUp, onCancel, onClick, _state: () => ({ press, ended }) };
}

// Uygulamaya bir kez takılır (main.jsx). Yalnızca dokunmatik cihazlarda.
export function installTapGuard(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.addEventListener || win.__nsTapGuard) return null;
  const g = createTapGuard({ now: () => (win.performance?.now ? win.performance.now() : Date.now()) });
  const cap = { capture: true, passive: true };
  win.addEventListener('pointerdown', g.onDown, cap);
  win.addEventListener('pointermove', g.onMove, cap);
  win.addEventListener('pointerup', g.onUp, cap);
  win.addEventListener('pointercancel', g.onCancel, cap);
  // pencere yakalama aşaması: React'in #root dinleyicisinden ÖNCE çalışır
  win.addEventListener('click', g.onClick, { capture: true });
  win.__nsTapGuard = g;
  return g;
}
