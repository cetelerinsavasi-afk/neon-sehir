import { useMemo, useState } from 'react';
import './QuantityStepper.css';

// v67/v70 — ortak adım sistemi (oyunun her yerinde aynı):
//   [−]  değer  [+]
//   1 · 10 · 100 · 1.000 · 10.000 …
//   - Bir sayı butonuna basınca değer O KADAR ARTAR ve o buton SEÇİLİ olur;
//     tekrar bastıkça artmaya devam eder.
//   - [+] seçili sayı kadar artırır, [−] seçili sayı kadar azaltır (varsayılan 1).
//   Max · Sıfırla
//   v74: değer üst sınırdayken de TÜM butonlar basılabilir (sayı artmaz, ama
//   adım seçilebilir → [−] ile istenen miktarda azaltılabilir).
// `step` taban birimidir (ör. fiyatlarda 10) — adımlar onun 10'ar katlarıdır.
// `quickAmounts` geriye uyumluluk için duruyor: içindeki en büyük değer adım
// listesinin ne kadar büyüyeceğini belirler (ör. 100.000'e kadar).
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

export default function QuantityStepper({ value, onChange, max, min = 0, step = 1, quickAmounts = [], steps: stepsProp, showMax = true }) {
  const num = Number(value) || 0;
  const base = Math.max(1, Number(step) || 1);

  const steps = useMemo(() => {
    if (Array.isArray(stepsProp) && stepsProp.length) return stepsProp;
    const quickMax = quickAmounts.reduce((m, q) => Math.max(m, Number(typeof q === 'object' ? q.value : q) || 0), 0);
    const list = [];
    for (let s = base, k = 0; k < 7; k++, s *= 10) {
      if (k > 4 && s > quickMax) break;
      list.push(s);
    }
    const cap = max !== undefined ? Math.max(base, Number(max) || 0) : Infinity;
    return list.filter((s, i) => i === 0 || s <= cap);
  }, [stepsProp, quickAmounts, base, max]);

  const [picked, setPicked] = useState(null);
  const sel = picked && steps.includes(picked) ? picked : steps[0];

  const clamp = (v) => {
    let n = Math.max(min, v);
    if (max !== undefined) n = Math.min(n, Math.max(min, Number(max) || 0));
    return n;
  };

  const atMax = max !== undefined && num >= max;

  return (
    <div className="qty-stepper">
      <div className="qty-stepper-row">
        <button type="button" className="qty-stepper-btn" disabled={num <= min} onClick={() => onChange(clamp(num - sel))} aria-label={`${fmt(sel)} azalt`}>
          −
        </button>
        <span className="qty-stepper-value">{fmt(num)}</span>
        <button type="button" className={`qty-stepper-btn${atMax ? ' at-max' : ''}`} onClick={() => onChange(clamp(num + sel))} aria-label={`${fmt(sel)} artır`}>
          +
        </button>
      </div>
      {steps.length > 1 && (
        <div className="qty-stepper-steps" role="group" aria-label="Adım">
          {steps.map((s) => (
            <button
              key={s}
              type="button"
              className={`qty-stepper-step${s === sel ? ' on' : ''}`}
              onClick={() => {
                setPicked(s);
                onChange(clamp(num + s));
              }}
              aria-pressed={s === sel}
            >
              +{s >= 1_000_000 ? `${s / 1_000_000}M` : fmt(s)}
            </button>
          ))}
        </div>
      )}
      {((showMax && max !== undefined && max > 0) || num > min) && (
        <div className="qty-stepper-quick">
          {showMax && max !== undefined && max > 0 && (
            <button type="button" className="qty-stepper-quick-btn max" onClick={() => onChange(clamp(max))}>
              Max ({fmt(max)})
            </button>
          )}
          {num > min && (
            <button type="button" className="qty-stepper-quick-btn reset" onClick={() => onChange(min)}>
              Sıfırla
            </button>
          )}
        </div>
      )}
    </div>
  );
}
