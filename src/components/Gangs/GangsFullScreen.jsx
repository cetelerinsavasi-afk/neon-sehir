// Alt çubuktaki "Çeteler" sekmesi: tam ekran Çeteler (telefon uygulaması değil).
import GangsScreen from './GangsScreen';

export default function GangsFullScreen({ onClose }) {
  return (
    <div className="gx-full" role="dialog" aria-label="Çeteler">
      <div className="gx-full-top">
        <span className="gx-full-title">🏴 Çeteler</span>
        <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="gx-full-body">
        <GangsScreen />
      </div>
    </div>
  );
}
