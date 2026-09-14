import { useState } from 'react';
import './InfoTooltip.css';

// InfoTooltip — küçük bir "ⓘ" butonu; tıklanınca kısa, sade bir açıklama
// balonu açılır. KULLANICI İSTEĞİ: uzun/kalıcı açıklama metinleri yerine
// (örn. Kadro > Taktik/Mücadele) ekranı sadeleştirip isteyen dokunduğunda
// görsün diye kullanılıyor.
export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tooltip-wrap">
      <button
        type="button"
        className="info-tooltip-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Bilgi"
      >
        ⓘ
      </button>
      {open && (
        <>
          <div className="info-tooltip-backdrop" onClick={() => setOpen(false)} />
          <div className="info-tooltip-bubble">{text}</div>
        </>
      )}
    </span>
  );
}
