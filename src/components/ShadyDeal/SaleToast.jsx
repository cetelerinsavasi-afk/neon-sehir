import { useEffect } from 'react';
import { shadyResultView } from './shadyDeal';
import './SaleToast.css';

// v104 — yasaklı madde satış sonucu: "Tamam"a basılan pencere yerine geçici
// bildirim (yayındaki bağış bildirimi gibi). Kendiliğinden kaybolur, üstüne
// dokununca hemen kapanır. Art arda satışta en yenisi gösterilir (key ile).
const HIDE_MS = 3200;

export default function SaleToast({ result, onClose }) {
  useEffect(() => {
    if (!result) return undefined;
    const t = setTimeout(onClose, HIDE_MS);
    return () => clearTimeout(t);
  }, [result, onClose]);
  if (!result) return null;
  const v = shadyResultView(result);
  return (
    <button type="button" key={result._k} className={`sale-toast ${v.tone}`} onClick={onClose} aria-live="polite">
      <b>{v.tone === 'fail' ? '🚨' : '✅'} {v.title}</b>
      <span>{v.message}</span>
    </button>
  );
}
