import { usePlayer } from './usePlayer';
import { hasFreePass } from '../../functions/onboardingData.js';

// v168.1 — tek seferlik görev hakkı (sunucuyla aynı kural, functions/onboardingData.js › hasFreePass):
// ibadet / haraç / bağış görevine gelen oyuncu bugün zaten yapmışsa düğme bir kez daha açılır.
export function useTaskPass() {
  const { player } = usePlayer();
  return { pray: hasFreePass(player, 4), harac: hasFreePass(player, 6), bagis: hasFreePass(player, 7) };
}
// satıcı için düğme durumu (ikisinin de kuralı sunucuyla aynı)
export function vendorDayState(actions, vendorId, pass) {
  const donated = Boolean(actions?.vendorPurchases?.[vendorId]);
  const heisted = Boolean(actions?.heist?.[vendorId]);
  return {
    bagisDone: (donated && !pass.bagis) || heisted, // haraç kestiğin satıcıya aynı gün bağış yok
    haracDone: (heisted || donated) && !pass.harac,
  };
}
