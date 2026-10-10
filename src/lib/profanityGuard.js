// v86.1 — istemci tarafı küfür kontrolü (sunucuyla aynı liste: functions/profanity.js).
// Doğrudan istemciden yazılan yerler (mekanlardaki konuşma balonları) için.
// Küfür varsa kısa bir uyarı gösterir ve true döner → çağıran göndermez;
// yazı kutuda kalır, oyuncu düzeltip küfürsüz gönderebilir.
import { hasProfanity, PROFANITY_WARNING } from '../../functions/profanity.js';

let el = null;
let timer = 0;
export function showProfanityWarning(text = PROFANITY_WARNING) {
  if (typeof document === 'undefined') return;
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.style.cssText =
      'position:fixed;left:50%;top:max(16px, env(safe-area-inset-top));transform:translateX(-50%);z-index:100000;max-width:min(92vw,420px);padding:12px 16px;border-radius:14px;background:rgba(40,8,16,0.96);border:1px solid #ff4f6d;color:#ffe3e8;font:600 13.5px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.5);text-align:center;pointer-events:none;';
  }
  el.textContent = text;
  if (!el.isConnected) document.body.appendChild(el);
  clearTimeout(timer);
  timer = setTimeout(() => el?.remove(), 4000);
}

export function blockProfanity(text) {
  if (!hasProfanity(text)) return false;
  showProfanityWarning();
  return true;
}
