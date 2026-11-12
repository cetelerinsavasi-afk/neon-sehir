// Alt çubuktaki "Çeteler" sekmesi: tam ekran Çeteler (telefon uygulaması değil).
import GangsScreen from './GangsScreen';
import { InitialHqContext } from './cityHqNav';

export default function GangsFullScreen({ onClose, initialHq = null }) {
  return (
    <div className="gx-full" role="dialog" aria-label="Çeteler">
      <div className="gx-full-top">
        <button className="gx-full-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
        <span className="gx-full-title">🏴 Çeteler</span>
      </div>
      <div className="gx-full-body">
        <InitialHqContext.Provider value={initialHq}>
          <GangsScreen />
        </InitialHqContext.Provider>
      </div>
    </div>
  );
}
