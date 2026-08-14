import { useState } from 'react';
import FactoryBadge from './FactoryBadge';
import {
  FACTORY_LOGO_SHAPES,
  FACTORY_LOGO_ICONS,
  FACTORY_LOGO_PRESETS,
  DEFAULT_FACTORY_LOGO,
} from './factoryLogoOptions';
import { setFactoryLogo } from '../../services/gameActions';
import './FactoryLogoDesigner.css';

// randomLogo — kullanıcının gönderdiği tasarımcı örneğindeki "Rastgele"
// butonunun karşılığı: rastgele şekil + ikon + renk preseti + rastgele
// (ama makul olasılıklı) tehlike şeridi/perçin toggle'ları.
function randomLogo() {
  const preset = FACTORY_LOGO_PRESETS[Math.floor(Math.random() * FACTORY_LOGO_PRESETS.length)];
  const shape = FACTORY_LOGO_SHAPES[Math.floor(Math.random() * FACTORY_LOGO_SHAPES.length)].id;
  const icon = FACTORY_LOGO_ICONS[Math.floor(Math.random() * FACTORY_LOGO_ICONS.length)].id;
  return {
    shape,
    icon,
    bg: preset.bg,
    metal: preset.metal,
    trim: preset.trim,
    hazard: Math.random() < 0.3,
    rivets: Math.random() < 0.4,
  };
}

// FactoryLogoDesigner — kullanıcının gönderdiği örnek tasarımcının
// sadeleştirilmiş uyarlaması (bkz. Futbol modülündeki aynı desen:
// FutbolLogoEditor). Kopyala/yapıştır yerine, "Logoyu Kaydet" doğrudan
// setFactoryLogo Cloud Function'ını çağırıp factories/{uid}.logo alanını
// günceller.
export default function FactoryLogoDesigner({ factory, onClose }) {
  const initial = { ...DEFAULT_FACTORY_LOGO, ...(factory.logo || {}) };
  const [logo, setLogo] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');

  const update = (patch) => {
    setLogo((prev) => ({ ...prev, ...patch }));
    setMessage('');
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await setFactoryLogo(logo);
      setMessage('Logo kaydedildi ✓');
    } catch (err) {
      setError(err.message || 'Logo kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="factory-modal-backdrop" onClick={onClose}>
      <div className="factory-modal" onClick={(e) => e.stopPropagation()}>
        <div className="factory-modal-header">
          <p className="factory-modal-title">Logo Tasarla</p>
          <button className="factory-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="factory-logo-preview">
          <FactoryBadge logo={logo} name={factory.name || factory.ownerName} size={96} />
        </div>

        <p className="factory-step-label">Şekil</p>
        <div className="factory-logo-chip-row">
          {FACTORY_LOGO_SHAPES.map((s) => (
            <button
              key={s.id}
              className={`factory-logo-chip ${logo.shape === s.id ? 'active' : ''}`}
              onClick={() => update({ shape: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="factory-step-label">İkon</p>
        <div className="factory-logo-icon-grid">
          {FACTORY_LOGO_ICONS.map(({ id, Comp, label }) => (
            <button
              key={id}
              className={`factory-logo-icon-btn ${logo.icon === id ? 'active' : ''}`}
              onClick={() => update({ icon: id })}
              title={label}
            >
              <Comp size={18} />
            </button>
          ))}
        </div>

        <p className="factory-step-label">Renk Presetleri</p>
        <div className="factory-logo-preset-row">
          {FACTORY_LOGO_PRESETS.map((p) => (
            <button
              key={p.name}
              className="factory-logo-preset-swatch"
              style={{ background: `linear-gradient(135deg, ${p.bg} 0%, ${p.metal} 55%, ${p.trim} 100%)` }}
              onClick={() => update({ bg: p.bg, metal: p.metal, trim: p.trim })}
              title={p.name}
            />
          ))}
        </div>

        <div className="factory-logo-color-row">
          <label>
            Zemin
            <input type="color" value={logo.bg} onChange={(e) => update({ bg: e.target.value })} />
          </label>
          <label>
            Metal
            <input type="color" value={logo.metal} onChange={(e) => update({ metal: e.target.value })} />
          </label>
          <label>
            Vurgu
            <input type="color" value={logo.trim} onChange={(e) => update({ trim: e.target.value })} />
          </label>
        </div>

        <div className="factory-logo-toggle-row">
          <label className="factory-logo-toggle">
            <input
              type="checkbox"
              checked={!!logo.hazard}
              onChange={(e) => update({ hazard: e.target.checked })}
            />
            Tehlike Şeridi Kenarlık
          </label>
          <label className="factory-logo-toggle">
            <input
              type="checkbox"
              checked={!!logo.rivets}
              onChange={(e) => update({ rivets: e.target.checked })}
            />
            Perçinli Köşeler
          </label>
        </div>

        <div className="factory-logo-buttons">
          <button className="factory-btn small" onClick={() => update(DEFAULT_FACTORY_LOGO)}>
            Varsayılan
          </button>
          <button className="factory-btn small" onClick={() => setLogo(randomLogo())}>
            Rastgele
          </button>
          <button className="factory-btn primary small" disabled={busy} onClick={handleSave}>
            {busy ? '…' : 'Logoyu Kaydet'}
          </button>
        </div>
        {message && <p className="factory-result small">{message}</p>}
        {error && <p className="factory-error">{error}</p>}
      </div>
    </div>
  );
}
