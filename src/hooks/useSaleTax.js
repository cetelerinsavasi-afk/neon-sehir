// =============================================================================
// v202 — FİYATA EKLENEN VERGİ (istemci). Sunucuyla aynı formül (functions/v196Shared.js addonTaxOf).
//   type: 'galeri' | 'motogaleri' | 'silahci' | 'modifiye' | 'spor' | 'tamirci' · 'ticari' (ticari araç)
//   Diğer türler (kafe, bar, internet…) eski sistemde → vergi 0 (fiyat aynen).
// Müşteri ödemeden önce "Fiyat + Vergi = Toplam" görür; sunucuya expect olarak TOPLAM gider.
// Oran: belediyenin bugünkü oranı (useBelediyeRates — günlük önbellekli, ek okuma yok).
// =============================================================================
import { useMemo } from 'react';
import { useBelediyeRates } from './useBelediyeRates';
import { bizRateFrac, rateFrac } from '../../functions/belediyeRates.js';
import { addonTaxOf, isAddonTaxVenue } from '../../functions/v196Shared.js';

export const TAX_NAME = {
  galeri: 'Araba vergisi',
  motogaleri: 'Motor vergisi',
  silahci: 'Silah vergisi',
  modifiye: 'Modifiye vergisi',
  spor: 'Spor salonu vergisi',
  tamirci: 'Tamirci vergisi',
  ticari: 'Ticari araç vergisi',
};

export function useSaleTax(type) {
  const rates = useBelediyeRates();
  const frac = type === 'ticari' ? rateFrac(rates, 'ticariArac') : isAddonTaxVenue(type) ? bizRateFrac(rates, type) : 0;
  return useMemo(() => {
    const taxOf = (price) => addonTaxOf(price, frac);
    return {
      frac,
      pct: Math.round(frac * 1000) / 10,
      name: TAX_NAME[type] || 'Vergi',
      taxOf,
      totalOf: (price) => Math.max(0, Math.round(Number(price) || 0)) + taxOf(price),
    };
  }, [frac, type]);
}
