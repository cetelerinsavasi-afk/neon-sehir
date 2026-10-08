import '../../styles/bizui.css';
import './Shop.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// v77 — Fiyat belirleme alanı: ne ayarladığın yazar ("Dakika ücreti"), seçtiğin
// fiyat büyük görünür, en az / en çok sınırları ve karşılaştırma fiyatı
// (ör. "Oyunun fiyatı: 2.000") yazıyla verilir. − / + ile adım adım da ayarlanır.
export default function PriceField({ label, hint, value, min, max, step = 1, onChange, refPrice, refLabel = 'Oyunun fiyatı', unit = 'altın', saved }) {
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const pos = (v) => (max > min ? ((v - min) / (max - min)) * 100 : 100);
  return (
    <div className="pf">
      <div className="pf-top">
        <span className="pf-label">{label}</span>
        <b className="pf-val">
          {fmt(value)} {unit}
        </b>
      </div>
      {hint && <p className="bz-hint">{hint}</p>}
      <div className="pf-ctrl">
        <button type="button" className="pf-step" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label="Azalt">
          −
        </button>
        <div className="pf-track">
          {refPrice !== undefined && <span className="pf-ref" style={{ left: `${pos(refPrice)}%` }} />}
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} aria-label={typeof label === 'string' ? label : 'Fiyat'} />
        </div>
        <button type="button" className="pf-step" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label="Artır">
          +
        </button>
      </div>
      <div className="pf-ends">
        <span>En az {fmt(min)}</span>
        {refPrice !== undefined && (
          <span className="pf-ref-txt">
            {refLabel}: {fmt(refPrice)}
          </span>
        )}
        <span>En çok {fmt(max)}</span>
      </div>
      {saved !== undefined && saved !== value && <p className="pf-dirty">Şu an kayıtlı fiyat: {fmt(saved)} {unit} — değişikliği kaydetmeyi unutma.</p>}
    </div>
  );
}
