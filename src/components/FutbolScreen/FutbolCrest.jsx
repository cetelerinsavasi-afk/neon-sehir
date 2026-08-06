import { useId } from 'react';
import { Shield, Star, Zap, Crown, Flame, Anchor, Feather, Sword, PawPrint, Bird, Mountain, Heart } from 'lucide-react';

const ICON_MAP = {
  shield: Shield,
  star: Star,
  zap: Zap,
  crown: Crown,
  flame: Flame,
  anchor: Anchor,
  feather: Feather,
  sword: Sword,
  paw: PawPrint,
  bird: Bird,
  mountain: Mountain,
  heart: Heart,
};

// Gönderdiğin takim-logosu-tasarlayici.jsx'teki şekil/desen/ikon
// mantığının sadeleştirilmiş bir sürümü — aynı 3 şekil, 5 desen, 12 ikon
// (lucide-react). İkon yoksa baş harfler gösterilir.
function shapeClipPath(shape) {
  if (shape === 'circle') return <circle cx="50" cy="52" r="48" />;
  if (shape === 'hexagon') {
    return <polygon points="92,29 92,77 50,101 8,77 8,29 50,5" />;
  }
  return <path d="M50,3 L93,17 L93,50 C93,77 73,97 50,104 C27,97 7,77 7,50 L7,17 Z" />;
}

function patternRects(pattern, primary, secondary) {
  switch (pattern) {
    case 'halves':
      return (
        <>
          <rect x="0" y="0" width="50" height="110" fill={primary} />
          <rect x="50" y="0" width="50" height="110" fill={secondary} />
        </>
      );
    case 'stripes': {
      const w = 100 / 5;
      return Array.from({ length: 5 }).map((_, i) => (
        <rect key={i} x={i * w} y="0" width={w} height="110" fill={i % 2 === 0 ? primary : secondary} />
      ));
    }
    case 'hoops': {
      const h = 110 / 6;
      return Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x="0" y={i * h} width="100" height={h} fill={i % 2 === 0 ? primary : secondary} />
      ));
    }
    case 'diagonal':
      return (
        <>
          <rect x="0" y="0" width="100" height="110" fill={primary} />
          <polygon points="0,110 100,0 100,40 40,110" fill={secondary} />
        </>
      );
    default:
      return <rect x="0" y="0" width="100" height="110" fill={primary} />;
  }
}

export default function FutbolCrest({ logo, initials, size = 40 }) {
  const clipId = useId();
  const {
    shape = 'shield',
    pattern = 'halves',
    icon = null,
    primary = '#0C2340',
    secondary = '#FFD100',
  } = logo || {};
  const IconComp = icon ? ICON_MAP[icon] : null;

  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>{shapeClipPath(shape)}</clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{patternRects(pattern, primary, secondary)}</g>
      <g fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2">
        {shapeClipPath(shape)}
      </g>
      {IconComp ? (
        <IconComp
          x="30"
          y="32"
          width="40"
          height="40"
          color="#fff"
          strokeWidth={2.2}
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}
        />
      ) : (
        initials && (
          <text
            x="50"
            y="62"
            textAnchor="middle"
            fontSize="28"
            fontWeight="800"
            fill="#fff"
            style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.45)', strokeWidth: 2 }}
          >
            {initials.slice(0, 2).toUpperCase()}
          </text>
        )
      )}
    </svg>
  );
}
