import './QuantityStepper.css';

// Boş "adet yaz" kutusu yerine görsel bir seçici: -/+ butonları + hızlı
// miktar butonları (max varsa "Hepsi").
export default function QuantityStepper({ value, onChange, max, step = 1, quickAmounts = [] }) {
  const num = Number(value) || 0;

  const clamp = (v) => {
    let n = Math.max(0, v);
    if (max !== undefined) n = Math.min(n, max);
    return n;
  };

  return (
    <div className="qty-stepper">
      <div className="qty-stepper-row">
        <button
          type="button"
          className="qty-stepper-btn"
          disabled={num <= 0}
          onClick={() => onChange(clamp(num - step))}
        >
          −
        </button>
        <span className="qty-stepper-value">{num}</span>
        <button
          type="button"
          className="qty-stepper-btn"
          disabled={max !== undefined && num >= max}
          onClick={() => onChange(clamp(num + step))}
        >
          +
        </button>
      </div>
      {(quickAmounts.length > 0 || num > 0) && (
        <div className="qty-stepper-quick">
          {quickAmounts.map((q) => (
            <button
              key={q}
              type="button"
              className="qty-stepper-quick-btn"
              onClick={() => onChange(clamp(num + q))}
            >
              {q}
            </button>
          ))}
          {max !== undefined && max > 0 && (
            <button type="button" className="qty-stepper-quick-btn" onClick={() => onChange(max)}>
              Hepsi ({max})
            </button>
          )}
          {num > 0 && (
            <button
              type="button"
              className="qty-stepper-quick-btn reset"
              onClick={() => onChange(0)}
            >
              Sıfırla
            </button>
          )}
        </div>
      )}
    </div>
  );
}
