import { useId } from 'react';
import { Factory } from 'lucide-react';
import { FACTORY_LOGO_ICON_MAP, DEFAULT_FACTORY_LOGO } from './factoryLogoOptions';

// shapeElement — 5 rozet şekli (100x100 viewBox içinde), FactoryLogoDesigner
// önizlemesi ve tüm oyun-içi rozet gösterimlerinde AYNI şekilde kullanılır.
function shapeElement(shape) {
  switch (shape) {
    case 'circle':
      return <circle cx="50" cy="50" r="47" />;
    case 'square':
      return <rect x="5" y="5" width="90" height="90" rx="10" />;
    case 'diamond':
      return <polygon points="50,3 97,50 50,97 3,50" />;
    case 'shield':
      return (
        <path d="M50,3 L93,17 L93,47 C93,73 74,92 50,98 C26,92 7,73 7,47 L7,17 Z" />
      );
    case 'hexagon':
    default:
      return <polygon points="90,27 90,73 50,96 10,73 10,27 50,4" />;
  }
}

// FactoryBadge — factories/{id}.logo config'ini SVG rozete çevirir. Hem
// FactoryLogoDesigner'ın canlı önizlemesinde HEM DE oyunun her yerinde
// (kendi fabrikan, patronunun fabrikası, Fabrikalar listesi kartları)
// AYNI bileşen kullanılır ki tasarım ile oyun-içi görünüm birebir tutarlı
// olsun. `logo` alanı olmayan (henüz özel tasarım yapmamış) fabrikalar
// için DEFAULT_FACTORY_LOGO'ya düşülür — asla çökmez/bozuk görünmez.
export default function FactoryBadge({ logo, name, size = 40 }) {
  const clipId = useId();
  const hazardId = useId();
  const {
    shape = DEFAULT_FACTORY_LOGO.shape,
    icon = DEFAULT_FACTORY_LOGO.icon,
    bg = DEFAULT_FACTORY_LOGO.bg,
    metal = DEFAULT_FACTORY_LOGO.metal,
    trim = DEFAULT_FACTORY_LOGO.trim,
    hazard = DEFAULT_FACTORY_LOGO.hazard,
    rivets = DEFAULT_FACTORY_LOGO.rivets,
  } = logo || {};
  const IconComp = FACTORY_LOGO_ICON_MAP[icon] || Factory;

  return (
    <svg
      className="factory-badge-svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={name ? `${name} logosu` : 'Fabrika logosu'}
    >
      <defs>
        <clipPath id={clipId}>{shapeElement(shape)}</clipPath>
        <pattern id={hazardId} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#111213" />
          <rect width="4" height="8" fill="#f4c20d" />
        </pattern>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="100" height="100" fill={bg} />
        <circle cx="50" cy="50" r="34" fill={metal} opacity="0.92" />
        {hazard && (
          <g fill="none" stroke={`url(#${hazardId})`} strokeWidth="14">
            {shapeElement(shape)}
          </g>
        )}
      </g>

      <g clipPath={`url(#${clipId})`} fill="none" stroke={trim} strokeWidth="3">
        {shapeElement(shape)}
      </g>

      <g clipPath={`url(#${clipId})`}>
        <IconComp
          x="27"
          y="27"
          width="46"
          height="46"
          color={trim}
          strokeWidth={2.2}
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}
        />
      </g>

      {rivets && (
        <g fill={metal} stroke={trim} strokeWidth="1.5">
          <circle cx="12" cy="12" r="4" />
          <circle cx="88" cy="12" r="4" />
          <circle cx="12" cy="88" r="4" />
          <circle cx="88" cy="88" r="4" />
        </g>
      )}
    </svg>
  );
}
