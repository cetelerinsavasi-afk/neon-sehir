import { useState } from 'react';
import { Shield, Star, Zap, Crown, Flame, Anchor, Feather, Sword, PawPrint, Bird, Mountain, Heart } from 'lucide-react';
import FutbolCrest from './FutbolCrest';
import { setFutbolTeamLogo } from '../../services/gameActions';
import './FutbolLogoEditor.css';

// Gönderdiğin takim-logosu-tasarlayici.jsx'in sadeleştirilmiş sürümü:
// aynı şekil/desen/ikon mantığı, aynı renk paleti presetleri.
const SHAPES = [
  { id: 'shield', label: 'Arma' },
  { id: 'circle', label: 'Yuvarlak' },
  { id: 'hexagon', label: 'Altıgen' },
];
const PATTERNS = [
  { id: 'solid', label: 'Düz' },
  { id: 'halves', label: 'Yarım Yarım' },
  { id: 'stripes', label: 'Dikey Çizgili' },
  { id: 'hoops', label: 'Yatay Çizgili' },
  { id: 'diagonal', label: 'Çapraz' },
];
const ICONS = [
  { id: 'shield', Comp: Shield, label: 'Kalkan' },
  { id: 'star', Comp: Star, label: 'Yıldız' },
  { id: 'zap', Comp: Zap, label: 'Şimşek' },
  { id: 'crown', Comp: Crown, label: 'Taç' },
  { id: 'flame', Comp: Flame, label: 'Alev' },
  { id: 'anchor', Comp: Anchor, label: 'Çapa' },
  { id: 'feather', Comp: Feather, label: 'Tüy' },
  { id: 'sword', Comp: Sword, label: 'Kılıç' },
  { id: 'paw', Comp: PawPrint, label: 'Pati' },
  { id: 'bird', Comp: Bird, label: 'Kartal' },
  { id: 'mountain', Comp: Mountain, label: 'Dağ' },
  { id: 'heart', Comp: Heart, label: 'Kalp' },
];
const PRESETS = [
  { name: 'Kırmızı & Beyaz', primary: '#C8102E', secondary: '#FFFFFF' },
  { name: 'Lacivert & Sarı', primary: '#0C2340', secondary: '#FFD100' },
  { name: 'Yeşil & Siyah', primary: '#00843D', secondary: '#101820' },
  { name: 'Bordo & Mavi', primary: '#6E1E33', secondary: '#1B3A6B' },
  { name: 'Mor & Sarı', primary: '#5B2A86', secondary: '#FFD100' },
  { name: 'Turuncu & Lacivert', primary: '#F26522', secondary: '#0C1B33' },
];

function initialsFromName(name) {
  return (name || '').split(' ').map((w) => w[0]).join('').slice(0, 2);
}

export default function FutbolLogoEditor({ team }) {
  const [shape, setShape] = useState(team.logo?.shape || 'shield');
  const [pattern, setPattern] = useState(team.logo?.pattern || 'halves');
  const [icon, setIcon] = useState(team.logo?.icon || null);
  const [primary, setPrimary] = useState(team.logo?.primary || '#0C2340');
  const [secondary, setSecondary] = useState(team.logo?.secondary || '#FFD100');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const randomize = () => {
    const preset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    setPrimary(preset.primary);
    setSecondary(preset.secondary);
    setShape(SHAPES[Math.floor(Math.random() * SHAPES.length)].id);
    setPattern(PATTERNS[Math.floor(Math.random() * PATTERNS.length)].id);
    setIcon(ICONS[Math.floor(Math.random() * ICONS.length)].id);
  };

  const handleSave = async () => {
    setBusy(true);
    setMessage('');
    try {
      await setFutbolTeamLogo(team.id, shape, pattern, icon, primary, secondary);
      setMessage('Kaydedildi ✓');
    } catch (err) {
      setMessage(err?.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="futbol-logo-editor">
      <div className="futbol-logo-preview">
        <FutbolCrest
          logo={{ shape, pattern, icon, primary, secondary }}
          initials={initialsFromName(team.name)}
          size={90}
        />
      </div>

      <p className="futbol-kadro-section-title">Şekil</p>
      <div className="futbol-kadro-chip-row">
        {SHAPES.map((s) => (
          <button
            key={s.id}
            className={`futbol-kadro-chip ${shape === s.id ? 'active' : ''}`}
            onClick={() => setShape(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="futbol-kadro-section-title">Desen</p>
      <div className="futbol-kadro-chip-row">
        {PATTERNS.map((p) => (
          <button
            key={p.id}
            className={`futbol-kadro-chip ${pattern === p.id ? 'active' : ''}`}
            onClick={() => setPattern(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="futbol-kadro-section-title">İkon</p>
      <div className="futbol-logo-icon-grid">
        <button
          className={`futbol-logo-icon-btn ${!icon ? 'active' : ''}`}
          onClick={() => setIcon(null)}
          title="İkon yok (baş harfler)"
        >
          Yok
        </button>
        {ICONS.map(({ id, Comp, label }) => (
          <button
            key={id}
            className={`futbol-logo-icon-btn ${icon === id ? 'active' : ''}`}
            onClick={() => setIcon(id)}
            title={label}
          >
            <Comp size={18} />
          </button>
        ))}
      </div>

      <p className="futbol-kadro-section-title">Renk Presetleri</p>
      <div className="futbol-logo-preset-row">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="futbol-logo-preset-swatch"
            style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }}
            onClick={() => {
              setPrimary(p.primary);
              setSecondary(p.secondary);
            }}
            title={p.name}
          />
        ))}
      </div>

      <div className="futbol-logo-color-row">
        <label>
          Ana renk
          <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
        </label>
        <label>
          İkinci renk
          <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
        </label>
      </div>

      <div className="futbol-logo-buttons">
        <button className="futbol-admin-reset" onClick={randomize}>
          Rastgele
        </button>
        <button className="futbol-admin-submit" disabled={busy} onClick={handleSave}>
          {busy ? '...' : 'Formayı Kaydet'}
        </button>
      </div>
      {message && <p className="futbol-placeholder">{message}</p>}
    </div>
  );
}
