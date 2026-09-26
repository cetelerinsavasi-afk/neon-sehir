// Pazar ticaret yolu savaşı takvimi (istemci). Sunucudaki
// functions/gang/clock.js productForSunday ile AYNI kural: dünyanın açılış
// gününden (launchDateKey) sonraki ilk pazardan itibaren her pazar sıradaki
// ürün (yasaklı madde → silah → araba). Tarihler İstanbul saatine göre.
import { istDateKey, istMidnight } from './GangContext';
import { PRODUCTS } from './gangConstants';

const DAY_MS = 86400_000;

// nowMs anındaki haftanın pazarı (bugün pazarsa bugün).
// Dönüş: { product, today, sundayKey, startsAtMs } · launchDateKey yoksa null
export function nextTradeSunday(nowMs, launchDateKey) {
  if (!launchDateKey) return null;
  const key = istDateKey(nowMs);
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const sundayMs = Date.UTC(y, m - 1, d + ((7 - wd) % 7));
  const [ly, lm, ld] = launchDateKey.split('-').map(Number);
  const lwd = new Date(Date.UTC(ly, lm - 1, ld)).getUTCDay();
  const firstSunday = Date.UTC(ly, lm - 1, ld + ((7 - lwd) % 7));
  const weeks = Math.max(0, Math.round((sundayMs - firstSunday) / (7 * DAY_MS)));
  const sundayKey = new Date(sundayMs).toISOString().slice(0, 10);
  return { product: PRODUCTS[weeks % PRODUCTS.length], today: wd === 0, sundayKey, startsAtMs: istMidnight(sundayKey) };
}

// Geri sayımın görüneceği süre: savaştan 24 saat önce (Cumartesi 00:00).
export const TRADE_COUNTDOWN_WINDOW_MS = 24 * 3600_000;
