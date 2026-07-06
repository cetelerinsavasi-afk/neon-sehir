import './ResultModal.css';

// ResultModal — soygun, yasaklı madde satışı gibi önemli olaylardan sonra
// sadece küçük bir alt yazı yerine, ekranın ortasında belirgin, kapanana
// kadar duran bir bildirim gösterir. tone: 'success' | 'fail' | 'neutral'.
export default function ResultModal({ title, message, tone = 'neutral', onClose }) {
  return (
    <div className="result-modal-backdrop" onClick={onClose}>
      <div className={`result-modal ${tone}`} onClick={(e) => e.stopPropagation()}>
        <span className="result-modal-icon">
          {tone === 'success' ? '🎉' : tone === 'fail' ? '🚨' : 'ℹ️'}
        </span>
        <p className="result-modal-title">{title}</p>
        {message && <p className="result-modal-message">{message}</p>}
        <button className="result-modal-close" onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}
