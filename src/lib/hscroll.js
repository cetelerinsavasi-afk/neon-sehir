// =============================================================================
// v93 — Masaüstünde yatay şeritleri kaydırma (mobilya rafı, kategori sekmeleri…)
// Dokunmatikte parmakla kaydırılan şeritler PC'de kaydırılamıyordu (kaydırma
// çubuğu gizli). root içindeki `selector` şeritlerine:
//   • fare tekerleği (dikey) → yatay kaydırma
//   • fareyle sürükleyerek kaydırma (sürükleme sonrası tıklama yutulur ki
//     yanlışlıkla eşya eklenmesin)
// Dokunmatik (pointerType 'touch' / 'pen') davranışına dokunmaz.
// =============================================================================
const DRAG_PX = 6;

function stripOf(target, root, selector) {
  const el = target?.closest?.(selector);
  return el && root.contains(el) && el.scrollWidth > el.clientWidth + 1 ? el : null;
}

export function attachHScroll(root, selector) {
  if (!root) return () => {};
  let drag = null; // { el, x, left, moved, id }
  let swallowClick = false;

  const onWheel = (e) => {
    if (e.ctrlKey) return;
    const el = stripOf(e.target, root, selector);
    if (!el) return;
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!d) return;
    const max = el.scrollWidth - el.clientWidth;
    // sona gelmişse ve aynı yöne devam ediyorsa sayfanın/kameranın kaydırması bozulmasın
    if ((d < 0 && el.scrollLeft <= 0) || (d > 0 && el.scrollLeft >= max - 1)) return;
    e.preventDefault();
    e.stopPropagation();
    el.scrollLeft += e.deltaMode === 1 ? d * 32 : d;
  };
  const onDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = stripOf(e.target, root, selector);
    if (!el) return;
    drag = { el, x: e.clientX, left: el.scrollLeft, moved: false, id: e.pointerId };
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < DRAG_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add('hscroll-drag');
    }
    drag.el.scrollLeft = drag.left - dx;
    e.preventDefault();
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);
    }
    drag.el.classList.remove('hscroll-drag');
    drag = null;
  };
  const onClick = (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    root.removeEventListener('click', onClick, true);
  };
}
