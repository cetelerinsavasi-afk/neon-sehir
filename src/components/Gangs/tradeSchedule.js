// Ticaret yolu savaşı takvimi (istemci). v136: savaş CUMARTESİ (eskiden Pazar).
// Sunucudaki functions/gang/clock.js productForSunday ile AYNI kural: dünyanın
// açılış gününden (launchDateKey) sonraki ilk pazardan itibaren geçen gün / 7
// YUVARLANIR → her hafta sıradaki ürün (yasaklı madde → silah → araba).
// Tarihler İstanbul saatine göre.
import { istDateKey, istMidnight } from './GangContext';
import { PRODUCTS } from './gangConstants';

const DAY_MS = 86400_000;
export const TRADE_WAR_WEEKDAY = 6; // Cumartesi — sunucu: GANG.TRADE_WAR_WEEKDAY

// nowMs anındaki haftanın savaş günü (bugün savaş günüyse bugün).
// Dönüş: { product, today, sundayKey (savaş günü), startsAtMs } · launchDateKey yoksa null
export function nextTradeSunday(nowMs, launchDateKey) {
  if (!launchDateKey) return null;
  const key = istDateKey(nowMs);
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const warMs = Date.UTC(y, m - 1, d + ((TRADE_WAR_WEEKDAY - wd + 7) % 7));
  const [ly, lm, ld] = launchDateKey.split('-').map(Number);
  const lwd = new Date(Date.UTC(ly, lm - 1, ld)).getUTCDay();
  const firstSunday = Date.UTC(ly, lm - 1, ld + ((7 - lwd) % 7));
  const weeks = Math.max(0, Math.round((warMs - firstSunday) / (7 * DAY_MS)));
  const sundayKey = new Date(warMs).toISOString().slice(0, 10);
  return { product: PRODUCTS[weeks % PRODUCTS.length], today: wd === TRADE_WAR_WEEKDAY, sundayKey, startsAtMs: istMidnight(sundayKey) };
}

// Geri sayımın görüneceği süre: savaştan 24 saat önce (v136: Cuma 00:00).
export const TRADE_COUNTDOWN_WINDOW_MS = 24 * 3600_000;
