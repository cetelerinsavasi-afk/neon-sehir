// =============================================================================
// v202 — Geçici bildirim (panel kapandıktan sonra da görünür)
// -----------------------------------------------------------------------------
// Satın alma paneli kapanınca React bileşeni de kalktığı için bildirim panelin içinde
// gösterilemiyordu. Bu yardımcı bildirimi doğrudan sayfaya (body) ekler: `ms` sonra
// kendiliğinden kaybolur, üstüne dokununca hemen kapanır. Aynı anda tek bildirim
// (yenisi eskisinin yerine geçer). Görünüm: yasaklı madde satış bildirimi (SaleToast).
// Firestore / ağ ile ilgisi yok.
// =============================================================================
import '../components/ShadyDeal/SaleToast.css';

let current = null;

function close(el) {
  if (!el) return;
  clearTimeout(el._t);
  el.remove();
  if (current === el) current = null;
}

export function flashToast({ title, text = '', tone = 'success', ms = 3000 } = {}) {
  if (typeof document === 'undefined' || !document.body) return;
  close(current);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `sale-toast ${tone === 'fail' ? 'fail' : 'success'}`;
  el.style.zIndex = '6000'; // açık mekân / şehir katmanlarının üstünde
  el.setAttribute('aria-live', 'polite');
  const b = document.createElement('b');
  b.textContent = title || '';
  el.appendChild(b);
  if (text) {
    const s = document.createElement('span');
    s.textContent = text;
    el.appendChild(s);
  }
  el.addEventListener('click', () => close(el));
  el._t = setTimeout(() => close(el), ms);
  document.body.appendChild(el);
  current = el;
}
